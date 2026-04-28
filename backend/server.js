const { createApp } = require("./src/app");
const { initDatabase } = require("./src/db/init");
const { closeDatabase } = require("./src/db/connection");

const PORT = Number(process.env.PORT || 3001);

async function start() {
  await initDatabase();

  const app = createApp();

  const server = app.listen(PORT, () => {
    console.log(`Stock Control API listening on http://localhost:${PORT}`);
  });

  async function shutdown(signal) {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await closeDatabase();
      process.exit(0);
    });
  }

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

start().catch(async (error) => {
  console.error("Failed to start backend", error);
  await closeDatabase();
  process.exit(1);
});
