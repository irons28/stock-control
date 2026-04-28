// Smoke tests for the Stock Control API.
// Requires the DB to be seeded. Run: npm test
// Node 18+ built-in test runner — no extra dependencies.
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { initializeDatabase: initDatabase } = require("../src/db/init");
const { closeDatabase } = require("../src/db/connection");
const { createApp } = require("../src/app");

let server;
let baseUrl;

function request(path) {
  return new Promise((resolve, reject) => {
    http.get(`${baseUrl}${path}`, (res) => {
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
    }).on("error", reject);
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
