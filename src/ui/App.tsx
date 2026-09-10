/**
 * The emulator as a whole: choose a tape, read the switch settings, then work
 * at the console.
 *
 * Each screen is a route, and so are the two overlays, so the browser's back
 * and forward buttons move between them and a screen can be linked to.
 */

import { useEffect, useRef, type ReactNode } from "react";
import { Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router";

import { About } from "./About";
import { Console } from "./Console";
import { InitialSettings } from "./InitialSettings";
import { InterprogramPage } from "./InterprogramPage";
import { useController } from "./MachineContext";
import { OptionsMenu } from "./OptionsMenu";
import { TapePicker, type TapeFile } from "./TapePicker";
import { TapeViewer } from "./TapeViewer";
import { useConsoleKeys } from "./useConsoleKeys";
import type { Walkthrough } from "./useMachine";
import CsiracLogo from "../csirac-traced.svg";

export function App() {
    usePageTitle();

    return (
        <div className="app">
            <div className="screen">
                {/* The wordmark is the heading every screen sits under, and the way
                    back to the tapes. What the routes render is the page itself. */}
                <h1 className="wordmark">
                    <Link to="/">
                        <img src={CsiracLogo} alt="CSIRAC" className="csirac-logo" />
                    </Link>
                </h1>
                <main>
                    <Routes>
                        <Route path="/" element={<PickerScreen />} />

                        {/* Where the emulator came from, which used to be four paragraphs
                        at the foot of every screen. */}
                        <Route path="/about" element={<About />} />

                        {/* Writing Interprogram wants none of the machine's state: no tape in
                    the reader, no switches, nothing to carry between screens. It is a
                    page of its own for that reason. */}
                        <Route path="/interprogram" element={<InterprogramPage />} />

                        <Route path="/settings" element={<SettingsScreen />}>
                            <Route path="options" element={<OptionsOverlay />} />
                            <Route path="tape" element={<TapeOverlay />} />
                        </Route>

                        <Route path="/console" element={<ConsoleScreen />}>
                            <Route path="options" element={<OptionsOverlay />} />
                            <Route path="tape" element={<TapeOverlay />} />
                        </Route>

                        {/* Anything else, including a stale link, goes back to the reader. */}
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </main>
            </div>

            <Credit />
        </div>
    );
}

function PickerScreen() {
    const controller = useController();
    const navigate = useNavigate();

    const mount = (program: TapeFile, data: TapeFile | null, howToRun?: string, walkthrough?: Walkthrough | null) => {
        controller.mountTapes(program, data, howToRun, walkthrough ?? null);
        void navigate("/settings");
    };

    return <TapePicker onMount={mount} />;
}

/**
 * The screens past the tape picker need a tape in the reader. Arriving at one
 * without a tape, by following a link or by going forward past a reset, sends
 * the operator back to choose one.
 */
function useMountedTape(): boolean {
    return useController().programText !== "";
}

function SettingsScreen() {
    const controller = useController();
    const navigate = useNavigate();
    const mounted = useMountedTape();

    useConsoleKeys("settings");

    if (!mounted) return <Navigate to="/" replace />;

    return (
        <>
            <InitialSettings
                view={controller.view}
                programName={controller.programName}
                dataName={controller.dataName}
                displayD={controller.displayD}
                onAccept={() => {
                    controller.acceptSettings();
                    void navigate("/console");
                }}
                onOptions={() => void navigate("options")}
                onTapes={() => void navigate("tape")}
                onBack={() => void navigate("/")}
            />
            <Outlet />
        </>
    );
}

function ConsoleScreen() {
    const controller = useController();
    const navigate = useNavigate();
    const mounted = useMountedTape();

    useConsoleKeys("console");

    if (!mounted) return <Navigate to="/" replace />;

    return (
        <>
            <Console
                controller={controller}
                onOptions={() => void navigate("options")}
                onTapes={() => void navigate("tape")}
                onExit={() => {
                    controller.stop();
                    void navigate("/");
                }}
            />
            <Outlet />
        </>
    );
}

function OptionsOverlay() {
    const controller = useController();
    const navigate = useNavigate();
    const close = () => void navigate(-1);

    return (
        <Overlay onClose={close}>
            <OptionsMenu
                controller={controller}
                onClose={close}
                onExit={() => {
                    controller.stop();
                    void navigate("/");
                }}
            />
        </Overlay>
    );
}

/**
 * A panel laid over the console, with the console still there behind it.
 *
 * What the panel does is its own business; this is the everything else that
 * comes of covering a page with one. The dim console around it is a way out,
 * as it is everywhere else on the web — RETURN and ESCAPE are the other two,
 * and they are the console's own keys, in useConsoleKeys. The page behind is
 * held still while it is up, so a scroll meant for the panel does not carry
 * the machine along underneath it. And the keyboard goes in with it and comes
 * back out where it was: TAB works round the panel rather than wandering off
 * into a console that cannot be seen.
 */
function Overlay({ onClose, children }: { onClose: () => void; children: ReactNode }) {
    const overlay = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const cameFrom = document.activeElement as HTMLElement | null;
        const held = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        // The panel itself takes the focus, rather than the first thing in it,
        // so that a screen reader says what has opened before reading it out.
        const panel = overlay.current?.firstElementChild as HTMLElement | null;
        panel?.focus();

        return () => {
            document.body.style.overflow = held;
            cameFrom?.focus?.();
        };
    }, []);

    return (
        <div
            className="overlay"
            ref={overlay}
            // Only the backdrop itself: a press that started on the panel and
            // ended outside it is a drag, not a way out.
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
            onKeyDown={(event) => {
                if (event.key !== "Tab") return;
                const stops = overlay.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
                if (!stops || stops.length === 0) return;

                const first = stops[0];
                const last = stops[stops.length - 1];
                const at = document.activeElement;
                if (event.shiftKey && (at === first || at === overlay.current?.firstElementChild)) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && at === last) {
                    event.preventDefault();
                    first.focus();
                }
            }}
        >
            {children}
        </div>
    );
}

