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
    label: "Customers",
    required: ["code", "name"],
    optional: ["contact_name", "email", "phone", "address_line1", "city", "postcode", "country", "status"],
    fieldLabels: {
      code: "Customer Code",
      name: "Customer Name",
      contact_name: "Contact Name",
      email: "Email",
      phone: "Phone",
      address_line1: "Address Line 1",
      city: "City",
      postcode: "Postcode",
      country: "Country",
      status: "Status",
    },
    sampleRow: {
      code: "CUST-001",
      name: "Acme Ltd",
      contact_name: "Jane Smith",
      email: "orders@acme.example",
      phone: "020 7000 1234",
      address_line1: "1 High Street",
      city: "London",
      postcode: "EC1A 1BB",
      country: "UK",
      status: "active",
    },
  },
  suppliers: {
    label: "Suppliers",
    required: ["code", "name"],
    optional: ["contact_name", "email", "phone", "address_line1", "city", "postcode", "country", "account_reference", "status"],
    fieldLabels: {
      code: "Supplier Code",
      name: "Supplier Name",
      contact_name: "Contact Name",
      email: "Email",
      phone: "Phone",
      address_line1: "Address Line 1",
      city: "City",
      postcode: "Postcode",
      country: "Country",
      account_reference: "Account Reference",
      status: "Status",
    },
    sampleRow: {
      code: "SUP-001",
      name: "Parts & Co",
      contact_name: "Bob Jones",
      email: "sales@partsco.example",
      phone: "0113 400 5678",
      address_line1: "7 Trade Park",
      city: "Leeds",
      postcode: "LS1 4EF",
      country: "UK",
      account_reference: "PC-2024",
      status: "active",
    },
  },
  products: {
    label: "Products",
    required: ["sku", "name"],
    optional: ["description", "category", "barcode", "tracking_mode", "unit_of_measure", "cost_price", "sell_price", "status", "supplier_code"],
    fieldLabels: {
      sku: "SKU",
      name: "Product Name",
      description: "Description",
      category: "Category",
      barcode: "Barcode",
      tracking_mode: "Tracking Mode (serial/quantity)",
      unit_of_measure: "Unit of Measure",
      cost_price: "Cost Price",
      sell_price: "Sell Price",
      status: "Status",
      supplier_code: "Supplier Code",
    },
    sampleRow: {
      sku: "PROD-001",
      name: "Widget A",
      description: "Standard widget",
      category: "Hardware",
      barcode: "5010000000001",
      tracking_mode: "serial",
      unit_of_measure: "each",
      cost_price: "12.50",
      sell_price: "24.99",
      status: "active",
      supplier_code: "SUP-001",
    },
  },
  "purchase-orders": {
    label: "Purchase Orders",
    required: ["order_number", "supplier_code"],
    optional: ["status", "ordered_at", "expected_at", "supplier_reference", "notes"],
    fieldLabels: {
      order_number: "Order Number",
      supplier_code: "Supplier Code",
      status: "Status (draft/open/received/cancelled)",
      ordered_at: "Ordered Date (YYYY-MM-DD)",
      expected_at: "Expected Date (YYYY-MM-DD)",
      supplier_reference: "Supplier Reference",
      notes: "Notes",
    },
    sampleRow: {
      order_number: "PO-2024-001",
      supplier_code: "SUP-001",
      status: "open",
      ordered_at: "2024-01-15",
      expected_at: "2024-02-01",
      supplier_reference: "INV-9981",
      notes: "",
    },
  },
  "sales-orders": {
    label: "Sales Orders",
    required: ["order_number", "customer_code"],
    optional: ["status", "requested_at", "dispatch_due_at", "priority", "customer_reference", "notes"],
    fieldLabels: {
      order_number: "Order Number",
      customer_code: "Customer Code",
      status: "Status (draft/open/dispatched/cancelled)",
      requested_at: "Requested Date (YYYY-MM-DD)",
      dispatch_due_at: "Dispatch Due Date (YYYY-MM-DD)",
      priority: "Priority (normal/urgent)",
      customer_reference: "Customer Reference",
      notes: "Notes",
    },
    sampleRow: {
      order_number: "SO-2024-001",
      customer_code: "CUST-001",
      status: "open",
      requested_at: "2024-01-10",
      dispatch_due_at: "2024-01-20",
      priority: "normal",
      customer_reference: "PO-REF-123",
      notes: "",
    },
  },
};

