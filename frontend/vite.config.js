import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,

    /**
     * Hosts this dev server will answer to, beyond localhost.
     *
     * Vite 5.4.12 started refusing requests whose Host header it does not
     * recognise — a DNS-rebinding guard, and a good one. It also means a
     * tunnel gets "Blocked request. This host is not allowed." instead of the
     * app, which is what you hit sharing the dev server with someone.
     *
     * Named rather than opened to everything: `true` here would let any site
     * that can resolve a name to 127.0.0.1 talk to this dev server, and the
     * proxy below would carry it straight to the database.
     */
    allowedHosts: [".ngrok-free.app", ".ngrok.io", ".ngrok.app", ".trycloudflare.com"],
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
