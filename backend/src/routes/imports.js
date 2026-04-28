const express = require("express");
const multer = require("multer");
const csvParser = require("csv-parser");
const { Readable } = require("stream");
const { run, get, all } = require("../db/connection");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ─── Schema definitions ───────────────────────────────────────────────────────

const IMPORT_SCHEMAS = {
  customers: {
    required: ["code", "name"],
    optional: ["contact_name", "email", "phone", "address_line1", "city", "postcode", "country", "status"],
  },
  suppliers: {
    required: ["code", "name"],
    optional: ["contact_name", "email", "phone", "address_line1", "city", "postcode", "country", "account_reference", "status"],
  },
  products: {
    required: ["sku", "name"],
    optional: ["description", "category", "barcode", "tracking_mode", "unit_of_measure", "cost_price", "sell_price", "status", "supplier_code"],
  },
  "purchase-orders": {
    required: ["order_number", "supplier_code"],
    optional: ["status", "ordered_at", "expected_at", "notes"],
  },
  "sales-orders": {
    required: ["order_number", "customer_code"],
    optional: ["status", "requested_at", "dispatch_due_at", "notes"],
  },
};

// ─── CSV parsing ─────────────────────────────────────────────────────────────

function parseCsvBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const stream = Readable.from(buffer);
    stream
      .pipe(csvParser({ mapHeaders: ({ header }) => header.trim().toLowerCase().replace(/\s+/g, "_") }))
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

function parseCsvText(text) {
  return parseCsvBuffer(Buffer.from(text, "utf8"));
}

// ─── Row importers ───────────────────────────────────────────────────────────

