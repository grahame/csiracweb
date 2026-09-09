/**
 * Paper tapes.
 *
 * CSIRAC read programs and data from punched paper tape and wrote results to a
 * teleprinter or a tape punch. Here a tape is a text file, in the same formats
 * the DOS emulator used, so that the tape images distributed with it work
 * unchanged.
 *
 * A 12-hole tape row is written `mm nnXY`: two scale-32 numbers giving the most
 * and least significant halves of the row, then `X` in column 6 and `Y` in
 * column 7 if those punches are present. Anything past column 7 is a comment,
 * which is how tape listings carry their headings.
 *
 * A 5-hole tape is read character by character instead, and the characters are
 * converted to Flexowriter codes on the way in.
 */

import {
    ASCII_TO_FLEXOWRITER,
    FIGURE_SHIFT_CHARS,
    FLEX_CARRIAGE_RETURN,
    FLEX_ERASE,
    FLEX_FIGURE_SHIFT,
    FLEX_LETTER_SHIFT,
} from "./codes";
import { P19, P20, fromScale32 } from "./word";

/** Raised when a tape cannot be read; the machine stops, as it did under DOS. */
export class TapeError extends Error {}

export interface ParsedRow {
    /** The 20-bit word the row represents. */
    value: number;
    /** True if the row was not valid `mm nnXY`. */
    error: boolean;
}

/**
 * Parse one 12-hole tape row. The Pascal original called this RowToI.
 *
 * A field of spaces reads as zero, so heading lines that start past column 7
 * parse as blank tape — exactly the convention the tape listings rely on.
 */
export function parseRow(line: string): ParsedRow {
    // Turbo Pascal read the row into a buffer pre-filled with spaces, so a short
    // line behaved as though padded out to seven columns.
    const row = line.padEnd(7, " ");

    const high = parseScale32Field(row.slice(0, 2));
    const low = parseScale32Field(row.slice(3, 5));
    if (high === null || low === null) return { value: 0, error: true };

    let value = fromScale32(high, low);
    if (row[5] === "X") value |= P19;
    if (row[6] === "Y") value |= P20;
    return { value, error: false };
}

/**
 * Read one scale-32 field, returning null if it is not a number in 0..31.
 * Spaces, `$` and `,` are ignored and a leading `+` is dropped, matching the
 * hand-rolled number parser in the Pascal original.
 */
function parseScale32Field(field: string): number | null {
    let text = field.replace(/[ $,]/g, "");
    if (text.startsWith("+")) text = text.slice(1);
    if (text.length === 0) return 0;
    if (!/^-?\d+$/.test(text)) return null;
    const value = Number(text);
    return value >= 0 && value < 32 ? value : null;
}

/**
 * A tape mounted in a reader.
 *
 * The same file can be read three ways depending on the console switches, so
 * all three readers live here and keep their own position. That mirrors the
 * original, where the reader routines held their state in Pascal typed
 * constants that persisted for the life of the run.
 */
export class Tape {
    readonly name: string;
    private readonly text: string;
    private readonly lines: readonly string[];

    /** Cursor for the row-at-a-time reader. */
    private lineIndex = 0;
    /** Cursor for the 5-hole program reader, which works on raw characters. */
    private charIndex = 0;
    private lastChar = "";

    /** State of the 5-hole data reader, which tracks shifts and inserts them. */
    private dataStarted = false;
    private dataLine = "";
    private dataColumn = 0;
    private dataFigureShift = true;

    constructor(name: string, text: string) {
        this.name = name;
        // The DOS files are CRLF and the 5-hole reader depends on seeing the CR,
        // so normalise however the file arrived to that convention.
        this.text = text.replace(/\r\n|\r|\n/g, "\r\n");
        this.lines = this.text.split("\r\n");
    }

    /** True once every row has been read. */
    get atEnd(): boolean {
        return this.lineIndex >= this.lines.length;
    }

    /**
     * The 1-based number of the last row read, or 0 before anything has been.
     * Used when following a tape being read in, to say which row produced which
     * word in store.
     */
    get position(): number {
        return this.lineIndex;
    }

