/**
 * Jira integration tests.
 *
 * Uses Node 18+ built-in test runner (no extra dependencies).
 * All Jira HTTP calls are stubbed — the real Jira API is never contacted.
 *
 * Run: npm test (picks up all test files via package.json glob or explicit path)
 *      node --test tests/jira.test.js
 */
const { test, before, after, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { initializeDatabase } = require("../src/db/init");
const { closeDatabase, get, run } = require("../src/db/connection");
const { createApp } = require("../src/app");

let server;
let baseUrl;

// ── Test helpers ──────────────────────────────────────────────────────────────

function adminHeaders() {
  return {
    "X-User-Id": "1",
    "X-User-Name": "Alex Admin",
    "X-User-Role": "admin",
    "Content-Type": "application/json",
  };
}

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${baseUrl}${path}`,
      {
        method: options.method || "GET",
        headers: options.headers || adminHeaders(),
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
          catch { resolve({ status: res.statusCode, body }); }
        });
      },
    );
    req.on("error", reject);
    if (options.body) req.write(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
    req.end();
  });
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

before(async () => {
  await initializeDatabase();
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await closeDatabase();
});

// ── Env helpers ───────────────────────────────────────────────────────────────

/**
 * Temporarily override process.env vars for the duration of a test.
 * Returns a restore function.
 */
function withEnv(vars) {
  const original = {};
  for (const [k, v] of Object.entries(vars)) {
    original[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  return function restore() {
    for (const [k, v] of Object.entries(original)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  };
}

// ── Stub global fetch ─────────────────────────────────────────────────────────

/**
 * Replace global fetch for the duration of fn(), then restore.
 * stubFetch receives the Request URL and returns { ok, status, body }.
 */
async function withFetchStub(stubFn, fn) {
  const original = global.fetch;
  global.fetch = async (url, options) => {
    const result = await stubFn(url, options);
    return {
      ok: result.ok,
      status: result.status,
      headers: { get: () => "application/json" },
      json: async () => result.body,
      text: async () => JSON.stringify(result.body),
    };
  };
  try {
    return await fn();
  } finally {
    global.fetch = original;
  }
}

// ── Seed helpers ──────────────────────────────────────────────────────────────

async function seedPOWithJiraKey(jiraKey) {
  const unique = Date.now() + Math.floor(Math.random() * 10000);

  const supplier = await run(
    `INSERT INTO suppliers (code, name, status) VALUES (?, ?, 'active')`,
    [`SUP-J-${unique}`, `Jira Test Supplier ${unique}`],
  );

  const product = await run(
    `INSERT INTO products (sku, name, is_serial_tracked, tracking_mode, cost_price, status)
     VALUES (?, ?, 0, 'quantity', 50, 'active')`,
    [`SKU-J-${unique}`, `Jira Test Product ${unique}`],
  );

  const po = await run(
    `INSERT INTO purchase_orders (order_number, supplier_id, status, ordered_at, jira_issue_key)
     VALUES (?, ?, 'open', date('now'), ?)`,
    [`PO-J-${unique}`, supplier.id, jiraKey],
  );

  await run(
    `INSERT INTO purchase_order_lines (purchase_order_id, product_id, quantity_ordered, quantity_received)
     VALUES (?, ?, 2, 0)`,
    [po.id, product.id],
  );

  const location = await get(`SELECT id FROM stock_locations LIMIT 1`);

  return {
    poNumber: `PO-J-${unique}`,
    productId: product.id,
    locationId: location?.id,
  };
}

// ── Tests: jira_issue_key CRUD ────────────────────────────────────────────────

describe("PATCH /api/purchase-orders/:poNumber/jira-key", () => {
  test("sets a valid Jira issue key", async () => {
    const { poNumber } = await seedPOWithJiraKey(null);

    const res = await request(`/api/purchase-orders/${encodeURIComponent(poNumber)}/jira-key`, {
      method: "PATCH",
      headers: adminHeaders(),
      body: { jiraIssueKey: "OPS-42" },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.jiraIssueKey, "OPS-42");

    const row = await get(`SELECT jira_issue_key FROM purchase_orders WHERE order_number = ?`, [poNumber]);
    assert.equal(row.jira_issue_key, "OPS-42");
  });

  test("clears the Jira issue key when given an empty string", async () => {
    const { poNumber } = await seedPOWithJiraKey("OPS-99");

    const res = await request(`/api/purchase-orders/${encodeURIComponent(poNumber)}/jira-key`, {
      method: "PATCH",
      headers: adminHeaders(),
      body: { jiraIssueKey: "" },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.jiraIssueKey, null);

    const row = await get(`SELECT jira_issue_key FROM purchase_orders WHERE order_number = ?`, [poNumber]);
    assert.equal(row.jira_issue_key, null);
  });

  test("rejects invalid key format", async () => {
    const { poNumber } = await seedPOWithJiraKey(null);

    const res = await request(`/api/purchase-orders/${encodeURIComponent(poNumber)}/jira-key`, {
      method: "PATCH",
      headers: adminHeaders(),
      body: { jiraIssueKey: "not-valid" },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, true);
    assert.match(res.body.message, /format/i);
  });

  test("writes an audit log entry when key is set", async () => {
    const { poNumber } = await seedPOWithJiraKey(null);

    await request(`/api/purchase-orders/${encodeURIComponent(poNumber)}/jira-key`, {
      method: "PATCH",
      headers: adminHeaders(),
      body: { jiraIssueKey: "AUDIT-7" },
    });

    const log = await get(
      `SELECT action_type, entity_ref, summary FROM activity_log
       WHERE entity_type = 'purchase_order' AND entity_ref = ? AND action_type LIKE 'jira_%'
       ORDER BY id DESC LIMIT 1`,
      [poNumber],
    );

    assert.ok(log, "Expected an audit log entry");
    assert.equal(log.action_type, "jira_key_set");
    assert.match(log.summary, /AUDIT-7/);
  });

  test("warehouse role cannot set jira key (403)", async () => {
    const { poNumber } = await seedPOWithJiraKey(null);

    const res = await request(`/api/purchase-orders/${encodeURIComponent(poNumber)}/jira-key`, {
      method: "PATCH",
      headers: {
        "X-User-Id": "wh-1",
        "X-User-Name": "Wayne Warehouse",
        "X-User-Role": "warehouse",
        "Content-Type": "application/json",
      },
      body: { jiraIssueKey: "OPS-1" },
    });

    assert.equal(res.status, 403);
  });
});

describe("PATCH /api/sales-orders/:soNumber/jira-key", () => {
  async function seedSO() {
    const unique = Date.now() + Math.floor(Math.random() * 10000);
    const customer = await run(
      `INSERT INTO customers (code, name, status) VALUES (?, ?, 'active')`,
      [`CUS-J-${unique}`, `Jira Test Customer ${unique}`],
    );
    await run(
      `INSERT INTO sales_orders (order_number, customer_id, status, requested_at) VALUES (?, ?, 'open', date('now'))`,
      [`SO-J-${unique}`, customer.id],
    );
    return `SO-J-${unique}`;
  }

  test("sets a valid Jira issue key on a sales order", async () => {
    const soNumber = await seedSO();

    const res = await request(`/api/sales-orders/${encodeURIComponent(soNumber)}/jira-key`, {
      method: "PATCH",
      headers: adminHeaders(),
      body: { jiraIssueKey: "SO-55" },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.jiraIssueKey, "SO-55");
  });

  test("SO detail response includes jiraIssueKey", async () => {
    const soNumber = await seedSO();
    await run(`UPDATE sales_orders SET jira_issue_key = 'ABC-7' WHERE order_number = ?`, [soNumber]);

    const res = await request(`/api/sales-orders/${encodeURIComponent(soNumber)}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.order.jiraIssueKey, "ABC-7");
  });
});

