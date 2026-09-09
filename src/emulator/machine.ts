/**
 * The CSIRAC machine.
 *
 * This is a port of the instruction set emulation in CSIRACEM.PAS, written in
 * Turbo Pascal by John W. Spencer between 1997 and 2001. Like the original it
 * makes no attempt to reproduce the architecture or the speed of the real
 * machine: it obeys the same instructions and drives the same console displays.
 *
 * The comments here point back at the CSIRAC programming manuals where the
 * behaviour is subtle, because the whole point of reading this code is to
 * understand the machine.
 */

import {
    DESTINATION_MNEMONICS,
    FLEXOWRITER_FIGURES,
    FLEXOWRITER_LETTERS,
    FLEXOWRITER_TO_ASCII,
    FLEX_CARRIAGE_RETURN,
    FLEX_ERASE,
    FLEX_FIGURE_SHIFT,
    FLEX_LETTER_SHIFT,
    FLEX_SPACE,
    SOURCE_MNEMONICS,
    TELEPRINTER_BLANK,
    TELEPRINTER_CARRIAGE_RETURN,
    TELEPRINTER_FIGURES,
    TELEPRINTER_FIGURE_SHIFT,
    TELEPRINTER_LETTERS,
    TELEPRINTER_LETTER_SHIFT,
    TELEPRINTER_LINE_FEED,
} from "./codes";
import { looksLikeTwelveHole } from "./punching";
import { Tape, TapeError, formatRow } from "./tape";
import { P1, P11, P20, STORE_WORDS, fromScale32, toSigned, toWord } from "./word";

/** Why execution came to a halt. */
export type StopReason =
    | "trigger-stop" // the halt selector matched the sequence register
    | "one-shot" // the one-shot switch is set, so one instruction at a time
    | "stop-instruction" // a non-zero word was sent to destination T
    | "error"; // the machine could not continue

/** Raised when the machine cannot go on; execution stops and the UI reports it. */
export class MachineError extends Error {}

/** The word addresses Interprogram occupies, used to recognise it (11,0 and 11,1). */
const INTERPROGRAM_PROBE = { at: 352, first: 363524, second: 375638 } as const;

/**
 * The T001 primary and control routine, as it sits in store 0,0 to 0,24.
 * Loading this by hand lets a program without its own primary be read in.
 */
const T001_PRIMARY_AND_CONTROL = [
    562, 601, 709, 601, 760, 677, 376, 474, 288, 783, 49, 565, 601, 663, 728, 24581, 23557, 15365, 19744, 361303,
    1038170, 12107, 11095, 443, 1024398,
] as const;

export class Machine {
    // ---- Registers -----------------------------------------------------------

    /** Accumulator. Arithmetic and logic land here. */
    a = 0;
    /** Auxiliary accumulator, holding the low half of products and shifts. */
    b = 0;
    /** Multiplier register. */
    c = 0;
    /** Half-word register, 10 bits. */
    h = 0;
    /** Input register, loaded from the tape reader. */
    i = 0;
    /** Console switches wired into the input register. */
    iSwitches = 0;
    /** Number registers set from the console. */
    na = 32;
    nb = 0;
    /** Interpreter register: holds the instruction actually being obeyed. */
    k = 0;
    /** Sequence register: the program counter, held in p11 units. */
    s = 0;
    /** The sixteen D registers. */
    readonly d = new Int32Array(16);

    // ---- Stores --------------------------------------------------------------

    /** Main store: 1024 words of mercury delay line memory. */
    readonly m = new Int32Array(STORE_WORDS);
    /** Auxiliary store: 1024 words on the magnetic drum. */
    readonly ma = new Int32Array(STORE_WORDS);
    /** The last word written to the drum, which the console displays. */
    maLast = 0;
    /** Set once anything has been written to the drum, so it is worth keeping. */
    drumWritten = false;

    // ---- Console switches ----------------------------------------------------

