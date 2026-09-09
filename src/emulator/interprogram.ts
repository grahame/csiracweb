/**
 * Running an Interprogram source through CSIRAC, without the ritual.
 *
 * Interprogram is a compiler, and working it at the console is a procedure:
 * the day of the month goes on NB, and the reader is moved between the program
 * tape and the source three times, each move separated by a press of RETURN
 * because the compiler stops to ask for it. That is worth doing once to see
 * what using the machine was like, and a nuisance every time after.
 *
 * This does the same thing with nobody at the console. It is the same emulator
 * and the same 1960 compiler tape: the source is threaded into the 5-hole
 * reader as a data tape and the machine is carried through the steps in order,
 * following the compiler's own prompts rather than a fixed script.
 */

import { renderPrinterText } from "./format";
import { Machine } from "./machine";
import { runBatch, runToStop } from "./run";
import { Tape } from "./tape";
import { TapeError } from "./tape";

/**
 * How many commands the whole session may take.
 *
 * A working run is a quarter of a million or so, whatever the program: nearly
 * all of it is the compiler reading itself in and making its two passes. The
 * allowance is a long way above that so a slow program is not cut off, but low
 * enough that a source the compiler cannot make sense of comes back quickly
 * rather than spinning. Nonsense does spin: the compiler does not always stop
 * at a statement it cannot parse.
 */
export const COMMAND_BUDGET = 4_000_000;

/**
 * How Interprogram says it has finished: not by stopping, but by hooting
 * continuously, as CSIRAC programs did. So a run that is still going but has
 * been hooting with nothing more to punch has finished, and waiting for it to
 * halt would mean waiting for the command limit every time.
 */
const QUIET_HOOTS = 20_000;

/**
 * The same, for a run somebody is watching.
 *
 * Nothing is lost by waiting when the whole session lands in under a second,
 * so the allowance above is deliberately generous. Watching it happen, those
 * same hoots are forty seconds of real hooting at the machine's own speed,
 * with the answer already punched and on the screen. Four seconds is long
 * enough to hear what it is and short enough to sit through.
 */
export const WATCHED_QUIET_HOOTS = 2_000;

export interface InterprogramResult {
    /** What the compiler punched: its listing, and anything the program output. */
    punch: string;
    /** What it printed on the teleprinter, prompts and all. */
    teleprinter: string;
    /**
     * The teleprinter with the prompts taken out, so what is left is the
     * compiler saying something went wrong. See RITUAL.
     */
    messages: string[];
    /** Commands obeyed, over the whole session. */
    commands: number;
    /** Why the run ended. */
    outcome: "finished" | "stopped" | "limit" | "error";
    /** Set when the machine could not go on. */
    error: string | null;
}

export interface InterprogramOptions {
    /** The compiler asks for the day of the month, and heads its listing with it. */
    day?: number;
    /** The 12-hole tape carrying the compiler itself. */
    compilerTape: string;
}

/**
 * What the compiler prints at the console while it is being worked.
 *
 * These are its instructions to the operator, and they are quoted in three
 * places: the step list below, the walkthrough for working it by hand in
 * TapePicker, and RITUAL, which is how `messagesIn` tells an instruction to
 * the operator from a complaint about the source. Quoting them from here
 * rather than typing them out again is what keeps the three in step with each
 * other, and with what the machine actually prints.
 */
export const PROMPTS = {
    drumAndPunch: "DRUM AND FIVE HOLE PUNCH MUST BE SWITCHED ON",
    positionTape: "POSITION INTERPROGRAM TAPE IN FIVE HOLE READER",
    dayOfMonth: "SET DAY OF MONTH IN PL UNITS ON NB",
    twelveHole: "SWITCH TO TWELVE HOLE READER",
    fiveHoleForData: "SWITCH TO FIVE HOLE READER FOR DATA TAPE",
    fiveHole: "SWITCH TO FIVE HOLE READER",
    restart: "RESTART",
} as const;

/** The compiler tape, as it is labelled in the tape library. */
export const COMPILER_TAPE_NAME = "InterProgram.cvt";

/** What the source is called once it is a tape in the five hole reader. */
export const SOURCE_TAPE_NAME = "source";

