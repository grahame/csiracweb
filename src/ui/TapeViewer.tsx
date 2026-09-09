/**
 * Looking at a tape, and punching one.
 *
 * A program tape is shown as an annotated listing: every row as punched, what
 * it carries, where the word it assembles ends up in store, and a sentence
 * saying what that word does. A data tape is shown as rows or as characters,
 * depending on which reader it is meant for.
 *
 * Either can be edited. The listing follows what is typed, so a row can be
 * punched and its effect read off straight away, and the tape can then be put
 * in the reader and run.
 */

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { addressText } from "../emulator/describe";
import { analyseDataTape, analyseProgramTape, type RowKind, type TapeRow } from "../emulator/listing";
import { looksLikeTwelveHole } from "../emulator/punching";
import { parseRow } from "../emulator/tape";
import { toBinaryGroups } from "../emulator/word";

interface TapeViewerProps {
    programName: string;
    programText: string;
    dataName: string;
    dataText: string;
    /**
     * How far each reader has got, so the listing can follow the read head.
     *
     * The count is of rows already read, so the row *under* the head is the next
     * one along and the row already in the input register is the one before it:
     * section 4.2 again, the tape advances once the code has been transmitted.
     */
    programAt: number;
    dataAt: number;
    onClose: () => void;
    /** Put the edited tapes in the readers and go back to the switch panel. */
    onMount: (program: { name: string; text: string }, data: { name: string; text: string }) => void;
}

/** What each kind of row is, in one phrase, for the legend and the row itself. */
const KIND_LABEL: Record<RowKind, string> = {
    heading: "heading",
    "lead-in": "lead-in",
    blank: "blank tape",
    unreadable: "unreadable",
    primary: "primary",
    address: "address",
    instruction: "instruction",
    control: "control",
};

export function TapeViewer({
    programName,
    programText,
    dataName,
    dataText,
    programAt,
    dataAt,
    onClose,
    onMount,
}: TapeViewerProps) {
    const [tab, setTab] = useState<"program" | "data">("program");
    const [showBlanks, setShowBlanks] = useState(false);
    const [editing, setEditing] = useState(false);

    // What is on the tapes, as punched. Edits are kept here until the tapes are
    // put back in the readers.
    const [program, setProgram] = useState(programText);
    const [data, setData] = useState(dataText);
    const edited = program !== programText || data !== dataText;

    // Analysing runs the tape through a machine, so keep it off the keystroke.
    const settledProgram = useDeferredValue(program);
    const rows = useMemo(() => analyseProgramTape(settledProgram), [settledProgram]);

    const shown = showBlanks ? rows : rows.filter((row) => row.kind !== "blank" && row.kind !== "lead-in");

    const text = tab === "program" ? program : data;
    const name = tab === "program" ? programName || "tape.cvt" : dataName || "tape.dat";
    const setText = tab === "program" ? setProgram : setData;

    return (
        <div className="tape-viewer">
            <div className="viewer-head">
                <h2>Tapes</h2>
                <div className="viewer-tabs">
                    <button
                        type="button"
                        className={tab === "program" ? "active" : ""}
                        onClick={() => setTab("program")}
                    >
                        {programName || "program tape"}
                    </button>
                    <button type="button" className={tab === "data" ? "active" : ""} onClick={() => setTab("data")}>
                        {dataName || "data tape"}
                    </button>
                </div>

                <button
                    type="button"
                    className={editing ? "prompt-action active" : "prompt-action"}
                    onClick={() => setEditing(!editing)}
                >
                    {editing ? "Done punching" : "Punch this tape"}
                </button>
                <button type="button" className="prompt-action" onClick={() => download(name, text)}>
                    Download
                </button>
                <button type="button" className="prompt-action" onClick={onClose}>
                    Close
                </button>
            </div>

            {editing ? (
                <TapeEditor
                    name={name}
                    text={text}
                    onChange={setText}
                    twelveHole={tab === "program" || looksLikeTwelveHole(data)}
                />
            ) : null}

            {edited ? (
                <div className="viewer-mount">
                    <span>The tape has been altered.</span>
                    <button
                        type="button"
                        className="prompt-action primary"
                        onClick={() =>
                            onMount(
                                { name: programName || "tape.cvt", text: program },
                                { name: dataName || "tape.dat", text: data },
                            )
                        }
                    >
                        Put it in the reader
                    </button>
                    <button
                        type="button"
                        className="prompt-action secondary"
                        onClick={() => {
                            setProgram(programText);
                            setData(dataText);
                        }}
                    >
                        Undo the changes
                    </button>
                </div>
            ) : null}

            {tab === "program" ? (
                <>
                    <p className="viewer-note">
                        A tape is read in two stages. The <strong>primary</strong> at the head is read by the machine
                        itself, one row to one word. Everything after it is read by the primary, now running as a
                        program: a row with an <strong>X</strong> punch completes an instruction, a plain row before it
                        carries the address digits, and a row with a <strong>Y</strong> punch is a control statement
                        saying where the words that follow are to be stored.
                    </p>
                    <label className="viewer-toggle">
                        <input
                            type="checkbox"
                            checked={showBlanks}
                            onChange={(event) => setShowBlanks(event.target.checked)}
                        />
                        Show blank tape and lead-in
                    </label>
                    <ProgramListing rows={shown} head={programAt} />
                </>
            ) : (
                <DataListing name={dataName} text={data} head={dataAt} />
            )}
        </div>
    );
}