    /** Reader selector: 5-hole tape when set, 12-hole when clear. */
    reader5Hole = false;
    /** Punch selector: 5-hole when set, 12-hole when clear. */
    punch5Hole = true;
    /** Read from the data tape rather than the program tape. */
    readData = false;
    /** Route NA to the interpreter register instead of the instruction. */
    naToK = false;
    /** Route NA or S to the interpreter register instead of the instruction. */
    naAndSToK = false;
    /** One-shot: stop after every instruction. */
    oneShot = false;
    /** Halt selector: stop when the sequence register reaches the halt address. */
    triggerStop = false;
    /** The halt selector address, in p11 units. */
    triggerAddress = 767 * P11; // 23 31

    // ---- Decoded state of the instruction just obeyed ------------------------

    /** The source function number, p10-p6 of the instruction. */
    src = 0;
    /** The destination function number, p5-p1 of the instruction. */
    des = 0;
    /** The store address named by the instruction. */
    address = 0;
    /** The D register named by the instruction: the low four bits of the address. */
    dAddress = 0;
    /**
     * The word passing from source to destination.
     *
     * This is deliberately kept between instructions. Sources MB, MC and MD were
     * never implemented, and in the original they left this variable holding the
     * previous word, so an instruction using them passes on whatever went by
     * last. Keeping the quirk keeps programs that trip over it behaving the same.
     */
    source = 0;
    /** The five digits shown on the output register display. */
    outputRegister = 0;

    // ---- Execution state -----------------------------------------------------

    /** Set by PK: the next instruction has K added to it before it is obeyed. */
    private plusK = false;
    /** Set when the console clears S, which takes effect after this instruction. */
    private sequenceCleared = false;
    /** True when this instruction should be the last before a stop. */
    private stopFlag = false;
    /** The last sixteen instructions obeyed, most recent first. */
    readonly recent = new Int32Array(16);
    /** How many instructions have been obeyed since execution began. */
    instructionCount = 0;

    /** Figure shift state of the teleprinter and of the punch. */
    private teleprinterFigureShift = true;
    private punchFigureShift = true;
    /** Set once a primary has been read into store, or loaded by hand. */
    primaryStored = false;

    /**
     * True when the whole tape was read in as primary, so there is no second
     * stage. The rows are the program, and it has not been run yet: it must not
     * be set going as though a primary were about to read the rest of the tape.
     */
    primaryIsWholeTape = false;
    /** Cleared once the first carriage return arrives from a 5-hole program tape. */
    private bootstrap = true;
    /** Interprogram punches its 5-hole output only after its first stop code. */
    private sawStopCode = false;
    private punchingProgram = false;
    private punchChecked = false;

    // ---- Peripherals ---------------------------------------------------------

    programTape: Tape | null = null;
    dataTape: Tape | null = null;

    /** Everything sent to the teleprinter, destination OT. */
    teleprinterOutput = "";
    /** Everything sent to the punch, destination OP. */
    punchOutput = "";

    /**
     * Called when a word reaches destination P, the loudspeaker.
     *
     * CSIRAC's speaker was fed the digits of the word itself, so what you heard
     * was a pulse train: the pitch came from how often the program sent a word,
     * and the timbre from how many digits were set in it. The programming manual
     * gives the "hoot" as the two command loop `31 31 K P` / `31 30 K PS`, which
     * is a tone at one cycle per two commands.
     *
     * The word and the instruction count are both passed, so that a caller can
     * work out the pitch from the spacing rather than guessing at it.
     */
    onHoot: ((word: number, at: number) => void) | null = null;

    /**
     * How many words have gone to the loudspeaker since execution began.
     *
     * A CSIRAC program said it had finished by hooting continuously rather than
     * by stopping, so anything driving the machine unattended has to be able to
     * tell that it is hooting. Counting here rather than in `onHoot` leaves that
     * callback free for the thing actually making the sound.
     */
    hootCount = 0;

