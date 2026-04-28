#!/usr/bin/env node
// Wipes and re-seeds the development database.
// Usage: npm run db:reset
const fs = require("fs");
const path = require("path");

const dbPath = path.join(__dirname, "..", "data", "stock-control.sqlite");

if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
  console.log("Database deleted:", dbPath);
} else {
  console.log("No existing database found, will create fresh.");
}

const { initializeDatabase: initDatabase } = require("../src/db/init");
const { closeDatabase } = require("../src/db/connection");

initDatabase()
  .then(() => {
    console.log("Database initialised and seeded.");
    return closeDatabase();
  })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Reset failed:", err.message);
    process.exit(1);
  });
