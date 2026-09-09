/**
 * The cathode ray tube monitors.
 *
 * CSIRAC held its main store in mercury delay lines, and an operator could
 * watch the circulating digits on a bank of small monitor tubes above the
 * console. Six of them are reproduced here, in the layout and proportions of
 * the crt.gif reference image that came with the emulator.
 *
 * Two kinds of tube are shown. A, B, C and H each display a single register as
 * a waveform: the beam sweeps across the face and lifts for every digit that
 * is a one. M and D each display sixteen words stacked as rows of dots, which
 * is how a whole block of store appeared at once.
 */

import { useEffect, useRef, useState } from "react";

/**
 * Geometry measured from crt.gif. The reference image is 630 x 140 with six
 * tubes of 103 pixels across, so everything is drawn at those coordinates and
 * scaled to whatever width the bank has been given.
 */
const BANK_WIDTH = 630;
const BANK_HEIGHT = 140;
const TUBE_DIAMETER = 103;
const TUBE_PITCH = 104;
const TUBE_LEFT = 3;
const TUBE_TOP = 8;
const LABEL_BASELINE = 133;

/**
 * The face of the tube and the phosphor. These are a physical object and do not
 * follow the page: a monitor tube was grey glass with a green trace on it
 * whatever the paper around it looked like. Only the label is page ink.
 */
const FACE_COLOUR = "#666666";
const TRACE_COLOUR = "#00ff00";
const LABEL_COLOUR = "#1c1c1c";

/** Waveform tubes: twenty digit slots of five pixels, lifting six pixels. */
const WAVE_LEFT = 4;
const WAVE_MARGIN = 2;
const WAVE_HEIGHT = 6;
const WAVE_BASELINE = 52; // relative to the top of the tube

/** Raster tubes: a 20 x 16 grid of dots on a four pixel pitch. */
const DOT_LEFT = 12;
const DOT_TOP = 21; // relative to the top of the tube
const DOT_PITCH = 4;
const DOT_WIDTH = 3;
const DOT_HEIGHT = 2;

export type Tube =
    | { label: string; kind: "word"; word: number; digits: number }
    | { label: string; kind: "raster"; words: readonly number[] };

/**
 * How much of the device's own resolution is worth using.
 *
 * The bank is redrawn after every batch of commands, sixty times a second, and
 * the phosphor bloom is a shadow blur over six clipped circles: cost goes with
 * the number of pixels, and a retina display across a wide window asks for
 * four times as many as the traces can show. Two is past the point where more
 * is visible and well short of where the drawing starts costing frames.
 */
const MAX_PIXEL_SCALE = 2;

export interface CrtProps {
    tubes: readonly Tube[];
}

export function Crt({ tubes }: CrtProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    /** How wide the bank is being drawn, in CSS pixels. */
    const [width, setWidth] = useState(BANK_WIDTH);

    /*
     * How large the tubes are is the page's business rather than this
     * component's: the bank fills the width it is given. Watching the element
     * is what keeps the traces sharp — the reference geometry is scaled to the
     * measured width and the canvas is given the pixels to match, rather than
     * a small drawing being stretched after the fact.
     */
    useEffect(() => {
        const canvas = canvasRef.current;
        // jsdom has no ResizeObserver, and a test has no layout to observe.
        if (!canvas || typeof ResizeObserver === "undefined") return;

        const observer = new ResizeObserver((entries) => {
            const measured = entries[0]?.contentRect.width ?? 0;
            if (measured > 0) setWidth(measured);
        });
        observer.observe(canvas);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_SCALE);
        const pixelScale = (width / BANK_WIDTH) * ratio;
        canvas.width = Math.round(BANK_WIDTH * pixelScale);
        canvas.height = Math.round(BANK_HEIGHT * pixelScale);
        ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);

        drawBank(ctx, tubes);
    }, [tubes, width]);

    return (
        <canvas
            ref={canvasRef}
            className="crt-bank"
            style={{ aspectRatio: `${BANK_WIDTH} / ${BANK_HEIGHT}` }}
            role="img"
            aria-label={`Cathode ray tube displays: ${tubes.map((t) => t.label).join(", ")}`}
        />
    );
}

