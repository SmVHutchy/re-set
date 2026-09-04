import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // public/ NICHT nach dist/ kopieren: dort liegen importierte Audio-Dateien und
  // Cover (mehrere GB) — das Kopieren ließ den Build minutenlang "hängen".
  // Der Express-Server (scripts/server.mjs) liefert public/ ohnehin direkt aus,
  // im Dev-Modus serviert Vite publicDir selbst. Docker kopiert public/ separat.
  build: {
    copyPublicDir: false,
  },
  // Import-API im Dev-Modus an den Node-Server (npm run server) durchreichen,
  // damit /api/* aus der SPA erreichbar ist. In Prod liefert derselbe Server alles.
  server: {
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
