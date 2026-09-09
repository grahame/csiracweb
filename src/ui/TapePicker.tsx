/**
 * Mounting tapes in the readers.
 *
 * The DOS emulator asked for a program filename and a data filename before it
 * would start. The tapes distributed with it are bundled here, and a file from
 * the local machine can be used instead.
 */

import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router";

import { INTERPROGRAM_EXAMPLES, PROMPTS, exampleLabel } from "../emulator/interprogram";
import type { Walkthrough } from "./useMachine";

export interface TapeFile {
    name: string;
    text: string;
}

/**
 * Programs written for CSIRAC itself, each identified by the machine's own
 * paperwork.
 *
 * Every one of these carries either its CSIRAC program number — T732, T712,
 * T725, T021.1, T746 — or the year it was written. That is what separates them
 * from TEST_TAPES below, which are exercises with no such provenance. The notes
 * say how to work them, because most need a switch set before they will do
 * anything.
 */
export const CSIRAC_TAPES = [
    {
        name: "A2Test.cvt",
        title: "Arcsine validation (1960)",
        data: [],
        notes:
            "Prints an angle, takes its sine and cosine, recovers the angle again and prints " +
            "that, so the two columns can be compared. Output goes to the punch. Some hoots " +
            "will be heard: the program is occasionally executing its own data.",
    },
    {
        name: "ITest.cvt",
        title: "5-hole input routine test (T021.1)",
        data: ["ITest.dat"],
        notes:
            "Tests the input routine from the 1960 programming manual. After reading the " +
            "program in, press U for the data tape, press H to set the halt selector to " +
            "4 5, then RETURN repeatedly to see each converted value in the accumulator.",
    },
    {
        name: "InterProgram.cvt",
        title: "Interprogram (June 1960)",
        data: INTERPROGRAM_EXAMPLES.map((example) => example.name),
        notes:
            "Australia's first high level language, and a compiler, so it takes longer than " +
            "the rest and has the reader switched three times. It says what it wants on the " +
            "teleprinter as it goes: do that, then RETURN. Results are punched. About a " +
            "minute and a half at CSIRAC speed, which is the longest run here.",
        /**
         * Working it by hand, which is not quite the same list as the one the
         * Interprogram page follows for you: see `interprogramSteps`. The console
         * has no way to put a value on NB without opening an entry first, and that
         * entry takes a press of RETURN of its own, so the day of the month costs
         * two presses here and none there.
         */
        walkthrough: {
            intro:
                "Interprogram directs you as it goes. Read the teleprinter, do what it says, " +
                "press RETURN. The results are punched, so they appear under Punch (OP), and a " +
                "continuous hoot means it has finished, and goes on until you stop it.",
            steps: [
                [PROMPTS.drumAndPunch, "RETURN"],
                // Two presses, and the reason for it: the first RETURN is taken by the
                // entry that B opens, to set the day on NB. Only the second reaches
                // the machine. Following this with one press strands the session here.
                [PROMPTS.dayOfMonth, "B, enter the day, RETURN to set it, then RETURN again"],
                ["", "U for the data tape, then RETURN"],
                ["", "RETURN"],
                [PROMPTS.twelveHole, "U for the program tape, then RETURN"],
                [PROMPTS.fiveHoleForData, "RETURN"],
                [PROMPTS.fiveHole, "U for the data tape, then RETURN"],
            ],
        } satisfies Walkthrough,
    },
    {
        name: "Multiplication.cvt",
        title: "Multiplication (T732)",
        data: [],
        notes:
            "Prints N x M on the teleprinter. Set N on NA and M on NB from the Options menu, " +
            "as 0 0 0 7 and 0 0 0 6, and it prints 42. The A key sets a single scale-32 digit, " +
            "so it will not do for this.",
    },
    {
        name: "T712A.cvt",
        title: "Teleprinter test (T712)",
        data: [],
        notes:
            "Prints the complete teleprinter character set, in both the figure and the letter " +
            "shift, including the Greek letters CSIRAC had. Needs no data tape.",
    },
    {
        name: "TangentTable.cvt",
        title: "Table of tangents (T725)",
        data: [],
        notes:
            "Prints a headed table of tan x for angles from 4.5 to 40.5 degrees, worked out " +
            "from a ninth order polynomial. When the table is finished the program hoots " +
            "continuously, which is how a CSIRAC program said it had done; press any key to " +
            "stop it.",
    },
    {
        name: "player.cvt",
        title: "Music player (T746)",
        data: [],
        notes:
            "The program that played tunes on the loudspeaker, dated 1998 when the CSIRAC " +
            "music was reconstructed. It reads its tune from a data tape whose format has not " +
            "been worked out – if you have an example file, please email frgrahame@bowland.au",
    },
] as const;

