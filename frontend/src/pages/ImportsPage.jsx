import { useState, useRef } from "react";
import Button from "../components/Button";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import { apiPost, apiPostFile } from "../lib/api";

const IMPORT_TYPES = [
  {
    key: "customers",
    label: "Customers",
    required: ["code", "name"],
    optional: ["contact_name", "email", "phone", "address_line1", "city", "postcode", "country", "status"],
    example: "code,name,contact_name,email,phone,address_line1,city,postcode,country\nCUST-001,Acme Ltd,Jane Smith,jane@acme.example,01234 567890,10 High St,London,EC1A 1BB,UK",
  },
  {
    key: "suppliers",
    label: "Suppliers",
    required: ["code", "name"],
    optional: ["contact_name", "email", "phone", "address_line1", "city", "postcode", "country", "account_reference", "status"],
    example: "code,name,contact_name,email,phone,account_reference\nSUP-001,Parts Co,Bob Jones,bob@parts.example,01234 999000,PC-1234",
  },
  {
    key: "products",
    label: "Products",
    required: ["sku", "name"],
    optional: ["description", "category", "barcode", "tracking_mode", "unit_of_measure", "cost_price", "sell_price", "status", "supplier_code"],
    example: "sku,name,category,tracking_mode,unit_of_measure,cost_price,sell_price,supplier_code\nPROD-001,Widget A,Hardware,quantity,each,5.00,12.99,SUP-001",
  },
  {
    key: "purchase-orders",
    label: "Purchase Orders",
    required: ["order_number", "supplier_code"],
    optional: ["status", "ordered_at", "expected_at", "notes"],
    example: "order_number,supplier_code,status,ordered_at,expected_at,notes\nPO-2024-001,SUP-001,draft,2024-01-15,2024-02-01,First order",
  },
  {
    key: "sales-orders",
    label: "Sales Orders",
    required: ["order_number", "customer_code"],
    optional: ["status", "requested_at", "dispatch_due_at", "notes"],
    example: "order_number,customer_code,status,requested_at,dispatch_due_at,notes\nSO-2024-001,CUST-001,draft,2024-01-15,2024-02-01,Urgent",
  },
];

function parseLocalCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));

  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    return Object.fromEntries(headers.map((h, i) => [h, values[i] || ""]));
  });
}

function ResultRow({ result }) {
  const statusClass = result.status === "imported" ? "pill success" : result.status === "skipped" ? "pill subtle" : "pill error";
  const label = result.status === "imported" ? "Imported" : result.status === "skipped" ? "Skipped" : "Error";

  return (
    <tr>
      <td>Row {result.row}</td>
      <td>
        <span className={statusClass}>{label}</span>
      </td>
      <td>{result.reason || result.code || result.sku || result.order_number || ""}</td>
    </tr>
  );
}

