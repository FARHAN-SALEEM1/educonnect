import app from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./config/prisma.js";
import { startMaintenance } from "./services/maintenance.service.js";
import { assertNoDemoAccounts } from "./config/demo-guard.js";

const start = async () => {
  try {
    await connectDatabase();

    // Config is checked before this file even loads; this is the check that
    // needs the database, so it happens here — after connecting and before a
    // single request is served.
    await assertNoDemoAccounts();

    startMaintenance();

    const server = app.listen(env.port, () => {
      console.log(`
┌──────────────────────────────────────────────┐
│  EduConnect API                              │
│  http://localhost:${String(env.port).padEnd(27)}│
│  env: ${env.nodeEnv.padEnd(39)}│
└──────────────────────────────────────────────┘`);
    });

    const shutdown = async (signal) => {
      console.log(`\n[server] ${signal} received — shutting down`);
      server.close(async () => {
        await disconnectDatabase();
        process.exit(0);
      });
      // Don't hang forever if a connection refuses to close.
      setTimeout(() => process.exit(1), 10000).unref();
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    process.on("unhandledRejection", (reason) => {
      console.error("[server] Unhandled rejection:", reason);
    });
  } catch (err) {
    console.error("[server] Failed to start:", err);
    process.exit(1);
  }
};

start();
