/**
 * Jira REST API integration service.
 *
 * All public functions are fire-and-forget safe: they catch their own errors
 * and return null on failure so the caller never throws due to Jira issues.
 *
 * Configuration is read from environment variables at call time so that
 * test environments can override them without restarting the process.
 *
 * Requires Node 18+ (uses the built-in fetch API).
 */

const PREFIX = "[Jira]";

// ── Config helpers ─────────────────────────────────────────────────────────────

function readConfig() {
  return {
    enabled: process.env.JIRA_ENABLED === "true",
    baseUrl: (process.env.JIRA_BASE_URL || "").replace(/\/$/, ""),
    email: process.env.JIRA_EMAIL || "",
    apiToken: process.env.JIRA_API_TOKEN || "",
    projectKey: process.env.JIRA_PROJECT_KEY || "",
    poReceivedTransition: process.env.JIRA_PO_RECEIVED_TRANSITION || "",
  };
}

/**
 * Returns true only when Jira is both opted-in and fully configured.
 */
function isEnabled() {
  const cfg = readConfig();
  return cfg.enabled && Boolean(cfg.baseUrl) && Boolean(cfg.email) && Boolean(cfg.apiToken);
}

/**
 * Returns a safe (no credentials) config object for admin display.
 */
function getConfig() {
  const cfg = readConfig();
  const configured = Boolean(cfg.baseUrl) && Boolean(cfg.email) && Boolean(cfg.apiToken);
  return {
    enabled: cfg.enabled,
    configured,
    active: cfg.enabled && configured,
    baseUrl: cfg.baseUrl || null,
    projectKey: cfg.projectKey || null,
    poReceivedTransition: cfg.poReceivedTransition || null,
    message: cfg.enabled && configured
      ? "Jira integration is active."
      : cfg.enabled && !configured
        ? "Jira is enabled but credentials are missing."
        : "Jira integration is disabled.",
  };
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function authHeader(cfg) {
  const encoded = Buffer.from(`${cfg.email}:${cfg.apiToken}`).toString("base64");
  return `Basic ${encoded}`;
}

async function jiraRequest(method, path, body = null) {
  if (!isEnabled()) return null;
  const cfg = readConfig();

  const url = `${cfg.baseUrl}/rest/api/3${path}`;
  const options = {
    method,
    headers: {
      "Authorization": authHeader(cfg),
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
  };
  if (body !== null) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Jira ${method} ${path} returned ${response.status}: ${text}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch a Jira issue by key (e.g. "OPS-42").
 * Returns the issue object or null on failure.
 */
async function getIssue(issueKey) {
  if (!isEnabled() || !issueKey) return null;
  try {
    return await jiraRequest("GET", `/issue/${encodeURIComponent(issueKey)}`);
  } catch (err) {
    console.error(PREFIX, `getIssue(${issueKey}) failed:`, err.message);
    return null;
  }
}

/**
 * Add a plain-text comment to a Jira issue.
 * Returns the created comment object or null on failure.
 */
async function addComment(issueKey, commentText) {
  if (!isEnabled() || !issueKey || !commentText) return null;
  try {
    // Jira Cloud REST v3 uses Atlassian Document Format (ADF) for comments.
    const body = {
      body: {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: commentText
              .split("\n")
              .flatMap((line, i, arr) =>
                i < arr.length - 1
                  ? [{ type: "text", text: line }, { type: "hardBreak" }]
                  : [{ type: "text", text: line }]
              )
              .filter((node) => node.type === "hardBreak" || node.text !== ""),
          },
        ],
      },
    };
    const result = await jiraRequest("POST", `/issue/${encodeURIComponent(issueKey)}/comment`, body);
    console.log(PREFIX, `Comment added to ${issueKey}`);
    return result;
  } catch (err) {
    console.error(PREFIX, `addComment(${issueKey}) failed:`, err.message);
    return null;
  }
}

/**
 * Transition a Jira issue to the named status (e.g. "Done").
 * Looks up available transitions and picks the first one whose name matches
 * (case-insensitive).  Returns the transition result or null on failure.
 */
async function transitionIssue(issueKey, transitionName) {
  if (!isEnabled() || !issueKey || !transitionName) return null;
  try {
    const data = await jiraRequest("GET", `/issue/${encodeURIComponent(issueKey)}/transitions`);
    if (!data || !Array.isArray(data.transitions)) return null;

    const match = data.transitions.find(
      (t) => t.name.toLowerCase() === transitionName.toLowerCase()
    );
    if (!match) {
      console.warn(PREFIX, `Transition "${transitionName}" not found for ${issueKey}. Available:`, data.transitions.map((t) => t.name).join(", "));
      return null;
    }

    const result = await jiraRequest("POST", `/issue/${encodeURIComponent(issueKey)}/transitions`, {
      transition: { id: match.id },
    });
    console.log(PREFIX, `Transitioned ${issueKey} → "${transitionName}"`);
    return result;
  } catch (err) {
    console.error(PREFIX, `transitionIssue(${issueKey}, "${transitionName}") failed:`, err.message);
    return null;
  }
}

/**
 * Test the Jira connection without exposing credentials.
 *
 * Returns an object:
 *   { ok: bool, status: 'disabled'|'missing_credentials'|'connected'|'failed',
 *     message: string, detail?: string }
 *
 * Never includes the API token, email, or auth header in the return value.
 */
async function testConnection() {
  const cfg = readConfig();

  if (!cfg.enabled) {
    return { ok: false, status: "disabled", message: "Jira integration is disabled (JIRA_ENABLED is not true)." };
  }

  const configured = Boolean(cfg.baseUrl) && Boolean(cfg.email) && Boolean(cfg.apiToken);
  if (!configured) {
    const missing = [];
    if (!cfg.baseUrl)   missing.push("JIRA_BASE_URL");
    if (!cfg.email)     missing.push("JIRA_EMAIL");
    if (!cfg.apiToken)  missing.push("JIRA_API_TOKEN");
    return {
      ok: false,
      status: "missing_credentials",
      message: `Missing required configuration: ${missing.join(", ")}.`,
    };
  }

  // Try to reach the Jira API — use /myself as a lightweight connectivity check.
  try {
    const url = `${cfg.baseUrl}/rest/api/3/myself`;
    const encoded = Buffer.from(`${cfg.email}:${cfg.apiToken}`).toString("base64");
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${encoded}`,
        Accept: "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      // Only return safe fields — never accountId, email, avatar, etc.
      const displayName = data.displayName || "unknown user";
      let detail = `Authenticated as "${displayName}"`;
      if (cfg.projectKey) {
        detail += `. Project key: ${cfg.projectKey}`;
      }
      return { ok: true, status: "connected", message: "Jira connection successful.", detail };
    }

    // Non-2xx response — return the status code, never the auth header.
    const text = await response.text().catch(() => "");
    const safe = text.slice(0, 200).replace(/<[^>]*>/g, ""); // strip any HTML
    return {
      ok: false,
      status: "failed",
      message: `Jira returned HTTP ${response.status}.`,
      detail: safe || undefined,
    };
  } catch (err) {
    return {
      ok: false,
      status: "failed",
      message: "Could not reach the Jira server.",
      detail: err.message,
    };
  }
}

module.exports = { isEnabled, getConfig, getIssue, addComment, transitionIssue, testConnection };