function ImportsPage() {
  const [selectedType, setSelectedType] = useState(IMPORT_TYPES[0]);
  const [inputMode, setInputMode] = useState("paste"); // "paste" | "file"
  const [csvText, setCsvText] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  function handleTypeChange(e) {
    const type = IMPORT_TYPES.find((t) => t.key === e.target.value);
    setSelectedType(type);
    setPreview(null);
    setResult(null);
    setError(null);
    setCsvText("");
    setFile(null);
  }

  function handlePreview() {
    setError(null);
    setResult(null);

    const text = inputMode === "paste" ? csvText : file ? null : "";

    if (inputMode === "file" && file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const rows = parseLocalCsv(e.target.result);
        setPreview(rows);
      };
      reader.readAsText(file);
      return;
    }

    if (!csvText.trim()) {
      setError("Paste CSV text before previewing.");
      return;
    }

    const rows = parseLocalCsv(text);
    if (rows.length === 0) {
      setError("No data rows found. Ensure your CSV has a header row and at least one data row.");
      return;
    }
    setPreview(rows);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      let data;

      if (inputMode === "file" && file) {
        const formData = new FormData();
        formData.append("file", file);
        data = await apiPostFile(`/import/${selectedType.key}`, formData);
      } else {
        if (!csvText.trim()) {
          setError("No CSV text to import.");
          setSubmitting(false);
          return;
        }
        data = await apiPost(`/import/${selectedType.key}`, { csvText });
      }

      setResult(data);
      setPreview(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setCsvText("");
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const hasInput = inputMode === "paste" ? csvText.trim().length > 0 : file !== null;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Data Migration"
        title="CSV Imports"
        description="Import customers, suppliers, products, and orders from CSV files exported from Access or other systems."
      />

      <Card title="Import Settings" subtitle="Step 1">
        <div className="form-stack">
          <div className="form-row">
            <label className="form-label">Import type</label>
            <select className="form-select" value={selectedType.key} onChange={handleTypeChange}>
              {IMPORT_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <label className="form-label">Required columns</label>
            <div className="column-pills">
              {selectedType.required.map((col) => (
                <span key={col} className="pill">{col}</span>
              ))}
            </div>
          </div>

          <div className="form-row">
            <label className="form-label">Optional columns</label>
            <div className="column-pills">
              {selectedType.optional.map((col) => (
                <span key={col} className="pill subtle">{col}</span>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card title="CSV Data" subtitle="Step 2">
        <div className="form-stack">
          <div className="input-mode-toggle">
            <button
              type="button"
              className={inputMode === "paste" ? "toggle-btn active" : "toggle-btn"}
              onClick={() => { setInputMode("paste"); setPreview(null); }}
            >
              Paste text
            </button>
            <button
              type="button"
              className={inputMode === "file" ? "toggle-btn active" : "toggle-btn"}
              onClick={() => { setInputMode("file"); setPreview(null); }}
            >
              Upload file
            </button>
          </div>

          {inputMode === "paste" ? (
            <div className="form-row">
              <label className="form-label">CSV text</label>
              <textarea
                className="form-textarea"
                rows={8}
                placeholder={`Paste CSV here. Example:\n${selectedType.example}`}
                value={csvText}
                onChange={(e) => { setCsvText(e.target.value); setPreview(null); setResult(null); }}
              />
            </div>
          ) : (
            <div className="form-row">
              <label className="form-label">CSV file</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="form-file"
                onChange={(e) => { setFile(e.target.files[0] || null); setPreview(null); setResult(null); }}
              />
              {file && <p className="form-hint">{file.name} ({(file.size / 1024).toFixed(1)} KB)</p>}
            </div>
          )}

          {error && <p className="import-error">{error}</p>}

          <div className="form-actions">
            <Button variant="secondary" onClick={handlePreview} disabled={!hasInput || submitting}>
              Preview rows
            </Button>
            <Button onClick={handleSubmit} disabled={!hasInput || submitting}>
              {submitting ? "Importing…" : `Import ${selectedType.label}`}
            </Button>
            {(preview || result) && (
              <Button variant="secondary" onClick={handleReset} disabled={submitting}>
                Reset
              </Button>
            )}
          </div>
        </div>
      </Card>

      {preview && preview.length > 0 && (
        <Card title={`Preview — ${preview.length} row${preview.length !== 1 ? "s" : ""}`} subtitle="Step 3 — Review before importing">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  {Object.keys(preview[0]).map((col) => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 20).map((row, i) => (
                  <tr key={i}>
                    {Object.values(row).map((val, j) => (
                      <td key={j}>{val}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.length > 20 && <p className="form-hint">Showing first 20 of {preview.length} rows.</p>}
        </Card>
      )}

      {result && (
        <Card
          title={`Import complete — ${result.imported} imported, ${result.skipped} skipped, ${result.errors} errors`}
          subtitle="Results"
        >
          <div className="import-summary-pills">
            <span className="pill success">{result.imported} imported</span>
            <span className="pill subtle">{result.skipped} skipped</span>
            {result.errors > 0 && <span className="pill error">{result.errors} errors</span>}
          </div>

          {result.results && result.results.length > 0 && (
            <div className="table-scroll" style={{ marginTop: "1rem" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Status</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((r, i) => (
                    <ResultRow key={i} result={r} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

export default ImportsPage;
