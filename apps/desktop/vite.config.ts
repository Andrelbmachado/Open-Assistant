import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed port during dev.
export default defineConfig({
  plugins: [react()],
  base: "",
  clearScreen: false,
  server: { port: 1420, strictPort: true },
});
