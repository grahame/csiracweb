/**
 * Reading a paper tape as a listing.
 *
 * A program tape is not simply a list of instructions. It is read in two
 * stages, and the same row means different things depending on which stage it
 * is in:
 *
 * 1. The **primary** at the head of the tape is read by the machine's own
 *    hardware read cycle. Every row is one whole word, stored at consecutive
 *    addresses. Reading stops at the first blank row, which is why tapes were
 *    always assembled with a few blank rows after the primary.
 *
 * 2. Everything after that is read by the primary, now running as a program.
 *    Here a row carrying an **X** punch completes an instruction, giving its
 *    source and destination; a plain row before it carries the address digits;
 *    and a row carrying a **Y** punch is a control statement, which says where
 *    the words that follow are to be stored.
 *
 * The punches tell us which stage a row belongs to and what it carries, but
 * they do not tell us where the assembled word ends up: that is decided by the
 * primary's own control statements, a small assembler language that differs
 * between primaries. Rather than guess at it, the tape is actually read in by
 * a machine and every write to store is followed, so the listing reports where
 * each row really went.
 */

import { decodeInstruction, describeInstruction, mnemonicOf, type Instruction } from "./describe";
import { Machine } from "./machine";
import { runToStop } from "./run";
import { looksLikeTwelveHole } from "./punching";
import { Tape, parseRow } from "./tape";
import { P19, P20, toScale32 } from "./word";

export type RowKind =
    /** Text past column 7 with no punches: a heading, ignored by the reader. */
    | "heading"
    /** Part of the lead-in diagonal punched so the tape can be threaded. */
    | "lead-in"
    /** Blank tape. Ends the primary, and separates sections. */
    | "blank"
    /**
     * A row the reader cannot read. It is not blank tape and must not be shown
     * as though it were: the reader stops at it, so the listing has to show it
     * in place rather than leave a gap in the row numbers.
     */
    | "unreadable"
    /** A word of the primary, stored exactly as punched. */
    | "primary"
    /** Address digits, completed by the instruction row that follows. */
    | "address"
    /** An X punch: this row completes an instruction. */
    | "instruction"
    /** A Y punch: a control statement saying where the following words go. */
    | "control";

export interface TapeRow {
    /** 1-based line number in the file. */
    line: number;
    /** The text as punched, without the trailing comment. */
    punches: string;
    /** Any comment past column 7. */
    comment: string;
    /** The 20-bit value the row represents. */
    value: number;
    /** The two scale-32 digits as punched. */
    digits: [number, number];
    hasX: boolean;
    hasY: boolean;
    kind: RowKind;
    /** Where the assembled word is stored, when this row completes one. */
    storeAddress: number | null;
    /** The assembled word, when this row completes one. */
    word: number | null;
    instruction: Instruction | null;
    /** The mnemonic pair, e.g. "PL  T". */
    mnemonic: string | null;
    /** One sentence saying what it does. */
    description: string | null;
}

/** Powers of two up to 512 are the lead-in diagonal, not part of the program. */
function isLeadIn(value: number): boolean {
    return value !== 0 && value <= 512 && (value & (value - 1)) === 0;
}

/**
 * Read a 12-hole program tape as an annotated listing.
 *
 * `loadAddress` is where the primary is stored, which is address 0 unless NA
 * has been set to something else before reading, as Muncey's non-stop primary
 * requires.
 */
function analyseStructure(text: string, loadAddress = 0): TapeRow[] {
    const lines = text.replace(/\r\n|\r/g, "\n").split("\n");
    const rows: TapeRow[] = [];

    /** Which of the two reading stages we are in. */
    let stage: "lead-in" | "primary" | "program" = "lead-in";
    let store = loadAddress;
    /** Address digits seen on a plain row, waiting for the X row that uses them. */
    let pendingAddress = 0;

    lines.forEach((raw, index) => {
        const line = index + 1;
        const padded = raw.padEnd(7, " ");
        const punches = padded.slice(0, 7);
        const comment = raw.length > 7 ? raw.slice(7).trimEnd() : "";
        const parsed = parseRow(raw);
        const value = parsed.error ? 0 : parsed.value;
        const digits = toScale32(value & 0x3ff) as [number, number];
        const hasX = (value & P19) !== 0;
        const hasY = (value & P20) !== 0;

        const base = { line, punches, comment, value, digits, hasX, hasY };
        const plain = (kind: RowKind): TapeRow => ({
            ...base,
            kind,
            storeAddress: null,
            word: null,
            instruction: null,
            mnemonic: null,
            description: null,
        });

        // A row that will not parse reads as nothing at all, so it would otherwise
        // be filed as blank tape and hidden. The reader stops at it, so it is
        // called out where it sits.
        if (parsed.error) {
            rows.push({
                ...plain("unreadable"),
                description: "Not a row the reader can read. It stops here.",
            });
            return;
        }

        if (stage === "lead-in") {
            // Blank tape carrying a comment, before the primary has started, is the
            // heading a tape listing is titled with. Tapes write this either with
            // the punch columns left empty or with an explicit blank row, so the
            // comment is what marks it, not the shape of the columns.
            if (value === 0 && comment.length > 0) {
                rows.push(plain("heading"));
                return;
            }
            if (value === 0 || isLeadIn(value)) {
                rows.push(plain(value === 0 ? "blank" : "lead-in"));
                return;
            }
            // The first row that is not lead-in is the first word of the primary.
            stage = "primary";
        }

        if (stage === "primary") {
            if (value === 0) {
                // Blank tape ends the primary; the primary now takes over as a program.
                stage = "program";
                rows.push(plain("blank"));
                return;
            }
            const instruction = decodeInstruction(value);
            rows.push({
                ...base,
                kind: "primary",
                storeAddress: store,
                word: value,
                instruction,
                mnemonic: mnemonicOf(instruction),
                description: describeInstruction(instruction),
            });
            store += 1;
            return;
        }

        // The program stage. Where these end up is settled by following an actual
        // load, in analyseProgramTape below; here we only classify the punches.
        if (hasY) {
            // A control statement takes the plain row before it as its operand, the
            // way the programming manual writes "4A" as the two rows "0 4" and
            // "0 2Y". So the pending address belongs to the control statement, not
            // to the next instruction.
            const operand = pendingAddress;
            pendingAddress = 0;
            const [operandHigh, operandLow] = toScale32(operand);
            rows.push({
                ...plain("control"),
                description:
                    `Control statement ${digits[0]} ${digits[1]}` +
                    (operand === 0 ? "" : ` on ${operandHigh} ${operandLow}`) +
                    ". Control statements tell the primary where the words that follow are to be stored.",
            });
            return;
        }

        if (hasX) {
            // An X punch completes an instruction: this row carries its source and
            // destination, and any plain row before it carried the address digits.
            const word = pendingAddress * 1024 + (value & 0x3ff);
            const instruction = decodeInstruction(word);
            rows.push({
                ...base,
                kind: "instruction",
                storeAddress: null,
                word,
                instruction,
                mnemonic: mnemonicOf(instruction),
                description: describeInstruction(instruction),
            });
            pendingAddress = 0;
            return;
        }

        if (value === 0) {
            rows.push(plain("blank"));
            pendingAddress = 0;
            return;
        }

        // A plain row: the address digits for the instruction row that follows.
        pendingAddress = value & 0x3ff;
        rows.push({
            ...plain("address"),
            description: `Address digits ${digits[0]} ${digits[1]}, for the row that follows.`,
        });
    });

    return rows;
}

