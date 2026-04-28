const express = require("express");
const { all, get, run } = require("../db/connection");

const router = express.Router();

function roundQuantity(value) {
  return Number(Number(value || 0).toFixed(2));
}

function getRemainingQuantity(line) {
  return roundQuantity(Number(line.quantity_ordered || 0) - Number(line.quantity_allocated || 0));
}

function deriveLineAllocationStatus(line) {
  const ordered = Number(line.quantity_ordered || 0);
  const allocated = Number(line.quantity_allocated || 0);
  const dispatched = Number(line.quantity_dispatched || 0);

  if (ordered > 0 && dispatched >= ordered) {
    return "Dispatched";
  }

  if (ordered <= 0 || allocated <= 0) {
    return "Awaiting Stock";
  }

  if (allocated >= ordered) {
    return "Fully Allocated";
  }

  return "Part Allocated";
}

function deriveOrderAllocationStatus(lines) {
  if (!lines.length) {
    return "Awaiting Stock";
  }

  const fullyDispatched = lines.every(
    (line) => Number(line.quantity_dispatched || 0) >= Number(line.quantity_ordered || 0),
  );
  const hasRemaining = lines.some((line) => getRemainingQuantity(line) > 0);
  const hasAllocated = lines.some((line) => Number(line.quantity_allocated || 0) > 0);

  if (fullyDispatched) {
    return "Dispatched";
  }

  if (!hasRemaining) {
    return "Ready to Dispatch";
  }

  if (hasAllocated) {
    return "Part Allocated";
  }

  return "Awaiting Stock";
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
      // Ignore rollback failure so the original error surfaces to the client.
    }

    throw error;
  }
}

async function fetchSalesOrderRow(orderNumber) {
  return get(
    `
      SELECT
        so.id,
        so.order_number,
        so.customer_id,
        so.linked_purchase_order_id,
        so.status,
        so.requested_at,
        so.dispatch_due_at,
        so.notes,
        so.created_at,
        so.updated_at,
        c.code AS customer_code,
        c.name AS customer_name
      FROM sales_orders so
      JOIN customers c ON c.id = so.customer_id
      WHERE so.order_number = ?
      LIMIT 1
    `,
    [orderNumber],
  );
}

async function fetchSalesOrderLines(salesOrderId) {
  return all(
    `
      SELECT
        sol.id,
        sol.sales_order_id,
        sol.product_id,
        sol.linked_purchase_order_line_id,
        sol.quantity_ordered,
        sol.quantity_allocated,
        sol.quantity_dispatched,
        sol.created_at,
        sol.updated_at,
        p.sku AS product_sku,
        p.name AS product_name,
        p.tracking_mode,
        p.is_serial_tracked,
        p.unit_of_measure,
        pol.purchase_order_id,
        po.order_number AS purchase_order_number
      FROM sales_order_lines sol
      JOIN products p ON p.id = sol.product_id
      LEFT JOIN purchase_order_lines pol ON pol.id = sol.linked_purchase_order_line_id
      LEFT JOIN purchase_orders po ON po.id = pol.purchase_order_id
      WHERE sol.sales_order_id = ?
      ORDER BY p.name ASC, sol.id ASC
    `,
    [salesOrderId],
  );
}

function mapSalesOrderLine(line) {
  const remainingQuantity = getRemainingQuantity(line);

  return {
    id: line.id,
    salesOrderId: line.sales_order_id,
    productId: line.product_id,
    linkedPurchaseOrderLineId: line.linked_purchase_order_line_id,
    product: {
      sku: line.product_sku,
      name: line.product_name,
      trackingMode: line.tracking_mode,
      isSerialTracked: Boolean(line.is_serial_tracked),
      unitOfMeasure: line.unit_of_measure,
    },
    purchaseOrderNumber: line.purchase_order_number,
    quantityOrdered: Number(line.quantity_ordered),
    quantityAllocated: Number(line.quantity_allocated),
    quantityDispatched: Number(line.quantity_dispatched),
    remainingQuantity,
    allocationStatus: deriveLineAllocationStatus(line),
  };
}

