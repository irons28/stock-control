import PageHeader from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";
import { usePermission } from "../hooks/usePermission";
import { formatDateTime, formatLabel } from "../lib/formatters";

const ROLE_PILL_CLASS = {
  admin: "role-pill role-pill--admin",
  management: "role-pill role-pill--management",
  purchasing: "role-pill role-pill--purchasing",
  warehouse: "role-pill role-pill--warehouse",
  dispatch: "role-pill role-pill--dispatch",
  system: "role-pill role-pill--system",
};

function RolePill({ role }) {
  const cls = ROLE_PILL_CLASS[role] || "role-pill role-pill--system";
  return <span className={cls}>{role || "system"}</span>;
}

function AuditLogPage() {
  const canView = usePermission("audit:view");
  const { status, data, error } = useApiResource(canView ? "/audit-log" : null);

  if (!canView) {
    return (
      <div className="access-denied-card">
        <div className="access-denied-icon" aria-hidden="true">&#128274;</div>
        <h3>Access Denied</h3>
        <p>You do not have permission to view the audit log. This area is restricted to administrators and management.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Audit Log"
        description="User activity and action history for compliance and accountability."
      />

      {status === "loading" && <p className="text-muted">Loading audit records&hellip;</p>}
      {status === "error" && <p className="text-muted">{error}</p>}

      {status === "success" && (
        <>
          {!data?.items?.length ? (
            <p className="text-muted">No audit records yet.</p>
          ) : (
            <div className="table-wrapper">
              <table className="data-table audit-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>Role</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={row.id}>
                      <td className="text-mono">{formatDateTime(row.created_at)}</td>
                      <td>{row.user_name || "System"}</td>
                      <td>
                        <RolePill role={row.user_role} />
                      </td>
                      <td>{formatLabel(row.action_type)}</td>
                      <td>
                        {row.entity_type && (
                          <span>
                            {formatLabel(row.entity_type)}
                            {row.entity_ref ? ` — ${row.entity_ref}` : ""}
                          </span>
                        )}
                      </td>
                      <td className="text-muted">{row.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default AuditLogPage;
