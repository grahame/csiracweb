/**
 * Driving the machine.
 *
 * The original emulator ran flat out in a loop and checked the keyboard every
 * five hundred instructions. A browser cannot block like that, so execution is
 * broken into batches and the caller decides when to run the next one.
 */

import { MachineError, type Machine, type StopReason } from "./machine";
import { TapeError } from "./tape";

export interface BatchResult {
    /** Why the batch ended, or null if it simply ran out of its allowance. */
    reason: StopReason | null;
    /** Set when the machine could not go on. */
    error: string | null;
    /** How many instructions were obeyed. */
    executed: number;
}

/**
 * Obey up to `limit` instructions, stopping early on a halt or an error.
 */
export function runBatch(machine: Machine, limit: number): BatchResult {
    for (let executed = 1; executed <= limit; executed++) {
        let reason: StopReason | null;
        try {
            reason = machine.step();
        } catch (err) {
            if (err instanceof MachineError || err instanceof TapeError) {
                return { reason: "error", error: err.message, executed };
            }
            throw err;
        }
        if (reason) return { reason, error: null, executed };
    }
    return { reason: null, error: null, executed: limit };
}

/**
 * Run until the machine halts. Intended for tests and for loading a program,
 * where blocking is fine; the limit guards against a program that never stops.
 */
export function runToStop(machine: Machine, limit = 50_000_000): BatchResult {
    const result = runBatch(machine, limit);
    return result;
}
