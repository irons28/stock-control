const express = require("express");
const { all } = require("../db/connection");

const router = express.Router();

const ITEM_LIMIT = 15;

// ── GET /api/dashboard/exceptions ────────────────────────────────────────────
// Returns 7 exception categories with full row-level detail.
// All 7 queries run in parallel; severity is computed per-category then rolled up.
// ──────────────────────────────────────────────────────────────────────────────
router.get("/", async (_req, res, next) => {
  try {
    const [
      overduePoRows,
      overdueDispatchRows,
      urgentDeadlineRows,
      quarantinedRows,
      returnedRows,
      partialAllocRows,
      stalledAllocRows,
    ] = await Promise.all([

      // 1 ── Overdue purchase orders ─────────────────────────────────────────
      // POs past expected_at with at least one line not fully received
      all(
        `SELECT
           po.order_number,
           s.name  AS supplier_name,
           po.expected_at,
           po.status,
           CAST(julianday('now') - julianday(po.expected_at) AS INTEGER)     AS days_overdue,
           COALESCE(SUM(pol.quantity_ordered),  0)                           AS qty_ordered,
           COALESCE(SUM(pol.quantity_received), 0)                           AS qty_received,
           COALESCE(SUM(pol.quantity_ordered - pol.quantity_received), 0)    AS qty_outstanding,
           COUNT(pol.id)                                                     AS line_count,
           COUNT(CASE WHEN pol.quantity_received < pol.quantity_ordered THEN 1 END) AS open_lines,
           COALESCE((
             SELECT COUNT(*) FROM purchase_sales_links psl
             JOIN purchase_order_lines pol2 ON pol2.id = psl.purchase_order_line_id
             WHERE pol2.purchase_order_id = po.id
           ), 0) AS linked_so_count
         FROM purchase_orders po
         JOIN suppliers s ON s.id = po.supplier_id
         JOIN purchase_order_lines pol ON pol.purchase_order_id = po.id
        WHERE po.status NOT IN ('received', 'cancelled')
          AND po.expected_at IS NOT NULL
          AND date(po.expected_at) < date('now')
        GROUP BY po.id
        HAVING SUM(pol.quantity_received) < SUM(pol.quantity_ordered)
        ORDER BY po.expected_at ASC
        LIMIT ?`,
        [ITEM_LIMIT],
      ),

      // 2 ── Overdue customer dispatches ────────────────────────────────────
      // SOs past dispatch_due_at, not cancelled or dispatched
      all(
        `SELECT
           so.order_number,
           c.name  AS customer_name,
           so.dispatch_due_at,
           so.status,
           CAST(julianday('now') - julianday(so.dispatch_due_at) AS INTEGER) AS days_overdue,
           COALESCE(SUM(sol.quantity_ordered - sol.quantity_dispatched), 0)  AS qty_remaining,
           COUNT(sol.id)                                                     AS line_count,
           COALESCE(SUM(sol.quantity_allocated), 0)                         AS qty_allocated
         FROM sales_orders so
         JOIN customers c ON c.id = so.customer_id
         JOIN sales_order_lines sol ON sol.sales_order_id = so.id
        WHERE so.status NOT IN ('dispatched', 'cancelled')
          AND so.dispatch_due_at IS NOT NULL
          AND date(so.dispatch_due_at) < date('now')
        GROUP BY so.id
        ORDER BY so.dispatch_due_at ASC
        LIMIT ?`,
        [ITEM_LIMIT],
      ),

      // 3 ── Urgent customer deadlines (today + 3 days, not overdue) ────────
      all(
        `SELECT
           so.order_number,
           c.name  AS customer_name,
           so.dispatch_due_at,
           so.status,
           CAST(julianday(so.dispatch_due_at) - julianday('now') AS INTEGER) AS days_remaining,
           COALESCE(SUM(sol.quantity_ordered - sol.quantity_dispatched), 0)  AS qty_remaining,
           COALESCE(SUM(sol.quantity_allocated), 0)                         AS qty_allocated,
           COALESCE(SUM(sol.quantity_ordered), 0)                           AS qty_ordered
         FROM sales_orders so
         JOIN customers c ON c.id = so.customer_id
         JOIN sales_order_lines sol ON sol.sales_order_id = so.id
        WHERE so.status NOT IN ('dispatched', 'cancelled')
          AND so.dispatch_due_at IS NOT NULL
          AND date(so.dispatch_due_at) >= date('now')
          AND date(so.dispatch_due_at) <= date('now', '+3 days')
        GROUP BY so.id
        ORDER BY so.dispatch_due_at ASC
        LIMIT ?`,
        [ITEM_LIMIT],
      ),

      // 4 ── Quarantined stock ───────────────────────────────────────────────
      all(
        `SELECT
           si.serial_number,
           p.name  AS product_name,
           p.sku,
           sl.code AS location_code,
           COALESCE(si.hold_reason, '') AS hold_reason,
           si.updated_at,
           CAST(julianday('now') - julianday(si.updated_at) AS INTEGER) AS days_quarantined
         FROM stock_items si
         JOIN products p ON p.id = si.product_id
         LEFT JOIN stock_locations sl ON sl.id = si.stock_location_id
        WHERE si.hold_status = 'quarantined'
          AND si.status = 'active'
        ORDER BY si.updated_at ASC
        LIMIT ?`,
        [ITEM_LIMIT],
      ),

      // 5 ── Returned stock awaiting action ─────────────────────────────────
      all(
        `SELECT
           si.serial_number,
           p.name  AS product_name,
           p.sku,
           sl.code AS location_code,
           COALESCE(si.hold_reason, '') AS hold_reason,
           si.updated_at,
           CAST(julianday('now') - julianday(si.updated_at) AS INTEGER) AS days_returned
         FROM stock_items si
         JOIN products p ON p.id = si.product_id
         LEFT JOIN stock_locations sl ON sl.id = si.stock_location_id
        WHERE si.hold_status = 'returned'
          AND si.status = 'active'
        ORDER BY si.updated_at ASC
        LIMIT ?`,
        [ITEM_LIMIT],
      ),

      // 6 ── Partially allocated orders ─────────────────────────────────────
      // SOs with at least one line where allocated < ordered, not cancelled
      all(
        `SELECT
           so.order_number,
           c.name  AS customer_name,
           so.dispatch_due_at,
           so.status,
           COALESCE(SUM(sol.quantity_ordered), 0)   AS qty_ordered,
           COALESCE(SUM(sol.quantity_allocated), 0) AS qty_allocated,
           COALESCE(SUM(
             CASE WHEN sol.quantity_allocated < sol.quantity_ordered
               THEN sol.quantity_ordered - sol.quantity_allocated ELSE 0 END
           ), 0) AS unallocated_qty,
           COUNT(CASE WHEN sol.quantity_allocated < sol.quantity_ordered THEN 1 END) AS unallocated_lines
         FROM sales_orders so
         JOIN customers c ON c.id = so.customer_id
         JOIN sales_order_lines sol ON sol.sales_order_id = so.id
        WHERE so.status NOT IN ('dispatched', 'cancelled')
        GROUP BY so.id
        HAVING SUM(sol.quantity_allocated) < SUM(sol.quantity_ordered)
        ORDER BY so.dispatch_due_at ASC NULLS LAST, so.created_at ASC
        LIMIT ?`,
        [ITEM_LIMIT],
      ),

      // 7 ── Stalled allocations ─────────────────────────────────────────────
      // Stock sits in 'allocated' state but the linked SO's dispatch_due_at is past
      all(
        `SELECT
           so.order_number,
           c.name  AS customer_name,
           so.dispatch_due_at,
           so.status,
           CAST(julianday('now') - julianday(so.dispatch_due_at) AS INTEGER) AS days_overdue,
           COUNT(si.id)                              AS allocated_item_count,
           COUNT(CASE WHEN si.serial_number IS NOT NULL THEN 1 END) AS serial_count,
           GROUP_CONCAT(si.serial_number, ', ')      AS serial_numbers
         FROM stock_items si
         JOIN sales_orders so ON so.id = si.linked_sales_order_id
         JOIN customers c ON c.id = so.customer_id
        WHERE si.hold_status = 'allocated'
          AND so.status NOT IN ('dispatched', 'cancelled')
          AND so.dispatch_due_at IS NOT NULL
          AND date(so.dispatch_due_at) < date('now')
        GROUP BY so.id
        ORDER BY so.dispatch_due_at ASC
        LIMIT ?`,
        [ITEM_LIMIT],
      ),
    ]);

    // ── Compute per-category severity ─────────────────────────────────────
    // urgent_deadlines severity is per-item (days_remaining 0 = critical, 1-3 = warning)
    const urgentCritical = urgentDeadlineRows.filter((r) => Number(r.days_remaining) <= 0);
    const urgentWarning  = urgentDeadlineRows.filter((r) => Number(r.days_remaining) > 0);

    const categories = {
      overdue_purchase_orders: {
        label:       "Overdue Purchase Orders",
        description: "Supplier orders past their expected delivery date with unfulfilled lines.",
        severity:    overduePoRows.length > 0 ? "critical" : "clear",
        count:       overduePoRows.length,
        items:       overduePoRows.map((r) => ({
          ref:             r.order_number,
          party:           r.supplier_name,
          date:            r.expected_at,
          days_overdue:    Number(r.days_overdue),
          qty_outstanding: Number(r.qty_outstanding),
          open_lines:      Number(r.open_lines),
          linked_so_count: Number(r.linked_so_count),
          status:          r.status,
        })),
      },

      overdue_dispatches: {
        label:       "Overdue Customer Dispatches",
        description: "Customer orders past their dispatch due date with remaining units to ship.",
        severity:    overdueDispatchRows.length > 0 ? "critical" : "clear",
        count:       overdueDispatchRows.length,
        items:       overdueDispatchRows.map((r) => ({
          ref:           r.order_number,
          party:         r.customer_name,
          date:          r.dispatch_due_at,
          days_overdue:  Number(r.days_overdue),
          qty_remaining: Number(r.qty_remaining),
          qty_allocated: Number(r.qty_allocated),
          line_count:    Number(r.line_count),
          status:        r.status,
        })),
      },

      urgent_deadlines: {
        label:       "Urgent Customer Deadlines",
        description: "Customer dispatch deadlines falling within the next 3 days.",
        severity:    urgentCritical.length > 0 ? "critical" : urgentWarning.length > 0 ? "warning" : "clear",
        count:       urgentDeadlineRows.length,
        critical_count: urgentCritical.length,
        items:       urgentDeadlineRows.map((r) => {
          const days = Number(r.days_remaining);
          return {
            ref:            r.order_number,
            party:          r.customer_name,
            date:           r.dispatch_due_at,
            days_remaining: days,
            item_severity:  days <= 0 ? "critical" : days <= 1 ? "critical" : "warning",
            qty_remaining:  Number(r.qty_remaining),
            qty_allocated:  Number(r.qty_allocated),
            qty_ordered:    Number(r.qty_ordered),
            status:         r.status,
          };
        }),
      },

      quarantined_stock: {
        label:       "Quarantined Stock",
        description: "Serialised items in quarantine awaiting inspection or decision.",
        severity:    quarantinedRows.length > 0 ? "warning" : "clear",
        count:       quarantinedRows.length,
        items:       quarantinedRows.map((r) => ({
          ref:             r.serial_number,
          party:           r.product_name,
          sku:             r.sku,
          location:        r.location_code,
          hold_reason:     r.hold_reason,
          days_held:       Number(r.days_quarantined),
          updated_at:      r.updated_at,
        })),
      },

      returned_stock: {
        label:       "Returns Awaiting Action",
        description: "Returned items not yet assessed, restocked, or written off.",
        severity:    returnedRows.length > 0 ? "warning" : "clear",
        count:       returnedRows.length,
        items:       returnedRows.map((r) => ({
          ref:         r.serial_number,
          party:       r.product_name,
          sku:         r.sku,
          location:    r.location_code,
          hold_reason: r.hold_reason,
          days_held:   Number(r.days_returned),
          updated_at:  r.updated_at,
        })),
      },

      partially_allocated_orders: {
        label:       "Partially Allocated Orders",
        description: "Customer orders where not all demand lines have been allocated from stock.",
        severity:    partialAllocRows.length > 0 ? "warning" : "clear",
        count:       partialAllocRows.length,
        items:       partialAllocRows.map((r) => ({
          ref:               r.order_number,
          party:             r.customer_name,
          date:              r.dispatch_due_at,
          status:            r.status,
          qty_ordered:       Number(r.qty_ordered),
          qty_allocated:     Number(r.qty_allocated),
          unallocated_qty:   Number(r.unallocated_qty),
          unallocated_lines: Number(r.unallocated_lines),
        })),
      },

      stalled_allocations: {
        label:       "Stalled Dispatch Allocations",
        description: "Stock allocated to orders whose dispatch deadline has already passed.",
        severity:    stalledAllocRows.length > 0 ? "critical" : "clear",
        count:       stalledAllocRows.length,
        items:       stalledAllocRows.map((r) => ({
          ref:                  r.order_number,
          party:                r.customer_name,
          date:                 r.dispatch_due_at,
          days_overdue:         Number(r.days_overdue),
          allocated_item_count: Number(r.allocated_item_count),
          serial_count:         Number(r.serial_count),
          serial_numbers:       r.serial_numbers || "",
          status:               r.status,
        })),
      },
    };

    // ── Roll up severity counts ────────────────────────────────────────────
    let critical_count = 0;
    let warning_count  = 0;

    for (const cat of Object.values(categories)) {
      if (cat.severity === "critical") critical_count += cat.count;
      if (cat.severity === "warning")  warning_count  += cat.count;
    }

    const total_exceptions = critical_count + warning_count;

    res.json({
      generated_at:     new Date().toISOString(),
      total_exceptions,
      critical_count,
      warning_count,
      clear:            total_exceptions === 0,
      exceptions:       categories,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
