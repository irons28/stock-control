const express = require("express");
const cors = require("cors");
const { initializeDatabase } = require("./src/db/init");
const { closeDatabase } = require("./src/db/connection");
const apiRouter = require("./src/routes");

const PORT = Number(process.env.PORT || 3001);
const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  }),
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "stock-control-backend",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api", apiRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || "Unexpected server error",
  });
});

async function start() {
  await initializeDatabase();

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