// ─── CSV parsing ──────────────────────────────────────────────────────────────

function parseCsvBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const stream = Readable.from(buffer);
    stream
      .pipe(csvParser({ mapHeaders: ({ header }) => header.trim() }))
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

function parseCsvText(text) {
  return parseCsvBuffer(Buffer.from(text, "utf8"));
}

// ─── Column mapping ───────────────────────────────────────────────────────────

// mapping: { fieldKey: csvColumnHeader | "" }
function applyMapping(rawRow, mapping) {
  const mapped = {};
  for (const [fieldKey, csvHeader] of Object.entries(mapping)) {
    if (csvHeader && rawRow[csvHeader] !== undefined) {
      mapped[fieldKey] = rawRow[csvHeader];
    }
  }
  return mapped;
}

function autoDetectMapping(csvHeaders, schema) {
  const allFields = [...schema.required, ...schema.optional];
  const mapping = {};
  for (const field of allFields) {
    const norm = (s) => s.toLowerCase().replace(/[\s\-()\/]+/g, "_").replace(/_+$/, "");
    const fieldNorm = norm(field);
    const match = csvHeaders.find((h) => norm(h) === fieldNorm);
    if (match) {
      mapping[field] = match;
      continue;
    }
    if (schema.fieldLabels[field]) {
      const labelNorm = norm(schema.fieldLabels[field]);
      const labelMatch = csvHeaders.find((h) => norm(h) === labelNorm);
      if (labelMatch) mapping[field] = labelMatch;
    }
  }
  return mapping;
}

// ─── Validators (no DB) ───────────────────────────────────────────────────────

function validateCustomerMapped(m) {
  const errors = [];
  if (!m.code?.trim()) errors.push("Customer Code is required");
  if (!m.name?.trim()) errors.push("Customer Name is required");
  if (m.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.email)) errors.push("Email format is invalid");
  if (m.status && !["active", "inactive"].includes(m.status.toLowerCase())) errors.push("Status must be 'active' or 'inactive'");
  return errors;
}

function validateSupplierMapped(m) {
  const errors = [];
  if (!m.code?.trim()) errors.push("Supplier Code is required");
  if (!m.name?.trim()) errors.push("Supplier Name is required");
  if (m.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.email)) errors.push("Email format is invalid");
  if (m.status && !["active", "inactive"].includes(m.status.toLowerCase())) errors.push("Status must be 'active' or 'inactive'");
  return errors;
}

function validateProductMapped(m) {
  const errors = [];
  if (!m.sku?.trim()) errors.push("SKU is required");
  if (!m.name?.trim()) errors.push("Product Name is required");
  if (m.tracking_mode && !["serial", "quantity"].includes(m.tracking_mode.toLowerCase())) errors.push("Tracking Mode must be 'serial' or 'quantity'");
  if (m.cost_price && isNaN(parseFloat(m.cost_price))) errors.push("Cost Price must be a number");
  if (m.sell_price && isNaN(parseFloat(m.sell_price))) errors.push("Sell Price must be a number");
  return errors;
}

function validatePurchaseOrderMapped(m) {
  const errors = [];
  if (!m.order_number?.trim()) errors.push("Order Number is required");
  if (!m.supplier_code?.trim()) errors.push("Supplier Code is required");
  if (m.status && !["draft", "open", "received", "cancelled"].includes(m.status.toLowerCase())) errors.push("Status must be draft/open/received/cancelled");
  if (m.expected_at && isNaN(Date.parse(m.expected_at))) errors.push("Expected Date must be YYYY-MM-DD");
  if (m.ordered_at && isNaN(Date.parse(m.ordered_at))) errors.push("Ordered Date must be YYYY-MM-DD");
  return errors;
}