/**
 * Programs for exercising one part of the machine at a time.
 *
 * These came with John Spencer's DOS emulator and were written to show that
 * something works — the teleprinter, the punch, the loudspeaker, the 12-hole
 * reader — rather than to compute anything wanted for its own sake. None of
 * them carries a CSIRAC program number or a date, which is why they are apart
 * from the programs above; they did run on CSIRAC, unlike EMULATOR_TAPES.
 */
export const TEST_TAPES = [
    {
        name: "TestPrint.cvt",
        title: "Hello world, on the teleprinter",
        data: [],
        notes:
            "The shortest thing here worth running. Prints HELLO WORLD, then the alphabet and " +
            "the figures, on the teleprinter. Read it in, then press RETURN.",
    },
    {
        name: "TestPunch.cvt",
        title: "Hello world, on the punch",
        data: [],
        notes:
            "The same program sent to the punch instead of the teleprinter, so its output " +
            "appears under Punch (OP). CSIRAC punched tape for results wanted back later.",
    },
    {
        name: "TestSound.cvt",
        title: "The loudspeaker",
        data: [],
        notes:
            "Sends a train of pulses to destination P, the loudspeaker on the console. " +
            "CSIRAC was the first computer to play music, by sending tunes to this gate.",
    },
    {
        name: "Sqrt.cvt",
        title: "Square roots",
        data: ["Sqrt.dat"],
        notes:
            "Reads fractions from 12-hole tape, takes their square roots and prints both " +
            "columns on the teleprinter. After reading the program in, press U to switch " +
            "the reader to the data tape, then RETURN.",
    },
] as const;

/**
 * Tapes punched for this emulator, which never ran on CSIRAC.
 *
 * They exist to show the loudspeaker working and to be read as examples of how
 * a tape is put together. `tools/make-tunes.mjs` generates them.
 */
export const EMULATOR_TAPES = [
    {
        name: "Hoot.cvt",
        title: "The hoot",
        data: [],
        notes:
            "The programming manual's hoot stop, used to attract the operator's attention: " +
            "the two command loop 31 31 K P / 31 30 K PS, written straight out. At a " +
            "thousand commands a second that is 500 Hz: nothing sets the pitch but the " +
            "spacing.",
    },
    {
        name: "Scale.cvt",
        title: "A scale",
        data: [],
        notes:
            "Eight notes, to hear what CSIRAC could and could not play. The spacing between " +
            "words sent to the speaker is a whole number of commands, and there are fewer to " +
            "choose from the higher the note, so the eight come out as only five pitches: E " +
            "and F are the same note, so are G and A, and so are B and C.",
    },
    {
        name: "Chime.cvt",
        title: "A four note chime",
        data: [],
        notes:
            "A short tune, punched as a straight run of commands. Read the tape to see how it " +
            "is made: 25 10 sends a one to the loudspeaker and 20 20 marks time.",
    },
] as const;

/**
 * A tape to start from, for punching your own.
 *
 * These two rows are a whole CSIRAC program. Rows at the head of a tape are
 * read straight into store, one row to one word, and run from 0 0, so a short
 * program needs nothing else around it: `mm` is the source, `nn` the
 * destination, and the blank row at the end stops the reader.
 */
export const NEW_TAPE = [
    "       * A new tape. mm is the source, nn the destination.",
    "       * Anything past column 7 is a comment.",
    "25  2  PL OT: a one in p1, printed on the teleprinter",
    "25 31  PL  T: a one to the stop gate, which halts the machine",
    "       ",
    "",
].join("\r\n");

