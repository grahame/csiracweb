/**
 * The emulator as a whole: choose a tape, read the switch settings, then work
 * at the console.
 *
 * Each screen is a route, and so are the two overlays, so the browser's back
 * and forward buttons move between them and a screen can be linked to.
 */

import { Navigate, Outlet, Route, Routes, useNavigate } from "react-router";

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
    return (
        <div className="app">
            <div className="screen">
                <a href="/csirac/">
                    <img src={CsiracLogo} alt="CSIRAC" className="csirac-logo" />
                </a>
                <Routes>
                    <Route path="/" element={<PickerScreen />} />

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
        <div className="overlay">
            <OptionsMenu
                controller={controller}
                onClose={close}
                onExit={() => {
                    controller.stop();
                    void navigate("/");
                }}
            />
        </div>
    );
}

function TapeOverlay() {
    const controller = useController();
    const navigate = useNavigate();

    return (
        <div className="overlay">
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
        </div>
    );
}

function Credit() {
    return (
        <footer className="credit">
            <p>
                CSIRAC was Australia&rsquo;s first digital computer, and the fourth stored program computer in the
                world. It ran from 1949 to 1964 and survives intact at Museums Victoria.
            </p>
            <p>
                This emulator is a port of <strong>CSIRACEM</strong>, written in Turbo Pascal by{" "}
                <strong>John W. Spencer</strong>, who used CSIRAC from 1959 to 1964. He kindly provided the code for his
                emulator and gave permission for it to be ported to the web. Claude Code was used substantially in
                developing this page, primarily in taking the Turbo Pascal emulator and porting it to Typescript. Some
                human code review of the generated code has been carried out, but this has not been by any means
                exhaustive.
            </p>
            <p>
                <a href="https://github.com/grahame/csiracweb">source code on github</a>
            </p>
        </footer>
    );
}