    /**
     * Called whenever a word is written to main store. Used to follow a tape
     * being read in, so that a listing can say where each row really ended up
     * rather than guessing at the primary's assembler conventions.
     */
    onStore: ((address: number, word: number) => void) | null = null;

    // ---- Set up --------------------------------------------------------------

    /**
     * Return the machine to the state described on the initial switch panel:
     * sequence register zero, all registers and (optionally) main store clear.
     * The drum is deliberately left alone, as it was on the real machine.
     */
    initialize(clearStore = true): void {
        this.readData = false;
        this.triggerStop = false;
        this.triggerAddress = 767 * P11; // 23 31
        this.oneShot = false;

        this.a = 0;
        this.b = 0;
        this.c = 0;
        this.h = 0;
        this.i = 0;
        this.k = 0;
        // NA holds 0 0 1 0, the setting a standard primary expects.
        this.na = 32;
        this.nb = 0;
        this.maLast = 0;
        this.iSwitches = 0;
        this.d.fill(0);
        if (clearStore) this.m.fill(0);
        this.s = 0;
    }

    /**
     * Prepare to start executing. The original did this once, on entry to its
     * execute loop, so these are reset when a program run begins and not when a
     * halted program is resumed.
     */
    beginExecution(): void {
        this.instructionCount = 0;
        this.hootCount = 0;
        this.teleprinterFigureShift = true;
        this.punchFigureShift = true;
        this.src = 0;
        this.des = 0;
        this.recent.fill(0);
        this.plusK = false;
        this.sequenceCleared = false;
        this.stopFlag = false;
    }

    /** Load the T001 primary and control routine into 0,0 to 0,24 by hand. */
    loadStandardPrimary(): void {
        T001_PRIMARY_AND_CONTROL.forEach((word, addr) => {
            this.m[addr] = word;
        });
        this.primaryStored = true;
    }

    /**
     * Read the primary routine from the program tape into store.
     *
     * The primary is the short bootstrap at the head of every tape. It is read in
     * by the machine's own hardware read cycle rather than by a program, so it is
     * handled here rather than as instructions. Reading stops at the first blank
     * row, which is why tapes were always assembled with a few blank rows after
     * the primary.
     *
     * This assumes NA is 0 0 1 0 and emulates the NA & S to K switch being on.
     * Muncey's non-stop primary instead needs NA set to 2 0 1 0 beforehand.
     *
     * Returns true if the tape held a second stage for the primary to read, and
     * false if what was just stored is the whole of it. See `primaryIsWholeTape`.
     */
    readPrimary(): boolean {
        const tape = this.programTape;
        if (!tape) throw new MachineError("No program tape loaded");

        // Powers of two are the lead-in diagonal punched at the head of a tape,
        // there so the operator can thread it; they are not part of the primary.
        const isLeadIn = (v: number) => v === 0 || (v <= 512 && (v & (v - 1)) === 0);

        // Skip the lead-in and store the first real row, which lands at address 0.
        do {
            if (tape.atEnd) throw new MachineError("No primary found on program tape");
            const value = tape.readRow();
            if (!isLeadIn(value)) {
                const address = (this.s | this.na) >> 10;
                this.m[address] = value;
                this.onStore?.(address, value);
                this.s += P11;
            }
        } while (this.s !== P11);

        // Then store rows until blank tape marks the end of the primary.
        for (;;) {
            if (tape.atEnd) break;
            const value = tape.readRow();
            if (value === 0) break;
            const address = (this.s | this.na) >> 10;
            this.m[address] = value;
            this.onStore?.(address, value);
            this.s += P11;
        }

        this.primaryStored = true;
        // A tape punched in the primary form has nothing after the rows just
        // stored: they are the program, not a bootstrap for reading one in.
        this.primaryIsWholeTape = tape.restIsBlank();
        return !this.primaryIsWholeTape;
    }

    // ---- Execution -----------------------------------------------------------