/** Everything in a panel that the keyboard can reach. */
const FOCUSABLE =
    'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

function TapeOverlay() {
    const controller = useController();
    const navigate = useNavigate();

    return (
        <Overlay onClose={() => void navigate(-1)}>
            <TapeViewer
                programName={controller.programName}
                programText={controller.programText}
                dataName={controller.dataName}
                dataText={controller.dataText}
                programAt={controller.view.programAt}
                dataAt={controller.view.dataAt}
                onClose={() => void navigate(-1)}
                onMount={(program, data) => {
                    // A tape that has been altered goes back in the reader from the
                    // beginning, so the machine is set up again and the switch panel
                    // shown, exactly as for a tape off the shelf.
                    controller.mountTapes(program, data.text ? data : null, controller.notes, controller.walkthrough);
                    void navigate("/settings");
                }}
            />
        </Overlay>
    );
}

/**
 * What the tab says, which is not the same on every screen.
 *
 * A page that is one thing all the way through can have one title; this is
 * five screens, and a browser history of five identical entries says nothing
 * about which is which.
 */
function usePageTitle() {
    const { pathname } = useLocation();

    useEffect(() => {
        document.title = TITLES[pathname.split("/")[1] ?? ""] ?? "CSIRAC Emulator";
    }, [pathname]);
}

const TITLES: Record<string, string> = {
    "": "CSIRAC Emulator",
    about: "About — CSIRAC Emulator",
    interprogram: "Interprogram — CSIRAC Emulator",
    settings: "Initial settings — CSIRAC Emulator",
    console: "Console — CSIRAC Emulator",
};

/**
 * The foot of every screen.
 *
 * Whose emulator this is a port of belongs on every screen, because it is his
 * work being run; the rest of the history is a page of its own, linked from
 * here. See About.
 */
function Credit() {
    return (
        <footer className="credit">
            <p>
                A web port of <strong>CSIRACEM</strong>, John W. Spencer&rsquo;s CSIRAC emulator.
            </p>
            <p className="credit-links">
                <Link to="/about">About this emulator</Link>
                <a href="https://github.com/grahame/csiracweb">Source code on GitHub</a>
            </p>
        </footer>
    );
}
