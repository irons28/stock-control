import { useEffect, useState } from "react";
import Card from "../components/Card";
import { apiFetch } from "../lib/api";

function StatusBadge({ active, configured, enabled }) {
  if (active) return <span className="status-badge status-badge--green">Active</span>;
  if (enabled && !configured) return <span className="status-badge status-badge--amber">Missing credentials</span>;
  return <span className="status-badge status-badge--grey">Disabled</span>;
}

function JiraCard({ status }) {
  const { enabled, configured, active, baseUrl, projectKey, poReceivedTransition, message } =
    status || {};

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
          </p>
          {active && (
            <p className="integrations-active-hint">
              When a purchase order with a linked Jira issue key is received, a comment will be
              added to the Jira ticket automatically.
            </p>
          )}
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
      <div className="page-header">
        <div>
          <p className="eyebrow">Admin</p>
          <h2>Integrations</h2>
          <p className="page-subtitle">External service connections for this workspace.</p>
        </div>
      </div>

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
