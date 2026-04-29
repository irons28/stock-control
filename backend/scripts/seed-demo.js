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
  const locHold     = await get(`SELECT id FROM stock_locations WHERE code = 'HOLD'`);
  const locConsumables = await get(`SELECT id FROM stock_locations WHERE code = 'CONSUMABLES'`);
  const locDispatch = await get(`SELECT id FROM stock_locations WHERE code = 'DISPATCH'`);
  const locRackA1   = await get(`SELECT id FROM stock_locations WHERE code = 'RACK-A1'`);

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

  // LABEL-001 qty stock — 30 units received, awaiting allocation
  await run(
    `INSERT INTO stock_items
       (product_id, stock_location_id, actual_location_id, serial_number,
        quantity_on_hand, quantity_allocated, hold_status,
        linked_purchase_order_id, linked_purchase_order_line_id, status)
     VALUES (?, ?, ?, NULL, 30, 0, 'received', ?, ?, 'active')`,
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

  console.log("  ✓ Purchase orders:  PO-1001 (Overdue), PO-1002 (Part Recv'd), PO-1003 (Open), PO-1004 (Fully Recv'd)");
  console.log("  ✓ Sales orders:     SO-2001 (Urgent), SO-2002 (Dispatch Ready), SO-2003 (Open)");
  console.log("  ✓ Serial numbers:   TILL-SN-1001 (available), TILL-SN-1002 (allocated), TILL-SN-1003 (dispatched), TILL-SN-1004 (received)");
  console.log("  ✓ Qty stock:        30× LABEL-001 awaiting allocation");
}

module.exports = { seedDemoData };
