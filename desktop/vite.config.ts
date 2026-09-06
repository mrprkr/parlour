import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// Tauri serves the built files out of dist/, and in development out of this
// dev server. The port is fixed because tauri.conf.json names it, and a
// wandering port would leave the window looking at nothing.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  // The webview is WKWebView, so there is one engine to target rather than a
  // browser matrix.
  build: { outDir: "dist", emptyOutDir: true, target: "safari15" },
});
