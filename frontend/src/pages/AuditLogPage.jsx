import { useState } from "react";
import PageHeader from "../components/PageHeader";
import ActivityTimeline from "../components/ActivityTimeline";
import { useApiResource } from "../hooks/useApiResource";
import { usePermission } from "../hooks/usePermission";
import { formatLabel } from "../lib/formatters";

function buildQuery(filters) {
  const params = new URLSearchParams();
  if (filters.action)      params.set("action", filters.action);
  if (filters.entity_type) params.set("entity_type", filters.entity_type);
  if (filters.user)        params.set("user", filters.user);
  params.set("limit", "100");
  return `/audit-log?${params.toString()}`;
}

function FilterBar({ filters, meta, onChange, onClear }) {
  const hasFilters = filters.action || filters.entity_type || filters.user;

  return (
    <div className="tl-filter-bar">
      <div className="tl-filter-group">
        <label className="tl-filter-label" htmlFor="tl-filter-user">User</label>
        <select
          id="tl-filter-user"
          className="tl-filter-select"
          value={filters.user}
          onChange={(e) => onChange({ ...filters, user: e.target.value })}
        >
          <option value="">All users</option>
          {(meta?.users || []).map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
      </div>

      <div className="tl-filter-group">
        <label className="tl-filter-label" htmlFor="tl-filter-action">Action</label>
        <select
          id="tl-filter-action"
          className="tl-filter-select"
          value={filters.action}
          onChange={(e) => onChange({ ...filters, action: e.target.value })}
        >
          <option value="">All actions</option>
          {(meta?.actions || []).map((a) => (
            <option key={a} value={a}>{formatLabel(a)}</option>
          ))}
        </select>
      </div>

      <div className="tl-filter-group">
        <label className="tl-filter-label" htmlFor="tl-filter-entity">Entity type</label>
        <select
          id="tl-filter-entity"
          className="tl-filter-select"
          value={filters.entity_type}
          onChange={(e) => onChange({ ...filters, entity_type: e.target.value })}
        >
          <option value="">All entities</option>
          {(meta?.entities || []).map((e) => (
            <option key={e} value={e}>{formatLabel(e)}</option>
          ))}
        </select>
      </div>

      {hasFilters && (
        <button type="button" className="tl-filter-clear" onClick={onClear}>
          Clear filters
        </button>
      )}
    </div>
  );
}

const EMPTY_FILTERS = { action: "", entity_type: "", user: "" };

function AuditLogPage() {
  const canView = usePermission("audit:view");
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const meta = useApiResource(canView ? "/audit-log/meta" : null);
  const log  = useApiResource(canView ? buildQuery(filters) : null);

  if (!canView) {
    return (
      <div className="access-denied-card">
        <div className="access-denied-icon" aria-hidden="true">&#128274;</div>
        <h3>Access Denied</h3>
        <p>The audit log is restricted to administrators.</p>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Administration"
        title="Audit Log"
        description="Who did what and when — a full history of actions across the platform."
        actions={
          <button type="button" className="btn btn--secondary" onClick={log.reload}>
            Refresh
          </button>
        }
      />

      <FilterBar
        filters={filters}
        meta={meta.data}
        onChange={setFilters}
        onClear={() => setFilters(EMPTY_FILTERS)}
      />

      <div className="tl-page-count">
        {log.status === "success" && (
          <span>
            {log.data?.items?.length ?? 0} event{log.data?.items?.length !== 1 ? "s" : ""}
            {(filters.action || filters.entity_type || filters.user) ? " (filtered)" : ""}
          </span>
        )}
      </div>

      <ActivityTimeline
        events={log.data?.items}
        loading={log.status === "loading"}
        error={log.status === "error" ? (log.error || "Unable to load audit log.") : null}
        emptyMessage="No activity recorded yet."
      />
    </div>
  );
}

export default AuditLogPage;
