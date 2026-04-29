const express = require("express");
const { all } = require("../db/connection");

const router = express.Router();

const MAX_PER_GROUP = 6;

// ── GET /api/search?q=<term> ──────────────────────────────────────────────────
// Returns grouped results across POs, SOs, serials, customers, suppliers, products.
// Each result has a consistent shape:
//   { type, id, title, subtitle, meta: [string], path }
// ──────────────────────────────────────────────────────────────────────────────
router.get("/", async (req, res, next) => {
  try {
    const raw = String(req.query.q || "").trim();

    if (raw.length < 1) {
      return res.json({ query: raw, total: 0, groups: {} });
    }

    // Wildcard match — keep uppercase for case-insensitive compare on serial/sku
    const like = `%${raw}%`;
    const likeUp = `%${raw.toUpperCase()}%`;

    // Run all 6 queries in parallel for speed
    const [poRows, soRows, serialRows, customerRows, supplierRows, productRows] =
      await Promise.all([
        // ── Purchase orders ──────────────────────────────────────────────────
        // Matches: PO number, supplier name/code, delivery note (goods_receipt.receipt_number)
        all(
          `SELECT DISTINCT
             po.id,
             po.order_number AS title,
             s.name          AS subtitle,
             po.status,
             po.expected_at,
             po.ordered_at,
             COALESCE(SUM(pol.quantity_ordered), 0)  AS total_qty,
             COALESCE(SUM(pol.quantity_received), 0) AS received_qty
           FROM purchase_orders po
           JOIN suppliers s ON s.id = po.supplier_id
           LEFT JOIN purchase_order_lines pol ON pol.purchase_order_id = po.id
           WHERE po.order_number LIKE ?
              OR UPPER(po.order_number) LIKE ?
              OR UPPER(s.name)  LIKE ?
              OR UPPER(s.code)  LIKE ?
              OR EXISTS (
                SELECT 1 FROM goods_receipts gr
                WHERE gr.purchase_order_id = po.id
                  AND UPPER(gr.receipt_number) LIKE ?
              )
              OR UPPER(COALESCE(po.notes,'')) LIKE ?
           GROUP BY po.id
           ORDER BY po.created_at DESC
           LIMIT ?`,
          [like, likeUp, likeUp, likeUp, likeUp, likeUp, MAX_PER_GROUP],
        ),

        // ── Sales orders ─────────────────────────────────────────────────────
        // Matches: SO number, customer name/code, dispatch reference in stock movements
        all(
          `SELECT DISTINCT
             so.id,
             so.order_number AS title,
             c.name          AS subtitle,
             so.status,
             so.dispatch_due_at,
             so.requested_at
           FROM sales_orders so
           JOIN customers c ON c.id = so.customer_id
           WHERE UPPER(so.order_number) LIKE ?
              OR UPPER(c.name)  LIKE ?
              OR UPPER(c.code)  LIKE ?
              OR UPPER(COALESCE(so.notes,'')) LIKE ?
              OR EXISTS (
                SELECT 1 FROM stock_movements sm
                WHERE sm.linked_sales_order_id = so.id
                  AND UPPER(COALESCE(sm.notes,'')) LIKE ?
              )
           ORDER BY so.created_at DESC
           LIMIT ?`,
          [likeUp, likeUp, likeUp, likeUp, likeUp, MAX_PER_GROUP],
        ),

        // ── Serials ──────────────────────────────────────────────────────────
        // Matches: serial number, SKU, product name, barcode, hold_reason (stores dispatch ref)
        all(
          `SELECT
             si.id,
             si.serial_number AS title,
             p.name           AS subtitle,
             p.sku,
             si.hold_status,
             si.hold_reason,
             sl.code          AS location_code,
             sl.name          AS location_name
           FROM stock_items si
           JOIN products p ON p.id = si.product_id
           LEFT JOIN stock_locations sl ON sl.id = si.stock_location_id
           WHERE si.serial_number IS NOT NULL
             AND (
               UPPER(si.serial_number)             LIKE ?
               OR UPPER(p.sku)                     LIKE ?
               OR UPPER(p.name)                    LIKE ?
               OR UPPER(COALESCE(p.barcode,''))    LIKE ?
               OR UPPER(COALESCE(si.hold_reason,'')) LIKE ?
             )
           ORDER BY si.created_at DESC
           LIMIT ?`,
          [likeUp, likeUp, likeUp, likeUp, likeUp, MAX_PER_GROUP],
        ),

        // ── Customers ────────────────────────────────────────────────────────
        all(
          `SELECT
             c.id,
             c.name         AS title,
             c.code         AS subtitle,
             c.contact_name,
             c.email,
             c.city,
             c.status
           FROM customers c
           WHERE UPPER(c.name)         LIKE ?
              OR UPPER(c.code)         LIKE ?
              OR UPPER(COALESCE(c.contact_name,'')) LIKE ?
              OR UPPER(COALESCE(c.email,''))        LIKE ?
              OR UPPER(COALESCE(c.city,''))         LIKE ?
           ORDER BY c.name ASC
           LIMIT ?`,
          [likeUp, likeUp, likeUp, likeUp, likeUp, MAX_PER_GROUP],
        ),

        // ── Suppliers ────────────────────────────────────────────────────────
        all(
          `SELECT
             s.id,
             s.name              AS title,
             s.code              AS subtitle,
             s.contact_name,
             s.account_reference,
             s.city,
             s.status
           FROM suppliers s
           WHERE UPPER(s.name)              LIKE ?
              OR UPPER(s.code)              LIKE ?
              OR UPPER(COALESCE(s.contact_name,''))       LIKE ?
              OR UPPER(COALESCE(s.account_reference,''))  LIKE ?
           ORDER BY s.name ASC
           LIMIT ?`,
          [likeUp, likeUp, likeUp, likeUp, MAX_PER_GROUP],
        ),

        // ── Products ─────────────────────────────────────────────────────────
        all(
          `SELECT
             p.id,
             p.name          AS title,
             p.sku           AS subtitle,
             p.category,
             p.tracking_mode,
             p.status,
             p.barcode
           FROM products p
           WHERE UPPER(p.sku)              LIKE ?
              OR UPPER(p.name)             LIKE ?
              OR UPPER(COALESCE(p.barcode,''))      LIKE ?
              OR UPPER(COALESCE(p.description,''))  LIKE ?
              OR UPPER(COALESCE(p.category,''))     LIKE ?
           ORDER BY p.name ASC
           LIMIT ?`,
          [likeUp, likeUp, likeUp, likeUp, likeUp, MAX_PER_GROUP],
        ),
      ]);

    // ── Shape results ────────────────────────────────────────────────────────

    const purchaseOrders = poRows.map((r) => ({
      type: "purchase_order",
      id: r.id,
      title: r.title,
      subtitle: r.subtitle,
      status: r.status,
      meta: [
        r.expected_at ? `Due ${r.expected_at}` : null,
        `${Number(r.received_qty)} / ${Number(r.total_qty)} received`,
      ].filter(Boolean),
      path: `/purchase-orders`,
    }));

    const salesOrders = soRows.map((r) => ({
      type: "sales_order",
      id: r.id,
      title: r.title,
      subtitle: r.subtitle,
      status: r.status,
      meta: [r.dispatch_due_at ? `Dispatch by ${r.dispatch_due_at}` : null].filter(Boolean),
      path: `/sales-orders`,
    }));

    const serials = serialRows.map((r) => ({
      type: "serial",
      id: r.id,
      title: r.title,
      subtitle: r.subtitle,
      status: r.hold_status,
      meta: [
        r.sku,
        r.location_code ? `@ ${r.location_code}` : null,
      ].filter(Boolean),
      path: `/serial-tracker`,
      extra: { serial: r.title },
    }));

    const customers = customerRows.map((r) => ({
      type: "customer",
      id: r.id,
      title: r.title,
      subtitle: r.subtitle,
      status: r.status,
      meta: [
        r.contact_name || null,
        r.city || null,
      ].filter(Boolean),
      path: `/sales-orders`,
    }));

    const suppliers = supplierRows.map((r) => ({
      type: "supplier",
      id: r.id,
      title: r.title,
      subtitle: r.subtitle,
      status: r.status,
      meta: [
        r.contact_name || null,
        r.account_reference ? `Ref: ${r.account_reference}` : null,
      ].filter(Boolean),
      path: `/purchase-orders`,
    }));

    const products = productRows.map((r) => ({
      type: "product",
      id: r.id,
      title: r.title,
      subtitle: r.subtitle,
      status: r.status,
      meta: [
        r.category || null,
        r.tracking_mode || null,
      ].filter(Boolean),
      path: `/products`,
    }));

    const groups = {};
    if (purchaseOrders.length) groups.purchase_orders = purchaseOrders;
    if (salesOrders.length) groups.sales_orders = salesOrders;
    if (serials.length) groups.serials = serials;
    if (customers.length) groups.customers = customers;
    if (suppliers.length) groups.suppliers = suppliers;
    if (products.length) groups.products = products;

    const total =
      purchaseOrders.length +
      salesOrders.length +
      serials.length +
      customers.length +
      suppliers.length +
      products.length;

    res.json({ query: raw, total, groups });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