// ── Tests: Jira integration status endpoint ──────────────────────────────────

describe("GET /api/admin/integrations/status", () => {
  test("never returns API token or email in response", async () => {
    const restore = withEnv({
      JIRA_ENABLED: "true",
      JIRA_BASE_URL: "https://test.atlassian.net",
      JIRA_EMAIL: "secret@example.com",
      JIRA_API_TOKEN: "super-secret-token-123",
    });

    try {
      const res = await request("/api/admin/integrations/status");
      assert.equal(res.status, 200);

      const responseText = JSON.stringify(res.body);
      assert.ok(!responseText.includes("super-secret-token-123"), "API token must not appear in response");
      assert.ok(!responseText.includes("secret@example.com"), "Email must not appear in response");
      assert.equal(res.body.jira.baseUrl, "https://test.atlassian.net");
      assert.equal(res.body.jira.configured, true);
      assert.equal(res.body.jira.active, true);
    } finally {
      restore();
    }
  });

  test("non-admin role cannot access integration status (403)", async () => {
    const res = await request("/api/admin/integrations/status", {
      headers: {
        "X-User-Id": "wh-1",
        "X-User-Name": "Wayne Warehouse",
        "X-User-Role": "warehouse",
      },
    });
    assert.equal(res.status, 403);
  });
});