    /**
     * Obey one instruction.
     *
     * Returns the reason the machine should stop, or null to carry on. The one
     * shot switch, the halt selector and the T destination all stop the machine
     * *after* the current instruction has been obeyed, as the programming manuals
     * describe.
     */
    step(): StopReason | null {
        // Fetch. The sequence register holds the address in p11 units.
        let instruction = toWord(this.m[this.s >> 10]);
        // A preceding PK asks for K to be added to this instruction, which is how
        // CSIRAC did indexed addressing.
        if (this.plusK) instruction = toWord(instruction + this.k);
        this.plusK = false;

        this.recent.copyWithin(1, 0, 15);
        this.recent[0] = instruction;

        // The interpreter register holds whatever is actually obeyed. The console
        // switches can substitute the number registers for the fetched word, which
        // is how an operator hand-executed an instruction.
        if (this.naAndSToK) this.k = this.na | this.s;
        else if (this.naToK) this.k = this.na;
        else this.k = instruction;

        const addressHigh = (this.k >> 15) & 0x1f;
        const addressLow = (this.k >> 10) & 0x1f;
        this.src = (this.k >> 5) & 0x1f;
        this.des = this.k & 0x1f;
        this.address = fromScale32(addressHigh, addressLow);
        // A D register is named by the low four bits of the address digits.
        this.dAddress = addressLow & 0xf;

        // The halt selector compares against S before it is stepped on.
        this.stopFlag = this.triggerStop && this.triggerAddress === this.s;

        // Step the sequence register on. Store above 24,0 does not exist, so the
        // register carries round to zero there rather than at the top of its range.
        this.s = toWord(this.s + P11);
        if (this.s >> 10 > fromScale32(24, 0)) this.s = 0;

        this.source = toWord(this.readSource());
        this.writeDestination(this.source);

        this.instructionCount++;

        // Clearing S from the console takes effect once the current instruction
        // has finished, so the instruction it interrupted is not obeyed twice.
        if (this.sequenceCleared) {
            this.sequenceCleared = false;
            this.s = 0;
            this.plusK = false;
        }

        if (this.stopFlag) {
            this.stopFlag = false;
            return this.des === 31 ? "stop-instruction" : "trigger-stop";
        }
        if (this.oneShot) return "one-shot";
        return null;
    }

    /** Clear the sequence register from the console. */
    clearSequence(): void {
        this.s = 0;
        this.sequenceCleared = true;
    }

    /** The word offered by the selected source gate. */
    private readSource(): number {
        switch (this.src) {
            case 0: // M - a word from main store
                return this.m[this.address];
            case 1: // I - the input register, refilled from the tape reader
                return this.readInputRegister();
            case 2: // NA
                return this.na;
            case 3: // NB
                return this.nb;
            case 4: // A
                return this.a;
            case 5: // SA - the sign of A alone
                return this.a & P20 ? P20 : 0;
            case 6: // HA - half A, shifted right with the sign preserved
                return this.a & P20 ? (this.a >> 1) | P20 : this.a >> 1;
            case 7: // TA - twice A
                return this.a << 1;
            case 8: // LA - the least significant digit of A
                return this.a & 1 ? P1 : 0;
            case 9: {
                // CA - A, and clear A as it is read
                const value = this.a;
                this.a = 0;
                return value;
            }
            case 10: // ZA - zero if A is zero, otherwise one
                return this.a === 0 ? 0 : P1;
            case 11: // B
                return this.b;
            case 12: // R - the sign of B, as a one in p1
                return this.b & P20 ? P1 : 0;
            case 13: // RB - B shifted right
                return this.b >> 1;
            case 14: // C
                return this.c;
            case 15: // SC - the sign of C alone
                return this.c & P20 ? P20 : 0;
            case 16: // RC - C shifted right
                return this.c >> 1;
            case 17: // D
                return this.d[this.dAddress];
            case 18: // SD - the sign of the D register alone
                return this.d[this.dAddress] & P20 ? P20 : 0;
            case 19: // RD - the D register shifted right
                return this.d[this.dAddress] >> 1;
            case 20: // Z - zero
                return 0;
            case 21: // HL - H in the low half
                return this.h;
            case 22: // HU - H in the upper half
                return this.h << 10;
            case 23: // S - the sequence register
                return this.s;
            case 24: // PE - a one in p11
                return P11;
            case 25: // PL - a one in p1
                return P1;
            case 26: // K - the address digits of the interpreter register
                return this.k & 0xffc00;
            case 27: // MA - a word from the drum
                return this.ma[this.address];
            case 31: // PS - a one in p20
                return P20;
            default:
                // MB, MC and MD were never built. See the note on `source`.
                return this.source;
        }
    }

