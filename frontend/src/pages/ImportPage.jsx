import { useState, useEffect, useRef, useCallback } from "react";
import GuidedHelpPanel from "../components/GuidedHelpPanel";
import PageHelpButton from "../components/PageHelpButton";
import { HELP_CONTENT } from "../config/helpContent";
import { useUser } from "../context/UserContext";
import { API_BASE_URL, apiFetch, buildUserHeaders } from "../lib/api";
import { usePermission } from "../hooks/usePermission";

// ─── Constants ────────────────────────────────────────────────────────────────

const ENTITY_TYPES = [
  {
    key: "products",
    label: "Products",
    icon: "📦",
    description: "SKUs, names, categories, pricing and tracking mode",
  },
  {
    key: "customers",
    label: "Customers",
    icon: "👥",
    description: "Customer accounts, contact details and addresses",
  },
  {
    key: "suppliers",
    label: "Suppliers",
    icon: "🏭",
    description: "Supplier records, contacts and account references",
  },
  {
    key: "purchase-orders",
    label: "Purchase Orders",
    icon: "🛒",
    description: "Historical or pending purchase orders by supplier",
  },
  {
    key: "sales-orders",
    label: "Sales Orders",
    icon: "📋",
    description: "Customer sales orders with due dates and priority",
  },
];

