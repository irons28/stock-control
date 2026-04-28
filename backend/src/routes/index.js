const express = require("express");
const { get, databasePath } = require("../db/connection");

const router = express.Router();

router.get("/health", async (_req, res, next) => {
  try {
    const database = await get("SELECT datetime('now') AS timestamp, 'connected' AS status");

    res.json({
      status: "ok",
      service: "stock-control-backend",
      database: {
        path: databasePath,
        ...database,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
