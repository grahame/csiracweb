/**
 * Everything the machine shows while it is working.
 *
 * The bank of cathode ray tubes across the top, the keys that work the machine
 * directly under them, then the tape readers, then what the teleprinter and the
 * punch have produced, and last the registers and a window on main store
 * written out in ones and zeroes.
 *
 * The tubes lead, and take the whole width, because they are what an operator
 * watched: they show a running machine at a glance, where the printed displays
 * are for reading one that has stopped. What comes off the paper follows,
 * because on most runs it is the answer. The ones and zeroes come last: they
 * are the machine's state rather than its output, and they are the part you
 * go looking for rather than the part you watch.
 *
 * It is the same display wherever the machine is being run: at the console,
 * where an operator works the switches beside it, and on the Interprogram
 * page, where the switches are automated and the column beside the store
 * says what is being pressed instead.
 *
 * That column is the only difference between the two, so it is the only thing
 * passed in.
 */

import type { ReactNode } from "react";

import { formatFraction, formatInteger } from "../emulator/format";
import { toScale32, toScale32Quad } from "../emulator/word";
import { Binary } from "./Binary";
import { Crt, type Tube } from "./Crt";
import type { MachineController } from "./MachineContext";
import { Readers } from "./Readers";
import type { MachineView } from "./useMachine";

interface MachineDisplayProps {
    controller: MachineController;
    /** What sits beside the tape: the operations menu, or the narration. */
    aside: ReactNode;
    /**
     * What sits directly under the tubes: the console's prompt line, where
     * RETURN sets the machine going. It belongs against the thing it works
     * rather than at the foot of the page below everything the machine has
     * printed. The Interprogram page has its own and passes none.
     */
    controls?: ReactNode;
}

export function MachineDisplay({ controller, aside, controls }: MachineDisplayProps) {
    const { view, running, binaryDigits, displayD, memoryStart } = controller;

    // The D display can be switched to show the last sixteen commands obeyed.
    const leftColumn = displayD ? view.d : view.recent;

    const tubes: Tube[] = [
        { label: "A", kind: "word", word: view.a, digits: 20 },
        { label: "B", kind: "word", word: view.b, digits: 20 },
        { label: "M", kind: "raster", words: view.memory },
        { label: "D", kind: "raster", words: leftColumn },
        { label: "C", kind: "word", word: view.c, digits: 20 },
        { label: "H", kind: "word", word: view.h, digits: 10 },
    ];

    return (
        <>
            {/*
                The tubes first and across the whole page, which is where they
                were: the bank sat above the console and was the thing you
                looked at while the machine ran. Then the tape, then the paper,
                and last the same registers written out in ones and zeroes, for
                reading rather than for watching.
            */}
            <Crt tubes={tubes} />

            {controls}

            {/*
                The switches go beside the tape, which is where an operator's
                hands were: the reader is the thing they were being worked
                about. On the Interprogram page the same column says which of
                them is being worked instead.
            */}
            <div className="tape-row">
                <Readers
                    view={view}
                    programName={controller.programName}
                    programText={controller.programText}
                    dataName={controller.dataName}
                    dataText={controller.dataText}
                />
                {aside}
            </div>

            {/* The teleprinter was eighty columns wide, so the paper is. */}
            <PrinterOutput head="Teleprinter (OT)" text={view.teleprinter || " "} columns={80} />
            {view.punch ? <PrinterOutput head="Punch (OP)" text={view.punch} /> : null}

            <div className="machine-state">
                <div className="machine-state-head">Detailed machine state</div>

                <Registers view={view} digits={binaryDigits} />

                <div className="columns">
                    <div className="store-column">
                        <div className="column-head">{displayD ? "D" : "Last 16 commands executed"}</div>
                        {leftColumn.map((word, index) => (
                            <div className="store-row" key={index}>
                                <span className="store-index">{displayD ? String(index).padStart(2, " ") : "  "}</span>
                                <Binary word={word} asDigits={binaryDigits} />
                            </div>
                        ))}
                    </div>

                    <div className="store-column">
                        <div className="column-head">{storeHead(memoryStart)}</div>
                        {view.memory.map((word, index) => (
                            <div className="store-row" key={index}>
                                <Binary word={word} asDigits={binaryDigits} />
                            </div>
                        ))}
                    </div>
                </div>

                {!running ? <DecimalReadout view={view} /> : null}
            </div>
        </>
    );
}

/** "M (m,n) onwards", the address of the store window in scale-32 digits. */
function storeHead(memoryStart: number): string {
    const [high, low] = toScale32(memoryStart);
    return `M (${high},${low}) onwards`;
}

