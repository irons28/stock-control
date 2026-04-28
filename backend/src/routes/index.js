const express = require("express");
const { all, get } = require("../db/connection");
const { moduleDefinitions } = require("../config/modules");
const serialsRouter = require("./serials");

const router = express.Router();

const resourceQueries = {
  customers: "SELECT * FROM customers ORDER BY name ASC",
  suppliers: "SELECT * FROM suppliers ORDER BY name ASC",
  products: "SELECT * FROM products ORDER BY name ASC",
  "stock-locations": "SELECT * FROM stock_locations ORDER BY code ASC",
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
  "stock-movements": `
    SELECT sm.*,
      p.name AS product_name,
      src.code AS source_location_code,
      dest.code AS destination_location_code
    FROM stock_movements sm
    JOIN products p ON p.id = sm.product_id
    LEFT JOIN stock_locations src ON src.id = sm.source_location_id
    LEFT JOIN stock_locations dest ON dest.id = sm.destination_location_id
    ORDER BY sm.created_at DESC
  `,
  "goods-receiving": `
    SELECT gr.*, po.order_number
    FROM goods_receipts gr
    JOIN purchase_orders po ON po.id = gr.purchase_order_id
    ORDER BY gr.received_at DESC
  `,
  "order-linking": `
    SELECT psl.*,
      pol.purchase_order_id,
      sol.sales_order_id
    FROM purchase_sales_links psl
    JOIN purchase_order_lines pol ON pol.id = psl.purchase_order_line_id
    JOIN sales_order_lines sol ON sol.id = psl.sales_order_line_id
    ORDER BY psl.created_at DESC
  `,
};

router.get("/health", async (_req, res, next) => {
  try {
    const result = await get("SELECT datetime('now') AS database_time");
    res.json({
      status: "ok",
      database: result,
      modules: moduleDefinitions.length,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/navigation", (_req, res) => {
  res.json({
    items: moduleDefinitions,
  });
});

router.use("/serials", serialsRouter);

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