    /**
     * Refill the input register from whichever reader is selected, and offer its
     * previous contents as the source.
     *
     * The order matters: the value already in the register is what the
     * instruction receives, and only then is the next row or character read. A
     * program therefore reads one row behind the tape position, which is what
     * lets a primary read itself in.
     */
    /**
     * Which tape the I gate will actually take its next row from.
     *
     * The two reader switches are not independent, and `readInputRegister` below
     * is where that shows. `readData` decides between the program and the data
     * tape only on the 12-hole reader: **selecting the 5-hole reader with a data
     * tape mounted reads the data tape whatever `readData` says**, because the
     * second branch tests `reader5Hole && dataTape` and never looks at it. That
     * is CSIRACEM's behaviour, not a simplification — `CSIRACEM.PAS` has the
     * same `if read5 and dexist` ahead of its `if ReadData` — and John Spencer's
     * own screen for reading in another program labels the selector "5 HOLE
     * reading DATA / 12 HOLE reading PROGRAM" on the strength of it.
     *
     * The console has to say what the machine will really do rather than what
     * the switch is set to, so the rule lives here, next to the branches it
     * describes, rather than being worked out again in the display.
     */
    /**
     * Choose which tape is read, and set the reader to match it.
     *
     * The console switch selects the reader, not the tape: sections 4.2 and 4.10
     * of the programming manual both say so. What the machine had no switch for
     * is which *tape* is being read, because that was a matter of threading one
     * into a reader by hand. An emulator cannot thread tape, so choosing the
     * tape is the operator's action and the reader follows it — and how many
     * holes a tape has is a property of the tape, so there is nothing to decide.
     *
     * This is the machine's own rule rather than the console's, because both the
     * console and the Interprogram procedure work the same switch and must not
     * be able to disagree about where it ends up. An empty reader keeps the
     * selector where it is; there is no tape in it to take the setting from.
     */
    readFrom(data: boolean): void {
        this.readData = data;
        const tape = data ? this.dataTape : this.programTape;
        if (tape) this.reader5Hole = !looksLikeTwelveHole(tape.punched);
    }

    get readingDataTape(): boolean {
        if (this.reader5Hole && !this.primaryStored && !this.readData) return false;
        if (this.reader5Hole && this.dataTape) return true;
        return this.readData;
    }

    private readInputRegister(): number {
        const value = this.i | this.iSwitches;

        if (this.reader5Hole && !this.primaryStored && !this.readData) {
            // A 5-hole program tape, being read in for the first time.
            const tape = this.requireTape(this.programTape, "program");
            this.i = tape.readProgramChar();
            // Reading stops at the first carriage return so the operator can take over.
            if (this.bootstrap && this.i === FLEX_CARRIAGE_RETURN) {
                this.bootstrap = false;
                this.stopFlag = true;
            }
            return value;
        }

        if (this.reader5Hole && this.dataTape) {
            // A 5-hole data tape. Here the freshly read character is the source,
            // because the shift characters the reader inserts must not be delayed.
            this.i = this.dataTape.readDataChar();
            return this.i | this.iSwitches;
        }

        if (this.readData) {
            // A 12-hole data tape.
            this.i = this.dataTape ? this.dataTape.readRow() : 0;
            return value;
        }

        // A 12-hole program tape.
        const tape = this.requireTape(this.programTape, "program");
        if (tape.atEnd) {
            throw new MachineError("Unexpected End of File - probably missing DO, or no blank rows at end of tape");
        }
        if (!this.reader5Hole) this.i = tape.readRow();
        return value;
    }

