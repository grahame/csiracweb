/**
 * Turning machine state into the text the console showed.
 */

import { P20, toSigned } from "./word";

/**
 * Normalise a printer stream for display.
 *
 * The teleprinter sends carriage return and line feed as separate codes, and
 * the emulator records both, so a program that sends them in either order or
 * only one of them still reads correctly on screen.
 */
export function renderPrinterText(raw: string): string {
    return raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * A word read as a fraction, with the binary point between p20 and p19.
 * The original printed these to six places, and so do we.
 */
export function formatFraction(word: number): string {
    const value = toSigned(word) / P20;
    return value.toFixed(6);
}

/** A word read as an integer, with the binary point to the right of p1. */
export function formatInteger(word: number): string {
    return String(toSigned(word));
}