// ── Tests: POST /api/admin/integrations/jira/test ────────────────────────────

describe("POST /api/admin/integrations/jira/test", () => {
  test("returns disabled when JIRA_ENABLED is false", async () => {
    const restore = withEnv({ JIRA_ENABLED: "false" });
    try {
      const res = await request("/api/admin/integrations/jira/test", { method: "POST" });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, "disabled");
      assert.equal(res.body.ok, false);
    } finally {
      restore();
    }
  });

  test("returns missing_credentials when env vars absent", async () => {
    const restore = withEnv({
      JIRA_ENABLED: "true",
      JIRA_BASE_URL: undefined,
      JIRA_EMAIL: undefined,
      JIRA_API_TOKEN: undefined,
    });
    try {
      const res = await request("/api/admin/integrations/jira/test", { method: "POST" });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, "missing_credentials");
      assert.equal(res.body.ok, false);
    } finally {
      restore();
    }
  });

  test("returns connected when Jira responds OK (mocked)", async () => {
    const restore = withEnv({
      JIRA_ENABLED: "true",
      JIRA_BASE_URL: "https://mocked.atlassian.net",
      JIRA_EMAIL: "test@example.com",
      JIRA_API_TOKEN: "mock-token",
    });

    try {
      const res = await withFetchStub(
        async () => ({ ok: true, status: 200, body: { displayName: "Test Bot", accountId: "abc123" } }),
        () => request("/api/admin/integrations/jira/test", { method: "POST" }),
      );

      assert.equal(res.status, 200);
      assert.equal(res.body.status, "connected");
      assert.equal(res.body.ok, true);
      // Must NOT expose account ID, email, or token
      const bodyText = JSON.stringify(res.body);
      assert.ok(!bodyText.includes("mock-token"), "Token must not appear in test result");
      assert.ok(!bodyText.includes("test@example.com"), "Email must not appear in test result");
      assert.ok(!bodyText.includes("abc123"), "accountId must not appear in test result");
      assert.ok(bodyText.includes("Test Bot"), "displayName may be shown as safe info");
    } finally {
      restore();
    }
  });

  test("returns failed when Jira returns 401 (mocked)", async () => {
    const restore = withEnv({
      JIRA_ENABLED: "true",
      JIRA_BASE_URL: "https://mocked.atlassian.net",
      JIRA_EMAIL: "test@example.com",
      JIRA_API_TOKEN: "bad-token",
    });

    try {
      const res = await withFetchStub(
        async () => ({ ok: false, status: 401, body: { message: "Unauthorized" } }),
        () => request("/api/admin/integrations/jira/test", { method: "POST" }),
      );

      assert.equal(res.status, 200);
      assert.equal(res.body.status, "failed");
      assert.equal(res.body.ok, false);
      assert.match(res.body.message, /401/);
    } finally {
      restore();
    }
  });

  test("non-admin cannot access test endpoint (403)", async () => {
    const res = await request("/api/admin/integrations/jira/test", {
      method: "POST",
      headers: {
        "X-User-Id": "off-1",
        "X-User-Name": "Olivia Office",
        "X-User-Role": "office",
        "Content-Type": "application/json",
      },
    });
    assert.equal(res.status, 403);
  });
});

// ── Tests: receive goods with Jira disabled / no key / success / failure ──────

