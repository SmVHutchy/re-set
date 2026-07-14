import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Import-API im Dev-Modus an den Node-Server (npm run server) durchreichen,
  // damit /api/* aus der SPA erreichbar ist. In Prod liefert derselbe Server alles.
  server: {
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