/**
 * The example sources that came with the compiler tape.
 *
 * These are tapes rather than typed sources: each is a whole session, the
 * program and then the data it reads, punched as it was in 1960 and carrying
 * the blank tape and erase codes that go with that — which is why they are
 * left alone by `asDataTape`. The titles are the tapes' own `(1) TITLE` lines,
 * quoted here so that a list of them can be shown before any of them has been
 * fetched; `interprogram.test.ts` checks that they still say what the tapes
 * say.
 */
export const INTERPROGRAM_EXAMPLES = [
    { name: "Ex1.dat", title: "ALPHA = BETA - 27.394 + A(3).(X/Y)" },
    { name: "Ex2.dat", title: "INTEREST CALC" },
    { name: "Ex2a.dat", title: "OUTPUT OF NUMBERS" },
    { name: "Ex3.dat", title: "LOG(X+IY)=U+IV WHERE  U=LOG(SQRT(X*X+Y*Y)) & V=ARCTAN Y/X" },
    { name: "Ex4.dat", title: "EXAMPLE OF OUTPUT, LAYOUT AND FUNCTION FORMATION" },
] as const;

/**
 * How an example is named where it is offered: the tape's number, and what it
 * is. The file name alone says nothing about which of the five it is, and the
 * title alone loses the label written on the tape.
 */
export function exampleLabel({ name, title }: { name: string; title: string }): string {
    return `${name} — ${title}`;
}

/**
 * One step of the console procedure: what is worked at the console, and then a
 * press of RETURN to set the machine going again.
 *
 * The procedure is written down here rather than as a run of statements so
 * that the two ways of getting through it are the same procedure. Nobody at
 * the console runs it as fast as the browser will go and reports what came
 * out; watching it happen runs the same steps at the machine's own speed and
 * says which one it is on. Neither can drift away from the other, because
 * there is only the one list.
 */
export interface InterprogramStep {
    /** What happens at this step, in a sentence. */
    does: string;
    /** A value for NB, which is where the day of the month goes. */
    nb?: number;
    /** The tape the reader is moved to: the source, or the compiler tape. */
    readData?: boolean;
    /**
     * The last step, after which the machine is left running rather than run to
     * its next stop: the compiled program does not stop, it hoots.
     */
    runsOut?: boolean;
}

/**
 * The whole procedure, as the Interprogram Manual has an operator work it.
 *
 * Working it by hand at the console is the same procedure with one more press
 * of RETURN in it, because the console's B entry takes one of its own; that
 * list is the walkthrough carried by the tape itself, in TapePicker.
 *
 * Six presses of RETURN and a seventh that sets the compiled program going,
 * with the day of the month set once and the reader moved three times. The
 * day is put on NB at the first stop, one stop before the compiler would ask
 * for it, which is why "SET DAY OF MONTH IN PL UNITS ON NB" is never printed
 * here although it is what an operator sees: the compiler only asks when NB
 * is still zero when it looks.
 *
 * The compiler's own prompts are not carried against the steps. Two of them
 * arrive together at the first stop and are answered one after the other, so
 * a prompt never lined up with a step anyway, and what the machine printed is
 * on the teleprinter a few inches away. They are quoted once, in PROMPTS.
 */
export function interprogramSteps(day = 1): readonly InterprogramStep[] {
    return [
        {
            does: "The compiler tape is loaded into the twelve hole reader, and CSIRAC reads it in.",
        },
        {
            does: `Punches are turned on, and the day of the month, ${dayOfMonth(day)}, is input into NB in p1 units.`,
            nb: dayOfMonth(day),
        },
        {
            does: "Interprogram source is read from 5-hole reader.",
            readData: true,
        },
        { does: "The machine is resumed, and stops again almost at once." },
        {
            does: "Input swapped over to the compiler tape, then machine resumed.",
            readData: false,
        },
        { does: "Machine resumed again." },
        {
            does: "The program runs.",
            readData: true,
            runsOut: true,
        },
    ];
}

/** The day as the console can hold it: a whole number of days, 0 to 31. */
function dayOfMonth(day: number): number {
    return Math.max(0, Math.min(31, Math.trunc(day)));
}

