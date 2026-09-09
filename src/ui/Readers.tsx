/**
 * The two tape readers.
 *
 * CSIRAC had a 12-hole reader and a 5-hole reader, and a console switch chose
 * between them — sections 4.2 and 4.10 of the programming manual both say so.
 * It had no switch for which *tape* was being read: that was a matter of
 * threading one into a reader. An emulator cannot thread tape, so `U` chooses
 * the tape and the reader selector follows it.
 *
 * **How many holes a tape has is a property of the tape**, not of the switch: a
 * `.cvt` of scale-32 rows is 12-hole tape whatever the console is set to, and
 * an Interprogram source is 5-hole text. So each tape is drawn and labelled as
 * what it is, and the switch only says which reader is running.
 *
 * The two cannot now disagree. The reader selector follows the tape rather
 * than being set by hand, so the mismatch that CSIRACEM's notes give as the
 * cause of both "Unexpected EOF on 5-hole data file" and reading past the end
 * of a program is no longer reachable from the console.
 */

import { useMemo } from "react";

import { looksLikeTwelveHole, punchingOf } from "../emulator/punching";
import { TapeStrip } from "./TapeStrip";
import type { MachineView } from "./useMachine";

interface ReadersProps {
    view: MachineView;
    programName: string;
    programText: string;
    dataName: string;
    dataText: string;
}

export function Readers({ view, programName, programText, dataName, dataText }: ReadersProps) {
    // Each tape is read as what it is. The reader selector does not change what
    // is punched in it.
    const program = useMemo(() => describeTape(programText), [programText]);
    const data = useMemo(() => describeTape(dataText), [dataText]);

    return (
        <div className="readers">
            <div className="reader-pair">
                {program ? (
                    <Reader
                        role="Program tape"
                        name={programName || "program"}
                        tape={program}
                        head={view.programAt}
                        live={!view.readingData}
                    />
                ) : null}
                {data ? (
                    <Reader
                        role="Data tape"
                        name={dataName || "data"}
                        tape={data}
                        head={view.dataAt}
                        live={view.readingData}
                    />
                ) : null}
            </div>
        </div>
    );
}

/**
 * How much larger than its own geometry the tape is drawn.
 *
 * TapeStrip's pitch is the tape's: the same across as along, as real tape is.
 * At that size the punching is legible but small beside the bank of tubes it
 * now sits under, and the holes are what somebody is looking at — whether a
 * row is blank, where the head has got to. A quarter again is enough to read
 * them at a glance, and the strip is redrawn at that size rather than being
 * stretched, so nothing softens.
 */
const TAPE_SCALE = 1.25;

type Described = ReturnType<typeof punchingOf>;

/** Read a tape as what it is, or nothing at all if no tape is mounted. */
function describeTape(text: string): Described | null {
    if (!text) return null;
    return punchingOf(text, looksLikeTwelveHole(text) ? 12 : 5);
}

function Reader({
    role,
    name,
    tape,
    head,
    live,
}: {
    role: string;
    name: string;
    tape: Described;
    head: number;
    live: boolean;
}) {
    return (
        <div className={live ? "reader live" : "reader"}>
            <div className="reader-head">
                <span className="reader-lamp" aria-hidden="true" />
                {role}
            </div>
            <div className="reader-tape">
                {name} · {tape.channels}-hole
            </div>
            <TapeStrip tape={tape} head={head} live={live} scale={TAPE_SCALE} />
            <div className="reader-count">
                row {Math.min(head + 1, tape.rows.length)} of {tape.rows.length}
            </div>
        </div>
    );
}
