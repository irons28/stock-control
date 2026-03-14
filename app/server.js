const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
const { createImportTools } = require("./import-tools");

const app = express();
const PORT = process.env.PORT || 3001;
const DB_PATH = path.join(__dirname, "stock-control.db");

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const io = new Server(server);

function emitInventoryEvent(type, payload) {
  io.emit("stock_control:update", { type, payload, timestamp: new Date().toISOString() });
}

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error("Database connection error:", err);
    return;
  }
  console.log(`Connected to stock control database at ${DB_PATH}`);
});

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

async function transaction(work) {
  await run("BEGIN TRANSACTION");
  try {
    const result = await work();
    await run("COMMIT");
    return result;
  } catch (error) {
    try {
      await run("ROLLBACK");
    } catch {
      // keep original error
    }
    throw error;
  }
}

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-");
}

function parseInteger(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseMoney(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseJsonMaybe(value, fallback) {
  if (Array.isArray(value)) return value;
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseSerialNumbers(value) {
  return String(value || "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function requestError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function initDatabase() {
  await run(`PRAGMA foreign_keys = ON`);

  await run(`CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    contact_name TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    address TEXT DEFAULT '',
    account_reference TEXT DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    contact_name TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    address TEXT DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS product_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    notes TEXT DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    category_id INTEGER,
    barcode TEXT DEFAULT '',
    serial_tracking INTEGER NOT NULL DEFAULT 0,
    unit_of_measure TEXT NOT NULL DEFAULT 'each',
    cost_price REAL NOT NULL DEFAULT 0,
    sell_price REAL NOT NULL DEFAULT 0,
    supplier_id INTEGER,
    reorder_level INTEGER NOT NULL DEFAULT 0,
    tax_flag INTEGER NOT NULL DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES product_categories(id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number TEXT NOT NULL UNIQUE,
    supplier_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'ordered',
    ordered_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expected_at TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS purchase_order_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    qty_ordered INTEGER NOT NULL,
    qty_received INTEGER NOT NULL DEFAULT 0,
    unit_cost REAL NOT NULL DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS goods_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_order_id INTEGER NOT NULL,
    receipt_number TEXT NOT NULL UNIQUE,
    received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    received_by TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS goods_receipt_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goods_receipt_id INTEGER NOT NULL,
    purchase_order_line_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    qty_received INTEGER NOT NULL,
    target_location_id INTEGER NOT NULL,
    serial_numbers TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (goods_receipt_id) REFERENCES goods_receipts(id),
    FOREIGN KEY (purchase_order_line_id) REFERENCES purchase_order_lines(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (target_location_id) REFERENCES locations(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS sales_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT NOT NULL UNIQUE,
    customer_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    ordered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS sales_order_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sales_order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    qty_ordered INTEGER NOT NULL,
    qty_allocated INTEGER NOT NULL DEFAULT 0,
    qty_dispatched INTEGER NOT NULL DEFAULT 0,
    unit_price REAL NOT NULL DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS sales_order_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sales_order_line_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    location_id INTEGER,
    qty INTEGER NOT NULL DEFAULT 0,
    serial_number TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'allocated',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sales_order_line_id) REFERENCES sales_order_lines(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (location_id) REFERENCES locations(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS dispatches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sales_order_id INTEGER NOT NULL,
    dispatch_number TEXT NOT NULL UNIQUE,
    dispatched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    dispatched_by TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS dispatch_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dispatch_id INTEGER NOT NULL,
    sales_order_line_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    qty_dispatched INTEGER NOT NULL,
    serial_numbers TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (dispatch_id) REFERENCES dispatches(id),
    FOREIGN KEY (sales_order_line_id) REFERENCES sales_order_lines(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS inventory_balances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    location_id INTEGER NOT NULL,
    qty_on_hand INTEGER NOT NULL DEFAULT 0,
    qty_allocated INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, location_id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (location_id) REFERENCES locations(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS inventory_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    serial_number TEXT NOT NULL UNIQUE,
    current_location_id INTEGER,
    status TEXT NOT NULL DEFAULT 'available',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (current_location_id) REFERENCES locations(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    movement_type TEXT NOT NULL,
    qty INTEGER NOT NULL DEFAULT 0,
    serial_number TEXT DEFAULT '',
    from_location_id INTEGER,
    to_location_id INTEGER,
    reference_type TEXT DEFAULT '',
    reference_id TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT DEFAULT 'system',
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (from_location_id) REFERENCES locations(id),
    FOREIGN KEY (to_location_id) REFERENCES locations(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    location_id INTEGER,
    adjustment_type TEXT NOT NULL,
    qty INTEGER NOT NULL DEFAULT 0,
    serial_numbers TEXT DEFAULT '',
    reason TEXT NOT NULL,
    notes TEXT DEFAULT '',
    adjusted_by TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (location_id) REFERENCES locations(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS import_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_type TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'success',
    total_rows INTEGER NOT NULL DEFAULT 0,
    valid_rows INTEGER NOT NULL DEFAULT 0,
    invalid_rows INTEGER NOT NULL DEFAULT 0,
    created_count INTEGER NOT NULL DEFAULT 0,
    updated_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT DEFAULT '',
    details TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  for (const name of ["EPOS", "Printing", "Scanning", "Payments", "Labels", "Accessories"]) {
    await run(`INSERT OR IGNORE INTO product_categories (name) VALUES (?)`, [name]);
  }

  for (const [code, name, type, notes] of [
    ["GOODS-IN", "Goods In", "holding", "Arrival point before checking stock"],
    ["HOLDING", "Holding", "holding", "Temporary stock location before putaway"],
    ["SHELF-A1", "Shelf A1", "shelf", "Primary shelf location"],
    ["BIN-01", "Bin 01", "bin", "Small parts bin"],
    ["DISPATCH", "Dispatch", "dispatch", "Packed orders waiting to leave"],
    ["DAMAGED", "Damaged", "damaged", "Damaged or quarantined stock"],
  ]) {
    await run(`INSERT OR IGNORE INTO locations (code, name, type, notes) VALUES (?, ?, ?, ?)`, [code, name, type, notes]);
  }
}

function mapProductInput(body) {
  const sku = normalizeCode(body.sku);
  const name = String(body.name || "").trim();
  if (!sku || !name) throw requestError("SKU and product name are required");
  return {
    sku,
    name,
    description: String(body.description || "").trim(),
    category_id: body.category_id ? parseInteger(body.category_id, null) : null,
    barcode: String(body.barcode || "").trim(),
    serial_tracking: body.serial_tracking ? 1 : 0,
    unit_of_measure: String(body.unit_of_measure || "each").trim() || "each",
    cost_price: parseMoney(body.cost_price, 0),
    sell_price: parseMoney(body.sell_price, 0),
    supplier_id: body.supplier_id ? parseInteger(body.supplier_id, null) : null,
    reorder_level: parseInteger(body.reorder_level, 0),
    tax_flag: body.tax_flag === false ? 0 : 1,
    is_active: body.is_active === false ? 0 : 1,
  };
}

function mapSupplierInput(body) {
  const name = String(body.name || "").trim();
  if (!name) throw requestError("Supplier name is required");
  return {
    name,
    contact_name: String(body.contact_name || "").trim(),
    phone: String(body.phone || "").trim(),
    email: String(body.email || "").trim(),
    address: String(body.address || "").trim(),
    account_reference: String(body.account_reference || "").trim(),
    is_active: body.is_active === false ? 0 : 1,
  };
}

function mapCustomerInput(body) {
  const name = String(body.name || "").trim();
  if (!name) throw requestError("Customer name is required");
  return {
    name,
    contact_name: String(body.contact_name || "").trim(),
    phone: String(body.phone || "").trim(),
    email: String(body.email || "").trim(),
    address: String(body.address || "").trim(),
    is_active: body.is_active === false ? 0 : 1,
  };
}

function mapLocationInput(body) {
  const code = normalizeCode(body.code);
  const name = String(body.name || "").trim();
  const type = normalizeCode(body.type || "shelf").toLowerCase();
  if (!code || !name || !type) throw requestError("Location code, name, and type are required");
  return {
    code,
    name,
    type,
    notes: String(body.notes || "").trim(),
    is_active: body.is_active === false ? 0 : 1,
  };
}

function mapPurchaseOrderInput(body) {
  const poNumber = normalizeCode(body.po_number);
  const supplierId = parseInteger(body.supplier_id, 0);
  const lines = parseJsonMaybe(body.lines, []);
  if (!poNumber) throw requestError("PO number is required");
  if (!supplierId) throw requestError("Supplier is required");
  if (!Array.isArray(lines) || !lines.length) throw requestError("At least one purchase order line is required");
  return {
    po_number: poNumber,
    supplier_id: supplierId,
    expected_at: String(body.expected_at || "").trim(),
    notes: String(body.notes || "").trim(),
    lines: lines.map((line) => {
      const productId = parseInteger(line.product_id, 0);
      const qtyOrdered = parseInteger(line.qty_ordered, 0);
      if (!productId || qtyOrdered <= 0) throw requestError("Each purchase order line needs a product and quantity");
      return { product_id: productId, qty_ordered: qtyOrdered, unit_cost: parseMoney(line.unit_cost, 0), notes: String(line.notes || "").trim() };
    }),
  };
}

function mapSalesOrderInput(body) {
  const orderNumber = normalizeCode(body.order_number);
  const customerId = parseInteger(body.customer_id, 0);
  const lines = parseJsonMaybe(body.lines, []);
  if (!orderNumber) throw requestError("Order number is required");
  if (!customerId) throw requestError("Customer is required");
  if (!Array.isArray(lines) || !lines.length) throw requestError("At least one sales order line is required");
  return {
    order_number: orderNumber,
    customer_id: customerId,
    notes: String(body.notes || "").trim(),
    lines: lines.map((line) => {
      const productId = parseInteger(line.product_id, 0);
      const qtyOrdered = parseInteger(line.qty_ordered, 0);
      if (!productId || qtyOrdered <= 0) throw requestError("Each sales order line needs a product and quantity");
      return { product_id: productId, qty_ordered: qtyOrdered, unit_price: parseMoney(line.unit_price, 0), notes: String(line.notes || "").trim() };
    }),
  };
}

async function createActivity(entityType, entityId, action, details) {
  await run(`INSERT INTO activity_log (entity_type, entity_id, action, details) VALUES (?, ?, ?, ?)`, [entityType, String(entityId), action, details ? JSON.stringify(details) : ""]);
}

async function getLocationByCode(code) {
  return get(`SELECT * FROM locations WHERE code = ? LIMIT 1`, [normalizeCode(code)]);
}

async function updateInventoryBalance(productId, locationId, qtyDelta, allocatedDelta = 0) {
  const existing = await get(`SELECT * FROM inventory_balances WHERE product_id = ? AND location_id = ?`, [productId, locationId]);
  if (!existing) {
    if (qtyDelta < 0 || allocatedDelta < 0) throw requestError("Cannot reduce stock below zero", 409);
    await run(`INSERT INTO inventory_balances (product_id, location_id, qty_on_hand, qty_allocated, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`, [productId, locationId, qtyDelta, allocatedDelta]);
    return;
  }
  const nextOnHand = Number(existing.qty_on_hand || 0) + qtyDelta;
  const nextAllocated = Number(existing.qty_allocated || 0) + allocatedDelta;
  if (nextOnHand < 0 || nextAllocated < 0) throw requestError("Cannot reduce stock below zero", 409);
  await run(`UPDATE inventory_balances SET qty_on_hand = ?, qty_allocated = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [nextOnHand, nextAllocated, existing.id]);
}

async function refreshPurchaseOrderStatus(purchaseOrderId) {
  const stats = await get(`SELECT COALESCE(SUM(qty_ordered),0) AS qty_ordered, COALESCE(SUM(qty_received),0) AS qty_received, COUNT(*) AS line_count FROM purchase_order_lines WHERE purchase_order_id = ?`, [purchaseOrderId]);
  let status = "ordered";
  if (!stats || Number(stats.line_count || 0) === 0) status = "draft";
  else if (Number(stats.qty_received || 0) <= 0) status = "ordered";
  else if (Number(stats.qty_received || 0) >= Number(stats.qty_ordered || 0)) status = "received";
  else status = "part_received";
  await run(`UPDATE purchase_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [status, purchaseOrderId]);
  return status;
}

async function refreshSalesOrderLineTotals(lineId) {
  const totals = await get(`SELECT COALESCE(SUM(CASE WHEN status = 'allocated' THEN qty ELSE 0 END),0) AS qty_allocated, COALESCE(SUM(CASE WHEN status = 'dispatched' THEN qty ELSE 0 END),0) AS qty_dispatched FROM sales_order_allocations WHERE sales_order_line_id = ?`, [lineId]);
  await run(`UPDATE sales_order_lines SET qty_allocated = ?, qty_dispatched = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [Number(totals?.qty_allocated || 0), Number(totals?.qty_dispatched || 0), lineId]);
}

async function refreshSalesOrderStatus(salesOrderId) {
  const stats = await get(`SELECT COALESCE(SUM(qty_ordered),0) AS qty_ordered, COALESCE(SUM(qty_allocated),0) AS qty_allocated, COALESCE(SUM(qty_dispatched),0) AS qty_dispatched, COUNT(*) AS line_count FROM sales_order_lines WHERE sales_order_id = ?`, [salesOrderId]);
  let status = "draft";
  if (!stats || Number(stats.line_count || 0) === 0) status = "draft";
  else if (Number(stats.qty_dispatched || 0) >= Number(stats.qty_ordered || 0)) status = "dispatched";
  else if (Number(stats.qty_dispatched || 0) > 0) status = "part_dispatched";
  else if (Number(stats.qty_allocated || 0) > 0) status = "allocated";
  await run(`UPDATE sales_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [status, salesOrderId]);
  return status;
}

async function getPurchaseOrdersWithLines() {
  const orders = await all(`SELECT po.*, s.name AS supplier_name, COALESCE(SUM(pol.qty_ordered),0) AS total_ordered, COALESCE(SUM(pol.qty_received),0) AS total_received, COUNT(pol.id) AS line_count FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id LEFT JOIN purchase_order_lines pol ON pol.purchase_order_id = po.id GROUP BY po.id ORDER BY datetime(po.created_at) DESC, po.id DESC`);
  if (!orders.length) return [];
  const lines = await all(`SELECT pol.*, p.sku, p.name AS product_name, p.serial_tracking FROM purchase_order_lines pol JOIN products p ON p.id = pol.product_id ORDER BY pol.id ASC`);
  const linesByOrder = new Map();
  for (const line of lines) {
    const key = Number(line.purchase_order_id);
    if (!linesByOrder.has(key)) linesByOrder.set(key, []);
    linesByOrder.get(key).push({ ...line, qty_remaining: Math.max(0, Number(line.qty_ordered || 0) - Number(line.qty_received || 0)) });
  }
  return orders.map((order) => ({ ...order, lines: linesByOrder.get(Number(order.id)) || [] }));
}

async function getSalesOrdersWithLines() {
  const orders = await all(`SELECT so.*, c.name AS customer_name, COALESCE(SUM(sol.qty_ordered),0) AS total_ordered, COALESCE(SUM(sol.qty_allocated),0) AS total_allocated, COALESCE(SUM(sol.qty_dispatched),0) AS total_dispatched, COUNT(sol.id) AS line_count FROM sales_orders so JOIN customers c ON c.id = so.customer_id LEFT JOIN sales_order_lines sol ON sol.sales_order_id = so.id GROUP BY so.id ORDER BY datetime(so.created_at) DESC, so.id DESC`);
  if (!orders.length) return [];
  const lines = await all(`SELECT sol.*, p.sku, p.name AS product_name, p.serial_tracking FROM sales_order_lines sol JOIN products p ON p.id = sol.product_id ORDER BY sol.id ASC`);
  const allocations = await all(`SELECT soa.*, l.code AS location_code FROM sales_order_allocations soa LEFT JOIN locations l ON l.id = soa.location_id ORDER BY soa.id ASC`);
  const allocationsByLine = new Map();
  for (const allocation of allocations) {
    const key = Number(allocation.sales_order_line_id);
    if (!allocationsByLine.has(key)) allocationsByLine.set(key, []);
    allocationsByLine.get(key).push(allocation);
  }
  const linesByOrder = new Map();
  for (const line of lines) {
    const key = Number(line.sales_order_id);
    if (!linesByOrder.has(key)) linesByOrder.set(key, []);
    linesByOrder.get(key).push({ ...line, qty_remaining_to_allocate: Math.max(0, Number(line.qty_ordered || 0) - Number(line.qty_allocated || 0) - Number(line.qty_dispatched || 0)), allocations: allocationsByLine.get(Number(line.id)) || [] });
  }
  return orders.map((order) => ({ ...order, lines: linesByOrder.get(Number(order.id)) || [] }));
}

async function getGoodsReceiptsList() {
  return all(`SELECT gr.*, po.po_number, s.name AS supplier_name, grl.qty_received, p.sku, p.name AS product_name, l.code AS target_location_code FROM goods_receipts gr JOIN purchase_orders po ON po.id = gr.purchase_order_id JOIN suppliers s ON s.id = po.supplier_id JOIN goods_receipt_lines grl ON grl.goods_receipt_id = gr.id JOIN products p ON p.id = grl.product_id JOIN locations l ON l.id = grl.target_location_id ORDER BY datetime(gr.received_at) DESC, gr.id DESC, grl.id DESC LIMIT 40`);
}

async function getDispatchesList() {
  return all(`SELECT d.*, so.order_number, c.name AS customer_name, dl.qty_dispatched, p.sku, p.name AS product_name FROM dispatches d JOIN sales_orders so ON so.id = d.sales_order_id JOIN customers c ON c.id = so.customer_id JOIN dispatch_lines dl ON dl.dispatch_id = d.id JOIN products p ON p.id = dl.product_id ORDER BY datetime(d.dispatched_at) DESC, d.id DESC, dl.id DESC LIMIT 40`);
}

async function getHoldingStock() {
  const holding = await getLocationByCode("HOLDING");
  if (!holding) return [];
  const quantityRows = await all(`SELECT p.id AS product_id, p.sku, p.name, p.serial_tracking, b.qty_on_hand, l.code AS location_code FROM inventory_balances b JOIN products p ON p.id = b.product_id JOIN locations l ON l.id = b.location_id WHERE l.id = ? AND b.qty_on_hand > 0 ORDER BY p.name ASC`, [holding.id]);
  const serialRows = await all(`SELECT p.id AS product_id, p.sku, p.name, p.serial_tracking, iu.serial_number, l.code AS location_code FROM inventory_units iu JOIN products p ON p.id = iu.product_id JOIN locations l ON l.id = iu.current_location_id WHERE l.id = ? AND iu.status IN ('in_holding','available') ORDER BY p.name ASC, iu.serial_number ASC`, [holding.id]);
  const byProduct = new Map();
  for (const row of quantityRows) {
    byProduct.set(Number(row.product_id), { product_id: row.product_id, sku: row.sku, name: row.name, serial_tracking: Number(row.serial_tracking || 0), location_code: row.location_code, qty_in_holding: Number(row.qty_on_hand || 0), serial_numbers: [] });
  }
  for (const row of serialRows) {
    const key = Number(row.product_id);
    if (!byProduct.has(key)) byProduct.set(key, { product_id: row.product_id, sku: row.sku, name: row.name, serial_tracking: Number(row.serial_tracking || 0), location_code: row.location_code, qty_in_holding: 0, serial_numbers: [] });
    const entry = byProduct.get(key);
    entry.serial_numbers.push(row.serial_number);
    entry.qty_in_holding += 1;
  }
  return Array.from(byProduct.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

async function getStockMovementsList() {
  return all(`SELECT sm.*, p.sku, p.name AS product_name, lf.code AS from_location_code, lt.code AS to_location_code FROM stock_movements sm JOIN products p ON p.id = sm.product_id LEFT JOIN locations lf ON lf.id = sm.from_location_id LEFT JOIN locations lt ON lt.id = sm.to_location_id ORDER BY datetime(sm.created_at) DESC, sm.id DESC LIMIT 80`);
}

async function getAdjustmentsList() {
  return all(`SELECT a.*, p.sku, p.name AS product_name, l.code AS location_code FROM adjustments a JOIN products p ON p.id = a.product_id LEFT JOIN locations l ON l.id = a.location_id ORDER BY datetime(a.created_at) DESC, a.id DESC LIMIT 40`);
}

async function getStockByLocationReport() {
  const quantity = await all(`SELECT l.code AS location_code, l.name AS location_name, p.sku, p.name AS product_name, b.qty_on_hand, b.qty_allocated, (b.qty_on_hand - b.qty_allocated) AS qty_available, '' AS serial_number FROM inventory_balances b JOIN products p ON p.id = b.product_id JOIN locations l ON l.id = b.location_id WHERE b.qty_on_hand > 0 ORDER BY l.code ASC, p.name ASC`);
  const serialised = await all(`SELECT COALESCE(l.code, '-') AS location_code, COALESCE(l.name, '-') AS location_name, p.sku, p.name AS product_name, 1 AS qty_on_hand, CASE WHEN iu.status = 'allocated' THEN 1 ELSE 0 END AS qty_allocated, CASE WHEN iu.status = 'available' THEN 1 ELSE 0 END AS qty_available, iu.serial_number FROM inventory_units iu JOIN products p ON p.id = iu.product_id LEFT JOIN locations l ON l.id = iu.current_location_id WHERE iu.status IN ('in_holding','available','allocated') ORDER BY location_code ASC, p.name ASC, iu.serial_number ASC`);
  return { quantity, serialised };
}

async function getOrderSummaryReport() {
  const purchase = await all(`SELECT po.po_number AS reference, 'purchase' AS kind, po.status, s.name AS party_name, po.created_at, COALESCE(SUM(pol.qty_ordered),0) AS qty_ordered, COALESCE(SUM(pol.qty_received),0) AS qty_progress FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id LEFT JOIN purchase_order_lines pol ON pol.purchase_order_id = po.id GROUP BY po.id ORDER BY datetime(po.created_at) DESC LIMIT 20`);
  const sales = await all(`SELECT so.order_number AS reference, 'sales' AS kind, so.status, c.name AS party_name, so.created_at, COALESCE(SUM(sol.qty_ordered),0) AS qty_ordered, COALESCE(SUM(sol.qty_dispatched),0) AS qty_progress FROM sales_orders so JOIN customers c ON c.id = so.customer_id LEFT JOIN sales_order_lines sol ON sol.sales_order_id = so.id GROUP BY so.id ORDER BY datetime(so.created_at) DESC LIMIT 20`);
  return { purchase, sales };
}

async function getImportRuns(limit = 20) {
  return all(`SELECT * FROM import_runs ORDER BY datetime(created_at) DESC, id DESC LIMIT ?`, [limit]);
}

async function getMigrationReconciliation() {
  const [
    products, suppliers, customers, locations, openPurchaseOrders, openSalesOrders,
    quantityStock, serialStock, serialAvailable, serialAllocated, serialHolding,
    productsMissingSupplier, serialProducts, requiredLocationsRaw, importRuns,
    locationTypes, pendingPoLines, allocatedQuantityStock
  ] = await Promise.all([
    get(`SELECT COUNT(*) AS count FROM products WHERE is_active = 1`),
    get(`SELECT COUNT(*) AS count FROM suppliers WHERE is_active = 1`),
    get(`SELECT COUNT(*) AS count FROM customers WHERE is_active = 1`),
    get(`SELECT COUNT(*) AS count FROM locations WHERE is_active = 1`),
    get(`SELECT COUNT(*) AS count FROM purchase_orders WHERE status IN ('ordered','part_received')`),
    get(`SELECT COUNT(*) AS count FROM sales_orders WHERE status IN ('draft','allocated','part_dispatched')`),
    get(`SELECT COALESCE(SUM(qty_on_hand),0) AS count FROM inventory_balances`),
    get(`SELECT COUNT(*) AS count FROM inventory_units WHERE status IN ('in_holding','available','allocated','damaged')`),
    get(`SELECT COUNT(*) AS count FROM inventory_units WHERE status = 'available'`),
    get(`SELECT COUNT(*) AS count FROM inventory_units WHERE status = 'allocated'`),
    get(`SELECT COUNT(*) AS count FROM inventory_units WHERE status = 'in_holding'`),
    get(`SELECT COUNT(*) AS count FROM products WHERE is_active = 1 AND supplier_id IS NULL`),
    get(`SELECT COUNT(*) AS count FROM products WHERE is_active = 1 AND serial_tracking = 1`),
    all(`SELECT code FROM locations WHERE code IN ('GOODS-IN','HOLDING','DISPATCH','DAMAGED') ORDER BY code ASC`),
    getImportRuns(8),
    all(`SELECT type, COUNT(*) AS count FROM locations WHERE is_active = 1 GROUP BY type ORDER BY type ASC`),
    get(`SELECT COUNT(*) AS count FROM purchase_order_lines WHERE qty_received < qty_ordered`),
    get(`SELECT COALESCE(SUM(qty_allocated),0) AS count FROM inventory_balances`),
  ]);

  const requiredLocations = ['GOODS-IN', 'HOLDING', 'DISPATCH', 'DAMAGED'];
  const presentLocations = new Set(requiredLocationsRaw.map((row) => row.code));
  const missingLocations = requiredLocations.filter((code) => !presentLocations.has(code));
  const warnings = [];
  if ((products?.count || 0) === 0) warnings.push('No active products loaded');
  if ((suppliers?.count || 0) === 0) warnings.push('No active suppliers loaded');
  if (missingLocations.length) warnings.push(`Required locations missing: ${missingLocations.join(', ')}`);
  if ((productsMissingSupplier?.count || 0) > 0) warnings.push(`${productsMissingSupplier.count} active products do not have a default supplier`);
  if ((serialProducts?.count || 0) > 0 && (serialStock?.count || 0) === 0) warnings.push('Serial-tracked products exist but no serial stock has been imported');
  if ((pendingPoLines?.count || 0) > 0 && (openPurchaseOrders?.count || 0) === 0) warnings.push('Purchase order lines show outstanding stock but there are no open purchase orders');

  const latestImportAt = importRuns[0]?.created_at || '';
  const goLiveReady = warnings.length === 0 && (products?.count || 0) > 0 && (suppliers?.count || 0) > 0 && missingLocations.length === 0;

  return {
    go_live_ready: goLiveReady,
    latest_import_at: latestImportAt,
    warnings,
    totals: {
      products: products?.count || 0,
      suppliers: suppliers?.count || 0,
      customers: customers?.count || 0,
      locations: locations?.count || 0,
      open_purchase_orders: openPurchaseOrders?.count || 0,
      open_sales_orders: openSalesOrders?.count || 0,
      quantity_stock_on_hand: quantityStock?.count || 0,
      quantity_stock_allocated: allocatedQuantityStock?.count || 0,
      serial_stock_on_hand: serialStock?.count || 0,
      serial_available: serialAvailable?.count || 0,
      serial_allocated: serialAllocated?.count || 0,
      serial_in_holding: serialHolding?.count || 0,
      products_missing_supplier: productsMissingSupplier?.count || 0,
    },
    location_types: locationTypes,
    required_locations: requiredLocations.map((code) => ({ code, present: presentLocations.has(code) })),
    recent_imports: importRuns,
  };
}

createImportTools({
  app,
  get,
  all,
  run,
  transaction,
  normalizeCode,
  parseInteger,
  parseMoney,
  requestError,
  createActivity,
  emitInventoryEvent,
  getLocationByCode,
  refreshPurchaseOrderStatus,
  rootDir: __dirname,
});

app.get("/api/health", async (req, res, next) => {
  try {
    const counts = await Promise.all([
      get(`SELECT COUNT(*) AS count FROM products`),
      get(`SELECT COUNT(*) AS count FROM suppliers`),
      get(`SELECT COUNT(*) AS count FROM locations`),
      get(`SELECT COUNT(*) AS count FROM purchase_orders`),
      get(`SELECT COUNT(*) AS count FROM goods_receipts`),
      get(`SELECT COUNT(*) AS count FROM sales_orders`),
      get(`SELECT COUNT(*) AS count FROM dispatches`),
      get(`SELECT COUNT(*) AS count FROM adjustments`),
    ]);
    res.json({ ok: true, products: counts[0]?.count || 0, suppliers: counts[1]?.count || 0, locations: counts[2]?.count || 0, purchase_orders: counts[3]?.count || 0, goods_receipts: counts[4]?.count || 0, sales_orders: counts[5]?.count || 0, dispatches: counts[6]?.count || 0, adjustments: counts[7]?.count || 0 });
  } catch (error) {
    next(error);
  }
});

app.get("/api/dashboard", async (req, res, next) => {
  try {
    const [products, suppliers, locations, customers, openPurchaseOrders, openSalesOrders, holdingBalances, holdingUnits, adjustments, lowStock] = await Promise.all([
      get(`SELECT COUNT(*) AS count FROM products WHERE is_active = 1`),
      get(`SELECT COUNT(*) AS count FROM suppliers WHERE is_active = 1`),
      get(`SELECT COUNT(*) AS count FROM locations WHERE is_active = 1`),
      get(`SELECT COUNT(*) AS count FROM customers WHERE is_active = 1`),
      get(`SELECT COUNT(*) AS count FROM purchase_orders WHERE status IN ('ordered','part_received')`),
      get(`SELECT COUNT(*) AS count FROM sales_orders WHERE status IN ('draft','allocated','part_dispatched')`),
      get(`SELECT COALESCE(SUM(b.qty_on_hand),0) AS count FROM inventory_balances b JOIN locations l ON l.id = b.location_id WHERE l.code = 'HOLDING'`),
      get(`SELECT COUNT(*) AS count FROM inventory_units iu JOIN locations l ON l.id = iu.current_location_id WHERE l.code = 'HOLDING' AND iu.status IN ('in_holding','available')`),
      get(`SELECT COUNT(*) AS count FROM adjustments`),
      all(`SELECT p.id, p.sku, p.name, p.reorder_level, COALESCE(balance.qty_available,0) + COALESCE(serials.qty_available,0) AS available_qty FROM products p LEFT JOIN (SELECT product_id, SUM(qty_on_hand - qty_allocated) AS qty_available FROM inventory_balances GROUP BY product_id) balance ON balance.product_id = p.id LEFT JOIN (SELECT product_id, SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) AS qty_available FROM inventory_units GROUP BY product_id) serials ON serials.product_id = p.id WHERE p.is_active = 1 GROUP BY p.id HAVING p.reorder_level > 0 AND available_qty <= p.reorder_level ORDER BY available_qty ASC, p.name ASC LIMIT 8`),
    ]);
    res.json({ totals: { products: products?.count || 0, suppliers: suppliers?.count || 0, locations: locations?.count || 0, customers: customers?.count || 0, openPurchaseOrders: openPurchaseOrders?.count || 0, openSalesOrders: openSalesOrders?.count || 0, holdingStock: (holdingBalances?.count || 0) + (holdingUnits?.count || 0), adjustments: adjustments?.count || 0 }, lowStock, nextMilestones: ["Inbound, putaway, and dispatch are working", "Import validation and apply tools are live", "Migration reconciliation is the current go-live checkpoint"] });
  } catch (error) {
    next(error);
  }
});

app.get("/api/categories", async (req, res, next) => { try { res.json(await all(`SELECT * FROM product_categories ORDER BY name ASC`)); } catch (error) { next(error); } });
app.get("/api/suppliers", async (req, res, next) => { try { res.json(await all(`SELECT * FROM suppliers ORDER BY name ASC`)); } catch (error) { next(error); } });
app.get("/api/customers", async (req, res, next) => { try { res.json(await all(`SELECT * FROM customers ORDER BY name ASC`)); } catch (error) { next(error); } });
app.get("/api/locations", async (req, res, next) => { try { res.json(await all(`SELECT * FROM locations ORDER BY code ASC`)); } catch (error) { next(error); } });
app.get("/api/products", async (req, res, next) => {
  try {
    res.json(await all(`SELECT p.*, c.name AS category_name, s.name AS supplier_name, COALESCE(balance.qty_on_hand,0) + COALESCE(serials.qty_on_hand,0) AS qty_on_hand, COALESCE(balance.qty_allocated,0) + COALESCE(serials.qty_allocated,0) AS qty_allocated, COALESCE(balance.qty_available,0) + COALESCE(serials.qty_available,0) AS qty_available FROM products p LEFT JOIN product_categories c ON c.id = p.category_id LEFT JOIN suppliers s ON s.id = p.supplier_id LEFT JOIN (SELECT product_id, SUM(qty_on_hand) AS qty_on_hand, SUM(qty_allocated) AS qty_allocated, SUM(qty_on_hand - qty_allocated) AS qty_available FROM inventory_balances GROUP BY product_id) balance ON balance.product_id = p.id LEFT JOIN (SELECT product_id, SUM(CASE WHEN status IN ('in_holding','available','allocated') THEN 1 ELSE 0 END) AS qty_on_hand, SUM(CASE WHEN status = 'allocated' THEN 1 ELSE 0 END) AS qty_allocated, SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) AS qty_available FROM inventory_units GROUP BY product_id) serials ON serials.product_id = p.id ORDER BY p.name ASC`));
  } catch (error) { next(error); }
});

app.post("/api/suppliers", async (req, res, next) => {
  try {
    const input = mapSupplierInput(req.body || {});
    const result = await run(`INSERT INTO suppliers (name, contact_name, phone, email, address, account_reference, is_active, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`, [input.name, input.contact_name, input.phone, input.email, input.address, input.account_reference, input.is_active]);
    const row = await get(`SELECT * FROM suppliers WHERE id = ?`, [result.id]);
    await createActivity("supplier", result.id, "created", row);
    emitInventoryEvent("supplier.created", row);
    res.status(201).json(row);
  } catch (error) { next(error); }
});

app.post("/api/customers", async (req, res, next) => {
  try {
    const input = mapCustomerInput(req.body || {});
    const result = await run(`INSERT INTO customers (name, contact_name, phone, email, address, is_active, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`, [input.name, input.contact_name, input.phone, input.email, input.address, input.is_active]);
    const row = await get(`SELECT * FROM customers WHERE id = ?`, [result.id]);
    await createActivity("customer", result.id, "created", row);
    emitInventoryEvent("customer.created", row);
    res.status(201).json(row);
  } catch (error) { next(error); }
});

app.post("/api/locations", async (req, res, next) => {
  try {
    const input = mapLocationInput(req.body || {});
    const result = await run(`INSERT INTO locations (code, name, type, notes, is_active, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`, [input.code, input.name, input.type, input.notes, input.is_active]);
    const row = await get(`SELECT * FROM locations WHERE id = ?`, [result.id]);
    await createActivity("location", result.id, "created", row);
    emitInventoryEvent("location.created", row);
    res.status(201).json(row);
  } catch (error) { next(error); }
});

app.post("/api/products", async (req, res, next) => {
  try {
    const input = mapProductInput(req.body || {});
    const result = await run(`INSERT INTO products (sku, name, description, category_id, barcode, serial_tracking, unit_of_measure, cost_price, sell_price, supplier_id, reorder_level, tax_flag, is_active, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`, [input.sku, input.name, input.description, input.category_id, input.barcode, input.serial_tracking, input.unit_of_measure, input.cost_price, input.sell_price, input.supplier_id, input.reorder_level, input.tax_flag, input.is_active]);
    const row = await get(`SELECT p.*, c.name AS category_name, s.name AS supplier_name FROM products p LEFT JOIN product_categories c ON c.id = p.category_id LEFT JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = ?`, [result.id]);
    await createActivity("product", result.id, "created", row);
    emitInventoryEvent("product.created", row);
    res.status(201).json(row);
  } catch (error) { next(error); }
});

app.get("/api/purchase-orders", async (req, res, next) => { try { res.json(await getPurchaseOrdersWithLines()); } catch (error) { next(error); } });
app.get("/api/sales-orders", async (req, res, next) => { try { res.json(await getSalesOrdersWithLines()); } catch (error) { next(error); } });
app.get("/api/goods-receipts", async (req, res, next) => { try { res.json(await getGoodsReceiptsList()); } catch (error) { next(error); } });
app.get("/api/dispatches", async (req, res, next) => { try { res.json(await getDispatchesList()); } catch (error) { next(error); } });
app.get("/api/holding-stock", async (req, res, next) => { try { res.json(await getHoldingStock()); } catch (error) { next(error); } });
app.get("/api/stock-movements", async (req, res, next) => { try { res.json(await getStockMovementsList()); } catch (error) { next(error); } });
app.get("/api/adjustments", async (req, res, next) => { try { res.json(await getAdjustmentsList()); } catch (error) { next(error); } });
app.get("/api/reports/stock-by-location", async (req, res, next) => { try { res.json(await getStockByLocationReport()); } catch (error) { next(error); } });
app.get("/api/reports/order-summary", async (req, res, next) => { try { res.json(await getOrderSummaryReport()); } catch (error) { next(error); } });
app.get("/api/migration/import-runs", async (req, res, next) => { try { res.json(await getImportRuns()); } catch (error) { next(error); } });
app.get("/api/migration/reconciliation", async (req, res, next) => { try { res.json(await getMigrationReconciliation()); } catch (error) { next(error); } });

app.post("/api/purchase-orders", async (req, res, next) => {
  try {
    const input = mapPurchaseOrderInput(req.body || {});
    const created = await transaction(async () => {
      const poResult = await run(`INSERT INTO purchase_orders (po_number, supplier_id, status, expected_at, notes, updated_at) VALUES (?, ?, 'ordered', ?, ?, CURRENT_TIMESTAMP)`, [input.po_number, input.supplier_id, input.expected_at, input.notes]);
      for (const line of input.lines) {
        await run(`INSERT INTO purchase_order_lines (purchase_order_id, product_id, qty_ordered, qty_received, unit_cost, notes, updated_at) VALUES (?, ?, ?, 0, ?, ?, CURRENT_TIMESTAMP)`, [poResult.id, line.product_id, line.qty_ordered, line.unit_cost, line.notes]);
      }
      await refreshPurchaseOrderStatus(poResult.id);
      const orders = await getPurchaseOrdersWithLines();
      return orders.find((order) => Number(order.id) === Number(poResult.id));
    });
    await createActivity("purchase_order", created.id, "created", created);
    emitInventoryEvent("purchase_order.created", created);
    res.status(201).json(created);
  } catch (error) { next(error); }
});

app.post("/api/purchase-orders/:id/receive", async (req, res, next) => {
  try {
    const purchaseOrderId = parseInteger(req.params.id, 0);
    const lineId = parseInteger(req.body?.purchase_order_line_id, 0);
    const qtyReceived = parseInteger(req.body?.qty_received, 0);
    const receivedBy = String(req.body?.received_by || "Goods In").trim();
    const notes = String(req.body?.notes || "").trim();
    const serialNumbers = parseSerialNumbers(req.body?.serial_numbers);
    if (!purchaseOrderId || !lineId || qtyReceived <= 0) throw requestError("Purchase order, line, and received quantity are required");
    const order = await get(`SELECT * FROM purchase_orders WHERE id = ?`, [purchaseOrderId]);
    if (!order) throw requestError("Purchase order not found", 404);
    const line = await get(`SELECT pol.*, p.name AS product_name, p.sku, p.serial_tracking FROM purchase_order_lines pol JOIN products p ON p.id = pol.product_id WHERE pol.id = ? AND pol.purchase_order_id = ?`, [lineId, purchaseOrderId]);
    if (!line) throw requestError("Purchase order line not found", 404);
    const remainingQty = Number(line.qty_ordered || 0) - Number(line.qty_received || 0);
    if (qtyReceived > remainingQty) throw requestError(`Only ${remainingQty} units remain on this PO line`, 409);
    if (line.serial_tracking && Array.from(new Set(serialNumbers)).length !== qtyReceived) throw requestError("Serial tracked items require one unique serial number per unit received");
    const holdingLocation = await getLocationByCode("HOLDING");
    if (!holdingLocation) throw requestError("HOLDING location is missing", 500);
    const receipt = await transaction(async () => {
      const receiptNumber = `GR-${Date.now()}`;
      const receiptResult = await run(`INSERT INTO goods_receipts (purchase_order_id, receipt_number, received_by, notes) VALUES (?, ?, ?, ?)`, [purchaseOrderId, receiptNumber, receivedBy, notes]);
      await run(`INSERT INTO goods_receipt_lines (goods_receipt_id, purchase_order_line_id, product_id, qty_received, target_location_id, serial_numbers, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`, [receiptResult.id, lineId, line.product_id, qtyReceived, holdingLocation.id, JSON.stringify(serialNumbers), notes]);
      await run(`UPDATE purchase_order_lines SET qty_received = qty_received + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [qtyReceived, lineId]);
      if (line.serial_tracking) {
        for (const serialNumber of serialNumbers) {
          await run(`INSERT INTO inventory_units (product_id, serial_number, current_location_id, status, updated_at) VALUES (?, ?, ?, 'in_holding', CURRENT_TIMESTAMP)`, [line.product_id, serialNumber, holdingLocation.id]);
          await run(`INSERT INTO stock_movements (product_id, movement_type, qty, serial_number, to_location_id, reference_type, reference_id, notes, created_by) VALUES (?, 'goods_in', 1, ?, ?, 'goods_receipt', ?, ?, ?)`, [line.product_id, serialNumber, holdingLocation.id, receiptNumber, notes, receivedBy]);
        }
      } else {
        await updateInventoryBalance(line.product_id, holdingLocation.id, qtyReceived, 0);
        await run(`INSERT INTO stock_movements (product_id, movement_type, qty, to_location_id, reference_type, reference_id, notes, created_by) VALUES (?, 'goods_in', ?, ?, 'goods_receipt', ?, ?, ?)`, [line.product_id, qtyReceived, holdingLocation.id, receiptNumber, notes, receivedBy]);
      }
      const status = await refreshPurchaseOrderStatus(purchaseOrderId);
      return { id: receiptResult.id, receipt_number: receiptNumber, received_at: new Date().toISOString(), received_by: receivedBy, notes, po_number: order.po_number, sku: line.sku, product_name: line.product_name, qty_received: qtyReceived, target_location_code: holdingLocation.code, status, purchase_order_line_id: lineId };
    });
    await createActivity("goods_receipt", receipt.id, "received_into_holding", receipt);
    emitInventoryEvent("goods_receipt.created", receipt);
    res.status(201).json(receipt);
  } catch (error) { next(error); }
});

app.post("/api/putaway", async (req, res, next) => {
  try {
    const productId = parseInteger(req.body?.product_id, 0);
    const destinationLocationId = parseInteger(req.body?.destination_location_id, 0);
    const qty = parseInteger(req.body?.qty, 0);
    const movedBy = String(req.body?.moved_by || "Putaway").trim();
    const notes = String(req.body?.notes || "").trim();
    const serialNumbers = parseSerialNumbers(req.body?.serial_numbers);
    if (!productId || !destinationLocationId) throw requestError("Product and destination location are required");
    const holdingLocation = await getLocationByCode("HOLDING");
    const destination = await get(`SELECT * FROM locations WHERE id = ?`, [destinationLocationId]);
    const product = await get(`SELECT * FROM products WHERE id = ?`, [productId]);
    if (!holdingLocation) throw requestError("HOLDING location is missing", 500);
    if (!destination) throw requestError("Destination location not found", 404);
    if (!product) throw requestError("Product not found", 404);
    if (Number(destination.id) === Number(holdingLocation.id)) throw requestError("Destination location must be different from HOLDING");
    const putawayResult = await transaction(async () => {
      if (Number(product.serial_tracking || 0)) {
        const uniqueSerials = Array.from(new Set(serialNumbers));
        if (!uniqueSerials.length) throw requestError("Serial numbers are required for serial tracked putaway");
        const units = await all(`SELECT * FROM inventory_units WHERE product_id = ? AND current_location_id = ? AND serial_number IN (${uniqueSerials.map(() => "?").join(",")})`, [productId, holdingLocation.id, ...uniqueSerials]);
        if (units.length !== uniqueSerials.length) throw requestError("One or more serial numbers are not currently in HOLDING", 409);
        for (const unit of units) {
          const referenceId = `PUT-${Date.now()}-${unit.id}`;
          await run(`UPDATE inventory_units SET current_location_id = ?, status = 'available', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [destinationLocationId, unit.id]);
          await run(`INSERT INTO stock_movements (product_id, movement_type, qty, serial_number, from_location_id, to_location_id, reference_type, reference_id, notes, created_by) VALUES (?, 'putaway', 1, ?, ?, ?, 'putaway', ?, ?, ?)`, [productId, unit.serial_number, holdingLocation.id, destinationLocationId, referenceId, notes, movedBy]);
        }
        return { product_id: productId, sku: product.sku, product_name: product.name, qty_moved: units.length, serial_numbers: uniqueSerials, from_location_code: holdingLocation.code, to_location_code: destination.code };
      }
      if (qty <= 0) throw requestError("Quantity is required for non-serial putaway");
      const holdingBalance = await get(`SELECT * FROM inventory_balances WHERE product_id = ? AND location_id = ?`, [productId, holdingLocation.id]);
      const available = Number(holdingBalance?.qty_on_hand || 0) - Number(holdingBalance?.qty_allocated || 0);
      if (available < qty) throw requestError(`Only ${available} units are currently in HOLDING`, 409);
      const referenceId = `PUT-${Date.now()}`;
      await updateInventoryBalance(productId, holdingLocation.id, -qty, 0);
      await updateInventoryBalance(productId, destinationLocationId, qty, 0);
      await run(`INSERT INTO stock_movements (product_id, movement_type, qty, from_location_id, to_location_id, reference_type, reference_id, notes, created_by) VALUES (?, 'putaway', ?, ?, ?, 'putaway', ?, ?, ?)`, [productId, qty, holdingLocation.id, destinationLocationId, referenceId, notes, movedBy]);
      return { product_id: productId, sku: product.sku, product_name: product.name, qty_moved: qty, serial_numbers: [], from_location_code: holdingLocation.code, to_location_code: destination.code };
    });
    await createActivity("putaway", productId, "moved_from_holding", putawayResult);
    emitInventoryEvent("putaway.completed", putawayResult);
    res.status(201).json(putawayResult);
  } catch (error) { next(error); }
});

app.post("/api/sales-orders", async (req, res, next) => {
  try {
    const input = mapSalesOrderInput(req.body || {});
    const created = await transaction(async () => {
      const orderResult = await run(`INSERT INTO sales_orders (order_number, customer_id, status, notes, updated_at) VALUES (?, ?, 'draft', ?, CURRENT_TIMESTAMP)`, [input.order_number, input.customer_id, input.notes]);
      for (const line of input.lines) {
        await run(`INSERT INTO sales_order_lines (sales_order_id, product_id, qty_ordered, unit_price, notes, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`, [orderResult.id, line.product_id, line.qty_ordered, line.unit_price, line.notes]);
      }
      await refreshSalesOrderStatus(orderResult.id);
      const orders = await getSalesOrdersWithLines();
      return orders.find((order) => Number(order.id) === Number(orderResult.id));
    });
    await createActivity("sales_order", created.id, "created", created);
    emitInventoryEvent("sales_order.created", created);
    res.status(201).json(created);
  } catch (error) { next(error); }
});

app.post("/api/sales-orders/:id/allocate", async (req, res, next) => {
  try {
    const salesOrderId = parseInteger(req.params.id, 0);
    const allocatedBy = String(req.body?.allocated_by || "Allocation").trim();
    const notes = String(req.body?.notes || "").trim();
    const order = await get(`SELECT * FROM sales_orders WHERE id = ?`, [salesOrderId]);
    if (!salesOrderId || !order) throw requestError("Sales order not found", 404);
    const lines = await all(`SELECT sol.*, p.sku, p.name AS product_name, p.serial_tracking FROM sales_order_lines sol JOIN products p ON p.id = sol.product_id WHERE sol.sales_order_id = ? ORDER BY sol.id ASC`, [salesOrderId]);
    const result = await transaction(async () => {
      for (const line of lines) {
        const remaining = Number(line.qty_ordered || 0) - Number(line.qty_allocated || 0) - Number(line.qty_dispatched || 0);
        if (remaining <= 0) continue;
        if (Number(line.serial_tracking || 0)) {
          const units = await all(`SELECT iu.*, l.code AS location_code FROM inventory_units iu JOIN locations l ON l.id = iu.current_location_id WHERE iu.product_id = ? AND iu.status = 'available' AND l.code <> 'HOLDING' AND l.type <> 'damaged' ORDER BY iu.id ASC LIMIT ?`, [line.product_id, remaining]);
          if (units.length < remaining) throw requestError(`Not enough available serial stock for ${line.sku}. Needed ${remaining}, found ${units.length}`, 409);
          for (const unit of units) {
            await run(`UPDATE inventory_units SET status = 'allocated', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [unit.id]);
            await run(`INSERT INTO sales_order_allocations (sales_order_line_id, product_id, location_id, qty, serial_number, status, updated_at) VALUES (?, ?, ?, 1, ?, 'allocated', CURRENT_TIMESTAMP)`, [line.id, line.product_id, unit.current_location_id, unit.serial_number]);
            await run(`INSERT INTO stock_movements (product_id, movement_type, qty, serial_number, from_location_id, to_location_id, reference_type, reference_id, notes, created_by) VALUES (?, 'allocate', 1, ?, ?, ?, 'sales_order', ?, ?, ?)`, [line.product_id, unit.serial_number, unit.current_location_id, unit.current_location_id, order.order_number, notes, allocatedBy]);
          }
        } else {
          const balances = await all(`SELECT b.*, l.code AS location_code FROM inventory_balances b JOIN locations l ON l.id = b.location_id WHERE b.product_id = ? AND (b.qty_on_hand - b.qty_allocated) > 0 AND l.code <> 'HOLDING' AND l.type <> 'damaged' ORDER BY (b.qty_on_hand - b.qty_allocated) DESC, l.code ASC`, [line.product_id]);
          let qtyNeeded = remaining;
          for (const balance of balances) {
            if (qtyNeeded <= 0) break;
            const available = Number(balance.qty_on_hand || 0) - Number(balance.qty_allocated || 0);
            const allocateQty = Math.min(available, qtyNeeded);
            if (allocateQty <= 0) continue;
            await updateInventoryBalance(line.product_id, balance.location_id, 0, allocateQty);
            await run(`INSERT INTO sales_order_allocations (sales_order_line_id, product_id, location_id, qty, serial_number, status, updated_at) VALUES (?, ?, ?, ?, '', 'allocated', CURRENT_TIMESTAMP)`, [line.id, line.product_id, balance.location_id, allocateQty]);
            await run(`INSERT INTO stock_movements (product_id, movement_type, qty, from_location_id, to_location_id, reference_type, reference_id, notes, created_by) VALUES (?, 'allocate', ?, ?, ?, 'sales_order', ?, ?, ?)`, [line.product_id, allocateQty, balance.location_id, balance.location_id, order.order_number, notes, allocatedBy]);
            qtyNeeded -= allocateQty;
          }
          if (qtyNeeded > 0) throw requestError(`Not enough available stock for ${line.sku}. Short by ${qtyNeeded}`, 409);
        }
        await refreshSalesOrderLineTotals(line.id);
      }
      const status = await refreshSalesOrderStatus(salesOrderId);
      const orders = await getSalesOrdersWithLines();
      return { status, order: orders.find((item) => Number(item.id) === salesOrderId) };
    });
    await createActivity("sales_order", salesOrderId, "allocated", result.order);
    emitInventoryEvent("sales_order.allocated", result.order);
    res.json(result.order);
  } catch (error) { next(error); }
});

app.post("/api/sales-orders/:id/dispatch", async (req, res, next) => {
  try {
    const salesOrderId = parseInteger(req.params.id, 0);
    const dispatchedBy = String(req.body?.dispatched_by || "Dispatch").trim();
    const notes = String(req.body?.notes || "").trim();
    const order = await get(`SELECT * FROM sales_orders WHERE id = ?`, [salesOrderId]);
    if (!salesOrderId || !order) throw requestError("Sales order not found", 404);
    const lines = await all(`SELECT * FROM sales_order_lines WHERE sales_order_id = ? ORDER BY id ASC`, [salesOrderId]);
    const dispatch = await transaction(async () => {
      const dispatchNumber = `DSP-${Date.now()}`;
      const dispatchResult = await run(`INSERT INTO dispatches (sales_order_id, dispatch_number, dispatched_by, notes) VALUES (?, ?, ?, ?)`, [salesOrderId, dispatchNumber, dispatchedBy, notes]);
      for (const line of lines) {
        const allocations = await all(`SELECT * FROM sales_order_allocations WHERE sales_order_line_id = ? AND status = 'allocated' ORDER BY id ASC`, [line.id]);
        if (!allocations.length) continue;
        const serialNumbers = [];
        let qtyDispatched = 0;
        for (const allocation of allocations) {
          if (allocation.serial_number) {
            const unit = await get(`SELECT * FROM inventory_units WHERE product_id = ? AND serial_number = ? LIMIT 1`, [allocation.product_id, allocation.serial_number]);
            if (!unit) throw requestError(`Serial ${allocation.serial_number} is missing from inventory`, 409);
            await run(`UPDATE inventory_units SET status = 'dispatched', current_location_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [unit.id]);
            serialNumbers.push(allocation.serial_number);
          } else {
            await updateInventoryBalance(allocation.product_id, allocation.location_id, -Number(allocation.qty || 0), -Number(allocation.qty || 0));
          }
          await run(`UPDATE sales_order_allocations SET status = 'dispatched', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [allocation.id]);
          await run(`INSERT INTO stock_movements (product_id, movement_type, qty, serial_number, from_location_id, to_location_id, reference_type, reference_id, notes, created_by) VALUES (?, 'dispatch', ?, ?, ?, NULL, 'dispatch', ?, ?, ?)`, [allocation.product_id, allocation.qty, allocation.serial_number || "", allocation.location_id, dispatchNumber, notes, dispatchedBy]);
          qtyDispatched += Number(allocation.qty || 0);
        }
        await run(`INSERT INTO dispatch_lines (dispatch_id, sales_order_line_id, product_id, qty_dispatched, serial_numbers, notes) VALUES (?, ?, ?, ?, ?, ?)`, [dispatchResult.id, line.id, line.product_id, qtyDispatched, JSON.stringify(serialNumbers), notes]);
        await refreshSalesOrderLineTotals(line.id);
      }
      await refreshSalesOrderStatus(salesOrderId);
      const dispatchRows = await getDispatchesList();
      return dispatchRows.find((row) => row.dispatch_number === dispatchNumber) || { id: dispatchResult.id, dispatch_number: dispatchNumber };
    });
    await createActivity("dispatch", dispatch.id, "completed", dispatch);
    emitInventoryEvent("dispatch.completed", dispatch);
    res.json(dispatch);
  } catch (error) { next(error); }
});

app.post("/api/adjustments", async (req, res, next) => {
  try {
    const productId = parseInteger(req.body?.product_id, 0);
    const locationId = req.body?.location_id ? parseInteger(req.body.location_id, 0) : null;
    const adjustmentType = String(req.body?.adjustment_type || "").trim().toLowerCase();
    const qty = parseInteger(req.body?.qty, 0);
    const serialNumbers = Array.from(new Set(parseSerialNumbers(req.body?.serial_numbers)));
    const reason = String(req.body?.reason || "").trim();
    const notes = String(req.body?.notes || "").trim();
    const adjustedBy = String(req.body?.adjusted_by || "Adjustment").trim();
    if (!productId || !adjustmentType || !reason) throw requestError("Product, adjustment type, and reason are required");
    const product = await get(`SELECT * FROM products WHERE id = ?`, [productId]);
    if (!product) throw requestError("Product not found", 404);
    const location = locationId ? await get(`SELECT * FROM locations WHERE id = ?`, [locationId]) : null;
    if (locationId && !location) throw requestError("Location not found", 404);
    const adjustment = await transaction(async () => {
      if (Number(product.serial_tracking || 0)) {
        if (!serialNumbers.length) throw requestError("Serial numbers are required for serial-tracked adjustments");
        const placeholders = serialNumbers.map(() => "?").join(",");
        const units = await all(`SELECT * FROM inventory_units WHERE product_id = ? AND serial_number IN (${placeholders})`, [productId, ...serialNumbers]);
        if (units.length !== serialNumbers.length) throw requestError("One or more serial numbers were not found", 409);
        const damagedLocation = adjustmentType === "damage" ? await getLocationByCode("DAMAGED") : null;
        if (!["damage", "write_off", "decrease"].includes(adjustmentType)) throw requestError("Serial-tracked adjustments currently support damage, write_off, or decrease only");
        for (const unit of units) {
          await run(`UPDATE inventory_units SET status = ?, current_location_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [adjustmentType === "damage" ? "damaged" : "written_off", adjustmentType === "damage" ? (damagedLocation?.id || null) : null, unit.id]);
          await run(`INSERT INTO stock_movements (product_id, movement_type, qty, serial_number, from_location_id, to_location_id, reference_type, reference_id, notes, created_by) VALUES (?, ?, 1, ?, ?, ?, 'adjustment', ?, ?, ?)`, [productId, adjustmentType === "damage" ? "damage" : "adjustment_out", unit.serial_number, unit.current_location_id, adjustmentType === "damage" ? (damagedLocation?.id || null) : null, `ADJ-${Date.now()}-${unit.id}`, reason + (notes ? ` - ${notes}` : ""), adjustedBy]);
        }
      } else {
        if (!locationId) throw requestError("Location is required for quantity adjustments");
        if (qty <= 0) throw requestError("Quantity must be greater than zero");
        const qtyDelta = ["increase", "found"].includes(adjustmentType) ? qty : -qty;
        await updateInventoryBalance(productId, locationId, qtyDelta, 0);
        await run(`INSERT INTO stock_movements (product_id, movement_type, qty, from_location_id, to_location_id, reference_type, reference_id, notes, created_by) VALUES (?, ?, ?, ?, ?, 'adjustment', ?, ?, ?)`, [productId, qtyDelta > 0 ? "adjustment_in" : adjustmentType === "damage" ? "damage" : "adjustment_out", Math.abs(qty), qtyDelta > 0 ? null : locationId, qtyDelta > 0 ? locationId : null, `ADJ-${Date.now()}`, reason + (notes ? ` - ${notes}` : ""), adjustedBy]);
        if (adjustmentType === "damage") {
          const damagedLocation = await getLocationByCode("DAMAGED");
          if (damagedLocation) {
            await updateInventoryBalance(productId, damagedLocation.id, qty, 0);
          }
        }
      }
      const result = await run(`INSERT INTO adjustments (product_id, location_id, adjustment_type, qty, serial_numbers, reason, notes, adjusted_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [productId, locationId, adjustmentType, Number(product.serial_tracking || 0) ? serialNumbers.length : qty, JSON.stringify(serialNumbers), reason, notes, adjustedBy]);
      return get(`SELECT a.*, p.sku, p.name AS product_name, l.code AS location_code FROM adjustments a JOIN products p ON p.id = a.product_id LEFT JOIN locations l ON l.id = a.location_id WHERE a.id = ?`, [result.id]);
    });
    await createActivity("adjustment", adjustment.id, "created", adjustment);
    emitInventoryEvent("adjustment.created", adjustment);
    res.status(201).json(adjustment);
  } catch (error) { next(error); }
});

app.get("/api/activity", async (req, res, next) => { try { res.json(await all(`SELECT * FROM activity_log ORDER BY datetime(created_at) DESC, id DESC LIMIT 60`)); } catch (error) { next(error); } });

app.use((err, req, res, next) => {
  const status = err.status || 500;
  console.error(err);
  res.status(status).json({ error: err.message || "Unexpected server error" });
});

async function start() {
  try {
    await initDatabase();
    server.listen(PORT, () => {
      console.log(`Stock Control running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start Stock Control:", error);
    process.exit(1);
  }
}

start();