const STEPS = [
  { key: "upload", label: "Upload" },
  { key: "map", label: "Map Columns" },
  { key: "preview", label: "Preview" },
  { key: "done", label: "Import" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCSVHeaders(text) {
  if (!text.trim()) return [];
  const firstLine = text.split(/\r?\n/)[0];
  const headers = [];
  let current = "";
  let inQuote = false;
  for (const ch of firstLine) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === "," && !inQuote) { headers.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  headers.push(current.trim());
  return headers.filter(Boolean);
}

function autoMap(csvHeaders, schema) {
  if (!schema) return {};
  const allFields = [...(schema.required || []), ...(schema.optional || [])];
  const norm = (s) => s.toLowerCase().replace(/[\s\-()\/]+/g, "_").replace(/_+$/, "");
  const mapping = {};
  for (const field of allFields) {
    const match = csvHeaders.find((h) => norm(h) === norm(field));
    if (match) { mapping[field] = match; continue; }
    const labelNorm = norm(schema.fieldLabels?.[field] || "");
    if (labelNorm) {
      const labelMatch = csvHeaders.find((h) => norm(h) === labelNorm);
      if (labelMatch) mapping[field] = labelMatch;
    }
  }
  return mapping;
}

function csvRowPreview(row, limit = 4) {
  const entries = Object.entries(row).slice(0, limit);
  return entries.map(([k, v]) => `${k}: ${v}`).join(" · ");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepIndicator({ currentStep }) {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);
  return (
    <div className="imp-steps">
      {STEPS.map((step, i) => {
        const state = i < currentIndex ? "done" : i === currentIndex ? "active" : "pending";
        return (
          <div key={step.key} className={`imp-step imp-step--${state}`}>
            <div className="imp-step-circle">
              {state === "done" ? "✓" : i + 1}
            </div>
            <span className="imp-step-label">{step.label}</span>
            {i < STEPS.length - 1 && <div className="imp-step-line" />}
          </div>
        );
      })}
    </div>
  );
}

function EntityTypeSelector({ value, onChange }) {
  return (
    <div className="imp-entity-grid">
      {ENTITY_TYPES.map((type) => (
        <button
          key={type.key}
          type="button"
          onClick={() => onChange(type.key)}
          className={`imp-entity-card ${value === type.key ? "imp-entity-card--active" : ""}`}
        >
          <span className="imp-entity-icon">{type.icon}</span>
          <span className="imp-entity-label">{type.label}</span>
          <span className="imp-entity-desc">{type.description}</span>
        </button>
      ))}
    </div>
  );
}

function DropZone({ onFile, isDragging, setIsDragging }) {
  const inputRef = useRef(null);

  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  function handleChange(e) {
    const file = e.target.files?.[0];
    if (file) onFile(file);
    e.target.value = "";
  }

  return (
    <div
      className={`imp-dropzone ${isDragging ? "imp-dropzone--drag" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv,.txt"
        className="imp-dropzone-input"
        onChange={handleChange}
      />
      <span className="imp-dropzone-icon">📂</span>
      <p className="imp-dropzone-primary">
        {isDragging ? "Drop CSV here" : "Click to browse or drag & drop"}
      </p>
      <p className="imp-dropzone-secondary">CSV or TSV · max 5 MB</p>
    </div>
  );
}

function MappingRow({ field, label, required, csvHeaders, value, onChange }) {
  return (
    <div className={`imp-map-row ${required ? "imp-map-row--required" : ""}`}>
      <div className="imp-map-field">
        <span className="imp-map-field-name">{label}</span>
        {required && <span className="imp-map-required">required</span>}
      </div>
      <div className="imp-map-arrow">→</div>
      <select
        className={`imp-map-select ${required && !value ? "imp-map-select--missing" : value ? "imp-map-select--mapped" : ""}`}
        value={value || ""}
        onChange={(e) => onChange(field, e.target.value)}
      >
        <option value="">— not mapped —</option>
        {csvHeaders.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
    </div>
  );
}

function PreviewTable({ rows, schema, mapping }) {
  const mappedFields = Object.keys(mapping).filter((f) => mapping[f]);
  const MAX_ROWS = 200;
  const shown = rows.slice(0, MAX_ROWS);

  return (
    <div className="imp-preview-table-wrap">
      <table className="imp-preview-table">
        <thead>
          <tr>
            <th className="imp-preview-th imp-preview-th--row">#</th>
            <th className="imp-preview-th imp-preview-th--status">Status</th>
            {mappedFields.map((f) => (
              <th key={f} className="imp-preview-th">
                {schema.fieldLabels?.[f] || f}
              </th>
            ))}
            <th className="imp-preview-th imp-preview-th--errors">Errors</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr
              key={row.rowIndex}
              className={`imp-preview-tr ${row.valid ? "imp-preview-tr--ok" : "imp-preview-tr--err"}`}
            >
              <td className="imp-preview-td imp-preview-td--row">{row.rowIndex}</td>
              <td className="imp-preview-td imp-preview-td--status">
                {row.valid
                  ? <span className="pill success">✓ Valid</span>
                  : <span className="pill error">✗ Error</span>}
              </td>
              {mappedFields.map((f) => (
                <td key={f} className="imp-preview-td">
                  {row.mapped?.[f] ?? <span className="imp-preview-empty">—</span>}
                </td>
              ))}
              <td className="imp-preview-td imp-preview-td--errors">
                {row.errors?.length > 0
                  ? <ul className="imp-preview-errors">{row.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                  : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > MAX_ROWS && (
        <p className="imp-preview-overflow">
          Showing first {MAX_ROWS} of {rows.length} rows
        </p>
      )}
    </div>
  );
}

function ImportLogList({ logs }) {
  if (!logs || logs.length === 0) {
    return <p className="imp-log-empty">No imports have been run yet.</p>;
  }
  return (
    <div className="imp-log-list">
      {logs.map((log) => (
        <div key={log.id} className="imp-log-row">
          <div className="imp-log-type">{log.entity_type}</div>
          <div className="imp-log-counts">
            <span className="imp-log-chip imp-log-chip--ok">{log.imported_rows} imported</span>
            {log.skipped_rows > 0 && <span className="imp-log-chip imp-log-chip--warn">{log.skipped_rows} skipped</span>}
            {log.error_rows > 0 && <span className="imp-log-chip imp-log-chip--err">{log.error_rows} errors</span>}
          </div>
          <div className="imp-log-file">{log.filename || "pasted"}</div>
          <div className="imp-log-date">{new Date(log.created_at).toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function ImportPage() {
  const { currentUser } = useUser();
  const canImport = usePermission("import:use");

  const [step, setStep] = useState("upload");
  const [entityType, setEntityType] = useState("products");
  const [csvText, setCsvText] = useState("");
  const [filename, setFilename] = useState("");
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [schemas, setSchemas] = useState(null);
  const [preview, setPreview] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importLogs, setImportLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const schema = schemas?.[entityType];
  const allFields = schema ? [...schema.required, ...schema.optional] : [];

  // Load schemas and logs on mount
  useEffect(() => {
    apiFetch("/import/schemas")
      .then((d) => setSchemas(d.schemas))
      .catch(() => {});
    apiFetch("/import/logs")
      .then((d) => setImportLogs(d.logs || []))
      .catch(() => {});
  }, []);

  // Reset downstream state when entity type changes
  useEffect(() => {
    setCsvText("");
    setFilename("");
    setCsvHeaders([]);
    setMapping({});
    setPreview(null);
    setImportResult(null);
    setError(null);
    setStep("upload");
  }, [entityType]);

  function handleFile(file) {
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      setCsvText(text);
      const headers = parseCSVHeaders(text);
      setCsvHeaders(headers);
      const detected = autoMap(headers, schema);
      setMapping(detected);
      setError(null);
    };
    reader.readAsText(file);
  }

  function handleParsePaste() {
    if (!csvText.trim()) {
      setError("Paste some CSV text first.");
      return;
    }
    const headers = parseCSVHeaders(csvText);
    if (headers.length === 0) {
      setError("Could not detect column headers. Check the CSV format.");
      return;
    }
    setCsvHeaders(headers);
    const detected = autoMap(headers, schema);
    setMapping(detected);
    setError(null);
  }

  function handleMappingChange(field, csvHeader) {
    setMapping((prev) => ({ ...prev, [field]: csvHeader }));
  }

  function canProceedToMap() {
    return csvHeaders.length > 0 && csvText.trim();
  }

  function requiredFieldsMapped() {
    if (!schema) return false;
    return schema.required.every((f) => mapping[f]);
  }

  async function handleValidate() {
    if (!requiredFieldsMapped()) {
      setError("Map all required fields before previewing.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`/import/${entityType}/validate`, {
        method: "POST",
        body: JSON.stringify({ csvText, mapping }),
      });
      setPreview(data);
      setStep("preview");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`/import/${entityType}`, {
        method: "POST",
        body: JSON.stringify({ csvText, mapping, filename }),
      });
      setImportResult(data);
      setStep("done");
      // Refresh logs
      apiFetch("/import/logs")
        .then((d) => setImportLogs(d.logs || []))
        .catch(() => {});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setCsvText("");
    setFilename("");
    setCsvHeaders([]);
    setMapping({});
    setPreview(null);
    setImportResult(null);
    setError(null);
    setStep("upload");
  }

  async function handleDownloadTemplate() {
    try {
      const response = await fetch(`${API_BASE_URL}/import/${entityType}/template`, {
        headers: buildUserHeaders(),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || payload.error || "Template download failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${entityType}-import-template.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!canImport) {
    return (
      <div className="page-content">
        <div className="page-header">
          <div>
            <div className="page-title-row">
              <h1 className="page-title">Import Data</h1>
              <PageHelpButton title="Import Data" help={HELP_CONTENT.importData} />
            </div>
            <p className="page-description">Signed in as {currentUser.name} · {currentUser.roleLabel}</p>
          </div>
        </div>
        <div className="empty-state">
          <p>You don't have permission to import data. Contact an administrator.</p>
        </div>
      </div>
    );
  }

  const typeInfo = ENTITY_TYPES.find((t) => t.key === entityType);

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <div className="page-title-row">
            <h1 className="page-title">Import Data</h1>
            <PageHelpButton title="Import Data" help={HELP_CONTENT.importData} />
          </div>
          <p className="page-description">
            Upload a CSV file to bulk-import products, customers, suppliers or orders. Map your
            columns, preview errors, then apply — partial imports are allowed.
          </p>
          <p className="page-description">Signed in as {currentUser.name} · {currentUser.roleLabel}</p>
        </div>
        <button
          type="button"
          className="imp-logs-toggle"
          onClick={() => setShowLogs((v) => !v)}
        >
          {showLogs ? "Hide" : "View"} import history
        </button>
      </div>

      <GuidedHelpPanel
        intro={HELP_CONTENT.importData.summary}
        steps={HELP_CONTENT.importData.steps}
        warnings={HELP_CONTENT.importData.warnings}
      />

      {showLogs && (
        <div className="card imp-log-card">
          <h2 className="imp-log-title">Recent Imports</h2>
          <ImportLogList logs={importLogs} />
        </div>
      )}

      <div className="card imp-card">
        <StepIndicator currentStep={step} />

        {/* ── Step 1: Upload ──────────────────────────────────────── */}
        {step === "upload" && (
          <div className="imp-section">
            <h2 className="imp-section-title">Choose data type &amp; upload file</h2>

            <div className="imp-field-group">
              <label className="imp-label">What are you importing?</label>
              <EntityTypeSelector value={entityType} onChange={setEntityType} />
            </div>

            <div className="imp-upload-row">
              <div className="imp-upload-col">
                <label className="imp-label">Upload a CSV file</label>
                <DropZone
                  onFile={handleFile}
                  isDragging={isDragging}
                  setIsDragging={setIsDragging}
                />
                {filename && (
                  <p className="imp-filename">
                    📄 {filename}
                    {csvHeaders.length > 0 && ` · ${csvHeaders.length} columns detected`}
                  </p>
                )}
              </div>

              <div className="imp-upload-divider">or</div>

              <div className="imp-upload-col">
                <label className="imp-label">Paste CSV text</label>
                <textarea
                  className="imp-paste-area"
                  placeholder={"code,name,email\nCUST-001,Acme Ltd,orders@acme.example"}
                  value={csvText}
                  onChange={(e) => { setCsvText(e.target.value); setPasteMode(true); }}
                  rows={6}
                />
                <button
                  type="button"
                  className="btn btn-secondary imp-parse-btn"
                  onClick={handleParsePaste}
                >
                  Detect columns
                </button>
              </div>
            </div>

            {error && <p className="imp-error">{error}</p>}

            <div className="imp-footer">
              <button
                type="button"
                className="btn btn-ghost imp-template-btn"
                onClick={handleDownloadTemplate}
              >
                ⬇ Download template for {typeInfo?.label}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canProceedToMap()}
                onClick={() => setStep("map")}
              >
                Next: Map columns →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Map columns ─────────────────────────────────── */}
        {step === "map" && (
          <div className="imp-section">
            <h2 className="imp-section-title">Map your CSV columns to {typeInfo?.label} fields</h2>
            <p className="imp-section-sub">
              {csvHeaders.length} column{csvHeaders.length !== 1 ? "s" : ""} detected in your file.
              Required fields must be mapped to proceed.
            </p>

            <div className="imp-map-list">
              {allFields.map((field) => (
                <MappingRow
                  key={field}
                  field={field}
                  label={schema.fieldLabels?.[field] || field}
                  required={schema.required.includes(field)}
                  csvHeaders={csvHeaders}
                  value={mapping[field] || ""}
                  onChange={handleMappingChange}
                />
              ))}
            </div>

            {!requiredFieldsMapped() && (
              <p className="imp-map-warn">
                ⚠ Map all required fields ({schema.required.map((f) => schema.fieldLabels?.[f] || f).join(", ")}) to continue.
              </p>
            )}

            {error && <p className="imp-error">{error}</p>}

            <div className="imp-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setStep("upload")}>
                ← Back
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!requiredFieldsMapped() || loading}
                onClick={handleValidate}
              >
                {loading ? "Validating…" : "Validate & Preview →"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Preview ─────────────────────────────────────── */}
        {step === "preview" && preview && (
          <div className="imp-section">
            <h2 className="imp-section-title">Review before importing</h2>

            <div className="imp-preview-summary">
              <div className="imp-preview-chip imp-preview-chip--ok">
                ✓ {preview.validCount} valid
              </div>
              {preview.errorCount > 0 && (
                <div className="imp-preview-chip imp-preview-chip--err">
                  ✗ {preview.errorCount} with errors
                </div>
              )}
              <div className="imp-preview-chip imp-preview-chip--total">
                {preview.total} total rows
              </div>
              {preview.errorCount > 0 && (
                <p className="imp-preview-partial-note">
                  Rows with errors will be skipped. Valid rows will still be imported.
                </p>
              )}
            </div>

            <PreviewTable rows={preview.preview} schema={schema} mapping={mapping} />

            {error && <p className="imp-error">{error}</p>}

            <div className="imp-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setStep("map")}>
                ← Back to mapping
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={preview.validCount === 0 || loading}
                onClick={handleImport}
              >
                {loading
                  ? "Importing…"
                  : `Import ${preview.validCount} valid row${preview.validCount !== 1 ? "s" : ""} →`}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Done ────────────────────────────────────────── */}
        {step === "done" && importResult && (
          <div className="imp-section">
            <div className="imp-done-icon">✅</div>
            <h2 className="imp-section-title">Import complete</h2>

            <div className="imp-done-summary">
              <div className="imp-done-stat imp-done-stat--ok">
                <span className="imp-done-number">{importResult.imported}</span>
                <span className="imp-done-label">imported</span>
              </div>
              {importResult.skipped > 0 && (
                <div className="imp-done-stat imp-done-stat--warn">
                  <span className="imp-done-number">{importResult.skipped}</span>
                  <span className="imp-done-label">skipped (already exist)</span>
                </div>
              )}
              {importResult.errors > 0 && (
                <div className="imp-done-stat imp-done-stat--err">
                  <span className="imp-done-number">{importResult.errors}</span>
                  <span className="imp-done-label">errors</span>
                </div>
              )}
            </div>

            {importResult.errorDetails?.length > 0 && (
              <div className="imp-done-errors">
                <h3 className="imp-done-errors-title">Error details</h3>
                <ul className="imp-done-error-list">
                  {importResult.errorDetails.map((e, i) => (
                    <li key={i}>Row {e.row}: {e.reason}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="imp-footer imp-footer--center">
              <button type="button" className="btn btn-primary" onClick={handleReset}>
                Import another file
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ImportPage;
