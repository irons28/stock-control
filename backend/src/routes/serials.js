const express = require("express");
const { all, get } = require("../db/connection");

const router = express.Router();

// ── GET /api/serials?search=ABC123 ──────────────────────────────────────────
// Returns up to 20 items whose serial_number contains the search term.

router.get("/", async (req, res, next) => {
  try {
    const raw = req.query.search || "";
    const term = raw.trim().toUpperCase();

    if (!term) {
      return res.json({ items: [] });
    }

    const items = await all(
      `SELECT si.*,
         p.sku,
         p.name  AS product_name,
         p.tracking_mode,
         sl.code AS location_code,
         sl.name AS location_name
       FROM stock_items si
       JOIN products p ON p.id = si.product_id
       LEFT JOIN stock_locations sl ON sl.id = si.stock_location_id
       WHERE UPPER(si.serial_number) LIKE ?
       ORDER BY si.created_at DESC
       LIMIT 20`,
      [`%${term}%`],
    );

    res.json({ items });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/serials/:serial ─────────────────────────────────────────────────
// Returns enriched serial detail: full product/supplier/PO/customer context
// plus a unified lifecycle timeline (stock_movements ∪ serial_lifecycle_events).

router.get("/:serial", async (req, res, next) => {
  try {
    const serial = req.params.serial.trim().toUpperCase();

    const item = await get(
      `SELECT
         si.id,
         si.serial_number,
         si.quantity_on_hand,
         si.quantity_allocated,
         si.hold_status,
         si.hold_reason,
         si.status,
         si.created_at,
         si.updated_at,
         -- lifecycle tracking columns (may be '' or NULL on older rows)
         COALESCE(si.delivery_note_ref,   '') AS delivery_note_ref,
         COALESCE(si.dispatch_reference,  '') AS dispatch_reference,
         si.dispatch_date,
         si.return_date,
         COALESCE(si.quarantine_reason,   '') AS quarantine_reason,
         COALESCE(si.replaced_by_serial,  '') AS replaced_by_serial,
         COALESCE(si.replaces_serial,     '') AS replaces_serial,
         si.scrapped_date,
         COALESCE(si.scrapped_reason,     '') AS scrapped_reason,
         -- product
         p.sku,
         p.name             AS product_name,
         p.tracking_mode,
         p.is_serial_tracked,
         p.cost_price,
         p.sell_price,
         -- current location
         sl.code            AS location_code,
         sl.name            AS location_name,
         -- supplier (via product default)
         sup.code           AS supplier_code,
         sup.name           AS supplier_name,
         sup.contact_name   AS supplier_contact,
         -- purchase order
         po.order_number    AS purchase_order_number,
         po.ordered_at      AS purchase_order_date,
         -- customer
         c.code             AS customer_code,
         c.name             AS customer_name,
         -- sales order
         so.order_number    AS sales_order_number,
         -- delivery note from the first goods receipt on this PO line
         (
           SELECT gr.receipt_number
           FROM   goods_receipts gr
           JOIN   goods_receipt_lines grl ON grl.goods_receipt_id = gr.id
           WHERE  grl.purchase_order_line_id = si.linked_purchase_order_line_id
           ORDER  BY gr.received_at ASC
           LIMIT  1
         ) AS goods_receipt_ref,
         (
           SELECT gr.received_at
           FROM   goods_receipts gr
           JOIN   goods_receipt_lines grl ON grl.goods_receipt_id = gr.id
           WHERE  grl.purchase_order_line_id = si.linked_purchase_order_line_id
           ORDER  BY gr.received_at ASC
           LIMIT  1
         ) AS received_date
       FROM  stock_items si
       JOIN  products p        ON p.id  = si.product_id
       LEFT  JOIN suppliers sup ON sup.id = p.default_supplier_id
       LEFT  JOIN stock_locations sl ON sl.id = si.stock_location_id
       LEFT  JOIN purchase_orders po ON po.id = si.linked_purchase_order_id
       LEFT  JOIN customers c        ON c.id  = si.customer_id
       LEFT  JOIN sales_orders so    ON so.id = si.linked_sales_order_id
       WHERE UPPER(si.serial_number) = ?`,
      [serial],
    );

    if (!item) {
      const err = new Error(`Serial '${req.params.serial}' not found`);
      err.status = 404;
      return next(err);
    }

    // Unified timeline: physical stock_movements + business lifecycle events,
    // merged and sorted oldest-first so the UI renders a chronological story.
    const timeline = await all(
      `SELECT
         'movement'                              AS source,
         sm.id,
         sm.movement_type                        AS event_type,
         COALESCE(sm.reference_type, '')         AS reference_type,
         CASE sm.reference_type
           WHEN 'goods_receipt' THEN (
             SELECT gr.receipt_number FROM goods_receipts gr WHERE gr.id = sm.reference_id
           )
           WHEN 'sales_order' THEN (
             SELECT so2.order_number FROM sales_orders so2 WHERE so2.id = sm.reference_id
           )
           ELSE COALESCE(CAST(sm.reference_id AS TEXT), '')
         END                                     AS reference_number,
         (SELECT c2.name FROM customers c2 WHERE c2.id = sm.customer_id) AS customer_name,
         (SELECT c2.code FROM customers c2 WHERE c2.id = sm.customer_id) AS customer_code,
         src.code                                AS source_location_code,
         dest.code                               AS destination_location_code,
         sm.quantity,
         COALESCE(sm.notes, '')                  AS notes,
         sm.created_at                           AS event_at
       FROM  stock_movements sm
       LEFT  JOIN stock_locations src  ON src.id  = sm.source_location_id
       LEFT  JOIN stock_locations dest ON dest.id = sm.destination_location_id
       WHERE sm.stock_item_id = ?

       UNION ALL

       SELECT
         'lifecycle'                             AS source,
         sle.id,
         sle.event_type,
         sle.reference_type,
         sle.reference_number,
         (SELECT c2.name FROM customers c2 WHERE c2.id = sle.customer_id) AS customer_name,
         (SELECT c2.code FROM customers c2 WHERE c2.id = sle.customer_id) AS customer_code,
         NULL                                    AS source_location_code,
         (SELECT sl2.code FROM stock_locations sl2 WHERE sl2.id = sle.location_id) AS destination_location_code,
         1                                       AS quantity,
         sle.notes,
         sle.event_at
       FROM serial_lifecycle_events sle
       WHERE sle.stock_item_id = ?

       ORDER BY event_at ASC, id ASC`,
      [item.id, item.id],
    );

    res.json({ item, timeline });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
