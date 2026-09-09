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

import { BANK_HEIGHT, BANK_WIDTH, drawBank, type Tube } from "./crt-draw";

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
