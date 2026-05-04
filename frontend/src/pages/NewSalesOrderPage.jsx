import { useEffect, useRef, useState } from "react";
import PageHeader from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";
import { apiFetch } from "../lib/api";
import { formatDate, formatNumber } from "../lib/formatters";
import { usePermission } from "../hooks/usePermission";

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function emptyLine() {
  return { productId: "", productName: "", sku: "", isSerialTracked: false, quantityOrdered: "" };
}

function emptyForm() {
  return {
    customerId: "",
    customerName: "",
    orderDate: todayIso(),
    requiredDate: "",
    priority: "normal",
    customerReference: "",
    notes: "",
    lines: [emptyLine()],
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FieldWrap({ label, required, children, hint }) {
  return (
    <div className="nso-field">
      <label className="nso-field-label">
        {label}
        {required && <span className="nso-required"> *</span>}
      </label>
      {children}
      {hint && <p className="nso-field-hint">{hint}</p>}
    </div>
  );
}

function CustomerSearch({ customers, value, onSelect, disabled }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // When an external customer is selected (e.g. after quick-create), sync display
  useEffect(() => {
    if (!value.customerId) setQuery("");
  }, [value.customerId]);

  const filtered = (customers || []).filter((c) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);
  });

  function handleSelect(c) {
    onSelect({ customerId: c.id, customerName: c.name });
    setQuery(c.name);
    setOpen(false);
  }

  function handleInputChange(e) {
    setQuery(e.target.value);
    setOpen(true);
    if (!e.target.value) {
      onSelect({ customerId: "", customerName: "" });
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const displayValue = value.customerId
    ? (customers || []).find((c) => String(c.id) === String(value.customerId))?.name || query
    : query;

  return (
    <div className="nso-customer-search-wrap" ref={wrapRef}>
      <input
        type="text"
        className="form-control"
        placeholder="Search by name or code..."
        value={open ? query : displayValue}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        disabled={disabled}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="nso-customer-dropdown">
          {filtered.slice(0, 12).map((c) => (
            <li key={c.id} onMouseDown={() => handleSelect(c)}>
              <span className="nso-customer-name">{c.name}</span>
              <span className="nso-customer-code">{c.code}</span>
            </li>
          ))}
        </ul>
      )}
      {open && query && filtered.length === 0 && (
        <ul className="nso-customer-dropdown">
          <li className="nso-customer-empty">No customers match &quot;{query}&quot;</li>
        </ul>
      )}
    </div>
  );
}

function CreateCustomerPanel({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Customer name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const customer = await apiFetch("/customers", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: phone.trim() }),
      });
      onCreated(customer);
      setOpen(false);
      setName("");
      setEmail("");
      setPhone("");
    } catch (err) {
      setError(err.message || "Failed to create customer.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="nso-create-customer-panel">
      <button
        type="button"
        className="nso-create-customer-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "▲ Cancel new customer" : "＋ Can't find customer? Create one"}
      </button>
      {open && (
        <form className="nso-create-customer-form" onSubmit={handleSubmit}>
          {error && <p className="nso-inline-error">{error}</p>}
          <div className="nso-grid nso-grid-3">
            <FieldWrap label="Name" required>
              <input
                className="form-control"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Customer name"
                required
              />
            </FieldWrap>
            <FieldWrap label="Email">
              <input
                className="form-control"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
              />
            </FieldWrap>
            <FieldWrap label="Phone">
              <input
                className="form-control"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+44 ..."
              />
            </FieldWrap>
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
            {saving ? "Creating..." : "Create Customer"}
          </button>
        </form>
      )}
    </div>
  );
}

function PriorityPicker({ value, onChange }) {
  return (
    <div className="nso-priority-group">
      <button
        type="button"
        className={`nso-priority-btn ${value === "normal" ? "nso-priority-btn--active" : ""}`}
        onClick={() => onChange("normal")}
      >
        Normal
      </button>
      <button
        type="button"
        className={`nso-priority-btn nso-priority-btn--urgent ${value === "urgent" ? "nso-priority-btn--active nso-priority-btn--urgent-active" : ""}`}
        onClick={() => onChange("urgent")}
      >
        Urgent
      </button>
    </div>
  );
}

