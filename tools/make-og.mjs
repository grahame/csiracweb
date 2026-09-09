/**
 * The picture the site is shared under.
 *
 * When a link to this page is posted somewhere, what is shown with it is the
 * image named in the `og:image` tag, and it is worth that being the machine
 * rather than a screenshot of a browser window. So this draws one: the CSIRAC
 * logo, a line saying what the site is, and the bank of monitor tubes across
 * the bottom.
 *
 * The tubes are not an illustration of the emulator. They are the emulator:
 * the same drawing the page uses, `src/ui/crt-draw.ts`, handed a canvas that
 * writes a PNG instead of one on a page, and given the state of a real machine
 * that has been carried far enough into T725 to be printing its table of
 * tangents. What is on the tubes is what was in the store at that moment.
 *
 *   node --import ./tools/typescript-sources.mjs tools/make-og.mjs
 *
 * The result is committed, so the site never depends on this having been run.
 */

import { createCanvas, loadImage, registerFont } from "canvas";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { BANK_HEIGHT, BANK_WIDTH, drawBank } from "../src/ui/crt-draw.ts";
import { Machine } from "../src/emulator/machine.ts";
import { runBatch } from "../src/emulator/run.ts";
import { Tape } from "../src/emulator/tape.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Facebook, and everyone who followed it, wants 1200 x 630. */
const WIDTH = 1200;
const HEIGHT = 630;
const MARGIN = 72;
/** The tubes sit a little closer to the edge than the text does. */
const BOTTOM_MARGIN = 56;

/** The page's own paper and ink; see the head of src/index.css. */
const PAPER = "#fbfaf6";
const INK = "#1c1c1c";
const INK_DIM = "#6b6b66";

/**
 * The titling face.
 *
 * The site sets its headings in Jost*, which stands in for the geometric sans
 * CSIRAC's manuals were titled in; the copy it serves is a .woff2, which is
 * the one format the drawing library cannot read. Futura is the face Jost*
 * stands in for and macOS ships it, so it is used where it is there, under the
 * name the drawing asks for. Anywhere else this falls back to the system sans
 * and the image is a little off the page it advertises, which is worth less
 * than the trouble of shipping a font to fix it.
 */
const TITLING = "Jost Variable";
const FUTURA = "/System/Library/Fonts/Supplemental/Futura.ttc";

/**
 * The machine whose store is on the tubes.
 *
 * T725 prints a headed table of tan x worked out from a ninth order
 * polynomial, so by the time it is a few rows in there is a program in store,
 * a partial result in the accumulator and a sequence register part way through
 * a loop: a machine at work rather than a machine at rest, which is what an
 * operator would have been looking at.
 */
const PROGRAM = "TangentTable.cvt";
/** Enough to read the tape in and print the first few rows of the table. */
const COMMANDS = 230_000;

function tubesFromARunningMachine() {
    const machine = new Machine();
    machine.programTape = new Tape(PROGRAM, readFileSync(join(ROOT, "public", "tapes", PROGRAM), "utf8"));
    machine.initialize();
    machine.readPrimary();
    machine.s = 0;
    machine.beginExecution();

    const { error } = runBatch(machine, COMMANDS);
    if (error) throw new Error(`${PROGRAM} stopped: ${error}`);

    // The console's own bank, in the console's own order; see MachineDisplay.
    return [
        { label: "A", kind: "word", word: machine.a, digits: 20 },
        { label: "B", kind: "word", word: machine.b, digits: 20 },
        { label: "M", kind: "raster", words: Array.from(machine.m.slice(0, 16)) },
        { label: "D", kind: "raster", words: Array.from(machine.recent) },
        { label: "C", kind: "word", word: machine.c, digits: 20 },
        { label: "H", kind: "word", word: machine.h, digits: 10 },
    ];
}

async function draw() {
    if (existsSync(FUTURA)) registerFont(FUTURA, { family: TITLING });

    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // The logo, as the page carries it. librsvg wants the size on the element
    // rather than only in the viewBox, so it is put there on the way past.
    const svg = readFileSync(join(ROOT, "src", "csirac-traced.svg"), "utf8");
    const logo = await loadImage(Buffer.from(svg.replace("<svg", '<svg width="1000" height="300"'), "utf8"));
    const logoWidth = 420;
    const logoHeight = (logoWidth * logo.height) / logo.width;
    ctx.drawImage(logo, MARGIN, 48, logoWidth, logoHeight);

    ctx.fillStyle = INK;
    ctx.font = `44px "${TITLING}"`;
    ctx.fillText("Australia's first computer, in your browser", MARGIN, 254);

    ctx.fillStyle = INK_DIM;
    ctx.font = `28px "${TITLING}"`;
    ctx.fillText("The 1949 machine, its original tapes, and Interprogram", MARGIN, 296);

    // The bank across the foot of the image, as it sat across the top of the
    // console: the tubes are what an operator watched.
    //
    // It is drawn on a canvas of its own because the drawing clears the ground
    // it is given before it starts, as it must on a page where it is redrawn
    // sixty times a second — done straight onto this image, that would take
    // the paper out from under the tubes and leave a hole in it.
    const scale = (WIDTH - 2 * MARGIN) / BANK_WIDTH;
    const bank = createCanvas(BANK_WIDTH * scale, BANK_HEIGHT * scale);
    const bankCtx = bank.getContext("2d");
    bankCtx.scale(scale, scale);
    drawBank(bankCtx, tubesFromARunningMachine());
    ctx.drawImage(bank, MARGIN, HEIGHT - BOTTOM_MARGIN - bank.height);

    const out = join(ROOT, "public", "og.png");
    writeFileSync(out, canvas.toBuffer("image/png"));
    console.log(`wrote ${out}`);
}

await draw();
