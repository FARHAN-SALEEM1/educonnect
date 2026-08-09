import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy /api to the backend so the browser sees one origin in dev —
    // no CORS preflight, and cookies/headers behave like production.
    proxy: {
      // Port 5001 — the older EduConnect backend on Desktop\educonnect
      // still occupies 5000, so the two can run side by side.
      "/api": {
        target: "http://localhost:5001",
        changeOrigin: true,
      },
    },
  },
});
