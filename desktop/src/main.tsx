import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";

// The window follows the system appearance, and the webview has no class to
// hang that on, so the root element gets one.
const dark = window.matchMedia("(prefers-color-scheme: dark)");
const paint = () => document.documentElement.classList.toggle("dark", dark.matches);
paint();
dark.addEventListener("change", paint);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
