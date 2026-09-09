/**
 * The screen of switch settings, shown before a program is read in.
 *
 * This reproduces the panel the DOS emulator printed, which describes where
 * every switch on the control desk stands. It reads the machine rather than
 * reciting a fixed list, because reading a tape in deliberately keeps whatever
 * the operator has since set from the Options menu: a panel that always said
 * the switch-on positions would be telling them the opposite of the truth.
 *
 * There is no speed selector. The control desk had none, and the machine here
 * always runs at CSIRAC's own thousand commands a second.
 */

import { toScale32, toScale32Quad } from "../emulator/word";
import type { MachineView } from "./useMachine";

interface InitialSettingsProps {
    view: MachineView;
    programName: string;
    dataName: string;
    displayD: boolean;
    onAccept: () => void;
    onOptions: () => void;
    onTapes: () => void;
    onBack: () => void;
}

/** A register as its four scale-32 digits, the way the console showed it. */
function quad(word: number): string {
    return toScale32Quad(word)
        .map((digit) => String(digit).padStart(2, " "))
        .join(" ");
}

export function InitialSettings({
    view,
    programName,
    dataName,
    displayD,
    onAccept,
    onOptions,
    onTapes,
    onBack,
}: InitialSettingsProps) {
    const [triggerHigh, triggerLow] = toScale32(view.triggerAddress >> 10);
    const onOff = (on: boolean) => (on ? "ON" : "OFF");

    return (
        <div className="screen settings-screen">
            <pre className="settings-text">
                {`The Control Desk Switch Panel settings are:

Unit add to S per command: ON
Reader Switch: ON   Reader Selector: ${view.reader5Hole ? " 5 HOLE" : "12 HOLE"}
Punch: ON   Printer: ON   Punch Selector: ${view.punch5Hole ? " 5 HOLE" : "12 HOLE"}
Reading from: ${view.readData ? "data tape" : "program tape"}
Main store display selector: 0  0 (to display primary usually)
Display: ${displayD ? "CONTENT OF ALL D REGISTERS" : "LAST 16 COMMANDS EXECUTED"}
Halt Selector: ${onOff(view.triggerStop)}
Halt Selector address: ${String(triggerHigh).padStart(2, " ")} ${String(triggerLow).padStart(2, " ")}
NA register: ${quad(view.na)}  NB register: ${quad(view.nb)}  I register: ${quad(view.iSwitches)}
Clearance Buttons: (All Reg,A,B,C,All D,H,S,I,Out,Tape Reader): OFF
One Shot: ${onOff(view.oneShot)}
NA & S to K: ${onOff(view.naAndSToK)}   NA to K: ${onOff(view.naToK)}
Drum Writing Control: ON
Start/Stop: START  Start: ON

Machine starts with (S)=0, All Registers, Main Store clear
Auxiliary (drum) store not cleared

Program tape: ${programName}
Data tape:    ${dataName || "(none)"}`}
            </pre>
            <div className="prompt-line">
                {/* A button says what it does; the key that does the same is on the
                    tooltip. See the note in Console. */}
                <button type="button" className="prompt-action" title="Press O" onClick={onOptions}>
                    Options
                </button>
                <button type="button" className="prompt-action" title="Press RETURN" onClick={onAccept}>
                    Read program into memory
                </button>
                <button type="button" className="prompt-action" title="Press T" onClick={onTapes}>
                    View or edit the tape
                </button>
                <button type="button" className="prompt-action secondary" onClick={onBack}>
                    Choose another tape
                </button>
            </div>
        </div>
    );
}