/** The registers, as the console printed them across the top of the screen. */
export function Registers({ view, digits }: { view: MachineView; digits: boolean }) {
    const na = toScale32Quad(view.na);
    const nb = toScale32Quad(view.nb);

    return (
        <div className="registers">
            <div className="register-row">
                <span className="reg">
                    A <Binary word={view.a} asDigits={digits} accumulator />
                </span>
                <span className="reg">
                    B <Binary word={view.b} asDigits={digits} accumulator />
                </span>
                <span className="reg indicator-head">*&nbsp;&nbsp;*</span>
            </div>
            <div className="register-row">
                <span className="reg">
                    C <Binary word={view.c} asDigits={digits} accumulator />
                </span>
                <span className="reg">
                    H <Binary word={view.h} digits={10} asDigits={digits} />
                </span>
                <span className="reg">
                    O <Binary word={view.outputRegister} digits={5} asDigits={digits} />
                </span>
                <span className="reg">
                    K <Binary word={view.k >> 10} digits={10} asDigits={digits} />
                </span>
                <span className="reg mnemonic">{view.mnemonic}</span>
            </div>
            <div className="register-row">
                <span className="reg">
                    S <Binary word={view.s} asDigits={digits} />
                </span>
                <span className="reg">
                    MA <Binary word={view.maLast} asDigits={digits} />
                </span>
            </div>
            <div className="register-row">
                <span className="reg">
                    I <Binary word={view.i} asDigits={digits} />
                </span>
                <span className="reg">NA {na.map((d) => String(d).padStart(2, " ")).join(" ")}</span>
                <span className="reg">NB {nb.map((d) => String(d).padStart(2, " ")).join(" ")}</span>
            </div>
        </div>
    );
}

/**
 * A run of paper coming off the teleprinter or the punch.
 *
 * `columns` is the width of the paper, in characters, for a machine that had
 * one: the teleprinter was eighty columns and a program written for it laid
 * its output out to fit. The box is that wide whatever is on it, which is the
 * whole of how it is said — the width is a thing to see rather than to read,
 * so a line that would have run off the edge can be seen doing it. The punch
 * has no such width; it produced tape.
 */
export function PrinterOutput({ head, text, columns }: { head: string; text: string; columns?: number }) {
    return (
        <div className="printer-output">
            <div className="printer-head">{head}</div>
            <pre style={columns ? { width: `${columns}ch` } : undefined}>{text}</pre>
        </div>
    );
}

/**
 * Anything the compiler said that was not an instruction to the operator.
 *
 * Shown the same way whether the session was watched or not, because it is the
 * same paper: the compiler's complaint about the source, which is the whole of
 * what somebody writing Interprogram is looking for.
 */
export function CompilerMessages({ messages }: { messages: readonly string[] }) {
    if (messages.length === 0) return null;
    return (
        <div className="interprogram-messages">
            <div className="printer-head">The compiler says</div>
            <pre>{messages.join("\n")}</pre>
        </div>
    );
}

/**
 * The status line, and how far the machine has got.
 *
 * A running machine says so and blinks; a machine that has stopped on a fault
 * says what the fault was, and says it as a fault so that an operator does not
 * have to read the wording to tell a broken run from a finished one.
 */
export function PromptStatus({ running, fault, children }: { running: boolean; fault: boolean; children: ReactNode }) {
    return (
        <span
            className={running ? "prompt-status running" : fault ? "prompt-status fault" : "prompt-status"}
            role={fault && !running ? "alert" : undefined}
        >
            {running ? "RUNNING" : children}
            {running ? <span className="cursor">_</span> : null}
        </span>
    );
}

/**
 * The decimal display the original showed while the machine was stopped: the
 * accumulators read both as fractions and as integers. As John Spencer put it,
 * "I hope that this is not too offensive to purists, but it can be very
 * useful."
 */
export function DecimalReadout({ view }: { view: MachineView }) {
    const registers: [string, number][] = [
        ["A", view.a],
        ["B", view.b],
        ["C", view.c],
        ["D0", view.d[0]],
        ["D1", view.d[1]],
    ];
    return (
        <pre className="decimal-readout">
            {"Fraction  " + registers.map(([name, word]) => `${name} ${formatFraction(word).padStart(10)}`).join("  ")}
            {"\n"}
            {"Integer   " + registers.map(([name, word]) => `${name} ${formatInteger(word).padStart(10)}`).join("  ")}
        </pre>
    );
}
