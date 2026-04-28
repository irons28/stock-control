const express = require("express");
const { all, get } = require("../db/connection");
const { moduleDefinitions } = require("../config/modules");

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

const dashboardSummaryQuery = `
  SELECT
    (
      SELECT COUNT(*)
      FROM purchase_orders po
      WHERE po.status NOT IN ('received', 'cancelled')
        AND po.expected_at IS NOT NULL
        AND date(po.expected_at) < date('now')
        AND EXISTS (
          SELECT 1
          FROM purchase_order_lines pol
          WHERE pol.purchase_order_id = po.id
            AND pol.quantity_received < pol.quantity_ordered
        )
    ) AS overduePurchaseOrders,
    (
      SELECT COUNT(*)
      FROM (
        SELECT po.id
        FROM purchase_orders po
        JOIN purchase_order_lines pol ON pol.purchase_order_id = po.id
        GROUP BY po.id
        HAVING SUM(pol.quantity_received) > 0
          AND SUM(pol.quantity_received) < SUM(pol.quantity_ordered)
      )
    ) AS partiallyReceivedOrders,
    (
      SELECT COALESCE(CAST(SUM(quantity_on_hand - quantity_allocated) AS INTEGER), 0)
      FROM stock_items si
      WHERE si.status = 'active'
        AND si.quantity_on_hand > si.quantity_allocated
        AND COALESCE(si.hold_status, 'available') IN ('pending_allocation', 'received')
    ) AS stockAwaitingAllocation,
    (
      SELECT COUNT(*)
      FROM sales_orders so
      WHERE so.status NOT IN ('dispatched', 'cancelled')
        AND so.dispatch_due_at IS NOT NULL
        AND date(so.dispatch_due_at) <= date('now', '+1 day')
        AND EXISTS (
          SELECT 1
          FROM sales_order_lines sol
          WHERE sol.sales_order_id = so.id
            AND sol.quantity_dispatched < sol.quantity_ordered
        )
    ) AS urgentCustomerOrders,
    (
      SELECT COALESCE(CAST(SUM(sol.quantity_allocated - sol.quantity_dispatched) AS INTEGER), 0)
      FROM sales_order_lines sol
      JOIN sales_orders so ON so.id = sol.sales_order_id
      WHERE so.status NOT IN ('dispatched', 'cancelled')
        AND sol.quantity_allocated >= sol.quantity_ordered
        AND sol.quantity_allocated > sol.quantity_dispatched
    ) AS dispatchReadyItems
`;

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

router.get("/dashboard/summary", async (_req, res, next) => {
  try {
    const summary = await get(dashboardSummaryQuery);
    res.json({
      overduePurchaseOrders: Number(summary?.overduePurchaseOrders || 0),
      partiallyReceivedOrders: Number(summary?.partiallyReceivedOrders || 0),
      stockAwaitingAllocation: Number(summary?.stockAwaitingAllocation || 0),
      urgentCustomerOrders: Number(summary?.urgentCustomerOrders || 0),
      dispatchReadyItems: Number(summary?.dispatchReadyItems || 0),
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
