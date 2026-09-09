/**
 * Compiling Interprogram without the ritual.
 *
 * The console's procedure — the day on NB, and the reader moved three times,
 * each move separated by a press of RETURN — is worth doing once and a
 * nuisance every time after. These check that doing it automatically gets the
 * same answers as doing it by hand, and that a source typed at a keyboard
 * rather than punched on tape is made into something the reader accepts.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { Machine } from "./machine";
import { Tape } from "./tape";
import {
    INTERPROGRAM_EXAMPLES,
    asDataTape,
    exampleLabel,
    interprogramSteps,
    runInterprogram,
    workTheConsole,
} from "./interprogram";

const TAPES = join(import.meta.dirname, "..", "..", "public", "tapes");
const read = (name: string) => readFileSync(join(TAPES, name), "utf8");
const compilerTape = read("InterProgram.cvt");

const run = (source: string, day = 7) => runInterprogram(asDataTape(source), { day, compilerTape });

const A_FIRST_PROGRAM = `     (1)  TITLE  A FIRST PROGRAM
     (2)  SYMBOLS FOR INTEGERS   NONE
     (4)  COMPILE THE FOLLOWING INTERPROGRAM
 *1    TAKE 3.5, MULTIPLY BY 2.0, OUTPUT
 *2    END OF INTERPROGRAM
`;

/**
 * The procedure itself, which is written down once and followed twice: here,
 * and by the page that shows the machine being worked through it. Neither can
 * drift away from the other, and these say what the one list has to hold.
 */
describe("the console procedure", () => {
    it("is seven presses of RETURN, with the reader moved three times", () => {
        const steps = interprogramSteps(23);

        expect(steps).toHaveLength(7);
        expect(steps.filter((step) => step.readData !== undefined)).toHaveLength(3);
        // The last one sets the compiled program going, and it does not stop.
        expect(steps.at(-1)?.runsOut).toBe(true);
        expect(steps.filter((step) => step.runsOut)).toHaveLength(1);
    });

    it("sets the day of the month once, and holds it to what NB can carry", () => {
        const nb = (day: number) =>
            interprogramSteps(day)
                .map((step) => step.nb)
                .filter((v) => v !== undefined);

        expect(nb(23)).toEqual([23]);
        expect(nb(99)).toEqual([31]);
        expect(nb(-1)).toEqual([0]);
    });

    /**
     * The reader selector follows the tape rather than being set beside it,
     * which is what the console does: how many holes a tape has is a property of
     * the tape. So moving to the source selects the 5-hole reader and moving
     * back to the compiler selects the 12-hole one, without either being said.
     */
    it("moves the reader by choosing a tape, as the console does", () => {
        const machine = new Machine();
        machine.programTape = new Tape("InterProgram.cvt", compilerTape);
        machine.dataTape = new Tape("source", asDataTape(A_FIRST_PROGRAM));
        const move = (readData: boolean) => workTheConsole(machine, { does: "", readData });

        move(true);
        expect(machine.readData).toBe(true);
        expect(machine.reader5Hole).toBe(true);

        move(false);
        expect(machine.readData).toBe(false);
        expect(machine.reader5Hole).toBe(false);
    });
});

