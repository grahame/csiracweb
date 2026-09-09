/**
 * The operating screen.
 *
 * The displays are the machine's own and are shared with the Interprogram
 * page, which runs the same machine with nobody at the console; see
 * MachineDisplay. What belongs to this screen is the operator: the operations
 * menu beside the tape, the notes on how to work this particular tape, and the
 * prompt line where RETURN sets the machine going.
 *
 * Both of those are handed to the display rather than put around it, because
 * both belong against the thing they work: the switches beside the reader, and
 * the keys under the tubes that show what pressing them did.
 */

import { MachineDisplay, PromptStatus } from "./MachineDisplay";
import { OperationsMenu } from "./OperationsMenu";
import type { useMachine } from "./useMachine";

interface ConsoleProps {
    controller: ReturnType<typeof useMachine>;
    onOptions: () => void;
    onTapes: () => void;
    onExit: () => void;
}

export function Console({ controller, onOptions, onTapes, onExit }: ConsoleProps) {
    const { view, running, status, statusIsError, loading, notes, walkthrough } = controller;

    return (
        <div className="console-screen">
            {notes ? <p className="operating-notes">{notes}</p> : null}

            {/* A tape that has to be worked through shows its steps here, at the
                console, where they are being followed. */}
            {walkthrough ? (
                <div className="walkthrough">
                    <p>{walkthrough.intro}</p>
                    <ol>
                        {walkthrough.steps.map(([says, does], index) => (
                            <li key={index}>
                                {says ? <code className="walkthrough-says">{says}</code> : null}
                                <span className="walkthrough-does">{does}</span>
                            </li>
                        ))}
                    </ol>
                </div>
            ) : null}

            <MachineDisplay
                controller={controller}
                aside={<OperationsMenu controller={controller} onExit={onExit} />}
                controls={
                    <div className="prompt-line">
                        {/*
                            The console's keys are the DOS emulator's, but they are not
                            what the buttons are called any more: a button says what it
                            does, and the key that does the same thing is on the tooltip
                            for whoever wants it. "O for options" told you the key
                            whether you wanted it or not, and made the machine sound
                            like a menu system rather than a console.
                        */}
                        <button type="button" className="prompt-action" title="Press O" onClick={onOptions}>
                            Options
                        </button>
                        <button type="button" className="prompt-action" title="Press T" onClick={onTapes}>
                            View or edit the tape
                        </button>
                        {running ? (
                            <button
                                type="button"
                                className="prompt-action"
                                title="Press any key"
                                onClick={controller.stop}
                            >
                                Pause
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="prompt-action"
                                title="Press RETURN"
                                onClick={controller.start}
                            >
                                {/* Starting a machine that has already been started picks up from
                                    wherever the sequence register was left: the start button did
                                    not re-thread the tape. A program that has stopped and is
                                    started again therefore carries on rather than running afresh,
                                    and often works round the whole store before it comes back to
                                    itself, so the button says which of the two is on offer. */}
                                {loading
                                    ? "Read program into memory"
                                    : controller.started
                                      ? "Carry on from where it stopped"
                                      : "Execute program"}
                            </button>
                        )}
                        <PromptStatus running={running} fault={statusIsError}>
                            {status}
                        </PromptStatus>
                        <span className="prompt-count">{view.instructionCount.toLocaleString()} instructions</span>
                    </div>
                }
            />
        </div>
    );
}