/**
 * Work the console switches a step calls for.
 *
 * Both of these are the machine's own controls, worked here exactly as the
 * console works them: `Machine.readFrom` moves the reader, so the selector
 * follows the tape without this having to know one tape from another.
 */
export function workTheConsole(machine: Machine, step: InterprogramStep): void {
    if (step.nb !== undefined) machine.nb = step.nb;
    if (step.readData !== undefined) machine.readFrom(step.readData);
}

/**
 * Watch for the hoot that means the program has finished.
 *
 * Returns how many words have gone to the loudspeaker since anything was last
 * punched. A program that is still working is still punching, so a count that
 * climbs and does not reset is a program hooting with nothing more to say.
 * Counting from the machine rather than from `onHoot` leaves that callback to
 * whoever is making the sound.
 */
/**
 * Whether the session is over, and how, given how long the program has been
 * hooting with nothing more to punch.
 *
 * A program that is still working is still punching, so a hoot that goes on
 * and on is a program with nothing left to say — that is how a CSIRAC program
 * announced it had finished. One that does neither has run away with itself,
 * and the command budget is what brings it back. Both ways of running a
 * session ask this, so that neither can decide a source finished and the other
 * that it did not; they differ only in how long a hoot they will sit through.
 */
export function sessionOutcome(
    hootsSincePunch: number,
    commands: number,
    quietHoots: number,
): "finished" | "limit" | null {
    if (hootsSincePunch > quietHoots) return "finished";
    if (commands >= COMMAND_BUDGET) return "limit";
    return null;
}

export function watchTheHoot(machine: Machine): () => number {
    let punched = machine.punchOutput.length;
    let hootsWhenPunched = machine.hootCount;

    return () => {
        if (machine.punchOutput.length !== punched) {
            punched = machine.punchOutput.length;
            hootsWhenPunched = machine.hootCount;
        }
        return machine.hootCount - hootsWhenPunched;
    };
}

/**
 * Compile and run one Interprogram source, as fast as the browser will go.
 *
 * `sourceTape` is the text of a 5-hole tape, ready to thread: the program,
 * then any data it reads, exactly as the `Ex` tapes carry both one after the
 * other. Turning something typed at a keyboard into one of those is
 * `asDataTape`'s job, not this one's — an `Ex` tape off the shelf is already
 * in this form and must not be put through it.
 */
export function runInterprogram(
    sourceTape: string,
    { day = 1, compilerTape }: InterprogramOptions,
): InterprogramResult {
    const machine = new Machine();
    const result = (outcome: InterprogramResult["outcome"], error: string | null = null) => {
        const teleprinter = renderPrinterText(machine.teleprinterOutput);
        return {
            punch: renderPrinterText(machine.punchOutput),
            teleprinter,
            messages: messagesIn(teleprinter),
            commands: machine.instructionCount,
            outcome,
            error,
        };
    };

    try {
        machine.programTape = new Tape(COMPILER_TAPE_NAME, compilerTape);
        machine.dataTape = new Tape(SOURCE_TAPE_NAME, sourceTape);
        machine.initialize();
        machine.readPrimary();
        machine.s = 0;
        machine.beginExecution();

        for (const step of interprogramSteps(day)) {
            workTheConsole(machine, step);
            if (step.runsOut) return runToTheEnd(machine, result);

            // Every step draws on one budget for the whole session, so a source that
            // sends the compiler round in circles cannot spend it over and over.
            const batch = runToStop(machine, COMMAND_BUDGET - machine.instructionCount);
            if (batch.error) return result("error", batch.error);
        }

        // Unreachable: the last step runs out and returns above.
        return result("limit");
    } catch (err) {
        if (err instanceof TapeError) return result("error", err.message);
        return result("error", err instanceof Error ? err.message : String(err));
    }
}

/**
 * Run the compiled program out, stopping when it has nothing more to say.
 *
 * Watching the punch is what tells us it is done: a program that has finished
 * hoots, and one that is still working is still punching. A program that does
 * neither has run away with itself, and the command limit catches it.
 */
