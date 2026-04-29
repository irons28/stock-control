const express = require("express");
const { run, get, all } = require("../db/connection");

const router = express.Router();

// Generate a unique reference like RET-20260429-0001
async function generateReturnReference() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `RET-${today}`;
  const existing = await get(
    "SELECT COUNT(*) AS cnt FROM customer_returns WHERE return_reference LIKE ?",
    [`${prefix}%`],
  );
  const seq = String((existing?.cnt || 0) + 1).padStart(4, "0");
  return `${prefix}-${seq}`;
}

async function generateWarrantyReference() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `WRT-${today}`;
  const existing = await get(
    "SELECT COUNT(*) AS cnt FROM warranty_replacements WHERE warranty_reference LIKE ?",
    [`${prefix}%`],
  );
  const seq = String((existing?.cnt || 0) + 1).padStart(4, "0");
  return `WRT-${today}-${seq}`;
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/returns
// Body: { serial_number, return_reason, condition, quarantine, quarantine_reason,
//         returned_by, notes }
// ──────────────────────────────────────────────────────────────────────────────
router.post("/", async (req, res, next) => {
  try {
    const {
      serial_number,
      return_reason = "",
      condition = "unknown",
      quarantine = false,
      quarantine_reason = "",
      returned_by = "",
      notes = "",
    } = req.body;

    if (!serial_number) {
      return res.status(400).json({ error: "serial_number is required." });
    }

    const serial = serial_number.trim().toUpperCase();

    // Fetch the stock item
    const item = await get(
      `SELECT si.*,
         p.sku, p.name AS product_name,
         sl.id AS loc_id, sl.code AS location_code
       FROM stock_items si
       JOIN products p ON p.id = si.product_id
       LEFT JOIN stock_locations sl ON sl.id = si.stock_location_id
       WHERE UPPER(si.serial_number) = ?`,
      [serial],
    );

    if (!item) {
      return res.status(404).json({ error: `Serial '${serial}' not found.` });
    }

    // Guard: can't return something already returned / quarantined / scrapped
    const blocked = ["returned", "quarantined", "scrapped"];
    if (blocked.includes(item.hold_status)) {
      return res.status(409).json({
        error: `Serial '${serial}' already has status '${item.hold_status}' and cannot be returned again.`,
      });
    }

    const newHoldStatus = quarantine ? "quarantined" : "returned";
    const returnDate = new Date().toISOString().slice(0, 10);
    const returnRef = await generateReturnReference();

    // Resolve target location
    const targetLocCode = quarantine ? "QUARANTINE" : "RETURNS";
    const targetLoc = await get(
      "SELECT id FROM stock_locations WHERE code = ?",
      [targetLocCode],
    );

    // 1. Update stock_item
    await run(
      `UPDATE stock_items
       SET hold_status = ?,
           stock_location_id = ?,
           return_date = ?,
           quarantine_reason = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        newHoldStatus,
        targetLoc ? targetLoc.id : item.loc_id,
        returnDate,
        quarantine ? quarantine_reason : "",
        item.id,
      ],
    );

    // 2. Write a stock movement
    await run(
      `INSERT INTO stock_movements
         (movement_type, stock_item_id, product_id, source_location_id, destination_location_id,
          quantity, customer_id, reference_type, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        quarantine ? "quarantine" : "return",
        item.id,
        item.product_id,
        item.loc_id || null,
        targetLoc ? targetLoc.id : null,
        1,
        item.customer_id || null,
        "customer_return",
        notes || `Customer return — ${return_reason}`,
      ],
    );

    // 3. Create customer_returns record
    await run(
      `INSERT INTO customer_returns
         (return_reference, stock_item_id, serial_number, customer_id,
          original_sales_order_id, return_reason, condition, quarantine_decision,
          quarantine_reason, returned_by, notes, returned_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        returnRef,
        item.id,
        item.serial_number,
        item.customer_id || null,
        item.linked_sales_order_id || null,
        return_reason,
        condition,
        quarantine ? 1 : 0,
        quarantine ? quarantine_reason : "",
        returned_by,
        notes,
      ],
    );

    const createdReturn = await get(
      "SELECT * FROM customer_returns WHERE return_reference = ?",
      [returnRef],
    );

    res.status(201).json({
      return_reference: returnRef,
      serial_number: item.serial_number,
      product_name: item.product_name,
      sku: item.sku,
      hold_status: newHoldStatus,
      destination: targetLocCode,
      customer_return: createdReturn,
    });
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/returns/warranty-replacement
// Body: { original_serial_number, replacement_serial_number, warranty_reason,
//         replaced_by, notes }
// ──────────────────────────────────────────────────────────────────────────────
router.post("/warranty-replacement", async (req, res, next) => {
  try {
    const {
      original_serial_number,
      replacement_serial_number,
      warranty_reason = "",
      replaced_by = "",
      notes = "",
    } = req.body;

    if (!original_serial_number || !replacement_serial_number) {
      return res.status(400).json({
        error: "original_serial_number and replacement_serial_number are required.",
      });
    }

    const originalSerial = original_serial_number.trim().toUpperCase();
    const replacementSerial = replacement_serial_number.trim().toUpperCase();

    if (originalSerial === replacementSerial) {
      return res.status(400).json({
        error: "original_serial_number and replacement_serial_number must be different.",
      });
    }

    // Fetch both items
    const originalItem = await get(
      `SELECT si.*, p.sku, p.name AS product_name, sl.code AS location_code
       FROM stock_items si
       JOIN products p ON p.id = si.product_id
       LEFT JOIN stock_locations sl ON sl.id = si.stock_location_id
       WHERE UPPER(si.serial_number) = ?`,
      [originalSerial],
    );

    if (!originalItem) {
      return res.status(404).json({ error: `Original serial '${originalSerial}' not found.` });
    }

    // Original must be returned or quarantined to warrant a replacement
    const eligibleStatuses = ["returned", "quarantined", "dispatched", "allocated"];
    if (!eligibleStatuses.includes(originalItem.hold_status)) {
      return res.status(409).json({
        error: `Serial '${originalSerial}' has status '${originalItem.hold_status}'. It must be returned, quarantined, allocated, or dispatched to raise a warranty replacement.`,
      });
    }

    const replacementItem = await get(
      `SELECT si.*, p.sku, p.name AS product_name, sl.code AS location_code
       FROM stock_items si
       JOIN products p ON p.id = si.product_id
       LEFT JOIN stock_locations sl ON sl.id = si.stock_location_id
       WHERE UPPER(si.serial_number) = ?`,
      [replacementSerial],
    );

    if (!replacementItem) {
      return res.status(404).json({ error: `Replacement serial '${replacementSerial}' not found.` });
    }

    // Replacement must be available or received
    const readyStatuses = ["available", "received", "pending_allocation"];
    if (!readyStatuses.includes(replacementItem.hold_status)) {
      return res.status(409).json({
        error: `Replacement serial '${replacementSerial}' has status '${replacementItem.hold_status}' and is not available for dispatch.`,
      });
    }

    const warrantyRef = await generateWarrantyReference();
    const replacedAt = new Date().toISOString().slice(0, 10);

    // Find any existing customer_return record for the original serial
    const existingReturn = await get(
      "SELECT id FROM customer_returns WHERE stock_item_id = ? ORDER BY created_at DESC LIMIT 1",
      [originalItem.id],
    );

    // Resolve DISPATCH location for replacement
    const dispatchLoc = await get(
      "SELECT id FROM stock_locations WHERE code = 'DISPATCH'",
    );

    // 1. Update original item — mark as warranty_replacement
    await run(
      `UPDATE stock_items
       SET hold_status = 'warranty_replacement',
           replaced_by_serial = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [replacementSerial, originalItem.id],
    );

    // 2. Update replacement item — link to original, transfer customer context, mark dispatched
    await run(
      `UPDATE stock_items
       SET hold_status = 'dispatched',
           replaces_serial = ?,
           customer_id = ?,
           linked_sales_order_id = ?,
           stock_location_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        originalSerial,
        originalItem.customer_id || null,
        originalItem.linked_sales_order_id || null,
        dispatchLoc ? dispatchLoc.id : replacementItem.stock_location_id,
        replacementItem.id,
      ],
    );

    // 3. Stock movement for replacement dispatch
    await run(
      `INSERT INTO stock_movements
         (movement_type, stock_item_id, product_id, source_location_id, destination_location_id,
          quantity, customer_id, reference_type, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        "warranty_dispatch",
        replacementItem.id,
        replacementItem.product_id,
        replacementItem.stock_location_id || null,
        dispatchLoc ? dispatchLoc.id : null,
        1,
        originalItem.customer_id || null,
        "warranty_replacement",
        notes || `Warranty replacement for ${originalSerial}`,
      ],
    );

    // 4. Create warranty_replacements record
    await run(
      `INSERT INTO warranty_replacements
         (warranty_reference, original_stock_item_id, replacement_stock_item_id,
          original_serial_number, replacement_serial_number, customer_id,
          customer_return_id, warranty_reason, replaced_by, notes, replaced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        warrantyRef,
        originalItem.id,
        replacementItem.id,
        originalItem.serial_number,
        replacementItem.serial_number,
        originalItem.customer_id || null,
        existingReturn ? existingReturn.id : null,
        warranty_reason,
        replaced_by,
        notes,
      ],
    );

    const createdWarranty = await get(
      "SELECT * FROM warranty_replacements WHERE warranty_reference = ?",
      [warrantyRef],
    );

    res.status(201).json({
      warranty_reference: warrantyRef,
      original_serial: originalItem.serial_number,
      replacement_serial: replacementItem.serial_number,
      product_name: originalItem.product_name,
      sku: originalItem.sku,
      customer_id: originalItem.customer_id || null,
      warranty_replacement: createdWarranty,
    });
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/returns?serial=XXX  — look up return history for a serial
// ──────────────────────────────────────────────────────────────────────────────
router.get("/", async (req, res, next) => {
  try {
    const serial = String(req.query.serial || "").trim().toUpperCase();

    if (!serial) {
      return res.status(400).json({ error: "serial query param is required." });
    }

    const item = await get(
      `SELECT si.*,
         p.sku, p.name AS product_name,
         sl.code AS location_code, sl.name AS location_name
       FROM stock_items si
       JOIN products p ON p.id = si.product_id
       LEFT JOIN stock_locations sl ON sl.id = si.stock_location_id
       WHERE UPPER(si.serial_number) = ?`,
      [serial],
    );

    if (!item) {
      return res.status(404).json({ error: `Serial '${serial}' not found.` });
    }

    const returns = await all(
      `SELECT cr.*, c.name AS customer_name
       FROM customer_returns cr
       LEFT JOIN customers c ON c.id = cr.customer_id
       WHERE cr.stock_item_id = ?
       ORDER BY cr.returned_at DESC`,
      [item.id],
    );

    const warranties = await all(
      `SELECT wr.*, c.name AS customer_name
       FROM warranty_replacements wr
       LEFT JOIN customers c ON c.id = wr.customer_id
       WHERE wr.original_stock_item_id = ? OR wr.replacement_stock_item_id = ?
       ORDER BY wr.replaced_at DESC`,
      [item.id, item.id],
    );

    res.json({ item, returns, warranties });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
