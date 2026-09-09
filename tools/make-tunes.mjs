/**
 * Punching tune tapes for CSIRAC.
 *
 * CSIRAC had no sound hardware. The loudspeaker was wired to destination P,
 * and the pitch you heard was simply how often a program sent a word there.
 * So a tune is written as a straight run of commands: send a word to the
 * speaker, mark time for a few commands, send another. The note is the
 * spacing.
 *
 * Rows at the head of a tape are read into store by the machine itself, one
 * row to one word, and run from 0 0, so nothing else is needed around them:
 * no primary to write and no control statements. That does cap a tape at the
 * 768 words the sequence register reaches before it turns over, which at a
 * thousand commands a second is about three quarters of a second of music.
 * These are motifs, not performances.
 *
 *   node tools/make-tunes.mjs
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TAPES = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "tapes");

/** How long one command took, and so what a given spacing sounds like. */
const COMMAND_SECONDS = 0.001;
/** The sequence register turns over at 24 0, so a tape cannot run past it. */
const MAX_COMMANDS = 768;

/** Mark time for one command. Z Z moves zero to nowhere. */
const REST = "20 20";
/** PL T sends a one to the stop gate, which halts the machine. */
const STOP = "25 31";

/**
 * How loud a note is.
 *
 * The speaker was driven by the digits of the word sent to it, so a word with
 * more digits set drives it harder. That is what "variations in the digit
 * trains" means, and it is the only volume control CSIRAC had.
 *
 * `PL P` sends a one, a single digit out of twenty, which is as quiet as it
 * gets. Building a word of n ones in the accumulator first and sending that
 * with `A P` is n times louder.
 */
function loudness(digits) {
    if (digits <= 1) return { prelude: [], pulse: "25 10" }; // PL P, a single digit

    // A = 1, then double and add one for each further digit wanted, which walks
    // A through 1, 3, 7, 15 and so on: a word of n ones.
    const prelude = ["25  4"]; // PL A
    for (let n = 1; n < digits; n++) {
        prelude.push(" 7  4"); // TA A, twice the accumulator back into it
        prelude.push("25  5"); // PL PA, add a one
    }
    return { prelude, pulse: " 4 10" }; // A P, the accumulator to the loudspeaker
}

/**
 * The spacing, in commands, that comes nearest a wanted pitch. Only whole
 * numbers are available, so the higher the note the coarser the tuning: this
 * is why CSIRAC's music sounds the way it does, and the error is reported so
 * it can be seen rather than glossed over.
 */
function spacingFor(hertz) {
    const exact = 1 / (hertz * COMMAND_SECONDS);
    const spacing = Math.max(2, Math.round(exact));
    const actual = 1 / (spacing * COMMAND_SECONDS);
    return { spacing, actual, cents: 1200 * Math.log2(actual / hertz) };
}

