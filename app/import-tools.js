const path = require("path");
const fs = require("fs");

const TEMPLATE_DEFINITIONS = [
  {
    type: "suppliers",
    filename: "suppliers-template.csv",
    description: "Supplier master data",
    rules: ["name is required", "name must be unique", "email/phone are optional"],
  },
  {
    type: "customers",
    filename: "customers-template.csv",
    description: "Customer master data",
    rules: ["name is required", "name must be unique", "email/phone are optional"],
  },
  {
    type: "locations",
    filename: "locations-template.csv",
    description: "Storage locations",
    rules: ["code, name, and type are required", "type must be holding, shelf, bin, dispatch, damaged, or vehicle"],
  },
  {
    type: "products",
    filename: "products-template.csv",
    description: "Product master data",
    rules: ["sku and name are required", "serial_tracking must be true/false", "supplier_name is optional and will be created if missing"],
  },
  {
    type: "opening-stock",
    filename: "opening-stock-template.csv",
    description: "Opening balances for non-serial stock",
    rules: ["sku and location_code must exist", "qty must be a positive whole number", "serial-tracked products are not allowed here"],
  },
  {
    type: "serial-stock",
    filename: "serial-stock-template.csv",
    description: "Opening balances for serial-tracked stock",
    rules: ["sku must be serial-tracked", "serial_number must be unique within the file", "location_code must exist", "status must be available or in_holding"],
  },
  {
    type: "purchase-orders",
    filename: "purchase-orders-template.csv",
    description: "Open purchase orders and lines",
    rules: ["po_number, supplier_name, product_sku, and qty_ordered are required", "qty_received is optional but cannot exceed qty_ordered", "supplier will be created if missing"],
  },
];

function parseBooleanLike(value, fallback = false) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "y"].includes(raw);
}

function normalizeDateValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "INVALID_DATE";
  return date.toISOString().slice(0, 10);
}

function buildImportRowResult(index, raw, normalized, errors) {
  return {
    row_number: index + 1,
    raw,
    normalized,
    errors,
    valid: errors.length === 0,
  };
}

