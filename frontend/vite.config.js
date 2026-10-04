import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Forward /api/* to FastAPI, so the browser sees one origin (no CORS needed in dev).
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
});