    private requireTape(tape: Tape | null, which: string): Tape {
        if (!tape) throw new MachineError(`No ${which} tape in the reader`);
        return tape;
    }

    /** Send the word to the selected destination gate. */
    private writeDestination(word: number): void {
        switch (this.des) {
            case 0: // M - store a word in main store
                this.m[this.address] = word;
                this.onStore?.(this.address, word);
                break;
            case 1: // Q - no effect
                break;
            case 2: // OT - the teleprinter
                this.writeTeleprinter(word);
                break;
            case 3: // OP - the punch
                this.writePunch(word);
                break;
            case 4: // A - replace A
                this.a = word;
                break;
            case 5: // PA - add to A
                this.a = toWord(toSigned(this.a) + toSigned(word));
                break;
            case 6: // SA - subtract from A
                // Subtracting -1 from zero cannot be represented, so it stands as -1.
                this.a = word === P20 && this.a === 0 ? P20 : toWord(toSigned(this.a) - toSigned(word));
                break;
            case 7: // CA - collate: logical AND into A
                this.a = toWord(this.a & word);
                break;
            case 8: // DA - disjunction: logical OR into A
                this.a = toWord(this.a | word);
                break;
            case 9: // NA - non-equivalence: exclusive OR into A
                this.a = toWord(this.a ^ word);
                break;
            case 10: // P - the loudspeaker
                if (word !== 0) {
                    this.hootCount++;
                    this.onHoot?.(word, this.instructionCount);
                }
                break;
            case 11: // B - replace B
                this.b = word;
                break;
            case 12: // XB - multiply C by the word, into A and B
                this.multiply(word);
                break;
            case 13: // L - left shift A and B
                this.leftShift(toWord(word | (this.k & 0xffc00)));
                break;
            case 14: // C - replace C
                this.c = word;
                break;
            case 15: // PC - add to C
                this.c = toWord(toSigned(this.c) + toSigned(word));
                break;
            case 16: // SC - subtract from C
                this.c = word === P20 && this.c === 0 ? P20 : toWord(toSigned(this.c) - toSigned(word));
                break;
            case 17: // D - replace a D register
                this.d[this.dAddress] = word;
                break;
            case 18: // PD - add to a D register
                this.d[this.dAddress] = toWord(toSigned(this.d[this.dAddress]) + toSigned(word));
                break;
            case 19: // SD - subtract from a D register
                this.d[this.dAddress] =
                    word === P20 && this.d[this.dAddress] === 0
                        ? P20
                        : toWord(toSigned(this.d[this.dAddress]) - toSigned(word));
                break;
            case 20: // Z - no effect
                break;
            case 21: // HL - the low ten digits into H
                this.h = word & 0x3ff;
                break;
            case 22: // HU - the upper ten digits into H
                this.h = (word & 0xffc00) >> 10;
                break;
            case 23: // S - jump, by replacing the sequence register
                this.s = word;
                break;
            case 24: // PS - relative jump, by adding to the sequence register
                this.s = toWord(this.s + word);
                if (this.s >> 10 > fromScale32(24, 0)) {
                    throw new MachineError("S out of range - machine halted");
                }
                break;
            case 25: // CS - conditional jump, stepping S on for each non-zero half
                if ((word & 0x7ff) !== 0) this.s = toWord(this.s + P11);
                if ((word & 0xfc000) !== 0) this.s = toWord(this.s + P11);
                break;
            case 26: // PK - load K, and add it to the next instruction
                this.k = word;
                this.plusK = true;
                break;
            case 27: // MA - store a word on the drum
                this.ma[this.address] = word;
                this.drumWritten = true;
                this.maLast = word;
                break;
            case 28: // MB
            case 29: // MC
            case 30: // MD
                // Never implemented.
                break;
            case 31: // T - stop the machine if the word is non-zero
                this.stopFlag = word !== 0;
                break;
        }
    }

