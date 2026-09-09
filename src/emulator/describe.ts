/**
 * Saying in English what an instruction does.
 *
 * CSIRAC has no opcodes. An instruction names a source and a destination, and
 * obeying it moves a word from the one to the other; the arithmetic happens
 * because some destinations add or subtract rather than replace. That is a
 * lovely idea but it makes a listing hard to read until you know all 64 gates,
 * so this turns each one back into a sentence.
 */

import { DESTINATION_MNEMONICS, SOURCE_MNEMONICS } from "./codes";
import { toScale32 } from "./word";

export interface Instruction {
    /** The p10-p6 source function number. */
    source: number;
    /** The p5-p1 destination function number. */
    destination: number;
    /** The store address named by the instruction, 0..1023. */
    address: number;
}

/** An address as CSIRAC programmers wrote it, e.g. "9 12". */
export function addressText(address: number): string {
    const [high, low] = toScale32(address);
    return `${high} ${low}`;
}

/**
 * The D register an instruction names.
 *
 * The address is a pair of scale-32 digits, and the machine takes the low four
 * bits of the *second* of them, so address 30 0 names D0 and address 0 30
 * names D14.
 */
export function dRegisterOf(address: number): number {
    return address & 0xf;
}

/**
 * A phrase for what the source gate offers, e.g. "the accumulator" or
 * "the word in store at 9 12".
 */
function sourcePhrase({ source, address }: Instruction): string {
    const at = addressText(address);
    const d = dRegisterOf(address);
    switch (source) {
        case 0:
            return `the word in store at ${at}`;
        case 1:
            return "the input register, refilled from the tape reader";
        case 2:
            return "the NA number register";
        case 3:
            return "the NB number register";
        case 4:
            return "the accumulator";
        case 5:
            return "the sign of the accumulator alone";
        case 6:
            return "half the accumulator";
        case 7:
            return "twice the accumulator";
        case 8:
            return "the least significant digit of the accumulator";
        case 9:
            return "the accumulator, clearing it as it is read";
        case 10:
            return "zero if the accumulator is zero, otherwise one";
        case 11:
            return "the auxiliary accumulator B";
        case 12:
            return "the sign of B, as a one in p1";
        case 13:
            return "B shifted one place right";
        case 14:
            return "the multiplier register C";
        case 15:
            return "the sign of C alone";
        case 16:
            return "C shifted one place right";
        case 17:
            return `register D${d}`;
        case 18:
            return `the sign of D${d} alone`;
        case 19:
            return `D${d} shifted one place right`;
        case 20:
            return "zero";
        case 21:
            return "the half register H";
        case 22:
            return "the half register H, moved to the upper half of the word";
        case 23:
            return "the sequence register";
        case 24:
            return "a one in p11";
        case 25:
            return "a one in p1";
        case 26:
            return "the address digits of the interpreter register K";
        case 27:
            return `the word on the drum at ${at}`;
        case 31:
            return "a one in p20";
        default:
            return "nothing: this source was never built";
    }
}

/** A phrase for what the destination gate does with the word. */
function destinationPhrase({ destination, address }: Instruction): string {
    const at = addressText(address);
    const d = dRegisterOf(address);
    switch (destination) {
        case 0:
            return `store it at ${at}`;
        case 1:
            return "discard it";
        case 2:
            return "print it on the teleprinter";
        case 3:
            return "punch it";
        case 4:
            return "put it in the accumulator";
        case 5:
            return "add it to the accumulator";
        case 6:
            return "subtract it from the accumulator";
        case 7:
            return "collate it into the accumulator (logical and)";
        case 8:
            return "disjoin it into the accumulator (logical or)";
        case 9:
            return "non-equivalence it into the accumulator (exclusive or)";
        case 10:
            return "send it to the loudspeaker";
        case 11:
            return "put it in B";
        case 12:
            return "multiply C by it, the product going to A and B";
        case 13:
            return "shift A and B left by the number of places it names";
        case 14:
            return "put it in C";
        case 15:
            return "add it to C";
        case 16:
            return "subtract it from C";
        case 17:
            return `put it in D${d}`;
        case 18:
            return `add it to D${d}`;
        case 19:
            return `subtract it from D${d}`;
        case 20:
            return "discard it";
        case 21:
            return "put it in the low half of H";
        case 22:
            return "put its upper half in H";
        case 23:
            return "put it in the sequence register, so jump there";
        case 24:
            return "add it to the sequence register, so jump forward";
        case 25:
            return "step the sequence register on once for each half of it that is not zero";
        case 26:
            return "put it in the interpreter register K, and add K to the next instruction";
        case 27:
            return `write it to the drum at ${at}`;
        case 31:
            return "stop the machine if it is not zero";
        default:
            return "do nothing: this destination was never built";
    }
}

/**
 * Idioms worth naming. A CSIRAC programmer read these as single acts rather
 * than as a transfer, and a listing is much easier to follow when they are
 * called by name.
 */
function idiom(instruction: Instruction): string | null {
    const { source, destination, address } = instruction;
    const at = addressText(address);

    if (destination === 31) {
        if (source === 25 || source === 31) return "Stop the machine.";
        if (source === 20) return "Carry on: a stop instruction sent zero, so nothing happens.";
        return null;
    }
    if (source === 20 && destination === 23) return "Jump to 0 0.";
    if (source === 0 && destination === 23) return `Jump to the address held in store at ${at}.`;
    if (source === 23 && destination === 0) return `Store the sequence register at ${at}, recording where we are.`;
    if (source === 9 && destination === 0) return `Store the accumulator at ${at} and clear it.`;
    if (source === 0 && destination === 4) return `Load the accumulator from store at ${at}.`;
    if (source === 4 && destination === 0) return `Store the accumulator at ${at}.`;
    if (source === 1 && destination === 17) {
        return `Read the next row from the tape into D${dRegisterOf(address)}.`;
    }
    if (source === 18 && destination === 25) {
        return `Skip the next instruction unless D${dRegisterOf(address)} is negative: a conditional jump.`;
    }
    if (source === 5 && destination === 25) {
        return "Skip the next instruction unless the accumulator is negative: a conditional jump.";
    }
    if (source === 10 && destination === 25) {
        return "Skip the next instruction if the accumulator is zero: a conditional jump.";
    }
    return null;
}

/** The mnemonic pair as a listing writes it, e.g. "PL  T". */
export function mnemonicOf({ source, destination }: Instruction): string {
    return `${SOURCE_MNEMONICS[source]} ${DESTINATION_MNEMONICS[destination]}`;
}

/**
 * One sentence saying what the instruction does. Where the pair is a
 * recognised idiom the idiom is given as well, because that is how the
 * instruction was actually read.
 */
export function describeInstruction(instruction: Instruction): string {
    const literal = `Take ${sourcePhrase(instruction)} and ${destinationPhrase(instruction)}.`;
    const named = idiom(instruction);
    return named ? `${named} ${literal}` : literal;
}

/** Decode a 20-bit word as an instruction. */
export function decodeInstruction(word: number): Instruction {
    return {
        address: (word >> 10) & 0x3ff,
        source: (word >> 5) & 0x1f,
        destination: word & 0x1f,
    };
}
