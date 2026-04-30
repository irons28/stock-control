// Smoke tests for the Stock Control API.
// Requires the DB to be seeded. Run: npm test
// Node 18+ built-in test runner — no extra dependencies.
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { initializeDatabase: initDatabase } = require("../src/db/init");
const { closeDatabase, get } = require("../src/db/connection");
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
});
