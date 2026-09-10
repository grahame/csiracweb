/**
 * Watching the machine be worked through Interprogram's procedure.
 *
 * The other way to run a source is to hand it to `runInterprogram`, which goes
 * as fast as the browser will carry it and comes back with what the punch
 * produced. Nothing of the machine is seen doing it, which is a strange thing
 * to offer on an emulator: the session is the interesting part, and it is the
 * one an operator sat through.
 *
 * So this runs the same procedure at the console instead. It is the same kind
 * of machine the console screen runs — `useMachine`, batched over animation
 * frames — and the same displays, and the steps come from the same list in
 * interprogram.ts that the fast path uses. What is different is that nobody is
 * at the console: each stop is answered by working the switches the step calls
 * for and pressing RETURN, and the narration says which one that is as it
 * happens.
 *
 * The machine is this page's own, and a scratch one: switched on cold for each
 * session, with an empty drum, and leaving nothing behind. Working a source out
 * must not depend on what the console was last doing, and must not disturb it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
    COMPILER_TAPE_NAME,
    SOURCE_TAPE_NAME,
    WATCHED_QUIET_HOOTS,
    asDataTape,
    interprogramSteps,
    messagesIn,
    sessionOutcome,
    watchTheHoot,
    type InterprogramResult,
    type InterprogramStep,
} from "../emulator/interprogram";
import { CompilerMessages, MachineDisplay } from "./MachineDisplay";
import type { MachineController } from "./MachineContext";
import { useMachine } from "./useMachine";

/**
 * How long the machine is left stopped at each step before the switches are
 * worked and RETURN pressed.
 *
 * An operator read the teleprinter, decided what it wanted and reached for a
 * switch, and two of these steps are over in a fifth of a second: the machine
 * stops and stops again almost at once. Answering them the instant they happen
 * would carry the narration past faster than it can be read, and faster than
 * anybody ever worked this machine.
 *
 * A couple of seconds is long enough to read the step that is coming before it
 * happens, which is the point of watching at all. The step blinks while it is
 * being waited on, so what is about to be done is on the screen rather than
 * only its having been done.
 */
const OPERATOR_PAUSE_MS = 2_000;

export interface WatchedRun {
    /** The machine, its displays and its switches. */
    controller: MachineController;
    steps: readonly InterprogramStep[];
    /** The step being carried out, of `steps`. Only meaningful once started. */
    at: number;
    /**
     * The step the machine is waiting to start, of `steps`, or null when it is
     * not waiting on one. This is what blinks in the narration.
     */
    coming: number | null;
    /** How the run ended, or null while it is still going. */
    outcome: InterprogramResult["outcome"] | null;
    /** True while the machine is obeying commands. */
    running: boolean;
    /** True once a run has been started, whether or not it is still going. */
    started: boolean;
    /** True when the machine has been stopped part way through the procedure. */
    paused: boolean;
    start: () => void;
    pause: () => void;
    resume: () => void;
    reset: () => void;
}

/**
 * The four things the run can be doing, which is not the same as whether the
 * machine is going: it is stopped between every step of the procedure.
 */
type Phase = "idle" | "reading in" | "stepping" | "paused" | "done";

interface RunOptions {
    /** The source as typed, which is punched onto tape as it is threaded. */
    source: string;
    /** The 12-hole tape carrying the compiler itself. */
    compilerTape: string;
    /** The day of the month, which the compiler heads its listing with. */
    day: number;
}

/**
 * Drive one session, a step at a time.
 *
 * Every step ends where a press of RETURN would leave it: the machine running
 * until it stops of its own accord. Watching for that stop is what carries the
 * procedure along, so there is no schedule here and no waiting on a clock —
 * the machine says when it is ready for the next thing, exactly as it did for
 * an operator reading the teleprinter.
 */
