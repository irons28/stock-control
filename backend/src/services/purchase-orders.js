const { all, exec, get, run } = require("../db/connection");

function createRequestError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function roundQuantity(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function normaliseStatus({ totalOrdered, totalReceived, expectedAt }) {
  const ordered = roundQuantity(totalOrdered);
  const received = roundQuantity(totalReceived);

  if (ordered <= 0) {
    return "open";
  }

  if (received >= ordered) {
    return "fully_received";
  }

  if (received > 0) {
    return "part_received";
  }

  if (expectedAt) {
    const dueDate = new Date(`${expectedAt}T23:59:59`);
    if (!Number.isNaN(dueDate.getTime()) && dueDate.getTime() < Date.now()) {
      return "overdue";
    }
  }

  return "open";
}

function buildPurchaseOrderSummary(orderRow) {
  const totalOrdered = roundQuantity(orderRow.total_ordered);
  const totalReceived = roundQuantity(orderRow.total_received);

  return {
    ...orderRow,
    total_ordered: totalOrdered,
    total_received: totalReceived,
    total_remaining: roundQuantity(Math.max(0, totalOrdered - totalReceived)),
    status: normaliseStatus({
      totalOrdered,
      totalReceived,
      expectedAt: orderRow.expected_at,
    }),
  };
}

async function getPurchaseOrders() {
  const orders = await all(
    `SELECT
      po.*,
      s.name AS supplier_name,
      COALESCE(SUM(pol.quantity_ordered), 0) AS total_ordered,
      COALESCE(SUM(pol.quantity_received), 0) AS total_received,
      COUNT(pol.id) AS line_count
    FROM purchase_orders po
    JOIN suppliers s ON s.id = po.supplier_id
    LEFT JOIN purchase_order_lines pol ON pol.purchase_order_id = po.id
    GROUP BY po.id
    ORDER BY
      CASE
        WHEN po.expected_at IS NULL OR po.expected_at = '' THEN 1
        ELSE 0
      END,
      po.expected_at ASC,
      po.created_at DESC`
  );

  return orders.map(buildPurchaseOrderSummary);
}

async function getPurchaseOrderByNumber(poNumber) {
  const order = await get(
    `SELECT
      po.*,
      s.name AS supplier_name,
      COALESCE(SUM(pol.quantity_ordered), 0) AS total_ordered,
      COALESCE(SUM(pol.quantity_received), 0) AS total_received,
      COUNT(pol.id) AS line_count
    FROM purchase_orders po
    JOIN suppliers s ON s.id = po.supplier_id
    LEFT JOIN purchase_order_lines pol ON pol.purchase_order_id = po.id
    WHERE po.order_number = ?
    GROUP BY po.id`,
    [poNumber]
  );

  if (!order) {
    throw createRequestError(`Purchase order ${poNumber} was not found.`, 404);
  }

  const lines = await all(
    `SELECT
      pol.*,
      p.sku,
      p.name AS product_name,
      p.tracking_mode,
      p.is_serial_tracked
    FROM purchase_order_lines pol
    JOIN products p ON p.id = pol.product_id
    WHERE pol.purchase_order_id = ?
    ORDER BY pol.id ASC`,
    [order.id]
  );

  const receipts = await all(
    `SELECT
      gr.id,
      gr.receipt_number,
      gr.delivery_number,
      gr.received_at,
      gr.received_by,
      COALESCE(SUM(grl.quantity_received), 0) AS total_received
    FROM goods_receipts gr
    LEFT JOIN goods_receipt_lines grl ON grl.goods_receipt_id = gr.id
    WHERE gr.purchase_order_id = ?
    GROUP BY gr.id
    ORDER BY gr.received_at DESC, gr.id DESC`,
    [order.id]
  );

  return {
    order: buildPurchaseOrderSummary(order),
    lines: lines.map((line) => {
      const ordered = roundQuantity(line.quantity_ordered);
      const received = roundQuantity(line.quantity_received);

      return {
        ...line,
        quantity_ordered: ordered,
        quantity_received: received,
        quantity_remaining: roundQuantity(Math.max(0, ordered - received)),
        is_serial_tracked: Boolean(line.is_serial_tracked),
      };
    }),
    receipts: receipts.map((receipt) => ({
      ...receipt,
      total_received: roundQuantity(receipt.total_received),
    })),
  };
}

async function updatePurchaseOrderStatus(purchaseOrderId) {
  const totals = await get(
    `SELECT
      COALESCE(SUM(quantity_ordered), 0) AS total_ordered,
      COALESCE(SUM(quantity_received), 0) AS total_received
    FROM purchase_order_lines
    WHERE purchase_order_id = ?`,
    [purchaseOrderId]
  );

  const order = await get(`SELECT expected_at FROM purchase_orders WHERE id = ?`, [purchaseOrderId]);
  const status = normaliseStatus({
    totalOrdered: totals?.total_ordered,
    totalReceived: totals?.total_received,
    expectedAt: order?.expected_at,
  });

  await run(`UPDATE purchase_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [
    status,
    purchaseOrderId,
  ]);

  return status;
}

async function logActivity(entityType, entityRef, action, details, userContext = {}) {
  const userId = userContext.userId || null;
  const userRole = userContext.userRole || "system";
  const userName = userContext.userName || "System";

  await run(
    `INSERT INTO activity_log (user_id, user_role, user_name, action_type, entity_type, entity_ref, summary, details_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      userRole,
      userName,
      action,
      entityType,
      String(entityRef),
      details ? `${action} on ${entityType} ${entityRef}` : "",
      details ? JSON.stringify(details) : "",
    ]
  );
}

async function receivePurchaseOrder(poNumber, payload, userContext = {}) {
  const deliveryNumber = String(payload?.deliveryNumber || "").trim();
  const receivedBy = String(payload?.receivedBy || "").trim();
  const lines = Array.isArray(payload?.lines) ? payload.lines : [];

  if (!deliveryNumber) {
    throw createRequestError("Delivery number is required.");
  }

  if (!receivedBy) {
    throw createRequestError("Received by is required.");
  }

  if (!lines.length) {
    throw createRequestError("At least one purchase order line is required.");
  }

  const orderDetails = await getPurchaseOrderByNumber(poNumber);
  const holdLocation = await get(
    `SELECT id, code, name
    FROM stock_locations
    WHERE code = 'HOLD'
    LIMIT 1`
  );

  if (!holdLocation) {
    throw createRequestError("Hold location is not configured.", 500);
  }

  const lineMap = new Map(orderDetails.lines.map((line) => [Number(line.id), line]));
  const payloadSerials = new Set();
  const normalisedLines = [];

  for (const rawLine of lines) {
    const purchaseOrderLineId = Number(rawLine?.purchaseOrderLineId);
    const quantityReceived = Number(rawLine?.quantityReceived);
    const orderLine = lineMap.get(purchaseOrderLineId);

    if (!orderLine) {
      throw createRequestError(`Purchase order line ${rawLine?.purchaseOrderLineId} is invalid.`);
    }

    if (!Number.isFinite(quantityReceived) || quantityReceived <= 0) {
      throw createRequestError(`Line ${orderLine.sku} must have a quantity received greater than zero.`);
    }

    if (quantityReceived > Number(orderLine.quantity_remaining)) {
      throw createRequestError(
        `Line ${orderLine.sku} cannot receive ${quantityReceived}. Only ${orderLine.quantity_remaining} remaining.`
      );
    }

    const serialNumbers = Array.isArray(rawLine?.serialNumbers)
      ? rawLine.serialNumbers.map((value) => String(value || "").trim()).filter(Boolean)
      : [];

    if (orderLine.is_serial_tracked) {
      if (!Number.isInteger(quantityReceived)) {
        throw createRequestError(`Line ${orderLine.sku} must be received in whole units.`);
      }

      if (serialNumbers.length !== quantityReceived) {
        throw createRequestError(
          `Line ${orderLine.sku} requires ${quantityReceived} serial number${quantityReceived === 1 ? "" : "s"}.`
        );
      }

      const seenSerials = new Set();
      for (const serialNumber of serialNumbers) {
        if (seenSerials.has(serialNumber) || payloadSerials.has(serialNumber)) {
          throw createRequestError(`Serial number ${serialNumber} is duplicated in this receipt.`);
        }
        seenSerials.add(serialNumber);
        payloadSerials.add(serialNumber);
      }
    } else if (serialNumbers.length) {
      throw createRequestError(`Line ${orderLine.sku} does not use serial numbers.`);
    }

    normalisedLines.push({
      orderLine,
      purchaseOrderLineId,
      quantityReceived,
      serialNumbers,
    });
  }

  if (payloadSerials.size) {
    const existingSerialRows = await all(
      `SELECT serial_number
      FROM stock_items
      WHERE serial_number IN (${Array.from(payloadSerials)
        .map(() => "?")
        .join(", ")})`,
      Array.from(payloadSerials)
    );

    if (existingSerialRows.length) {
      throw createRequestError(
        `Serial number ${existingSerialRows[0].serial_number} already exists in stock.`
      );
    }
  }

  const receiptNumber = `GR-${orderDetails.order.order_number}-${Date.now()}`;
  const previousByLineId = new Map(
    orderDetails.lines.map((line) => [Number(line.id), Number(line.quantity_received)])
  );

  await exec("BEGIN");

  try {
    const receiptResult = await run(
      `INSERT INTO goods_receipts (
        purchase_order_id,
        receipt_number,
        delivery_number,
        received_by
      ) VALUES (?, ?, ?, ?)`,
      [orderDetails.order.id, receiptNumber, deliveryNumber, receivedBy]
    );

    const lineSummaries = [];

    for (const line of normalisedLines) {
      await run(
        `INSERT INTO goods_receipt_lines (
          goods_receipt_id,
          purchase_order_line_id,
          product_id,
          holding_location_id,
          quantity_received,
          serial_numbers_json
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          receiptResult.id,
          line.purchaseOrderLineId,
          line.orderLine.product_id,
          holdLocation.id,
          line.quantityReceived,
          JSON.stringify(line.serialNumbers),
        ]
      );

      await run(
        `UPDATE purchase_order_lines
        SET quantity_received = quantity_received + ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [line.quantityReceived, line.purchaseOrderLineId]
      );

      if (line.orderLine.is_serial_tracked) {
        for (const serialNumber of line.serialNumbers) {
          const stockItemResult = await run(
            `INSERT INTO stock_items (
              product_id,
              stock_location_id,
              actual_location_id,
              serial_number,
              quantity_on_hand,
              quantity_allocated,
              hold_status,
              linked_purchase_order_id,
              linked_purchase_order_line_id
            ) VALUES (?, ?, ?, ?, 1, 0, 'available', ?, ?)`,
            [
              line.orderLine.product_id,
              holdLocation.id,
              holdLocation.id,
              serialNumber,
              orderDetails.order.id,
              line.purchaseOrderLineId,
            ]
          );

          await run(
            `INSERT INTO stock_movements (
              movement_type,
              stock_item_id,
              product_id,
              destination_location_id,
              actual_destination_location_id,
              quantity,
              linked_purchase_order_id,
              reference_type,
              reference_id,
              notes
            ) VALUES ('goods_receipt', ?, ?, ?, ?, 1, ?, 'goods_receipt', ?, ?)`,
            [
              stockItemResult.id,
              line.orderLine.product_id,
              holdLocation.id,
              holdLocation.id,
              orderDetails.order.id,
              receiptResult.id,
              `Delivery ${deliveryNumber}`,
            ]
          );
        }
      } else {
        const stockItemResult = await run(
          `INSERT INTO stock_items (
            product_id,
            stock_location_id,
            actual_location_id,
            quantity_on_hand,
            quantity_allocated,
            hold_status,
            linked_purchase_order_id,
            linked_purchase_order_line_id
          ) VALUES (?, ?, ?, ?, 0, 'available', ?, ?)`,
          [
            line.orderLine.product_id,
            holdLocation.id,
            holdLocation.id,
            line.quantityReceived,
            orderDetails.order.id,
            line.purchaseOrderLineId,
          ]
        );

        await run(
          `INSERT INTO stock_movements (
            movement_type,
            stock_item_id,
            product_id,
            destination_location_id,
            actual_destination_location_id,
            quantity,
            linked_purchase_order_id,
            reference_type,
            reference_id,
            notes
          ) VALUES ('goods_receipt', ?, ?, ?, ?, ?, ?, 'goods_receipt', ?, ?)`,
          [
            stockItemResult.id,
            line.orderLine.product_id,
            holdLocation.id,
            holdLocation.id,
            line.quantityReceived,
            orderDetails.order.id,
            receiptResult.id,
            `Delivery ${deliveryNumber}`,
          ]
        );
      }

      const previouslyReceived = roundQuantity(previousByLineId.get(line.purchaseOrderLineId));
      const remainingAfterReceipt = roundQuantity(
        Number(line.orderLine.quantity_ordered) - previouslyReceived - line.quantityReceived
      );

      lineSummaries.push({
        purchase_order_line_id: line.purchaseOrderLineId,
        sku: line.orderLine.sku,
        product_name: line.orderLine.product_name,
        quantity_ordered: roundQuantity(line.orderLine.quantity_ordered),
        previously_received: previouslyReceived,
        quantity_received_now: roundQuantity(line.quantityReceived),
        quantity_remaining_after_receipt: roundQuantity(Math.max(0, remainingAfterReceipt)),
        serial_numbers: line.serialNumbers,
      });
    }

    const status = await updatePurchaseOrderStatus(orderDetails.order.id);

    await logActivity("goods_receipt", receiptResult.id, "created", {
      receiptNumber,
      deliveryNumber,
      purchaseOrder: orderDetails.order.order_number,
      receivedBy,
      lineCount: lineSummaries.length,
    }, userContext);

    await logActivity("purchase_order", orderDetails.order.order_number, "received_goods", {
      receiptNumber,
      deliveryNumber,
      receivedBy,
      status,
      lines: lineSummaries,
    }, userContext);

    await exec("COMMIT");

    return {
      receiptNumber,
      deliveryNumber,
      receivedBy,
      purchaseOrderNumber: orderDetails.order.order_number,
      status,
      holdingLocation: holdLocation.code,
      lines: lineSummaries,
    };
  } catch (error) {
    await exec("ROLLBACK");
    throw error;
  }
}

module.exports = {
  getPurchaseOrderByNumber,
  getPurchaseOrders,
  receivePurchaseOrder,
};
