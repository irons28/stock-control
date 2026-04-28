const express = require("express");
const cors = require("cors");
const apiRouter = require("./routes");

function createApp() {
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

  // 404 for unmatched routes
  app.use((_req, res) => {
    res.status(404).json({ error: true, message: "Not found" });
  });

  // Centralised error handler
  app.use((err, _req, res, _next) => {
    console.error(err);
    const status = err.status || 500;
    const body = {
      error: true,
      message: err.message || "Unexpected server error",
    };
    if (err.details !== undefined) {
      body.details = err.details;
    }
    res.status(status).json(body);
  });

  return app;
}

module.exports = { createApp };
