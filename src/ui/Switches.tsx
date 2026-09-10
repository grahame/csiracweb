/**
 * The hand-set number registers, NA and NB.
 *
 * These two were not typed at CSIRAC and they were not computed: each was a
 * row of twenty toggle switches on the console, and an operator set a word by
 * putting the switches up. A program read the row as a source like any other,
 * which is how a number got into a program without being punched on tape —
 * the multiplication tape wants its two numbers this way, and Interprogram
 * wants the day of the month on NB.
 *
 * The switches are numbered as the machine's digits are, p1 at the right hand
 * end and p20 at the left, so the row reads as the word does: the same order
 * as the binary displays, and the same order as the photographs of the console.
 * They are grouped in fives because that is how a word is written down — four
 * groups of five, each group a scale 32 digit, which is what the row says it
 * comes to at its right hand end.
 */

import { toScale32Quad } from "../emulator/word";

/** A word is twenty digits, so a row is twenty switches. */
const DIGITS = 20;
/** Written down in fours groups of five; see toScale32Quad. */
const GROUP = 5;

export interface SwitchPanelProps {
    na: number;
    nb: number;
    /**
     * Working a switch, for a console somebody is at. Left out where the
     * machine is being worked for them, as on the Interprogram page: the
     * switches still show what has been set, but nobody's hands are on them.
     */
    onSet?: (name: "na" | "nb", word: number) => void;
}

export function SwitchPanel({ na, nb, onSet }: SwitchPanelProps) {
    return (
        <div className="switch-panel">
            <div className="machine-state-head">Hand-set switches</div>
            <SwitchRow name="na" label="NA" word={na} onSet={onSet} />
            <SwitchRow name="nb" label="NB" word={nb} onSet={onSet} />
        </div>
    );
}

function SwitchRow({
    name,
    label,
    word,
    onSet,
}: {
    name: "na" | "nb";
    label: string;
    word: number;
    onSet?: (name: "na" | "nb", word: number) => void;
}) {
    // p20 at the left hand end, counting down to p1 at the right.
    const digits = Array.from({ length: DIGITS }, (_, index) => DIGITS - index);
    const groups = Array.from({ length: DIGITS / GROUP }, (_, index) =>
        digits.slice(index * GROUP, (index + 1) * GROUP),
    );

    return (
        <div className="switch-row">
            <span className="switch-name">{label}</span>
            <div className="switch-bank">
                {groups.map((group, index) => (
                    <div className="switch-group" key={index}>
                        {group.map((digit) => (
                            <Switch
                                key={digit}
                                label={label}
                                digit={digit}
                                up={(word & (1 << (digit - 1))) !== 0}
                                // A switch is worked by being flipped: the word
                                // comes back with that one digit the other way.
                                onFlip={onSet && (() => onSet(name, word ^ (1 << (digit - 1))))}
                            />
                        ))}
                    </div>
                ))}
            </div>
            <span className="switch-value">{toScale32Quad(word).join(" ")}</span>
        </div>
    );
}

/**
 * One switch: a lever that is up or down, and the digit it sets under it.
 *
 * What it is worth is on the tooltip rather than beside the number, because
 * twenty weights along a row is a line of arithmetic where a row of switches
 * should be.
 */
function Switch({ label, digit, up, onFlip }: { label: string; digit: number; up: boolean; onFlip?: () => void }) {
    const className = up ? "switch up" : "switch";
    const lever = <span className="switch-lever" />;
    const number = <span className="switch-number">{digit}</span>;

    if (!onFlip) {
        return (
            <span className={className} title={`p${digit}, worth ${2 ** (digit - 1)}`}>
                {lever}
                {number}
            </span>
        );
    }

    return (
        <button
            type="button"
            className={className}
            aria-label={`${label} switch ${digit}`}
            aria-pressed={up}
            title={`p${digit}, worth ${2 ** (digit - 1)}`}
            onClick={onFlip}
        >
            {lever}
            {number}
        </button>
    );
}
