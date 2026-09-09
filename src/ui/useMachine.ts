/**
 * Holding a machine, and running it without blocking the browser.
 *
 * The DOS emulator ran flat out and looked at the keyboard every five hundred
 * instructions. Here execution is broken into batches driven by animation
 * frames, and a snapshot of the console state is handed to React after each
 * batch.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { renderPrinterText } from "../emulator/format";
import { Machine } from "../emulator/machine";
import { runBatch } from "../emulator/run";
import { Tape } from "../emulator/tape";
import { Speaker } from "./speaker";
import { STORE_WORDS } from "../emulator/word";

/**
 * How fast the machine runs, in instructions per animation frame.
 *
 * CSIRAC obeyed about a thousand commands a second, and that is the only speed
 * there is: seventeen to a frame comes to about that. The control desk had no
 * speed switch, and the displays and the loudspeaker were both meant to be
 * watched and heard at this rate, so nothing here offers to change it.
 */
export const COMMANDS_PER_FRAME = 17;

/** Everything the console displays, copied out of the machine after each batch. */
export interface MachineView {
    a: number;
    b: number;
    c: number;
    h: number;
    i: number;
    na: number;
    nb: number;
    k: number;
    s: number;
    maLast: number;
    outputRegister: number;
    d: number[];
    /** The sixteen words of store starting at the display address. */
    memory: number[];
    /** The last sixteen instructions obeyed, most recent first. */
    recent: number[];
    mnemonic: string;
    instructionCount: number;
    teleprinter: string;
    punch: string;
    /** Console switch positions. */
    reader5Hole: boolean;
    punch5Hole: boolean;
    readData: boolean;
    /**
     * Which tape the I gate will really read, which is not always what readData
     * says: see Machine.readingDataTape.
     */
    readingData: boolean;
    naToK: boolean;
    naAndSToK: boolean;
    oneShot: boolean;
    triggerStop: boolean;
    triggerAddress: number;
    iSwitches: number;
    primaryStored: boolean;
    /**
     * Where each reader has got to, and what the machine is working on.
     *
     * The head runs a row ahead of the program. Section 4.2 of the programming
     * manual: "When the code in the input register has been transmitted, the
     * tape is automatically advanced one row and the code is loaded into the
     * input register in place of that transmitted."
     */
    programAt: number;
    dataAt: number;
}

const DRUM_STORAGE_KEY = "csiracweb.drum";

/**
 * A console switch that needs a value typed at it. Held here rather than in
 * the operations menu so that the menu's letter keys can open it, as they did on
 * the real console.
 */
export type EditTarget = "na" | "nb" | "i" | "trigger" | null;

/**
 * How to work a tape that needs more than a press of RETURN.
 *
 * Interprogram is the one that does: it is a compiler and it directs the
 * operator as it goes, printing what it wants next on the teleprinter. Its
 * steps belong at the console, where they are being followed, rather than on
 * the tape picker where they would swamp the list.
 */
export interface Walkthrough {
    intro: string;
    /** What the teleprinter says, and what to do about it. */
    steps: readonly (readonly [says: string, does: string])[];
}

export interface MachineOptions {
    /**
     * Whether this machine's drum is the one that is kept.
     *
     * There was one CSIRAC and one drum, and it held its contents with the power
     * off; local storage stands in for the MAHOLD file the DOS emulator kept it
     * in. The console's machine is that machine, and by default a machine is it.
     *
     * The Interprogram page runs a second machine, set up from cold for each
     * session, and that one keeps nothing: it neither starts from the stored
     * drum nor writes over it. Two machines writing one drum would leave the
     * stored contents belonging to whichever stopped last, and a session there
     * would start from whatever the console had been doing rather than from the
     * empty drum every other way of compiling a source starts from.
     */
    keepsDrum?: boolean;
}