function createImportTools(deps) {
  const {
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
    rootDir,
  } = deps;

  const templatesDir = path.join(rootDir, "import-templates");

  async function recordImportRun({ type, mode, status = "success", validation = null, summary = null, errorMessage = "" }) {
    await run(
      `INSERT INTO import_runs (import_type, mode, status, total_rows, valid_rows, invalid_rows, created_count, updated_count, error_message, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        type,
        mode,
        status,
        Number(validation?.total_rows || summary?.total_rows || 0),
        Number(validation?.valid_rows || 0),
        Number(validation?.invalid_rows || 0),
        Number(summary?.created || 0),
        Number(summary?.updated || 0),
        String(errorMessage || ""),
        JSON.stringify({ validation, summary }),
      ]
    );
  }

  function importTemplateMetadata() {
    return TEMPLATE_DEFINITIONS.map((item) => ({
      ...item,
      download_path: "/api/import/templates/" + item.type,
    }));
  }

  function importTemplateForType(type) {
    return TEMPLATE_DEFINITIONS.find((item) => item.type === type) || null;
  }

  async function getProductBySku(sku) {
    return get(`SELECT * FROM products WHERE sku = ? LIMIT 1`, [normalizeCode(sku)]);
  }

  async function getSupplierByName(name) {
    return get(`SELECT * FROM suppliers WHERE name = ? LIMIT 1`, [String(name || "").trim()]);
  }

  async function getLocationByCodeOrNull(code) {
    if (!code) return null;
    return get(`SELECT * FROM locations WHERE code = ? LIMIT 1`, [normalizeCode(code)]);
  }

  async function ensureSupplier(name) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return null;
    const existing = await getSupplierByName(trimmed);
    if (existing) return existing.id;
    const result = await run(`INSERT INTO suppliers (name, is_active, updated_at) VALUES (?, 1, CURRENT_TIMESTAMP)`, [trimmed]);
    return result.id;
  }

  async function ensureCategory(name) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return null;
    const existing = await get(`SELECT * FROM product_categories WHERE name = ? LIMIT 1`, [trimmed]);
    if (existing) return existing.id;
    const result = await run(`INSERT INTO product_categories (name) VALUES (?)`, [trimmed]);
    return result.id;
  }

  async function validateImportRows(type, rows) {
    const items = Array.isArray(rows) ? rows : [];
    const results = [];
    const seenSerials = new Set();

    for (let index = 0; index < items.length; index += 1) {
      const raw = items[index] && typeof items[index] === "object" ? items[index] : {};
      const errors = [];
      let normalized = {};

      if (type === "suppliers") {
        normalized = {
          name: String(raw.name || "").trim(),
          contact_name: String(raw.contact_name || "").trim(),
          phone: String(raw.phone || "").trim(),
          email: String(raw.email || "").trim(),
          address: String(raw.address || "").trim(),
          account_reference: String(raw.account_reference || "").trim(),
          is_active: parseBooleanLike(raw.is_active, true),
        };
        if (!normalized.name) errors.push("name is required");
      } else if (type === "customers") {
        normalized = {
          name: String(raw.name || "").trim(),
          contact_name: String(raw.contact_name || "").trim(),
          phone: String(raw.phone || "").trim(),
          email: String(raw.email || "").trim(),
          address: String(raw.address || "").trim(),
          is_active: parseBooleanLike(raw.is_active, true),
        };
        if (!normalized.name) errors.push("name is required");
      } else if (type === "locations") {
        normalized = {
          code: normalizeCode(raw.code),
          name: String(raw.name || "").trim(),
          type: String(raw.type || "").trim().toLowerCase(),
          notes: String(raw.notes || "").trim(),
          is_active: parseBooleanLike(raw.is_active, true),
        };
        if (!normalized.code) errors.push("code is required");
        if (!normalized.name) errors.push("name is required");
        if (!["holding", "shelf", "bin", "dispatch", "damaged", "vehicle"].includes(normalized.type)) {
          errors.push("type must be holding, shelf, bin, dispatch, damaged, or vehicle");
        }
      } else if (type === "products") {
        normalized = {
          sku: normalizeCode(raw.sku),
          name: String(raw.name || "").trim(),
          description: String(raw.description || "").trim(),
          category_name: String(raw.category_name || "").trim(),
          barcode: String(raw.barcode || "").trim(),
          serial_tracking: parseBooleanLike(raw.serial_tracking, false),
          unit_of_measure: String(raw.unit_of_measure || "each").trim() || "each",
          cost_price: parseMoney(raw.cost_price, 0),
          sell_price: parseMoney(raw.sell_price, 0),
          supplier_name: String(raw.supplier_name || "").trim(),
          reorder_level: parseInteger(raw.reorder_level, 0),
          tax_flag: parseBooleanLike(raw.tax_flag, true),
          is_active: parseBooleanLike(raw.is_active, true),
        };
        if (!normalized.sku) errors.push("sku is required");
        if (!normalized.name) errors.push("name is required");
      } else if (type === "opening-stock") {
        normalized = {
          sku: normalizeCode(raw.sku),
          location_code: normalizeCode(raw.location_code),
          qty: parseInteger(raw.qty, 0),
        };
        if (!normalized.sku) errors.push("sku is required");
        if (!normalized.location_code) errors.push("location_code is required");
        if (normalized.qty <= 0) errors.push("qty must be greater than zero");
        const product = normalized.sku ? await getProductBySku(normalized.sku) : null;
        const location = normalized.location_code ? await getLocationByCodeOrNull(normalized.location_code) : null;
        if (!product) errors.push("sku was not found");
        if (product && Number(product.serial_tracking || 0)) errors.push("serial-tracked products must use the serial-stock template");
        if (!location) errors.push("location_code was not found");
      } else if (type === "serial-stock") {
        normalized = {
          sku: normalizeCode(raw.sku),
          serial_number: String(raw.serial_number || "").trim(),
          location_code: normalizeCode(raw.location_code),
          status: String(raw.status || "available").trim().toLowerCase() || "available",
        };
        if (!normalized.sku) errors.push("sku is required");
        if (!normalized.serial_number) errors.push("serial_number is required");
        if (!normalized.location_code) errors.push("location_code is required");
        if (!["available", "in_holding"].includes(normalized.status)) errors.push("status must be available or in_holding");
        if (normalized.serial_number) {
          if (seenSerials.has(normalized.serial_number)) errors.push("serial_number is duplicated in the import file");
          seenSerials.add(normalized.serial_number);
        }
        const product = normalized.sku ? await getProductBySku(normalized.sku) : null;
        const location = normalized.location_code ? await getLocationByCodeOrNull(normalized.location_code) : null;
        if (!product) errors.push("sku was not found");
        if (product && !Number(product.serial_tracking || 0)) errors.push("product is not marked as serial tracked");
        if (!location) errors.push("location_code was not found");
      } else if (type === "purchase-orders") {
        normalized = {
          po_number: normalizeCode(raw.po_number),
          supplier_name: String(raw.supplier_name || "").trim(),
          product_sku: normalizeCode(raw.product_sku),
          qty_ordered: parseInteger(raw.qty_ordered, 0),
          qty_received: parseInteger(raw.qty_received, 0),
          unit_cost: parseMoney(raw.unit_cost, 0),
          expected_at: normalizeDateValue(raw.expected_at),
          notes: String(raw.notes || "").trim(),
        };
        if (!normalized.po_number) errors.push("po_number is required");
        if (!normalized.supplier_name) errors.push("supplier_name is required");
        if (!normalized.product_sku) errors.push("product_sku is required");
        if (normalized.qty_ordered <= 0) errors.push("qty_ordered must be greater than zero");
        if (normalized.qty_received < 0 || normalized.qty_received > normalized.qty_ordered) errors.push("qty_received must be between 0 and qty_ordered");
        if (normalized.expected_at === "INVALID_DATE") errors.push("expected_at must be a valid date");
        const product = normalized.product_sku ? await getProductBySku(normalized.product_sku) : null;
        if (!product) errors.push("product_sku was not found");
      } else {
        errors.push("unsupported import type");
      }

      results.push(buildImportRowResult(index, raw, normalized, errors));
    }

    return {
      type,
      total_rows: results.length,
      valid_rows: results.filter((row) => row.valid).length,
      invalid_rows: results.filter((row) => !row.valid).length,
      rows: results,
    };
  }

  async function applyImportRows(type, rows) {
    const validation = await validateImportRows(type, rows);
    if (validation.invalid_rows > 0) {
      const error = requestError("Import validation failed", 400);
      error.payload = validation;
      error.validation = validation;
      throw error;
    }

    const validRows = validation.rows.map((row) => row.normalized);
    const summary = { type, created: 0, updated: 0, total_rows: validRows.length };

    await transaction(async () => {
      if (type === "suppliers") {
        for (const row of validRows) {
          await run(
            `INSERT INTO suppliers (name, contact_name, phone, email, address, account_reference, is_active, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(name) DO UPDATE SET
               contact_name = excluded.contact_name,
               phone = excluded.phone,
               email = excluded.email,
               address = excluded.address,
               account_reference = excluded.account_reference,
               is_active = excluded.is_active,
               updated_at = CURRENT_TIMESTAMP`,
            [row.name, row.contact_name, row.phone, row.email, row.address, row.account_reference, row.is_active ? 1 : 0]
          );
          summary.updated += 1;
        }
      } else if (type === "customers") {
        for (const row of validRows) {
          await run(
            `INSERT INTO customers (name, contact_name, phone, email, address, is_active, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(name) DO UPDATE SET
               contact_name = excluded.contact_name,
               phone = excluded.phone,
               email = excluded.email,
               address = excluded.address,
               is_active = excluded.is_active,
               updated_at = CURRENT_TIMESTAMP`,
            [row.name, row.contact_name, row.phone, row.email, row.address, row.is_active ? 1 : 0]
          );
          summary.updated += 1;
        }
      } else if (type === "locations") {
        for (const row of validRows) {
          await run(
            `INSERT INTO locations (code, name, type, notes, is_active, updated_at)
             VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(code) DO UPDATE SET
               name = excluded.name,
               type = excluded.type,
               notes = excluded.notes,
               is_active = excluded.is_active,
               updated_at = CURRENT_TIMESTAMP`,
            [row.code, row.name, row.type, row.notes, row.is_active ? 1 : 0]
          );
          summary.updated += 1;
        }
      } else if (type === "products") {
        for (const row of validRows) {
          const categoryId = await ensureCategory(row.category_name);
          const supplierId = await ensureSupplier(row.supplier_name);
          await run(
            `INSERT INTO products (
               sku, name, description, category_id, barcode, serial_tracking,
               unit_of_measure, cost_price, sell_price, supplier_id,
               reorder_level, tax_flag, is_active, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(sku) DO UPDATE SET
               name = excluded.name,
               description = excluded.description,
               category_id = excluded.category_id,
               barcode = excluded.barcode,
               serial_tracking = excluded.serial_tracking,
               unit_of_measure = excluded.unit_of_measure,
               cost_price = excluded.cost_price,
               sell_price = excluded.sell_price,
               supplier_id = excluded.supplier_id,
               reorder_level = excluded.reorder_level,
               tax_flag = excluded.tax_flag,
               is_active = excluded.is_active,
               updated_at = CURRENT_TIMESTAMP`,
            [row.sku, row.name, row.description, categoryId, row.barcode, row.serial_tracking ? 1 : 0, row.unit_of_measure, row.cost_price, row.sell_price, supplierId, row.reorder_level, row.tax_flag ? 1 : 0, row.is_active ? 1 : 0]
          );
          summary.updated += 1;
        }
      } else if (type === "opening-stock") {
        for (const row of validRows) {
          const product = await getProductBySku(row.sku);
          const location = await getLocationByCodeOrNull(row.location_code);
          await run(
            `INSERT INTO inventory_balances (product_id, location_id, qty_on_hand, qty_allocated, updated_at)
             VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)
             ON CONFLICT(product_id, location_id) DO UPDATE SET
               qty_on_hand = excluded.qty_on_hand,
               qty_allocated = 0,
               updated_at = CURRENT_TIMESTAMP`,
            [product.id, location.id, row.qty]
          );
          await run(
            `INSERT INTO stock_movements (product_id, movement_type, qty, from_location_id, to_location_id, reference_type, reference_id, notes, created_by)
             VALUES (?, 'adjustment_in', ?, NULL, ?, 'import', 'OPENING-STOCK', 'Opening stock import', 'Import Script')`,
            [product.id, row.qty, location.id]
          );
          summary.updated += 1;
        }
      } else if (type === "serial-stock") {
        for (const row of validRows) {
          const product = await getProductBySku(row.sku);
          const location = await getLocationByCodeOrNull(row.location_code);
          const existing = await get(`SELECT id FROM inventory_units WHERE serial_number = ? LIMIT 1`, [row.serial_number]);
          if (existing) summary.updated += 1;
          else summary.created += 1;
          await run(
            `INSERT INTO inventory_units (product_id, serial_number, current_location_id, status, updated_at)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(serial_number) DO UPDATE SET
               product_id = excluded.product_id,
               current_location_id = excluded.current_location_id,
               status = excluded.status,
               updated_at = CURRENT_TIMESTAMP`,
            [product.id, row.serial_number, location.id, row.status]
          );
          await run(
            `INSERT INTO stock_movements (product_id, movement_type, qty, serial_number, from_location_id, to_location_id, reference_type, reference_id, notes, created_by)
             VALUES (?, 'adjustment_in', 1, ?, NULL, ?, 'import', 'SERIAL-STOCK', 'Serial stock import', 'Import Script')`,
            [product.id, row.serial_number, location.id]
          );
        }
      } else if (type === "purchase-orders") {
        const grouped = new Map();
        for (const row of validRows) {
          if (!grouped.has(row.po_number)) grouped.set(row.po_number, []);
          grouped.get(row.po_number).push(row);
        }
        for (const [poNumber, lines] of grouped.entries()) {
          const existing = await get(`SELECT id FROM purchase_orders WHERE po_number = ? LIMIT 1`, [poNumber]);
          if (existing) throw requestError(`Purchase order ${poNumber} already exists`, 409);
          const supplierId = await ensureSupplier(lines[0].supplier_name);
          const poResult = await run(
            `INSERT INTO purchase_orders (po_number, supplier_id, status, expected_at, notes, updated_at)
             VALUES (?, ?, 'ordered', ?, ?, CURRENT_TIMESTAMP)`,
            [poNumber, supplierId, lines[0].expected_at || "", lines[0].notes || "Imported purchase order"]
          );
          summary.created += 1;
          for (const line of lines) {
            const product = await getProductBySku(line.product_sku);
            await run(
              `INSERT INTO purchase_order_lines (purchase_order_id, product_id, qty_ordered, qty_received, unit_cost, notes, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
              [poResult.id, product.id, line.qty_ordered, line.qty_received, line.unit_cost, line.notes]
            );
          }
          await refreshPurchaseOrderStatus(poResult.id);
        }
      }
    });

    await recordImportRun({ type, mode: "apply", status: "success", validation, summary });
    await createActivity("import", type, "applied", summary);
    emitInventoryEvent("import.applied", summary);
    return { ...summary, validation };
  }

  app.get("/api/import/templates", async (req, res) => {
    res.json(importTemplateMetadata());
  });

  app.get("/api/import/templates/:type", async (req, res, next) => {
    try {
      const template = importTemplateForType(String(req.params.type || "").trim());
      if (!template) return res.status(404).json({ error: "Template not found" });
      const filePath = path.join(templatesDir, template.filename);
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Template file is missing" });
      return res.sendFile(filePath);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/import/validate/:type", async (req, res, next) => {
    try {
      const type = String(req.params.type || "").trim();
      if (!importTemplateForType(type)) throw requestError("Unsupported import type", 404);
      const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      const validation = await validateImportRows(type, rows);
      await recordImportRun({ type, mode: "validate", status: validation.invalid_rows > 0 ? "warning" : "success", validation });
      res.json(validation);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/import/:type", async (req, res, next) => {
    try {
      const type = String(req.params.type || "").trim();
      if (!importTemplateForType(type)) throw requestError("Unsupported import type", 404);
      const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      res.json(await applyImportRows(type, rows));
    } catch (error) {
      const type = String(req.params.type || "").trim();
      await recordImportRun({ type, mode: "apply", status: "failed", validation: error.validation || error.payload || null, errorMessage: error.message || "Import failed" }).catch(() => {});
      if (error.payload) return res.status(error.status || 400).json(error.payload);
      next(error);
    }
  });
}

module.exports = {
  createImportTools,
  TEMPLATE_DEFINITIONS,
};
