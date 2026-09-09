/**
 * The Options menu.
 *
 * The DOS emulator put every console setting on one screen, reached by pressing
 * O. The same settings are here, laid out as a panel rather than a wall of
 * text, and without the letters that stood against each of them: nothing here
 * answers a key — while this screen is open only RETURN and ESCAPE do anything
 * — so the letters said to press something that would not have worked. A few
 * entries that only made sense under DOS have
 * been dropped: the option to blank the video during execution existed to make
 * long programs run faster, and there is no speed setting to replace it with,
 * because the control desk had none. CSIRAC ran at about a thousand commands a
 * second and so does this.
 */

import { useState } from "react";

import { decodeDestination, decodeSource } from "../emulator/codes";
import { P11, fromScale32, fromScale32Quad, toScale32, toScale32Quad } from "../emulator/word";
import type { useMachine } from "./useMachine";

interface OptionsMenuProps {
    controller: ReturnType<typeof useMachine>;
    onClose: () => void;
    onExit: () => void;
}

export function OptionsMenu({ controller, onClose, onExit }: OptionsMenuProps) {
    const {
        machine,
        view,
        setSwitch,
        clearSequence,
        clearDrum,
        binaryDigits,
        setBinaryDigits,
        displayD,
        setDisplayD,
        memoryStart,
        setMemoryStart,
        refresh,
        report,
    } = controller;

    const [message, setMessage] = useState("");
    const [memoryHigh, memoryLow] = toScale32(memoryStart);
    const [triggerHigh, triggerLow] = toScale32(view.triggerAddress >> 10);

    return (
        <div className="options-screen" role="dialog" aria-label="Options">
            <h2>Options</h2>

            <section className="options-group">
                <h3>Readers and punches</h3>
                {/* A readout, not a switch: the reader follows the tape. See
                    useMachine's readFrom. */}
                <div className="option-row">
                    <span className="option-label">Reader Selector</span>
                    <span className="option-value">{view.reader5Hole ? "5 HOLE" : "12 HOLE"}</span>
                </div>
                <Toggle
                    label="Read from"
                    value={view.readData ? "data tape" : "program tape"}
                    onClick={() => controller.readFrom(!view.readData)}
                />
                <Toggle
                    label="Punch Selector"
                    value={view.punch5Hole ? "5 HOLE" : "12 HOLE"}
                    onClick={() => setSwitch("punch5Hole", !view.punch5Hole)}
                />
            </section>

            <section className="options-group">
                <h3>Interpreter register</h3>
                <Toggle
                    label="NA &amp; S to K"
                    value={view.naAndSToK ? "ON" : "OFF"}
                    onClick={() => setSwitch("naAndSToK", !view.naAndSToK)}
                />
                <Toggle
                    label="NA to K"
                    value={view.naToK ? "ON" : "OFF"}
                    onClick={() => setSwitch("naToK", !view.naToK)}
                />
            </section>

            <section className="options-group">
                <h3>Number registers</h3>
                <QuadEntry label="NA register" value={view.na} onCommit={(word) => setSwitch("na", word)} />
                <QuadEntry label="NB register" value={view.nb} onCommit={(word) => setSwitch("nb", word)} />
                <QuadEntry
                    label="I register switches"
                    value={view.iSwitches}
                    onCommit={(word) => setSwitch("iSwitches", word)}
                />
            </section>

            <section className="options-group">
                <h3>Stopping</h3>
                <Toggle
                    label="One Shot"
                    value={view.oneShot ? "ON" : "OFF"}
                    onClick={() => setSwitch("oneShot", !view.oneShot)}
                />
                <Toggle
                    label="Halt Selector"
                    value={view.triggerStop ? "ON" : "OFF"}
                    onClick={() => setSwitch("triggerStop", !view.triggerStop)}
                />
                <PairEntry
                    label="Halt Selector address"
                    high={triggerHigh}
                    low={triggerLow}
                    onCommit={(high, low) => setSwitch("triggerAddress", fromScale32(high, low) * P11)}
                />
                <Action label="Clear Sequence register" onClick={clearSequence} />
            </section>

            <section className="options-group">
                <h3>Display</h3>
                <Toggle
                    label="Binary as"
                    value={binaryDigits ? "0s and 1s" : "more like CSIRAC"}
                    onClick={() => setBinaryDigits(!binaryDigits)}
                />
                <Toggle
                    label="Left column shows"
                    value={displayD ? "D registers" : "last 16 commands"}
                    onClick={() => setDisplayD(!displayD)}
                />
                <PairEntry
                    label="Memory display address"
                    high={memoryHigh}
                    low={memoryLow}
                    onCommit={(high, low) => setMemoryStart(fromScale32(high, low))}
                />
            </section>

            <section className="options-group">
                <h3>Store</h3>
                <MemoryEditor
                    onCommit={(address, word) => {
                        machine.m[address] = word;
                        refresh();
                        const [high, low] = toScale32(address);
                        setMessage(`Stored in ${high} ${low}`);
                    }}
                />
                <Action
                    label="Load a T001 Primary and Control into 0 0 to 0 24"
                    onClick={() => {
                        machine.loadStandardPrimary();
                        refresh();
                        setMessage("Primary and Control stored");
                    }}
                />
                <TspControl controller={controller} onMessage={setMessage} />
                <Action label="Clear the drum store" onClick={clearDrum} />
            </section>

            {message ? <p className="options-message">{message}</p> : null}

            <div className="prompt-line">
                <button
                    type="button"
                    className="prompt-action"
                    title="Press RETURN"
                    onClick={() => {
                        report("");
                        onClose();
                    }}
                >
                    Accept these settings
                </button>
                <button type="button" className="prompt-action secondary" onClick={onExit}>
                    Exit
                </button>
            </div>
        </div>
    );
}