function drawBank(ctx: CanvasRenderingContext2D, tubes: readonly Tube[]) {
    ctx.clearRect(0, 0, BANK_WIDTH, BANK_HEIGHT);
    ctx.font = 'bold 13px "Jost Variable", "Jost", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    tubes.forEach((tube, index) => {
        const left = TUBE_LEFT + TUBE_PITCH * index;
        drawFace(ctx, left);

        ctx.save();
        // Keep the trace inside the glass.
        ctx.beginPath();
        ctx.arc(left + TUBE_DIAMETER / 2, TUBE_TOP + TUBE_DIAMETER / 2, TUBE_DIAMETER / 2, 0, Math.PI * 2);
        ctx.clip();

        ctx.fillStyle = TRACE_COLOUR;
        ctx.strokeStyle = TRACE_COLOUR;
        // A little bloom, the way phosphor spreads.
        ctx.shadowColor = TRACE_COLOUR;
        ctx.shadowBlur = 4;

        if (tube.kind === "word") drawWaveform(ctx, left, tube.word, tube.digits);
        else drawRaster(ctx, left, tube.words);

        ctx.restore();

        ctx.fillStyle = LABEL_COLOUR;
        ctx.fillText(tube.label, left + TUBE_DIAMETER / 2, LABEL_BASELINE);
    });
}

/** The blank grey face of a tube. */
function drawFace(ctx: CanvasRenderingContext2D, left: number) {
    const centreX = left + TUBE_DIAMETER / 2;
    const centreY = TUBE_TOP + TUBE_DIAMETER / 2;
    const radius = TUBE_DIAMETER / 2;

    ctx.save();
    ctx.beginPath();
    ctx.arc(centreX, centreY, radius, 0, Math.PI * 2);
    // Slightly brighter towards the middle, as a real tube face is.
    const glass = ctx.createRadialGradient(centreX, centreY - radius / 4, radius / 8, centreX, centreY, radius);
    glass.addColorStop(0, "#767676");
    glass.addColorStop(1, FACE_COLOUR);
    ctx.fillStyle = glass;
    ctx.fill();
    ctx.restore();
}

/**
 * Draw one register as a waveform. The beam runs left to right with p20 at the
 * left hand end, lifting for each digit that is a one.
 */
function drawWaveform(ctx: CanvasRenderingContext2D, left: number, word: number, digits: number) {
    // Twenty digits sit on a five pixel pitch; ten digits are spread to fill.
    const pitch = (TUBE_DIAMETER - 2 * WAVE_LEFT) / 20;
    const slotWidth = digits === 20 ? pitch : pitch * 2;
    const baseline = TUBE_TOP + WAVE_BASELINE;
    const top = baseline - WAVE_HEIGHT;

    ctx.lineWidth = 1.4;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(left + WAVE_MARGIN, baseline);

    for (let index = 0; index < digits; index++) {
        const slotLeft = left + WAVE_LEFT + slotWidth * index;
        // Digits are displayed most significant first, so p20 is at the left.
        const isOne = (word & (1 << (digits - 1 - index))) !== 0;
        if (!isOne) {
            ctx.lineTo(slotLeft + slotWidth, baseline);
            continue;
        }
        // A pulse: up, across, and back down within the digit's slot.
        ctx.lineTo(slotLeft + slotWidth * 0.2, baseline);
        ctx.lineTo(slotLeft + slotWidth * 0.35, top);
        ctx.lineTo(slotLeft + slotWidth * 0.7, top);
        ctx.lineTo(slotLeft + slotWidth * 0.85, baseline);
        ctx.lineTo(slotLeft + slotWidth, baseline);
    }

    ctx.lineTo(left + TUBE_DIAMETER - WAVE_MARGIN, baseline);
    ctx.stroke();
}

/**
 * Draw sixteen words as rows of dots, one dot for each digit that is a one.
 * This is how a block of store or the sixteen D registers appeared at a glance.
 */
function drawRaster(ctx: CanvasRenderingContext2D, left: number, words: readonly number[]) {
    for (let row = 0; row < 16; row++) {
        const word = words[row] ?? 0;
        const y = TUBE_TOP + DOT_TOP + DOT_PITCH * row;
        for (let digit = 0; digit < 20; digit++) {
            // p20 at the left again, matching the printed register displays.
            if ((word & (1 << (19 - digit))) === 0) continue;
            ctx.fillRect(left + DOT_LEFT + DOT_PITCH * digit, y, DOT_WIDTH, DOT_HEIGHT);
        }
    }
}
