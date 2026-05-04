// Load .env from the project root (one level up from /backend)
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const { createApp } = require("./src/app");
const { initializeDatabase } = require("./src/db/init");
const { closeDatabase } = require("./src/db/connection");

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || "0.0.0.0";

// ── Process-level error safety ────────────────────────────────────────────────

process.on("uncaughtException", (err) => {
  console.error(`[${new Date().toISOString()}] uncaughtException — shutting down`, err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error(`[${new Date().toISOString()}] unhandledRejection — shutting down`, reason);
  process.exit(1);
});

// ── Startup ───────────────────────────────────────────────────────────────────

async function start() {
  await initializeDatabase();

  const app = createApp();

  const server = app.listen(PORT, HOST, () => {
    const env = process.env.NODE_ENV || "development";
    console.log(`[${new Date().toISOString()}] Stock Control API`);
    console.log(`  env      : ${env}`);
    console.log(`  listening: http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
    console.log(`  database : ${process.env.DATABASE_PATH || "./data/stock-control.sqlite"}`);
  });

  async function shutdown(signal) {
    console.log(`[${new Date().toISOString()}] ${signal} received — shutting down gracefully`);
    server.close(async () => {
      await closeDatabase();
      process.exit(0);
    });
    // Force exit if clean shutdown stalls
    setTimeout(() => process.exit(1), 10_000);
  }

  process.on("SIGINT",  () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

start().catch(async (error) => {
  console.error(`[${new Date().toISOString()}] Failed to start`, error);
  await closeDatabase();
  process.exit(1);
});
