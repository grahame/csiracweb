/**
 * CSIRAC words and addresses.
 *
 * CSIRAC was a 20-bit machine. A word is held here in the low 20 bits of a
 * JavaScript number, exactly as the original Turbo Pascal emulator held it in
 * the low 20 bits of a 32-bit Longint.
 *
 * Bits are named after their weight in the CSIRAC literature: p1 is the least
 * significant bit and p20 the most significant. When a word is read as a
 * fraction the binary point sits between p20 and p19, so p20 is the sign bit
 * and values run over -1 <= x < 1. When it is read as an integer the binary
 * point sits to the right of p1, giving -524288 <= n < 524288.
 */

/** Bit weights, using the CSIRAC naming. */
export const P1 = 1;
export const P11 = 1024;
export const P19 = 262144;
export const P20 = 524288;

/** A word is 20 bits, so there are 2^20 distinct values. */
export const WORD_VALUES = 1048576;
/** Mask selecting the 20 bits of a word. */
export const WORD_MASK = 0xfffff;

/** Main store (M) and auxiliary drum store (MA) each hold 1024 words. */
export const STORE_WORDS = 1024;

/**
 * Truncate to a 20-bit CSIRAC word, discarding any overcarry beyond p20.
 * The Pascal original called this LtoC (Longint to CSIRAC).
 */
export function toWord(n: number): number {
    return n & WORD_MASK;
}

/**
 * Read a CSIRAC word as a signed integer, -524288 <= n < 524288.
 * The Pascal original called this CtoL (CSIRAC to Longint): it sign-extended
 * p20 across the upper bits of the Longint.
 */
export function toSigned(w: number): number {
    return w & P20 ? (w & WORD_MASK) - WORD_VALUES : w & WORD_MASK;
}

/**
 * Read a CSIRAC word as a fraction, -1 <= x < 1, with the binary point
 * between p20 and p19.
 */
export function toFraction(w: number): number {
    return toSigned(w) / P20;
}

/**
 * Scale 32.
 *
 * Twenty binary digits are unwieldy to write, so a word was split into four
 * groups of five and each group written as the decimal number it makes, 0 to
 * 31. Section 1.3 of the programming manual: "each group of five binary digits
 * is replaced by the equivalent decimal integer, producing the '32 scale'
 * representation. Thus the binary number 01001 10011 00110 11011 has the
 * symbol 9,19,6,27."
 *
 * It is base 32 in ordinary numerals, and the four digits are worth 32768,
 * 1024, 32 and 1. Each is named after the bit it starts at, p16, p11, p6 and
 * p1, which is what the console means by "P6 units": the digit worth 32.
 *
 * Addresses are quoted as a pair of these, so store address 300 is "9 12".
 * Registers holding an address hold it in p11 units, shifted left ten places.
 */
export function fromScale32(high: number, low: number): number {
    return 32 * high + low;
}

/** Split a 0..1023 value into its pair of scale-32 digits. */
export function toScale32(value: number): [number, number] {
    const high = Math.floor(value / 32);
    return [high, value - 32 * high];
}

/**
 * Split a whole 20-bit register into the four scale-32 digits used on the
 * console, e.g. NA is set and displayed as "0 0 1 0". The first pair is the
 * address part (p11-p20), the second pair the p1-p10 part.
 */
export function toScale32Quad(w: number): [number, number, number, number] {
    const [a, b] = toScale32((w >> 10) & 0x3ff);
    const [c, d] = toScale32(w & 0x3ff);
    return [a, b, c, d];
}

/** Assemble a 20-bit register from the four scale-32 digits used on the console. */
export function fromScale32Quad(a: number, b: number, c: number, d: number): number {
    return toWord(fromScale32(a, b) * P11 + fromScale32(c, d));
}

/**
 * A word as binary digits in the groups of five the console used, most
 * significant (p20) first.
 */
export function toBinaryGroups(w: number, digits = 20): string {
    const groups: string[] = [];
    for (let start = digits - 1; start >= 0; start -= 5) {
        let group = "";
        for (let bit = start; bit > start - 5 && bit >= 0; bit--) group += w & (1 << bit) ? "1" : "0";
        groups.push(group);
    }
    return groups.join(" ");
}
