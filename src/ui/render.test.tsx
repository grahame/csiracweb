/**
 * A smoke test that the console actually renders.
 *
 * The components are rendered to static markup, which exercises the component
 * tree and the hooks without needing a browser. Effects do not run, so the
 * canvas the tubes are drawn on is left alone.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { Binary } from "./Binary";
import { App } from "./App";
import { MachineProvider } from "./MachineContext";
import { InitialSettings } from "./InitialSettings";
import { CSIRAC_TAPES, EMULATOR_TAPES, TEST_TAPES } from "./TapePicker";
import { snapshot, type MachineView } from "./useMachine";
import { Machine } from "../emulator/machine";
import { P11, fromScale32 } from "../emulator/word";

describe("Binary", () => {
    it("shows a word as ones and zeroes in groups of five, p20 first", () => {
        // p20 and p1 set.
        const markup = renderToStaticMarkup(<Binary word={0x80001} />);
        expect(markup).toContain("10000 00000 00000 00001");
    });

    it('can show blocks instead, "more like CSIRAC"', () => {
        const markup = renderToStaticMarkup(<Binary word={0x80001} asDigits={false} />);
        // A block for each one, a space for each zero, and no group separators.
        expect(markup).toContain("■");
        expect(markup).not.toContain("10000");
    });

    it("shows a ten digit register in two groups", () => {
        const markup = renderToStaticMarkup(<Binary word={0b1000000001} digits={10} />);
        expect(markup).toContain("10000 00001");
    });
});

describe("the application", () => {
    it("opens on the tape picker, listing the tapes that came with the emulator", () => {
        const markup = renderToStaticMarkup(
            <StaticRouter location="/">
                <MachineProvider>
                    <App />
                </MachineProvider>
            </StaticRouter>,
        );
        expect(markup).toContain("Sqrt.cvt");
        expect(markup).toContain("T712A.cvt");
        expect(markup).toContain("Interprogram");
        // John Spencer is credited on every screen.
        expect(markup).toContain("John W. Spencer");
    });
});

describe("the tape picker", () => {
    it("keeps the tapes punched for this emulator apart from CSIRAC's own", () => {
        // Only these three were written here; git history is the authority, and
        // they must not be passed off as programs CSIRAC ran.
        expect(EMULATOR_TAPES.map((tape) => tape.name)).toEqual(["Hoot.cvt", "Scale.cvt", "Chime.cvt"]);
        const csirac = CSIRAC_TAPES.map((tape) => tape.name);
        expect(csirac).toContain("T712A.cvt");
        expect(csirac).toContain("InterProgram.cvt");
        for (const made of EMULATOR_TAPES) expect(csirac).not.toContain(made.name);
        for (const made of EMULATOR_TAPES) {
            expect(TEST_TAPES.map((tape) => tape.name)).not.toContain(made.name);
        }
    });

    /**
     * What separates the two lists of CSIRAC's own programs is provenance: the
     * first carry the machine's own program number or the year they were
     * written, and the second carry neither. The rule is checked rather than
     * trusted, so a tape cannot drift into the wrong list.
     */
    it("sorts CSIRAC's programs by whether they carry a number or a year", () => {
        const identified = /\(T\d|\b(19|20)\d\d\)/;
        for (const tape of CSIRAC_TAPES) expect(tape.title).toMatch(identified);
        for (const tape of TEST_TAPES) expect(tape.title).not.toMatch(identified);

        // No tape may be in both, or in neither.
        const all = [...CSIRAC_TAPES, ...TEST_TAPES].map((tape) => tape.name);
        expect(new Set(all).size).toBe(all.length);
        expect(all).toContain("Sqrt.cvt");
        expect(all).toContain("T712A.cvt");
    });
});

describe("the settings screen", () => {
    /** The machine as it stands at switch on, which is what the panel showed. */
    const atSwitchOn = () => snapshot(new Machine(), 0);

    const panel = (view: MachineView) =>
        renderToStaticMarkup(
            <InitialSettings
                view={view}
                programName="SQRT.CVT"
                dataName="SQRT.DAT"
                displayD
                onAccept={() => {}}
                onOptions={() => {}}
                onTapes={() => {}}
                onBack={() => {}}
            />,
        );

    it("reproduces the control desk switch panel", () => {
        const markup = panel(atSwitchOn());
        expect(markup).toContain("The Control Desk Switch Panel settings are:");
        expect(markup).toContain("Reader Selector: 12 HOLE");
        expect(markup).toContain("NA register:  0  0  1  0");
        expect(markup).toContain("Halt Selector: OFF");
        expect(markup).toContain("SQRT.DAT");
    });

    /**
     * Reading a tape in keeps whatever the operator has set from the Options
     * menu, so the panel has to show the switches where they actually are. It
     * used to recite the switch-on positions whatever had been done to them,
     * which quietly contradicted the machine.
     */
    it("shows the switches where the operator has left them", () => {
        const machine = new Machine();
        machine.na = 7;
        machine.reader5Hole = true;
        machine.triggerStop = true;
        machine.triggerAddress = fromScale32(4, 5) * P11;
        machine.oneShot = true;

        const markup = panel(snapshot(machine, 0));
        expect(markup).toContain("NA register:  0  0  0  7");
        expect(markup).toContain("Reader Selector:  5 HOLE");
        expect(markup).toContain("Halt Selector: ON");
        expect(markup).toContain("Halt Selector address:  4  5");
        expect(markup).toContain("One Shot: ON");
    });

    it("offers no speed selector, because the control desk had none", () => {
        expect(panel(atSwitchOn())).not.toContain("Speed Selector");
    });
});
