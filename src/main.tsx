import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router";

import { App } from "./ui/App";
import { MachineProvider } from "./ui/MachineContext";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("No #root element to mount into");

createRoot(root).render(
    <StrictMode>
        {/*
            Routing is kept in the fragment so the built site works from any static
            host, and from a subdirectory, without server rewrites for deep links.
            That matches the relative base the build already uses.
        */}
        <HashRouter>
            <MachineProvider>
                <App />
            </MachineProvider>
        </HashRouter>
    </StrictMode>,
);
