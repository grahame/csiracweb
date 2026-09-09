/**
 * The emulator is checked against the results John Spencer documented for the
 * programs shipped with the DOS emulator. If these pass, the instruction set,
 * the tape readers and the printers all agree with the original.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { renderPrinterText } from "./format";
import { Machine } from "./machine";
import { runToStop } from "./run";
import { Tape } from "./tape";
import { P11, P20, fromScale32, fromScale32Quad, toSigned } from "./word";

const TAPES = join(import.meta.dirname, "..", "..", "public", "tapes");

function tape(name: string): Tape {
    return new Tape(name, readFileSync(join(TAPES, name), "utf8"));
}

/**
 * Load a program the way an operator would: mount the tape, read the primary,
 * then clear the sequence register and let the primary read the rest in.
 */
function load(program: string, data?: string): Machine {
    const machine = new Machine();
    machine.programTape = tape(program);
    if (data) machine.dataTape = tape(data);
    machine.initialize();
    machine.readPrimary();
    machine.s = 0;
    machine.beginExecution();
    const result = runToStop(machine, 5_000_000);
    expect(result.error).toBeNull();
    return machine;
}

describe("word arithmetic", () => {
    it("reads p20 as the sign bit", () => {
        expect(toSigned(0)).toBe(0);
        expect(toSigned(1)).toBe(1);
        expect(toSigned(P20)).toBe(-524288);
        expect(toSigned(0xfffff)).toBe(-1);
    });

    it("assembles registers from the four scale-32 digits used on the console", () => {
        // NA is set to "0 0 1 0" by default, which is 32.
        expect(fromScale32Quad(0, 0, 1, 0)).toBe(32);
        // Muncey's non-stop primary wants "2 0 1 0".
        expect(fromScale32Quad(2, 0, 1, 0)).toBe(64 * P11 + 32);
    });
});

