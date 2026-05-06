import { useEffect, useMemo, useState } from "react";
import Button from "../components/Button";
import Card from "../components/Card";
import DataTable from "../components/DataTable";
import FieldHelp from "../components/FieldHelp";
import GuidedHelpPanel from "../components/GuidedHelpPanel";
import HelpTooltip from "../components/HelpTooltip";
import PageHeader from "../components/PageHeader";
import { HELP_CONTENT } from "../config/helpContent";
import { useApiResource } from "../hooks/useApiResource";
import { apiFetch } from "../lib/api";

const USER_HELP = {
  title: "User management",
  summary: "Admins can create users, change roles, deactivate accounts, and reset passwords without exposing password hashes.",
  steps: [
    "Create a user with a unique username and a temporary password.",
    "Set the role that matches the person's day-to-day job.",
    "Deactivate accounts instead of deleting them when access should stop.",
    "Use password reset when a user needs a fresh sign-in.",
  ],
  warnings: [
    "The final active admin account cannot be deactivated or demoted.",
  ],
};

function emptyCreateForm() {
  return {
    username: "",
    display_name: "",
    email: "",
    password: "",
    role: "warehouse",
    active: true,
  };
}

function emptyEditForm(user) {
  return {
    display_name: user.display_name || user.full_name || "",
    role: user.role || "warehouse",
    active: user.active !== false,
  };
}

