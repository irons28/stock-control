const { all, get, run } = require("../db/connection");

function createHttpError(status, message, details) {
  const error = new Error(message);
  error.status = status;
  if (details !== undefined) {
    error.details = details;
  }
  return error;
}

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeBoolean(value, fieldName) {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === 1 || value === "1" || value === "true") {
    return true;
  }

  if (value === 0 || value === "0" || value === "false") {
    return false;
  }

  throw createHttpError(400, `${fieldName} must be a boolean.`);
}

function normalizeMoney(value) {
  if (value === "" || value === null || value === undefined) {
    return 0;
  }

  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw createHttpError(400, "defaultUnitCost must be a valid non-negative number.");
  }

  return amount;
}

function mapSupplierRow(row) {
  if (!row) {
    return null;
  }

  const fallbackAddress = [row.address_line1, row.city, row.postcode, row.country]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(", ");

  return {
    id: row.id,
    supplierCode: row.code,
    name: row.name,
    contactName: row.contact_name || "",
    email: row.email || "",
    phone: row.phone || "",
    address: row.address || fallbackAddress,
    notes: row.notes || "",
    active: row.status === "active",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapProductRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category || "",
    description: row.description || "",
    serialRequired: Boolean(row.is_serial_tracked),
    defaultUnitCost: Number(row.cost_price || 0),
    active: row.status === "active",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildSearchFilter(query, columns) {
  const search = normalizeString(query).toLowerCase();

  if (!search) {
    return {
      clause: "",
      params: [],
    };
  }

  const like = `%${search}%`;
  return {
    clause: ` AND (${columns.map((column) => `LOWER(COALESCE(${column}, '')) LIKE ?`).join(" OR ")})`,
    params: columns.map(() => like),
  };
}

function parseIncludeInactive(value) {
  return value === true || value === "true" || value === "1";
}

async function logActivity(entityType, entityRef, actionType, summary, details, userContext = {}) {
  await run(
    `
      INSERT INTO activity_log (
        user_id,
        user_role,
        user_name,
        action_type,
        entity_type,
        entity_ref,
        summary,
        details_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      userContext.userId || null,
      userContext.userRole || "system",
      userContext.userName || "System",
      actionType,
      entityType,
      String(entityRef),
      summary,
      details ? JSON.stringify(details) : "",
    ],
  );
}

function normalizeSupplierPayload(payload, options = {}) {
  const supplierCode = normalizeString(payload?.supplierCode);
  const name = normalizeString(payload?.name);
  const contactName = normalizeString(payload?.contactName);
  const email = normalizeString(payload?.email);
  const phone = normalizeString(payload?.phone);
  const address = normalizeString(payload?.address);
  const notes = normalizeString(payload?.notes);
  const active = normalizeBoolean(payload?.active, "active");

  if (!name) {
    throw createHttpError(400, "Supplier name is required.");
  }

  if (!options.isUpdate && !supplierCode) {
    throw createHttpError(400, "Supplier code is required.");
  }

  if (options.isUpdate && !supplierCode) {
    throw createHttpError(400, "Supplier code cannot be blank.");
  }

  return {
    supplierCode,
    name,
    contactName,
    email,
    phone,
    address,
    notes,
    active,
  };
}

function normalizeProductPayload(payload, options = {}) {
  const sku = normalizeString(payload?.sku);
  const name = normalizeString(payload?.name);
  const category = normalizeString(payload?.category);
  const description = normalizeString(payload?.description);
  const serialRequired = normalizeBoolean(payload?.serialRequired, "serialRequired");
  const defaultUnitCost = normalizeMoney(payload?.defaultUnitCost);
  const active = normalizeBoolean(payload?.active, "active");

  if (!name) {
    throw createHttpError(400, "Product name is required.");
  }

  if (!options.isUpdate && !sku) {
    throw createHttpError(400, "Product SKU is required.");
  }

  if (options.isUpdate && !sku) {
    throw createHttpError(400, "Product SKU cannot be blank.");
  }

  return {
    sku,
    name,
    category,
    description,
    serialRequired,
    defaultUnitCost,
    active,
  };
}

async function ensureUniqueSupplierCode(supplierCode, excludeId = null) {
  const existing = await get(
    `
      SELECT id
      FROM suppliers
      WHERE LOWER(code) = LOWER(?)
        AND (? IS NULL OR id <> ?)
      LIMIT 1
    `,
    [supplierCode, excludeId, excludeId],
  );

  if (existing) {
    throw createHttpError(409, `Supplier code '${supplierCode}' already exists.`);
  }
}

async function ensureUniqueProductSku(sku, excludeId = null) {
  const existing = await get(
    `
      SELECT id
      FROM products
      WHERE LOWER(sku) = LOWER(?)
        AND (? IS NULL OR id <> ?)
      LIMIT 1
    `,
    [sku, excludeId, excludeId],
  );

  if (existing) {
    throw createHttpError(409, `Product SKU '${sku}' already exists.`);
  }
}

async function listSuppliers({ query = "", includeInactive = false } = {}) {
  const searchFilter = buildSearchFilter(query, ["code", "name", "contact_name", "email", "phone", "address", "notes"]);
  const items = await all(
    `
      SELECT *
      FROM suppliers
      WHERE (? = 1 OR status = 'active')
      ${searchFilter.clause}
      ORDER BY
        CASE WHEN status = 'active' THEN 0 ELSE 1 END,
        name ASC,
        code ASC
    `,
    [includeInactive ? 1 : 0, ...searchFilter.params],
  );

  return {
    items: items.map(mapSupplierRow),
    filters: {
      query: normalizeString(query),
      includeInactive: Boolean(includeInactive),
    },
  };
}

async function createSupplier(payload, userContext) {
  const normalized = normalizeSupplierPayload(payload);
  await ensureUniqueSupplierCode(normalized.supplierCode);

  const result = await run(
    `
      INSERT INTO suppliers (
        code,
        name,
        contact_name,
        email,
        phone,
        address,
        notes,
        status,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    [
      normalized.supplierCode,
      normalized.name,
      normalized.contactName,
      normalized.email,
      normalized.phone,
      normalized.address,
      normalized.notes,
      normalized.active ? "active" : "inactive",
    ],
  );

  const supplier = await get(`SELECT * FROM suppliers WHERE id = ?`, [result.id]);

  await logActivity(
    "supplier",
    normalized.supplierCode,
    "supplier_created",
    `Created supplier ${normalized.supplierCode} (${normalized.name})`,
    {
      supplierId: result.id,
      changes: mapSupplierRow(supplier),
    },
    userContext,
  );

  return mapSupplierRow(supplier);
}

async function updateSupplier(id, payload, userContext) {
  const supplierId = Number(id);
  if (!Number.isInteger(supplierId) || supplierId <= 0) {
    throw createHttpError(400, "Supplier id is invalid.");
  }

  const existing = await get(`SELECT * FROM suppliers WHERE id = ?`, [supplierId]);
  if (!existing) {
    throw createHttpError(404, "Supplier not found.");
  }

  const before = mapSupplierRow(existing);
  const normalized = normalizeSupplierPayload(payload, { isUpdate: true });
  await ensureUniqueSupplierCode(normalized.supplierCode, supplierId);

  await run(
    `
      UPDATE suppliers
      SET code = ?,
          name = ?,
          contact_name = ?,
          email = ?,
          phone = ?,
          address = ?,
          notes = ?,
          status = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [
      normalized.supplierCode,
      normalized.name,
      normalized.contactName,
      normalized.email,
      normalized.phone,
      normalized.address,
      normalized.notes,
      normalized.active ? "active" : "inactive",
      supplierId,
    ],
  );

  const supplier = await get(`SELECT * FROM suppliers WHERE id = ?`, [supplierId]);

  await logActivity(
    "supplier",
    normalized.supplierCode,
    "supplier_updated",
    `Updated supplier ${normalized.supplierCode} (${normalized.name})`,
    {
      supplierId,
      before,
      after: mapSupplierRow(supplier),
    },
    userContext,
  );

  return mapSupplierRow(supplier);
}

async function listProducts({ query = "", includeInactive = false } = {}) {
  const searchFilter = buildSearchFilter(query, ["sku", "name", "category", "description"]);
  const items = await all(
    `
      SELECT *
      FROM products
      WHERE (? = 1 OR status = 'active')
      ${searchFilter.clause}
      ORDER BY
        CASE WHEN status = 'active' THEN 0 ELSE 1 END,
        name ASC,
        sku ASC
    `,
    [includeInactive ? 1 : 0, ...searchFilter.params],
  );

  return {
    items: items.map(mapProductRow),
    filters: {
      query: normalizeString(query),
      includeInactive: Boolean(includeInactive),
    },
  };
}

async function createProduct(payload, userContext) {
  const normalized = normalizeProductPayload(payload);
  await ensureUniqueProductSku(normalized.sku);

  const result = await run(
    `
      INSERT INTO products (
        sku,
        name,
        category,
        description,
        is_serial_tracked,
        cost_price,
        status,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    [
      normalized.sku,
      normalized.name,
      normalized.category,
      normalized.description,
      normalized.serialRequired ? 1 : 0,
      normalized.defaultUnitCost,
      normalized.active ? "active" : "inactive",
    ],
  );

  const product = await get(`SELECT * FROM products WHERE id = ?`, [result.id]);

  await logActivity(
    "product",
    normalized.sku,
    "product_created",
    `Created product ${normalized.sku} (${normalized.name})`,
    {
      productId: result.id,
      changes: mapProductRow(product),
    },
    userContext,
  );

  return mapProductRow(product);
}

async function updateProduct(id, payload, userContext) {
  const productId = Number(id);
  if (!Number.isInteger(productId) || productId <= 0) {
    throw createHttpError(400, "Product id is invalid.");
  }

  const existing = await get(`SELECT * FROM products WHERE id = ?`, [productId]);
  if (!existing) {
    throw createHttpError(404, "Product not found.");
  }

  const before = mapProductRow(existing);
  const normalized = normalizeProductPayload(payload, { isUpdate: true });
  await ensureUniqueProductSku(normalized.sku, productId);

  await run(
    `
      UPDATE products
      SET sku = ?,
          name = ?,
          category = ?,
          description = ?,
          is_serial_tracked = ?,
          cost_price = ?,
          status = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [
      normalized.sku,
      normalized.name,
      normalized.category,
      normalized.description,
      normalized.serialRequired ? 1 : 0,
      normalized.defaultUnitCost,
      normalized.active ? "active" : "inactive",
      productId,
    ],
  );

  const product = await get(`SELECT * FROM products WHERE id = ?`, [productId]);

  await logActivity(
    "product",
    normalized.sku,
    "product_updated",
    `Updated product ${normalized.sku} (${normalized.name})`,
    {
      productId,
      before,
      after: mapProductRow(product),
    },
    userContext,
  );

  return mapProductRow(product);
}

module.exports = {
  createProduct,
  createSupplier,
  listProducts,
  listSuppliers,
  parseIncludeInactive,
  updateProduct,
  updateSupplier,
};
