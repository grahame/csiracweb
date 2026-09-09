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
        // one is a React render, so the default five seconds is not enough.
        testTimeout: 60_000,
    },
});
