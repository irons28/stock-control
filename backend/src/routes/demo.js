const express = require("express");
const { run } = require("../db/connection");
const { initializeDatabase } = require("../db/init");
const { seedDemoData } = require("../../scripts/seed-demo");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

// Tables to clear, in dependency order (children before parents).
const OPERATIONAL_TABLES = [
  "activity_log",
  "import_logs",
  "serial_lifecycle_events",
  "stock_movements",
  "purchase_sales_links",
  "dispatch_records",
  "goods_receipt_lines",
  "goods_receipts",
  "stock_item_allocations",
  "stock_items",
  "sales_order_lines",
  "sales_orders",
  "purchase_order_lines",
  "purchase_orders",
];

async function clearOperationalData() {
  await run("PRAGMA foreign_keys = OFF");
  for (const table of OPERATIONAL_TABLES) {
    try {
      await run(`DELETE FROM ${table}`);
    } catch {
      // Table may not exist in all schema versions — skip silently.
    }
  }
  await run("PRAGMA foreign_keys = ON");
}

// POST /api/demo/reset — wipe operational data and re-seed demo scenario.
// Admin-only: this is a destructive operation.
router.post("/reset", requireRole("admin"), async (req, res, next) => {
  try {
    await clearOperationalData();
    await initializeDatabase();  // apply any pending migrations
    await seedDemoData();
    res.json({
      ok: true,
      message: "Demo data reset successfully.",
      scenario: {
        purchaseOrders: ["PO-1001 (Overdue)", "PO-1002 (Part Received)", "PO-1003 (Open)", "PO-1004 (Fully Received)", "PO-DEMO-001 (Demo scenario)"],
        salesOrders: ["SO-2001 (Urgent)", "SO-2002 (Dispatch Ready)", "SO-2003 (Open)", "SO-DEMO-001 (Demo scenario)"],
        serials: ["TILL-SN-1001 (Available)", "TILL-SN-1002 (Allocated)", "TILL-SN-1003 (Dispatched)", "TILL-SN-1004 (Received)", "TILL-SN-1005–1008 (Lifecycle scenarios)"],
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
