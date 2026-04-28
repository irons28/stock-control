const express = require("express");
const { all, get, databasePath } = require("../db/connection");
const { getDatabaseStatus } = require("../db/init");

const router = express.Router();

const resourceQueries = {
  customers: "SELECT * FROM customers ORDER BY name ASC",
  suppliers: "SELECT * FROM suppliers ORDER BY name ASC",
  products: "SELECT * FROM products ORDER BY name ASC",
  "purchase-orders": `
    SELECT po.*, s.name AS supplier_name
    FROM purchase_orders po
    JOIN suppliers s ON s.id = po.supplier_id
    ORDER BY po.created_at DESC
  `,
  "sales-orders": `
    SELECT so.*, c.name AS customer_name
    FROM sales_orders so
    JOIN customers c ON c.id = so.customer_id
    ORDER BY so.created_at DESC
  `,
  dispatches: `
    SELECT d.*, so.order_number AS sales_order_number, c.name AS customer_name
    FROM dispatches d
    JOIN sales_orders so ON so.id = d.sales_order_id
    JOIN customers c ON c.id = d.customer_id
    ORDER BY d.created_at DESC
  `,
  "activity-log": `
    SELECT *
    FROM activity_log
    ORDER BY created_at DESC
  `,
};

router.get("/health", async (_req, res, next) => {
  try {
    const database = await get("SELECT datetime('now') AS database_time");
    const schema = await getDatabaseStatus();

    res.json({
      status: "ok",
      database: {
        path: databasePath,
        ...database,
      },
      schema,
    });
  } catch (error) {
    next(error);
  }
});

Object.entries(resourceQueries).forEach(([resourceKey, sql]) => {
  router.get(`/${resourceKey}`, async (_req, res, next) => {
    try {
      const items = await all(sql);
      res.json({
        resource: resourceKey,
        items,
      });
    } catch (error) {
      next(error);
    }
  });
});

module.exports = router;