export function useInterprogramRun({ source, compilerTape, day }: RunOptions): WatchedRun {
    // This page's own machine, not the console's. It is set up from cold for
    // every session and keeps no drum, so a source compiles here to what it
    // compiles to anywhere — see MachineOptions.keepsDrum.
    const controller = useMachine({ keepsDrum: false });
    const { running, statusIsError, view } = controller;

    const steps = useMemo(() => interprogramSteps(day), [day]);
    const [at, setAt] = useState(0);
    /** The step being counted down to, while the pause below runs. */
    const [coming, setComing] = useState<number | null>(null);
    const [phase, setPhase] = useState<Phase>("idle");
    const [outcome, setOutcome] = useState<InterprogramResult["outcome"] | null>(null);

    /**
     * The controller, for the effects that carry the run along.
     *
     * A fresh one comes back from `useMachine` on every render, so an effect
     * that depended on it would run on every render as well. What the effects
     * are really waiting for is the machine stopping, and that is `running`.
     */
    const latest = useRef(controller);
    latest.current = controller;

    /** The tape as it will be threaded, which is not quite what was typed. */
    const sourceTape = useRef("");
    /** How long the program has been hooting with nothing more to punch. */
    const hootsSincePunch = useRef<(() => number) | null>(null);

    const start = useCallback(() => {
        const tape = asDataTape(source);
        sourceTape.current = tape;
        hootsSincePunch.current = null;
        setOutcome(null);
        setAt(0);
        setComing(0);
        setPhase("reading in");
        // Switching on, with the compiler tape in the twelve hole reader and the
        // source in the five hole reader. Threading them is all this does; the
        // reader is set going by the effect below, once React has the tapes.
        controller.mountTapes({ name: COMPILER_TAPE_NAME, text: compilerTape }, { name: SOURCE_TAPE_NAME, text: tape });
    }, [controller, source, compilerTape]);

    const pause = useCallback(() => {
        setPhase("paused");
        latest.current.stop();
    }, []);

    const resume = useCallback(() => {
        setPhase("stepping");
        latest.current.start();
    }, []);

    const reset = useCallback(() => {
        latest.current.stop();
        setPhase("idle");
        setAt(0);
        setComing(null);
        setOutcome(null);
    }, []);

    // Reading the compiler in. Its tape has to be in React's hands before the
    // reader can be set going, because that is where the console keeps it.
    //
    // The first step is waited on like the rest of them: pressing Run and having
    // the machine away before the first line of the procedure can be read is
    // exactly what the pause exists to prevent.
    useEffect(() => {
        if (phase !== "reading in") return;
        const c = latest.current;
        if (c.programText !== compilerTape || c.dataText !== sourceTape.current) return;

        const hand = setTimeout(() => {
            setComing(null);
            setPhase("stepping");
            c.acceptSettings();
        }, OPERATOR_PAUSE_MS);
        return () => clearTimeout(hand);
    }, [phase, compilerTape]);

    // Every stop is a step of the procedure finishing. Answer it: work whatever
    // switches the next step calls for, then press RETURN.
    useEffect(() => {
        if (phase !== "stepping" || running) return;
        const c = latest.current;

        if (statusIsError) {
            setComing(null);
            setOutcome("error");
            setPhase("done");
            return;
        }

        const step = steps[at];
        if (step?.runsOut) {
            // The last step does not end at a stop. Arriving here means the program
            // used the stop gate rather than hooting, which is a program that has
            // finished in the other way CSIRAC programs did.
            setComing(null);
            setOutcome("stopped");
            setPhase("done");
            return;
        }

        const next = at + 1;
        if (next >= steps.length) {
            setPhase("done");
            return;
        }

        // The step that is coming is on the screen for the length of the pause,
        // blinking, before anything is done about it.
        setComing(next);
        const hand = setTimeout(() => {
            pressTheKeys(c, steps[next]);
            if (steps[next].runsOut) hootsSincePunch.current = watchTheHoot(c.machine);
            setComing(null);
            setAt(next);
            c.start();
        }, OPERATOR_PAUSE_MS);
        return () => clearTimeout(hand);
    }, [phase, running, statusIsError, at, steps]);

    // The compiled program says it has finished by hooting rather than by
    // stopping, so the last step is watched rather than waited on. The count is
    // taken from the machine after each batch, which is as often as anything
    // else on the screen is brought up to date.
    useEffect(() => {
        const hoots = hootsSincePunch.current;
        if (phase !== "stepping" || !running || !hoots) return;

        // The same question the fast path asks, and the same answer, differing
        // only in how long a hoot is sat through: see sessionOutcome.
        const over = sessionOutcome(hoots(), view.instructionCount, WATCHED_QUIET_HOOTS);
        if (!over) return;

        latest.current.stop();
        setComing(null);
        setOutcome(over);
        setPhase("done");
    }, [phase, running, view.instructionCount]);

    return {
        controller,
        steps,
        at,
        coming,
        outcome,
        running,
        started: phase !== "idle",
        paused: phase === "paused",
        start,
        pause,
        resume,
        reset,
    };
}

/**
 * Press the keys a step calls for.
 *
 * These are the operations menu's own entries — B for the day of the month, U
 * for the tape in the reader — worked through the same controller the menu
 * works, so the console's rules apply rather than a private set: the reader
 * selector follows the tape rather than being set beside it. The fast path
 * does the same to a bare machine, in `workTheConsole`.
 */
function pressTheKeys(controller: MachineController, step: InterprogramStep) {
    if (step.nb !== undefined) controller.setSwitch("nb", step.nb);
    if (step.readData !== undefined) controller.readFrom(step.readData);
}

/**
 * The session as it happens: the machine's own displays, with the procedure
 * beside the store where the operations menu sits at the console.
 */
export function InterprogramWatch({ run }: { run: WatchedRun }) {
    const { controller } = run;

    return (
        <div className="watched-run">
            <MachineDisplay controller={controller} aside={<Narration run={run} />} />
            <CompilerMessages messages={messagesIn(controller.view.teleprinter)} />
        </div>
    );
}

/** What is being pressed, and why, as it is pressed. */
function Narration({ run }: { run: WatchedRun }) {
    const { steps, at, coming, running } = run;

    return (
        <div className="narration">
            <div className="column-head">Interprogram Ops Procedure (automated)</div>
            <ol className="narration-steps">
                {steps.map((step, index) => (
                    <li
                        key={index}
                        className={stepClass(index, at, coming)}
                        aria-current={index === at ? "step" : undefined}
                    >
                        {step.does}
                    </li>
                ))}
            </ol>
            <p className="narration-now">
                {coming === null
                    ? `Step ${at + 1} of ${steps.length}: ${running ? "the machine is running." : "the machine has stopped."}`
                    : `Step ${coming + 1} of ${steps.length}: about to be worked.`}
            </p>
        </div>
    );
}

/**
 * How a step is shown: what is about to be done, what is being done, and what
 * has been. A step that is coming takes precedence over the one it follows,
 * because it is the one worth reading.
 */
function stepClass(index: number, at: number, coming: number | null): string {
    if (index === coming) return "narration-step starting";
    if (index === at) return "narration-step current";
    return index < at ? "narration-step done" : "narration-step";
}