function summarizeOrder(lines) {
  const totals = lines.reduce(
    (summary, line) => {
      summary.quantityOrdered += Number(line.quantity_ordered || 0);
      summary.quantityAllocated += Number(line.quantity_allocated || 0);
      summary.quantityRemaining += getRemainingQuantity(line);
      return summary;
    },
    {
      quantityOrdered: 0,
      quantityAllocated: 0,
      quantityRemaining: 0,
    },
  );

  return {
    lineCount: lines.length,
    quantityOrdered: roundQuantity(totals.quantityOrdered),
    quantityAllocated: roundQuantity(totals.quantityAllocated),
    quantityRemaining: roundQuantity(totals.quantityRemaining),
    allocationStatus: deriveOrderAllocationStatus(lines),
  };
}

async function fetchAvailableStockByProduct(productId) {
  const product = await get(
    `
      SELECT id, sku, name, tracking_mode, is_serial_tracked, unit_of_measure
      FROM products
      WHERE id = ?
      LIMIT 1
    `,
    [productId],
  );

  if (!product) {
    throw createError(404, "Product not found.");
  }

  const items = await all(
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
        si.linked_purchase_order_id,
        si.linked_purchase_order_line_id,
        po.order_number AS purchase_order_number,
        stock_location.code AS stock_location_code,
        stock_location.name AS stock_location_name,
        actual_location.code AS actual_location_code,
        actual_location.name AS actual_location_name
      FROM stock_items si
      LEFT JOIN purchase_orders po ON po.id = si.linked_purchase_order_id
      LEFT JOIN stock_locations stock_location ON stock_location.id = si.stock_location_id
      LEFT JOIN stock_locations actual_location ON actual_location.id = si.actual_location_id
      WHERE si.product_id = ?
        AND si.hold_status = 'available'
        AND (si.quantity_on_hand - si.quantity_allocated) > 0
      ORDER BY COALESCE(actual_location.code, stock_location.code, ''), si.serial_number ASC, si.id ASC
    `,
    [productId],
  );

  const mappedItems = items.map((item) => ({
    stockItemId: item.id,
    serialNumber: item.serial_number,
    availableQuantity: roundQuantity(Number(item.quantity_on_hand || 0) - Number(item.quantity_allocated || 0)),
    holdStatus: item.hold_status,
    purchaseOrderNumber: item.purchase_order_number,
    stockLocationCode: item.stock_location_code,
    stockLocationName: item.stock_location_name,
    actualLocationCode: item.actual_location_code,
    actualLocationName: item.actual_location_name,
  }));

  return {
    product: {
      id: product.id,
      sku: product.sku,
      name: product.name,
      trackingMode: product.tracking_mode,
      isSerialTracked: Boolean(product.is_serial_tracked),
      unitOfMeasure: product.unit_of_measure,
    },
    totalAvailableQuantity: roundQuantity(
      mappedItems.reduce((total, item) => total + Number(item.availableQuantity || 0), 0),
    ),
    items: mappedItems,
  };
}

async function writeActivityLog({
  stockItemId,
  serialNumber = "",
  activityType,
  summary,
  referenceId,
  payload,
}) {
  await run(
    `
      INSERT INTO activity_log (
        stock_item_id, serial_number, activity_type, summary, reference_type, reference_id, payload_json
      ) VALUES (?, ?, ?, ?, 'sales_order_allocation', ?, ?)
    `,
    [
      stockItemId || null,
      serialNumber || "",
      activityType,
      summary,
      referenceId,
      JSON.stringify(payload),
    ],
  );
}

async function refreshSalesOrderStatus(salesOrderId) {
  const lines = await fetchSalesOrderLines(salesOrderId);
  const nextStatus = deriveOrderAllocationStatus(lines)
    .toLowerCase()
    .replace(/\s+/g, "_");

  await run(
    `
      UPDATE sales_orders
      SET status = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [nextStatus, salesOrderId],
  );
}

