import { useState } from "react";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import ScannerInput from "../components/ScannerInput";
import StatusPill from "../components/StatusPill";
import { apiFetch } from "../lib/api";
import { formatDateTime } from "../lib/formatters";

// ── Step labels ───────────────────────────────────────────────────────────────
const STEPS = ["Find Serial", "Return Details", "Replacement", "Confirmation"];

const RETURN_REASONS = [
  "Faulty on arrival",
  "Failed in service",
  "Wrong item sent",
  "Customer changed mind",
  "Warranty claim",
  "Damaged in transit",
  "Other",
];

const CONDITIONS = [
  { value: "working", label: "Working — no fault found" },
  { value: "repairable", label: "Repairable — minor fault" },
  { value: "faulty", label: "Faulty — requires assessment" },
  { value: "damaged", label: "Damaged — physical damage" },
  { value: "unknown", label: "Unknown" },
];

// ── Status tone helper ────────────────────────────────────────────────────────
function holdStatusTone(status) {
  switch (status) {
    case "available":
    case "received":
      return "positive";
    case "allocated":
    case "dispatched":
      return "info";
    case "returned":
    case "quarantined":
      return "warning";
    case "scrapped":
    case "warranty_replacement":
      return "negative";
    default:
      return "neutral";
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StepIndicator({ current }) {
  return (
    <div className="returns-steps">
      {STEPS.map((label, i) => (
        <div
          key={label}
          className={[
            "returns-step",
            i === current ? "returns-step--active" : "",
            i < current ? "returns-step--done" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className="returns-step-dot">{i < current ? "✓" : i + 1}</div>
          <span className="returns-step-label">{label}</span>
        </div>
      ))}
    </div>
  );
}

function SerialSummaryStrip({ item }) {
  return (
    <div className="returns-serial-strip">
      <div className="returns-serial-strip-left">
        <span className="returns-serial-number">{item.serial_number}</span>
        <span className="returns-serial-product">{item.product_name}</span>
        <span className="returns-serial-sku">{item.sku}</span>
      </div>
      <div className="returns-serial-strip-right">
        <StatusPill value={item.hold_status} />
        {item.location_code && (
          <span className="returns-serial-loc">{item.location_code}</span>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function ReturnsPage() {
  // Workflow state
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Step 1 — found serial
  const [foundItem, setFoundItem] = useState(null);

  // Step 2 — return form
  const [returnReason, setReturnReason] = useState("");
  const [condition, setCondition] = useState("faulty");
  const [quarantine, setQuarantine] = useState(false);
  const [quarantineReason, setQuarantineReason] = useState("");
  const [returnedBy, setReturnedBy] = useState("");
  const [returnNotes, setReturnNotes] = useState("");

  // Step 3 — replacement
  const [wantsReplacement, setWantsReplacement] = useState(false);
  const [replacementQuery, setReplacementQuery] = useState("");
  const [replacementItem, setReplacementItem] = useState(null);
  const [replacementError, setReplacementError] = useState(null);
  const [warrantyReason, setWarrantyReason] = useState("");
  const [replacementNotes, setReplacementNotes] = useState("");

  // Step 4 — results
  const [returnResult, setReturnResult] = useState(null);
  const [warrantyResult, setWarrantyResult] = useState(null);

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleReset() {
    setStep(0);
    setQuery("");
    setFoundItem(null);
    setError(null);
    setReturnReason("");
    setCondition("faulty");
    setQuarantine(false);
    setQuarantineReason("");
    setReturnedBy("");
    setReturnNotes("");
    setWantsReplacement(false);
    setReplacementQuery("");
    setReplacementItem(null);
    setReplacementError(null);
    setWarrantyReason("");
    setReplacementNotes("");
    setReturnResult(null);
    setWarrantyResult(null);
  }

  async function handleSerialSearch(term) {
    if (!term.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`/serials/${encodeURIComponent(term.trim())}`);
      // data is { item, movements } or { item, timeline } depending on branch
      const item = data.item || data;
      setFoundItem(item);
      setStep(1);
    } catch (err) {
      if (err.message.includes("404")) {
        setError(`No serial record found for "${term}".`);
      } else {
        setError(err.message || "Unable to look up serial.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleReplacementSearch(term) {
    if (!term.trim()) return;
    setLoading(true);
    setReplacementError(null);
    try {
      const data = await apiFetch(`/serials/${encodeURIComponent(term.trim())}`);
      const item = data.item || data;
      const readyStatuses = ["available", "received", "pending_allocation"];
      if (!readyStatuses.includes(item.hold_status)) {
        setReplacementError(
          `Serial '${item.serial_number}' has status '${item.hold_status}' and cannot be used as a replacement.`,
        );
        setReplacementItem(null);
      } else {
        setReplacementItem(item);
      }
    } catch (err) {
      if (err.message.includes("404")) {
        setReplacementError(`No serial record found for "${term}".`);
      } else {
        setReplacementError(err.message || "Unable to look up serial.");
      }
      setReplacementItem(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitReturn() {
    if (!returnReason) {
      setError("Please select a return reason.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch("/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serial_number: foundItem.serial_number,
          return_reason: returnReason,
          condition,
          quarantine,
          quarantine_reason: quarantine ? quarantineReason : "",
          returned_by: returnedBy,
          notes: returnNotes,
        }),
      });
      setReturnResult(result);
      setStep(2);
    } catch (err) {
      setError(err.message || "Failed to log return.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitWarranty() {
    if (!replacementItem) {
      setError("Please find and confirm a replacement serial first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch("/returns/warranty-replacement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          original_serial_number: foundItem.serial_number,
          replacement_serial_number: replacementItem.serial_number,
          warranty_reason: warrantyReason || returnReason,
          replaced_by: returnedBy,
          notes: replacementNotes || returnNotes,
        }),
      });
      setWarrantyResult(result);
      setStep(3);
    } catch (err) {
      setError(err.message || "Failed to create warranty replacement.");
    } finally {
      setLoading(false);
    }
  }

  function handleSkipReplacement() {
    setStep(3);
  }

  // ── Blocked statuses ─────────────────────────────────────────────────────
  const isAlreadyReturned =
    foundItem && ["returned", "quarantined", "scrapped"].includes(foundItem.hold_status);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="After-Sales"
        title="Returns &amp; Warranty"
        description="Log a customer return, quarantine damaged goods, or raise a warranty replacement."
      />

      <StepIndicator current={step} />

      {/* ── Step 0: Serial search ─────────────────────────────────────────── */}
      {step === 0 && (
        <Card title="Find Serial" subtitle="Scan or Type">
          <div className="tracker-search-area">
            <ScannerInput
              value={query}
              onChange={setQuery}
              onSubmit={handleSerialSearch}
              placeholder="Scan barcode or enter serial number…"
              autoFocus
              disabled={loading}
            />
          </div>
          {loading && <p className="tracker-state">Looking up serial…</p>}
          {error && <p className="tracker-state tracker-error">{error}</p>}
        </Card>
      )}

      {/* ── Step 1: Return form ───────────────────────────────────────────── */}
      {step === 1 && foundItem && (
        <>
          <Card title="Serial Found" subtitle="Confirm item">
            <SerialSummaryStrip item={foundItem} />

            {isAlreadyReturned && (
              <div className="returns-alert returns-alert--warning">
                <strong>Warning:</strong> This serial already has status{" "}
                <strong>{foundItem.hold_status}</strong>. It cannot be returned again.
              </div>
            )}
          </Card>

          {!isAlreadyReturned && (
            <Card title="Return Details" subtitle="Step 2 of 4">
              {error && <p className="tracker-state tracker-error">{error}</p>}

              <div className="returns-form">
                <div className="returns-field">
                  <label className="returns-label" htmlFor="return-reason">
                    Return Reason <span className="returns-required">*</span>
                  </label>
                  <select
                    id="return-reason"
                    className="returns-select"
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                  >
                    <option value="">— Select reason —</option>
                    {RETURN_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="returns-field">
                  <label className="returns-label" htmlFor="condition">
                    Condition on Return
                  </label>
                  <select
                    id="condition"
                    className="returns-select"
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                  >
                    {CONDITIONS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="returns-field returns-field--checkbox">
                  <label className="returns-checkbox-label">
                    <input
                      type="checkbox"
                      checked={quarantine}
                      onChange={(e) => setQuarantine(e.target.checked)}
                    />
                    Send to Quarantine
                    <span className="returns-checkbox-hint">
                      Check if item should be isolated pending inspection
                    </span>
                  </label>
                </div>

                {quarantine && (
                  <div className="returns-field">
                    <div className="returns-alert returns-alert--danger">
                      <strong>Quarantine selected.</strong> This item will be moved to the
                      Quarantine location and marked unavailable until released.
                    </div>
                    <label className="returns-label" htmlFor="quarantine-reason">
                      Quarantine Reason
                    </label>
                    <input
                      id="quarantine-reason"
                      type="text"
                      className="returns-input"
                      value={quarantineReason}
                      onChange={(e) => setQuarantineReason(e.target.value)}
                      placeholder="e.g. Suspected fault, awaiting engineer review"
                    />
                  </div>
                )}

                <div className="returns-field">
                  <label className="returns-label" htmlFor="returned-by">
                    Returned By
                  </label>
                  <input
                    id="returned-by"
                    type="text"
                    className="returns-input"
                    value={returnedBy}
                    onChange={(e) => setReturnedBy(e.target.value)}
                    placeholder="Name or customer reference"
                  />
                </div>

                <div className="returns-field">
                  <label className="returns-label" htmlFor="return-notes">
                    Notes
                  </label>
                  <textarea
                    id="return-notes"
                    className="returns-textarea"
                    value={returnNotes}
                    onChange={(e) => setReturnNotes(e.target.value)}
                    placeholder="Any additional detail about the return…"
                    rows={3}
                  />
                </div>

                <div className="returns-actions">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={handleReset}
                    disabled={loading}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="button primary"
                    onClick={handleSubmitReturn}
                    disabled={loading || !returnReason}
                  >
                    {loading ? "Logging Return…" : "Log Return →"}
                  </button>
                </div>
              </div>
            </Card>
          )}

          {isAlreadyReturned && (
            <div className="returns-actions returns-actions--centered">
              <button type="button" className="button secondary" onClick={handleReset}>
                Start Again
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Step 2: Replacement ───────────────────────────────────────────── */}
      {step === 2 && returnResult && (
        <>
          <Card title="Return Logged" subtitle={returnResult.return_reference}>
            <div className="returns-success-banner">
              <div className="returns-success-icon">✓</div>
              <div>
                <p className="returns-success-title">
                  {returnResult.serial_number} has been logged as{" "}
                  <strong>{returnResult.hold_status}</strong>
                </p>
                <p className="returns-success-sub">
                  Reference: <strong>{returnResult.return_reference}</strong> · Location:{" "}
                  <strong>{returnResult.destination}</strong>
                </p>
              </div>
            </div>
          </Card>

          <Card title="Warranty Replacement" subtitle="Step 3 of 4 — Optional">
            {error && <p className="tracker-state tracker-error">{error}</p>}

            <p className="returns-replacement-intro">
              Does this return require a replacement unit to be sent to the customer?
            </p>

            <div className="returns-field returns-field--checkbox">
              <label className="returns-checkbox-label">
                <input
                  type="checkbox"
                  checked={wantsReplacement}
                  onChange={(e) => {
                    setWantsReplacement(e.target.checked);
                    if (!e.target.checked) {
                      setReplacementItem(null);
                      setReplacementError(null);
                    }
                  }}
                />
                Raise a warranty replacement
              </label>
            </div>

            {wantsReplacement && (
              <div className="returns-form">
                <div className="returns-field">
                  <label className="returns-label">Replacement Serial</label>
                  <div className="tracker-search-area">
                    <ScannerInput
                      value={replacementQuery}
                      onChange={setReplacementQuery}
                      onSubmit={handleReplacementSearch}
                      placeholder="Scan or enter replacement serial…"
                      disabled={loading}
                    />
                  </div>
                  {loading && <p className="tracker-state">Looking up serial…</p>}
                  {replacementError && (
                    <p className="tracker-state tracker-error">{replacementError}</p>
                  )}
                  {replacementItem && (
                    <div className="returns-replacement-found">
                      <div className={`returns-replacement-dot tone-${holdStatusTone(replacementItem.hold_status)}`} />
                      <div>
                        <strong>{replacementItem.serial_number}</strong> ·{" "}
                        {replacementItem.product_name}
                        <StatusPill value={replacementItem.hold_status} />
                      </div>
                    </div>
                  )}
                </div>

                <div className="returns-field">
                  <label className="returns-label" htmlFor="warranty-reason">
                    Warranty Reason
                  </label>
                  <input
                    id="warranty-reason"
                    type="text"
                    className="returns-input"
                    value={warrantyReason}
                    onChange={(e) => setWarrantyReason(e.target.value)}
                    placeholder="e.g. Screen failure within 12-month warranty"
                  />
                </div>

                <div className="returns-field">
                  <label className="returns-label" htmlFor="replacement-notes">
                    Notes
                  </label>
                  <textarea
                    id="replacement-notes"
                    className="returns-textarea"
                    value={replacementNotes}
                    onChange={(e) => setReplacementNotes(e.target.value)}
                    placeholder="Any additional detail…"
                    rows={2}
                  />
                </div>

                {replacementItem && (
                  <div className="returns-alert returns-alert--info">
                    <strong>{replacementItem.serial_number}</strong> will be dispatched as a
                    warranty replacement for <strong>{foundItem.serial_number}</strong> and
                    linked to the original customer record.
                  </div>
                )}
              </div>
            )}

            <div className="returns-actions">
              <button
                type="button"
                className="button secondary"
                onClick={handleSkipReplacement}
                disabled={loading}
              >
                Skip — No Replacement
              </button>
              {wantsReplacement && (
                <button
                  type="button"
                  className="button primary"
                  onClick={handleSubmitWarranty}
                  disabled={loading || !replacementItem}
                >
                  {loading ? "Processing…" : "Confirm Replacement →"}
                </button>
              )}
            </div>
          </Card>
        </>
      )}

      {/* ── Step 3: Confirmation ──────────────────────────────────────────── */}
      {step === 3 && (
        <>
          <Card title="Workflow Complete" subtitle="Summary">
            <div className="returns-confirmation">
              {returnResult && (
                <div className="returns-confirmation-block">
                  <h3 className="returns-confirmation-heading">Return Logged</h3>
                  <dl className="definition-list">
                    <div>
                      <dt>Reference</dt>
                      <dd>{returnResult.return_reference}</dd>
                    </div>
                    <div>
                      <dt>Serial</dt>
                      <dd>{returnResult.serial_number}</dd>
                    </div>
                    <div>
                      <dt>Product</dt>
                      <dd>{returnResult.product_name}</dd>
                    </div>
                    <div>
                      <dt>New Status</dt>
                      <dd>
                        <StatusPill value={returnResult.hold_status} />
                      </dd>
                    </div>
                    <div>
                      <dt>Location</dt>
                      <dd>{returnResult.destination}</dd>
                    </div>
                    {returnResult.customer_return?.return_reason && (
                      <div>
                        <dt>Reason</dt>
                        <dd>{returnResult.customer_return.return_reason}</dd>
                      </div>
                    )}
                    {returnResult.customer_return?.condition && (
                      <div>
                        <dt>Condition</dt>
                        <dd>{returnResult.customer_return.condition}</dd>
                      </div>
                    )}
                    <div>
                      <dt>Recorded</dt>
                      <dd>{formatDateTime(returnResult.customer_return?.returned_at)}</dd>
                    </div>
                  </dl>
                </div>
              )}

              {warrantyResult && (
                <div className="returns-confirmation-block">
                  <h3 className="returns-confirmation-heading">Warranty Replacement Raised</h3>
                  <dl className="definition-list">
                    <div>
                      <dt>Reference</dt>
                      <dd>{warrantyResult.warranty_reference}</dd>
                    </div>
                    <div>
                      <dt>Original Serial</dt>
                      <dd>{warrantyResult.original_serial}</dd>
                    </div>
                    <div>
                      <dt>Replacement Serial</dt>
                      <dd>{warrantyResult.replacement_serial}</dd>
                    </div>
                    <div>
                      <dt>Product</dt>
                      <dd>{warrantyResult.product_name}</dd>
                    </div>
                    <div>
                      <dt>Recorded</dt>
                      <dd>
                        {formatDateTime(warrantyResult.warranty_replacement?.replaced_at)}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}

              {!warrantyResult && returnResult && (
                <p className="returns-no-replacement">No warranty replacement raised.</p>
              )}
            </div>
          </Card>

          <div className="returns-actions returns-actions--centered">
            <button type="button" className="button primary" onClick={handleReset}>
              Process Another Return
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default ReturnsPage;
