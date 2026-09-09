/**
 * The console keys.
 *
 * These are the same letters the DOS emulator used. The ones that open a
 * screen navigate rather than set a flag, so that going back closes what they
 * opened.
 */

import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";

import { useController } from "./MachineContext";

export function useConsoleKeys(screen: "settings" | "console") {
    const controller = useController();
    const navigate = useNavigate();
    const location = useLocation();

    const { running, stop, start, setSwitch, clearSequence, acceptSettings, setEditing, view } = controller;
    const { readFrom } = controller;
    // An overlay is open when the path goes past the screen itself.
    const overlayOpen = location.pathname.split("/").length > 2;

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            // Leave typing in a field alone.
            const target = event.target as HTMLElement | null;
            if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
            if (event.metaKey || event.ctrlKey || event.altKey) return;

            const key = event.key.toUpperCase();

            // An open overlay takes the keys: RETURN or ESCAPE closes it, and going
            // back is what closing means.
            if (overlayOpen) {
                if (key === "ENTER" || key === "ESCAPE") {
                    event.preventDefault();
                    void navigate(-1);
                }
                return;
            }

            // While the machine is running, any key pauses it, as it did under DOS.
            if (running) {
                event.preventDefault();
                stop();
                return;
            }

            // On the switch panel only O, T and RETURN do anything, as the prompt
            // there says.
            if (screen === "settings") {
                if (key === "ENTER") {
                    event.preventDefault();
                    acceptSettings();
                    void navigate("/console");
                } else if (key === "O") {
                    event.preventDefault();
                    void navigate("options");
                } else if (key === "T") {
                    event.preventDefault();
                    void navigate("tape");
                }
                return;
            }

            switch (key) {
                case "ENTER":
                    event.preventDefault();
                    start();
                    break;
                case "O":
                    event.preventDefault();
                    void navigate("options");
                    break;
                case "T":
                    event.preventDefault();
                    void navigate("tape");
                    break;
                // No 'R': the reader selector follows the tape rather than being set
                // by hand, so U is the only reader control. See useMachine's readFrom.
                case "U":
                    readFrom(!view.readData);
                    break;
                case "K":
                    setSwitch("naAndSToK", !view.naAndSToK);
                    break;
                case "N":
                    setSwitch("naToK", !view.naToK);
                    break;
                case "Z":
                    setSwitch("punch5Hole", !view.punch5Hole);
                    break;
                // These three want a value typed at them, so they open the entry in
                // the operations menu rather than doing anything on their own.
                case "A":
                    event.preventDefault();
                    setEditing("na");
                    break;
                case "B":
                    event.preventDefault();
                    setEditing("nb");
                    break;
                case "I":
                    event.preventDefault();
                    setEditing("i");
                    break;
                case "S":
                    clearSequence();
                    break;
                case "1":
                    setSwitch("oneShot", !view.oneShot);
                    break;
                case "H":
                    // Turning the halt selector on needs an address; turning it off does not.
                    event.preventDefault();
                    if (view.triggerStop) setSwitch("triggerStop", false);
                    else setEditing("trigger");
                    break;
                case "X":
                    stop();
                    void navigate("/");
                    break;
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [
        screen,
        overlayOpen,
        running,
        stop,
        start,
        setSwitch,
        clearSequence,
        acceptSettings,
        setEditing,
        navigate,
        view,
        readFrom,
    ]);
}