async function getSalesOrderPayload(orderNumber) {
  const order = await fetchSalesOrderRow(orderNumber);

  if (!order) {
    throw createError(404, "Sales order not found.");
  }

  const lines = await fetchSalesOrderLines(order.id);
  const summary = summarizeOrder(lines);

  return {
    order: {
      id: order.id,
      orderNumber: order.order_number,
      customerId: order.customer_id,
      customerCode: order.customer_code,
      customerName: order.customer_name,
      linkedPurchaseOrderId: order.linked_purchase_order_id,
      requestedAt: order.requested_at,
      dispatchDueAt: order.dispatch_due_at,
      notes: order.notes,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      allocationStatus: summary.allocationStatus,
      status: order.status,
      summary,
    },
    lines: lines.map(mapSalesOrderLine),
  };
}

async function allocateSalesOrder(orderNumber, allocationsInput) {
  return withTransaction(async () => {
    const order = await fetchSalesOrderRow(orderNumber);

    if (!order) {
      throw createError(404, "Sales order not found.");
    }

    const allocations = Array.isArray(allocationsInput) ? allocationsInput : [];
    if (!allocations.length) {
      throw createError(400, "Provide at least one allocation to confirm.");
    }

    const lines = await fetchSalesOrderLines(order.id);
    const lineMap = new Map(lines.map((line) => [line.id, line]));
    const selectedSerialIds = new Set();
    const bulkUsageByStockItem = new Map();
    const processedLineIds = new Set();
    const allocationResults = [];

    for (const allocation of allocations) {
      const line = lineMap.get(Number(allocation.salesOrderLineId));

      if (!line) {
        throw createError(400, "Allocation contains an unknown sales order line.");
      }

      if (processedLineIds.has(line.id)) {
        throw createError(400, `Line ${line.product_name} appears more than once in the allocation payload.`);
      }

      processedLineIds.add(line.id);

      const remainingQuantity = getRemainingQuantity(line);
      if (remainingQuantity <= 0) {
        throw createError(400, `Line ${line.product_name} is already fully allocated.`);
      }

      if (Boolean(line.is_serial_tracked)) {
        const stockItemIds = Array.isArray(allocation.serialStockItemIds)
          ? allocation.serialStockItemIds.map(Number).filter(Number.isFinite)
          : [];

        if (!stockItemIds.length) {
          throw createError(400, `Select at least one serial number for ${line.product_name}.`);
        }

        if (stockItemIds.length > remainingQuantity) {
          throw createError(400, `Selected too many serial numbers for ${line.product_name}.`);
        }

        for (const stockItemId of stockItemIds) {
          if (selectedSerialIds.has(stockItemId)) {
            throw createError(400, "Duplicate serial selection is not allowed.");
          }

          selectedSerialIds.add(stockItemId);

          const stockItem = await get(
            `
              SELECT si.*
              FROM stock_items si
              WHERE si.id = ?
              LIMIT 1
            `,
            [stockItemId],
          );

          if (!stockItem || stockItem.product_id !== line.product_id) {
            throw createError(400, `Serial selection does not belong to ${line.product_name}.`);
          }

          if (stockItem.hold_status !== "available" || Number(stockItem.quantity_on_hand) <= 0) {
            throw createError(
              400,
              `Serial ${stockItem.serial_number || stockItem.id} is no longer available.`,
            );
          }

          await run(
            `
              UPDATE stock_items
              SET quantity_allocated = 1,
                  hold_status = 'allocated',
                  linked_sales_order_id = ?,
                  linked_sales_order_line_id = ?,
                  customer_id = ?,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `,
            [order.id, line.id, order.customer_id, stockItemId],
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
                'allocation',
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                1,
                ?,
                ?,
                'sales_order_line',
                ?,
                ?
              )
            `,
            [
              stockItemId,
              line.product_id,
              stockItem.stock_location_id,
              stockItem.stock_location_id,
              stockItem.actual_location_id,
              stockItem.actual_location_id,
              order.id,
              order.customer_id,
              line.id,
              `Allocated serial ${stockItem.serial_number} to ${order.order_number}`,
            ],
          );

          await writeActivityLog({
            stockItemId,
            serialNumber: stockItem.serial_number,
            activityType: "serial_allocated",
            summary: `Allocated serial ${stockItem.serial_number} to ${order.order_number}`,
            referenceId: line.id,
            payload: {
              salesOrderNumber: order.order_number,
              salesOrderLineId: line.id,
              customerName: order.customer_name,
            },
          });

          allocationResults.push({
            salesOrderLineId: line.id,
            productName: line.product_name,
            mode: "serial",
            serialNumber: stockItem.serial_number,
            stockItemId,
          });
        }

        await run(
          `
            UPDATE sales_order_lines
            SET quantity_allocated = quantity_allocated + ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `,
          [stockItemIds.length, line.id],
        );

        continue;
      }

      const quantityAllocations = Array.isArray(allocation.quantityAllocations)
        ? allocation.quantityAllocations
            .map((entry) => ({
              stockItemId: Number(entry.stockItemId),
              quantity: roundQuantity(entry.quantity),
            }))
            .filter((entry) => Number.isFinite(entry.stockItemId) && entry.quantity > 0)
        : [];

      if (!quantityAllocations.length) {
        throw createError(400, `Enter a quantity allocation for ${line.product_name}.`);
      }

      const requestedQuantity = roundQuantity(
        quantityAllocations.reduce((total, entry) => total + entry.quantity, 0),
      );

      if (requestedQuantity > remainingQuantity) {
        throw createError(
          400,
          `Requested allocation exceeds the remaining quantity for ${line.product_name}.`,
        );
      }

      for (const entry of quantityAllocations) {
        const stockItem = await get(
          `
            SELECT *
            FROM stock_items
            WHERE id = ?
            LIMIT 1
          `,
          [entry.stockItemId],
        );

        if (!stockItem || stockItem.product_id !== line.product_id) {
          throw createError(400, `Selected stock does not belong to ${line.product_name}.`);
        }

        if (stockItem.hold_status !== "available") {
          throw createError(400, `Selected stock for ${line.product_name} is not available.`);
        }

        const alreadyRequested = Number(bulkUsageByStockItem.get(entry.stockItemId) || 0);
        const availableQuantity =
          Number(stockItem.quantity_on_hand || 0) - Number(stockItem.quantity_allocated || 0);

        if (entry.quantity + alreadyRequested > availableQuantity) {
          throw createError(400, `Insufficient stock for ${line.product_name}.`);
        }

        bulkUsageByStockItem.set(entry.stockItemId, roundQuantity(alreadyRequested + entry.quantity));
      }

      for (const entry of quantityAllocations) {
        const sourceStockItem = await get(
          `
            SELECT *
            FROM stock_items
            WHERE id = ?
            LIMIT 1
          `,
          [entry.stockItemId],
        );

        await run(
          `
            UPDATE stock_items
            SET quantity_on_hand = quantity_on_hand - ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `,
          [entry.quantity, entry.stockItemId],
        );

        const allocationRecord = await run(
          `
            INSERT INTO stock_items (
              product_id,
              stock_location_id,
              actual_location_id,
              quantity_on_hand,
              quantity_allocated,
              hold_status,
              hold_reason,
              linked_purchase_order_id,
              linked_purchase_order_line_id,
              linked_sales_order_id,
              linked_sales_order_line_id,
              customer_id,
              status
            ) VALUES (?, ?, ?, ?, ?, 'allocated', 'sales-order-allocation', ?, ?, ?, ?, ?, ?)
          `,
          [
            sourceStockItem.product_id,
            sourceStockItem.stock_location_id,
            sourceStockItem.actual_location_id,
            entry.quantity,
            entry.quantity,
            sourceStockItem.linked_purchase_order_id,
            sourceStockItem.linked_purchase_order_line_id,
            order.id,
            line.id,
            order.customer_id,
            sourceStockItem.status,
          ],
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
              'allocation',
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              'sales_order_line',
              ?,
              ?
            )
          `,
          [
            allocationRecord.id,
            line.product_id,
            sourceStockItem.stock_location_id,
            sourceStockItem.stock_location_id,
            sourceStockItem.actual_location_id,
            sourceStockItem.actual_location_id,
            entry.quantity,
            order.id,
            order.customer_id,
            line.id,
            `Allocated ${entry.quantity} ${line.unit_of_measure} of ${line.product_name} to ${order.order_number}`,
          ],
        );

        await writeActivityLog({
          stockItemId: allocationRecord.id,
          activityType: "quantity_allocated",
          summary: `Allocated ${entry.quantity} ${line.unit_of_measure} of ${line.product_name} to ${order.order_number}`,
          referenceId: line.id,
          payload: {
            salesOrderNumber: order.order_number,
            salesOrderLineId: line.id,
            sourceStockItemId: entry.stockItemId,
            allocatedQuantity: entry.quantity,
          },
        });

        allocationResults.push({
          salesOrderLineId: line.id,
          productName: line.product_name,
          mode: "quantity",
          stockItemId: allocationRecord.id,
          sourceStockItemId: entry.stockItemId,
          quantity: entry.quantity,
        });
      }

      await run(
        `
          UPDATE sales_order_lines
          SET quantity_allocated = quantity_allocated + ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [requestedQuantity, line.id],
      );
    }

    await refreshSalesOrderStatus(order.id);
    const nextPayload = await getSalesOrderPayload(order.order_number);

    return {
      success: true,
      message: `Allocation saved for ${order.order_number}.`,
      allocations: allocationResults,
      ...nextPayload,
    };
  });
}

router.get("/", async (req, res, next) => {
  const search = String(req.query.search || "").trim().toLowerCase();

  try {
    const orders = await all(
      `
        SELECT
          so.id,
          so.order_number,
          so.status,
          so.requested_at,
          so.dispatch_due_at,
          so.created_at,
          so.updated_at,
          c.name AS customer_name
        FROM sales_orders so
        JOIN customers c ON c.id = so.customer_id
        ORDER BY datetime(so.dispatch_due_at) ASC, so.order_number ASC
      `,
    );

    const items = [];

    for (const order of orders) {
      if (
        search &&
        !order.order_number.toLowerCase().includes(search) &&
        !order.customer_name.toLowerCase().includes(search)
      ) {
        continue;
      }

      const lines = await fetchSalesOrderLines(order.id);
      const summary = summarizeOrder(lines);

      items.push({
        id: order.id,
        orderNumber: order.order_number,
        customerName: order.customer_name,
        status: order.status,
        requestedAt: order.requested_at,
        dispatchDueAt: order.dispatch_due_at,
        createdAt: order.created_at,
        updatedAt: order.updated_at,
        summary,
      });
    }

    res.json({
      search,
      items,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:soNumber", async (req, res, next) => {
  try {
    const payload = await getSalesOrderPayload(req.params.soNumber);
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.post("/:soNumber/allocate", async (req, res, next) => {
  try {
    const payload = await allocateSalesOrder(
      req.params.soNumber,
      Array.isArray(req.body?.allocations) ? req.body.allocations : [],
    );

    res.json(payload);
  } catch (error) {
    next(error);
  }
});

module.exports = {
  allocateSalesOrder,
  fetchAvailableStockByProduct,
  getSalesOrderPayload,
  router,
};
