import { useEffect, useMemo, useRef, useState } from "react";
import Button from "../components/Button";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";
import { apiFetch } from "../lib/api";
import { formatDate, formatNumber } from "../lib/formatters";
import { useUser } from "../context/UserContext";

// ── Helpers ───────────────────────────────────────────────────────────────────

function classifyDispatchDate(dateStr) {
  if (!dateStr) return "none";
  const daysUntil = (new Date(dateStr) - Date.now()) / 86_400_000;
  if (daysUntil < 0) return "overdue";
  if (daysUntil <= 3) return "soon";
  return "ok";
}

function parseSerials(text) {
  return text
    .split(/[\r\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ── Suggestion panel ──────────────────────────────────────────────────────────

function ReasonTag({ text }) {
  const cls = text.toLowerCase().includes("overdue")
    ? "sug-reason-tag sug-reason-tag--overdue"
    : text.toLowerCase().includes("urgent") || text.toLowerCase().includes("today")
    ? "sug-reason-tag sug-reason-tag--urgent"
    : text.toLowerCase().includes("linked")
    ? "sug-reason-tag sug-reason-tag--linked"
    : "sug-reason-tag sug-reason-tag--default";
  return <span className={cls}>{text}</span>;
}

function SuggestionCard({ productName, productSku, isSerialTracked, availableQuantity, requiresPutaway, soMatch, onAllocate }) {
  const dateCls = classifyDispatchDate(soMatch.dispatchDueAt);

  return (
    <article className="sug-card">
      <div className="sug-card-header">
        <div className="sug-card-product">
          <span className="sug-product-name">{productName}</span>
          <span className="sug-product-sku">{productSku}</span>
        </div>
        <div className="sug-card-meta">
          {soMatch.isLinked && (
            <span className="sug-linked-badge">🔗 Linked PO</span>
          )}
          {soMatch.priority === "urgent" && (
            <span className="sug-urgent-badge">🔴 Urgent</span>
          )}
        </div>
      </div>

      <div className="sug-card-body">
        <div className="sug-so-block">
          <div className="sug-so-number">{soMatch.salesOrderNumber}</div>
          <div className="sug-so-customer">{soMatch.customerName}</div>
          {soMatch.dispatchDueAt && (
            <div className={`sug-due-tag sug-due-tag--${dateCls}`}>
              {dateCls === "overdue"
                ? `Overdue · ${formatDate(soMatch.dispatchDueAt)}`
                : `Due ${formatDate(soMatch.dispatchDueAt)}`}
            </div>
          )}
        </div>

        <div className="sug-stock-block">
          <div className="sug-qty-row">
            <div className="sug-qty-item">
              <span className="sug-qty-label">Available</span>
              <strong className="sug-qty-value">{formatNumber(availableQuantity)}</strong>
            </div>
            <div className="sug-qty-item">
              <span className="sug-qty-label">Needed</span>
              <strong className={`sug-qty-value ${soMatch.canFullyFulfill ? "sug-qty--ok" : "sug-qty--short"}`}>
                {formatNumber(soMatch.remainingQuantity)}
              </strong>
            </div>
          </div>
          {!soMatch.canFullyFulfill && (
            <p className="sug-short-warning">
              Stock short by {formatNumber(soMatch.remainingQuantity - availableQuantity)}{" "}
              {isSerialTracked ? "unit" : "pack"}
              {soMatch.remainingQuantity - availableQuantity !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>

      <div className="sug-reasons">
        {soMatch.reasons.map((r) => (
          <ReasonTag key={r} text={r} />
        ))}
      </div>

      {requiresPutaway && (
        <p className="sug-putaway-notice">
          ⚠ Stock is in hold — put away required before allocating
        </p>
      )}

      <div className="sug-card-footer">
        <button
          type="button"
          className="sug-allocate-btn"
          onClick={() => onAllocate(soMatch.salesOrderNumber)}
        >
          Go to {soMatch.salesOrderNumber} to allocate →
        </button>
      </div>
    </article>
  );
}

function SuggestionsPanel({ poNumber, onNavigateToSO }) {
  const [status, setStatus] = useState("loading");
  const [suggestions, setSuggestions] = useState([]);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    async function load() {
      try {
        const data = await apiFetch(`/allocation/suggestions/${encodeURIComponent(poNumber)}`);
        if (cancelledRef.current) return;
        setSuggestions(data.suggestions || []);
        setStatus("success");
      } catch {
        if (cancelledRef.current) return;
        setStatus("error");
      }
    }

    void load();
    return () => { cancelledRef.current = true; };
  }, [poNumber]);

  if (status === "loading") {
    return (
      <div className="sug-panel">
        <div className="sug-panel-header">
          <h3 className="sug-panel-title">Checking for open demand…</h3>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return null; // silently skip
  }

  if (!suggestions.length) {
    return (
      <div className="sug-panel sug-panel--empty">
        <div className="sug-panel-header">
          <h3 className="sug-panel-title">No open demand found</h3>
          <p className="sug-panel-sub">
            No sales orders currently need the products received from this delivery.
          </p>
        </div>
      </div>
    );
  }

  // Flatten to a list of (product, soMatch) cards, prioritised
  const cards = [];
  for (const group of suggestions) {
    for (const soMatch of group.matchedSalesOrders) {
      cards.push({ group, soMatch });
    }
  }

  return (
    <div className="sug-panel">
      <div className="sug-panel-header">
        <h3 className="sug-panel-title">Suggested Sales Order Allocations</h3>
        <p className="sug-panel-sub">
          The received stock matches open demand on the orders below. Review each suggestion and
          confirm allocation — nothing is assigned automatically.
        </p>
      </div>
      <div className="sug-cards-grid">
        {cards.map(({ group, soMatch }) => (
          <SuggestionCard
            key={`${group.productId}-${soMatch.salesOrderNumber}`}
            productName={group.productName}
            productSku={group.productSku}
            isSerialTracked={group.isSerialTracked}
            availableQuantity={group.availableQuantity}
            requiresPutaway={group.requiresPutaway}
            soMatch={soMatch}
            onAllocate={onNavigateToSO}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function ReceiveGoodsPage({ onNavigate }) {
  const { currentUser } = useUser();
  const purchaseOrders = useApiResource("/purchase-orders");

  const [selectedPoNumber, setSelectedPoNumber] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("po") || "";
  });

  const [detailStatus, setDetailStatus] = useState("idle");
  const [detailData, setDetailData] = useState(null);
  const [detailError, setDetailError] = useState("");

  // Form state — keyed by line id
  const [lineInputs, setLineInputs] = useState({});
  const [deliveryNumber, setDeliveryNumber] = useState("");
  const [receivedBy, setReceivedBy] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [validationMsg, setValidationMsg] = useState("");
  const [successSummary, setSuccessSummary] = useState(null); // receipt result from API
  const [showSuggestions, setShowSuggestions] = useState(false);

  const poOptions = purchaseOrders.data?.items || [];

  // Auto-select first PO on load
  useEffect(() => {
    if (!poOptions.length || selectedPoNumber) return;
    setSelectedPoNumber(poOptions[0].poNumber || poOptions[0].order_number || "");
  }, [poOptions, selectedPoNumber]);

  // Pre-fill receivedBy from current user
  useEffect(() => {
    if (currentUser?.full_name && !receivedBy) {
      setReceivedBy(currentUser.full_name);
    }
  }, [currentUser]);

  // Load PO detail when selection changes
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!selectedPoNumber) {
        setDetailStatus("idle");
        setDetailData(null);
        return;
      }

      setDetailStatus("loading");
      setDetailData(null);
      setDetailError("");
      setSuccessSummary(null);
      setShowSuggestions(false);

      try {
        const payload = await apiFetch(
          `/purchase-orders/${encodeURIComponent(selectedPoNumber)}`,
        );
        if (cancelled) return;

        setDetailData(payload);
        setDetailStatus("success");

        // Initialise per-line inputs
        const initial = {};
        for (const line of payload.lines || []) {
          initial[line.id] = { qty: "", serials: "" };
        }
        setLineInputs(initial);
      } catch (err) {
        if (cancelled) return;
        setDetailStatus("error");
        setDetailError(err.message || "Unable to load purchase order.");
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [selectedPoNumber]);

  // Live summary of what will be received
  const liveSummary = useMemo(() => {
    if (!detailData?.lines) return [];
    return detailData.lines.map((line) => {
      const rawQty = lineInputs[line.id]?.qty || "";
      const qty = parseFloat(rawQty);
      const qtyNow = Number.isFinite(qty) && qty > 0 ? qty : 0;
      const serials = parseSerials(lineInputs[line.id]?.serials || "");
      return {
        ...line,
        qtyNow,
        qtyAfter: Math.max(0, line.remainingQuantity - qtyNow),
        serialCount: serials.length,
      };
    });
  }, [detailData, lineInputs]);

  function updateLineField(lineId, field, value) {
    setValidationMsg("");
    setLineInputs((prev) => ({
      ...prev,
      [lineId]: { ...(prev[lineId] || { qty: "", serials: "" }), [field]: value },
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setValidationMsg("");
    setSuccessSummary(null);
    setShowSuggestions(false);

    if (!selectedPoNumber) {
      setValidationMsg("Select a purchase order first.");
      return;
    }
    if (!deliveryNumber.trim()) {
      setValidationMsg("Enter the supplier delivery note number.");
      return;
    }
    if (!receivedBy.trim()) {
      setValidationMsg("Enter who received the delivery.");
      return;
    }

    const submissionLines = liveSummary
      .filter((line) => line.qtyNow > 0)
      .map((line) => ({
        purchaseOrderLineId: line.id,
        quantityReceived: line.qtyNow,
        serialNumbers: parseSerials(lineInputs[line.id]?.serials || ""),
      }));

    if (!submissionLines.length) {
      setValidationMsg("Enter at least one quantity to receive.");
      return;
    }

    setSubmitting(true);

    try {
      const result = await apiFetch(
        `/purchase-orders/${encodeURIComponent(selectedPoNumber)}/receive`,
        {
          method: "POST",
          body: JSON.stringify({
            deliveryNumber: deliveryNumber.trim(),
            receivedBy: receivedBy.trim(),
            lines: submissionLines,
          }),
        },
      );

      setSuccessSummary(result);
      setShowSuggestions(true);
      purchaseOrders.reload();

      // Re-fetch PO detail to update quantities
      const refreshed = await apiFetch(
        `/purchase-orders/${encodeURIComponent(selectedPoNumber)}`,
      );
      setDetailData(refreshed);
      const reset = {};
      for (const line of refreshed.lines || []) {
        reset[line.id] = { qty: "", serials: "" };
      }
      setLineInputs(reset);
    } catch (err) {
      setValidationMsg(err.message || "Unable to save receipt.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleNavigateToSO(soNumber) {
    if (typeof onNavigate === "function") {
      onNavigate("/sales-orders");
    } else {
      window.history.pushState({}, "", "/sales-orders");
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }

  function handleReceiveAnother() {
    setSuccessSummary(null);
    setShowSuggestions(false);
    setSelectedPoNumber("");
    setDeliveryNumber("");
    setLineInputs({});
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Goods In"
        title="Receive Goods"
        description="Book deliveries against open purchase orders, capture serials, and see which sales orders can be fulfilled immediately."
        actions={
          <Button variant="secondary" onClick={purchaseOrders.reload}>
            Refresh Orders
          </Button>
        }
      />

      {/* PO selector */}
      <Card title="Select Purchase Order" subtitle="Inbound Queue">
        {purchaseOrders.status === "loading" && (
          <p className="rg-loading">Loading open purchase orders…</p>
        )}
        {purchaseOrders.status === "error" && (
          <p className="rg-error">{purchaseOrders.error || "Unable to load orders."}</p>
        )}
        {purchaseOrders.status === "success" && (
          <div className="rg-po-selector">
            <label className="field-label" htmlFor="po-select">
              Purchase order
            </label>
            <select
              id="po-select"
              className="text-input"
              value={selectedPoNumber}
              onChange={(e) => {
                setSelectedPoNumber(e.target.value);
                setSuccessSummary(null);
                setShowSuggestions(false);
                setValidationMsg("");
              }}
            >
              <option value="">— Select a purchase order —</option>
              {poOptions.map((po) => {
                const num = po.poNumber || po.order_number;
                const sup = po.supplier || po.supplier_name;
                return (
                  <option key={num} value={num}>
                    {num} · {sup} · {po.status}
                  </option>
                );
              })}
            </select>
          </div>
        )}
      </Card>

      {/* Receipt form */}
      {detailStatus === "loading" && (
        <Card title="Loading…" subtitle="Fetching PO detail">
          <div className="table-state">
            <strong>Loading purchase order</strong>
            <p>Preparing lines for receipt entry.</p>
          </div>
        </Card>
      )}

      {detailStatus === "error" && (
        <Card title="Error" subtitle="Unable to load">
          <div className="table-state error">
            <strong>Unable to load purchase order</strong>
            <p>{detailError}</p>
          </div>
        </Card>
      )}

      {detailStatus === "idle" && (
        <Card title="Receive Delivery" subtitle="Select a PO above">
          <div className="table-state">
            <strong>No purchase order selected</strong>
            <p>Choose an order from the queue to start booking a receipt.</p>
          </div>
        </Card>
      )}

      {detailStatus === "success" && detailData && (
        <Card title="Receive Delivery" subtitle={detailData.poNumber}>
          {/* PO summary */}
          <div className="rg-po-summary">
            <div className="rg-po-summary-left">
              <p className="rg-eyebrow">Receiving against</p>
              <h3 className="rg-po-number">{detailData.poNumber}</h3>
              <p className="rg-po-meta">
                {detailData.supplier} · Ordered {formatDate(detailData.orderDate)} ·
                Expected {formatDate(detailData.expectedDeliveryDate)}
              </p>
            </div>
            <div className="rg-po-summary-right">
              <dl className="rg-po-metrics">
                <div>
                  <dt>Status</dt>
                  <dd>{detailData.status}</dd>
                </div>
                <div>
                  <dt>Ordered</dt>
                  <dd>{formatNumber(detailData.totalOrderedQuantity)}</dd>
                </div>
                <div>
                  <dt>Received</dt>
                  <dd>{formatNumber(detailData.totalReceivedQuantity)}</dd>
                </div>
                <div>
                  <dt>Remaining</dt>
                  <dd>{formatNumber(detailData.totalOrderedQuantity - detailData.totalReceivedQuantity)}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Success notice */}
          {successSummary && (
            <div className="rg-success-notice">
              <div className="rg-success-icon">✓</div>
              <div className="rg-success-body">
                <strong>Receipt saved — {successSummary.receiptNumber}</strong>
                <p>
                  Delivery {successSummary.deliveryNumber} booked against {successSummary.purchaseOrderNumber}.
                  Stock is now in <strong>{successSummary.holdingLocation}</strong>.
                </p>
                <div className="rg-success-actions">
                  <button type="button" className="btn-sm btn-secondary" onClick={handleReceiveAnother}>
                    Receive Another PO
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Validation error */}
          {validationMsg && (
            <div className="rg-validation-error">{validationMsg}</div>
          )}

          {/* Entry form */}
          {!successSummary && (
            <form className="rg-form" onSubmit={handleSubmit}>
              <div className="rg-form-header">
                <div className="rg-form-field">
                  <label className="field-label" htmlFor="delivery-number">
                    Delivery note number
                  </label>
                  <input
                    id="delivery-number"
                    className="text-input"
                    value={deliveryNumber}
                    onChange={(e) => setDeliveryNumber(e.target.value)}
                    placeholder="DN-00123"
                    autoComplete="off"
                  />
                </div>
                <div className="rg-form-field">
                  <label className="field-label" htmlFor="received-by">
                    Received by
                  </label>
                  <input
                    id="received-by"
                    className="text-input"
                    value={receivedBy}
                    onChange={(e) => setReceivedBy(e.target.value)}
                    placeholder="Warehouse team"
                  />
                </div>
              </div>

              <div className="rg-lines">
                {liveSummary.map((line) => (
                  <article key={line.id} className="rg-line-card">
                    <div className="rg-line-header">
                      <div>
                        <strong className="rg-line-name">{line.productName}</strong>
                        <span className="rg-line-sku">{line.productCode}</span>
                      </div>
                      <span className={`rg-line-badge ${line.remainingQuantity <= 0 ? "rg-line-badge--done" : ""}`}>
                        {line.remainingQuantity <= 0 ? "Complete" : "Pending"}
                      </span>
                    </div>

                    <dl className="rg-line-metrics">
                      <div><dt>Ordered</dt><dd>{formatNumber(line.orderedQuantity)}</dd></div>
                      <div><dt>Prev. received</dt><dd>{formatNumber(line.receivedQuantity)}</dd></div>
                      <div><dt>Receiving now</dt><dd>{formatNumber(line.qtyNow)}</dd></div>
                      <div><dt>Remaining after</dt><dd>{formatNumber(line.qtyAfter)}</dd></div>
                    </dl>

                    {line.remainingQuantity > 0 && (
                      <div className="rg-line-inputs">
                        <div className="rg-input-group">
                          <label className="field-label" htmlFor={`qty-${line.id}`}>
                            Quantity received
                          </label>
                          <input
                            id={`qty-${line.id}`}
                            className="text-input rg-qty-input"
                            type="number"
                            min="0"
                            step={line.serialTrackingRequired ? "1" : "0.01"}
                            max={line.remainingQuantity}
                            value={lineInputs[line.id]?.qty || ""}
                            onChange={(e) => updateLineField(line.id, "qty", e.target.value)}
                            placeholder="0"
                          />
                        </div>

                        {line.serialTrackingRequired && (
                          <div className="rg-input-group rg-input-group--serials">
                            <label className="field-label" htmlFor={`serials-${line.id}`}>
                              Serial numbers{" "}
                              <span className="rg-serial-count">
                                ({line.serialCount} captured)
                              </span>
                            </label>
                            <textarea
                              id={`serials-${line.id}`}
                              className="text-input rg-serial-textarea"
                              rows={4}
                              value={lineInputs[line.id]?.serials || ""}
                              onChange={(e) => updateLineField(line.id, "serials", e.target.value)}
                              placeholder="One serial per line or comma-separated"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {line.remainingQuantity <= 0 && (
                      <p className="rg-line-complete">All {formatNumber(line.orderedQuantity)} units received.</p>
                    )}
                  </article>
                ))}
              </div>

              <div className="rg-form-actions">
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Saving…" : "Submit Receipt"}
                </Button>
              </div>
            </form>
          )}
        </Card>
      )}

      {/* Suggestions panel — shown after a successful receipt */}
      {showSuggestions && successSummary && (
        <SuggestionsPanel
          poNumber={selectedPoNumber}
          onNavigateToSO={handleNavigateToSO}
        />
      )}
    </div>
  );
}

export default ReceiveGoodsPage;
