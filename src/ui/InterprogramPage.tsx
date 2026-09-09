/**
 * Writing Interprogram
 *
 * Interprogram is Australia's first high level language and the reason most
 * people come to CSIRAC at all, but reaching it at the console means the whole
 * procedure: the day of the month on NB, and the reader moved between the
 * compiler tape and the source three times, each move separated by a press of
 * RETURN. That is worth doing once. Doing it every time you change a line is
 * why nobody would.
 *
 * So this is the same emulator and the same 1960 compiler tape with nobody at
 * the console: type a program, press Run, and the machine is set up, carried
 * through the procedure and left to run. What comes back is what the punch
 * produced, because that is where Interprogram puts its results.
 *
 * There are two ways to watch that happen, and the page offers both. By
 * default the machine is on the screen while it works — the same registers,
 * store, readers and tubes the console shows, with the procedure narrated
 * beside them as each switch is worked and RETURN pressed. The other way skips
 * the session and reports what the punch produced, which is what you want on
 * the tenth run of an afternoon.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { asDataTape, runInterprogram, type InterprogramResult } from "../emulator/interprogram";
import { InterprogramWatch, useInterprogramRun, type WatchedRun } from "./InterprogramWatch";
import { CompilerMessages, PrinterOutput, PromptStatus } from "./MachineDisplay";

/**
 * What the box starts with: a whole program, short enough to read at a glance
 * and complete enough to change a line of and run again.
 *
 * The four numbered lines are the preamble every source needs — a title, what
 * the integer names are, and the line that says the program follows. `*1` and
 * `*2` are statement labels.
 */
const STARTER = `     (1)  TITLE  A FIRST PROGRAM
     (2)  SYMBOLS FOR INTEGERS   NONE
     (4)  COMPILE THE FOLLOWING INTERPROGRAM
 *1    TAKE 3.5, MULTIPLY BY 2.0, OUTPUT
 *2    END OF INTERPROGRAM
`;

