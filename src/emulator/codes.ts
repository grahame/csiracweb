/**
 * Instruction mnemonics and peripheral character codes.
 *
 * A CSIRAC instruction word packs an address and a pair of five-bit function
 * numbers: p20-p16 and p15-p11 are the two scale-32 address digits, p10-p6
 * select the source (where the word comes from) and p5-p1 the destination
 * (where it goes). Nearly every instruction is read as "source to destination",
 * which is why the machine has no conventional opcode list.
 */

/** Source (input gate) mnemonics, indexed by the p10-p6 function number. */
export const SOURCE_MNEMONICS = [
    " M",
    " I",
    "NA",
    "NB",
    " A",
    "SA",
    "HA",
    "TA",
    "LA",
    "CA",
    "ZA",
    " B",
    " R",
    "RB",
    " C",
    "SC",
    "RC",
    " D",
    "SD",
    "RD",
    " Z",
    "HL",
    "HU",
    " S",
    "PE",
    "PL",
    " K",
    "MA",
    "MB",
    "MC",
    "MD",
    "PS",
] as const;

/** Destination (output gate) mnemonics, indexed by the p5-p1 function number. */
export const DESTINATION_MNEMONICS = [
    " M",
    " Q",
    "OT",
    "OP",
    " A",
    "PA",
    "SA",
    "CA",
    "DA",
    "NA",
    " P",
    " B",
    "XB",
    " L",
    " C",
    "PC",
    "SC",
    " D",
    "PD",
    "SD",
    " Z",
    "HL",
    "HU",
    " S",
    "PS",
    "CS",
    "PK",
    "MA",
    "MB",
    "MC",
    "MD",
    " T",
] as const;

/**
 * Look up a source mnemonic, e.g. "PL" or " M". A plain number in 0..31 is
 * also accepted, which is how the original let an operator key in a function
 * that has no mnemonic.
 */
export function decodeSource(text: string): number | null {
    return decodeMnemonic(text, SOURCE_MNEMONICS);
}

/** Look up a destination mnemonic, e.g. "T" or "OT". */
export function decodeDestination(text: string): number | null {
    return decodeMnemonic(text, DESTINATION_MNEMONICS);
}

function decodeMnemonic(text: string, table: readonly string[]): number | null {
    const wanted = text.trim().toUpperCase();
    const index = table.findIndex((entry) => entry.trim() === wanted);
    if (index >= 0) return index;
    if (/^\d+$/.test(wanted)) {
        const value = Number(wanted);
        if (value >= 0 && value < 32) return value;
    }
    return null;
}

/**
 * Teleprinter (destination OT) codes, letter shift.
 * The teleprinter used a five-bit code with two shifts, so codes 0..26 mean
 * one thing in letter shift and another in figure shift.
 */
export const TELEPRINTER_LETTERS = [
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
    "G",
    "H",
    "I",
    "J",
    "K",
    "L",
    "M",
    "N",
    "O",
    "P",
    "Q",
    "R",
    "S",
    "T",
    "U",
    "V",
    "W",
    "X",
    "Y",
    "Z",
    " ",
] as const;

/**
 * Teleprinter codes, figure shift. The Greek letters were genuinely on the
 * CSIRAC teleprinter; the DOS emulator had to drop three of them because they
 * were not in IBM code page 437, and we keep those as spaces so that output
 * lines up with the original.
 */
export const TELEPRINTER_FIGURES = [
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "+",
    "-",
    ".",
    ")",
    "(",
    "i",
    "j",
    "k",
    "φ",
    "Φ",
    " ",
    "Θ",
    "Ω",
    "Γ",
    "π",
    "Σ",
    " ",
] as const;

/** Flexowriter (destination OP with the 5-hole punch) codes, letter shift. */
export const FLEXOWRITER_LETTERS = [
    "\0",
    "Q",
    "W",
    "C",
    "R",
    "K",
    "L",
    "U",
    "I",
    "D",
    "V",
    "A",
    "F",
    "M",
    "G",
    "N",
    "P",
    "J",
    "H",
    "E",
    "B",
    "T",
    "Y",
    "S",
    "X",
    "O",
    "Z",
] as const;