    // ---- Arithmetic ----------------------------------------------------------

    /**
     * Multiply C by the word, adding the top half of the product to A and
     * leaving the bottom half in B.
     *
     * CSIRAC formed the product by repeated addition, and this follows the same
     * shift-and-add, including its handling of -1, which has no positive
     * counterpart in a 20-bit fraction.
     */
    private multiply(word: number): void {
        let high = 0;
        let low = 0;

        if (word === 0 || this.c === 0) {
            // Nothing to do.
        } else if (word === P20 && this.c === P20) {
            // (-1) x (-1) cannot be represented, and comes out as -1.
            high = P20;
        } else if (word === P20) {
            high = toWord(-this.c);
        } else if (this.c === P20) {
            high = toWord(-word);
        } else {
            const wordNegative = (word & P20) !== 0;
            const cNegative = (this.c & P20) !== 0;

            // Work with magnitudes, and put the sign back afterwards.
            low = wordNegative ? toWord(-word) : word;
            const multiplicand = cNegative ? toWord(-this.c) : this.c;

            for (let j = 1; j <= 19; j++) {
                if (low & 1) high += multiplicand;
                const carry = high & 1;
                high >>= 1;
                low >>= 1;
                if (carry) low += P20;
            }

            if (wordNegative !== cNegative) {
                low = toWord(-low);
                if (low !== 0) high += P1;
                high = toWord(-high) | P20;
            }
        }

        this.b = low & 0xffffe; // p1 of B is always left clear by a multiplication
        this.a = toWord(this.a + high);
    }

    /**
     * Shift A and B left as one 40-digit number.
     *
     * The shift only happens if p20 of the shift word is set; p14-p11 give the
     * number of half-shifts, so an odd count exchanges A and B. A count of 14 or
     * 15 means eight whole shifts, which leaves A and B where they started.
     */
    private leftShift(shiftWord: number): void {
        if ((shiftWord & P20) === 0) return;

        const halfShifts = (shiftWord >> 10) & 0xf;
        let shiftedA = this.a;
        let shiftedB = this.b;
        let carryIn: number;

        if (halfShifts <= 13) {
            carryIn = this.a & P20 ? 1 : 0;
            for (let j = 0; j <= Math.floor(halfShifts / 2); j++) {
                const fromA = carryIn;
                carryIn = this.a & P20 ? 1 : 0;
                const fromB = this.b & P20 ? 1 : 0;
                shiftedB = toWord((this.b << 1) + fromA);
                shiftedA = toWord((this.a << 1) + fromB);
                this.a = shiftedA;
                this.b = shiftedB;
            }
        } else {
            carryIn = shiftedA & P20 ? 1 : 0;
        }

        // A half shift leaves A and B holding the 2(B) and (A) of the even count
        // below it.
        if (halfShifts % 2 === 1) {
            this.b = shiftedA;
            this.a = toWord((shiftedB << 1) + carryIn);
        }
    }

    // ---- Output --------------------------------------------------------------

    /**
     * The five digits the output register presents to a peripheral: p1-p5 and
     * p11-p15 of the word, brought together.
     */
    private outputCode(word: number): number {
        return (word & 0x1f) | ((word & 0x7c00) >> 10);
    }

    /** Destination OT: print a character on the teleprinter. */
    private writeTeleprinter(word: number): void {
        const code = this.outputCode(word);
        this.outputRegister = code;

        if (code <= 26) {
            this.teleprinterOutput += this.teleprinterFigureShift
                ? TELEPRINTER_FIGURES[code]
                : TELEPRINTER_LETTERS[code];
            return;
        }
        switch (code) {
            case TELEPRINTER_FIGURE_SHIFT:
                this.teleprinterFigureShift = true;
                this.teleprinterOutput += " ";
                break;
            case TELEPRINTER_LETTER_SHIFT:
                this.teleprinterFigureShift = false;
                this.teleprinterOutput += " ";
                break;
            case TELEPRINTER_LINE_FEED:
                this.teleprinterOutput += "\n ";
                break;
            case TELEPRINTER_CARRIAGE_RETURN:
                this.teleprinterOutput += "\r";
                break;
            case TELEPRINTER_BLANK:
                this.teleprinterOutput += " ";
                break;
        }
    }