export function InterprogramPage() {
    const [source, setSource] = useState(STARTER);
    const [compilerTape, setCompilerTape] = useState("");
    const [loadError, setLoadError] = useState("");
    /** Watch the machine work, or skip to what the punch produced. */
    const [watching, setWatching] = useState(true);
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<InterprogramResult | null>(null);

    // The compiler heads its listing with the day of the month, so the run is
    // dated the day it is made, as a listing off the machine would have been.
    const day = useMemo(() => new Date().getDate(), []);
    const watched = useInterprogramRun({ source, compilerTape, day });

    // The compiler is a tape like any other, fetched once and kept.
    useEffect(() => {
        let live = true;
        void (async () => {
            try {
                const response = await fetch(`${import.meta.env.BASE_URL}tapes/InterProgram.cvt`);
                if (!response.ok) throw new Error(`the compiler tape could not be read (${response.status})`);
                const text = await response.text();
                if (live) setCompilerTape(text);
            } catch (err) {
                if (live) setLoadError(err instanceof Error ? err.message : String(err));
            }
        })();
        return () => {
            live = false;
        };
    }, []);

    const run = useCallback(() => {
        if (!compilerTape) return;
        if (watching) {
            watched.start();
            return;
        }
        setRunning(true);
        // A whole session is a hundred thousand commands and lands in well under a
        // second, but the browser should get a chance to draw "working" before it
        // is asked to sit through even that.
        setTimeout(() => {
            setResult(runInterprogram(asDataTape(source), { day, compilerTape }));
            setRunning(false);
        }, 0);
    }, [source, compilerTape, day, watching, watched]);

    /**
     * The one thing on the page you press, and what it does. The three states it
     * has are worked out together so that the word on the button and the thing
     * it does cannot be edited apart.
     */
    const press =
        watching && watched.running
            ? { label: "Pause", act: watched.pause }
            : watching && watched.paused
              ? { label: "Carry on", act: watched.resume }
              : { label: !watching && running ? "Running...." : "Run", act: run };

    /** How far the machine has got, from whichever of the two runs is on. */
    const commands = watching
        ? watched.started
            ? watched.controller.view.instructionCount
            : null
        : (result?.commands ?? null);

    const showWatching = useCallback(
        (wanted: boolean) => {
            // One machine, one thing at a time: changing your mind about how to
            // watch a run ends the run.
            watched.reset();
            setResult(null);
            setWatching(wanted);
        },
        [watched],
    );

    return (
        <div className="screen interprogram-screen">
            <h1>Interprogram</h1>
            <p className="subtitle">
                Australia&rsquo;s first high level language, G. W. Hill, Computation Laboratory, University of
                Melbourne, 1960
            </p>

            <p className="viewer-note">
                Type a program and press the 'Run' button. CSIRAC will then be brought up, the compiler tape will be
                read, and the full procedure to load your Interprogram will be automatically followed. You might want to
                consult the{" "}
                <a
                    href="https://cis.unimelb.edu.au/__data/assets/pdf_file/0005/5407961/CSIRAC-Interprogram-Manual.pdf"
                    target="_blank"
                >
                    Interprogram manual.
                </a>
                This is a historic programming language that very much exists in the context of the machine it was
                written for, and you're program runs on that machine with all its quirks and limitations.
            </p>

            <textarea
                className="interprogram-source"
                value={source}
                spellCheck={false}
                rows={16}
                aria-label="Interprogram source"
                onChange={(event) => setSource(event.target.value)}
            />

            <p className="viewer-note">
                Punched as typed, in capitals, on 5-hole tape. Anything after <code>#</code> is a comment. Results are{" "}
                <strong>punched</strong>, which is where Interprogram puts them.
            </p>

            <div className="prompt-line">
                <span className="mode-control">
                    <span className="mode-label">Show</span>
                    <button
                        type="button"
                        className={watching ? "prompt-action active" : "prompt-action"}
                        aria-pressed={watching}
                        title="the registers, store, readers and tubes, as the machine works"
                        onClick={() => showWatching(true)}
                    >
                        CSIRAC working
                    </button>
                    <button
                        type="button"
                        className={watching ? "prompt-action" : "prompt-action active"}
                        aria-pressed={!watching}
                        title="skip the session and report what the punch produced"
                        onClick={() => showWatching(false)}
                    >
                        Skip to the result
                    </button>
                </span>

                {watching ? <WatchedOutcome run={watched} /> : result ? <Outcome result={result} /> : null}

                {/*
                    The right hand end of the line: how far the machine has got, and the
                    thing you press. They are kept together so that a long sentence about
                    how the run ended carries both of them onto the next line rather than
                    leaving the count stranded on its own.
                */}
                <span className="prompt-right">
                    {commands === null ? null : (
                        <span className="prompt-count">{commands.toLocaleString()} commands</span>
                    )}
                    <button
                        type="button"
                        className="prompt-action run"
                        onClick={press.act}
                        disabled={(running && !watching) || !compilerTape}
                    >
                        {press.label}
                    </button>
                </span>
            </div>

            {loadError ? <p className="error">{loadError}</p> : null}

            {watching ? (
                watched.started ? (
                    <InterprogramWatch run={watched} />
                ) : null
            ) : result ? (
                <>
                    <CompilerMessages messages={result.messages} />
                    <PrinterOutput head="Punch (OP)" text={result.punch || "(nothing punched)"} />
                </>
            ) : null}
        </div>
    );
}

/** A sentence on how the run ended, rather than a word out of the emulator. */
function Outcome({ result }: { result: InterprogramResult }) {
    return (
        <PromptStatus running={false} fault={result.outcome !== "finished"}>
            {howItEnded(result.outcome, result.error)}
        </PromptStatus>
    );
}

/**
 * The same, for a run being watched: until it has ended there is nothing to
 * say about how it ended, so the machine's own status line stands in, as it
 * does at the console.
 */
function WatchedOutcome({ run }: { run: WatchedRun }) {
    const { controller, outcome, running } = run;

    return (
        <PromptStatus running={running} fault={outcome !== null && outcome !== "finished"}>
            {outcome === null ? controller.status : howItEnded(outcome, controller.status)}
        </PromptStatus>
    );
}

function howItEnded(outcome: InterprogramResult["outcome"], error: string | null): string {
    switch (outcome) {
        case "finished":
            return "Finished: the program hooted!";
        case "stopped":
            return "Stopped by the program.";
        case "limit":
            return "Given up on: the machine was still going after four million commands.";
        default:
            return `Stopped: ${error}`;
    }
}