/** Flexowriter codes, figure shift. */
export const FLEXOWRITER_FIGURES = [
    "\0",
    "1",
    "2",
    "*",
    "4",
    "(",
    ")",
    "7",
    "8",
    "#",
    "=",
    "-",
    "&",
    ".",
    "\t",
    ",",
    "0",
    "s",
    "£",
    "3",
    "'",
    "5",
    "6",
    "/",
    "x",
    "9",
    "+",
] as const;

/**
 * Codes 27 to 31 are not printable characters but control the machine at the
 * far end. The teleprinter and the Flexowriter do not agree on what they mean,
 * so each device has its own set of names.
 */

/** Teleprinter (destination OT) control codes. */
export const TELEPRINTER_FIGURE_SHIFT = 27;
export const TELEPRINTER_LETTER_SHIFT = 28;
export const TELEPRINTER_LINE_FEED = 29;
export const TELEPRINTER_CARRIAGE_RETURN = 30;
export const TELEPRINTER_BLANK = 31;

/** Flexowriter and 5-hole tape control codes. */
export const FLEX_FIGURE_SHIFT = 27;
export const FLEX_SPACE = 28;
export const FLEX_CARRIAGE_RETURN = 29;
export const FLEX_LETTER_SHIFT = 30;
export const FLEX_ERASE = 31;

/**
 * ASCII to Flexowriter code, as used when a text file stands in for a 5-hole
 * paper tape. Letters and figures share codes, so both spellings map to the
 * same number and the shift state decides how it prints.
 *
 * A few letters are given special meanings so that a plain text file can
 * express things a tape could: `b` is blank tape, `f` figure shift, `l` letter
 * shift, `s` the stop code and `t` a tab.
 */
export const ASCII_TO_FLEXOWRITER: ReadonlyMap<string, number> = new Map([
    ["b", 0],
    ["\0", 0],
    ["1", 1],
    ["Q", 1],
    ["2", 2],
    ["W", 2],
    ["*", 3],
    ["C", 3],
    ["4", 4],
    ["R", 4],
    ["(", 5],
    ["K", 5],
    [")", 6],
    ["L", 6],
    ["7", 7],
    ["U", 7],
    ["8", 8],
    ["I", 8],
    ["#", 9],
    ["D", 9],
    ["=", 10],
    ["V", 10],
    ["-", 11],
    ["A", 11],
    ["&", 12],
    ["F", 12],
    [".", 13],
    ["M", 13],
    ["\t", 14],
    ["G", 14],
    [",", 15],
    ["N", 15],
    ["0", 16],
    ["P", 16],
    ["s", 17],
    ["J", 17],
    ["£", 18],
    ["H", 18],
    ["3", 19],
    ["E", 19],
    ["'", 20],
    ["B", 20],
    ["5", 21],
    ["T", 21],
    ["6", 22],
    ["Y", 22],
    ["/", 23],
    ["S", 23],
    ["x", 24],
    ["X", 24],
    ["9", 25],
    ["O", 25],
    ["+", 26],
    ["Z", 26],
    ["f", FLEX_FIGURE_SHIFT],
    [" ", FLEX_SPACE],
    ["\r", FLEX_CARRIAGE_RETURN],
    ["l", FLEX_LETTER_SHIFT],
]);

/**
 * Flexowriter code back to the ASCII stand-in, used when punching a 5-hole
 * program tape. This is the inverse of the table above.
 */
export const FLEXOWRITER_TO_ASCII: readonly string[] = [
    "b",
    "1",
    "2",
    "*",
    "4",
    "(",
    ")",
    "7",
    "8",
    "#",
    "=",
    "-",
    "&",
    ".",
    "t",
    ",",
    "0",
    "s",
    "p",
    "3",
    "'",
    "5",
    "6",
    "/",
    "x",
    "9",
    "+",
    "f",
    " ",
    "\r",
    "l",
    "e",
];

/**
 * Characters that mean "we are in figure shift" when reading a 5-hole data
 * tape, so that a shift can be inserted automatically if the tape does not
 * carry one. `t` is not included: a literal tab is used for that code.
 */
export const FIGURE_SHIFT_CHARS = new Set([
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "*",
    "(",
    ")",
    "#",
    "=",
    "-",
    "&",
    ".",
    "\t",
    ",",
    "s",
    "£",
    "'",
    "/",
    "x",
    "+",
]);
