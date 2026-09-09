/**
 * The operations menu, beside the tape on the operating screen.
 *
 * These are the switches an operator reached for most often, and in the DOS
 * emulator they could be worked without leaving the display. Every one still
 * answers the same letter it did there, but the letter is no longer printed
 * against the label: an entry says what it is, and its key is on the tooltip
 * for whoever wants it. A column of "U.", "K.", "N." made the machine read as
 * a menu system, which is what the DOS emulator had to be and this does not.
 */

import { useEffect, useState } from "react";

import { P11, fromScale32, toScale32, toScale32Quad } from "../emulator/word";
import type { EditTarget, useMachine } from "./useMachine";

interface OperationsMenuProps {
    controller: ReturnType<typeof useMachine>;
    onExit: () => void;
}

export function OperationsMenu({ controller, onExit }: OperationsMenuProps) {
    // Which switch is waiting for a value is held by the controller, so that the
    // menu's letter keys open it just as clicking the entry does.
    const { view, setSwitch, clearSequence, editing, setEditing } = controller;
    const [entry, setEntry] = useState("");

    const startEditing = (what: Exclude<EditTarget, null>) => {
        setEditing(what);
        setEntry("");
    };

    // Opening an entry clears whatever was typed at the last one.
    useEffect(() => {
        if (editing) setEntry("");
    }, [editing]);

    const commit = () => {
        const digits = entry.trim().split(/\s+/).map(Number);
        const valid = digits.every((d) => Number.isInteger(d) && d >= 0 && d < 32);

        if (valid && editing === "trigger" && digits.length === 2) {
            setSwitch("triggerAddress", fromScale32(digits[0], digits[1]) * P11);
            setSwitch("triggerStop", true);
        } else if (valid && digits.length === 1) {
            // The operations menu sets a single scale-32 digit of the register: the
            // p6 digit for NA and I, and the p1 digit for NB.
            if (editing === "na") setSwitch("na", replaceDigit(view.na, 2, digits[0]));
            if (editing === "i") setSwitch("iSwitches", fromScale32(digits[0], 0));
            if (editing === "nb") setSwitch("nb", replaceDigit(view.nb, 3, digits[0]));
        }
        setEditing(null);
        setEntry("");
    };

    const [triggerHigh, triggerLow] = toScale32(view.triggerAddress >> 10);

    /**
     * What each of these keys actually sets.
     *
     * They set one scale-32 digit of a register, not the whole of it, exactly as
     * the console did. A digit's worth depends on which of the four it is — the
     * manual's section 1.3 gives them as 32^3, 32^2, 32 and 1 — so entering 7 at
     * A does not put 7 on NA, it puts 7 x 32. That is the trap that makes
     * Multiplication.cvt print 1344 instead of 42, so the entry says which digit
     * it is setting and by what it is scaled.
     */
    const digitEntries = {
        na: { digit: "p6", scale: 32 },
        nb: { digit: "p1", scale: 1 },
        i: { digit: "p6", scale: 32 },
    } as const;

    const digitEntry = editing && editing !== "trigger" ? digitEntries[editing] : null;

    return (
        <div className="operations-menu">
            <div className="column-head">Operations Menu</div>

            {/* The reader selector is the machine's switch, but it is not worked by
                hand: it follows the tape, because how many holes a tape has is a
                property of the tape. So it is shown here as where the switch stands
                rather than as something to set. */}
            <div className="menu-readout">READER: {view.reader5Hole ? "5 HOLE" : "12 HOLE"}</div>
            {/* "Use the program tape" reads as an instruction to switch to it, when
                what it means is that the program tape is the one being read. The
                label says which tape is in the reader, and the tooltip says what
                working it would do about that. */}
            <MenuItem
                letter="U"
                label={`Using ${view.readData ? "data tape" : "program tape"}`}
                hint={`Click to change to the ${view.readData ? "program" : "data"} tape`}
                onClick={() => controller.readFrom(!view.readData)}
            />
            <MenuItem
                letter="K"
                label={`NA&S to K: ${onOff(view.naAndSToK)}`}
                onClick={() => setSwitch("naAndSToK", !view.naAndSToK)}
            />
            <MenuItem
                letter="N"
                label={`NA to K: ${onOff(view.naToK)}`}
                onClick={() => setSwitch("naToK", !view.naToK)}
            />
            <MenuItem
                letter="Z"
                label={`Punch: ${view.punch5Hole ? "5 HOLE" : "12 HOLE"}`}
                onClick={() => setSwitch("punch5Hole", !view.punch5Hole)}
            />
            <MenuItem letter="A" label="Set NA Reg.(P6 units)" onClick={() => startEditing("na")} />
            <MenuItem letter="B" label="Set NB Reg.(PL units)" onClick={() => startEditing("nb")} />
            <MenuItem letter="I" label="Set  I Reg.(P6 units)" onClick={() => startEditing("i")} />
            <MenuItem letter="S" label="Clear S" onClick={clearSequence} />
            <MenuItem
                letter="1"
                label={`One Shot: ${onOff(view.oneShot)}`}
                onClick={() => setSwitch("oneShot", !view.oneShot)}
            />
            <MenuItem
                letter="H"
                label={`Trigger Stop: ${onOff(view.triggerStop)}`}
                onClick={() => {
                    if (view.triggerStop) setSwitch("triggerStop", false);
                    else startEditing("trigger");
                }}
            />
            {view.triggerStop ? <div className="menu-note">Address: {`${triggerHigh} ${triggerLow}`}</div> : null}

            {editing ? (
                <form
                    className="menu-entry"
                    onSubmit={(event) => {
                        event.preventDefault();
                        commit();
                    }}
                >
                    <label>
                        {editing === "trigger"
                            ? "Enter address (two scale-32 numbers)"
                            : `Enter the ${digitEntry?.digit} digit, scaled by a factor of ${digitEntry?.scale}`}
                        <input
                            autoFocus
                            value={entry}
                            inputMode="numeric"
                            onChange={(event) => setEntry(event.target.value)}
                            onBlur={commit}
                            onKeyDown={(event) => {
                                if (event.key === "Escape") setEditing(null);
                                event.stopPropagation();
                            }}
                        />
                    </label>
                </form>
            ) : null}

            <MenuItem letter="X" label="Exit" onClick={onExit} />
        </div>
    );
}

function MenuItem({
    letter,
    label,
    hint,
    onClick,
}: {
    /** The console key that works this switch, for the tooltip. */
    letter: string;
    label: string;
    /**
     * What working the switch would do, for entries whose label is a state.
     * Carried in the button's tooltip rather than set beside the label, where it
     * competed with the state it was explaining.
     */
    hint?: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            className="menu-item"
            onClick={onClick}
            title={hint ? `${hint}, or press ${letter}` : `Press ${letter}`}
        >
            {label}
        </button>
    );
}

function onOff(value: boolean): string {
    return value ? "ON" : "OFF";
}

/** Replace one of the four scale-32 digits of a register, leaving the rest. */
function replaceDigit(word: number, index: number, digit: number): number {
    const digits = toScale32Quad(word);
    digits[index] = digit;
    return fromScale32(digits[0], digits[1]) * P11 + fromScale32(digits[2], digits[3]);
}
