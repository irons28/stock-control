const express = require("express");
const { all, get } = require("../db/connection");

const router = express.Router();

function normalizeSerial(value = "") {
  return String(value).trim().toUpperCase();
}

function deriveStatus(row) {
  const holdStatus = normalizeSerial(row.hold_status || "");
  const knownStatuses = {
    AVAILABLE: "available",
    ALLOCATED: "allocated",
    DISPATCHED: "dispatched",
    RETURNED: "returned",
    QUARANTINED: "quarantined",
  };

  if (knownStatuses[holdStatus]) {
    return knownStatuses[holdStatus];
  }

  if (Number(row.quantity_allocated) > 0) {
    return "allocated";
  }

  if (Number(row.quantity_on_hand) <= 0 && row.sales_order_number) {
    return "dispatched";
  }

  return "available";
}

async function hasActivityLogTable() {
  const row = await get(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'activity_log'",
  );

  return Boolean(row);
}

async function getSerialSummary(serialNumber) {
  return get(
    `
      SELECT
        si.id,
        si.serial_number,
        si.quantity_on_hand,
        si.quantity_allocated,
        si.hold_status,
        si.hold_reason,
        p.sku AS product_sku,
        p.name AS product_name,
        p.description AS product_description,
        s.code AS supplier_code,
        s.name AS supplier_name,
        po.order_number AS purchase_order_number,
        po.ordered_at AS purchase_order_ordered_at,
        so.order_number AS sales_order_number,
        so.requested_at AS sales_order_requested_at,
        so.dispatch_due_at,
        c.code AS customer_code,
        c.name AS customer_name,
        location.code AS current_location_code,
        location.name AS current_location_name,
        (
          SELECT gr.receipt_number
          FROM goods_receipt_lines grl
          JOIN goods_receipts gr ON gr.id = grl.goods_receipt_id
          WHERE grl.purchase_order_line_id = si.linked_purchase_order_line_id
          ORDER BY datetime(gr.received_at) ASC, gr.id ASC
          LIMIT 1
        ) AS receipt_number,
        (
          SELECT gr.delivery_number
          FROM goods_receipt_lines grl
          JOIN goods_receipts gr ON gr.id = grl.goods_receipt_id
          WHERE grl.purchase_order_line_id = si.linked_purchase_order_line_id
          ORDER BY datetime(gr.received_at) ASC, gr.id ASC
          LIMIT 1
        ) AS delivery_number,
        (
          SELECT gr.received_at
          FROM goods_receipt_lines grl
          JOIN goods_receipts gr ON gr.id = grl.goods_receipt_id
          WHERE grl.purchase_order_line_id = si.linked_purchase_order_line_id
          ORDER BY datetime(gr.received_at) ASC, gr.id ASC
          LIMIT 1
        ) AS purchase_order_received_date,
        (
          SELECT MAX(sm.created_at)
          FROM stock_movements sm
          WHERE sm.stock_item_id = si.id AND sm.movement_type = 'dispatch'
        ) AS dispatch_date
      FROM stock_items si
      JOIN products p ON p.id = si.product_id
      LEFT JOIN suppliers s ON s.id = p.default_supplier_id
      LEFT JOIN purchase_orders po ON po.id = si.linked_purchase_order_id
      LEFT JOIN sales_orders so ON so.id = si.linked_sales_order_id
      LEFT JOIN customers c ON c.id = si.customer_id
      LEFT JOIN stock_locations location ON location.id = si.actual_location_id
      WHERE UPPER(si.serial_number) = UPPER(?)
      LIMIT 1
    `,
    [serialNumber],
  );
}

async function getMovementHistory(stockItemId) {
  return all(
    `
      SELECT
        sm.id,
        sm.created_at AS occurred_at,
        sm.movement_type AS event_type,
        sm.notes,
        COALESCE(actual_source.code, planned_source.code) AS source_location_code,
        COALESCE(actual_source.name, planned_source.name) AS source_location_name,
        COALESCE(actual_destination.code, planned_destination.code) AS destination_location_code,
        COALESCE(actual_destination.name, planned_destination.name) AS destination_location_name,
        po.order_number AS purchase_order_number,
        so.order_number AS sales_order_number,
        c.name AS customer_name,
        u.full_name AS moved_by_name,
        sm.reference_type,
        sm.reference_id
      FROM stock_movements sm
      LEFT JOIN stock_locations planned_source ON planned_source.id = sm.source_location_id
      LEFT JOIN stock_locations planned_destination ON planned_destination.id = sm.destination_location_id
      LEFT JOIN stock_locations actual_source ON actual_source.id = sm.actual_source_location_id
      LEFT JOIN stock_locations actual_destination ON actual_destination.id = sm.actual_destination_location_id
      LEFT JOIN purchase_orders po ON po.id = sm.linked_purchase_order_id
      LEFT JOIN sales_orders so ON so.id = sm.linked_sales_order_id
      LEFT JOIN customers c ON c.id = sm.customer_id
      LEFT JOIN users u ON u.id = sm.moved_by_user_id
      WHERE sm.stock_item_id = ?
      ORDER BY datetime(sm.created_at) ASC, sm.id ASC
    `,
    [stockItemId],
  );
}

