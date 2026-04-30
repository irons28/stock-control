import { useEffect, useMemo, useState } from "react";
import Button from "./Button";
import Card from "./Card";
import DataTable from "./DataTable";
import PageHeader from "./PageHeader";
import StatusPill from "./StatusPill";
import { useApiResource } from "../hooks/useApiResource";
import { usePermission } from "../hooks/usePermission";
import { apiFetch } from "../lib/api";

function MasterDataModal({
  open,
  title,
  subtitle,
  fields,
  formValues,
  formErrors,
  submitError,
  submitting,
  canManage,
  onChange,
  onClose,
  onSubmit,
}) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="master-data-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="master-data-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="master-data-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="master-data-modal-header">
          <div>
            <p className="eyebrow">{subtitle}</p>
            <h3 id="master-data-modal-title">{title}</h3>
          </div>
          <button type="button" className="master-data-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {!canManage ? (
          <div className="master-data-banner warning">
            Your role has read-only access to master data. Switch to an admin or purchasing user to make edits.
          </div>
        ) : null}

        {submitError ? <div className="master-data-banner error">{submitError}</div> : null}

        <form className="master-data-form" onSubmit={onSubmit}>
          <div className="master-data-form-grid">
            {fields.map((field) => {
              if (field.type === "toggle") {
                return (
                  <label
                    key={field.name}
                    className={`master-data-toggle-card${formErrors[field.name] ? " error" : ""}`}
                  >
                    <div className="master-data-toggle-copy">
                      <span className="master-data-field-label">{field.label}</span>
                      <span className="master-data-toggle-help">
                        {field.help || (formValues[field.name] ? field.onLabel : field.offLabel)}
                      </span>
                      {formErrors[field.name] ? (
                        <span className="master-data-field-error">{formErrors[field.name]}</span>
                      ) : null}
                    </div>
                    <span className={`master-data-switch${formValues[field.name] ? " on" : ""}`}>
                      <input
                        type="checkbox"
                        checked={Boolean(formValues[field.name])}
                        onChange={(event) => onChange(field.name, event.target.checked)}
                        disabled={!canManage || submitting}
                      />
                      <span className="master-data-switch-track" aria-hidden="true" />
                    </span>
                  </label>
                );
              }

              const isTextarea = field.type === "textarea";

              return (
                <label
                  key={field.name}
                  className={`master-data-field ${field.fullWidth ? "full-width" : ""}`}
                >
                  <span className="master-data-field-label">
                    {field.label}
                    {field.required ? <span className="master-data-required">*</span> : null}
                  </span>
                  {isTextarea ? (
                    <textarea
                      value={formValues[field.name] ?? ""}
                      onChange={(event) => onChange(field.name, event.target.value)}
                      placeholder={field.placeholder || ""}
                      rows={field.rows || 4}
                      disabled={!canManage || submitting}
                    />
                  ) : (
                    <input
                      type={field.type || "text"}
                      value={formValues[field.name] ?? ""}
                      onChange={(event) => onChange(field.name, event.target.value)}
                      placeholder={field.placeholder || ""}
                      min={field.min}
                      step={field.step}
                      disabled={!canManage || submitting}
                    />
                  )}
                  {formErrors[field.name] ? (
                    <span className="master-data-field-error">{formErrors[field.name]}</span>
                  ) : null}
                </label>
              );
            })}
          </div>

          <div className="master-data-modal-actions">
            <Button variant="secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canManage || submitting}>
              {submitting ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function defaultFilterRecord(record, query) {
  const haystack = Object.values(record)
    .filter((value) => typeof value === "string" || typeof value === "number")
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function MasterDataPage({
  title,
  description,
  singularLabel,
  pluralLabel,
  endpoint,
  emptyMessage,
  searchPlaceholder,
  fields,
  createEmptyRecord,
  validateRecord,
  getColumns,
  filterRecord = defaultFilterRecord,
}) {
  const resource = useApiResource(`${endpoint}?includeInactive=true`);
  const canManage = usePermission("master-data:manage");
  const [searchValue, setSearchValue] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modalState, setModalState] = useState({ open: false, mode: "create", record: null });
  const [formValues, setFormValues] = useState(createEmptyRecord());
  const [formErrors, setFormErrors] = useState({});
  const [submitState, setSubmitState] = useState({ status: "idle", error: "" });
  const [banner, setBanner] = useState(null);

  const rows = resource.data?.items || [];
  const normalizedSearch = searchValue.trim().toLowerCase();

  const filteredRows = useMemo(() => {
    return rows.filter((record) => {
      if (statusFilter === "active" && !record.active) {
        return false;
      }

      if (statusFilter === "inactive" && record.active) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return filterRecord(record, normalizedSearch);
    });
  }, [filterRecord, normalizedSearch, rows, statusFilter]);

  const columns = useMemo(
    () =>
      getColumns({
        canManage,
        onEdit: (record) => {
          setBanner(null);
          setFormErrors({});
          setSubmitState({ status: "idle", error: "" });
          setFormValues({
            ...createEmptyRecord(),
            ...record,
          });
          setModalState({ open: true, mode: "edit", record });
        },
      }),
    [canManage, createEmptyRecord, getColumns],
  );

  function openCreateModal() {
    setBanner(null);
    setFormErrors({});
    setSubmitState({ status: "idle", error: "" });
    setFormValues(createEmptyRecord());
    setModalState({ open: true, mode: "create", record: null });
  }

  function closeModal() {
    setModalState({ open: false, mode: "create", record: null });
    setFormErrors({});
    setSubmitState({ status: "idle", error: "" });
  }

  function handleChange(name, value) {
    setFormValues((current) => ({
      ...current,
      [name]: value,
    }));
    setFormErrors((current) => ({
      ...current,
      [name]: "",
    }));
    setSubmitState({ status: "idle", error: "" });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const validationErrors = validateRecord(formValues);

    if (Object.keys(validationErrors).length) {
      setFormErrors(validationErrors);
      return;
    }

    setFormErrors({});
    setSubmitState({ status: "submitting", error: "" });

    const isEdit = modalState.mode === "edit" && modalState.record;
    const requestPath = isEdit ? `${endpoint}/${modalState.record.id}` : endpoint;

    try {
      const response = await apiFetch(requestPath, {
        method: isEdit ? "PUT" : "POST",
        body: JSON.stringify(formValues),
      });

      setSubmitState({ status: "success", error: "" });
      setBanner({
        tone: "success",
        text:
          response.message ||
          `${singularLabel} ${isEdit ? "updated" : "created"} successfully.`,
      });
      closeModal();
      resource.reload();
    } catch (error) {
      setSubmitState({
        status: "error",
        error: error.message || `Unable to save the ${singularLabel.toLowerCase()}.`,
      });
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Admin / Master Data"
        title={title}
        description={description}
        actions={
          <>
            <Button variant="secondary" onClick={resource.reload}>
              Refresh
            </Button>
            <Button onClick={openCreateModal} disabled={!canManage}>
              Add {singularLabel}
            </Button>
          </>
        }
      />

      {!canManage ? (
        <div className="master-data-banner warning">
          You can review {pluralLabel.toLowerCase()} here, but only admin and purchasing roles can add or edit records.
        </div>
      ) : null}

      {banner ? <div className={`master-data-banner ${banner.tone}`}>{banner.text}</div> : null}

      <Card title={`${pluralLabel} List`} subtitle="Operational Catalogue">
        <div className="master-data-toolbar">
          <div className="master-data-search">
            <input
              type="text"
              className="table-search-input"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={`Search ${pluralLabel.toLowerCase()}`}
            />
          </div>

          <div className="master-data-toolbar-right">
            <label className="master-data-filter">
              <span>Status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All records</option>
                <option value="active">Active only</option>
                <option value="inactive">Inactive only</option>
              </select>
            </label>
            <div className="table-search-count">
              {filteredRows.length} {filteredRows.length === 1 ? singularLabel.toLowerCase() : pluralLabel.toLowerCase()}
            </div>
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={filteredRows}
          loading={resource.status === "loading"}
          error={resource.status === "error" ? resource.error : ""}
          emptyMessage={emptyMessage}
          onRetry={resource.reload}
        />
      </Card>

      <MasterDataModal
        open={modalState.open}
        title={modalState.mode === "edit" ? `Edit ${singularLabel}` : `Add ${singularLabel}`}
        subtitle={modalState.mode === "edit" ? "Update record" : "Create record"}
        fields={fields}
        formValues={formValues}
        formErrors={formErrors}
        submitError={submitState.error}
        submitting={submitState.status === "submitting"}
        canManage={canManage}
        onChange={handleChange}
        onClose={closeModal}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

export function createActionColumn(onEdit, canManage, label) {
  return {
    key: "actions",
    header: "Actions",
    render: (row) => (
      <Button variant="secondary" disabled={!canManage} onClick={() => onEdit(row)}>
        Edit {label}
      </Button>
    ),
  };
}

export function createActiveStatusColumn() {
  return {
    key: "active",
    header: "Status",
    render: (row) => <StatusPill value={row.active ? "active" : "inactive"} />,
  };
}

export default MasterDataPage;