/** A word written to store while a tape was being read in. */
interface StoreWrite {
    /** The row that had just been read when the write happened. */
    afterRow: number;
    address: number;
    word: number;
}

/**
 * Read the tape in on a real machine, following every write to store.
 *
 * The primary is the authority on how a tape is assembled, so this asks it
 * rather than trying to reimplement it. Reading stops at the first stop
 * instruction, which is the DO command at the end of the tape, so what is
 * collected is the load and not the program's own later work.
 */
function traceLoad(text: string): StoreWrite[] {
    const machine = new Machine();
    const tape = new Tape("listing", text);
    machine.programTape = tape;
    machine.initialize();

    const writes: StoreWrite[] = [];

    try {
        // The primary is read by the hardware read cycle, one row to one word, so
        // its rows already know where they went. Only the words the primary goes
        // on to assemble need following, so tracing starts after it is in.
        machine.readPrimary();
        machine.onStore = (address, word) => {
            writes.push({ afterRow: tape.position, address, word });
        };
        machine.s = 0;
        machine.beginExecution();
        runToStop(machine, 2_000_000);
    } catch {
        // A tape that will not read in still gets the listing we can produce from
        // its punches alone.
    }
    machine.onStore = null;
    return writes;
}

/**
 * Read a 12-hole program tape as an annotated listing, with the store address
 * of each assembled word taken from an actual load.
 */
export function analyseProgramTape(text: string, loadAddress = 0): TapeRow[] {
    const rows = analyseStructure(text, loadAddress);

    // Rows carrying an X punch, in tape order: these are the ones that complete
    // an instruction. The punches already give the word each assembles to; what
    // they do not give is where it is stored, which is what the trace supplies.
    //
    // The two cannot simply be zipped together. Once a control statement hands
    // control to the tape's own code, the program starts writing to store on its
    // own account, so there are more writes than there are rows. Nor can they be
    // matched by line number: the input register runs behind the reader, so the
    // primary has read on a row or two by the time it stores what it assembled.
    //
    // Matching on the word itself settles it. Both sequences are in tape order,
    // so each write either continues the load, or is the program's own work and
    // is passed over.
    const completing = rows.filter((row) => row.kind === "instruction");
    let next = 0;

    // How far ahead to look for the row a write belongs to. Small, so that a
    // word which happens to repeat later on cannot pull the alignment apart.
    const LOOKAHEAD = 8;

    for (const write of traceLoad(text)) {
        if (next >= completing.length) break;

        let found = -1;
        for (let i = next; i < Math.min(next + LOOKAHEAD, completing.length); i++) {
            if (completing[i].word === write.word) {
                found = i;
                break;
            }
        }
        // No row nearby assembles to this word, so the write is the program's own
        // work rather than part of the load. Leave the rows where they are.
        if (found < 0) continue;

        completing[found].storeAddress = write.address;
        next = found + 1;
    }

    return rows;
}

export interface DataRow {
    line: number;
    /** The text as punched. */
    punches: string;
    /** As a 12-hole row: the 20-bit value, and its scale-32 digits. */
    value: number;
    digits: [number, number];
    hasX: boolean;
    hasY: boolean;
    /** Whether the row parses as a valid 12-hole row at all. */
    valid: boolean;
}

/**
 * Read a data tape as 12-hole rows. A 5-hole data tape is just text, and is
 * shown as itself.
 */
export function analyseDataTape(text: string): DataRow[] {
    const lines = text.replace(/\r\n|\r/g, "\n").split("\n");
    return lines.map((raw, index) => {
        const parsed = parseRow(raw);
        const value = parsed.error ? 0 : parsed.value;
        return {
            line: index + 1,
            punches: raw.padEnd(7, " ").slice(0, 7),
            value,
            digits: toScale32(value & 0x3ff) as [number, number],
            hasX: (value & P19) !== 0,
            hasY: (value & P20) !== 0,
            valid: !parsed.error,
        };
    });
}

export { looksLikeTwelveHole };