describe("T712A, the teleprinter test program", () => {
    it("prints the teleprinter character set", () => {
        const machine = load("T712A.cvt");

        // Reading the tape in leaves the machine stopped; the operator presses
        // RETURN to run the program that has just been loaded.
        const result = runToStop(machine, 5_000_000);
        expect(result.error).toBeNull();

        const out = renderPrinterText(machine.teleprinterOutput);

        // The program walks the whole five-bit code in both shifts.
        expect(out).toContain("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
        expect(out).toContain("0123456789");
    });
});

describe("the short demonstration tapes", () => {
    it("TestPrint prints on the teleprinter", () => {
        const machine = load("TestPrint.cvt");
        expect(runToStop(machine, 5_000_000).error).toBeNull();

        const out = renderPrinterText(machine.teleprinterOutput);
        expect(out).toContain("HELLO WORLD");
        expect(out).toContain("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
        expect(out).toContain("0123456789");
        // Nothing went to the punch.
        expect(machine.punchOutput).toBe("");
    });

    it("TestPunch sends the same to the punch instead", () => {
        const machine = load("TestPunch.cvt");
        expect(runToStop(machine, 5_000_000).error).toBeNull();

        const out = renderPrinterText(machine.punchOutput);
        expect(out).toContain("HELLO WORLD");
        expect(out).toContain("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
        expect(machine.teleprinterOutput).toBe("");
    });

    it("TestSound drives the loudspeaker", () => {
        const machine = load("TestSound.cvt");
        let hoots = 0;
        machine.onHoot = () => hoots++;

        expect(runToStop(machine, 5_000_000).error).toBeNull();
        expect(hoots).toBeGreaterThan(0);
    });
});

describe("the tune tapes", () => {
    /** When each word went to the speaker, in commands since execution began. */
    function play(name: string): number[] {
        const machine = load(name);
        const at: number[] = [];
        machine.onHoot = (_word, when) => at.push(when);
        expect(runToStop(machine, 1_000_000).error).toBeNull();
        return at;
    }

    /**
     * The gaps that a note is made of, which is all a pitch is. Gaps that show
     * up only once or twice are the silence between notes, not a pitch.
     */
    function spacings(at: number[]): number[] {
        const counts = new Map<number, number>();
        at.slice(1).forEach((pulse, index) => {
            const gap = pulse - at[index];
            counts.set(gap, (counts.get(gap) ?? 0) + 1);
        });
        return [...counts.entries()]
            .filter(([, times]) => times > 2)
            .map(([gap]) => gap)
            .sort((a, b) => a - b);
    }

    /**
     * The programming manual gives the hoot stop as the two command loop
     * `31 31 K P` / `31 30 K PS`, so the tape has to be that loop and not a
     * note that merely sounds like one. At about a thousand commands a second
     * two commands is 500 Hz.
     */
    it("sounds the hoot at one cycle every two commands, as the manual gives it", () => {
        const at = play("Hoot.cvt");
        expect(at.length).toBeGreaterThan(100);
        expect(spacings(at)).toEqual([2]);
    });

    it("plays a scale that gets coarser as it rises", () => {
        const at = play("Scale.cvt");
        // Eight notes over five spacings: the top of the scale runs out of room,
        // which is why CSIRAC's music sounds as it does.
        expect(spacings(at)).toEqual([4, 5, 6, 7, 8]);
    });

    it("plays the chime, and stops", () => {
        const at = play("Chime.cvt");
        expect(at.length).toBeGreaterThan(50);
        expect(spacings(at)).toEqual([5, 6, 7, 8]);
    });

    it("drives the speaker twice as hard for the chime as for the others", () => {
        /** The words a tape sends to the speaker, and how many digits each carries. */
        function drive(name: string): number[] {
            const machine = load(name);
            const words = new Set<number>();
            machine.onHoot = (word) => words.add(word);
            runToStop(machine, 1_000_000);
            return [...words].map((word) => {
                let digits = 0;
                for (let bit = 0; bit < 20; bit++) if (word & (1 << bit)) digits++;
                return digits;
            });
        }

        // The speaker was driven by the digits of the word sent to it, so this is
        // the only volume control the machine had. The chime carries two digits
        // where the others carry one.
        expect(drive("Hoot.cvt")).toEqual([1]);
        expect(drive("Scale.cvt")).toEqual([1]);
        expect(drive("Chime.cvt")).toEqual([2]);
    });
});

describe("Multiplication (T732)", () => {
    function product(na: number, nb: number): string {
        const machine = load("Multiplication.cvt");
        machine.na = na;
        machine.nb = nb;
        expect(runToStop(machine, 5_000_000).error).toBeNull();
        return renderPrinterText(machine.teleprinterOutput).trim();
    }

    it("prints N x M, taken from the NA and NB registers in p1 units", () => {
        // The four scale-32 digits the Options menu takes: "0 0 0 7" is seven.
        expect(product(fromScale32Quad(0, 0, 0, 7), fromScale32Quad(0, 0, 0, 6))).toBe("42");
    });

    it("comes out 32 times too big if NA is set from the operations menu", () => {
        // A on the operations menu sets one scale-32 digit, the p6 one, exactly as
        // the console did, so entering 7 there puts 7 x 32 on NA. This is not a
        // fault to be fixed but a trap to be documented: the tape's notes send the
        // operator to the Options menu because of it.
        expect(product(fromScale32Quad(0, 0, 7, 0), fromScale32Quad(0, 0, 0, 6))).toBe("1344");
        expect(fromScale32Quad(0, 0, 7, 0)).toBe(7 * 32);
    });
});

describe("TangentTable (T725)", () => {
    it("prints a headed table of tangents, then hoots to say it has finished", () => {
        const machine = load("TangentTable.cvt");
        let hoots = 0;
        machine.onHoot = () => hoots++;

        // This program does not stop: when the table is done it hoots continuously,
        // which is how a CSIRAC program signalled that it had finished. So it is
        // run for a fixed span rather than to a halt.
        runToStop(machine, 12_000_000);

        const out = renderPrinterText(machine.teleprinterOutput);
        expect(out).toContain("TAN X");
        // The header says angles 4.5 to 40.5 degrees, as fractions of 90 degrees.
        expect(out).toContain("+.050001  +.078702");
        expect(out).toContain("+.450010  +.854104");
        expect(hoots).toBeGreaterThan(1000);
    });
});

describe("SQRT, square roots of decimally punched fractions", () => {
    it("prints each number and its square root", () => {
        const machine = load("Sqrt.cvt", "Sqrt.dat");

        // The operator switches the 12-hole reader over to the data tape before
        // running the program proper.
        machine.readData = true;
        const result = runToStop(machine, 5_000_000);
        expect(result.error).toBeNull();

        const out = renderPrinterText(machine.teleprinterOutput);
        const rows = out
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

        // The expected results are given in the programs README of the DOS distro.
        expect(rows).toEqual([
            ".100000  .316227",
            ".200001  .447216",
            ".299999  .547722",
            ".400000  .632454",
            ".500000  .707108",
            ".600000  .774597",
            ".700001  .836662",
            ".800001  .894428",
            ".900000  .948685",
            ".500000  .707108",
        ]);
    });
});

describe("A2TEST, an arcsine routine validation from 1960", () => {
    it("punches the angles it recovers from their sines and cosines", () => {
        const machine = load("A2Test.cvt");

        const result = runToStop(machine, 20_000_000);
        expect(result.error).toBeNull();

        const rows = renderPrinterText(machine.punchOutput)
            .split("\n")
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0);

        // The expected results are given in the programs README of the DOS distro,
        // there indented by two spaces inside the surrounding text.
        // The routine is only good to six decimal places, so the errors of a few
        // minutes near a sine of +/-1 are part of the expected answer.
        expect(rows).toEqual([
            "180  0  0  180  0  0",
            "210  0  0  210  0  0",
            "239 59 59  239 59 59",
            "269 59 58  269 53 46",
            "299 59 58  299 59 57",
            "329 59 58  329 59 58",
            "359 59 57  359 59 57",
            " 29 59 57   29 59 57",
            " 59 59 57   59 59 57",
            " 89 59 57   89 53 44",
            "119 59 56  119 59 57",
            "149 59 55  149 59 55",
            "  0  0  0    0  0  0",
            " 45  0  0   45  0  0",
            " 90  0  0   89 53 44",
            "135  0  0  135  0  0",
            "180  0  0  180  0  0",
            "225  0  0  224 59 59",
            "270  0  0  270  6 14",
            "315  0  0  315  0  1 s",
        ]);
    });
});

/**
 * The two reader switches are not independent, and it is easy to assume they
 * are: R picks the reader, U picks the tape, so U ought to decide. It does not.
 * `CSIRACEM.PAS` tests `read5 and dexist` ahead of `if ReadData`, so once the
 * primary is in, selecting the 5-hole reader with a data tape mounted reads
 * the data tape whatever U says. This pins that down, because the console
 * displays are written on the strength of it.
 */
describe("which tape the I gate reads", () => {
    function afterLoading(reader5Hole: boolean, readData: boolean): Machine {
        const machine = new Machine();
        machine.programTape = tape("ITest.cvt");
        machine.dataTape = tape("ITest.dat");
        machine.initialize();
        machine.readPrimary();
        machine.reader5Hole = reader5Hole;
        machine.readData = readData;
        return machine;
    }

    it("follows U on the 12-hole reader", () => {
        expect(afterLoading(false, false).readingDataTape).toBe(false);
        expect(afterLoading(false, true).readingDataTape).toBe(true);
    });

    it("reads the data tape on the 5-hole reader whatever U says", () => {
        expect(afterLoading(true, false).readingDataTape).toBe(true);
        expect(afterLoading(true, true).readingDataTape).toBe(true);
    });

    it("agrees with the tape the I gate actually advances", () => {
        for (const reader5Hole of [false, true]) {
            for (const readData of [false, true]) {
                const machine = afterLoading(reader5Hole, readData);
                const before = machine.dataTape!.position;
                machine.i = 0;
                // One read through the I source gate.
                machine.m[0] = fromScale32Quad(0, 0, 1, 0);
                machine.beginExecution();
                const expected = machine.readingDataTape;
                machine.s = 0;
                runToStop(machine, 1);
                const dataMoved = machine.dataTape!.position !== before;
                expect(dataMoved).toBe(expected);
            }
        }
    });

    /** With no data tape in the reader there is nothing to switch to. */
    it("stays on the program tape when no data tape is mounted", () => {
        const machine = new Machine();
        machine.programTape = tape("T712A.cvt");
        machine.initialize();
        machine.readPrimary();
        machine.reader5Hole = true;
        expect(machine.readingDataTape).toBe(false);
    });
});

describe("Interprogram", () => {
    /**
     * The whole session, as an operator works it. Interprogram directs the
     * reader switches itself, printing what it wants on the teleprinter, so this
     * follows those messages in order. It is the most demanding thing here: the
     * 5-hole reader, the 12-hole reader, the drum and the punch all have to be
     * right, and a compiler has to run on top of them.
     */
    it("compiles and runs the fourth example, and punches its table", () => {
        const machine = load("InterProgram.cvt", "Ex4.dat");

        const teleprinter = () => renderPrinterText(machine.teleprinterOutput);
        const carryOn = (limit = 1_000_000) => {
            const result = runToStop(machine, limit);
            expect(result.error).toBeNull();
        };

        // Reading the tape in asks for the drum and the 5-hole punch, and for the
        // Interprogram tape to be put in the 5-hole reader.
        expect(teleprinter()).toContain("DRUM AND FIVE HOLE PUNCH MUST BE SWITCHED ON");

        carryOn();
        expect(teleprinter()).toContain("SET DAY OF MONTH IN PL UNITS ON NB");

        // The day of the month goes on NB, in p1 units.
        machine.nb = 4;
        carryOn();

        // Then the source is read from the 5-hole reader.
        machine.reader5Hole = true;
        carryOn();
        carryOn();
        expect(teleprinter()).toContain("SWITCH TO TWELVE HOLE READER");

        machine.reader5Hole = false;
        carryOn();
        expect(teleprinter()).toContain("SWITCH TO FIVE HOLE READER FOR DATA TAPE");
        carryOn();

        // The data follows the source on the same tape.
        machine.reader5Hole = true;
        carryOn(2_000_000);

        // The results are punched, not printed. This is the table the Interprogram
        // Manual gives for this example.
        const punched = renderPrinterText(machine.punchOutput);
        expect(punched).toContain("CSIRAC INTERPROGRAM COMPILED");
        expect(punched).toContain("EXAMPLE OF OUTPUT, LAYOUT AND FUNCTION FORMATION");
        expect(punched).toContain("DATUM      LOG     EXP(LOG)    SINE      TAN  ARCTAN(TAN)");
        expect(punched).toContain(".250000  -1.38628   .250000   .707105   1.00000   .250000");
        expect(punched).toContain("-4567.94   8.42670   4566.89   .336889   .357805   .109375");
    });
});

describe("ITEST, the 5-hole input routine test", () => {
    it("leaves each converted number in A in turn", () => {
        const machine = load("ITest.cvt", "ITest.dat");

        // The reader is switched to 5-hole and the halt selector set to 4 5, so
        // the machine stops with each converted value in the accumulator.
        machine.reader5Hole = true;
        machine.triggerStop = true;
        machine.triggerAddress = fromScale32(4, 5) * P11;

        const fractions: string[] = [];
        const integers: number[] = [];
        for (let i = 0; i < 12; i++) {
            const result = runToStop(machine, 5_000_000);
            expect(result.error).toBeNull();
            fractions.push((toSigned(machine.a) / P20).toFixed(6));
            integers.push(toSigned(machine.a));
        }

        // The first five values are read as fractions, the rest as integers.
        expect(fractions.slice(0, 5)).toEqual(["-0.003456", "0.250000", "0.250000", "0.000000", "-0.739634"]);
        expect(integers.slice(5)).toEqual([2793, -45, 0, 524287, -524288, 2793 * -1, -2793]);
    });
});
