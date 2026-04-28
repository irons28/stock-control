const express = require("express");
const { all, get } = require("../db/connection");
const { moduleDefinitions } = require("../config/modules");

const router = express.Router();

const resourceQueries = {
  customers: "SELECT * FROM customers ORDER BY name ASC",
  suppliers: "SELECT * FROM suppliers ORDER BY name ASC",
  products: "SELECT * FROM products ORDER BY name ASC",
  "stock-locations": "SELECT * FROM stock_locations ORDER BY code ASC",
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

const purchaseOrderSummarySelect = `
  SELECT
    po.id,
    po.order_number AS poNumber,
    po.order_number,
    s.name AS supplier,
    s.name AS supplier_name,
    po.ordered_at AS orderDate,
    po.ordered_at,
    po.expected_at AS expectedDeliveryDate,
    po.expected_at,
    COUNT(pol.id) AS lineCount,
    SUM(CASE WHEN pol.quantity_ordered > pol.quantity_received THEN 1 ELSE 0 END) AS openLineCount,
    COALESCE(SUM(pol.quantity_ordered), 0) AS totalOrderedQuantity,
    COALESCE(SUM(pol.quantity_received), 0) AS totalReceivedQuantity,
    CASE
      WHEN COUNT(pol.id) > 0 AND COALESCE(SUM(pol.quantity_received), 0) >= COALESCE(SUM(pol.quantity_ordered), 0) THEN 'Fully Received'
      WHEN po.expected_at IS NOT NULL
        AND date(po.expected_at) < date('now')
        AND COALESCE(SUM(pol.quantity_received), 0) < COALESCE(SUM(pol.quantity_ordered), 0) THEN 'Overdue'
      WHEN COALESCE(SUM(pol.quantity_received), 0) > 0 THEN 'Part Received'
      ELSE 'Open'
    END AS status
  FROM purchase_orders po
  JOIN suppliers s ON s.id = po.supplier_id
  LEFT JOIN purchase_order_lines pol ON pol.purchase_order_id = po.id
`;

function normalizePurchaseOrder(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    lineCount: Number(row.lineCount) || 0,
    openLineCount: Number(row.openLineCount) || 0,
    totalOrderedQuantity: Number(row.totalOrderedQuantity) || 0,
    totalReceivedQuantity: Number(row.totalReceivedQuantity) || 0,
  };
}

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

router.get("/purchase-orders", async (req, res, next) => {
  const poNumber = String(req.query.poNumber || "").trim();

  try {
    const items = await all(
      `
        ${purchaseOrderSummarySelect}
        WHERE (? = '' OR po.order_number LIKE '%' || ? || '%')
        GROUP BY po.id, s.name
        ORDER BY
          CASE
            WHEN COUNT(pol.id) > 0 AND COALESCE(SUM(pol.quantity_received), 0) >= COALESCE(SUM(pol.quantity_ordered), 0) THEN 3
            WHEN po.expected_at IS NOT NULL
              AND date(po.expected_at) < date('now')
              AND COALESCE(SUM(pol.quantity_received), 0) < COALESCE(SUM(pol.quantity_ordered), 0) THEN 0
            WHEN COALESCE(SUM(pol.quantity_received), 0) > 0 THEN 1
            ELSE 2
          END ASC,
          po.expected_at ASC,
          po.order_number ASC
      `,
      [poNumber, poNumber],
    );

    res.json({
      items: items.map(normalizePurchaseOrder),
      filters: {
        poNumber,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/purchase-orders/:poNumber", async (req, res, next) => {
  try {
    const detail = await get(
      `
        ${purchaseOrderSummarySelect}
        WHERE po.order_number = ?
        GROUP BY po.id, s.name
      `,
      [req.params.poNumber],
    );

    if (!detail) {
      res.status(404).json({
        error: `Purchase order ${req.params.poNumber} was not found`,
      });
      return;
    }

    const lines = await all(
      `
        SELECT
          pol.id,
          p.sku AS productCode,
          p.name AS productName,
          pol.quantity_ordered AS orderedQuantity,
          pol.quantity_received AS receivedQuantity,
          pol.quantity_ordered - pol.quantity_received AS remainingQuantity,
          p.is_serial_tracked AS serialTrackingRequired,
          COALESCE(GROUP_CONCAT(DISTINCT so.order_number), '') AS linkedSalesOrderReferences
        FROM purchase_order_lines pol
        JOIN products p ON p.id = pol.product_id
        LEFT JOIN purchase_sales_links psl ON psl.purchase_order_line_id = pol.id
        LEFT JOIN sales_order_lines sol ON sol.id = psl.sales_order_line_id
        LEFT JOIN sales_orders so ON so.id = sol.sales_order_id
        WHERE pol.purchase_order_id = ?
        GROUP BY pol.id, p.sku, p.name, p.is_serial_tracked
        ORDER BY p.name ASC
      `,
      [detail.id],
    );

    res.json({
      poNumber: detail.poNumber,
      supplier: detail.supplier,
      status: detail.status,
      orderDate: detail.orderDate,
      expectedDeliveryDate: detail.expectedDeliveryDate,
      totalOrderedQuantity: Number(detail.totalOrderedQuantity) || 0,
      totalReceivedQuantity: Number(detail.totalReceivedQuantity) || 0,
      lineCount: Number(detail.lineCount) || 0,
      openLineCount: Number(detail.openLineCount) || 0,
      lines: lines.map((line) => ({
        productCode: line.productCode,
        productName: line.productName,
        orderedQuantity: Number(line.orderedQuantity) || 0,
        receivedQuantity: Number(line.receivedQuantity) || 0,
        remainingQuantity: Number(line.remainingQuantity) || 0,
        serialTrackingRequired: Boolean(line.serialTrackingRequired),
        linkedSalesOrderReferences: line.linkedSalesOrderReferences
          ? line.linkedSalesOrderReferences.split(",")
          : [],
      })),
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
