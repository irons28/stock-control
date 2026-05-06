const { all, get, run } = require("../db/connection");
const jira = require("./jira");

function createRequestError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function roundQuantity(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeDateValue(value, fieldName) {
  const normalized = normalizeString(value);

  if (!normalized) {
    return "";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw createRequestError(`${fieldName} must be in YYYY-MM-DD format.`);
  }

  return normalized;
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
      // Surface the original error instead of a rollback failure.
    }

    throw error;
  }
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

async function getNextPurchaseOrderNumber() {
  const row = await get(
    `
      SELECT MAX(CAST(SUBSTR(order_number, 4) AS INTEGER)) AS max_number
      FROM purchase_orders
      WHERE order_number GLOB 'PO-[0-9]*'
    `
  );

  const nextNumber = Math.max(1001, Number(row?.max_number || 1000) + 1);
  return `PO-${nextNumber}`;
}

async function validateLinkedSalesOrders(linkedSalesOrders) {
  if (!linkedSalesOrders.length) {
    return [];
  }

  const rows = await all(
    `
      SELECT id, order_number, linked_purchase_order_id
      FROM sales_orders
      WHERE id IN (${linkedSalesOrders.map(() => "?").join(", ")})
      ORDER BY order_number ASC
    `,
    linkedSalesOrders
  );

  if (rows.length !== linkedSalesOrders.length) {
    const foundIds = new Set(rows.map((row) => Number(row.id)));
    const missingIds = linkedSalesOrders.filter((id) => !foundIds.has(id));
    throw createRequestError(`Linked sales order ${missingIds[0]} is invalid.`);
  }

  const existingLink = rows.find(
    (row) => row.linked_purchase_order_id !== null && row.linked_purchase_order_id !== undefined
  );

  if (existingLink) {
    throw createRequestError(
      `Sales order ${existingLink.order_number} is already linked to purchase order ${existingLink.linked_purchase_order_id}.`
    );
  }

  return rows;
}

