const express = require("express");
const { all, get, run } = require("../db/connection");

const router = express.Router();

function roundQuantity(value) {
  return Number(Number(value || 0).toFixed(2));
}

function normalizeSerial(value = "") {
  return String(value).trim().toUpperCase();
}

function createError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function withTransaction(work) {
  await run("BEGIN TRANSACTION");

  try {
    const result = await work();
    await run("COMMIT");
    return result;
  } catch (error) {
    try {
      await run("ROLLBACK");
    } catch (_rollbackError) {
      // Ignore rollback failures so the original error surfaces.
    }

    throw error;
  }
}

async function fetchDispatchOrderRow(salesOrderId) {
  return get(
    `
      SELECT
        so.id,
        so.order_number,
        so.customer_id,
        so.status,
        so.requested_at,
        so.dispatch_due_at,
        so.notes,
        c.name AS customer_name
      FROM sales_orders so
      JOIN customers c ON c.id = so.customer_id
      WHERE so.id = ?
      LIMIT 1
    `,
    [salesOrderId],
  );
}

async function fetchDispatchOrderRows() {
  return all(
    `
      SELECT
        so.id,
        so.order_number,
        so.customer_id,
        so.status,
        so.requested_at,
        so.dispatch_due_at,
        so.notes,
        c.name AS customer_name
      FROM sales_orders so
      JOIN customers c ON c.id = so.customer_id
      WHERE so.status != 'dispatched'
      ORDER BY datetime(so.dispatch_due_at) ASC, so.order_number ASC
    `,
  );
}

async function fetchDispatchOrderLines(salesOrderId) {
  return all(
    `
      SELECT
        sol.id,
        sol.sales_order_id,
        sol.product_id,
        sol.quantity_ordered,
        sol.quantity_allocated,
        sol.quantity_dispatched,
        p.sku AS product_sku,
        p.name AS product_name,
        p.is_serial_tracked,
        p.unit_of_measure
      FROM sales_order_lines sol
      JOIN products p ON p.id = sol.product_id
      WHERE sol.sales_order_id = ?
      ORDER BY p.name ASC, sol.id ASC
    `,
    [salesOrderId],
  );
}

async function fetchAllocatedStockItems(salesOrderId) {
  return all(
    `
      SELECT
        si.id,
        si.product_id,
        si.stock_location_id,
        si.actual_location_id,
        si.serial_number,
        si.quantity_on_hand,
        si.quantity_allocated,
        si.hold_status,
        si.linked_sales_order_line_id,
        p.sku AS product_sku,
        p.name AS product_name,
        p.is_serial_tracked,
        p.unit_of_measure,
        stock_location.code AS stock_location_code,
        stock_location.name AS stock_location_name,
        actual_location.code AS actual_location_code,
        actual_location.name AS actual_location_name
      FROM stock_items si
      JOIN products p ON p.id = si.product_id
      LEFT JOIN stock_locations stock_location ON stock_location.id = si.stock_location_id
      LEFT JOIN stock_locations actual_location ON actual_location.id = si.actual_location_id
      WHERE si.linked_sales_order_id = ?
        AND si.hold_status = 'allocated'
      ORDER BY p.name ASC, si.serial_number ASC, si.id ASC
    `,
    [salesOrderId],
  );
}

