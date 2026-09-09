/**
 * One machine, shared by every screen.
 *
 * The console is split across routes now, so the machine cannot live in the
 * component that happens to be showing. It is held here instead, above the
 * router, and stays put as the operator moves between the tape picker, the
 * switch panel and the console.
 */

import { createContext, use, type ReactNode } from "react";

import { useMachine } from "./useMachine";

export type MachineController = ReturnType<typeof useMachine>;

const MachineContext = createContext<MachineController | null>(null);

export function MachineProvider({ children }: { children: ReactNode }) {
    const controller = useMachine();
    return <MachineContext value={controller}>{children}</MachineContext>;
}

export function useController(): MachineController {
    const controller = use(MachineContext);
    if (!controller) throw new Error("useController must be used inside a MachineProvider");
    return controller;
}