    /**
     * The tape as it was punched.
     *
     * The reader selector follows the tape rather than being set beside it, and
     * how many holes a tape has can only be told by looking at the whole of it,
     * so the machine has to be able to. See `Machine.readFrom`.
     */
    get punched(): string {
        return this.text;
    }

    /**
     * True if nothing but blank tape is left, so there is no second stage for a
     * primary to read.
     *
     * A tape punched in the primary form — the tune tapes, and anything punched
     * at the console — is read into store one row to one word and is then the
     * whole program: there is no primary sitting at the head reading the rest of
     * it in. Looking ahead is the only way to tell the two apart, and it has to
     * be done without consuming anything, so this parses rather than reads. A row
     * that cannot be parsed counts as tape rather than as blank, because it is
     * something the reader would have to stop at.
     */
    restIsBlank(): boolean {
        for (let index = this.lineIndex; index < this.lines.length; index++) {
            const { value, error } = parseRow(this.lines[index]);
            if (error || value !== 0) return false;
        }
        return true;
    }

    /**
     * Read the next 12-hole row. Past the end of the tape this reads as blank,
     * which is how the reader behaved with no tape in it.
     *
     * The Pascal original called this ReadaLine.
     */
    readRow(): number {
        if (this.atEnd) return 0;
        const line = this.lines[this.lineIndex++];
        const { value, error } = parseRow(line);
        if (error) throw new TapeError(`Error on line ${this.lineIndex}`);
        return value;
    }

    /**
     * Read the next character of a 5-hole *program* tape as a Flexowriter code.
     * The Pascal original called this Read5H.
     */
    readProgramChar(): number {
        let ch = this.nextChar();
        // A line feed straight after a carriage return is part of the same row.
        if (this.lastChar === "\r" && ch === "\n") ch = this.nextChar();
        this.lastChar = ch;
        return flexowriterCodeOf(ch);
    }

    private nextChar(): string {
        if (this.charIndex >= this.text.length) {
            throw new TapeError("Unexpected EOF on 5-hole file");
        }
        return this.text[this.charIndex++];
    }

    /**
     * Read the next character of a 5-hole *data* tape as a Flexowriter code,
     * inserting figure and letter shifts as the text requires so that ordinary
     * typed data can be used without hand-punched shift characters.
     *
     * The Pascal original called this Input5.
     */
    readDataChar(): number {
        // The reader always leads with a figure shift, before any data.
        if (!this.dataStarted) {
            this.dataStarted = true;
            this.dataLine = this.nextDataLine();
            return FLEX_FIGURE_SHIFT;
        }

        // At the end of a line, emit a carriage return and pull in the next line.
        if (this.dataColumn >= this.dataLine.length) {
            this.dataColumn = 0;
            this.dataLine = this.nextDataLine();
            return FLEX_CARRIAGE_RETURN;
        }

        const ch = this.dataLine[this.dataColumn];

        // Insert a shift if the character cannot be typed in the current one.
        if (this.dataFigureShift && ch >= "A" && ch <= "Z") {
            this.dataFigureShift = false;
            return FLEX_LETTER_SHIFT;
        }
        if (!this.dataFigureShift && FIGURE_SHIFT_CHARS.has(ch)) {
            this.dataFigureShift = true;
            return FLEX_FIGURE_SHIFT;
        }

        this.dataColumn++;
        return flexowriterCodeOf(ch);
    }

    private nextDataLine(): string {
        if (this.lineIndex >= this.lines.length) {
            throw new TapeError("Unexpected EOF on 5-hole data file");
        }
        return this.lines[this.lineIndex++];
    }
}

/** Convert one character to its Flexowriter code; anything unknown erases. */
function flexowriterCodeOf(ch: string): number {
    return ASCII_TO_FLEXOWRITER.get(ch) ?? FLEX_ERASE;
}

/**
 * Format a word as a 12-hole tape row, the format the punch produces and the
 * reader accepts. This is the inverse of {@link parseRow}.
 */
export function formatRow(word: number): string {
    const high = (word >> 5) & 0x1f;
    const low = ((word >> 10) & 0x1f) | (word & 0x1f);
    return (
        String(high).padStart(2, " ") +
        String(low).padStart(3, " ") +
        (word & P19 ? "X" : " ") +
        (word & P20 ? "Y" : " ")
    );
}
