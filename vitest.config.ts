import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [react()],
    test: {
        environment: "node",
        include: ["src/**/*.test.{ts,tsx}"],
        // The console tests drive the machine at CSIRAC's own seventeen commands
        // per animation frame, because that is the only speed there is. Working
        // Interprogram through its walkthrough is thousands of frames, and each
        // one is a React render, and the machine is left stopped for a couple
        // of seconds at each of the seven steps besides, so the default five
        // seconds is nowhere near enough.
        testTimeout: 90_000,
    },
});