interface TapePickerProps {
    onMount: (program: TapeFile, data: TapeFile | null, howToRun?: string, walkthrough?: Walkthrough | null) => void;
}

export function TapePicker({ onMount }: TapePickerProps) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    /** Which data tape is selected, for the programs that offer a choice. */
    const [chosenData, setChosenData] = useState<Record<string, string>>({});

    const mountBundled = useCallback(
        async (
            programName: string,
            dataName: string | undefined,
            howToRun: string,
            walkthrough: Walkthrough | null,
        ) => {
            setBusy(true);
            setError("");
            try {
                const program = await fetchTape(programName);
                const data = dataName ? await fetchTape(dataName) : null;
                onMount(program, data, howToRun, walkthrough);
            } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
            } finally {
                setBusy(false);
            }
        },
        [onMount],
    );

    const mountLocal = useCallback(async (files: FileList | null, kind: "program" | "data") => {
        if (!files || files.length === 0) return;
        const file = files[0];
        const tape: TapeFile = { name: file.name, text: await file.text() };
        if (kind === "program") setLocalProgram(tape);
        else setLocalData(tape);
    }, []);

    const [localProgram, setLocalProgram] = useState<TapeFile | null>(null);
    const [localData, setLocalData] = useState<TapeFile | null>(null);
    const navigate = useNavigate();

    return (
        <div className="tape-picker">
            <h2>Experience Australia's first digital computer</h2>

            <p className="subtitle">
                CSIRAC – the Council for Scientific and Industrial Research Automatic Computer – first ran a program in
                1949. It is the only first-generation digital computer to have been preserved{" "}
                <a href="https://cis.unimelb.edu.au/about/history/csirac" target="_blank">
                    intact in a museum.
                </a>{" "}
                This page lets you load up and run programs on an emulated version of CSIRAC, and{" "}
                <Link to="/interprogram">program in Australia's first domestically produced programming language</Link>,
                G. W. Hill's Interprogram.
            </p>
            <p>
                Various{" "}
                <a href="https://cis.unimelb.edu.au/about/history/csirac/emulator" target="_blank">
                    emulators for CSIRAC have been developed
                </a>
                . John W. Spencer developed an emulator in Turbo Pascal 6, and in 2011 – some fifteen years ago! – was
                kind enough to share the source code with <a href="https://grahame.dev/">Grahame Bowland</a>, the author
                of this page. John's 'CSIRACEM' program required a DOS machine or emulator to run, which has become
                increasingly difficult. This page takes John Spencer's work and makes it available on the web in a much
                more accessible form, without needing anything more than a web browser. It also draws upon some CSIRAC
                tape images which were included with Bill Purvis' 2021 Java port of the emulator, but does not otherwise
                rely on that work.
            </p>

            <p></p>

            <h2>Code in Australia's first programming language</h2>
            <p className="viewer-note">
                Write a program in Australia&rsquo;s first high level computer programming language, and then run it on
                CSIRAC.
            </p>
            <p className="tape-launch">
                <button type="button" onClick={() => void navigate("/interprogram")}>
                    Code in Interprogram
                </button>
            </p>

            <h2>Run some of CSIRAC's original programs</h2>
            <p className="viewer-note">
                Programs transcribed from original tapes, each carrying a tape number or year they were written.
            </p>
            <TapeList
                tapes={CSIRAC_TAPES}
                busy={busy}
                chosenData={chosenData}
                onChoose={setChosenData}
                onMount={mountBundled}
            />

            <h2>Test programs</h2>
            <p className="viewer-note">
                Bundled with John Spencer&rsquo;s CSIRACEM as test programs for that emulator.
            </p>
            <TapeList
                tapes={TEST_TAPES}
                busy={busy}
                chosenData={chosenData}
                onChoose={setChosenData}
                onMount={mountBundled}
            />

            <h2>Or write your own program</h2>
            <p className="viewer-note">
                Starts you off with a two instruction program: print a character, then halt. Read it in, view and edit
                the tape, and then run it on the machine.
            </p>
            <div className="tape-upload">
                <button
                    type="button"
                    onClick={() =>
                        onMount(
                            { name: "NewTape.cvt", text: NEW_TAPE },
                            null,
                            "Press T to see the tape and punch it. Rows at the head of a tape go straight into " +
                                "store, one row to one word, and run from 0 0.",
                        )
                    }
                >
                    Write your own program from scratch
                </button>
            </div>

            <h2>Or use a tape of your own</h2>
            <div className="tape-upload">
                <label>
                    Program tape
                    <input type="file" onChange={(event) => void mountLocal(event.target.files, "program")} />
                </label>
                <label>
                    Data tape (optional)
                    <input type="file" onChange={(event) => void mountLocal(event.target.files, "data")} />
                </label>
                <button
                    type="button"
                    className="primary"
                    disabled={!localProgram}
                    onClick={() => localProgram && onMount(localProgram, localData)}
                >
                    Mount {localProgram ? localProgram.name : "..."}
                </button>
            </div>

            <h2>Emulator test programs</h2>
            <p className="viewer-note">
                Punched for this emulator, and never run on CSIRAC. They are here to show the loudspeaker working, and
                to be read as short examples of how a tape is put together. <code>tools/make-tunes.mjs</code> generates
                them.
            </p>
            <TapeList
                tapes={EMULATOR_TAPES}
                busy={busy}
                chosenData={chosenData}
                onChoose={setChosenData}
                onMount={mountBundled}
            />

            {error ? <p className="error">{error}</p> : null}
        </div>
    );
}

