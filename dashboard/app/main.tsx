/** Entry for dashboard.html. Dev-only: the production build ships index.html. */

import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./dashboard.css";

const host = document.getElementById("root");
if (!host) throw new Error("dashboard: #root missing");

// Deliberately not StrictMode: its double-mount would build, tear down and
// rebuild the live iframe's WebGL context on every view switch.
createRoot(host).render(<App />);