export function useMachine({ keepsDrum = true }: MachineOptions = {}) {
    const machineRef = useRef<Machine>(null);
    if (machineRef.current === null) {
        machineRef.current = new Machine();
        if (keepsDrum) loadDrum(machineRef.current);
    }
    const machine = machineRef.current;

    const [running, setRunning] = useState(false);
    /** The main store display address, "M (m,n) onwards". */
    const [memoryStart, setMemoryStart] = useState(0);
    /** Show the D registers, or the last sixteen commands obeyed. */
    const [displayD, setDisplayD] = useState(true);
    /** Show binary as ones and zeroes, or as blocks, "more like CSIRAC". */
    const [binaryDigits, setBinaryDigits] = useState(true);
    const [status, setStatus] = useState("");
    /** True when the status line is reporting a fault rather than a normal stop. */
    const [statusIsError, setStatusIsError] = useState(false);
    /** Which switch is waiting for a value, if any. */
    const [editing, setEditing] = useState<EditTarget>(null);

    /**
     * Put a message on the status line. Faults are marked so the console can
     * show them as faults: an operator must not have to read the wording to tell
     * a broken run from a finished one.
     */
    const report = useCallback((message: string, isError = false) => {
        setStatus(message);
        setStatusIsError(isError);
    }, []);
    /** True before the program has been read into store. */
    const [loading, setLoading] = useState(true);
    /**
     * Whether the program has been set going since it was read in. A second
     * press of RETURN resumes from where the machine stopped rather than
     * starting afresh, and the status line says which of the two is happening.
     */
    const [started, setStarted] = useState(false);
    const [programName, setProgramName] = useState("");
    const [dataName, setDataName] = useState("");
    /** How to work this particular program, kept in view while it is running. */
    const [notes, setNotes] = useState("");
    /** The steps for a tape that has to be worked through, shown at the console. */
    const [walkthrough, setWalkthrough] = useState<Walkthrough | null>(null);
    /** The tapes as text, so they can be listed and, later, edited. */
    const [programText, setProgramText] = useState("");
    const [dataText, setDataText] = useState("");

    const [view, setView] = useState<MachineView>(() => snapshot(machine, 0));

    const refresh = useCallback(() => {
        setView(snapshot(machine, memoryStart));
    }, [machine, memoryStart]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    // The loudspeaker. Words sent to destination P are collected with the
    // instruction count at which they were sent, and turned into sound after
    // each batch; see speaker.ts for why that is the only way to get the pitch
    // right.
    const speakerRef = useRef<Speaker>(null);
    speakerRef.current ??= new Speaker();
    const speaker = speakerRef.current;

    useEffect(() => {
        machine.onHoot = (word, at) => speaker.push(word, at);
        return () => {
            machine.onHoot = null;
        };
    }, [machine, speaker]);

    // The execution loop.
    useEffect(() => {
        if (!running) return;
        let frame = 0;
        const tick = () => {
            const result = runBatch(machine, COMMANDS_PER_FRAME);
            speaker.flush(machine.instructionCount);
            setView(snapshot(machine, memoryStart));

            if (result.reason === null) {
                // Still going: come back next frame.
                frame = requestAnimationFrame(tick);
                return;
            }

            setRunning(false);
            if (keepsDrum) saveDrum(machine);

            if (result.error) {
                report(result.error, true);
            } else if (loading) {
                // Reading the tape in ends with the DO command at the head of the
                // program, which stops the machine. Say so, rather than reporting it
                // as the program having stopped: the program has not run yet.
                setLoading(false);
                report("Program read into store.");
            } else if (result.reason === "trigger-stop") {
                report("Stopped: halt selector reached");
            } else if (result.reason === "one-shot") {
                report("One shot: stopped after one instruction");
            } else {
                report("Stopped by the program");
            }
            setView(snapshot(machine, memoryStart));
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [running, machine, memoryStart, loading, report, speaker, keepsDrum]);

    /** Mount tapes and set the machine up as it was at switch on. */
    const mountTapes = useCallback(
        (
            program: { name: string; text: string },
            data: { name: string; text: string } | null,
            howToRun = "",
            steps: Walkthrough | null = null,
        ) => {
            machine.programTape = new Tape(program.name, program.text);
            machine.dataTape = data ? new Tape(data.name, data.text) : null;
            machine.teleprinterOutput = "";
            machine.punchOutput = "";
            machine.primaryStored = false;
            machine.initialize();
            setProgramName(program.name);
            setDataName(data?.name ?? "");
            setProgramText(program.text);
            setDataText(data?.text ?? "");
            setNotes(howToRun);
            setWalkthrough(steps);
            // The reader takes its setting from the tape now in it.
            machine.readFrom(false);
            speaker.reset();
            setLoading(true);
            report("");
            setView(snapshot(machine, memoryStart));
        },
        [machine, memoryStart, report, speaker],
    );

    /**
     * Leave the settings screen and read the program in, as pressing RETURN did.
     * A 5-hole program tape has no primary to read: the machine reads it under
     * the control of whatever is already in store.
     *
     * The tapes are threaded afresh each time. An operator can go back to the
     * switch panel after a run, and a tape that has already been through the
     * reader cannot be read again without being rewound first.
     */
    const acceptSettings = useCallback(() => {
        // Setting the machine up again would put every switch back to its initial
        // position, so keep whatever the operator has since set.
        const switches = {
            reader5Hole: machine.reader5Hole,
            punch5Hole: machine.punch5Hole,
            readData: machine.readData,
            naToK: machine.naToK,
            naAndSToK: machine.naAndSToK,
            oneShot: machine.oneShot,
            triggerStop: machine.triggerStop,
            triggerAddress: machine.triggerAddress,
            na: machine.na,
            nb: machine.nb,
            iSwitches: machine.iSwitches,
        };

        try {
            machine.programTape = new Tape(programName, programText);
            machine.dataTape = dataText ? new Tape(dataName, dataText) : null;
            machine.teleprinterOutput = "";
            machine.punchOutput = "";
            machine.primaryStored = false;
            machine.primaryIsWholeTape = false;
            setStarted(false);
            machine.initialize();
            Object.assign(machine, switches);
            speaker.reset();

            let hasSecondStage = true;
            if (!machine.reader5Hole) hasSecondStage = machine.readPrimary();
            machine.s = 0;
            machine.beginExecution();

            if (!hasSecondStage) {
                // A tape punched in the primary form is already in store, one row to
                // one word, and there is no primary waiting to read the rest of it in.
                // Setting the machine going here would run the program before the
                // operator had asked for it, and again when they did, so reading in
                // ends where it should: at 0 0, with the machine stopped.
                setLoading(false);
                report("Program read into store.");
                setView(snapshot(machine, memoryStart));
                return;
            }

            setLoading(true);
            report("Reading program....");
            setRunning(true);
        } catch (err) {
            report(err instanceof Error ? err.message : String(err), true);
            setView(snapshot(machine, memoryStart));
        }
    }, [machine, memoryStart, report, speaker, programName, programText, dataName, dataText]);

    const start = useCallback(() => {
        report(loading ? "Reading program...." : "Executing program....");
        if (!loading) setStarted(true);
        setRunning(true);
    }, [loading, report]);

    const stop = useCallback(() => {
        setRunning(false);
        if (keepsDrum) saveDrum(machine);
        report("Stopped");
        setView(snapshot(machine, memoryStart));
    }, [machine, memoryStart, report, keepsDrum]);

    /** Obey a single instruction, as the one shot switch did. */
    const stepOnce = useCallback(() => {
        const result = runBatch(machine, 1);
        setView(snapshot(machine, memoryStart));
        report(result.error ?? `Obeyed ${machine.lastInstructionMnemonic.trim()}`, result.error !== null);
    }, [machine, memoryStart]);

    /** Change a console switch and refresh the display. */
    /**
     * Choose which tape the machine reads, and show the result.
     *
     * The rule is the machine's — see `Machine.readFrom`, which the Interprogram
     * procedure works through the same method — so all that belongs here is
     * bringing the display up to date afterwards.
     */
    const readFrom = useCallback(
        (data: boolean) => {
            machine.readFrom(data);
            setView(snapshot(machine, memoryStart));
        },
        [machine, memoryStart],
    );

    const setSwitch = useCallback(
        <K extends keyof Machine>(name: K, value: Machine[K]) => {
            machine[name] = value;
            setView(snapshot(machine, memoryStart));
        },
        [machine, memoryStart],
    );

    const clearSequence = useCallback(() => {
        machine.clearSequence();
        report("Sequence register cleared");
        setView(snapshot(machine, memoryStart));
    }, [machine, memoryStart]);

    const clearDrum = useCallback(() => {
        machine.ma.fill(0);
        machine.drumWritten = false;
        machine.maLast = 0;
        if (keepsDrum) localStorage.removeItem(DRUM_STORAGE_KEY);
        report("Drum store cleared");
        setView(snapshot(machine, memoryStart));
    }, [machine, memoryStart, keepsDrum]);

    return {
        machine,
        view,
        running,
        started,
        memoryStart,
        setMemoryStart,
        displayD,
        setDisplayD,
        binaryDigits,
        setBinaryDigits,
        status,
        statusIsError,
        report,
        editing,
        setEditing,
        loading,
        programName,
        dataName,
        programText,
        dataText,
        notes,
        walkthrough,
        mountTapes,
        acceptSettings,
        start,
        stop,
        stepOnce,
        setSwitch,
        readFrom,
        clearSequence,
        clearDrum,
        refresh,
    };
}

export function snapshot(machine: Machine, memoryStart: number): MachineView {
    const memory: number[] = [];
    for (let n = 0; n < 16; n++) memory.push(machine.m[(memoryStart + n) % STORE_WORDS]);

    return {
        a: machine.a,
        b: machine.b,
        c: machine.c,
        h: machine.h,
        i: machine.i | machine.iSwitches,
        na: machine.na,
        nb: machine.nb,
        k: machine.k,
        s: machine.s,
        maLast: machine.maLast,
        outputRegister: machine.outputRegister,
        d: Array.from(machine.d),
        memory,
        recent: Array.from(machine.recent),
        mnemonic: machine.lastInstructionMnemonic,
        instructionCount: machine.instructionCount,
        teleprinter: renderPrinterText(machine.teleprinterOutput),
        punch: renderPrinterText(machine.punchOutput),
        reader5Hole: machine.reader5Hole,
        punch5Hole: machine.punch5Hole,
        readData: machine.readData,
        readingData: machine.readingDataTape,
        naToK: machine.naToK,
        naAndSToK: machine.naAndSToK,
        oneShot: machine.oneShot,
        triggerStop: machine.triggerStop,
        triggerAddress: machine.triggerAddress,
        iSwitches: machine.iSwitches,
        primaryStored: machine.primaryStored,
        programAt: machine.programTape?.position ?? 0,
        dataAt: machine.dataTape?.position ?? 0,
    };
}

/**
 * The drum was magnetic and kept its contents with the power off, so the DOS
 * emulator wrote it to a MAHOLD file on exit and read it back on startup.
 * Local storage stands in for that file.
 */
function saveDrum(machine: Machine) {
    if (!machine.drumWritten) return;
    try {
        localStorage.setItem(DRUM_STORAGE_KEY, JSON.stringify(Array.from(machine.ma)));
    } catch {
        // Storage may be unavailable or full; the drum simply does not persist.
    }
}

function loadDrum(machine: Machine) {
    try {
        const saved = localStorage.getItem(DRUM_STORAGE_KEY);
        if (!saved) return;
        const words = JSON.parse(saved) as number[];
        for (let n = 0; n < Math.min(words.length, STORE_WORDS); n++) machine.ma[n] = words[n] | 0;
    } catch {
        // A corrupt or missing drum file just means an empty drum.
    }
}