/**
 * Punching a tape by hand.
 *
 * A 12-hole row is `mm nnXY`: two scale-32 numbers, then X in column 6 and Y
 * in column 7 if those punches are there. Anything past column 7 is a comment.
 * Rows that are not valid are called out as they are typed, since a bad row
 * stops the reader dead.
 */
function TapeEditor({
    name,
    text,
    onChange,
    twelveHole,
}: {
    name: string;
    text: string;
    onChange: (text: string) => void;
    twelveHole: boolean;
}) {
    const faults = useMemo(() => {
        if (!twelveHole) return [];
        return text
            .replace(/\r\n|\r/g, "\n")
            .split("\n")
            .map((line, index) => ({ line: index + 1, bad: parseRow(line).error }))
            .filter((row) => row.bad)
            .slice(0, 10);
    }, [text, twelveHole]);

    return (
        <div className="tape-editor">
            <label>
                {name}
                <textarea
                    value={text}
                    spellCheck={false}
                    rows={14}
                    onChange={(event) => onChange(event.target.value)}
                />
            </label>
            {twelveHole ? (
                <p className="viewer-note">
                    One row to a line, <code>mm nn</code> as two scale-32 numbers, then <code>X</code> in column 6 and{" "}
                    <code>Y</code> in column 7 where those punches are wanted. Anything past column 7 is a comment. A
                    blank row ends the primary.
                </p>
            ) : (
                <p className="viewer-note">
                    A 5-hole tape is ordinary text, read a character at a time. Figure and letter shifts are inserted
                    for you where the text needs them.
                </p>
            )}
            {faults.length > 0 ? (
                <p className="error">
                    Not a valid row: {faults.map((fault) => `line ${fault.line}`).join(", ")}
                    {faults.length === 10 ? " and more" : ""}. The reader stops at a row it cannot read.
                </p>
            ) : null}
        </div>
    );
}

function download(name: string, text: string) {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
}

function ProgramListing({ rows, head }: { rows: TapeRow[]; head: number }) {
    // Rows are numbered from one, and `head` counts rows already read, so the
    // row under the head is head + 1 and the one in the input register is head.
    const underHead = head + 1;
    const inRegister = head;

    // Keep the head in view as the tape runs through, without smooth scrolling:
    // at ninety rows a second an animated scroll would never settle.
    const headRow = useRef<HTMLTableRowElement>(null);
    useEffect(() => {
        headRow.current?.scrollIntoView?.({ block: "center", behavior: "auto" });
    }, [head]);

    return (
        <table className="listing">
            <thead>
                <tr>
                    <th className="num">Row</th>
                    <th>Punches</th>
                    <th>Carries</th>
                    <th className="num">Store</th>
                    <th>Word</th>
                    <th>Order</th>
                    <th>What it does</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((row) => (
                    <tr
                        key={row.line}
                        ref={row.line === underHead ? headRow : undefined}
                        className={
                            `row-${row.kind}` +
                            (row.line === underHead ? " under-head" : "") +
                            (row.line === inRegister ? " in-register" : "")
                        }
                    >
                        <td className="num">{row.line}</td>
                        <td className="punches">{row.punches.replace(/ /g, " ")}</td>
                        <td className="kind">{KIND_LABEL[row.kind]}</td>
                        <td className="num">{row.storeAddress !== null ? addressText(row.storeAddress) : ""}</td>
                        <td className="word">{row.word !== null ? toBinaryGroups(row.word) : ""}</td>
                        <td className="mnemonic-cell">{row.mnemonic ?? ""}</td>
                        <td className="what">
                            {row.kind === "heading" ? null : row.description}
                            {row.kind === "instruction" && row.storeAddress === null ? (
                                <span className="unplaced"> Not stored while the tape was read in.</span>
                            ) : null}
                            {/* Tapes often carry the programmer's own notes past column 7,
                                which are worth more than anything we can say about the row. */}
                            {row.comment ? <em className="tape-comment">{row.comment.trim()}</em> : null}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function DataListing({ name, text, head }: { name: string; text: string; head: number }) {
    const twelveHole = useMemo(() => looksLikeTwelveHole(text), [text]);
    const rows = useMemo(() => (twelveHole ? analyseDataTape(text) : []), [twelveHole, text]);

    if (!twelveHole) {
        return (
            <>
                <p className="viewer-note">
                    {name} is a 5-hole tape: it is read character by character, and each character is converted to its
                    Flexowriter code as it comes in. Figure and letter shifts are inserted automatically where the text
                    needs them, so it can be typed as ordinary text.
                </p>
                <pre className="data-text">{text}</pre>
            </>
        );
    }

    return (
        <>
            <p className="viewer-note">
                {name} is a 12-hole tape, read a row at a time under the control of the program. Each row is two
                scale-32 numbers, with X and Y punches carrying the two most significant digits.
            </p>
            <table className="listing">
                <thead>
                    <tr>
                        <th className="num">Row</th>
                        <th>Punches</th>
                        <th className="num">Value</th>
                        <th>Word</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr
                            key={row.line}
                            className={
                                row.line === head + 1 ? "under-head" : row.line === head ? "in-register" : undefined
                            }
                        >
                            <td className="num">{row.line}</td>
                            <td className="punches">{row.punches.replace(/ /g, " ")}</td>
                            <td className="num">{row.value}</td>
                            <td className="word">{toBinaryGroups(row.value)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}
