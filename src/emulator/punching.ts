/**
 * A tape as punching, for drawing.
 *
 * The listing in `listing.ts` says what every row *means*, and to do that it
 * reads the tape in on a real machine. That is far too much work to do while a
 * tape is running through the reader, so this is the cheap path: what is
 * punched in each row, and nothing else.
 *
 * A row of 12-hole tape is its twelve punch positions. Section 4.10 of the
 * programming manual: "Channels X and Y correspond to positions P19 and P20,
 * the remaining 10 channels are read into positions P10 to P1." A row of
 * 5-hole tape is five, section 4.2: "codes from 5-hole tape enter the input
 * register in the P5-P1 digit positions."
 */

import { parseRow } from "./tape";
import { P19, P20 } from "./word";

/** How many data channels a tape carries, not counting the feed hole. */
export type Channels = 5 | 12;

export interface PunchedRow {
    /** True for each channel that is punched, in the order they are drawn. */
    readonly holes: readonly boolean[];
    /** Any text past column 7, which on a real tape was printed on the leader. */
    readonly leader: string;
    /** True if the row carries no punching at all: blank tape. */
    readonly blank: boolean;
}

export interface PunchedTape {
    readonly rows: readonly PunchedRow[];
    readonly channels: Channels;
}

/**
 * Read a tape as punching.
 *
 * The channels are put in the order the row is written, `mm nnXY`, so that a
 * row on the screen and a row in the listing read the same way round. Whether
 * that was their order across the real tape is not recorded anywhere to hand.
 */
export function punchingOf(text: string, channels: Channels): PunchedTape {
    const lines = text.replace(/\r\n|\r/g, "\n").split("\n");

    const rows = lines.map((line) => {
        const leader = line.length > 7 ? line.slice(7).trimEnd() : "";

        if (channels === 5) {
            // A 5-hole tape is text, so there is no row to decode: it is shown as
            // its leader alone.
            return { holes: new Array<boolean>(5).fill(false), leader: line.trimEnd(), blank: true };
        }

        const parsed = parseRow(line);
        const value = parsed.error ? 0 : parsed.value;
        const holes = [
            // p10 to p6, the source field, then p5 to p1, the destination field.
            ...bits(value >> 5, 5),
            ...bits(value, 5),
            (value & P19) !== 0, // X
            (value & P20) !== 0, // Y
        ];
        return { holes, leader, blank: value === 0 };
    });

    return { rows, channels };
}

/** The low `count` bits of a value, most significant first. */
function bits(value: number, count: number): boolean[] {
    const out: boolean[] = [];
    for (let bit = count - 1; bit >= 0; bit--) out.push((value & (1 << bit)) !== 0);
    return out;
}

/**
 * Does this look like a 12-hole tape? A 5-hole data tape holds ordinary text,
 * which will not parse as rows of scale-32 numbers.
 */
export function looksLikeTwelveHole(text: string): boolean {
    const lines = text
        .replace(/\r\n|\r/g, "\n")
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .slice(0, 20);
    if (lines.length === 0) return false;

    // The row parser is deliberately forgiving, so it accepts plenty of things
    // that are plainly text: "-0.003456 ..." reads as row 0, 3. Recognising a
    // tape needs the stricter shape of the punch columns: two right-justified
    // numbers in columns 1-2 and 4-5, a space between them, and nothing but the
    // X and Y punches after. Anything past column 7 is a comment either way, and
    // some tapes run a tab straight up against the punches to start one.
    const punchColumns = /^[ 0-9]{2} [ 0-9]{2}[XY \t]{0,2}$/;
    const rowLike = lines.filter((line) => punchColumns.test(line.padEnd(7, " ").slice(0, 7))).length;
    return rowLike / lines.length > 0.8;
}