async function createPurchaseOrder(payload, userContext = {}) {
  const supplierId = Number(payload?.supplierId);
  const orderDate = normalizeDateValue(payload?.orderDate, "orderDate");
  const expectedDeliveryDate = normalizeDateValue(
    payload?.expectedDeliveryDate,
    "expectedDeliveryDate"
  );
  const supplierReference = normalizeString(payload?.supplierReference);
  const notes = normalizeString(payload?.notes);
  const linkedSalesOrders = Array.isArray(payload?.linkedSalesOrders)
    ? [...new Set(payload.linkedSalesOrders.map((value) => Number(value)).filter(Number.isInteger))]
    : [];
  const rawLines = Array.isArray(payload?.lines) ? payload.lines : [];

  if (!Number.isInteger(supplierId) || supplierId <= 0) {
    throw createRequestError("Supplier is required.");
  }

  if (!orderDate) {
    throw createRequestError("Order date is required.");
  }

  if (!rawLines.length) {
    throw createRequestError("At least one purchase order line is required.");
  }

  const supplier = await get(
    `
      SELECT id, code, name
      FROM suppliers
      WHERE id = ?
      LIMIT 1
    `,
    [supplierId]
  );

  if (!supplier) {
    throw createRequestError("Supplier is invalid.");
  }

  const normalizedLines = rawLines.map((rawLine, index) => {
    const lineNumber = index + 1;
    const productId = Number(rawLine?.productId);
    const quantityOrdered = Number(rawLine?.quantityOrdered);
    const unitCost = Number(rawLine?.unitCost);

    if (!Number.isInteger(productId) || productId <= 0) {
      throw createRequestError(`Line ${lineNumber}: product is required.`);
    }

    if (!Number.isFinite(quantityOrdered) || quantityOrdered <= 0) {
      throw createRequestError(`Line ${lineNumber}: quantityOrdered must be greater than 0.`);
    }

    if (!Number.isFinite(unitCost) || unitCost < 0) {
      throw createRequestError(`Line ${lineNumber}: unitCost cannot be negative.`);
    }

    return {
      productId,
      quantityOrdered: roundQuantity(quantityOrdered),
      unitCost: roundMoney(unitCost),
    };
  });

  const uniqueProductIds = [...new Set(normalizedLines.map((line) => line.productId))];
  const productRows = await all(
    `
      SELECT id, sku, name, is_serial_tracked
      FROM products
      WHERE id IN (${uniqueProductIds.map(() => "?").join(", ")})
    `,
    uniqueProductIds
  );
  const productMap = new Map(productRows.map((row) => [Number(row.id), row]));

  normalizedLines.forEach((line, index) => {
    const product = productMap.get(line.productId);
    if (!product) {
      throw createRequestError(`Line ${index + 1}: product is invalid.`);
    }

    line.product = product;
  });

  const linkedSalesOrderRows = await validateLinkedSalesOrders(linkedSalesOrders);

  return withTransaction(async () => {
    const orderNumber = await getNextPurchaseOrderNumber();
    const headerResult = await run(
      `
        INSERT INTO purchase_orders (
          order_number,
          supplier_id,
          linked_sales_order_id,
          status,
          ordered_at,
          expected_at,
          supplier_reference,
          notes,
          updated_at
        ) VALUES (?, ?, ?, 'open', ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `,
      [
        orderNumber,
        supplier.id,
        linkedSalesOrderRows[0]?.id || null,
        orderDate,
        expectedDeliveryDate || null,
        supplierReference,
        notes,
      ]
    );

    const lineSummaries = [];

    for (const line of normalizedLines) {
      const lineResult = await run(
        `
          INSERT INTO purchase_order_lines (
            purchase_order_id,
            product_id,
            quantity_ordered,
            quantity_received,
            unit_cost,
            updated_at
          ) VALUES (?, ?, ?, 0, ?, CURRENT_TIMESTAMP)
        `,
        [headerResult.id, line.productId, line.quantityOrdered, line.unitCost]
      );

      lineSummaries.push({
        id: lineResult.id,
        productId: line.productId,
        sku: line.product.sku,
        productName: line.product.name,
        quantityOrdered: line.quantityOrdered,
        quantityReceived: 0,
        quantityRemaining: line.quantityOrdered,
        unitCost: line.unitCost,
        serialRequired: Boolean(line.product.is_serial_tracked),
        lineTotal: roundMoney(line.quantityOrdered * line.unitCost),
      });
    }

    for (const salesOrder of linkedSalesOrderRows) {
      await run(
        `
          UPDATE sales_orders
          SET linked_purchase_order_id = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [headerResult.id, salesOrder.id]
      );
    }

    const totalValue = roundMoney(
      lineSummaries.reduce((sum, line) => sum + Number(line.lineTotal || 0), 0)
    );

    await logActivity(
      "purchase_order",
      orderNumber,
      "purchase_order_created",
      {
        supplierId: supplier.id,
        supplierCode: supplier.code,
        supplierName: supplier.name,
        orderDate,
        expectedDeliveryDate,
        supplierReference,
        notes,
        linkedSalesOrders: linkedSalesOrderRows.map((row) => ({
          id: row.id,
          orderNumber: row.order_number,
        })),
        totalValue,
        lineCount: lineSummaries.length,
        lines: lineSummaries,
      },
      userContext
    );

    return {
      id: headerResult.id,
      poNumber: orderNumber,
      orderNumber,
      supplier: {
        id: supplier.id,
        supplierCode: supplier.code,
        name: supplier.name,
      },
      status: "Open",
      orderDate,
      expectedDeliveryDate,
      supplierReference,
      notes,
      linkedSalesOrders: linkedSalesOrderRows.map((row) => ({
        id: row.id,
        orderNumber: row.order_number,
      })),
      lines: lineSummaries,
      totals: {
        lineCount: lineSummaries.length,
        quantityOrdered: roundQuantity(
          lineSummaries.reduce((sum, line) => sum + Number(line.quantityOrdered || 0), 0)
        ),
        quantityReceived: 0,
        quantityRemaining: roundQuantity(
          lineSummaries.reduce((sum, line) => sum + Number(line.quantityRemaining || 0), 0)
        ),
        totalValue,
      },
    };
  });
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
        unit_cost: roundMoney(line.unit_cost),
        line_total: roundMoney(ordered * Number(line.unit_cost || 0)),
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

  // receivedDate defaults to today if not supplied; validates YYYY-MM-DD format.
  const today = new Date().toISOString().slice(0, 10);
  const rawReceivedDate = String(payload?.receivedDate || "").trim();
  let receivedDate;
  if (!rawReceivedDate) {
    receivedDate = today;
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawReceivedDate)) {
      throw createRequestError("receivedDate must be in YYYY-MM-DD format.");
    }
    receivedDate = rawReceivedDate;
  }

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

    // Zero-quantity lines are silently ignored (not rejected).
    if (!Number.isFinite(quantityReceived) || quantityReceived <= 0) {
      continue;
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

  if (!normalisedLines.length) {
    throw createRequestError("At least one line with a quantity greater than zero is required.");
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

  // Run the receipt inside a transaction, then apply Jira integration outside it
  // so a Jira failure never rolls back the receipt.
  const receipt = await withTransaction(async () => {
    const receiptResult = await run(
      `INSERT INTO goods_receipts (
        purchase_order_id,
        receipt_number,
        delivery_number,
        received_by,
        received_at
      ) VALUES (?, ?, ?, ?, ?)`,
      [orderDetails.order.id, receiptNumber, deliveryNumber, receivedBy, receivedDate]
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

          // Record serial lifecycle event for traceability.
          await run(
            `INSERT INTO serial_lifecycle_events (
              stock_item_id,
              serial_number,
              event_type,
              reference_type,
              reference_number,
              supplier_id,
              location_id,
              notes,
              event_by,
              event_at
            ) VALUES (?, ?, 'received', 'goods_receipt', ?, ?, ?, ?, ?, ?)`,
            [
              stockItemResult.id,
              serialNumber,
              receiptNumber,
              orderDetails.order.supplier_id,
              holdLocation.id,
              `Received against ${orderDetails.order.order_number} delivery ${deliveryNumber}`,
              receivedBy,
              receivedDate,
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

    return {
      receiptNumber,
      deliveryNumber,
      receivedBy,
      receivedDate,
      purchaseOrderNumber: orderDetails.order.order_number,
      status,
      holdingLocation: holdLocation.code,
      lines: lineSummaries,
    };
  });

  // ── Jira integration (after transaction — never blocks the receipt) ──────────
  const jiraResult = { attempted: false, success: false, issueKey: null, error: null };

  if (jira.isEnabled()) {
    try {
      const poRow = await get(
        "SELECT jira_issue_key FROM purchase_orders WHERE order_number = ?",
        [poNumber]
      );
      const issueKey = poRow?.jira_issue_key || null;

      if (issueKey) {
        jiraResult.attempted = true;
        jiraResult.issueKey = issueKey;

        // Build human-readable comment
        const lineLines = receipt.lines.map((line) => {
          const serials = line.serial_numbers?.length
            ? `serials received: ${line.serial_numbers.join(", ")}`
            : `received ${line.quantity_received_now} of ${line.quantity_ordered}, remaining ${line.quantity_remaining_after_receipt}`;
          return `- SKU ${line.sku}: ${serials}`;
        });

        const receivedAt = `${receipt.receivedDate} ${new Date().toISOString().slice(11, 16)}`;
        const statusLabel = receipt.status === "fully_received" ? "Fully received" : "Part received";

        const commentText = [
          `Goods received against ${receipt.purchaseOrderNumber}.`,
          "",
          `Delivery reference: ${receipt.deliveryNumber}`,
          `Received by: ${receipt.receivedBy}`,
          `Received at: ${receivedAt}`,
          "",
          "Lines received:",
          ...lineLines,
          "",
          `Status: ${statusLabel}`,
        ].join("\n");

        const commentResult = await jira.addComment(issueKey, commentText);
        jiraResult.success = commentResult !== null;

        // Optionally transition the issue when fully received
        const transition = process.env.JIRA_PO_RECEIVED_TRANSITION || "";
        if (jiraResult.success && receipt.status === "fully_received" && transition) {
          await jira.transitionIssue(issueKey, transition);
        }
      }
    } catch (err) {
      console.error("[Jira] Unexpected error during receipt integration:", err.message);
      jiraResult.error = err.message;
    }
  }

  return { ...receipt, jiraResult };
}

module.exports = {
  createPurchaseOrder,
  getPurchaseOrderByNumber,
  getPurchaseOrders,
  receivePurchaseOrder,
};
