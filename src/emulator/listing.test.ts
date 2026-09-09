/**
 * The listing has to tell the truth.
 *
 * An annotated tape is only worth having if the word it says a row assembles
 * to is the word the machine really ends up with. So each bundled tape is
 * analysed, then actually read in, and the two are compared.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { decodeInstruction, describeInstruction, dRegisterOf, mnemonicOf } from "./describe";
import { analyseProgramTape, looksLikeTwelveHole } from "./listing";
import { Machine } from "./machine";
import { runToStop } from "./run";
import { Tape } from "./tape";

const TAPES = join(import.meta.dirname, "..", "..", "public", "tapes");

function read(name: string): string {
    return readFileSync(join(TAPES, name), "utf8");
}

/**
 * Read a tape in the way an operator would, recording every word written to
 * store while the primary assembles it.
 */
function recordLoad(program: string): { store: Int32Array; writes: Set<string> } {
    const machine = new Machine();
    machine.programTape = new Tape(program, read(program));
    machine.initialize();

    // Record the primary going in as well as the words it then assembles, since
    // the listing accounts for both.
    const writes = new Set<string>();
    machine.onStore = (address, word) => writes.add(`${address}=${word}`);

    machine.readPrimary();
    machine.s = 0;
    machine.beginExecution();
    const result = runToStop(machine, 5_000_000);
    expect(result.error).toBeNull();
    return { store: machine.m, writes };
}

describe("decoding an instruction", () => {
    it("names the D register from the low four bits of the address", () => {
        // Address 30 0 is 960, whose second scale-32 digit is 0, so D0.
        expect(dRegisterOf(960)).toBe(0);
        // Address 0 30 is 30, so D14.
        expect(dRegisterOf(30)).toBe(14);
    });

    it("splits a word into address, source and destination", () => {
        // 17 18 is the first word of the T001 primary: source D, destination PD.
        const instruction = decodeInstruction(562);
        expect(instruction).toEqual({ address: 0, source: 17, destination: 18 });
        expect(mnemonicOf(instruction)).toBe(" D PD");
    });

    it("names the idioms a programmer would have read as one act", () => {
        // PL T is how a CSIRAC program stops.
        expect(describeInstruction({ source: 25, destination: 31, address: 0 })).toMatch(/Stop the machine/);
        // Z S jumps to 0 0.
        expect(describeInstruction({ source: 20, destination: 23, address: 0 })).toMatch(/Jump to 0 0/);
        // M A loads the accumulator, and the address is given in scale 32.
        expect(describeInstruction({ source: 0, destination: 4, address: 300 })).toMatch(
            /Load the accumulator from store at 9 12/,
        );
    });
});

describe.each(["T712A.cvt", "Sqrt.cvt", "A2Test.cvt", "ITest.cvt"])("%s", (name) => {
    it("never claims a placement the machine did not make", () => {
        const { writes } = recordLoad(name);
        const rows = analyseProgramTape(read(name));

        const placed = rows.filter((row) => row.word !== null && row.storeAddress !== null);
        expect(placed.length).toBeGreaterThan(10);

        // Every word the listing says a row put somewhere must be a word the
        // machine really did put there. Comparing against the store at the end
        // would not do: a program is free to overwrite its own instructions while
        // it is being read in, and several of these do.
        const invented = placed
            .filter((row) => !writes.has(`${row.storeAddress}=${row.word}`))
            .map((row) => `line ${row.line}: claims ${row.word} at ${row.storeAddress}`);

        expect({ name, invented: invented.slice(0, 8), total: invented.length }).toEqual({
            name,
            invented: [],
            total: 0,
        });
    });

    it("finds a store address for most instruction rows", () => {
        const rows = analyseProgramTape(read(name));
        const instructions = rows.filter((row) => row.kind === "instruction");
        const placed = instructions.filter((row) => row.storeAddress !== null);

        // Not every row can be placed, and the listing says so rather than
        // guessing. Following the tape stops at the DO command that ends the read,
        // so rows the program only pulls in later, once it is running, are left
        // unplaced. What matters is that the bulk of the tape is accounted for.
        expect(placed.length / instructions.length).toBeGreaterThan(0.75);
    });

    it("is recognised as a 12-hole tape", () => {
        expect(looksLikeTwelveHole(read(name))).toBe(true);
    });
});

describe("the T712A listing in detail", () => {
    const rows = analyseProgramTape(read("T712A.cvt"));

    it("keeps the headings as headings", () => {
        expect(rows[0].kind).toBe("heading");
        expect(rows[0].comment).toMatch(/T712  Teleprinter Test/);
    });

    it("reads the primary as whole words from address 0", () => {
        const primary = rows.filter((row) => row.kind === "primary");
        expect(primary).toHaveLength(18);
        expect(primary[0].storeAddress).toBe(0);
        expect(primary[0].mnemonic).toBe(" D PD");
        expect(primary[17].storeAddress).toBe(17);
        expect(primary[17].mnemonic).toBe(" Z  S");
    });

    it("marks a Y punch as a control statement", () => {
        const control = rows.filter((row) => row.kind === "control");
        expect(control[0].digits).toEqual([0, 14]);
        expect(control[0].description).toMatch(/Control statement 0 14/);
    });

    it("pairs a plain address row with the X row that follows it", () => {
        // "30  0" then "26 17X" is K to D, with address 30 0, stored at 0 15.
        const paired = rows.find((row) => row.kind === "instruction" && row.storeAddress === 15);
        expect(paired?.mnemonic).toBe(" K  D");
        expect(paired?.instruction?.address).toBe(960);
        expect(rows[rows.indexOf(paired!) - 1].kind).toBe("address");
    });

    it("describes the stop instruction at 0 14", () => {
        const stop = rows.find((row) => row.kind === "instruction" && row.storeAddress === 14);
        expect(stop?.mnemonic).toBe("PS  T");
        expect(stop?.description).toMatch(/Stop the machine/);
    });
});

describe("data tapes", () => {
    it("sees Sqrt.dat as 12-hole rows", () => {
        expect(looksLikeTwelveHole(read("Sqrt.dat"))).toBe(true);
    });

    it("sees ITest.dat as something other than 12-hole rows", () => {
        // It is a 5-hole tape: ordinary text, read character by character.
        expect(looksLikeTwelveHole(read("ITest.dat"))).toBe(false);
    });
});
