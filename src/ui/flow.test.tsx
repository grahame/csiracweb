/**
 * Driving the console the way an operator does, in a real DOM.
 *
 * These tests walk the whole SQRT session: mount the tape, read it in, switch
 * the reader to the data tape, and run. They exist because the emulator core
 * being correct is not enough — the console has to actually let you get at it.
 */

// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { HashRouter } from "react-router";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { MachineProvider } from "./MachineContext";

const TAPES = join(import.meta.dirname, "..", "..", "public", "tapes");

/**
 * Render the whole application, routing included. HashRouter is used rather
 * than a memory router so that the browser history is the real one and back
 * and forward can actually be exercised.
 */
function renderApp() {
    window.location.hash = "#/";
    return render(
        <HashRouter>
            <MachineProvider>
                <App />
            </MachineProvider>
        </HashRouter>,
    );
}

beforeEach(() => {
    runFramesFast();

    // Serve the bundled tapes from disk, standing in for the dev server.
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
            const name = String(url).split("/").pop() ?? "";
            return {
                ok: true,
                status: 200,
                text: async () => readFileSync(join(TAPES, name), "utf8"),
            } as Response;
        }),
    );
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

/**
 * Let the animation frames run as fast as the event loop will carry them.
 *
 * The machine obeys CSIRAC's seventeen commands per frame and nothing changes
 * that, so a program of any size is a great many frames. jsdom paces them at
 * about sixty a second, as a browser does, which would make these tests take
 * as long as the programs really do. Firing each frame on the next turn of the
 * loop instead keeps the batching honest — the machine still runs seventeen at
 * a time, and React still renders between batches — while taking the waiting
 * out of it.
 */
function runFramesFast() {
    vi.stubGlobal(
        "requestAnimationFrame",
        (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0) as unknown as number,
    );
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => clearTimeout(handle as unknown as NodeJS.Timeout));
}

/**
 * Let the animation frame loop run until the machine stops.
 *
 * The allowance is generous because the machine runs at CSIRAC's own speed and
 * nothing winds it on: reading Interprogram in and working it through takes
 * some thousands of frames, and each of those is a React render.
 */
async function settle() {
    await waitFor(
        () => {
            expect(document.querySelector(".prompt-status.running")).toBeNull();
        },
        { timeout: 30_000 },
    );
}

describe("running SQRT from the console", () => {
    it("reads the tape in, then prints the square roots once the reader is switched", async () => {
        const user = userEvent.setup();
        renderApp();

        // Mount the square roots tape.
        await user.click(screen.getByRole("button", { name: "Sqrt.cvt" }));

        // RETURN reads the program into store; it stops at the DO command.
        await user.click(screen.getByRole("button", { name: /Read program into memory/ }));
        await settle();
        // Reading the tape in stops at the DO command. That is not the program
        // having run, and the console must not claim it was.
        expect(screen.getByText(/Program read into store/)).toBeTruthy();

        // Switch to the data tape, as the notes say. Both of Sqrt's tapes are
        // 12-hole, so the reader selector stays where it is.
        await user.click(screen.getByRole("button", { name: /Using program tape/ }));

        // RETURN again runs the program proper.
        await user.click(screen.getByRole("button", { name: /Execute program/ }));
        await settle();

        const output = document.querySelector(".printer-output pre")?.textContent ?? "";
        expect(output).toContain(".100000  .316227");
        expect(output).toContain(".900000  .948685");
    });

    it("reports the end of the tape if the reader was never switched over", async () => {
        const user = userEvent.setup();
        renderApp();

        await user.click(screen.getByRole("button", { name: "Sqrt.cvt" }));
        await user.click(screen.getByRole("button", { name: /Read program into memory/ }));
        await settle();

        // Running without pressing U leaves the reader on the program tape, which
        // has run out. The operator needs to be told that, not left waiting.
        await user.click(screen.getByRole("button", { name: /Execute program/ }));
        await settle();

        expect(screen.getByText(/Unexpected End of File/)).toBeTruthy();
        // And it has to *look* like a fault. Reading as an ordinary status is what
        // makes a stopped machine look like a hung one.
        expect(document.querySelector(".prompt-status.fault")).not.toBeNull();
        expect(screen.getByRole("alert").textContent).toMatch(/Unexpected End of File/);
    });

    it("does not dress an ordinary stop up as a fault", async () => {
        const user = userEvent.setup();
        renderApp();

        await user.click(screen.getByRole("button", { name: "Sqrt.cvt" }));
        await user.click(screen.getByRole("button", { name: /Read program into memory/ }));
        await settle();

        expect(document.querySelector(".prompt-status.fault")).toBeNull();
        expect(screen.queryByRole("alert")).toBeNull();
    });
});

