#!/usr/bin/env node
// Inserts realistic Phase 1 demo data.
// Called automatically by npm run db:reset after schema initialisation.
// Do NOT run this script on a production database.

const { run, get } = require("../src/db/connection");

// Return today ± N days as a YYYY-MM-DD string.
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

async function seedDemoData() {
  // ── Lookup reference-data IDs ──────────────────────────────────────────────

  const supNexus    = await get(`SELECT id FROM suppliers       WHERE code = 'SUP-NEXUS'`);
  const supConsumix = await get(`SELECT id FROM suppliers       WHERE code = 'SUP-CONSUMIX'`);
  const custAlpha   = await get(`SELECT id FROM customers       WHERE code = 'CUST-ALPHA'`);
  const custHarbor  = await get(`SELECT id FROM customers       WHERE code = 'CUST-HARBOR'`);
  const pTill       = await get(`SELECT id FROM products        WHERE sku  = 'TILL-001'`);
  const pPrinter    = await get(`SELECT id FROM products        WHERE sku  = 'PRINTER-001'`);
  const pScanner    = await get(`SELECT id FROM products        WHERE sku  = 'SCANNER-001'`);
  const pRoll       = await get(`SELECT id FROM products        WHERE sku  = 'ROLL-001'`);
  const pLabel      = await get(`SELECT id FROM products        WHERE sku  = 'LABEL-001'`);
  const locHold        = await get(`SELECT id FROM stock_locations WHERE code = 'HOLD'`);
  const locConsumables = await get(`SELECT id FROM stock_locations WHERE code = 'CONSUMABLES'`);
  const locDispatch    = await get(`SELECT id FROM stock_locations WHERE code = 'DISPATCH'`);
  const locRackA1      = await get(`SELECT id FROM stock_locations WHERE code = 'RACK-A1'`);
  const locQuarantine  = await get(`SELECT id FROM stock_locations WHERE code = 'QUARANTINE'`);
  const locReturns     = await get(`SELECT id FROM stock_locations WHERE code = 'RETURNS'`);

  // ── Purchase Orders ────────────────────────────────────────────────────────
  //
  // PO-1001  Overdue     — expected 10 days ago, nothing received
  // PO-1002  Part Recv'd — partially received, rest due in 3 days
  // PO-1003  Open        — ordered yesterday, delivery in 2 weeks
  // PO-1004  Fully Recv'd— completed 44 days ago

  await run(
    `INSERT INTO purchase_orders
       (order_number, supplier_id, status, ordered_at, expected_at, notes)
     VALUES (?, ?, 'confirmed', ?, ?, ?)`,
    [
      "PO-1001", supNexus.id,
      daysFromNow(-30), daysFromNow(-10),
      "Overdue delivery – chasing supplier",
    ],
  );

  await run(
    `INSERT INTO purchase_orders
       (order_number, supplier_id, status, ordered_at, expected_at, notes)
     VALUES (?, ?, 'confirmed', ?, ?, ?)`,
    [
      "PO-1002", supNexus.id,
      daysFromNow(-14), daysFromNow(3),
      "Partial delivery received; balance due shortly",
    ],
  );

  await run(
    `INSERT INTO purchase_orders
       (order_number, supplier_id, status, ordered_at, expected_at, notes)
     VALUES (?, ?, 'confirmed', ?, ?, ?)`,
    [
      "PO-1003", supConsumix.id,
      daysFromNow(-1), daysFromNow(14),
      "Consumables restock",
    ],
  );

  await run(
    `INSERT INTO purchase_orders
       (order_number, supplier_id, status, ordered_at, expected_at, notes)
     VALUES (?, ?, 'received', ?, ?, ?)`,
    [
      "PO-1004", supNexus.id,
      daysFromNow(-60), daysFromNow(-45),
      "Fully received and archived",
    ],
  );

  const po1001 = await get(`SELECT id FROM purchase_orders WHERE order_number = 'PO-1001'`);
  const po1002 = await get(`SELECT id FROM purchase_orders WHERE order_number = 'PO-1002'`);
  const po1003 = await get(`SELECT id FROM purchase_orders WHERE order_number = 'PO-1003'`);
  const po1004 = await get(`SELECT id FROM purchase_orders WHERE order_number = 'PO-1004'`);

  // ── Purchase Order Lines ───────────────────────────────────────────────────

  // PO-1001 — nothing received yet
  await run(
    `INSERT INTO purchase_order_lines
       (purchase_order_id, product_id, quantity_ordered, quantity_received, unit_cost)
     VALUES (?, ?, 5, 0, 325.00)`,
    [po1001.id, pTill.id],
  );
  await run(
    `INSERT INTO purchase_order_lines
       (purchase_order_id, product_id, quantity_ordered, quantity_received, unit_cost)
     VALUES (?, ?, 3, 0, 110.00)`,
    [po1001.id, pPrinter.id],
  );

  // PO-1002 — 1 of 3 tills received; 2 scanners still outstanding
  await run(
    `INSERT INTO purchase_order_lines
       (purchase_order_id, product_id, quantity_ordered, quantity_received, unit_cost)
     VALUES (?, ?, 3, 1, 325.00)`,
    [po1002.id, pTill.id],
  );
  await run(
    `INSERT INTO purchase_order_lines
       (purchase_order_id, product_id, quantity_ordered, quantity_received, unit_cost)
     VALUES (?, ?, 2, 0, 58.00)`,
    [po1002.id, pScanner.id],
  );

  // PO-1003 — nothing received yet
  await run(
    `INSERT INTO purchase_order_lines
       (purchase_order_id, product_id, quantity_ordered, quantity_received, unit_cost)
     VALUES (?, ?, 2, 0, 110.00)`,
    [po1003.id, pPrinter.id],
  );
  await run(
    `INSERT INTO purchase_order_lines
       (purchase_order_id, product_id, quantity_ordered, quantity_received, unit_cost)
     VALUES (?, ?, 100, 0, 1.10)`,
    [po1003.id, pRoll.id],
  );

  // PO-1004 — fully received
  await run(
    `INSERT INTO purchase_order_lines
       (purchase_order_id, product_id, quantity_ordered, quantity_received, unit_cost)
     VALUES (?, ?, 3, 3, 325.00)`,
    [po1004.id, pTill.id],
  );
  await run(
    `INSERT INTO purchase_order_lines
       (purchase_order_id, product_id, quantity_ordered, quantity_received, unit_cost)
     VALUES (?, ?, 30, 30, 3.20)`,
    [po1004.id, pLabel.id],
  );

  const pol1002Till  = await get(
    `SELECT id FROM purchase_order_lines WHERE purchase_order_id = ? AND product_id = ?`,
    [po1002.id, pTill.id],
  );
  const pol1004Till  = await get(
    `SELECT id FROM purchase_order_lines WHERE purchase_order_id = ? AND product_id = ?`,
    [po1004.id, pTill.id],
  );
  const pol1004Label = await get(
    `SELECT id FROM purchase_order_lines WHERE purchase_order_id = ? AND product_id = ?`,
    [po1004.id, pLabel.id],
  );

  // ── Sales Orders ───────────────────────────────────────────────────────────
  //
  // SO-2001  URGENT       — dispatch was due yesterday (Alpha Vet)
  // SO-2002  Dispatch Ready— 1 till fully allocated, due tomorrow (Harbor Retail)
  // SO-2003  Open         — consumables order, awaiting stock (Alpha Vet)

  await run(
    `INSERT INTO sales_orders
       (order_number, customer_id, status, requested_at, dispatch_due_at, notes)
     VALUES (?, ?, 'confirmed', ?, ?, ?)`,
    [
      "SO-2001", custAlpha.id,
      daysFromNow(-5), daysFromNow(-1),
      "URGENT – customer chasing dispatch",
    ],
  );

  await run(
    `INSERT INTO sales_orders
       (order_number, customer_id, status, requested_at, dispatch_due_at, notes)
     VALUES (?, ?, 'confirmed', ?, ?, ?)`,
    [
      "SO-2002", custHarbor.id,
      daysFromNow(-3), daysFromNow(1),
      "Ready to dispatch – stock allocated in Rack A1",
    ],
  );

  await run(
    `INSERT INTO sales_orders
       (order_number, customer_id, status, requested_at, dispatch_due_at, notes)
     VALUES (?, ?, 'confirmed', ?, ?, ?)`,
    [
      "SO-2003", custAlpha.id,
      daysFromNow(-1), daysFromNow(7),
      "Consumables order – awaiting stock allocation",
    ],
  );

  const so2001 = await get(`SELECT id FROM sales_orders WHERE order_number = 'SO-2001'`);
  const so2002 = await get(`SELECT id FROM sales_orders WHERE order_number = 'SO-2002'`);
  const so2003 = await get(`SELECT id FROM sales_orders WHERE order_number = 'SO-2003'`);

  // ── Sales Order Lines ──────────────────────────────────────────────────────

  // SO-2001 — 20 till rolls needed, nothing allocated yet
  await run(
    `INSERT INTO sales_order_lines
       (sales_order_id, product_id, quantity_ordered, quantity_allocated, quantity_dispatched)
     VALUES (?, ?, 20, 0, 0)`,
    [so2001.id, pRoll.id],
  );

  // SO-2002 — 1 smart till terminal, fully allocated (dispatch-ready)
  await run(
    `INSERT INTO sales_order_lines
       (sales_order_id, product_id, quantity_ordered, quantity_allocated, quantity_dispatched)
     VALUES (?, ?, 1, 1, 0)`,
    [so2002.id, pTill.id],
  );

  // SO-2003 — 10 label packs, nothing allocated yet
  await run(
    `INSERT INTO sales_order_lines
       (sales_order_id, product_id, quantity_ordered, quantity_allocated, quantity_dispatched)
     VALUES (?, ?, 10, 0, 0)`,
    [so2003.id, pLabel.id],
  );

  const sol2002Till = await get(
    `SELECT id FROM sales_order_lines WHERE sales_order_id = ? AND product_id = ?`,
    [so2002.id, pTill.id],
  );

  // ── Goods Receipts ─────────────────────────────────────────────────────────

  await run(
    `INSERT INTO goods_receipts
       (purchase_order_id, receipt_number, received_at, received_by, notes)
     VALUES (?, 'GR-1002A', ?, 'Warehouse', '1 of 3 tills received — partial delivery')`,
    [po1002.id, daysFromNow(-13)],
  );

  await run(
    `INSERT INTO goods_receipts
       (purchase_order_id, receipt_number, received_at, received_by, notes)
     VALUES (?, 'GR-1004A', ?, 'Warehouse', '3 Smart Till Terminals received')`,
    [po1004.id, daysFromNow(-44)],
  );

  await run(
    `INSERT INTO goods_receipts
       (purchase_order_id, receipt_number, received_at, received_by, notes)
     VALUES (?, 'GR-1004B', ?, 'Warehouse', '30 Shelf Edge Label packs received')`,
    [po1004.id, daysFromNow(-44)],
  );

  const gr1002A = await get(`SELECT id FROM goods_receipts WHERE receipt_number = 'GR-1002A'`);
  const gr1004A = await get(`SELECT id FROM goods_receipts WHERE receipt_number = 'GR-1004A'`);
  const gr1004B = await get(`SELECT id FROM goods_receipts WHERE receipt_number = 'GR-1004B'`);

  // ── Goods Receipt Lines ────────────────────────────────────────────────────

  await run(
    `INSERT INTO goods_receipt_lines
       (goods_receipt_id, purchase_order_line_id, product_id, holding_location_id, quantity_received)
     VALUES (?, ?, ?, ?, 1)`,
    [gr1002A.id, pol1002Till.id, pTill.id, locHold.id],
  );

  await run(
    `INSERT INTO goods_receipt_lines
       (goods_receipt_id, purchase_order_line_id, product_id, holding_location_id, quantity_received)
     VALUES (?, ?, ?, ?, 3)`,
    [gr1004A.id, pol1004Till.id, pTill.id, locRackA1.id],
  );

  await run(
    `INSERT INTO goods_receipt_lines
       (goods_receipt_id, purchase_order_line_id, product_id, holding_location_id, quantity_received)
     VALUES (?, ?, ?, ?, 30)`,
    [gr1004B.id, pol1004Label.id, pLabel.id, locConsumables.id],
  );

  // ── Stock Items ────────────────────────────────────────────────────────────
  //
  // Serial-tracked (TILL-001):
  //   TILL-SN-1001  available     — received via PO-1004, sitting in Rack A1
  //   TILL-SN-1002  allocated     — allocated to SO-2002, ready for dispatch
  //   TILL-SN-1003  dispatched    — already sent to a previous customer
  //   TILL-SN-1004  received      — from PO-1002 partial receipt, in HOLD (awaiting allocation)
  //
  // Quantity-tracked (LABEL-001):
  //   30 units       received      — from PO-1004, in CONSUMABLES (awaiting allocation)

  // TILL-SN-1001 — available
  await run(
    `INSERT INTO stock_items
       (product_id, stock_location_id, actual_location_id, serial_number,
        quantity_on_hand, quantity_allocated, hold_status,
        linked_purchase_order_id, linked_purchase_order_line_id, status)
     VALUES (?, ?, ?, 'TILL-SN-1001', 1, 0, 'available', ?, ?, 'active')`,
    [pTill.id, locRackA1.id, locRackA1.id, po1004.id, pol1004Till.id],
  );

  // TILL-SN-1002 — allocated to SO-2002 (dispatch-ready)
  await run(
    `INSERT INTO stock_items
       (product_id, stock_location_id, actual_location_id, serial_number,
        quantity_on_hand, quantity_allocated, hold_status,
        linked_purchase_order_id, linked_purchase_order_line_id,
        linked_sales_order_id, linked_sales_order_line_id, customer_id, status)
     VALUES (?, ?, ?, 'TILL-SN-1002', 1, 1, 'allocated', ?, ?, ?, ?, ?, 'active')`,
    [
      pTill.id, locRackA1.id, locRackA1.id,
      po1004.id, pol1004Till.id,
      so2002.id, sol2002Till.id, custHarbor.id,
    ],
  );

  // TILL-SN-1003 — dispatched
  await run(
    `INSERT INTO stock_items
       (product_id, stock_location_id, actual_location_id, serial_number,
        quantity_on_hand, quantity_allocated, hold_status,
        linked_purchase_order_id, linked_purchase_order_line_id,
        linked_sales_order_id, customer_id, status)
     VALUES (?, ?, NULL, 'TILL-SN-1003', 0, 0, 'dispatched', ?, ?, NULL, ?, 'active')`,
    [pTill.id, locDispatch.id, po1004.id, pol1004Till.id, custHarbor.id],
  );

  // TILL-SN-1004 — received from PO-1002, in HOLD, awaiting allocation
  await run(
    `INSERT INTO stock_items
       (product_id, stock_location_id, actual_location_id, serial_number,
        quantity_on_hand, quantity_allocated, hold_status,
        linked_purchase_order_id, linked_purchase_order_line_id, status)
     VALUES (?, ?, ?, 'TILL-SN-1004', 1, 0, 'received', ?, ?, 'active')`,
    [pTill.id, locHold.id, locHold.id, po1002.id, pol1002Till.id],
  );

  // LABEL-001 qty stock — 30 units available, awaiting allocation to SO-2003
  await run(
    `INSERT INTO stock_items
       (product_id, stock_location_id, actual_location_id, serial_number,
        quantity_on_hand, quantity_allocated, hold_status,
        linked_purchase_order_id, linked_purchase_order_line_id, status)
     VALUES (?, ?, ?, NULL, 30, 0, 'available', ?, ?, 'active')`,
    [pLabel.id, locConsumables.id, locConsumables.id, po1004.id, pol1004Label.id],
  );

  const si1001 = await get(`SELECT id FROM stock_items WHERE serial_number = 'TILL-SN-1001'`);
  const si1002 = await get(`SELECT id FROM stock_items WHERE serial_number = 'TILL-SN-1002'`);
  const si1003 = await get(`SELECT id FROM stock_items WHERE serial_number = 'TILL-SN-1003'`);

  // ── Stock Movements ────────────────────────────────────────────────────────

  // Receipt: TILL-SN-1001 received on GR-1004A
  await run(
    `INSERT INTO stock_movements
       (movement_type, stock_item_id, product_id,
        destination_location_id, actual_destination_location_id,
        quantity, linked_purchase_order_id,
        reference_type, reference_id, notes)
     VALUES ('receipt', ?, ?, ?, ?, 1, ?, 'goods_receipt', ?, 'Received on PO-1004 / GR-1004A')`,
    [si1001.id, pTill.id, locRackA1.id, locRackA1.id, po1004.id, gr1004A.id],
  );

  // Receipt: TILL-SN-1002 received on GR-1004A
  await run(
    `INSERT INTO stock_movements
       (movement_type, stock_item_id, product_id,
        destination_location_id, actual_destination_location_id,
        quantity, linked_purchase_order_id,
        reference_type, reference_id, notes)
     VALUES ('receipt', ?, ?, ?, ?, 1, ?, 'goods_receipt', ?, 'Received on PO-1004 / GR-1004A')`,
    [si1002.id, pTill.id, locRackA1.id, locRackA1.id, po1004.id, gr1004A.id],
  );

  // Allocation: TILL-SN-1002 allocated to SO-2002
  await run(
    `INSERT INTO stock_movements
       (movement_type, stock_item_id, product_id,
        source_location_id, destination_location_id,
        actual_source_location_id, actual_destination_location_id,
        quantity, linked_purchase_order_id, linked_sales_order_id, customer_id,
        reference_type, reference_id, notes)
     VALUES ('allocation', ?, ?, ?, ?, ?, ?, 1, ?, ?, ?,
             'sales_order', ?, 'Allocated to SO-2002 for Harbor Retail')`,
    [
      si1002.id, pTill.id,
      locRackA1.id, locRackA1.id, locRackA1.id, locRackA1.id,
      po1004.id, so2002.id, custHarbor.id, so2002.id,
    ],
  );

  // Receipt: TILL-SN-1003 received on GR-1004A (now dispatched)
  await run(
    `INSERT INTO stock_movements
       (movement_type, stock_item_id, product_id,
        destination_location_id, actual_destination_location_id,
        quantity, linked_purchase_order_id,
        reference_type, reference_id, notes)
     VALUES ('receipt', ?, ?, ?, ?, 1, ?, 'goods_receipt', ?, 'Received on PO-1004 / GR-1004A')`,
    [si1003.id, pTill.id, locRackA1.id, locRackA1.id, po1004.id, gr1004A.id],
  );

  // Dispatch: TILL-SN-1003 dispatched
  await run(
    `INSERT INTO stock_movements
       (movement_type, stock_item_id, product_id,
        source_location_id, actual_source_location_id,
        quantity, linked_purchase_order_id, customer_id,
        reference_type, notes)
     VALUES ('dispatch', ?, ?, ?, ?, 1, ?, ?, 'dispatch',
             'Dispatched – previous order REF-PREV-001')`,
    [si1003.id, pTill.id, locDispatch.id, locRackA1.id, po1004.id, custHarbor.id],
  );

  // ── Enrich existing serials with delivery_note_ref ────────────────────────
  // TILL-SN-1001, 1002, 1003, 1004 were received on GR-1004A

  for (const sn of ["TILL-SN-1001", "TILL-SN-1002", "TILL-SN-1003", "TILL-SN-1004"]) {
    await run(
      `UPDATE stock_items SET delivery_note_ref = 'GR-1004A' WHERE serial_number = ?`,
      [sn],
    );
  }

  // Enrich TILL-SN-1002 (allocated) and TILL-SN-1003 (dispatched) with refs
  await run(
    `UPDATE stock_items SET dispatch_reference = 'DISP-2002', dispatch_date = ?
     WHERE serial_number = 'TILL-SN-1003'`,
    [daysFromNow(-44)],
  );

  // ── Additional lifecycle scenario serials ──────────────────────────────────
  //
  //  TILL-SN-1005  quarantined  — passed QA then failed power-on test
  //  TILL-SN-1006  returned     — dispatched to customer, customer returned it
  //  TILL-SN-1007  dispatched   — sent as warranty replacement for TILL-SN-1006
  //  TILL-SN-1008  scrapped     — full lifecycle then condemned

  // ── TILL-SN-1005 — quarantined ────────────────────────────────────────────

  await run(
    `INSERT INTO stock_items
       (product_id, stock_location_id, actual_location_id, serial_number,
        quantity_on_hand, quantity_allocated, hold_status,
        linked_purchase_order_id, linked_purchase_order_line_id,
        delivery_note_ref, quarantine_reason, status)
     VALUES (?, ?, ?, 'TILL-SN-1005', 1, 0, 'quarantined', ?, ?,
             'GR-1004A', 'Power fault detected during QA power-on test — held for supplier return', 'active')`,
    [pTill.id, locQuarantine.id, locQuarantine.id, po1004.id, pol1004Till.id],
  );

  const si1005 = await get(`SELECT id FROM stock_items WHERE serial_number = 'TILL-SN-1005'`);

  // Use explicit created_at so the timeline sorts in correct historical order.
  await run(
    `INSERT INTO stock_movements
       (movement_type, stock_item_id, product_id,
        destination_location_id, actual_destination_location_id,
        quantity, linked_purchase_order_id,
        reference_type, reference_id, notes, created_at)
     VALUES ('receipt', ?, ?, ?, ?, 1, ?, 'goods_receipt', ?,
             'Received on PO-1004 / GR-1004A', ?)`,
    [si1005.id, pTill.id, locRackA1.id, locRackA1.id, po1004.id, gr1004A.id, daysFromNow(-44)],
  );

  await run(
    `INSERT INTO serial_lifecycle_events
       (stock_item_id, serial_number, event_type,
        reference_type, reference_number, supplier_id, location_id, notes, event_at)
     VALUES (?, 'TILL-SN-1005', 'quarantined',
             'inspection', 'QA-INSP-005', ?, ?,
             'Failed power-on self-test — PSU output voltage out of spec. Quarantined pending supplier RMA.',
             ?)`,
    [si1005.id, supNexus.id, locQuarantine.id, daysFromNow(-43)],
  );

  // ── TILL-SN-1006 — returned ───────────────────────────────────────────────

  await run(
    `INSERT INTO stock_items
       (product_id, stock_location_id, actual_location_id, serial_number,
        quantity_on_hand, quantity_allocated, hold_status,
        linked_purchase_order_id, linked_purchase_order_line_id,
        customer_id,
        delivery_note_ref, dispatch_reference, dispatch_date,
        return_date, replaced_by_serial, status)
     VALUES (?, ?, ?, 'TILL-SN-1006', 0, 0, 'returned', ?, ?,
             ?,
             'GR-1004A', 'DISP-2003', ?,
             ?, 'TILL-SN-1007', 'active')`,
    [
      pTill.id, locReturns.id, locReturns.id, po1004.id, pol1004Till.id,
      custAlpha.id,
      daysFromNow(-35), daysFromNow(-3),
    ],
  );

  const si1006 = await get(`SELECT id FROM stock_items WHERE serial_number = 'TILL-SN-1006'`);

  await run(
    `INSERT INTO serial_lifecycle_events
       (stock_item_id, serial_number, event_type,
        reference_type, reference_number, supplier_id, location_id, notes, event_at)
     VALUES (?, 'TILL-SN-1006', 'receipt',
             'goods_receipt', 'GR-1004A', ?, ?,
             'Received into stock on PO-1004.', ?)`,
    [si1006.id, supNexus.id, locRackA1.id, daysFromNow(-44)],
  );

  await run(
    `INSERT INTO serial_lifecycle_events
       (stock_item_id, serial_number, event_type,
        reference_type, reference_number, customer_id, location_id, notes, event_at)
     VALUES (?, 'TILL-SN-1006', 'dispatch',
             'dispatch', 'DISP-2003', ?, ?,
             'Dispatched to Alpha Veterinary Group on SO-HIST-001.', ?)`,
    [si1006.id, custAlpha.id, locDispatch.id, daysFromNow(-35)],
  );

  await run(
    `INSERT INTO serial_lifecycle_events
       (stock_item_id, serial_number, event_type,
        reference_type, reference_number, customer_id, location_id, notes, event_at)
     VALUES (?, 'TILL-SN-1006', 'returned',
             'returns', 'RET-2006', ?, ?,
             'Customer reported intermittent screen blank. Unit returned by Alpha Vet for warranty assessment.', ?)`,
    [si1006.id, custAlpha.id, locReturns.id, daysFromNow(-3)],
  );

  await run(
    `INSERT INTO serial_lifecycle_events
       (stock_item_id, serial_number, event_type,
        reference_type, reference_number, customer_id, location_id, notes, event_at)
     VALUES (?, 'TILL-SN-1006', 'warranty_replacement',
             'warranty', 'WR-2007', ?, ?,
             'Replacement unit TILL-SN-1007 dispatched to Alpha Vet. Original unit held for supplier credit.', ?)`,
    [si1006.id, custAlpha.id, locReturns.id, daysFromNow(-2)],
  );

  // ── TILL-SN-1007 — warranty replacement ──────────────────────────────────

  await run(
    `INSERT INTO stock_items
       (product_id, stock_location_id, actual_location_id, serial_number,
        quantity_on_hand, quantity_allocated, hold_status,
        linked_purchase_order_id, linked_purchase_order_line_id,
        customer_id,
        delivery_note_ref, dispatch_reference, dispatch_date,
        replaces_serial, status)
     VALUES (?, ?, NULL, 'TILL-SN-1007', 0, 0, 'dispatched', ?, ?,
             ?,
             'GR-1004A', 'DISP-W-2007', ?,
             'TILL-SN-1006', 'active')`,
    [
      pTill.id, locDispatch.id, po1004.id, pol1004Till.id,
      custAlpha.id,
      daysFromNow(-2),
    ],
  );

  const si1007 = await get(`SELECT id FROM stock_items WHERE serial_number = 'TILL-SN-1007'`);

  await run(
    `INSERT INTO serial_lifecycle_events
       (stock_item_id, serial_number, event_type,
        reference_type, reference_number, supplier_id, location_id, notes, event_at)
     VALUES (?, 'TILL-SN-1007', 'receipt',
             'goods_receipt', 'GR-1004A', ?, ?,
             'Received into stock on PO-1004.', ?)`,
    [si1007.id, supNexus.id, locRackA1.id, daysFromNow(-44)],
  );

  await run(
    `INSERT INTO serial_lifecycle_events
       (stock_item_id, serial_number, event_type,
        reference_type, reference_number, customer_id, location_id, notes, event_at)
     VALUES (?, 'TILL-SN-1007', 'warranty_replacement',
             'warranty', 'WR-2007', ?, ?,
             'Allocated as warranty replacement for TILL-SN-1006 returned by Alpha Vet.', ?)`,
    [si1007.id, custAlpha.id, locRackA1.id, daysFromNow(-2)],
  );

  await run(
    `INSERT INTO serial_lifecycle_events
       (stock_item_id, serial_number, event_type,
        reference_type, reference_number, customer_id, location_id, notes, event_at)
     VALUES (?, 'TILL-SN-1007', 'dispatch',
             'dispatch', 'DISP-W-2007', ?, ?,
             'Dispatched to Alpha Vet as warranty replacement. Delivery confirmed.', ?)`,
    [si1007.id, custAlpha.id, locDispatch.id, daysFromNow(-2)],
  );

  // ── TILL-SN-1008 — scrapped ───────────────────────────────────────────────
  // Full lifecycle: received → dispatched → returned → quarantined → scrapped

  await run(
    `INSERT INTO stock_items
       (product_id, stock_location_id, actual_location_id, serial_number,
        quantity_on_hand, quantity_allocated, hold_status,
        linked_purchase_order_id, linked_purchase_order_line_id,
        customer_id,
        delivery_note_ref, dispatch_reference, dispatch_date,
        return_date, quarantine_reason,
        scrapped_date, scrapped_reason, status)
     VALUES (?, ?, NULL, 'TILL-SN-1008', 0, 0, 'scrapped', ?, ?,
             ?,
             'GR-1004A', 'DISP-1998', ?,
             ?, 'Engineering hold — motherboard failure investigation',
             ?, 'Motherboard failure: BIOS chip corroded, beyond economical repair. Supplier credit raised.', 'active')`,
    [
      pTill.id, locDispatch.id, po1004.id, pol1004Till.id,
      custHarbor.id,
      daysFromNow(-80),
      daysFromNow(-25),
      daysFromNow(-7),
    ],
  );

  const si1008 = await get(`SELECT id FROM stock_items WHERE serial_number = 'TILL-SN-1008'`);

  const lifecycleEvents1008 = [
    {
      event_type: "receipt",
      reference_type: "goods_receipt",
      reference_number: "GR-HIST-001",
      customer_id: null,
      supplier_id: supNexus.id,
      location_id: locRackA1.id,
      notes: "Received from Nexus Hardware Supply.",
      event_at: daysFromNow(-90),
    },
    {
      event_type: "dispatch",
      reference_type: "dispatch",
      reference_number: "DISP-1998",
      customer_id: custHarbor.id,
      supplier_id: null,
      location_id: locDispatch.id,
      notes: "Dispatched to Harbor Retail Ltd on sales order SO-HIST-998.",
      event_at: daysFromNow(-80),
    },
    {
      event_type: "returned",
      reference_type: "returns",
      reference_number: "RET-1998",
      customer_id: custHarbor.id,
      supplier_id: null,
      location_id: locReturns.id,
      notes: "Unit returned by Harbor Retail — completely unresponsive on boot.",
      event_at: daysFromNow(-25),
    },
    {
      event_type: "quarantined",
      reference_type: "inspection",
      reference_number: "QA-INSP-008",
      customer_id: null,
      supplier_id: null,
      location_id: locQuarantine.id,
      notes: "Engineering inspection: BIOS chip corrosion found. Held for further assessment.",
      event_at: daysFromNow(-24),
    },
    {
      event_type: "scrapped",
      reference_type: "scrap",
      reference_number: "SCRAP-008",
      customer_id: null,
      supplier_id: supNexus.id,
      location_id: null,
      notes: "Condemned — repair cost exceeds unit value. Supplier credit note requested. Unit disposed.",
      event_at: daysFromNow(-7),
    },
  ];

  for (const ev of lifecycleEvents1008) {
    await run(
      `INSERT INTO serial_lifecycle_events
         (stock_item_id, serial_number, event_type,
          reference_type, reference_number, customer_id, supplier_id, location_id, notes, event_at)
       VALUES (?, 'TILL-SN-1008', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        si1008.id,
        ev.event_type, ev.reference_type, ev.reference_number,
        ev.customer_id, ev.supplier_id, ev.location_id,
        ev.notes, ev.event_at,
      ],
    );
  }

  // ── Demo Scenario: Office Booking Flow ────────────────────────────────────
  // PO-DEMO-001  EPOS Hardware Supplies Ltd — 3 tills, 2 printers, 20 label rolls (NOT received)
  // SO-DEMO-001  Example Retail Ltd — 2 tills, 1 printer, 10 label rolls (NOT allocated)
  // User demonstrates the full receive → put-away → allocate → dispatch flow during the demo.

  const supEpos     = await get(`SELECT id FROM suppliers WHERE code = 'SUP-EPOS'`);
  const custExample = await get(`SELECT id FROM customers WHERE code = 'CUST-EXAMPLE'`);
  const pEposTill   = await get(`SELECT id FROM products  WHERE sku = 'EPOS-TILL-001'`);
  const pEposPrint  = await get(`SELECT id FROM products  WHERE sku = 'EPOS-PRINT-001'`);
  const pEposRoll   = await get(`SELECT id FROM products  WHERE sku = 'EPOS-ROLL-001'`);

  // Demo PO — ordered 3 days ago, delivery expected in 7 days, nothing received yet
  await run(
    `INSERT INTO purchase_orders
       (order_number, supplier_id, status, ordered_at, expected_at, notes)
     VALUES (?, ?, 'confirmed', ?, ?, ?)`,
    [
      "PO-DEMO-001", supEpos.id,
      daysFromNow(-3), daysFromNow(7),
      "Demo scenario: EPOS equipment order for Example Retail Ltd new store fit-out",
    ],
  );

  const poDemo = await get(`SELECT id FROM purchase_orders WHERE order_number = 'PO-DEMO-001'`);

  await run(
    `INSERT INTO purchase_order_lines
       (purchase_order_id, product_id, quantity_ordered, quantity_received, unit_cost)
     VALUES (?, ?, 3, 0, 280.00)`,
    [poDemo.id, pEposTill.id],
  );
  await run(
    `INSERT INTO purchase_order_lines
       (purchase_order_id, product_id, quantity_ordered, quantity_received, unit_cost)
     VALUES (?, ?, 2, 0, 95.00)`,
    [poDemo.id, pEposPrint.id],
  );
  await run(
    `INSERT INTO purchase_order_lines
       (purchase_order_id, product_id, quantity_ordered, quantity_received, unit_cost)
     VALUES (?, ?, 20, 0, 1.80)`,
    [poDemo.id, pEposRoll.id],
  );

  const polDemoTill  = await get(`SELECT id FROM purchase_order_lines WHERE purchase_order_id = ? AND product_id = ?`, [poDemo.id, pEposTill.id]);
  const polDemoPrint = await get(`SELECT id FROM purchase_order_lines WHERE purchase_order_id = ? AND product_id = ?`, [poDemo.id, pEposPrint.id]);
  const polDemoRoll  = await get(`SELECT id FROM purchase_order_lines WHERE purchase_order_id = ? AND product_id = ?`, [poDemo.id, pEposRoll.id]);

  // Demo SO — raised 2 days ago, dispatch due in 5 days, nothing allocated yet
  await run(
    `INSERT INTO sales_orders
       (order_number, customer_id, status, requested_at, dispatch_due_at, notes, priority)
     VALUES (?, ?, 'confirmed', ?, ?, ?, 'normal')`,
    [
      "SO-DEMO-001", custExample.id,
      daysFromNow(-2), daysFromNow(5),
      "Demo scenario: EPOS kit for Example Retail Ltd new store — partial delivery from PO-DEMO-001",
    ],
  );

  const soDemo = await get(`SELECT id FROM sales_orders WHERE order_number = 'SO-DEMO-001'`);

  await run(
    `INSERT INTO sales_order_lines
       (sales_order_id, product_id, quantity_ordered, quantity_allocated, quantity_dispatched)
     VALUES (?, ?, 2, 0, 0)`,
    [soDemo.id, pEposTill.id],
  );
  await run(
    `INSERT INTO sales_order_lines
       (sales_order_id, product_id, quantity_ordered, quantity_allocated, quantity_dispatched)
     VALUES (?, ?, 1, 0, 0)`,
    [soDemo.id, pEposPrint.id],
  );
  await run(
    `INSERT INTO sales_order_lines
       (sales_order_id, product_id, quantity_ordered, quantity_allocated, quantity_dispatched)
     VALUES (?, ?, 10, 0, 0)`,
    [soDemo.id, pEposRoll.id],
  );

  const solDemoTill  = await get(`SELECT id FROM sales_order_lines WHERE sales_order_id = ? AND product_id = ?`, [soDemo.id, pEposTill.id]);
  const solDemoPrint = await get(`SELECT id FROM sales_order_lines WHERE sales_order_id = ? AND product_id = ?`, [soDemo.id, pEposPrint.id]);
  const solDemoRoll  = await get(`SELECT id FROM sales_order_lines WHERE sales_order_id = ? AND product_id = ?`, [soDemo.id, pEposRoll.id]);

  // Link PO lines to SO lines so the suggestion engine highlights "Linked to this purchase order"
  await run(
    `INSERT INTO purchase_sales_links (purchase_order_line_id, sales_order_line_id, quantity_linked)
     VALUES (?, ?, 2)`,
    [polDemoTill.id, solDemoTill.id],
  );
  await run(
    `INSERT INTO purchase_sales_links (purchase_order_line_id, sales_order_line_id, quantity_linked)
     VALUES (?, ?, 1)`,
    [polDemoPrint.id, solDemoPrint.id],
  );
  await run(
    `INSERT INTO purchase_sales_links (purchase_order_line_id, sales_order_line_id, quantity_linked)
     VALUES (?, ?, 10)`,
    [polDemoRoll.id, solDemoRoll.id],
  );

  console.log("  ✓ Purchase orders:  PO-1001 (Overdue), PO-1002 (Part Recv'd), PO-1003 (Open), PO-1004 (Fully Recv'd)");
  console.log("  ✓ Sales orders:     SO-2001 (Urgent), SO-2002 (Dispatch Ready), SO-2003 (Open)");
  console.log("  ✓ Serial numbers:   TILL-SN-1001 (available), TILL-SN-1002 (allocated), TILL-SN-1003 (dispatched), TILL-SN-1004 (received)");
  console.log("  ✓ Lifecycle serials: TILL-SN-1005 (quarantined), TILL-SN-1006 (returned), TILL-SN-1007 (warranty replacement), TILL-SN-1008 (scrapped)");
  console.log("  ✓ Qty stock:        30× LABEL-001 awaiting allocation");
  console.log("  ✓ Demo scenario:    PO-DEMO-001 (open, not received) + SO-DEMO-001 (open, not allocated) — ready for office booking demo");
}

module.exports = { seedDemoData };