async function importCustomer(row, rowIndex) {
  const { code, name, contact_name = "", email = "", phone = "", address_line1 = "", city = "", postcode = "", country = "", status = "active" } = row;

  const existing = await get("SELECT id FROM customers WHERE code = ?", [code]);
  if (existing) {
    return { row: rowIndex, status: "skipped", reason: `Customer with code '${code}' already exists` };
  }

  await run(
    `INSERT INTO customers (code, name, contact_name, email, phone, address_line1, city, postcode, country, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [code.trim(), name.trim(), contact_name, email, phone, address_line1, city, postcode, country, status],
  );

  return { row: rowIndex, status: "imported", code };
}

async function importSupplier(row, rowIndex) {
  const { code, name, contact_name = "", email = "", phone = "", address_line1 = "", city = "", postcode = "", country = "", account_reference = "", status = "active" } = row;

  const existing = await get("SELECT id FROM suppliers WHERE code = ?", [code]);
  if (existing) {
    return { row: rowIndex, status: "skipped", reason: `Supplier with code '${code}' already exists` };
  }

  await run(
    `INSERT INTO suppliers (code, name, contact_name, email, phone, address_line1, city, postcode, country, account_reference, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [code.trim(), name.trim(), contact_name, email, phone, address_line1, city, postcode, country, account_reference, status],
  );

  return { row: rowIndex, status: "imported", code };
}

async function importProduct(row, rowIndex) {
  const {
    sku,
    name,
    description = "",
    category = "",
    barcode = "",
    tracking_mode = "quantity",
    unit_of_measure = "each",
    cost_price = "0",
    sell_price = "0",
    status = "active",
    supplier_code = "",
  } = row;

  const existing = await get("SELECT id FROM products WHERE sku = ?", [sku]);
  if (existing) {
    return { row: rowIndex, status: "skipped", reason: `Product with SKU '${sku}' already exists` };
  }

  let supplierId = null;
  if (supplier_code) {
    const supplier = await get("SELECT id FROM suppliers WHERE code = ?", [supplier_code.trim()]);
    if (!supplier) {
      return { row: rowIndex, status: "error", reason: `Supplier '${supplier_code}' not found` };
    }
    supplierId = supplier.id;
  }

  const isSerial = tracking_mode === "serial" ? 1 : 0;
  const isConsumable = category.toLowerCase() === "consumables" ? 1 : 0;

  await run(
    `INSERT INTO products (sku, name, description, category, barcode, default_supplier_id, tracking_mode,
      is_serial_tracked, is_consumable, unit_of_measure, cost_price, sell_price, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [sku.trim(), name.trim(), description, category, barcode, supplierId, tracking_mode, isSerial, isConsumable, unit_of_measure, parseFloat(cost_price) || 0, parseFloat(sell_price) || 0, status],
  );

  return { row: rowIndex, status: "imported", sku };
}

async function importPurchaseOrder(row, rowIndex) {
  const { order_number, supplier_code, status = "draft", ordered_at = null, expected_at = null, notes = "" } = row;

  const existing = await get("SELECT id FROM purchase_orders WHERE order_number = ?", [order_number]);
  if (existing) {
    return { row: rowIndex, status: "skipped", reason: `Purchase order '${order_number}' already exists` };
  }

  const supplier = await get("SELECT id FROM suppliers WHERE code = ?", [supplier_code.trim()]);
  if (!supplier) {
    return { row: rowIndex, status: "error", reason: `Supplier '${supplier_code}' not found` };
  }

  await run(
    `INSERT INTO purchase_orders (order_number, supplier_id, status, ordered_at, expected_at, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [order_number.trim(), supplier.id, status, ordered_at || null, expected_at || null, notes],
  );

  return { row: rowIndex, status: "imported", order_number };
}

async function importSalesOrder(row, rowIndex) {
  const { order_number, customer_code, status = "draft", requested_at = null, dispatch_due_at = null, notes = "" } = row;

  const existing = await get("SELECT id FROM sales_orders WHERE order_number = ?", [order_number]);
  if (existing) {
    return { row: rowIndex, status: "skipped", reason: `Sales order '${order_number}' already exists` };
  }

  const customer = await get("SELECT id FROM customers WHERE code = ?", [customer_code.trim()]);
  if (!customer) {
    return { row: rowIndex, status: "error", reason: `Customer '${customer_code}' not found` };
  }

  await run(
    `INSERT INTO sales_orders (order_number, customer_id, status, requested_at, dispatch_due_at, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [order_number.trim(), customer.id, status, requested_at || null, dispatch_due_at || null, notes],
  );

  return { row: rowIndex, status: "imported", order_number };
}

const IMPORTERS = {
  customers: importCustomer,
  suppliers: importSupplier,
  products: importProduct,
  "purchase-orders": importPurchaseOrder,
  "sales-orders": importSalesOrder,
};

// ─── Shared import handler ────────────────────────────────────────────────────

async function handleImport(resourceType, rows) {
  const schema = IMPORT_SCHEMAS[resourceType];
  const importer = IMPORTERS[resourceType];
  const results = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-based + header row

    // Validate required fields
    const missing = schema.required.filter((field) => !row[field] || !String(row[field]).trim());
    if (missing.length > 0) {
      results.push({ row: rowNum, status: "error", reason: `Missing required fields: ${missing.join(", ")}` });
      continue;
    }

    try {
      const result = await importer(row, rowNum);
      results.push(result);
    } catch (err) {
      results.push({ row: rowNum, status: "error", reason: err.message });
    }
  }

  const imported = results.filter((r) => r.status === "imported").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter((r) => r.status === "error").length;

  await run(
    `INSERT INTO activity_log (activity_type, summary, reference_type, payload_json)
     VALUES ('csv_import', ?, 'import', ?)`,
    [
      `Imported ${imported} ${resourceType} (${skipped} skipped, ${errors} errors)`,
      JSON.stringify({ resource: resourceType, total: rows.length, imported, skipped, errors }),
    ],
  );

  return { imported, skipped, errors, total: rows.length, results };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

function createImportRoute(resourceType) {
  router.post(`/${resourceType}`, upload.single("file"), async (req, res, next) => {
    try {
      let rows;

      if (req.file) {
        rows = await parseCsvBuffer(req.file.buffer);
      } else if (req.body?.csvText) {
        rows = await parseCsvText(req.body.csvText);
      } else {
        return res.status(400).json({ error: "Provide a CSV file upload (file) or pasted CSV text (csvText)" });
      }

      if (rows.length === 0) {
        return res.status(400).json({ error: "CSV contains no data rows" });
      }

      const summary = await handleImport(resourceType, rows);
      res.json(summary);
    } catch (err) {
      next(err);
    }
  });
}

Object.keys(IMPORT_SCHEMAS).forEach(createImportRoute);

router.get("/schemas", (_req, res) => {
  res.json({ schemas: IMPORT_SCHEMAS });
});

module.exports = router;