function validateSalesOrderMapped(m) {
  const errors = [];
  if (!m.order_number?.trim()) errors.push("Order Number is required");
  if (!m.customer_code?.trim()) errors.push("Customer Code is required");
  if (m.status && !["draft", "open", "dispatched", "cancelled"].includes(m.status.toLowerCase())) errors.push("Status must be draft/open/dispatched/cancelled");
  if (m.dispatch_due_at && isNaN(Date.parse(m.dispatch_due_at))) errors.push("Dispatch Due Date must be YYYY-MM-DD");
  if (m.requested_at && isNaN(Date.parse(m.requested_at))) errors.push("Requested Date must be YYYY-MM-DD");
  if (m.priority && !["normal", "urgent"].includes(m.priority.toLowerCase())) errors.push("Priority must be 'normal' or 'urgent'");
  return errors;
}

const VALIDATORS = {
  customers: validateCustomerMapped,
  suppliers: validateSupplierMapped,
  products: validateProductMapped,
  "purchase-orders": validatePurchaseOrderMapped,
  "sales-orders": validateSalesOrderMapped,
};

// ─── Row importers (DB writes) ────────────────────────────────────────────────

async function importCustomer(m, rowNum) {
  const existing = await get("SELECT id FROM customers WHERE code = ?", [m.code.trim()]);
  if (existing) return { row: rowNum, status: "skipped", reason: `Code '${m.code}' already exists` };
  await run(
    `INSERT INTO customers (code, name, contact_name, email, phone, address_line1, city, postcode, country, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [m.code.trim(), m.name.trim(), m.contact_name || "", m.email || "", m.phone || "",
     m.address_line1 || "", m.city || "", m.postcode || "", m.country || "", (m.status || "active").toLowerCase()],
  );
  return { row: rowNum, status: "imported", ref: m.code };
}

async function importSupplier(m, rowNum) {
  const existing = await get("SELECT id FROM suppliers WHERE code = ?", [m.code.trim()]);
  if (existing) return { row: rowNum, status: "skipped", reason: `Code '${m.code}' already exists` };
  await run(
    `INSERT INTO suppliers (code, name, contact_name, email, phone, address_line1, city, postcode, country, account_reference, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [m.code.trim(), m.name.trim(), m.contact_name || "", m.email || "", m.phone || "",
     m.address_line1 || "", m.city || "", m.postcode || "", m.country || "",
     m.account_reference || "", (m.status || "active").toLowerCase()],
  );
  return { row: rowNum, status: "imported", ref: m.code };
}

async function importProduct(m, rowNum) {
  const existing = await get("SELECT id FROM products WHERE sku = ?", [m.sku.trim()]);
  if (existing) return { row: rowNum, status: "skipped", reason: `SKU '${m.sku}' already exists` };

  let supplierId = null;
  if (m.supplier_code) {
    const supplier = await get("SELECT id FROM suppliers WHERE code = ?", [m.supplier_code.trim()]);
    if (!supplier) return { row: rowNum, status: "error", reason: `Supplier '${m.supplier_code}' not found` };
    supplierId = supplier.id;
  }

  const trackingMode = (m.tracking_mode || "quantity").toLowerCase();
  const isSerial = trackingMode === "serial" ? 1 : 0;
  const isConsumable = (m.category || "").toLowerCase() === "consumables" ? 1 : 0;

  await run(
    `INSERT INTO products (sku, name, description, category, barcode, default_supplier_id, tracking_mode,
      is_serial_tracked, is_consumable, unit_of_measure, cost_price, sell_price, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [m.sku.trim(), m.name.trim(), m.description || "", m.category || "", m.barcode || "",
     supplierId, trackingMode, isSerial, isConsumable, m.unit_of_measure || "each",
     parseFloat(m.cost_price) || 0, parseFloat(m.sell_price) || 0, (m.status || "active").toLowerCase()],
  );
  return { row: rowNum, status: "imported", ref: m.sku };
}

async function importPurchaseOrder(m, rowNum) {
  const existing = await get("SELECT id FROM purchase_orders WHERE order_number = ?", [m.order_number.trim()]);
  if (existing) return { row: rowNum, status: "skipped", reason: `Order '${m.order_number}' already exists` };

  const supplier = await get("SELECT id FROM suppliers WHERE code = ?", [m.supplier_code.trim()]);
  if (!supplier) return { row: rowNum, status: "error", reason: `Supplier '${m.supplier_code}' not found` };

  await run(
    `INSERT INTO purchase_orders (order_number, supplier_id, status, ordered_at, expected_at, supplier_reference, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [m.order_number.trim(), supplier.id, (m.status || "draft").toLowerCase(),
     m.ordered_at || null, m.expected_at || null, m.supplier_reference || "", m.notes || ""],
  );
  return { row: rowNum, status: "imported", ref: m.order_number };
}

async function importSalesOrder(m, rowNum) {
  const existing = await get("SELECT id FROM sales_orders WHERE order_number = ?", [m.order_number.trim()]);
  if (existing) return { row: rowNum, status: "skipped", reason: `Order '${m.order_number}' already exists` };

  const customer = await get("SELECT id FROM customers WHERE code = ?", [m.customer_code.trim()]);
  if (!customer) return { row: rowNum, status: "error", reason: `Customer '${m.customer_code}' not found` };

  await run(
    `INSERT INTO sales_orders (order_number, customer_id, status, requested_at, dispatch_due_at, priority, customer_reference, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [m.order_number.trim(), customer.id, (m.status || "draft").toLowerCase(),
     m.requested_at || null, m.dispatch_due_at || null,
     (m.priority || "normal").toLowerCase(), m.customer_reference || "", m.notes || ""],
  );
  return { row: rowNum, status: "imported", ref: m.order_number };
}

const IMPORTERS = {
  customers: importCustomer,
  suppliers: importSupplier,
  products: importProduct,
  "purchase-orders": importPurchaseOrder,
  "sales-orders": importSalesOrder,
};

// ─── Shared logic ─────────────────────────────────────────────────────────────

function resolveMapping(reqBody, csvHeaders, schema) {
  if (!reqBody?.mapping) return autoDetectMapping(csvHeaders, schema);
  const raw = reqBody.mapping;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

async function validateRows(resourceType, rawRows, mapping) {
  const schema = IMPORT_SCHEMAS[resourceType];
  const validator = VALIDATORS[resourceType];
  const preview = [];

  for (let i = 0; i < rawRows.length; i++) {
    const rawRow = rawRows[i];
    const rowNum = i + 2;
    const mapped = applyMapping(rawRow, mapping);
    const errors = validator(mapped);
    preview.push({ rowIndex: rowNum, raw: rawRow, mapped, errors, valid: errors.length === 0 });
  }

  return {
    preview,
    validCount: preview.filter((r) => r.valid).length,
    errorCount: preview.filter((r) => !r.valid).length,
    total: rawRows.length,
  };
}

async function executeImport(resourceType, rawRows, mapping, filename, userId) {
  const schema = IMPORT_SCHEMAS[resourceType];
  const importer = IMPORTERS[resourceType];
  const results = [];

  for (let i = 0; i < rawRows.length; i++) {
    const mapped = applyMapping(rawRows[i], mapping);
    const rowNum = i + 2;
    const missing = schema.required.filter((f) => !mapped[f] || !String(mapped[f]).trim());
    if (missing.length > 0) {
      results.push({ row: rowNum, status: "error", reason: `Missing required fields: ${missing.join(", ")}` });
      continue;
    }
    try {
      results.push(await importer(mapped, rowNum));
    } catch (err) {
      results.push({ row: rowNum, status: "error", reason: err.message });
    }
  }

  const imported = results.filter((r) => r.status === "imported").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errorDetails = results.filter((r) => r.status === "error");

  // Write import log
  try {
    await run(
      `INSERT INTO import_logs (entity_type, filename, total_rows, imported_rows, skipped_rows, error_rows, errors_json, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [resourceType, filename || "", rawRows.length, imported, skipped, errorDetails.length,
       JSON.stringify(errorDetails), userId || null],
    );
  } catch (_e) { /* non-fatal */ }

  // Also write to activity_log
  try {
    await run(
      `INSERT INTO activity_log (action_type, summary, entity_type, details_json)
       VALUES ('csv_import', ?, 'import', ?)`,
      [
        `CSV import: ${imported} ${resourceType} imported (${skipped} skipped, ${errorDetails.length} errors)`,
        JSON.stringify({ resource: resourceType, total: rawRows.length, imported, skipped, errors: errorDetails.length }),
      ],
    );
  } catch (_e) { /* non-fatal */ }

  return { imported, skipped, errors: errorDetails.length, errorDetails, total: rawRows.length, results };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get("/schemas", (_req, res) => {
  res.json({ schemas: IMPORT_SCHEMAS });
});

router.get("/logs", async (_req, res) => {
  try {
    const logs = await all(`SELECT * FROM import_logs ORDER BY created_at DESC LIMIT 100`);
    res.json({ logs });
  } catch (_e) {
    res.json({ logs: [] });
  }
});

// Template CSV download
router.get("/:type/template", (req, res) => {
  const schema = IMPORT_SCHEMAS[req.params.type];
  if (!schema) return res.status(404).json({ error: "Unknown import type" });

  const fields = [...schema.required, ...schema.optional];
  const header = fields.join(",");
  const sampleValues = fields.map((f) => {
    const val = schema.sampleRow[f] || "";
    return val.includes(",") ? `"${val}"` : val;
  });
  const sampleRow = sampleValues.join(",");
  const csv = `${header}\n${sampleRow}\n`;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${req.params.type}-import-template.csv"`);
  res.send(csv);
});

Object.keys(IMPORT_SCHEMAS).forEach((resourceType) => {
  // Validate (dry-run, no DB writes)
  router.post(`/${resourceType}/validate`, upload.single("file"), async (req, res, next) => {
    try {
      let rawRows;
      if (req.file) {
        rawRows = await parseCsvBuffer(req.file.buffer);
      } else if (req.body?.csvText) {
        rawRows = await parseCsvText(req.body.csvText);
      } else {
        return res.status(400).json({ error: "Provide a CSV file (file) or pasted text (csvText)" });
      }
      if (rawRows.length === 0) return res.status(400).json({ error: "CSV contains no data rows" });

      const csvHeaders = Object.keys(rawRows[0]);
      const schema = IMPORT_SCHEMAS[resourceType];
      const mapping = resolveMapping(req.body, csvHeaders, schema);
      const result = await validateRows(resourceType, rawRows, mapping);
      res.json({ ...result, headers: csvHeaders, mapping, schema });
    } catch (err) {
      next(err);
    }
  });

  // Execute import
  router.post(`/${resourceType}`, upload.single("file"), async (req, res, next) => {
    try {
      let rawRows;
      if (req.file) {
        rawRows = await parseCsvBuffer(req.file.buffer);
      } else if (req.body?.csvText) {
        rawRows = await parseCsvText(req.body.csvText);
      } else {
        return res.status(400).json({ error: "Provide a CSV file (file) or pasted text (csvText)" });
      }
      if (rawRows.length === 0) return res.status(400).json({ error: "CSV contains no data rows" });

      const csvHeaders = Object.keys(rawRows[0]);
      const schema = IMPORT_SCHEMAS[resourceType];
      const mapping = resolveMapping(req.body, csvHeaders, schema);
      const filename = req.file?.originalname || req.body?.filename || "";
      const userId = req.user?.id || null;

      const result = await executeImport(resourceType, rawRows, mapping, filename, userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });
});

module.exports = router;
