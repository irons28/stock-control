const express = require("express");
const { all, get, run } = require("../db/connection");
const { moduleDefinitions } = require("../config/modules");
const { createPurchaseOrder, receivePurchaseOrder } = require("../services/purchase-orders");
const {
  createProduct,
  createSupplier,
  listProducts,
  listSuppliers,
  parseIncludeInactive,
  updateProduct,
  updateSupplier,
} = require("../services/master-data");
const { router: dispatchRouter } = require("./dispatch");
const importsRouter = require("./imports");
const serialsRouter = require("./serials");
const searchRouter = require("./search");
const returnsRouter = require("./returns");
const exceptionsRouter = require("./exceptions");
const { fetchAvailableStockByProduct, router: salesOrdersRouter } = require("./salesOrders");
const { resolveUser, requireRole } = require("../middleware/auth");
const auditRouter = require("./audit");
const usersRouter = require("./users");
const demoRouter = require("./demo");

const router = express.Router();

router.use(resolveUser);

const resourceQueries = {
  customers: "SELECT * FROM customers ORDER BY name ASC",
  suppliers: "SELECT * FROM suppliers ORDER BY name ASC",
  products: `
    SELECT p.*, s.name AS supplier_name
    FROM products p
    LEFT JOIN suppliers s ON s.id = p.default_supplier_id
    ORDER BY p.name ASC
  `,
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

const purchaseOrderSummarySelect = `
  SELECT
    po.id,
    po.order_number AS poNumber,
    po.order_number,
    po.supplier_id,
    po.linked_sales_order_id,
    po.supplier_reference,
    po.notes,
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

function parseActiveOnly(value) {
  if (value === undefined) {
    return null;
  }

  return value === true || value === "true" || value === "1";
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

router.use("/sales-orders", salesOrdersRouter);
router.use("/dispatch", requireRole("admin", "office", "dispatch"), dispatchRouter);
router.use("/import", importsRouter);

router.get("/suppliers", async (req, res, next) => {
  try {
    const activeOnly = parseActiveOnly(req.query.active);
    const payload = await listSuppliers({
      query: req.query.q,
      includeInactive:
        activeOnly === true ? false : parseIncludeInactive(req.query.includeInactive),
    });
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.post("/suppliers", requireRole("admin", "office", "purchasing"), async (req, res, next) => {
  try {
    const supplier = await createSupplier(req.body, {
      userId: req.user?.id,
      userRole: req.user?.role,
      userName: req.user?.full_name,
    });
    res.status(201).json({
      item: supplier,
      message: `Supplier ${supplier.supplierCode} created successfully.`,
    });
  } catch (error) {
    next(error);
  }
});

router.put("/suppliers/:id", requireRole("admin", "office", "purchasing"), async (req, res, next) => {
  try {
    const supplier = await updateSupplier(req.params.id, req.body, {
      userId: req.user?.id,
      userRole: req.user?.role,
      userName: req.user?.full_name,
    });
    res.json({
      item: supplier,
      message: `Supplier ${supplier.supplierCode} updated successfully.`,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/products", async (req, res, next) => {
  try {
    const activeOnly = parseActiveOnly(req.query.active);
    const payload = await listProducts({
      query: req.query.q,
      includeInactive:
        activeOnly === true ? false : parseIncludeInactive(req.query.includeInactive),
    });
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.post("/products", requireRole("admin", "office", "purchasing"), async (req, res, next) => {
  try {
    const product = await createProduct(req.body, {
      userId: req.user?.id,
      userRole: req.user?.role,
      userName: req.user?.full_name,
    });
    res.status(201).json({
      item: product,
      message: `Product ${product.sku} created successfully.`,
    });
  } catch (error) {
    next(error);
  }
});

router.put("/products/:id", requireRole("admin", "office", "purchasing"), async (req, res, next) => {
  try {
    const product = await updateProduct(req.params.id, req.body, {
      userId: req.user?.id,
      userRole: req.user?.role,
      userName: req.user?.full_name,
    });
    res.json({
      item: product,
      message: `Product ${product.sku} updated successfully.`,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/allocation/available-stock/:productId", requireRole("admin", "office", "warehouse", "dispatch", "purchasing"), async (req, res, next) => {
  try {
    const payload = await fetchAvailableStockByProduct(Number(req.params.productId));
    res.json(payload);
  } catch (error) {
    next(error);
  }
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

router.post("/purchase-orders", requireRole("admin", "office", "purchasing"), async (req, res, next) => {
  try {
    const purchaseOrder = await createPurchaseOrder(req.body, {
      userId: req.user?.id,
      userRole: req.user?.role,
      userName: req.user?.full_name,
    });

    res.status(201).json({
      item: purchaseOrder,
      message: `${purchaseOrder.poNumber} created successfully.`,
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
          p.id AS productId,
          p.sku AS productCode,
          p.name AS productName,
          pol.quantity_ordered AS orderedQuantity,
          pol.quantity_received AS receivedQuantity,
          pol.unit_cost AS unitCost,
          (pol.quantity_ordered - pol.quantity_received) * pol.unit_cost AS lineTotal,
          pol.quantity_ordered - pol.quantity_received AS remainingQuantity,
          p.is_serial_tracked AS serialTrackingRequired,
          COALESCE(GROUP_CONCAT(DISTINCT so.order_number), '') AS linkedSalesOrderReferences,
          COALESCE(GROUP_CONCAT(DISTINCT so.id), '') AS linkedSalesOrderIds
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

    const linkedSalesOrders = await all(
      `
        SELECT id, order_number
        FROM sales_orders
        WHERE linked_purchase_order_id = ?
        ORDER BY order_number ASC
      `,
      [detail.id]
    );

    res.json({
      id: detail.id,
      poNumber: detail.poNumber,
      supplier: detail.supplier,
      supplierId: detail.supplier_id,
      status: detail.status,
      orderDate: detail.orderDate,
      expectedDeliveryDate: detail.expectedDeliveryDate,
      supplierReference: detail.supplier_reference || "",
      notes: detail.notes || "",
      linkedSalesOrders: linkedSalesOrders.map((salesOrder) => ({
        id: salesOrder.id,
        orderNumber: salesOrder.order_number,
      })),
      totalOrderedQuantity: Number(detail.totalOrderedQuantity) || 0,
      totalReceivedQuantity: Number(detail.totalReceivedQuantity) || 0,
      lineCount: Number(detail.lineCount) || 0,
      openLineCount: Number(detail.openLineCount) || 0,
      lines: lines.map((line) => ({
        id: line.id,
        productId: line.productId,
        productCode: line.productCode,
        productName: line.productName,
        orderedQuantity: Number(line.orderedQuantity) || 0,
        receivedQuantity: Number(line.receivedQuantity) || 0,
        unitCost: Number(line.unitCost) || 0,
        lineTotal: Number(line.lineTotal) || 0,
        remainingQuantity: Number(line.remainingQuantity) || 0,
        serialTrackingRequired: Boolean(line.serialTrackingRequired),
        linkedSalesOrderIds: line.linkedSalesOrderIds
          ? line.linkedSalesOrderIds.split(",").map((value) => Number(value)).filter(Number.isFinite)
          : [],
        linkedSalesOrderReferences: line.linkedSalesOrderReferences
          ? line.linkedSalesOrderReferences.split(",")
          : [],
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/purchase-orders/:poNumber/timeline", async (req, res, next) => {
  try {
    const events = await all(
      `SELECT id, action_type, entity_type, entity_ref,
              user_name, user_role, summary, details_json, created_at
       FROM activity_log
       WHERE entity_type = 'purchase_order' AND entity_ref = ?
       ORDER BY created_at ASC`,
      [req.params.poNumber],
    );
    res.json({ events });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/purchase-orders/:poNumber/receive",
  requireRole("admin", "office", "warehouse", "purchasing"),
  async (req, res, next) => {
    try {
      const userContext = {
        userId: req.user?.id,
        userRole: req.user?.role,
        userName: req.user?.full_name,
      };
      const receipt = await receivePurchaseOrder(req.params.poNumber, req.body, userContext);
      res.status(201).json(receipt);
    } catch (error) {
      next(error);
    }
  }
);

// ── Allocation suggestions ─────────────────────────────────────────────────────
// Returns open SO demand that best matches stock received from a specific PO.
// Suggestions are sorted by: linked PO first → urgent priority → oldest due date.
// Nothing is allocated automatically — the user must confirm via the normal
// allocate endpoint.

function buildSuggestionReasons(row) {
  const reasons = [];

  if (Boolean(row.is_linked)) {
    reasons.push("Linked to this purchase order");
  }

  if (row.priority === "urgent") {
    reasons.push("Marked urgent");
  }

  if (row.dispatch_due_at) {
    const daysUntil = (new Date(row.dispatch_due_at) - Date.now()) / 86_400_000;
    if (daysUntil < 0) {
      const overdueDays = Math.abs(Math.round(daysUntil));
      reasons.push(`Dispatch overdue by ${overdueDays} day${overdueDays !== 1 ? "s" : ""}`);
    } else if (daysUntil < 1) {
      reasons.push("Dispatch due today");
    } else if (daysUntil <= 3) {
      const days = Math.ceil(daysUntil);
      reasons.push(`Dispatch due in ${days} day${days !== 1 ? "s" : ""}`);
    }
  }

  if (!reasons.length) {
    reasons.push("Matching product");
  }

  return reasons;
}

router.get(
  "/allocation/suggestions/:purchaseOrderNumber",
  requireRole("admin", "office", "warehouse", "dispatch", "purchasing"),
  async (req, res, next) => {
    try {
      const { purchaseOrderNumber } = req.params;

      // Find the PO
      const po = await get(
        `SELECT id, order_number FROM purchase_orders WHERE order_number = ? LIMIT 1`,
        [purchaseOrderNumber],
      );

      if (!po) {
        res.status(404).json({ error: `Purchase order ${purchaseOrderNumber} not found.` });
        return;
      }

      // Find all stock from this PO that is available or recently received into hold.
      // We include 'received' status so suggestions appear immediately after booking a receipt —
      // the warehouse team can see open demand before putting stock away.
      const stockRows = await all(
        `
          SELECT
            si.id            AS stock_item_id,
            si.product_id,
            si.serial_number,
            (si.quantity_on_hand - si.quantity_allocated) AS available_qty,
            si.hold_status,
            COALESCE(la.code, ls.code) AS location_code,
            p.sku            AS product_sku,
            p.name           AS product_name,
            p.is_serial_tracked
          FROM stock_items si
          JOIN products p ON p.id = si.product_id
          LEFT JOIN stock_locations la ON la.id = si.actual_location_id
          LEFT JOIN stock_locations ls ON ls.id = si.stock_location_id
          WHERE si.linked_purchase_order_id = ?
            AND si.hold_status IN ('available', 'received')
            AND (si.quantity_on_hand - si.quantity_allocated) > 0
          ORDER BY p.name ASC, si.serial_number ASC
        `,
        [po.id],
      );

      if (!stockRows.length) {
        res.json({ purchaseOrderNumber, suggestions: [] });
        return;
      }

      // Group stock by product
      const byProduct = new Map();
      for (const row of stockRows) {
        if (!byProduct.has(row.product_id)) {
          byProduct.set(row.product_id, {
            productId: row.product_id,
            productSku: row.product_sku,
            productName: row.product_name,
            isSerialTracked: Boolean(row.is_serial_tracked),
            availableStockItems: [],
          });
        }
        byProduct.get(row.product_id).availableStockItems.push({
          stockItemId: row.stock_item_id,
          serialNumber: row.serial_number || null,
          availableQty: Number(row.available_qty),
          locationCode: row.location_code || null,
          holdStatus: row.hold_status,
          requiresPutaway: row.hold_status === "received",
        });
      }

      const suggestions = [];

      for (const [productId, productGroup] of byProduct) {
        const totalAvailableQty = productGroup.availableStockItems.reduce(
          (sum, item) => sum + item.availableQty,
          0,
        );

        // Find open SO lines for this product, sorted by priority
        const soRows = await all(
          `
            SELECT
              sol.id            AS line_id,
              sol.product_id,
              (sol.quantity_ordered - sol.quantity_allocated) AS remaining_qty,
              so.id             AS so_id,
              so.order_number,
              so.dispatch_due_at,
              so.status,
              COALESCE(so.priority, 'normal') AS priority,
              c.name            AS customer_name,
              c.id              AS customer_id,
              CASE WHEN psl.id IS NOT NULL THEN 1 ELSE 0 END AS is_linked
            FROM sales_order_lines sol
            JOIN sales_orders so ON so.id = sol.sales_order_id
            JOIN customers c ON c.id = so.customer_id
            LEFT JOIN purchase_sales_links psl
              ON psl.sales_order_line_id = sol.id
              AND psl.purchase_order_line_id IN (
                SELECT id FROM purchase_order_lines WHERE purchase_order_id = ?
              )
            WHERE sol.product_id = ?
              AND sol.quantity_ordered > sol.quantity_allocated
              AND so.status NOT IN ('dispatched', 'cancelled')
            GROUP BY sol.id, so.id
            ORDER BY
              is_linked DESC,
              CASE COALESCE(so.priority, 'normal') WHEN 'urgent' THEN 0 ELSE 1 END ASC,
              COALESCE(so.dispatch_due_at, '9999-12-31') ASC
            LIMIT 10
          `,
          [po.id, productId],
        );

        if (!soRows.length) continue;

        const matchedSalesOrders = soRows.map((row) => {
          const remaining = Number(row.remaining_qty);
          const isLinked = Boolean(row.is_linked);
          return {
            salesOrderNumber: row.order_number,
            salesOrderLineId: row.line_id,
            customerId: row.customer_id,
            customerName: row.customer_name,
            priority: row.priority || "normal",
            dispatchDueAt: row.dispatch_due_at || null,
            isLinked,
            remainingQuantity: remaining,
            canFullyFulfill: totalAvailableQty >= remaining,
            reasons: buildSuggestionReasons(row),
          };
        });

        const requiresPutaway = productGroup.availableStockItems.some((item) => item.requiresPutaway);

        suggestions.push({
          ...productGroup,
          availableQuantity: totalAvailableQty,
          requiresPutaway,
          matchedSalesOrders,
        });
      }

      res.json({ purchaseOrderNumber, suggestions });
    } catch (error) {
      next(error);
    }
  },
);

router.use("/serials", serialsRouter);
router.use("/search", searchRouter);
router.use("/returns", returnsRouter);
router.use("/dashboard/exceptions", exceptionsRouter);
router.use("/audit-log", auditRouter);
router.use("/users", usersRouter);
router.use("/demo", demoRouter);

// Dedicated GET /products with optional ?active=true filter
router.get("/products", async (req, res, next) => {
  const activeOnly = req.query.active === "true";
  try {
    const items = await all(
      activeOnly
        ? "SELECT * FROM products WHERE status = 'active' ORDER BY name ASC"
        : "SELECT * FROM products ORDER BY name ASC"
    );
    res.json({ resource: "products", items });
  } catch (error) {
    next(error);
  }
});

// Dedicated GET /customers with optional ?search= filter (active only)
router.get("/customers", async (req, res, next) => {
  const search = String(req.query.search || "").trim().toLowerCase();
  try {
    const items = await all("SELECT * FROM customers WHERE status = 'active' ORDER BY name ASC");
    const filtered = search
      ? items.filter(
          (c) =>
            c.name.toLowerCase().includes(search) ||
            c.code.toLowerCase().includes(search)
        )
      : items;
    res.json({ resource: "customers", items: filtered });
  } catch (error) {
    next(error);
  }
});

// POST /customers — quick create
router.post(
  "/customers",
  requireRole("admin", "office", "purchasing", "dispatch"),
  async (req, res, next) => {
    try {
      const name = String(req.body?.name || "").trim();
      const contactName = String(req.body?.contactName || "").trim();
      const email = String(req.body?.email || "").trim();
      const phone = String(req.body?.phone || "").trim();

      if (!name) {
        return res.status(400).json({ error: true, message: "Customer name is required." });
      }

      const code =
        "CUST-" +
        name
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, "-")
          .slice(0, 20)
          .replace(/-$/, "") +
        "-" +
        Date.now().toString().slice(-5);

      const result = await run(
        `INSERT INTO customers (code, name, contact_name, email, phone, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [code, name, contactName, email, phone]
      );
      const customer = await get("SELECT * FROM customers WHERE id = ?", [result.id]);
      res.status(201).json(customer);
    } catch (error) {
      next(error);
    }
  }
);

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