    /** Destination OP: punch a row, or print a character via the Flexowriter. */
    private writePunch(word: number): void {
        // Interprogram is recognised by the two words it keeps at 11,0 and 11,1.
        // When it is running, its 5-hole output is punched as a program tape.
        if (!this.punchChecked) {
            this.punchChecked = true;
            this.punchingProgram =
                this.m[INTERPROGRAM_PROBE.at] === INTERPROGRAM_PROBE.first &&
                this.m[INTERPROGRAM_PROBE.at + 1] === INTERPROGRAM_PROBE.second;
        }

        const code = this.outputCode(word);

        if (this.punchingProgram && this.sawStopCode) {
            this.outputRegister = code;
            this.punchOutput += FLEXOWRITER_TO_ASCII[code];
            return;
        }

        if (this.punch5Hole) {
            this.outputRegister = code;
            if (code <= 26) {
                const ch = this.punchFigureShift ? FLEXOWRITER_FIGURES[code] : FLEXOWRITER_LETTERS[code];
                this.punchOutput += ch;
                // Interprogram signals the end of its own output with the stop code.
                this.sawStopCode = FLEXOWRITER_FIGURES[code] === "s";
                return;
            }
            switch (code) {
                case FLEX_FIGURE_SHIFT:
                    this.punchFigureShift = true;
                    break;
                case FLEX_SPACE:
                    this.punchOutput += " ";
                    break;
                case FLEX_CARRIAGE_RETURN:
                    this.punchOutput += "\n";
                    break;
                case FLEX_LETTER_SHIFT:
                    this.punchFigureShift = false;
                    break;
                case FLEX_ERASE:
                    break;
            }
            return;
        }

        // The 12-hole punch writes whole rows, in the format the reader accepts.
        this.outputRegister = code;
        this.punchOutput += formatRow(word) + "\n";
    }

    // ---- Console readouts ----------------------------------------------------

    /** The mnemonic pair for the instruction just obeyed, e.g. "PL T". */
    get lastInstructionMnemonic(): string {
        return `${SOURCE_MNEMONICS[this.src]} ${DESTINATION_MNEMONICS[this.des]}`;
    }

    /**
     * Produce a tape symbol print (TSP) of a range of store: the listing form
     * CSIRAC programmers read their programs in.
     */
    tsp(start: number, finish: number, fromDrum = false): string {
        const store = fromDrum ? this.ma : this.m;
        const lines: string[] = [];
        for (let n = start; n <= finish && n < STORE_WORDS; n++) {
            const word = toWord(store[n]);
            const addressHigh = (word & 0x000f8000) >> 15;
            const addressLow = (word & 0x00007c00) >> 10;
            const src = (word & 0x000003e0) >> 5;
            const des = word & 0x0000001f;
            const high = Math.floor(n / 32);
            const low = n - 32 * high;

            const location = String(high).padStart(2, " ") + String(low).padStart(3, " ");
            let operand: string;
            if (addressHigh === 0 && addressLow === 0) operand = " ".repeat(9);
            else if (addressHigh === 0) operand = " ".repeat(6) + String(addressLow).padStart(3, " ");
            else operand = String(addressHigh).padStart(6, " ") + String(addressLow).padStart(3, " ");

            lines.push(
                location +
                    operand +
                    SOURCE_MNEMONICS[src].padStart(3, " ") +
                    DESTINATION_MNEMONICS[des].padStart(3, " "),
            );
        }
        return lines.join("\n") + "\n";
    }
}

export { TapeError };
