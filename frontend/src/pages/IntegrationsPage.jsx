import { useEffect, useState } from "react";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import { apiFetch } from "../lib/api";

function StatusBadge({ active, configured, enabled }) {
  if (active) return <span className="status-badge status-badge--green">Active</span>;
  if (enabled && !configured) return <span className="status-badge status-badge--amber">Missing credentials</span>;
  return <span className="status-badge status-badge--grey">Disabled</span>;
}

/**
 * TestConnectionResult — renders the result returned by POST /admin/integrations/jira/test.
 * Never shows credentials: the backend strips them before responding.
 */
function TestConnectionResult({ result }) {
  if (!result) return null;

  const alertClass =
    result.status === "connected" ? "alert success"
    : result.status === "disabled" ? "alert info"
    : "alert warning";

  const icon =
    result.status === "connected" ? "✓"
    : result.status === "disabled" ? "ⓘ"
    : "⚠";

  return (
    <div className={`${alertClass} integrations-test-result`} role="status">
      <strong>{icon} {result.message}</strong>
      {result.detail && <p className="integrations-test-detail">{result.detail}</p>}
    </div>
  );
}

function JiraCard({ status }) {
  const { enabled, configured, active, baseUrl, projectKey, poReceivedTransition, message } =
    status || {};

  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiFetch("/admin/integrations/jira/test", { method: "POST" });
      setTestResult(result);
    } catch (err) {
      setTestResult({
        ok: false,
        status: "failed",
        message: err.message || "Test request failed.",
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card title="Jira" subtitle="Issue Tracker Integration">
      <div className="integrations-card-body">
        <div className="integrations-status-row">
          <span className="integrations-label">Status</span>
          <StatusBadge active={active} configured={configured} enabled={enabled} />
        </div>

        {message && <p className="integrations-message">{message}</p>}

        <dl className="integrations-detail-list">
          <dt>Enabled</dt>
          <dd>{enabled ? "Yes" : "No"}</dd>

          <dt>Credentials configured</dt>
          <dd>{configured ? "Yes" : "No (check JIRA_EMAIL and JIRA_API_TOKEN)"}</dd>

          {baseUrl && (
            <>
              <dt>Base URL</dt>
              <dd>{baseUrl}</dd>
            </>
          )}

          {projectKey && (
            <>
              <dt>Project key</dt>
              <dd>{projectKey}</dd>
            </>
          )}

          {poReceivedTransition && (
            <>
              <dt>PO received transition</dt>
              <dd>{poReceivedTransition}</dd>
            </>
          )}
        </dl>

        <div className="integrations-setup-hint">
          <p>
            Set environment variables on the backend server to configure this integration.
            See <code>.env.example</code> for the full list of required variables.
            See <code>docs/jira-integration.md</code> for setup instructions.
          </p>
          {active && (
            <p className="integrations-active-hint">
              When a purchase order with a linked Jira issue key is received, a comment will be
              added to the Jira ticket automatically.
            </p>
          )}
        </div>

        <div className="integrations-test-section">
          <button
            type="button"
            className="button secondary integrations-test-btn"
            onClick={handleTest}
            disabled={testing}
          >
            {testing ? "Testing…" : "Test Jira Connection"}
          </button>
          <TestConnectionResult result={testResult} />
        </div>
      </div>
    </Card>
  );
}

export default function IntegrationsPage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/admin/integrations/status")
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Failed to load integration status.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Admin"
        title="Integrations"
        description="External service connections, health checks, and safe operational configuration for this workspace."
      />

      {loading && <p className="loading-text">Loading integration status…</p>}
      {error && <div className="alert error">{error}</div>}

      {!loading && !error && (
        <div className="integrations-grid">
          <JiraCard status={status?.jira} />
        </div>
      )}
    </div>
  );
}