function LineRow({ line, index, products, onChange, onRemove, canRemove }) {
  const productOptions = products || [];

  function handleProductChange(e) {
    const productId = e.target.value;
    const found = productOptions.find((p) => String(p.id) === String(productId));
    onChange(index, {
      ...line,
      productId,
      productName: found?.name || "",
      sku: found?.sku || "",
      isSerialTracked: Boolean(found?.is_serial_tracked),
    });
  }

  function handleQtyChange(e) {
    onChange(index, { ...line, quantityOrdered: e.target.value });
  }

  return (
    <div className="nso-line-row">
      <div className="nso-line-product">
        <select
          className="form-control"
          value={line.productId}
          onChange={handleProductChange}
          required
        >
          <option value="">— Select product —</option>
          {productOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.sku} — {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="nso-line-qty">
        <input
          type="number"
          className="form-control"
          min="0.01"
          step="any"
          placeholder="Qty"
          value={line.quantityOrdered}
          onChange={handleQtyChange}
          required
        />
      </div>
      <div className="nso-line-badges">
        {line.isSerialTracked && (
          <span className="pill pill--info" title="Serial tracked">
            Serial
          </span>
        )}
      </div>
      <div className="nso-line-remove">
        {canRemove && (
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => onRemove(index)}
            title="Remove line"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

function ReviewPanel({ form, customers, onBack, onSubmit, submitting, submitError }) {
  const customer = (customers || []).find((c) => String(c.id) === String(form.customerId));

  return (
    <div className="nso-review-panel">
      <h3 className="nso-review-heading">Review Order</h3>

      <dl className="nso-review-dl">
        <dt>Customer</dt>
        <dd>{form.customerName || customer?.name || "—"}</dd>

        <dt>Order Date</dt>
        <dd>{form.orderDate ? formatDate(form.orderDate) : "—"}</dd>

        <dt>Required By</dt>
        <dd>{form.requiredDate ? formatDate(form.requiredDate) : "—"}</dd>

        <dt>Priority</dt>
        <dd>
          <span
            className={`pill ${form.priority === "urgent" ? "pill--urgent" : "pill--neutral"}`}
          >
            {form.priority === "urgent" ? "Urgent" : "Normal"}
          </span>
        </dd>

        {form.customerReference && (
          <>
            <dt>Customer Ref</dt>
            <dd>{form.customerReference}</dd>
          </>
        )}

        {form.notes && (
          <>
            <dt>Notes</dt>
            <dd>{form.notes}</dd>
          </>
        )}
      </dl>

      <h4 className="nso-review-lines-heading">Lines ({form.lines.length})</h4>
      <table className="nso-review-table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Product</th>
            <th className="text-right">Qty</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {form.lines.map((line, i) => (
            <tr key={i}>
              <td className="text-mono">{line.sku || "—"}</td>
              <td>{line.productName || "—"}</td>
              <td className="text-right">{formatNumber(line.quantityOrdered)}</td>
              <td>
                {line.isSerialTracked && (
                  <span className="pill pill--info" style={{ fontSize: "0.7rem" }}>
                    Serial
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {submitError && <p className="nso-submit-error">{submitError}</p>}

      <div className="nso-review-actions">
        <button type="button" className="btn btn-secondary" onClick={onBack} disabled={submitting}>
          ← Back
        </button>
        <button type="button" className="btn btn-primary" onClick={onSubmit} disabled={submitting}>
          {submitting ? "Creating order..." : "Confirm & Create Order"}
        </button>
      </div>
    </div>
  );
}

function SuccessScreen({ result, onNavigate, onCreateAnother }) {
  return (
    <div className="nso-success-hero">
      <div className="nso-success-icon">✓</div>
      <h2 className="nso-success-title">Sales Order Created</h2>
      <div className="nso-success-so-number">{result.orderNumber}</div>
      <p className="nso-success-sub">
        Created for <strong>{result.customerName}</strong>
        {result.priority === "urgent" && (
          <span className="pill pill--urgent" style={{ marginLeft: "0.5rem" }}>
            Urgent
          </span>
        )}
      </p>
      <p className="nso-success-lines">
        {result.lines.length} line{result.lines.length !== 1 ? "s" : ""} &middot;{" "}
        {result.lines.reduce((t, l) => t + Number(l.quantityOrdered), 0)} units ordered
      </p>
      <div className="nso-success-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => onNavigate("/sales-orders")}
        >
          View Sales Orders
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCreateAnother}>
          Create Another
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function NewSalesOrderPage({ onNavigate }) {
  const canCreate = usePermission("so:create");

  const [step, setStep] = useState("form"); // "form" | "review" | "success"
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [createdOrder, setCreatedOrder] = useState(null);

  const customersResource = useApiResource("/customers");
  const productsResource = useApiResource("/products?active=true");

  const customers = customersResource.data?.items || [];
  const products = productsResource.data?.items || [];

  if (!canCreate) {
    return (
      <div className="access-denied-card">
        <div className="access-denied-icon">🔒</div>
        <h3>Access Denied</h3>
        <p>Only Admin and Office users can create sales orders.</p>
      </div>
    );
  }

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function setCustomer({ customerId, customerName }) {
    setForm((prev) => ({ ...prev, customerId, customerName }));
    setErrors((prev) => ({ ...prev, customerId: undefined }));
  }

  function handleCustomerCreated(customer) {
    customersResource.reload();
    setForm((prev) => ({
      ...prev,
      customerId: customer.id,
      customerName: customer.name,
    }));
  }

  function handleLineChange(index, updated) {
    setForm((prev) => {
      const lines = [...prev.lines];
      lines[index] = updated;
      return { ...prev, lines };
    });
  }

  function handleAddLine() {
    setForm((prev) => ({ ...prev, lines: [...prev.lines, emptyLine()] }));
  }

  function handleRemoveLine(index) {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.filter((_, i) => i !== index),
    }));
  }

  function validateForm() {
    const errs = {};

    if (!form.customerId) errs.customerId = "Customer is required.";
    if (!form.orderDate) errs.orderDate = "Order date is required.";
    if (form.lines.length === 0) errs.lines = "At least one line is required.";

    form.lines.forEach((line, i) => {
      if (!line.productId) errs[`line_${i}_product`] = "Product is required.";
      if (!line.quantityOrdered || Number(line.quantityOrdered) <= 0)
        errs[`line_${i}_qty`] = "Quantity must be > 0.";
    });

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleReview(e) {
    e.preventDefault();
    if (validateForm()) {
      setSubmitError("");
      setStep("review");
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError("");
    try {
      const payload = {
        customerId: Number(form.customerId),
        orderDate: form.orderDate,
        requiredDate: form.requiredDate || undefined,
        priority: form.priority,
        customerReference: form.customerReference,
        notes: form.notes,
        lines: form.lines.map((l) => ({
          productId: Number(l.productId),
          quantityOrdered: Number(l.quantityOrdered),
        })),
      };

      const result = await apiFetch("/sales-orders", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setCreatedOrder(result);
      setStep("success");
    } catch (err) {
      setSubmitError(err.message || "Failed to create sales order.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCreateAnother() {
    setForm(emptyForm());
    setErrors({});
    setSubmitError("");
    setCreatedOrder(null);
    setStep("form");
  }

  if (step === "success" && createdOrder) {
    return (
      <div className="page-content">
        <PageHeader
          title="New Sales Order"
          subtitle="Create a customer order and allocate stock."
        />
        <SuccessScreen
          result={createdOrder}
          onNavigate={onNavigate}
          onCreateAnother={handleCreateAnother}
        />
      </div>
    );
  }

  return (
    <div className="page-content">
      <PageHeader
        title="New Sales Order"
        subtitle="Create a customer order and allocate stock."
      />

      {step === "review" ? (
        <ReviewPanel
          form={form}
          customers={customers}
          onBack={() => setStep("form")}
          onSubmit={handleSubmit}
          submitting={submitting}
          submitError={submitError}
        />
      ) : (
        <form onSubmit={handleReview} noValidate>
          <div className="nso-layout">
            {/* ── Left column: form sections ────────────────────────────── */}
            <div className="nso-form-col">

              {/* Section: Customer */}
              <section className="card nso-section">
                <h3 className="nso-section-title">Customer</h3>

                <FieldWrap label="Customer" required>
                  {customersResource.status === "loading" ? (
                    <p className="text-muted">Loading customers...</p>
                  ) : (
                    <CustomerSearch
                      customers={customers}
                      value={{ customerId: form.customerId, customerName: form.customerName }}
                      onSelect={setCustomer}
                    />
                  )}
                  {errors.customerId && (
                    <p className="nso-field-error">{errors.customerId}</p>
                  )}
                </FieldWrap>

                <CreateCustomerPanel onCreated={handleCustomerCreated} />
              </section>

              {/* Section: Order Details */}
              <section className="card nso-section">
                <h3 className="nso-section-title">Order Details</h3>

                <div className="nso-grid">
                  <FieldWrap label="Order Date" required>
                    <input
                      type="date"
                      className="form-control"
                      value={form.orderDate}
                      onChange={(e) => setField("orderDate", e.target.value)}
                      required
                    />
                    {errors.orderDate && (
                      <p className="nso-field-error">{errors.orderDate}</p>
                    )}
                  </FieldWrap>

                  <FieldWrap label="Required By">
                    <input
                      type="date"
                      className="form-control"
                      value={form.requiredDate}
                      onChange={(e) => setField("requiredDate", e.target.value)}
                    />
                  </FieldWrap>

                  <FieldWrap label="Priority">
                    <PriorityPicker
                      value={form.priority}
                      onChange={(v) => setField("priority", v)}
                    />
                  </FieldWrap>

                  <FieldWrap label="Customer Reference">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. PO-12345"
                      value={form.customerReference}
                      onChange={(e) => setField("customerReference", e.target.value)}
                    />
                  </FieldWrap>
                </div>

                <FieldWrap label="Notes">
                  <textarea
                    className="form-control"
                    rows={3}
                    placeholder="Any notes for this order..."
                    value={form.notes}
                    onChange={(e) => setField("notes", e.target.value)}
                  />
                </FieldWrap>
              </section>

              {/* Section: Line Items */}
              <section className="card nso-section">
                <h3 className="nso-section-title">Line Items</h3>

                {productsResource.status === "loading" && (
                  <p className="text-muted">Loading products...</p>
                )}

                {errors.lines && <p className="nso-field-error">{errors.lines}</p>}

                <div className="nso-lines-list">
                  <div className="nso-line-header">
                    <span className="nso-line-col-product">Product</span>
                    <span className="nso-line-col-qty">Qty</span>
                    <span className="nso-line-col-badge"></span>
                    <span className="nso-line-col-remove"></span>
                  </div>

                  {form.lines.map((line, i) => (
                    <div key={i}>
                      <LineRow
                        line={line}
                        index={i}
                        products={products}
                        onChange={handleLineChange}
                        onRemove={handleRemoveLine}
                        canRemove={form.lines.length > 1}
                      />
                      {(errors[`line_${i}_product`] || errors[`line_${i}_qty`]) && (
                        <p className="nso-field-error nso-line-error">
                          {errors[`line_${i}_product`] || errors[`line_${i}_qty`]}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm nso-add-line-btn"
                  onClick={handleAddLine}
                >
                  + Add Line
                </button>
              </section>
            </div>

            {/* ── Right column: summary sidebar ──────────────────────────── */}
            <div className="nso-sidebar-col">
              <div className="card nso-summary-card">
                <h3 className="nso-section-title">Summary</h3>
                <dl className="nso-summary-dl">
                  <dt>Customer</dt>
                  <dd>{form.customerName || <span className="text-muted">Not selected</span>}</dd>
                  <dt>Order Date</dt>
                  <dd>{form.orderDate ? formatDate(form.orderDate) : <span className="text-muted">—</span>}</dd>
                  <dt>Required By</dt>
                  <dd>{form.requiredDate ? formatDate(form.requiredDate) : <span className="text-muted">—</span>}</dd>
                  <dt>Priority</dt>
                  <dd>
                    <span
                      className={`pill ${form.priority === "urgent" ? "pill--urgent" : "pill--neutral"}`}
                    >
                      {form.priority === "urgent" ? "Urgent" : "Normal"}
                    </span>
                  </dd>
                  <dt>Lines</dt>
                  <dd>
                    {form.lines.filter((l) => l.productId).length} / {form.lines.length} configured
                  </dd>
                </dl>
                <button type="submit" className="btn btn-primary nso-review-btn">
                  Review Order →
                </button>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