interface TapeEntry {
    readonly name: string;
    readonly title: string;
    readonly data: readonly string[];
    readonly notes: string;
    /** Only for a tape that has to be worked through, and only shown at the console. */
    readonly walkthrough?: Walkthrough;
}

function TapeList({
    tapes,
    busy,
    chosenData,
    onChoose,
    onMount,
}: {
    tapes: readonly TapeEntry[];
    busy: boolean;
    chosenData: Record<string, string>;
    onChoose: (update: (chosen: Record<string, string>) => Record<string, string>) => void;
    onMount: (name: string, data: string | undefined, notes: string, walkthrough: Walkthrough | null) => void;
}) {
    return (
        <ul className="tape-list">
            {tapes.map((tape) => {
                const selected = chosenData[tape.name] ?? tape.data[0];
                return (
                    <li key={tape.name}>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => onMount(tape.name, selected, tape.notes, tape.walkthrough ?? null)}
                        >
                            {tape.name}
                        </button>
                        <div className="tape-detail">
                            <strong>{tape.title}</strong>
                            {tape.data.length === 1 ? (
                                <span className="tape-data"> data tape: {dataTapeLabel(tape.data[0])}</span>
                            ) : null}
                            {tape.data.length > 1 ? (
                                <label className="tape-data">
                                    {" "}
                                    data tape:
                                    <select
                                        value={selected}
                                        onChange={(event) =>
                                            onChoose((chosen) => ({ ...chosen, [tape.name]: event.target.value }))
                                        }
                                    >
                                        {tape.data.map((name) => (
                                            <option key={name} value={name}>
                                                {dataTapeLabel(name)}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            ) : null}
                            <p>{tape.notes}</p>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

/**
 * How a data tape is offered: the file name, and what is on it.
 *
 * Interprogram's five come with a title punched at the head of the tape, and a
 * list of `Ex1.dat` to `Ex4.dat` says nothing about which is which. The other
 * data tapes have no title to give, so they are offered by name alone.
 */
function dataTapeLabel(name: string): string {
    const example = INTERPROGRAM_EXAMPLES.find((candidate) => candidate.name === name);
    return example ? exampleLabel(example) : name;
}

async function fetchTape(name: string): Promise<TapeFile> {
    const response = await fetch(`${import.meta.env.BASE_URL}tapes/${name}`);
    if (!response.ok) throw new Error(`${name} could not be read (${response.status})`);
    return { name, text: await response.text() };
}