function runToTheEnd(
    machine: Machine,
    result: (outcome: InterprogramResult["outcome"], error?: string | null) => InterprogramResult,
): InterprogramResult {
    const hootsSincePunch = watchTheHoot(machine);

    // Small batches, because the end of the session is only looked for between
    // them: a batch of a hundred thousand carried the machine that far past the
    // point where it had finished, and reported a session three times the size
    // of the one that was actually run.
    for (;;) {
        const batch = runBatch(machine, 2_000);
        if (batch.error) return result("error", batch.error);
        // Stopped of its own accord: the program used the stop gate.
        if (batch.reason) return result("stopped");

        const over = sessionOutcome(hootsSincePunch(), machine.instructionCount, QUIET_HOOTS);
        if (over) return result(over);
    }
}

/**
 * A typed source as the 5-hole tape the reader expects.
 *
 * Three things are done to it, none of which an operator would have thought
 * about, because they are properties of tape rather than of the language.
 *
 * None of them is done to a source that is already a tape. An `Ex` tape put
 * into the editor arrives with its blank tape and its erase codes already
 * punched, and the three would spoil every one of them: see `alreadyPunched`.
 *
 * It is put into upper case. A Flexowriter had no lower case, and in a tape
 * file the lower case letters are the reader's own codes rather than
 * characters — `b` is blank tape, `l` and `f` the shifts — so a `b` typed in a
 * name would otherwise punch a blank row.
 *
 * **Blank tape is put in after the title**, which is the one that bites. Every
 * one of the `Ex` tapes has `bbbbb` at the head of the line after `(1) TITLE`,
 * and it is not decoration: the compiler copies the title to the punch and
 * blank tape is what stops it. Established by running the same source both
 * ways — with the blank tape it compiles and punches, and with five spaces in
 * its place the run dies part way through the first pass with the reader off
 * the end of the tape and nothing punched at all.
 *
 * Then blank tape is added at the end, which is the one thing done to every
 * source either way: see `withTrailer`.
 */
export function asDataTape(source: string): string {
    const typed = source.replace(/\r\n|\r/g, "\n").split("\n");
    if (alreadyPunched(typed)) return withTrailer(typed);

    const lines = typed.map((line) => line.toUpperCase());

    // The title is copied to the punch until blank tape ends it. Putting the
    // blank at the head of the following line is where the Ex tapes carry it.
    const title = lines.findIndex((line) => /\(\s*1\s*\)/.test(line) && /TITLE/.test(line));
    const after = title === -1 ? 1 : title + 1;

    return withTrailer([...lines.slice(0, after), BLANK_TAPE + (lines[after] ?? ""), ...lines.slice(after + 1)]);
}

/**
 * Whether the source in hand is a tape rather than something typed.
 *
 * The blank tape after the title is the mark of one, because it is the thing
 * nobody types and every working tape carries. A source that has it has been
 * punched already — it came off the shelf, or it was loaded into the editor
 * from a tape that did — and everything below this line would damage it: the
 * upper case would turn its `b`, `e` and `l` codes into the letters B, E and
 * L, and a second run of blank tape after the title is not what any of the
 * `Ex` tapes carry.
 */
function alreadyPunched(lines: readonly string[]): boolean {
    return lines.some((line) => line.startsWith(BLANK_TAPE));
}

/**
 * Blank tape at the end. A real tape had a trailer, and the reader throws when
 * it runs off the end rather than reading blank, so without one a program that
 * reads a little too far takes the whole run down with it.
 */
function withTrailer(lines: readonly string[]): string {
    return [...lines, ...Array<string>(64).fill(BLANK_TAPE.repeat(12))].join("\r\n");
}

/** Five rows of blank tape, written the way a tape file spells them. */
const BLANK_TAPE = "bbbbb";

/**
 * What the compiler says while it is being worked, as against what it says
 * when something is wrong.
 *
 * At the console these are instructions to the operator, and answering them is
 * the procedure this page exists to skip. Nobody is being asked here, so they
 * are noise; anything else on the teleprinter is the compiler reporting on the
 * source, which is the whole of what the page is for.
 */
const RITUAL = Object.values(PROMPTS);

export function messagesIn(teleprinter: string): string[] {
    return teleprinter
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "" && !RITUAL.some((prompt) => line.includes(prompt)));
}