function UsersPage() {
  const users = useApiResource("/users");
  const [banner, setBanner] = useState("");
  const [error, setError] = useState("");
  const [createForm, setCreateForm] = useState(emptyCreateForm());
  const [editingId, setEditingId] = useState("");
  const [editForm, setEditForm] = useState(null);
  const [passwordReset, setPasswordReset] = useState({ userId: "", password: "" });
  const [submitting, setSubmitting] = useState(false);

  const rows = users.data?.items || [];
  const activeEditUser = useMemo(
    () => rows.find((user) => String(user.id) === String(editingId)) || null,
    [editingId, rows]
  );

  useEffect(() => {
    if (activeEditUser && !editForm) {
      setEditForm(emptyEditForm(activeEditUser));
    }
  }, [activeEditUser, editForm]);

  const columns = [
    {
      key: "username",
      header: "Username",
      render: (row) => (
        <div className="master-data-primary-cell">
          <strong>{row.username}</strong>
          <span>{row.email || "No email stored"}</span>
        </div>
      ),
    },
    {
      key: "display_name",
      header: "Display name",
      render: (row) => row.display_name,
    },
    {
      key: "role",
      header: "Role",
      render: (row) => <span className={`pill role-pill role-${row.role}`}>{row.role}</span>,
    },
    {
      key: "active",
      header: "Status",
      render: (row) => (
        <span className={row.active ? "pill success" : "pill neutral"}>
          {row.active ? "Active" : "Inactive"}
        </span>
      ),
    },
    {
      key: "last_login_at",
      header: "Last login",
      render: (row) => row.last_login_at || "Never",
    },
  ];

  async function handleCreate(event) {
    event.preventDefault();
    setSubmitting(true);
    setBanner("");
    setError("");

    try {
      await apiFetch("/users", {
        method: "POST",
        body: JSON.stringify(createForm),
      });
      setCreateForm(emptyCreateForm());
      setBanner("User created successfully.");
      users.reload();
    } catch (requestError) {
      setError(requestError.message || "Unable to create user.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveUser(event) {
    event.preventDefault();
    if (!activeEditUser || !editForm) {
      return;
    }

    setSubmitting(true);
    setBanner("");
    setError("");

    try {
      await apiFetch(`/users/${activeEditUser.id}`, {
        method: "PUT",
        body: JSON.stringify(editForm),
      });
      setBanner("User updated successfully.");
      users.reload();
    } catch (requestError) {
      setError(requestError.message || "Unable to update user.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword(event) {
    event.preventDefault();
    if (!passwordReset.userId || !passwordReset.password) {
      setError("Choose a user and enter a new password first.");
      return;
    }

    setSubmitting(true);
    setBanner("");
    setError("");

    try {
      await apiFetch(`/users/${passwordReset.userId}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ password: passwordReset.password }),
      });
      setPasswordReset({ userId: "", password: "" });
      setBanner("Password reset successfully.");
      users.reload();
    } catch (requestError) {
      setError(requestError.message || "Unable to reset password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Admin"
        title="Users"
        description="Manage stock-control users, their roles, and their sign-in access."
        help={USER_HELP}
      />

      <GuidedHelpPanel
        title="Help me through user setup"
        intro="This admin area controls who can sign in and what they can access."
        steps={USER_HELP.steps}
        warnings={USER_HELP.warnings}
      />

      {banner ? <div className="flash flash-success">{banner}</div> : null}
      {error ? <div className="flash flash-error">{error}</div> : null}

      <section className="admin-users-grid">
        <Card title="Create User" subtitle="Admin only">
          <form className="master-data-form" onSubmit={handleCreate}>
            <div className="master-data-form-grid">
              <FieldHelp
                className="master-data-field"
                label="Username"
                help="The name the user logs in with."
              >
                <input
                  value={createForm.username}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, username: event.target.value }))
                  }
                  required
                />
              </FieldHelp>
              <label className="master-data-field">
                <span className="master-data-field-label">Display name</span>
                <input
                  value={createForm.display_name}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, display_name: event.target.value }))
                  }
                  required
                />
              </label>
              <label className="master-data-field">
                <span className="master-data-field-label">Email</span>
                <input
                  value={createForm.email}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, email: event.target.value }))
                  }
                  type="email"
                />
              </label>
              <label className="master-data-field">
                <HelpTooltip text="Passwords are hashed on the server before storage." className="master-data-field-label">
                  Temporary password
                </HelpTooltip>
                <input
                  value={createForm.password}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, password: event.target.value }))
                  }
                  type="password"
                  required
                />
              </label>
              <FieldHelp
                className="master-data-field"
                label="Role"
                help="Controls what areas of the system the user can access."
              >
                <select
                  value={createForm.role}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, role: event.target.value }))
                  }
                >
                  <option value="admin">Admin</option>
                  <option value="office">Office</option>
                  <option value="warehouse">Warehouse</option>
                  <option value="read_only">Read only</option>
                </select>
              </FieldHelp>
              <label className="master-data-toggle-card">
                <div className="master-data-toggle-copy">
                  <HelpTooltip text="Inactive users cannot log in." className="master-data-field-label">
                    Active account
                  </HelpTooltip>
                  <span className="master-data-toggle-help">Inactive users cannot sign in.</span>
                </div>
                <span className={`master-data-switch${createForm.active ? " on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={createForm.active}
                    onChange={(event) =>
                      setCreateForm((current) => ({ ...current, active: event.target.checked }))
                    }
                  />
                  <span className="master-data-switch-track" aria-hidden="true" />
                </span>
              </label>
            </div>

            <div className="master-data-modal-actions">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : "Create user"}
              </Button>
            </div>
          </form>
        </Card>

        <Card title="Reset Password" subtitle="Secure recovery">
          <form className="master-data-form" onSubmit={handleResetPassword}>
            <div className="master-data-form-grid">
              <label className="master-data-field">
                <span className="master-data-field-label">User</span>
                <select
                  value={passwordReset.userId}
                  onChange={(event) =>
                    setPasswordReset((current) => ({ ...current, userId: event.target.value }))
                  }
                >
                  <option value="">Select a user</option>
                  {rows.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.display_name} ({user.username})
                    </option>
                  ))}
                </select>
              </label>
              <label className="master-data-field">
                <span className="master-data-field-label">New password</span>
                <input
                  value={passwordReset.password}
                  onChange={(event) =>
                    setPasswordReset((current) => ({ ...current, password: event.target.value }))
                  }
                  type="password"
                />
              </label>
            </div>

            <div className="master-data-modal-actions">
              <Button type="submit" variant="secondary" disabled={submitting}>
                Reset password
              </Button>
            </div>
          </form>
        </Card>
      </section>

      <Card title="User Directory" subtitle="Roles and account status">
        <DataTable
          columns={columns}
          rows={rows}
          loading={users.status === "loading"}
          error={users.status === "error" ? users.error : ""}
          emptyMessage="No users found."
          onRetry={users.reload}
          getRowClassName={(row) =>
            row.id === activeEditUser?.id ? "data-row selectable selected" : "data-row selectable"
          }
          onRowClick={(row) => {
            setEditingId(String(row.id));
            setEditForm(emptyEditForm(row));
          }}
        />
      </Card>

      {activeEditUser && editForm ? (
        <Card title={`Edit ${activeEditUser.display_name}`} subtitle="Update role or status">
          <form className="master-data-form" onSubmit={handleSaveUser}>
            <div className="master-data-form-grid">
              <label className="master-data-field">
                <span className="master-data-field-label">Display name</span>
                <input
                  value={editForm.display_name}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, display_name: event.target.value }))
                  }
                  required
                />
              </label>
              <FieldHelp
                className="master-data-field"
                label="Role"
                help="Controls what areas of the system the user can access."
              >
                <select
                  value={editForm.role}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, role: event.target.value }))
                  }
                >
                  <option value="admin">Admin</option>
                  <option value="office">Office</option>
                  <option value="warehouse">Warehouse</option>
                  <option value="read_only">Read only</option>
                </select>
              </FieldHelp>
              <label className="master-data-toggle-card">
                <div className="master-data-toggle-copy">
                  <HelpTooltip text="Inactive users cannot log in." className="master-data-field-label">
                    Active account
                  </HelpTooltip>
                  <span className="master-data-toggle-help">
                    Turn this off to stop the user signing in.
                  </span>
                </div>
                <span className={`master-data-switch${editForm.active ? " on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={editForm.active}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, active: event.target.checked }))
                    }
                  />
                  <span className="master-data-switch-track" aria-hidden="true" />
                </span>
              </label>
            </div>
            <div className="master-data-modal-actions">
              <Button type="button" variant="secondary" onClick={() => setEditingId("")}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                Save changes
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
    </div>
  );
}

export default UsersPage;