async function getActivityHistory(stockItemId, serialNumber) {
  if (!(await hasActivityLogTable())) {
    return [];
  }

  return all(
    `
      SELECT
        id,
        created_at AS occurred_at,
        activity_type AS event_type,
        summary,
        reference_type,
        reference_id
      FROM activity_log
      WHERE stock_item_id = ? OR UPPER(serial_number) = UPPER(?)
      ORDER BY datetime(created_at) ASC, id ASC
    `,
    [stockItemId, serialNumber],
  );
}

function buildTimeline(movements, activities) {
  const entries = [
    ...movements.map((movement) => ({
      id: `movement-${movement.id}`,
      occurred_at: movement.occurred_at,
      event_type: movement.event_type,
      source: "stock_movements",
      summary: movement.notes || "",
      source_location_code: movement.source_location_code,
      source_location_name: movement.source_location_name,
      destination_location_code: movement.destination_location_code,
      destination_location_name: movement.destination_location_name,
      purchase_order_number: movement.purchase_order_number,
      sales_order_number: movement.sales_order_number,
      customer_name: movement.customer_name,
      moved_by_name: movement.moved_by_name,
      reference_type: movement.reference_type,
      reference_id: movement.reference_id,
    })),
    ...activities.map((activity) => ({
      id: `activity-${activity.id}`,
      occurred_at: activity.occurred_at,
      event_type: activity.event_type,
      source: "activity_log",
      summary: activity.summary,
      reference_type: activity.reference_type,
      reference_id: activity.reference_id,
    })),
  ];

  return entries.sort((left, right) => {
    const leftTime = new Date(left.occurred_at).getTime();
    const rightTime = new Date(right.occurred_at).getTime();

    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    return left.id.localeCompare(right.id);
  });
}

router.get("/", async (req, res, next) => {
  const search = normalizeSerial(req.query.search || "");

  if (!search) {
    res.json({
      search: "",
      items: [],
    });
    return;
  }

  try {
    const items = await all(
      `
        SELECT
          si.serial_number,
          si.quantity_on_hand,
          si.quantity_allocated,
          si.hold_status,
          p.sku AS product_sku,
          p.name AS product_name,
          s.name AS supplier_name,
          po.order_number AS purchase_order_number,
          so.order_number AS sales_order_number,
          c.name AS customer_name,
          (
            SELECT MAX(sm.created_at)
            FROM stock_movements sm
            WHERE sm.stock_item_id = si.id AND sm.movement_type = 'dispatch'
          ) AS dispatch_date
        FROM stock_items si
        JOIN products p ON p.id = si.product_id
        LEFT JOIN suppliers s ON s.id = p.default_supplier_id
        LEFT JOIN purchase_orders po ON po.id = si.linked_purchase_order_id
        LEFT JOIN sales_orders so ON so.id = si.linked_sales_order_id
        LEFT JOIN customers c ON c.id = si.customer_id
        WHERE UPPER(si.serial_number) LIKE ?
        ORDER BY
          CASE WHEN UPPER(si.serial_number) = ? THEN 0 ELSE 1 END,
          si.serial_number ASC
        LIMIT 25
      `,
      [`%${search}%`, search],
    );

    res.json({
      search,
      items: items.map((item) => ({
        serialNumber: item.serial_number,
        product: {
          sku: item.product_sku,
          name: item.product_name,
        },
        supplier: item.supplier_name,
        purchaseOrder: item.purchase_order_number,
        currentStatus: deriveStatus(item),
        allocatedCustomer: item.customer_name,
        salesOrder: item.sales_order_number,
        dispatchDate: item.dispatch_date,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:serialNumber", async (req, res, next) => {
  const serialNumber = normalizeSerial(req.params.serialNumber);

  try {
    const summary = await getSerialSummary(serialNumber);

    if (!summary) {
      res.status(404).json({
        error: `Serial ${serialNumber} was not found.`,
      });
      return;
    }

    const [movements, activities] = await Promise.all([
      getMovementHistory(summary.id),
      getActivityHistory(summary.id, serialNumber),
    ]);

    res.json({
      serialNumber: summary.serial_number,
      product: {
        sku: summary.product_sku,
        name: summary.product_name,
        description: summary.product_description,
      },
      supplier: {
        code: summary.supplier_code,
        name: summary.supplier_name,
      },
      purchaseOrder: {
        orderNumber: summary.purchase_order_number,
        orderedAt: summary.purchase_order_ordered_at,
      },
      purchaseOrderReceivedDate: summary.purchase_order_received_date,
      deliveryNumber: summary.delivery_number || summary.receipt_number,
      receiptNumber: summary.receipt_number,
      currentStatus: deriveStatus(summary),
      currentLocation: summary.current_location_code
        ? {
            code: summary.current_location_code,
            name: summary.current_location_name,
          }
        : null,
      allocatedCustomer: summary.customer_name
        ? {
            code: summary.customer_code,
            name: summary.customer_name,
          }
        : null,
      salesOrder: summary.sales_order_number
        ? {
            orderNumber: summary.sales_order_number,
            requestedAt: summary.sales_order_requested_at,
            dispatchDueAt: summary.dispatch_due_at,
          }
        : null,
      dispatchDate: summary.dispatch_date,
      holdReason: summary.hold_reason || "",
      movementHistory: buildTimeline(movements, activities),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
