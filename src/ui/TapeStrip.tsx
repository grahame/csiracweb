/**
 * A tape running through a reader.
 *
 * Drawn as the tape itself, because a row of 12-hole tape *is* its twelve punch
 * positions: section 4.10 of the programming manual gives X and Y as p19 and
 * p20 and the other ten channels as p10 to p1, which is the whole of a word
 * that a row can carry.
 *
 * Two marks, not one. Section 4.2: "When the code in the input register has
 * been transmitted, the tape is automatically advanced one row and the code is
 * loaded into the input register in place of that transmitted." So the head
 * always sits a row ahead of the word the program is working on, and both are
 * drawn: the gap between them is that sentence, made visible.
 *
 * The feed hole is drawn smaller and toward one edge. That much is settled by
 * the manual's own diagram for 5-hole tape, two channels one side and three the
 * other, and by measuring a photograph of punched tape for the general form.
 * Which channel it sits between on 12-hole tape is not recorded anywhere to
 * hand, so it is drawn clear of the data channels rather than claimed to be in
 * a particular gap. See docs/tape-display.md.
 */

import { useEffect, useRef } from "react";

import type { PunchedTape } from "../emulator/punching";

/** Geometry. Real tape has the same pitch across as along, and so does this. */
const PITCH = 9;
const DATA_RADIUS = 2.6;
const FEED_RADIUS = 1.4;
const MARGIN = 7;
/** How many rows of tape are on show at once. */
const VISIBLE_ROWS = 34;
/** The head sits a third of the way down, so what is coming can be seen. */
const HEAD_ROW = 11;

/** Tape is buff paper punched through; a reader not in use is greyed. */
const PAPER = "#e8e2c8";
const PAPER_DARK = "#cfccc0";
const HOLE = "#23231c";
const HEAD_MARK = "#0f7a33";
const REGISTER_MARK = "#b4671b";
const LEADER_TEXT = "#4a4638";

export interface TapeStripProps {
    tape: PunchedTape;
    /** The row under the read head. */
    head: number;
    /** Whether this is the reader the console switches have selected. */
    live: boolean;
    scale?: number;
}

export function TapeStrip({ tape, head, live, scale = 1 }: TapeStripProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // The feed hole takes a lane of its own, clear of the data channels.
    const lanes = tape.channels + 1;
    const width = MARGIN * 2 + lanes * PITCH;
    const height = MARGIN * 2 + VISIBLE_ROWS * PITCH;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const ratio = (window.devicePixelRatio || 1) * scale;
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

        draw(ctx, { tape, head, live, width, height, lanes });
    }, [tape, head, live, scale, width, height, lanes]);

    return (
        <canvas
            ref={canvasRef}
            className={live ? "tape-strip live" : "tape-strip"}
            style={{ width: width * scale, height: height * scale }}
            role="img"
            aria-label={
                `${tape.channels}-hole reader, ${live ? "selected" : "not selected"}, ` +
                `at row ${head + 1} of ${tape.rows.length}`
            }
        />
    );
}

interface DrawArgs {
    tape: PunchedTape;
    head: number;
    live: boolean;
    width: number;
    height: number;
    lanes: number;
}

function draw(ctx: CanvasRenderingContext2D, { tape, head, live, width, height, lanes }: DrawArgs) {
    ctx.clearRect(0, 0, width, height);

    // The paper. A reader that is not selected is not lit.
    ctx.fillStyle = live ? PAPER : PAPER_DARK;
    ctx.fillRect(0, 0, width, height);

    const first = head - HEAD_ROW;

    ctx.font = '7px "Source Code Pro Variable", "Source Code Pro", monospace';
    ctx.textBaseline = "middle";

    for (let n = 0; n < VISIBLE_ROWS; n++) {
        const index = first + n;
        const y = MARGIN + n * PITCH + PITCH / 2;
        if (index < 0 || index >= tape.rows.length) continue;
        const row = tape.rows[index];

        // A 5-hole tape is text; there is no punching to draw, so the leader is
        // the row. A 12-hole row that carries a comment shows it the way a real
        // tape carried its title printed along the leader.
        if (row.leader && (tape.channels === 5 || row.blank)) {
            ctx.fillStyle = LEADER_TEXT;
            ctx.fillText(row.leader.slice(0, Math.floor(width / 4.3)), MARGIN, y);
            if (tape.channels === 5) continue;
        }

        for (let lane = 0; lane < lanes; lane++) {
            const x = MARGIN + lane * PITCH + PITCH / 2;

            // The feed hole runs in every row, in its own lane toward one edge.
            if (lane === feedLane(tape.channels)) {
                ctx.beginPath();
                ctx.arc(x, y, FEED_RADIUS, 0, Math.PI * 2);
                ctx.fillStyle = HOLE;
                ctx.fill();
                continue;
            }

            const channel = lane > feedLane(tape.channels) ? lane - 1 : lane;
            if (!row.holes[channel]) continue;
            ctx.beginPath();
            ctx.arc(x, y, DATA_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = HOLE;
            ctx.fill();
        }
    }

    if (!live) return;

    // The head, and the row already transmitted, which is one behind it.
    markRow(ctx, HEAD_ROW, width, HEAD_MARK);
    if (head > 0) markRow(ctx, HEAD_ROW - 1, width, REGISTER_MARK);
}

/**
 * Which lane the feed hole runs in. For 5-hole tape the manual's diagram puts
 * two channels one side of it and three the other; for 12-hole its position is
 * not known, so it goes at the edge rather than in a claimed gap.
 */
function feedLane(channels: number): number {
    return channels === 5 ? 2 : 0;
}

function markRow(ctx: CanvasRenderingContext2D, row: number, width: number, colour: string) {
    const y = MARGIN + row * PITCH;
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.moveTo(0, y + PITCH);
    ctx.lineTo(width, y + PITCH);
    ctx.stroke();
    // A tab at each end, so the mark reads as a head rather than a rule.
    ctx.fillStyle = colour;
    ctx.fillRect(0, y, 3, PITCH);
    ctx.fillRect(width - 3, y, 3, PITCH);
}