function buildDispatchReadyPayload(order, lines, allocatedItems) {
  if (!order || !lines.length) {
    return null;
  }

  const allocatedByLine = allocatedItems.reduce((accumulator, item) => {
    const key = item.linked_sales_order_line_id;
    if (!accumulator.has(key)) {
      accumulator.set(key, []);
    }

    accumulator.get(key).push(item);
    return accumulator;
  }, new Map());

  let totalAllocatedQuantity = 0;
  let totalSerials = 0;
  let hasRemainingToDispatch = false;

  const mappedLines = lines.map((line) => {
    const lineAllocatedItems = allocatedByLine.get(line.id) || [];
    const allocatedQuantityFromStock = roundQuantity(
      lineAllocatedItems.reduce(
        (total, item) => total + Number(item.quantity_allocated || item.quantity_on_hand || 0),
        0,
      ),
    );
    const quantityOrdered = Number(line.quantity_ordered || 0);
    const quantityAllocated = Number(line.quantity_allocated || 0);
    const quantityDispatched = Number(line.quantity_dispatched || 0);
    const remainingToDispatch = roundQuantity(quantityOrdered - quantityDispatched);

    totalAllocatedQuantity += allocatedQuantityFromStock;
    totalSerials += lineAllocatedItems.filter((item) => item.serial_number).length;

    if (remainingToDispatch > 0) {
      hasRemainingToDispatch = true;
    }

    return {
      salesOrderLineId: line.id,
      productId: line.product_id,
      product: {
        sku: line.product_sku,
        name: line.product_name,
        isSerialTracked: Boolean(line.is_serial_tracked),
        unitOfMeasure: line.unit_of_measure,
      },
      quantityOrdered,
      quantityAllocated,
      quantityDispatched,
      remainingToDispatch,
      allocatedQuantityFromStock,
      allocatedItems: lineAllocatedItems.map((item) => ({
        stockItemId: item.id,
        serialNumber: item.serial_number,
        quantityAllocated: roundQuantity(item.quantity_allocated || item.quantity_on_hand || 0),
        stockLocationId: item.stock_location_id,
        actualLocationId: item.actual_location_id,
        stockLocationCode: item.stock_location_code,
        stockLocationName: item.stock_location_name,
        actualLocationCode: item.actual_location_code,
        actualLocationName: item.actual_location_name,
      })),
      allocatedSerialNumbers: lineAllocatedItems
        .filter((item) => item.serial_number)
        .map((item) => item.serial_number),
    };
  });

  const isReady =
    hasRemainingToDispatch &&
    mappedLines.every((line) => line.quantityAllocated >= line.quantityOrdered) &&
    mappedLines.every((line) => line.allocatedQuantityFromStock >= line.remainingToDispatch);

  if (!isReady) {
    return null;
  }

  return {
    salesOrderId: order.id,
    customerId: order.customer_id,
    orderNumber: order.order_number,
    customerName: order.customer_name,
    requestedAt: order.requested_at,
    dispatchDueAt: order.dispatch_due_at,
    notes: order.notes,
    status: order.status,
    summary: {
      lineCount: mappedLines.length,
      quantityAllocated: roundQuantity(totalAllocatedQuantity),
      serialCount: totalSerials,
    },
    allocatedSerialNumbers: mappedLines.flatMap((line) => line.allocatedSerialNumbers),
    lines: mappedLines,
  };
}

async function getDispatchReadyOrder(salesOrderId) {
  const order = await fetchDispatchOrderRow(salesOrderId);

  if (!order) {
    throw createError(404, "Sales order not found.");
  }

  const [lines, allocatedItems] = await Promise.all([
    fetchDispatchOrderLines(salesOrderId),
    fetchAllocatedStockItems(salesOrderId),
  ]);

  const payload = buildDispatchReadyPayload(order, lines, allocatedItems);
  if (!payload) {
    throw createError(400, "Only fully allocated sales orders can be dispatched.");
  }

  return payload;
}