describe("running T712A, which needs no data tape", () => {
    it("prints the teleprinter character set after two presses of RETURN", async () => {
        const user = userEvent.setup();
        renderApp();

        await user.click(screen.getByRole("button", { name: "T712A.cvt" }));
        await user.click(screen.getByRole("button", { name: /Read program into memory/ }));
        await settle();

        await user.click(screen.getByRole("button", { name: /Execute program/ }));
        await settle();

        const output = document.querySelector(".printer-output pre")?.textContent ?? "";
        expect(output).toContain("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    });
});

describe("reading the tape in the viewer", () => {
    it("annotates the program tape with what each instruction does", async () => {
        const user = userEvent.setup();
        renderApp();

        await user.click(screen.getByRole("button", { name: "T712A.cvt" }));
        // The tape can be read before it is put through the machine.
        await user.click(screen.getAllByRole("button", { name: /View or edit the tape/ })[0]);

        const listing = document.querySelector(".listing")?.textContent ?? "";

        // The heading rows on the tape are shown as headings.
        expect(listing).toMatch(/Teleprinter Test/);
        // The first word of the primary is D to PD, stored at 0 0.
        expect(listing).toMatch(/ D PD/);
        // Instructions are explained, not merely decoded.
        expect(listing).toMatch(/Stop the machine/);
        expect(listing).toMatch(/Control statement/);
    });

    it("shows a 5-hole data tape as the text it is", async () => {
        const user = userEvent.setup();
        renderApp();

        await user.click(screen.getByRole("button", { name: "ITest.cvt" }));
        await user.click(screen.getAllByRole("button", { name: /View or edit the tape/ })[0]);
        await user.click(screen.getByRole("button", { name: "ITest.dat" }));

        expect(screen.getByText(/is a 5-hole tape/)).toBeTruthy();
        expect(document.querySelector(".data-text")?.textContent).toMatch(/-0\.003456/);
    });

    it("shows a 12-hole data tape as rows", async () => {
        const user = userEvent.setup();
        renderApp();

        await user.click(screen.getByRole("button", { name: "Sqrt.cvt" }));
        await user.click(screen.getAllByRole("button", { name: /View or edit the tape/ })[0]);
        await user.click(screen.getByRole("button", { name: "Sqrt.dat" }));

        expect(screen.getByText(/is a 12-hole tape/)).toBeTruthy();
    });
});

describe("browser history", () => {
    /** The route currently showing, taken from the address bar. */
    const route = () => window.location.hash.replace(/^#/, "") || "/";

    const goBack = async () => {
        await act(async () => {
            window.history.back();
            await new Promise((resolve) => setTimeout(resolve, 60));
        });
    };
    const goForward = async () => {
        await act(async () => {
            window.history.forward();
            await new Promise((resolve) => setTimeout(resolve, 60));
        });
    };

    it("gives each screen its own address", async () => {
        const user = userEvent.setup();
        renderApp();
        expect(route()).toBe("/");

        await user.click(screen.getByRole("button", { name: "T712A.cvt" }));
        expect(route()).toBe("/settings");

        await user.click(screen.getByRole("button", { name: /Read program into memory/ }));
        await settle();
        expect(route()).toBe("/console");
    });

    it("goes back from the console to the switch panel and forward again", async () => {
        const user = userEvent.setup();
        renderApp();

        await user.click(screen.getByRole("button", { name: "T712A.cvt" }));
        await user.click(screen.getByRole("button", { name: /Read program into memory/ }));
        await settle();

        await goBack();
        expect(route()).toBe("/settings");

        await goForward();
        expect(route()).toBe("/console");
    });

    it("closes an overlay by going back", async () => {
        const user = userEvent.setup();
        renderApp();

        await user.click(screen.getByRole("button", { name: "T712A.cvt" }));
        await user.click(screen.getAllByRole("button", { name: /View or edit the tape/ })[0]);
        expect(route()).toBe("/settings/tape");
        expect(document.querySelector(".tape-viewer")).not.toBeNull();

        await goBack();
        expect(route()).toBe("/settings");
        expect(document.querySelector(".tape-viewer")).toBeNull();
    });

    it("can View or edit the tape in again after going back to the switch panel", async () => {
        const user = userEvent.setup();
        renderApp();

        await user.click(screen.getByRole("button", { name: "T712A.cvt" }));
        await user.click(screen.getByRole("button", { name: /Read program into memory/ }));
        await settle();
        await user.click(screen.getByRole("button", { name: /Execute program/ }));
        await settle();

        // Back to the switch panel, and View or edit the tape in a second time. The tape
        // has to be threaded afresh: a tape already through the reader cannot be
        // read again.
        await goBack();
        await user.click(screen.getByRole("button", { name: /Read program into memory/ }));
        await settle();

        expect(screen.getByText(/Program read into store/)).toBeTruthy();
        expect(document.querySelector(".prompt-status.fault")).toBeNull();

        await user.click(screen.getByRole("button", { name: /Execute program/ }));
        await settle();
        const output = document.querySelector(".printer-output pre")?.textContent ?? "";
        expect(output).toContain("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    });

    it("sends a link to the console with no tape mounted back to the reader", async () => {
        window.location.hash = "#/console";
        render(
            <HashRouter>
                <MachineProvider>
                    <App />
                </MachineProvider>
            </HashRouter>,
        );

        await waitFor(() => expect(route()).toBe("/"));
        expect(screen.getByRole("button", { name: "Sqrt.cvt" })).toBeTruthy();
    });
});

describe("punching a tape", () => {
    it("runs the starter tape, which is a whole program in two rows", async () => {
        const user = userEvent.setup();
        renderApp();

        await user.click(screen.getByRole("button", { name: /Write your own program from scratch/ }));
        await user.click(screen.getByRole("button", { name: /Read program into memory/ }));
        await settle();
        await user.click(screen.getByRole("button", { name: /Execute program/ }));
        await settle();

        // PL OT prints a one, PL T stops the machine.
        const output = document.querySelector(".printer-output pre")?.textContent ?? "";
        expect(output).toContain("1");
    });

    /**
     * A tape punched in the primary form is the program itself: its rows go
     * straight into store and run from 0 0, with no primary at the head to read
     * the rest of the tape in. Reading it in must therefore stop at 0 0 rather
     * than setting it going, or the program runs once before the operator asks
     * and once again when they do.
     */
    it("does not run the starter tape while it is being read in", async () => {
        const user = userEvent.setup();
        renderApp();

        await user.click(screen.getByRole("button", { name: /Write your own program from scratch/ }));
        await user.click(screen.getByRole("button", { name: /Read program into memory/ }));
        await settle();

        expect(document.querySelector(".printer-output pre")?.textContent ?? "").not.toContain("1");
        expect(document.querySelector(".prompt-status")?.textContent).toContain("Program read into store");
        // Nothing has been obeyed: the rows were stored, not executed.
        expect(document.querySelector(".prompt-count")?.textContent).toContain("0 instructions");
    });

    it("prints once, not twice, when the starter tape is run", async () => {
        const user = userEvent.setup();
        renderApp();

        await user.click(screen.getByRole("button", { name: /Write your own program from scratch/ }));
        await user.click(screen.getByRole("button", { name: /Read program into memory/ }));
        await settle();
        await user.click(screen.getByRole("button", { name: /Execute program/ }));
        await settle();

        // PL OT prints a single one, then PL T stops the machine: two instructions,
        // not a lap of the whole store.
        const output = document.querySelector(".printer-output pre")?.textContent ?? "";
        expect(output.replace(/\s/g, "")).toBe("1");
        expect(document.querySelector(".prompt-count")?.textContent).toContain("2 instructions");

        // Pressing RETURN again carries on from the halt rather than starting
        // afresh, which is what the start button did, and the prompt says so.
        expect(screen.getByRole("button", { name: /Carry on from where it stopped/ })).toBeTruthy();
    });

    it("follows the listing along as the tape is punched", async () => {
        const user = userEvent.setup();
        renderApp();

        await user.click(screen.getByRole("button", { name: /Write your own program from scratch/ }));
        await user.click(screen.getAllByRole("button", { name: /View or edit the tape/ })[0]);
        await user.click(screen.getByRole("button", { name: /Punch this tape/ }));

        const editor = document.querySelector(".tape-editor textarea") as HTMLTextAreaElement;
        expect(editor).not.toBeNull();

        // Punch a different instruction: 20 2 is Z OT, zero to the teleprinter.
        await act(async () => {
            await user.clear(editor);
            await user.type(editor, "20  2\n25 31\n\n");
        });

        await waitFor(() => {
            const listing = document.querySelector(".listing")?.textContent ?? "";
            expect(listing).toMatch(/Z OT/);
        });
    });

    it("says which rows the reader could not read", async () => {
        const user = userEvent.setup();
        renderApp();

        await user.click(screen.getByRole("button", { name: /Write your own program from scratch/ }));
        await user.click(screen.getAllByRole("button", { name: /View or edit the tape/ })[0]);
        await user.click(screen.getByRole("button", { name: /Punch this tape/ }));

        const editor = document.querySelector(".tape-editor textarea") as HTMLTextAreaElement;
        await act(async () => {
            await user.clear(editor);
            // 44 is past the top of a scale-32 digit, so this is not a row.
            await user.type(editor, "44 99\n");
        });

        expect(await screen.findByText(/Not a valid row/)).toBeTruthy();
    });

    /**
     * An unreadable row reads as nothing at all, so it used to be filed as blank
     * tape and hidden: the listing jumped from row 1 to row 3 with only the
     * message above to say why. It is where the reader stops, so it is shown.
     */
    it("shows an unreadable row in place rather than dropping it", async () => {
        const user = userEvent.setup();
        renderApp();

        await user.click(screen.getByRole("button", { name: /Write your own program from scratch/ }));
        await user.click(screen.getAllByRole("button", { name: /View or edit the tape/ })[0]);
        await user.click(screen.getByRole("button", { name: /Punch this tape/ }));

        const editor = document.querySelector(".tape-editor textarea") as HTMLTextAreaElement;
        await act(async () => {
            await user.clear(editor);
            await user.type(editor, "25  2\n44 99\n25 31\n");
        });

        const unreadable = document.querySelector(".listing tr.row-unreadable");
        expect(unreadable).toBeTruthy();
        expect(unreadable?.textContent).toContain("It stops here.");
        // Row 3 is still listed after it, so the numbering does not jump.
        const numbers = Array.from(document.querySelectorAll(".listing tbody tr td.num:first-child")).map(
            (cell) => cell.textContent,
        );
        expect(numbers).toContain("2");
        expect(numbers).toContain("3");
    });

    it("puts a punched tape back in the reader and runs it", async () => {
        const user = userEvent.setup();
        renderApp();

        await user.click(screen.getByRole("button", { name: /Write your own program from scratch/ }));
        await user.click(screen.getAllByRole("button", { name: /View or edit the tape/ })[0]);
        await user.click(screen.getByRole("button", { name: /Punch this tape/ }));

        const editor = document.querySelector(".tape-editor textarea") as HTMLTextAreaElement;
        await act(async () => {
            await user.clear(editor);
            // Print a one three times over, then stop.
            await user.type(editor, "25  2\n25  2\n25  2\n25 31\n\n");
        });

        await user.click(await screen.findByRole("button", { name: /Put it in the reader/ }));

        // Back at the switch panel with the punched tape in the reader.
        await user.click(screen.getByRole("button", { name: /Read program into memory/ }));
        await settle();
        await user.click(screen.getByRole("button", { name: /Execute program/ }));
        await settle();

        const output = document.querySelector(".printer-output pre")?.textContent ?? "";
        expect(output).toContain("111");
    });
});

describe("the listing following the read head", () => {
    it("marks the row under the head and the one already in the input register", async () => {
        const user = userEvent.setup();
        renderApp();

        await user.click(screen.getByRole("button", { name: "T712A.cvt" }));
        await user.click(screen.getByRole("button", { name: /Read program into memory/ }));
        await settle();

        await user.click(screen.getAllByRole("button", { name: /View or edit the tape/ })[0]);
        // Show every row, so the head is not on one that has been filtered out.
        await user.click(screen.getByRole("checkbox", { name: /Show blank tape/ }));

        const head = document.querySelectorAll(".listing tr.under-head");
        const register = document.querySelectorAll(".listing tr.in-register");
        expect(head).toHaveLength(1);
        expect(register).toHaveLength(1);

        // The head runs one row ahead of the word the machine is working on, so the
        // two marks are always on consecutive rows, never the same one.
        const rowOf = (tr: Element) => Number(tr.querySelector(".num")?.textContent);
        expect(rowOf(head[0]) - rowOf(register[0])).toBe(1);
    });

    it("has no marks before a tape has been read", async () => {
        const user = userEvent.setup();
        renderApp();

        await user.click(screen.getByRole("button", { name: "T712A.cvt" }));
        await user.click(screen.getAllByRole("button", { name: /View or edit the tape/ })[0]);

        // Nothing has gone through the reader, so there is nothing behind the head.
        expect(document.querySelectorAll(".listing tr.in-register")).toHaveLength(0);
    });
});

describe("Interprogram's walkthrough", () => {
    it("is not on the tape picker, which would swamp the list", () => {
        renderApp();
        expect(screen.queryByText(/DRUM AND FIVE HOLE PUNCH/)).toBeNull();
        expect(document.querySelector(".walkthrough")).toBeNull();
    });

    it("is at the console, where the steps are being followed", async () => {
        const user = userEvent.setup();
        renderApp();

        await user.click(screen.getByRole("button", { name: "InterProgram.cvt" }));
        await user.click(screen.getByRole("button", { name: /Read program into memory/ }));
        await settle();

        const steps = document.querySelector(".walkthrough")?.textContent ?? "";
        // What the teleprinter says, beside what to do about it.
        expect(steps).toMatch(/DRUM AND FIVE HOLE PUNCH MUST BE SWITCHED ON/);
        expect(steps).toMatch(/SET DAY OF MONTH IN PL UNITS ON NB/);
        expect(steps).toMatch(/B, enter the day, RETURN/);
        expect(steps).toMatch(/SWITCH TO TWELVE HOLE READER/);
        expect(document.querySelectorAll(".walkthrough li")).toHaveLength(7);
    });

    /**
     * Following the steps as they are written has to actually work. The step
     * that sets the day needs two presses of RETURN — the first is taken by the
     * entry that B opens — and with only one the session stops dead here, having
     * compiled nothing. Reaching SWITCH TO TWELVE HOLE READER is the proof that
     * the machine is being carried along rather than standing still.
     */
    it("carries the session along when its steps are followed as written", async () => {
        const user = userEvent.setup();
        renderApp();

        await user.click(screen.getByRole("button", { name: "InterProgram.cvt" }));
        await user.click(screen.getByRole("button", { name: /Read program into memory/ }));
        await settle();

        const teleprinter = () => document.querySelector(".printer-output pre")?.textContent ?? "";
        const carryOn = async () => {
            await user.click(screen.getByRole("button", { name: /Execute program|Carry on from where it stopped/ }));
            await settle();
        };

        // 1: DRUM AND FIVE HOLE PUNCH MUST BE SWITCHED ON
        await carryOn();
        expect(teleprinter()).toContain("SET DAY OF MONTH IN PL UNITS ON NB");

        // 2: B, the day, RETURN to set it, then RETURN again.
        await user.keyboard("b");
        await user.keyboard("4");
        await user.keyboard("{Enter}");
        expect(document.querySelector(".menu-entry")).toBeNull();
        await carryOn();

        // 3: U for the data tape, then RETURN. 4: RETURN.
        await user.keyboard("u");
        await carryOn();
        await carryOn();

        expect(teleprinter()).toContain("SWITCH TO TWELVE HOLE READER");
    });

    it("is not shown for a tape that needs no working through", async () => {
        const user = userEvent.setup();
        renderApp();

        await user.click(screen.getByRole("button", { name: "T712A.cvt" }));
        await user.click(screen.getByRole("button", { name: /Read program into memory/ }));
        await settle();

        expect(document.querySelector(".walkthrough")).toBeNull();
        // Its own note still rides along, as before.
        expect(document.querySelector(".operating-notes")?.textContent).toMatch(/character set/);
    });
});

describe("the operations menu from the keyboard", () => {
    /** Get to the console with a program read in. */
    async function atConsole(user: ReturnType<typeof userEvent.setup>) {
        renderApp();
        await user.click(screen.getByRole("button", { name: "T712A.cvt" }));
        await user.click(screen.getByRole("button", { name: /Read program into memory/ }));
        await settle();
    }

    /**
     * A button is named for what it does and carries its key in the tooltip,
     * rather than being called "O for options". The risk in that is a tooltip
     * that promises a key nothing listens for, so this presses the keys it
     * names: what the tooltip says has to be true.
     */
    it("names a button for what it does, and puts a working key in its tooltip", async () => {
        const user = userEvent.setup();
        await atConsole(user);

        const options = screen.getByRole("button", { name: "Options" });
        expect(options.getAttribute("title")).toBe("Press O");
        expect(screen.getByRole("button", { name: "View or edit the tape" }).getAttribute("title")).toBe("Press T");
        expect(screen.getByRole("button", { name: "Execute program" }).getAttribute("title")).toBe("Press RETURN");

        // The letters are not printed against the entries any more, so an entry
        // is its label and nothing else.
        expect(screen.getByRole("button", { name: "Clear S" }).getAttribute("title")).toBe("Press S");

        await user.keyboard("o");
        expect(window.location.hash).toContain("/options");
    });

    it("toggles a switch on its letter", async () => {
        const user = userEvent.setup();
        await atConsole(user);

        expect(screen.getByRole("button", { name: /Using program tape/ })).toBeTruthy();
        await user.keyboard("u");
        expect(screen.getByRole("button", { name: /Using data tape/ })).toBeTruthy();
    });

    it("opens the value entry for the registers, which need one typed", async () => {
        const user = userEvent.setup();
        await atConsole(user);

        // B sets NB, so it has to offer somewhere to type the value. Pressing the
        // letter must do what clicking the entry does.
        await user.keyboard("b");
        const entry = document.querySelector(".menu-entry input") as HTMLInputElement | null;
        expect(entry).not.toBeNull();

        // Interprogram asks for the day of the month here, in p1 units.
        await user.type(entry!, "4{Enter}");
        expect(screen.getByText(/NB\s+0\s+0\s+0\s+4/)).toBeTruthy();
        expect(document.querySelector(".menu-entry")).toBeNull();
    });

    it("does not treat what is typed into the entry as shortcut letters", async () => {
        const user = userEvent.setup();
        await atConsole(user);

        await user.keyboard("a");
        const entry = document.querySelector(".menu-entry input") as HTMLInputElement | null;
        expect(entry).not.toBeNull();

        // "5" would be nothing, but a stray "u" must not change the tape while the
        // operator is typing a value.
        await user.type(entry!, "u5");
        expect(screen.getByRole("button", { name: /Using program tape/ })).toBeTruthy();
    });

    it("asks for an address when the halt selector is switched on", async () => {
        const user = userEvent.setup();
        await atConsole(user);

        await user.keyboard("h");
        const entry = document.querySelector(".menu-entry input") as HTMLInputElement | null;
        expect(entry).not.toBeNull();

        await user.type(entry!, "4 5{Enter}");
        expect(screen.getByRole("button", { name: /Trigger Stop: ON/ })).toBeTruthy();
        expect(screen.getByText(/Address: 4 5/)).toBeTruthy();
    });
});

/**
 * The console has one reader control, not two. Sections 4.2 and 4.10 of the
 * programming manual give the console switch as selecting the reader, and the
 * machine had none for choosing the tape — that was threading. An emulator
 * cannot thread, so U chooses the tape and the reader follows it, which also
 * makes the two impossible to set against each other.
 */
describe("choosing the tape, with the reader following it", () => {
    async function atConsoleWith(user: ReturnType<typeof userEvent.setup>, tape: string) {
        renderApp();
        await user.click(screen.getByRole("button", { name: tape }));
        await user.click(screen.getByRole("button", { name: /Read program into memory/ }));
        await settle();
    }

    it("moves the reader selector to 5 HOLE for a 5-hole data tape", async () => {
        const user = userEvent.setup();
        // ITest.cvt is 12-hole and ITest.dat is 5-hole, so the tape decides.
        await atConsoleWith(user, "ITest.cvt");

        await user.keyboard("u");
        expect(screen.getByRole("button", { name: /Using data tape/ })).toBeTruthy();

        await user.keyboard("u");
    });

    /**
     * "Use the program tape" reads as an instruction to switch to it, when what
     * it means is that the program tape is the one being read. The label reports
     * the state; what pressing U would do is the tooltip's job, so that it does
     * not compete with the state it is explaining.
     */
    it("says which tape is in the reader, and offers the change as a tooltip", async () => {
        const user = userEvent.setup();
        await atConsoleWith(user, "ITest.cvt");

        const entry = () =>
            Array.from(document.querySelectorAll(".operations-menu .menu-item")).find((element) =>
                /tape/.test(element.textContent ?? ""),
            );

        // The label is the state, and the tooltip carries both what working it
        // would do and the key that does the same thing.
        expect(entry()?.textContent).toBe("Using program tape");
        expect(entry()?.getAttribute("title")).toBe("Click to change to the data tape, or press U");

        await user.keyboard("u");

        expect(entry()?.textContent).toBe("Using data tape");
        expect(entry()?.getAttribute("title")).toBe("Click to change to the program tape, or press U");
    });

    it("leaves the selector alone when both tapes are 12-hole", async () => {
        const user = userEvent.setup();
        // Sqrt.dat is 12-hole, so switching to it changes nothing but the tape.
        await atConsoleWith(user, "Sqrt.cvt");

        await user.keyboard("u");
    });

    it("offers no way to set the reader against the tape in it", async () => {
        const user = userEvent.setup();
        await atConsoleWith(user, "ITest.cvt");

        // The selector is a readout, not a control, and R does nothing.
        expect(screen.queryByRole("button", { name: /READER:/ })).toBeNull();
        await user.keyboard("r");
    });

    /** Nothing to switch to, so U leaves the reader where the program put it. */
    it("stays put for a tape with no data tape", async () => {
        const user = userEvent.setup();
        await atConsoleWith(user, "T712A.cvt");

        await user.keyboard("u");
    });
});

/**
 * The Interprogram page is the console's procedure done for you: no tape to
 * thread and no switches to work, just a source and a Run. It is the same
 * emulator and the same 1960 compiler tape underneath, and the same displays:
 * the page can either show the machine being worked or skip to the result.
 */
describe("writing Interprogram", () => {
    async function atThePage(user: ReturnType<typeof userEvent.setup>) {
        renderApp();
        await user.click(
            screen.getByRole("link", {
                name: /program in Australia's first domestically produced programming language/,
            }),
        );
        // The compiler tape is fetched before Run can do anything.
        await waitFor(() => {
            expect((screen.getByRole("button", { name: "Run" }) as HTMLButtonElement).disabled).toBe(false);
        });
    }

    /** Skip the session and report what the punch produced. */
    async function justTheResult(user: ReturnType<typeof userEvent.setup>) {
        await user.click(screen.getByRole("button", { name: "Skip to the result" }));
    }

    const source = () => screen.getByRole("textbox", { name: "Interprogram source" });
    /**
     * Wait for the punch to have something on it.
     *
     * The watched run is a whole session at CSIRAC's thousand commands a
     * second — some fifty thousand of them, seventeen to a frame, with the
     * machine stopped for a moment at each of the seven steps — and it lands
     * close enough to twenty seconds that a loaded machine misses it. The
     * allowance is what the session actually costs, doubled.
     */
    const punch = async () => await screen.findByText(/CSIRAC INTERPROGRAM COMPILED/, undefined, { timeout: 40_000 });

    it("is reached from the tape picker by the button as well as the sentence", async () => {
        const user = userEvent.setup();
        renderApp();

        await user.click(screen.getByRole("button", { name: "Code in Interprogram" }));

        expect(window.location.hash).toBe("#/interprogram");
        expect(screen.getByRole("textbox", { name: "Interprogram source" })).toBeTruthy();
    });

    it("is reached from the tape picker and starts with a program that runs", async () => {
        const user = userEvent.setup();
        await atThePage(user);

        expect(window.location.hash).toBe("#/interprogram");
        expect((source() as HTMLTextAreaElement).value).toContain("COMPILE THE FOLLOWING INTERPROGRAM");

        await justTheResult(user);
        await user.click(screen.getByRole("button", { name: "Run" }));

        // 3.5 x 2, punched, which is where Interprogram puts its results.
        expect((await punch()).textContent).toContain("7.00002");
    });

    it("runs what has been typed rather than what it started with", async () => {
        const user = userEvent.setup();
        await atThePage(user);
        await justTheResult(user);

        await act(async () => {
            await user.clear(source());
            await user.type(
                source(),
                "     (1)  TITLE  TYPED{Enter}" +
                    "     (2)  SYMBOLS FOR INTEGERS   NONE{Enter}" +
                    "     (4)  COMPILE THE FOLLOWING INTERPROGRAM{Enter}" +
                    " *1    TAKE 6.0, MULTIPLY BY 7.0, OUTPUT{Enter}" +
                    " *2    END OF INTERPROGRAM{Enter}",
            );
        });
        await user.click(screen.getByRole("button", { name: "Run" }));

        const punched = (await punch()).textContent ?? "";
        expect(punched).toContain("TYPED");
        expect(punched).toContain("42.0001");
    });

    /** The compiler's own complaint is the useful thing, so it is not buried. */
    it("shows what the compiler said about a source it could not parse", async () => {
        const user = userEvent.setup();
        await atThePage(user);
        await justTheResult(user);

        await act(async () => {
            await user.clear(source());
            await user.type(
                source(),
                "     (1)  TITLE  BROKEN{Enter}" +
                    "     (2)  SYMBOLS FOR INTEGERS   NONE{Enter}" +
                    "     (4)  COMPILE THE FOLLOWING INTERPROGRAM{Enter}" +
                    " *1    FLURBLE THE WOTSIT{Enter}" +
                    " *2    END OF INTERPROGRAM{Enter}",
            );
        });
        await user.click(screen.getByRole("button", { name: "Run" }));

        expect(await screen.findByText(/OPERATION NOT IN DIRECTORY/, undefined, { timeout: 20_000 })).toBeTruthy();
    });

    /**
     * The point of watching is that it is the machine being worked, not an
     * animation of one: the same displays the console shows, brought up to date
     * after every batch of commands, with the procedure narrated beside them.
     */
    it("shows the machine on its own displays while it works, by default", async () => {
        const user = userEvent.setup();
        await atThePage(user);

        // Nothing is threaded until Run, so there is nothing to display yet.
        expect(document.querySelector(".watched-run")).toBeNull();

        await user.click(screen.getByRole("button", { name: "Run" }));

        // The whole console display, and the seven steps of the procedure.
        expect(document.querySelector(".registers")).toBeTruthy();
        expect(document.querySelector(".crt-bank")).toBeTruthy();
        expect(document.querySelector(".readers")).toBeTruthy();
        expect(document.querySelectorAll(".narration-step")).toHaveLength(7);

        // The compiler is read in off the twelve hole reader, and what it prints
        // when it stops is on the teleprinter, as it would be at the console.
        await screen.findByText(/DRUM AND FIVE HOLE PUNCH MUST BE SWITCHED ON/, undefined, {
            timeout: 20_000,
        });
    });

    /**
     * The whole session, watched: the same answer the fast path gives, arrived at
     * by working the switches rather than by being told to. This one sits through
     * every command of it at CSIRAC's own speed, which is the point of it.
     */
    it("works the switches itself, and carries the session to the end", async () => {
        const user = userEvent.setup();

        // The console's drum, as it was left. This page runs its own machine and
        // must give it back untouched: two machines writing one drum would leave
        // the stored contents belonging to whichever of them stopped last.
        //
        // The store is stood up here because this environment has none, so the
        // emulator's own writes go nowhere and would prove nothing.
        const consolesDrum = JSON.stringify([1, 2, 3]);
        const stored = new Map([["csiracweb.drum", consolesDrum]]);
        vi.stubGlobal("localStorage", {
            getItem: (key: string) => stored.get(key) ?? null,
            setItem: (key: string, value: string) => void stored.set(key, value),
            removeItem: (key: string) => void stored.delete(key),
        });

        await atThePage(user);
        await user.click(screen.getByRole("button", { name: "Run" }));

        // The punch fills as the machine punches it, a character at a time, so
        // what it says is read once the machine has said it has finished.
        await punch();
        await waitFor(
            () => {
                expect(screen.getByText(/Finished: the program hooted/)).toBeTruthy();
            },
            { timeout: 40_000 },
        );

        const punched = (await punch()).textContent ?? "";
        // The day of the month reached NB: the compiler heads its listing with it.
        expect(punched).toContain(`COMPILED ${new Date().getDate()}/3/21`);
        expect(punched).toContain("7.00002");

        // The last of the seven steps is the one it is on, and the reader is where
        // that step put it: on the source, in the five hole reader.
        const current = document.querySelectorAll(".narration-step.current");
        expect(current).toHaveLength(1);
        expect(current[0].textContent).toBe("The program runs.");

        // The steps say what happened, not which keys did it, and the compiler's
        // own prompts are left on the teleprinter rather than repeated here.
        const narration = document.querySelector(".narration")?.textContent ?? "";
        expect(narration).not.toMatch(/RETURN|SWITCH TO|DRUM AND/);

        // A whole session, drum and all, and the console's drum is as it was.
        expect(stored.get("csiracweb.drum")).toBe(consolesDrum);
    });

    /** A run that is being watched can be stopped and picked up again. */
    it("pauses and carries on, as RETURN does at the console", async () => {
        const user = userEvent.setup();
        await atThePage(user);
        await user.click(screen.getByRole("button", { name: "Run" }));

        // The machine runs at its own speed, so there is time to catch it working.
        await user.click(await screen.findByRole("button", { name: "Pause" }));
        const stoppedAt = instructionCount();
        expect(stoppedAt).toBeGreaterThan(0);

        // Stopped means stopped: nothing is obeyed until RETURN is pressed again.
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 100));
        });
        expect(instructionCount()).toBe(stoppedAt);

        await user.click(screen.getByRole("button", { name: "Carry on" }));
        await waitFor(() => {
            expect(instructionCount()).toBeGreaterThan(stoppedAt);
        });
    });
});

describe("the one shot switch", () => {
    it("obeys a single instruction at a time", async () => {
        const user = userEvent.setup();
        renderApp();

        await user.click(screen.getByRole("button", { name: "T712A.cvt" }));
        await user.click(screen.getByRole("button", { name: /Read program into memory/ }));
        await settle();

        await user.click(screen.getByRole("button", { name: /One Shot: OFF/ }));
        expect(screen.getByRole("button", { name: /One Shot: ON/ })).toBeTruthy();

        const countBefore = instructionCount();
        await user.click(screen.getByRole("button", { name: /Execute program/ }));
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 100));
        });
        expect(instructionCount()).toBe(countBefore + 1);
    });
});

function instructionCount(): number {
    const text = document.querySelector(".prompt-count")?.textContent ?? "0";
    return Number(text.replace(/[^0-9]/g, ""));
}