describe("Receive goods — Jira integration scenarios", () => {
  async function receiveFirstLine(poNumber, locationId) {
    const lines = await get(
      `SELECT pol.id, pol.product_id, pol.quantity_ordered
       FROM purchase_order_lines pol
       JOIN purchase_orders po ON po.id = pol.purchase_order_id
       WHERE po.order_number = ? LIMIT 1`,
      [poNumber],
    );

    return request(`/api/purchase-orders/${encodeURIComponent(poNumber)}/receive`, {
      method: "POST",
      headers: adminHeaders(),
      body: {
        receivedBy: "Test User",
        deliveryNumber: `DEL-TEST-${Date.now()}`,
        lines: [
          {
            purchaseOrderLineId: lines.id,
            quantityReceived: lines.quantity_ordered,
            serialNumbers: [],
          },
        ],
        locationId: locationId || 1,
      },
    });
  }

  test("receipt succeeds and no Jira call is made when JIRA_ENABLED=false", async () => {
    const restore = withEnv({ JIRA_ENABLED: "false" });
    let fetchCalled = false;

    try {
      const { poNumber, locationId } = await seedPOWithJiraKey("OPS-100");
      const res = await withFetchStub(
        async () => { fetchCalled = true; return { ok: true, status: 200, body: {} }; },
        () => receiveFirstLine(poNumber, locationId),
      );

      assert.equal(res.status, 201, "Receipt should succeed");
      assert.equal(fetchCalled, false, "Jira fetch should NOT be called when disabled");
      assert.equal(res.body.jiraResult?.attempted, false);
    } finally {
      restore();
    }
  });

  test("receipt succeeds and no Jira call is made when PO has no jira_issue_key", async () => {
    const restore = withEnv({
      JIRA_ENABLED: "true",
      JIRA_BASE_URL: "https://mocked.atlassian.net",
      JIRA_EMAIL: "test@example.com",
      JIRA_API_TOKEN: "mock-token",
    });
    let fetchCalled = false;

    try {
      const { poNumber, locationId } = await seedPOWithJiraKey(null);
      const res = await withFetchStub(
        async () => { fetchCalled = true; return { ok: true, status: 200, body: {} }; },
        () => receiveFirstLine(poNumber, locationId),
      );

      assert.equal(res.status, 201, "Receipt should succeed");
      assert.equal(fetchCalled, false, "Jira fetch should NOT be called when no issue key set");
      assert.equal(res.body.jiraResult?.attempted, false);
    } finally {
      restore();
    }
  });

  test("receipt succeeds and jiraResult.success=true when Jira comment call succeeds (mocked)", async () => {
    const restore = withEnv({
      JIRA_ENABLED: "true",
      JIRA_BASE_URL: "https://mocked.atlassian.net",
      JIRA_EMAIL: "test@example.com",
      JIRA_API_TOKEN: "mock-token",
    });

    try {
      const { poNumber, locationId } = await seedPOWithJiraKey("OPS-200");
      const res = await withFetchStub(
        async (url) => {
          // Stub both comment POST and transitions GET
          if (url.includes("/transitions")) return { ok: true, status: 200, body: { transitions: [] } };
          if (url.includes("/comment"))    return { ok: true, status: 201, body: { id: "99001" } };
          return { ok: true, status: 200, body: {} };
        },
        () => receiveFirstLine(poNumber, locationId),
      );

      assert.equal(res.status, 201, "Receipt should succeed");
      assert.equal(res.body.jiraResult?.attempted, true);
      assert.equal(res.body.jiraResult?.success, true);
      assert.equal(res.body.jiraResult?.issueKey, "OPS-200");

      // Credentials must not appear in the receipt response
      const bodyText = JSON.stringify(res.body);
      assert.ok(!bodyText.includes("mock-token"), "Token must not appear in receipt response");
      assert.ok(!bodyText.includes("test@example.com"), "Email must not appear in receipt response");
    } finally {
      restore();
    }
  });

  test("receipt still succeeds and jiraResult.success=false when Jira comment call fails (mocked)", async () => {
    const restore = withEnv({
      JIRA_ENABLED: "true",
      JIRA_BASE_URL: "https://mocked.atlassian.net",
      JIRA_EMAIL: "test@example.com",
      JIRA_API_TOKEN: "mock-token",
    });

    try {
      const { poNumber, locationId } = await seedPOWithJiraKey("OPS-500");
      const res = await withFetchStub(
        async () => ({ ok: false, status: 500, body: { errorMessages: ["Internal error"] } }),
        () => receiveFirstLine(poNumber, locationId),
      );

      assert.equal(res.status, 201, "Receipt should still succeed even when Jira fails");
      assert.equal(res.body.jiraResult?.attempted, true);
      assert.equal(res.body.jiraResult?.success, false);
      assert.equal(res.body.jiraResult?.issueKey, "OPS-500");
    } finally {
      restore();
    }
  });
});