async function dispatchSalesOrder({ salesOrderId, dispatchedBy, dispatchReference, serialNumbers = [] }) {
  return withTransaction(async () => {
    if (!Number.isFinite(Number(salesOrderId))) {
      throw createError(400, "Sales order id is required.");
    }

    const readyOrder = await getDispatchReadyOrder(salesOrderId);
    const cleanDispatchedBy = String(dispatchedBy || "").trim();
    const cleanDispatchReference = String(dispatchReference || "").trim();

    if (!cleanDispatchedBy) {
      throw createError(400, "Dispatched by is required.");
    }

    if (!cleanDispatchReference) {
      throw createError(400, "Dispatch reference is required.");
    }

    const expectedSerials = readyOrder.allocatedSerialNumbers.map(normalizeSerial);
    const providedSerials = Array.isArray(serialNumbers)
      ? serialNumbers.map(normalizeSerial).filter(Boolean)
      : [];
    const dispatchSerials = providedSerials.length ? providedSerials : expectedSerials;

    if (expectedSerials.length) {
      const uniqueDispatchSerials = Array.from(new Set(dispatchSerials));

      if (uniqueDispatchSerials.length !== expectedSerials.length) {
        throw createError(400, "All allocated serial numbers must be confirmed before dispatch.");
      }

      for (const serialNumber of uniqueDispatchSerials) {
        if (!expectedSerials.includes(serialNumber)) {
          throw createError(
            400,
            `Serial ${serialNumber} is not allocated to ${readyOrder.orderNumber}.`,
          );
        }
      }
    }

    const dispatchRecord = await run(
      `
        INSERT INTO dispatches (
          sales_order_id,
          dispatch_reference,
          dispatched_by
        ) VALUES (?, ?, ?)
      `,
      [readyOrder.salesOrderId, cleanDispatchReference, cleanDispatchedBy],
    );

    const dispatchRow = await get(
      `
        SELECT id, dispatched_at
        FROM dispatches
        WHERE id = ?
        LIMIT 1
      `,
      [dispatchRecord.id],
    );

    const dispatchedLineQuantities = new Map();

    for (const line of readyOrder.lines) {
      for (const item of line.allocatedItems) {
        if (item.serialNumber && dispatchSerials.length && !dispatchSerials.includes(normalizeSerial(item.serialNumber))) {
          continue;
        }

        const quantityToDispatch = roundQuantity(item.quantityAllocated);

        await run(
          `
            INSERT INTO dispatch_lines (
              dispatch_id,
              sales_order_line_id,
              product_id,
              stock_item_id,
              serial_number,
              quantity_dispatched
            ) VALUES (?, ?, ?, ?, ?, ?)
          `,
          [
            dispatchRecord.id,
            line.salesOrderLineId,
            line.productId,
            item.stockItemId,
            item.serialNumber || null,
            quantityToDispatch,
          ],
        );

        await run(
          `
            UPDATE stock_items
            SET quantity_on_hand = 0,
                quantity_allocated = 0,
                hold_status = 'dispatched',
                hold_reason = ?,
                actual_location_id = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `,
          [`Dispatched on ${cleanDispatchReference}`, item.stockItemId],
        );

        await run(
          `
            INSERT INTO stock_movements (
              movement_type,
              stock_item_id,
              product_id,
              source_location_id,
              destination_location_id,
              actual_source_location_id,
              actual_destination_location_id,
              quantity,
              linked_sales_order_id,
              customer_id,
              reference_type,
              reference_id,
              notes
            ) VALUES (
              'dispatch',
              ?,
              ?,
              ?,
              NULL,
              ?,
              NULL,
              ?,
              ?,
              ?,
              'dispatch',
              ?,
              ?
            )
          `,
          [
            item.stockItemId,
            line.productId,
            item.stockLocationId,
            item.actualLocationId,
            quantityToDispatch,
            readyOrder.salesOrderId,
            readyOrder.customerId,
            dispatchRecord.id,
            `${readyOrder.orderNumber} dispatched on ${cleanDispatchReference} by ${cleanDispatchedBy}`,
          ],
        );

        await run(
          `
            INSERT INTO activity_log (
              stock_item_id,
              serial_number,
              activity_type,
              summary,
              reference_type,
              reference_id,
              payload_json
            ) VALUES (?, ?, 'dispatched', ?, 'dispatch', ?, ?)
          `,
          [
            item.stockItemId,
            item.serialNumber || "",
            `${readyOrder.orderNumber} dispatched on ${cleanDispatchReference} by ${cleanDispatchedBy}`,
            dispatchRecord.id,
            JSON.stringify({
              dispatchReference: cleanDispatchReference,
              dispatchedBy: cleanDispatchedBy,
              salesOrderId: readyOrder.salesOrderId,
              salesOrderLineId: line.salesOrderLineId,
              quantityDispatched: quantityToDispatch,
            }),
          ],
        );

        const currentDispatched = Number(dispatchedLineQuantities.get(line.salesOrderLineId) || 0);
        dispatchedLineQuantities.set(
          line.salesOrderLineId,
          roundQuantity(currentDispatched + quantityToDispatch),
        );
      }
    }

    for (const [salesOrderLineId, quantityDispatched] of dispatchedLineQuantities.entries()) {
      await run(
        `
          UPDATE sales_order_lines
          SET quantity_dispatched = quantity_dispatched + ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [quantityDispatched, salesOrderLineId],
      );
    }

    await run(
      `
        UPDATE sales_orders
        SET status = 'dispatched',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [readyOrder.salesOrderId],
    );

    return {
      success: true,
      dispatchId: dispatchRecord.id,
      dispatchedAt: dispatchRow?.dispatched_at || null,
      orderNumber: readyOrder.orderNumber,
      salesOrderId: readyOrder.salesOrderId,
      dispatchReference: cleanDispatchReference,
      dispatchedBy: cleanDispatchedBy,
      summary: {
        lineCount: readyOrder.summary.lineCount,
        serialCount: readyOrder.summary.serialCount,
        quantityAllocated: readyOrder.summary.quantityAllocated,
      },
    };
  });
}

router.get("/ready", async (_req, res, next) => {
  try {
    const orderRows = await fetchDispatchOrderRows();
    const items = [];

    for (const order of orderRows) {
      const [lines, allocatedItems] = await Promise.all([
        fetchDispatchOrderLines(order.id),
        fetchAllocatedStockItems(order.id),
      ]);

      const payload = buildDispatchReadyPayload(order, lines, allocatedItems);
      if (payload) {
        items.push(payload);
      }
    }

    res.json({
      items,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const payload = await dispatchSalesOrder({
      salesOrderId: Number(req.body?.salesOrderId),
      dispatchedBy: req.body?.dispatchedBy,
      dispatchReference: req.body?.dispatchReference,
      serialNumbers: req.body?.serialNumbers,
    });

    res.json(payload);
  } catch (error) {
    next(error);
  }
});

module.exports = {
  dispatchSalesOrder,
  getDispatchReadyOrder,
  router,
};