function Toggle({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
    return (
        <button type="button" className="option-row option-button" onClick={onClick}>
            <span className="option-label" dangerouslySetInnerHTML={{ __html: label }} />
            <span className="option-value">{value}</span>
        </button>
    );
}

function Action({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button type="button" className="option-row option-button" onClick={onClick}>
            <span className="option-label">{label}</span>
        </button>
    );
}

/** A register entered as its four scale-32 digits, e.g. "0 0 1 0". */
function QuadEntry({ label, value, onCommit }: { label: string; value: number; onCommit: (word: number) => void }) {
    const [text, setText] = useState(() => toScale32Quad(value).join(" "));
    const [error, setError] = useState(false);

    // The four digits are worth 32768, 1024, 32 and 1, so a number typed into
    // the wrong one comes out multiplied. Showing the total as it is typed is
    // the shortest way to say that.
    const total = valueOfQuad(text);

    return (
        <form
            className="option-row"
            onSubmit={(event) => {
                event.preventDefault();
                const digits = text.trim().split(/\s+/).map(Number);
                const ok = digits.length === 4 && digits.every((d) => Number.isInteger(d) && d >= 0 && d < 32);
                setError(!ok);
                if (ok) onCommit(fromScale32Quad(digits[0], digits[1], digits[2], digits[3]));
            }}
        >
            <label className="option-label">
                {label}
                <input value={text} onChange={(event) => setText(event.target.value)} aria-invalid={error} size={12} />
            </label>
            <button type="submit">Set</button>
            {total !== null ? <span className="option-total">= {total}</span> : null}
        </form>
    );
}

/**
 * What four scale-32 digits come to, or null if they are not four digits.
 *
 * Section 1.3 of the programming manual: each group of five binary digits is
 * replaced by the decimal integer it makes, so "9,19,6,27" is
 * 9x32^3 + 19x32^2 + 6x32 + 27.
 */
function valueOfQuad(text: string): number | null {
    const digits = text.trim().split(/\s+/).map(Number);
    if (digits.length !== 4) return null;
    if (!digits.every((d) => Number.isInteger(d) && d >= 0 && d < 32)) return null;
    return fromScale32Quad(digits[0], digits[1], digits[2], digits[3]);
}

/** An address entered as two scale-32 digits, e.g. "23 31". */
function PairEntry({
    label,
    high,
    low,
    onCommit,
}: {
    label: string;
    high: number;
    low: number;
    onCommit: (high: number, low: number) => void;
}) {
    const [text, setText] = useState(`${high} ${low}`);
    const [error, setError] = useState(false);

    return (
        <form
            className="option-row"
            onSubmit={(event) => {
                event.preventDefault();
                const digits = text.trim().split(/\s+/).map(Number);
                const ok = digits.length === 2 && digits.every((d) => Number.isInteger(d) && d >= 0 && d < 32);
                setError(!ok);
                if (ok) onCommit(digits[0], digits[1]);
            }}
        >
            <label className="option-label">
                {label}
                <input value={text} onChange={(event) => setText(event.target.value)} aria-invalid={error} size={8} />
            </label>
            <button type="submit">Set</button>
        </form>
    );
}

/**
 * Editing a word of store, accepting either four scale-32 digits or an address
 * followed by source and destination mnemonics, as the original did.
 */
function MemoryEditor({ onCommit }: { onCommit: (address: number, word: number) => void }) {
    const [address, setAddress] = useState("0 0");
    const [content, setContent] = useState("0 0  Z  Z");
    const [error, setError] = useState("");

    return (
        <form
            className="option-row memory-editor"
            onSubmit={(event) => {
                event.preventDefault();
                const addressDigits = address.trim().split(/\s+/).map(Number);
                if (
                    addressDigits.length !== 2 ||
                    !addressDigits.every((d) => Number.isInteger(d) && d >= 0 && d < 32)
                ) {
                    setError("Address must be two scale-32 numbers");
                    return;
                }

                const parts = content.trim().split(/\s+/);
                if (parts.length !== 4) {
                    setError("Enter four scale-32 numbers, or two and a source and destination");
                    return;
                }
                const high = Number(parts[0]);
                const low = Number(parts[1]);
                const source = decodeSource(parts[2]);
                const destination = decodeDestination(parts[3]);
                if (
                    !Number.isInteger(high) ||
                    !Number.isInteger(low) ||
                    high < 0 ||
                    high > 31 ||
                    low < 0 ||
                    low > 31 ||
                    source === null ||
                    destination === null
                ) {
                    setError("Error(s) in input data. Please try again.");
                    return;
                }

                setError("");
                onCommit(
                    fromScale32(addressDigits[0], addressDigits[1]),
                    fromScale32Quad(high, low, source, destination),
                );
            }}
        >
            <label className="option-label">
                Edit store at
                <input value={address} onChange={(event) => setAddress(event.target.value)} size={6} />
            </label>
            <label className="option-label">
                to
                <input value={content} onChange={(event) => setContent(event.target.value)} size={14} />
            </label>
            <button type="submit">Store</button>
            {error ? <span className="error">{error}</span> : null}
        </form>
    );
}

/** Producing a tape symbol print of a range of store or drum. */
function TspControl({
    controller,
    onMessage,
}: {
    controller: ReturnType<typeof useMachine>;
    onMessage: (message: string) => void;
}) {
    const [from, setFrom] = useState("0 0");
    const [to, setTo] = useState("0 24");
    const [drum, setDrum] = useState(false);

    return (
        <form
            className="option-row"
            onSubmit={(event) => {
                event.preventDefault();
                const start = parsePair(from);
                const finish = parsePair(to);
                if (start === null || finish === null) {
                    onMessage("Error(s) in input data. Please try again.");
                    return;
                }
                const text = controller.machine.tsp(start, finish, drum);
                download(`${controller.programName || "CSIRAC"}.TSP`, text);
                onMessage(`Tape symbol print written for ${from} to ${to}`);
            }}
        >
            <label className="option-label">
                TSP from
                <input value={from} onChange={(event) => setFrom(event.target.value)} size={6} />
            </label>
            <label className="option-label">
                to
                <input value={to} onChange={(event) => setTo(event.target.value)} size={6} />
            </label>
            <label className="option-label">
                <input type="checkbox" checked={drum} onChange={(event) => setDrum(event.target.checked)} />
                from drum
            </label>
            <button type="submit">Print</button>
        </form>
    );
}

function parsePair(text: string): number | null {
    const digits = text.trim().split(/\s+/).map(Number);
    if (digits.length !== 2 || !digits.every((d) => Number.isInteger(d) && d >= 0 && d < 32)) {
        return null;
    }
    return fromScale32(digits[0], digits[1]);
}

function download(name: string, text: string) {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
}