describe("running Interprogram from typed source", () => {
    it("compiles a source and punches what it works out", () => {
        const result = run(A_FIRST_PROGRAM);

        expect(result.outcome).toBe("finished");
        expect(result.error).toBeNull();
        expect(result.punch).toContain("CSIRAC INTERPROGRAM COMPILED 7/3/21");
        expect(result.punch).toContain("A FIRST PROGRAM");
        // 3.5 x 2, to the six figures Interprogram works to.
        expect(result.punch).toContain("7.00002");
    });

    it("heads the listing with the day of the month it was given", () => {
        expect(run(A_FIRST_PROGRAM, 23).punch).toContain("COMPILED 23/3/21");
    });

    /** A Flexowriter had no lower case, so what is typed is put into upper. */
    it("accepts a source typed in lower case", () => {
        const result = run(A_FIRST_PROGRAM.toLowerCase());
        expect(result.outcome).toBe("finished");
        expect(result.punch).toContain("7.00002");
    });

    it("runs a program that reads its own data", () => {
        const result = run(`     (1)  TITLE  SQUARES
     (2)  SYMBOLS FOR INTEGERS   NONE
     (4)  COMPILE THE FOLLOWING INTERPROGRAM
 *1    INPUT X
 *2    TAKE X, MULTIPLY BY X, OUTPUT
 *9    END OF INTERPROGRAM
     3.0
`);
        expect(result.punch).toContain("9.00003");
    });

    /**
     * The compiler does not always stop at a statement it cannot parse, so the
     * budget is what brings the run back. What matters is that its complaint
     * reaches the operator rather than being lost among the prompts.
     */
    it("reports the compiler's own complaint about a statement it cannot parse", () => {
        const result = run(`     (1)  TITLE  BROKEN
     (2)  SYMBOLS FOR INTEGERS   NONE
     (4)  COMPILE THE FOLLOWING INTERPROGRAM
 *1    FLURBLE THE WOTSIT
 *2    END OF INTERPROGRAM
`);
        expect(result.messages).toContain("OPERATION NOT IN DIRECTORY");
    });

    /** The prompts are the procedure being skipped, so they are not messages. */
    it("keeps the operator prompts out of the messages", () => {
        const result = run(A_FIRST_PROGRAM);
        expect(result.teleprinter).toContain("DRUM AND FIVE HOLE PUNCH MUST BE SWITCHED ON");
        expect(result.messages).toEqual([]);
    });

    /**
     * The one thing about tape that a typed source cannot be expected to know.
     * The compiler copies the title to the punch and blank tape is what stops
     * it; with spaces in its place the run dies part way through the first pass.
     */
    it("puts blank tape after the title, without which nothing compiles", () => {
        expect(asDataTape(A_FIRST_PROGRAM).split("\r\n")[1]).toMatch(/^bbbbb/);

        const withoutBlank = asDataTape(A_FIRST_PROGRAM).replace(/^bbbbb/m, "     ");
        const result = runInterprogram(withoutBlank, { day: 7, compilerTape });
        expect(result.outcome).not.toBe("finished");
        expect(result.punch).not.toContain("COMPILED");
    });

    /**
     * The same session an operator works at the console, so a tape off the shelf
     * has to give the table the Interprogram Manual prints for it. This is the
     * check that the automatic procedure is the manual one.
     */
    it("gives an Ex tape the same results as working it by hand", () => {
        const result = runInterprogram(read("Ex4.dat"), { day: 4, compilerTape });

        expect(result.outcome).toBe("finished");
        expect(result.punch).toContain("EXAMPLE OF OUTPUT, LAYOUT AND FUNCTION FORMATION");
        expect(result.punch).toContain(".250000  -1.38628   .250000   .707105   1.00000   .250000");
        expect(result.punch).toContain("-4567.94   8.42670   4566.89   .336889   .357805   .109375");
    });
});

/**
 * The examples offered on the Interprogram page, which are the tapes that came
 * with the compiler rather than anything typed.
 */
describe("the example tapes", () => {
    /**
     * They are listed by title before any of them has been fetched, so the
     * titles are written down twice: once on the tape, and once in the list.
     * This is what keeps the second copy honest.
     */
    it("are listed under the title punched on the tape", () => {
        for (const example of INTERPROGRAM_EXAMPLES) {
            const first = read(example.name).split(/\r\n|\n/)[0];
            expect(first).toContain(`TITLE  ${example.title}`);
        }
    });

    it("are named by tape and by title, so neither has to be guessed at", () => {
        expect(exampleLabel(INTERPROGRAM_EXAMPLES[1])).toBe("Ex2.dat — INTEREST CALC");
    });

    /**
     * Loading one into the editor and pressing Run is the same session as
     * mounting the tape at the console, and has to give the same answers. It
     * only does because `asDataTape` leaves a tape alone: putting one through
     * the treatment a typed source gets turns its `b`, `e` and `l` codes into
     * letters, which quietly changes the data Ex2 and Ex3 read and stops Ex4
     * compiling at all.
     */
    it("compile to the same thing whether mounted or put in the editor", () => {
        for (const { name } of INTERPROGRAM_EXAMPLES) {
            const tape = read(name);
            const mounted = runInterprogram(tape, { day: 4, compilerTape });
            const edited = runInterprogram(asDataTape(tape), { day: 4, compilerTape });

            expect(mounted.outcome).toBe("finished");
            expect(edited.punch).toBe(mounted.punch);
        }
    });
});
