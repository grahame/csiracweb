import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    // Relative base so the built site works from a subdirectory on any host.
    base: "./",
});
