// Smoke tests for the Stock Control API.
// Requires the DB to be seeded. Run: npm test
// Node 18+ built-in test runner — no extra dependencies.
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { initializeDatabase: initDatabase } = require("../src/db/init");
const { closeDatabase, get, run } = require("../src/db/connection");
const { createApp } = require("../src/app");

let server;
let baseUrl;

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const requestOptions = {
      method: options.method || "GET",
      headers: options.body
        ? {
            "Content-Type": "application/json",
            ...(options.headers || {}),
          }
        : options.headers || {},
    };

    const req = http.request(`${baseUrl}${path}`, requestOptions, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on("error", reject);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

before(async () => {
  await initDatabase();
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await closeDatabase();
});

// ─── Health ───────────────────────────────────────────────────────────────────

describe("GET /health", () => {
  test("returns 200 with ok status", async () => {
    const { status, body } = await request("/health");
    assert.equal(status, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.service, "stock-control-backend");
    assert.ok(body.timestamp);
  });
});

// ─── 404 handler ─────────────────────────────────────────────────────────────

describe("404 handler", () => {
  test("returns error shape for unknown routes", async () => {
    const { status, body } = await request("/api/does-not-exist");
    assert.equal(status, 404);
    assert.equal(body.error, true);
    assert.ok(body.message);
  });
});

// ─── API health ───────────────────────────────────────────────────────────────

describe("GET /api/health", () => {
  test("returns 200 with database time", async () => {
    const { status, body } = await request("/api/health");
    assert.equal(status, 200);
    assert.equal(body.status, "ok");
    assert.ok(body.database?.database_time);
  });
});

// ─── Resource routes ─────────────────────────────────────────────────────────

// Resources with seed data (always have rows after db:reset)
const seededResources = ["customers", "suppliers", "products", "stock-locations"];
// Resources without default seed rows
const emptyResources = ["purchase-orders", "sales-orders"];

describe("GET /api/:resource", () => {
  for (const resource of seededResources) {
    test(`${resource} — returns 200 with seeded rows`, async () => {
      const { status, body } = await request(`/api/${resource}`);
      assert.equal(status, 200, `${resource} should return 200`);
      assert.ok(Array.isArray(body.items), `${resource} should have items array`);
      assert.ok(body.items.length > 0, `${resource} should have at least one seeded row`);
    });
  }

  for (const resource of emptyResources) {
    test(`${resource} — returns 200 with items array`, async () => {
      const { status, body } = await request(`/api/${resource}`);
      assert.equal(status, 200, `${resource} should return 200`);
      assert.ok(Array.isArray(body.items), `${resource} should have items array`);
    });
  }
});

// ─── Serials ─────────────────────────────────────────────────────────────────

describe("GET /api/serials", () => {
  test("returns empty array when no query", async () => {
    const { status, body } = await request("/api/serials");
    assert.equal(status, 200);
    assert.deepEqual(body.items, []);
  });

  test("returns 404 shape for unknown serial", async () => {
    const { status, body } = await request("/api/serials/DOES-NOT-EXIST-999");
    assert.equal(status, 404);
    assert.equal(body.error, true);
    assert.ok(body.message);
  });
});

// ─── Error format ────────────────────────────────────────────────────────────

describe("error response shape", () => {
  test("404 responses have { error: true, message }", async () => {
    const { body } = await request("/api/no-such-route");
    assert.equal(body.error, true);
    assert.equal(typeof body.message, "string");
  });
});

describe("master data routes", () => {
  test("POST and PUT /api/suppliers create, update, and audit supplier changes", async () => {
    const supplierCode = `SUP-T-${Date.now()}`;
    const createResponse = await request("/api/suppliers", {
      method: "POST",
      headers: { "X-User-Id": "1" },
      body: {
        supplierCode,
        name: "Test Supplier",
        contactName: "Tina Tester",
        email: "tina@test.example",
        phone: "01234 567890",
        address: "1 Test Way",
        notes: "Created from smoke test",
        active: true,
      },
    });

    assert.equal(createResponse.status, 201);
    assert.equal(createResponse.body.item.supplierCode, supplierCode);
    assert.equal(createResponse.body.item.active, true);

    const updateResponse = await request(`/api/suppliers/${createResponse.body.item.id}`, {
      method: "PUT",
      headers: { "X-User-Id": "1" },
      body: {
        ...createResponse.body.item,
        name: "Test Supplier Updated",
        active: false,
      },
    });

    assert.equal(updateResponse.status, 200);
    assert.equal(updateResponse.body.item.name, "Test Supplier Updated");
    assert.equal(updateResponse.body.item.active, false);

    const visibleSuppliers = await request("/api/suppliers");
    assert.equal(
      visibleSuppliers.body.items.some((item) => item.supplierCode === supplierCode),
      false,
    );

    const allSuppliers = await request("/api/suppliers?includeInactive=true");
    assert.equal(
      allSuppliers.body.items.some((item) => item.supplierCode === supplierCode && item.active === false),
      true,
    );

    const auditRow = await get(
      `
        SELECT action_type, entity_type, entity_ref
        FROM activity_log
        WHERE entity_type = 'supplier' AND entity_ref = ?
        ORDER BY id DESC
        LIMIT 1
      `,
      [supplierCode],
    );

    assert.equal(auditRow.action_type, "supplier_updated");
    assert.equal(auditRow.entity_type, "supplier");
    assert.equal(auditRow.entity_ref, supplierCode);
  });

  test("POST and PUT /api/products create, update, filter inactive, and audit changes", async () => {
    const sku = `SKU-T-${Date.now()}`;
    const createResponse = await request("/api/products", {
      method: "POST",
      headers: { "X-User-Id": "1" },
      body: {
        sku,
        name: "Test Product",
        category: "Sensors",
        description: "Created from smoke test",
        serialRequired: true,
        defaultUnitCost: 12.5,
        active: true,
      },
    });

    assert.equal(createResponse.status, 201);
    assert.equal(createResponse.body.item.sku, sku);
    assert.equal(createResponse.body.item.serialRequired, true);

    const updateResponse = await request(`/api/products/${createResponse.body.item.id}`, {
      method: "PUT",
      headers: { "X-User-Id": "1" },
      body: {
        ...createResponse.body.item,
        name: "Test Product Updated",
        serialRequired: false,
        defaultUnitCost: 19.99,
        active: false,
      },
    });

    assert.equal(updateResponse.status, 200);
    assert.equal(updateResponse.body.item.name, "Test Product Updated");
    assert.equal(updateResponse.body.item.serialRequired, false);
    assert.equal(updateResponse.body.item.active, false);

    const visibleProducts = await request("/api/products");
    assert.equal(
      visibleProducts.body.items.some((item) => item.sku === sku),
      false,
    );

    const allProducts = await request("/api/products?includeInactive=true");
    assert.equal(
      allProducts.body.items.some((item) => item.sku === sku && item.active === false),
      true,
    );

    const auditRow = await get(
      `
        SELECT action_type, entity_type, entity_ref
        FROM activity_log
        WHERE entity_type = 'product' AND entity_ref = ?
        ORDER BY id DESC
        LIMIT 1
      `,
      [sku],
    );

    assert.equal(auditRow.action_type, "product_updated");
    assert.equal(auditRow.entity_type, "product");
    assert.equal(auditRow.entity_ref, sku);
  });

  test("GET /api/suppliers?active=true and /api/products?active=true return active records", async () => {
    const suppliersResponse = await request("/api/suppliers?active=true");
    assert.equal(suppliersResponse.status, 200);
    assert.ok(suppliersResponse.body.items.length > 0);
    assert.equal(suppliersResponse.body.items.every((item) => item.active === true), true);

    const productsResponse = await request("/api/products?active=true");
    assert.equal(productsResponse.status, 200);
    assert.ok(productsResponse.body.items.length > 0);
    assert.equal(productsResponse.body.items.every((item) => item.active === true), true);
  });
});

describe("purchase order creation", () => {
  test("POST /api/purchase-orders creates an open purchase order, links sales orders, and appears in list/detail", async () => {
    const unique = Date.now();

    const supplierResult = await run(
      `
        INSERT INTO suppliers (code, name, status)
        VALUES (?, ?, 'active')
      `,
      [`SUP-PO-${unique}`, `PO Test Supplier ${unique}`]
    );

    const serialProductResult = await run(
      `
        INSERT INTO products (sku, name, is_serial_tracked, tracking_mode, cost_price, status)
        VALUES (?, ?, 1, 'serial', 450, 'active')
      `,
      [`SKU-PO-S-${unique}`, `Serial Product ${unique}`]
    );

    const nonSerialProductResult = await run(
      `
        INSERT INTO products (sku, name, is_serial_tracked, tracking_mode, cost_price, status)
        VALUES (?, ?, 0, 'quantity', 125, 'active')
      `,
      [`SKU-PO-N-${unique}`, `Quantity Product ${unique}`]
    );

    const customerResult = await run(
      `
        INSERT INTO customers (code, name, status)
        VALUES (?, ?, 'active')
      `,
      [`CUS-PO-${unique}`, `PO Test Customer ${unique}`]
    );

    const salesOrderOneResult = await run(
      `
        INSERT INTO sales_orders (order_number, customer_id, status, requested_at, dispatch_due_at, notes)
        VALUES (?, ?, 'open', '2026-04-30', '2026-05-02', 'First linked sales order')
      `,
      [`SO-PO-${unique}-1`, customerResult.id]
    );

    const salesOrderTwoResult = await run(
      `
        INSERT INTO sales_orders (order_number, customer_id, status, requested_at, dispatch_due_at, notes)
        VALUES (?, ?, 'open', '2026-04-30', '2026-05-03', 'Second linked sales order')
      `,
      [`SO-PO-${unique}-2`, customerResult.id]
    );

    const createResponse = await request("/api/purchase-orders", {
      method: "POST",
      headers: { "X-User-Id": "1" },
      body: {
        supplierId: supplierResult.id,
        orderDate: "2026-04-30",
        expectedDeliveryDate: "2026-05-07",
        supplierReference: "QUOTE-12345",
        notes: "Urgent customer order",
        linkedSalesOrders: [salesOrderOneResult.id, salesOrderTwoResult.id],
        lines: [
          {
            productId: serialProductResult.id,
            quantityOrdered: 1,
            unitCost: 450,
          },
          {
            productId: nonSerialProductResult.id,
            quantityOrdered: 4,
            unitCost: 125,
          },
        ],
      },
    });

    assert.equal(createResponse.status, 201);
    assert.match(createResponse.body.item.poNumber, /^PO-\d+$/);
    assert.equal(createResponse.body.item.status, "Open");
    assert.equal(createResponse.body.item.totals.lineCount, 2);
    assert.equal(createResponse.body.item.totals.quantityReceived, 0);
    assert.equal(createResponse.body.item.totals.quantityRemaining, 5);
    assert.equal(createResponse.body.item.lines[0].serialRequired, true);
    assert.equal(createResponse.body.item.lines[1].serialRequired, false);

    const listResponse = await request("/api/purchase-orders");
    assert.equal(listResponse.status, 200);
    assert.equal(
      listResponse.body.items.some((item) => item.poNumber === createResponse.body.item.poNumber),
      true
    );

    const detailResponse = await request(
      `/api/purchase-orders/${encodeURIComponent(createResponse.body.item.poNumber)}`
    );
    assert.equal(detailResponse.status, 200);
    assert.equal(detailResponse.body.poNumber, createResponse.body.item.poNumber);
    assert.equal(detailResponse.body.supplierReference, "QUOTE-12345");
    assert.equal(detailResponse.body.notes, "Urgent customer order");
    assert.equal(detailResponse.body.linkedSalesOrders.length, 2);
    assert.equal(detailResponse.body.lines.length, 2);
    assert.equal(detailResponse.body.lines.some((line) => line.serialTrackingRequired === true), true);
    assert.equal(detailResponse.body.lines.some((line) => line.serialTrackingRequired === false), true);

    const purchaseOrderRow = await get(
      `
        SELECT order_number, status, supplier_reference, linked_sales_order_id
        FROM purchase_orders
        WHERE id = ?
      `,
      [createResponse.body.item.id]
    );

    assert.equal(purchaseOrderRow.order_number, createResponse.body.item.poNumber);
    assert.equal(purchaseOrderRow.status, "open");
    assert.equal(purchaseOrderRow.supplier_reference, "QUOTE-12345");
    assert.equal(purchaseOrderRow.linked_sales_order_id, salesOrderOneResult.id);

    const linkedSalesOrderRows = await request("/api/sales-orders");
    const matchingSalesOrders = linkedSalesOrderRows.body.items.filter((item) =>
      [`SO-PO-${unique}-1`, `SO-PO-${unique}-2`].includes(item.orderNumber)
    );
    assert.equal(matchingSalesOrders.length, 2);

    const auditRow = await get(
      `
        SELECT action_type, entity_type, entity_ref
        FROM activity_log
        WHERE entity_type = 'purchase_order' AND entity_ref = ?
        ORDER BY id DESC
        LIMIT 1
      `,
      [createResponse.body.item.poNumber]
    );

    assert.equal(auditRow.action_type, "purchase_order_created");
    assert.equal(auditRow.entity_type, "purchase_order");
    assert.equal(auditRow.entity_ref, createResponse.body.item.poNumber);
  });

  test("POST /api/purchase-orders rejects invalid payloads", async () => {
    const invalidResponse = await request("/api/purchase-orders", {
      method: "POST",
      headers: { "X-User-Id": "1" },
      body: {
        supplierId: null,
        orderDate: "2026-04-30",
        lines: [],
      },
    });

    assert.equal(invalidResponse.status, 400);
    assert.equal(invalidResponse.body.error, true);
    assert.match(invalidResponse.body.message, /Supplier is required|At least one purchase order line is required/);
  });
});
