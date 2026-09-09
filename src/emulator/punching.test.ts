/**
 * A row of tape drawn as itself.
 *
 * Section 4.10 of the programming manual gives the twelve channels as X and Y
 * for p19 and p20 and the remaining ten for p10 to p1, so a row's punching is
 * exactly the word it carries and can be checked against it.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { looksLikeTwelveHole, punchingOf } from "./punching";
import { Machine } from "./machine";
import { runToStop } from "./run";
import { Tape } from "./tape";

const TAPES = join(import.meta.dirname, "..", "..", "public", "tapes");
const read = (name: string) => readFileSync(join(TAPES, name), "utf8");

/** The punching of a row, as it is drawn: `o` for a hole. */
const shown = (holes: readonly boolean[]) => holes.map((hole) => (hole ? "o" : ".")).join("");

describe("a 12-hole row", () => {
    const rows = (text: string) => punchingOf(text, 12).rows;

    it("is its twelve punch positions", () => {
        // 17 18 is the first word of the T001 primary, D to PD.
        expect(shown(rows("17 18  ")[0].holes)).toBe("o...oo..o...");
        // An X punch is p19 and a Y punch is p20, the last two channels.
        expect(shown(rows("26 17X ")[0].holes)).toBe("oo.o.o...oo.");
        expect(shown(rows(" 0 14 Y")[0].holes)).toBe("......ooo..o");
    });

    it("reads blank tape as no holes at all", () => {
        const row = rows(" 0  0  ")[0];
        expect(shown(row.holes)).toBe("............");
        expect(row.blank).toBe(true);
    });

    it("reads the DO as every hole punched", () => {
        // 31 31XY is the command that ends a tape, and it fills the row.
        expect(shown(rows("31 31XY")[0].holes)).toBe("oooooooooooo");
    });

    it("keeps what is printed past column 7 as the leader", () => {
        const row = rows("       * T712  Teleprinter Test")[0];
        expect(row.leader).toBe("* T712  Teleprinter Test");
        expect(row.blank).toBe(true);
    });

    it("has a row for every line of a real tape", () => {
        const text = read("T712A.cvt");
        expect(punchingOf(text, 12).rows).toHaveLength(text.replace(/\r\n|\r/g, "\n").split("\n").length);
    });
});

describe("a 5-hole tape", () => {
    it("is shown as the text it is, since it is read a character at a time", () => {
        const rows = punchingOf("-0.003456 +0.250000\r\n2793 -45\r\n", 5).rows;
        expect(rows[0].leader).toBe("-0.003456 +0.250000");
        expect(rows[1].leader).toBe("2793 -45");
    });
});

describe("how many holes a tape has", () => {
    it("is a property of the tape, not of the reader selector", () => {
        // Sqrt's data is punched as scale-32 rows; ITest's and Interprogram's are
        // ordinary text read a character at a time. Pressing R does not change
        // what is on a tape, so neither may the label.
        expect(looksLikeTwelveHole(read("Sqrt.cvt"))).toBe(true);
        expect(looksLikeTwelveHole(read("Sqrt.dat"))).toBe(true);
        expect(looksLikeTwelveHole(read("ITest.dat"))).toBe(false);
        expect(looksLikeTwelveHole(read("Ex4.dat"))).toBe(false);
    });

    it("gives every bundled program tape twelve channels", () => {
        for (const name of ["T712A.cvt", "A2Test.cvt", "InterProgram.cvt", "player.cvt"]) {
            const text = read(name);
            expect(looksLikeTwelveHole(text)).toBe(true);
            expect(punchingOf(text, 12).channels).toBe(12);
        }
    });
});

describe("the reader position", () => {
    it("advances through the tape as a program is read in", () => {
        const machine = new Machine();
        const tape = new Tape("T712A.cvt", read("T712A.cvt"));
        machine.programTape = tape;
        machine.initialize();

        expect(tape.position).toBe(0);
        machine.readPrimary();
        const afterPrimary = tape.position;
        expect(afterPrimary).toBeGreaterThan(0);

        machine.s = 0;
        machine.beginExecution();
        runToStop(machine, 1_000_000);

        // The primary is read by the machine itself, then reads the rest of the
        // tape as a program, so the head is well past where the primary left it.
        expect(tape.position).toBeGreaterThan(afterPrimary);
    });

    it("leaves the head a row ahead of what the machine is working on", () => {
        // Section 4.2: the tape advances only once the code in the input register
        // has been transmitted, so the reader is always a row in front.
        const machine = new Machine();
        const tape = new Tape("T712A.cvt", read("T712A.cvt"));
        machine.programTape = tape;
        machine.initialize();
        machine.readPrimary();
        machine.s = 0;
        machine.beginExecution();

        const seen: number[] = [];
        for (let n = 0; n < 400; n++) {
            const before = tape.position;
            if (machine.step()) break;
            // Every read moves the head on by exactly one row.
            if (tape.position !== before) seen.push(tape.position - before);
        }
        expect(seen.length).toBeGreaterThan(10);
        expect([...new Set(seen)]).toEqual([1]);
    });
});