/** Equal temperament, so the wanted pitch can be named in the usual way. */
const SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function pitchOf(name) {
    const [, letter, accidental, octave] = /^([A-G])([#b]?)(\d)$/.exec(name);
    const semitone =
        SEMITONES[letter] + (accidental === "#" ? 1 : accidental === "b" ? -1 : 0) + 12 * (Number(octave) - 4);
    return 440 * 2 ** ((semitone - 9) / 12);
}

/**
 * Turn notes into rows. A note is [name, milliseconds], and a rest is
 * [null, milliseconds].
 *
 * A note can also be given as a bare number of commands, `[{ every: n }, ms]`,
 * for the things the manuals specify as a loop rather than as a pitch. The
 * hoot stop is one: section 4 gives it as the two command loop `31 31 K P` /
 * `31 30 K PS`, and calling that "B4" would be putting a name on it that
 * CSIRAC's own paperwork never did.
 */
function punch(notes, digits) {
    const { prelude, pulse } = loudness(digits);
    const rows = [...prelude];
    const tuning = [];

    for (const [name, ms] of notes) {
        const commands = Math.round(ms / (COMMAND_SECONDS * 1000));
        if (name === null) {
            for (let n = 0; n < commands; n++) rows.push(REST);
            continue;
        }
        const { spacing, actual, cents } =
            typeof name === "object"
                ? { spacing: name.every, actual: 1 / (name.every * COMMAND_SECONDS), cents: 0 }
                : spacingFor(pitchOf(name));
        const label = typeof name === "object" ? `every ${name.every}` : name;
        tuning.push({ name: label, spacing, actual, cents, named: typeof name !== "object" });
        for (let n = 0; n + spacing <= commands; n += spacing) {
            rows.push(pulse);
            for (let pad = 1; pad < spacing; pad++) rows.push(REST);
        }
    }

    rows.push(STOP);
    return { rows, tuning };
}

function tape(title, notes, extraComments = [], digits = 1) {
    const { rows, tuning } = punch(notes, digits);
    if (rows.length > MAX_COMMANDS) {
        throw new Error(`${title}: ${rows.length} rows, past the ${MAX_COMMANDS} the machine reaches`);
    }

    const seen = new Map();
    for (const note of tuning) if (!seen.has(note.name)) seen.set(note.name, note);

    const heading = [
        `       * ${title}`,
        "       * A tune is the spacing between words sent to the loudspeaker:",
        "       * 25 10 is PL P, a one to destination P; 20 20 is Z Z, a command",
        "       * of marking time. The machine runs at the speed CSIRAC ran at,",
        "       * so this is the pitch and the pace the loudspeaker really had.",
        ...extraComments.map((line) => `       * ${line}`),
        digits > 1
            ? `       * Played at ${digits} digits of twenty, so ${digits} times as loud as a`
            : "       * Played at one digit of twenty, the quietest the speaker goes.",
        ...(digits > 1 ? ["       * single digit would be: the digit train is the volume."] : []),
        tuning.every((note) => !note.named)
            ? "       * The spacing used, and the pitch it comes to:"
            : "       * Notes used, and how near the tape gets to them:",
        ...[...seen.values()].map((note) =>
            note.named
                ? `       *   ${note.name.padEnd(3)} every ${String(note.spacing).padStart(2)} commands` +
                  ` = ${note.actual.toFixed(1).padStart(6)} Hz (${note.cents >= 0 ? "+" : ""}${note.cents.toFixed(0)} cents)`
                : `       *   a loop of ${note.spacing} commands = ${note.actual.toFixed(1)} Hz`,
        ),
        " 0  0  ",
    ];

    return { text: [...heading, ...rows, "       ", ""].join("\r\n"), rows: rows.length, tuning };
}

/**
 * Only pitches from about 125 Hz up to 500 Hz are usable: below that a note
 * eats the whole tape, and above it the spacing is so short that the tuning
 * falls apart. That is CSIRAC's range, not a choice made here.
 */
const TUNES = {
    "Scale.cvt": {
        title: "A scale, to hear what CSIRAC could and could not play",
        notes: [
            ["C3", 90],
            ["D3", 90],
            ["E3", 90],
            ["F3", 90],
            ["G3", 90],
            ["A3", 90],
            ["B3", 90],
            ["C4", 130],
        ],
        comments: [
            "The spacing has to be a whole number of commands, and there are",
            "fewer to choose from the higher you go, so these eight notes come",
            "out as only five pitches: E and F share a spacing of 6, G and A",
            "share 5, and B and C share 4. That is not a fault in the tape. It",
            "is the whole of why CSIRAC music sounds the way it does.",
        ],
    },
    "Chime.cvt": {
        title: "A four note chime",
        notes: [
            ["E3", 150],
            [null, 20],
            ["C3", 150],
            [null, 20],
            ["D3", 150],
            [null, 20],
            ["G3", 220],
        ],
        comments: ["The four notes of a doorbell, which the tuning is kind to."],
        // Twice the digits of the others, and so twice as loud.
        digits: 2,
    },
    "Hoot.cvt": {
        title: "The hoot, as the programming manual gives it",
        // The manual's hoot stop is a loop of two commands, not a note: at a
        // thousand commands a second that is 500 Hz. Written as a pitch it would
        // land on B4, which is a name CSIRAC's paperwork never used for it.
        notes: [[{ every: 2 }, 700]],
        comments: [
            "The manual gives the hoot stop as the two command loop",
            "31 31 K P / 31 30 K PS, a tone at one cycle per two commands.",
            "This is that loop written straight out: a word to the speaker,",
            "one command of marking time, and round again, so 500 Hz.",
        ],
    },
};

for (const [name, spec] of Object.entries(TUNES)) {
    const built = tape(spec.title, spec.notes, spec.comments, spec.digits);
    writeFileSync(join(TAPES, name), built.text);
    console.log(
        `${name.padEnd(14)} ${String(built.rows).padStart(3)} rows,`,
        `${(built.rows * COMMAND_SECONDS).toFixed(2)}s`,
    );
    for (const note of built.tuning.filter((n, i, a) => a.findIndex((m) => m.name === n.name) === i)) {
        if (note.named) {
            console.log(
                `   ${note.name.padEnd(3)} every ${String(note.spacing).padStart(2)} =`,
                `${note.actual.toFixed(1).padStart(6)} Hz (${note.cents >= 0 ? "+" : ""}${note.cents.toFixed(0)} cents)`,
            );
        } else {
            console.log(`   a loop of ${note.spacing} commands =`, `${note.actual.toFixed(1)} Hz`);
        }
    }
}
