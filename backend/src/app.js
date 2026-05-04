const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { writeLimiter } = require("./middleware/rateLimiter");
const apiRouter = require("./routes");

const IS_PROD = process.env.NODE_ENV === "production";

// Support a comma-separated FRONTEND_ORIGIN list for multi-origin setups.
function buildCorsOrigin() {
  const raw = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
  const origins = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return origins.length === 1 ? origins[0] : origins;
}

function createApp() {
  const app = express();

  // Security headers
  app.use(helmet({
    // Relaxed for single-origin internal apps that serve their own frontend
    contentSecurityPolicy: IS_PROD ? undefined : false,
    crossOriginEmbedderPolicy: false,
  }));

  // CORS
  app.use(cors({ origin: buildCorsOrigin(), credentials: true }));

  // Request logging — structured in prod (JSON-friendly), readable in dev
  app.use(morgan(IS_PROD ? "combined" : "dev"));

  app.use(express.json({ limit: "2mb" }));

  // Rate limit write operations
  app.use(writeLimiter);

  // Health — available before /api prefix for load balancer probes
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "stock-control-backend",
      env: process.env.NODE_ENV || "development",
      timestamp: new Date().toISOString(),
    });
  });

  app.use("/api", apiRouter);

  // Serve built frontend in production (single-process deployment)
  const FRONTEND_DIST = path.resolve(__dirname, "../../frontend/dist");
  if (IS_PROD && fs.existsSync(FRONTEND_DIST)) {
    app.use(express.static(FRONTEND_DIST));
    // SPA fallback — all non-API routes serve index.html
    app.get("*", (_req, res) => {
      res.sendFile(path.join(FRONTEND_DIST, "index.html"));
    });
  } else {
    app.use((_req, res) => {
      res.status(404).json({ error: true, message: "Not found" });
    });
  }

  // Centralised error handler
  app.use((err, _req, res, _next) => {
    const status = err.status || 500;
    // Log all 5xx errors; skip expected 4xx noise in prod
    if (status >= 500 || !IS_PROD) {
      console.error(`[${new Date().toISOString()}] ${status} ${err.message}`, IS_PROD ? "" : err.stack);
    }
    const body = { error: true, message: err.message || "Unexpected server error" };
    if (err.details !== undefined) body.details = err.details;
    // Never send stack traces to the client in production
    if (!IS_PROD && err.stack) body.stack = err.stack;
    res.status(status).json(body);
  });

  return app;
}

module.exports = { createApp };
