import { useEffect, useMemo, useRef, useState } from "react";
import Button from "../components/Button";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import { useUser } from "../context/UserContext";
import { useApiResource } from "../hooks/useApiResource";
import { apiFetch } from "../lib/api";
import { formatDate, formatLabel, formatNumber } from "../lib/formatters";

// ── Helpers ──────────────────────────────────────────────────────────────────

function classifyDispatchDate(dateStr) {
  if (!dateStr) return "none";
  const daysUntil = (new Date(dateStr) - Date.now()) / 86_400_000;
  if (daysUntil < 0) return "overdue";
  if (daysUntil <= 3) return "soon";
  return "ok";
}

function parseRawSerials(value) {
  return value
    .split(/[\r\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ── Serial chip input ────────────────────────────────────────────────────────

function SerialChipInput({ lineId, scanned, onAdd, onRemove }) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef(null);

  function commitInput() {
    const values = parseRawSerials(inputValue);
    if (values.length) {
      onAdd(lineId, values);
      setInputValue("");
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitInput();
    }
    if (e.key === "Backspace" && !inputValue && scanned.length > 0) {
      onRemove(lineId, scanned[scanned.length - 1]);
    }
  }

  const seenSet = new Set();
  const duplicates = new Set();
  for (const s of scanned) {
    if (seenSet.has(s)) duplicates.add(s);
    seenSet.add(s);
  }

  return (
    <div className="serial-chip-area" onClick={() => inputRef.current?.focus()}>
      <div className="serial-chip-list">
        {scanned.map((serial, idx) => (
          <span
            key={`${serial}-${idx}`}
            className={`serial-chip${duplicates.has(serial) ? " duplicate" : ""}`}
          >
            {serial}
            <button
              type="button"
              className="serial-chip-remove"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(lineId, serial);
              }}
              aria-label={`Remove ${serial}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          className="serial-chip-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitInput}
          placeholder={
            scanned.length === 0 ? "Scan or type a serial, then press Enter…" : ""
          }
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>
      {duplicates.size > 0 && (
        <p className="serial-chip-warning">⚠ Duplicate: {[...duplicates][0]}</p>
      )}
    </div>
  );
}

// ── PO typeahead search ──────────────────────────────────────────────────────

function POSearchInput({ options, selectedPoNumber, onSelect }) {
  const [query, setQuery] = useState(selectedPoNumber || "");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // Sync when external selection is cleared
  useEffect(() => {
    if (!selectedPoNumber) setQuery("");
  }, [selectedPoNumber]);

  const filtered = useMemo(() => {
    if (!query) return options.slice(0, 30);
    const q = query.toLowerCase();
    return options
      .filter(
        (po) =>
          (po.poNumber || po.order_number || "").toLowerCase().includes(q) ||
          (po.supplier || po.supplier_name || "").toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [options, query]);

  function select(poNumber) {
    setQuery(poNumber);
    setOpen(false);
    onSelect(poNumber);
  }

  useEffect(() => {
    function handleOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  function pillClass(status) {
    const s = String(status || "").toLowerCase();
    if (s.includes("fully")) return "pill positive";
    if (s.includes("overdue")) return "pill negative";
    if (s.includes("part")) return "pill info";
    return "pill subtle";
  }

  return (
    <div className="po-search-wrap" ref={wrapRef}>
      <input
        type="text"
        className="po-search-input"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (!e.target.value) onSelect("");
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search by PO number or supplier…"
        autoComplete="off"
        spellCheck={false}
        aria-label="Search purchase orders"
      />
      {open && filtered.length > 0 && (
        <ul className="po-search-dropdown" role="listbox">
          {filtered.map((po) => {
            const poNum = po.poNumber || po.order_number;
            const supplierName = po.supplier || po.supplier_name;
            return (
              <li key={poNum} role="option">
                <button type="button" onClick={() => select(poNum)}>
                  <span className="po-search-number">{poNum}</span>
                  <span className="po-search-supplier">{supplierName}</span>
                  <span className={pillClass(po.status)}>{po.status}</span>
                  {(po.expectedDeliveryDate || po.expected_at) && (
                    <span className="po-search-date">
                      {formatDate(po.expectedDeliveryDate || po.expected_at)}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildInitialLineState(lines) {
  return Object.fromEntries(
    lines.map((line) => [line.id, { quantityReceived: "", serials: [] }])
  );
}

function statusPillClass(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("fully") || s === "fully_received") return "positive";
  if (s.includes("overdue")) return "negative";
  if (s.includes("part") || s === "part_received") return "info";
  return "subtle";
}

// ── Main page ────────────────────────────────────────────────────────────────

function ReceiveGoodsPage({ onNavigate }) {
  const purchaseOrders = useApiResource("/purchase-orders");
  const { currentUser } = useUser();

  const [selectedPoNumber, setSelectedPoNumber] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("po") || "";
  });

  const [detailState, setDetailState] = useState({
    status: "idle",
    data: null,
    error: "",
  });
  const [detailRequestKey, setDetailRequestKey] = useState(0);
  const [formState, setFormState] = useState({
    deliveryNumber: "",
    receivedBy: currentUser?.full_name || "",
    receivedDate: new Date().toISOString().slice(0, 10),
    lines: {},
  });
  const [validationMessage, setValidationMessage] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [successSummary, setSuccessSummary] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const poOptions = purchaseOrders.data?.items || [];

  // Auto-select first PO on load
  useEffect(() => {
    if (!poOptions.length || selectedPoNumber) return;
    setSelectedPoNumber(poOptions[0].poNumber || poOptions[0].order_number || "");
  }, [poOptions, selectedPoNumber]);

  // Pre-fill receivedBy from current user
  useEffect(() => {
    if (currentUser?.full_name && !formState.receivedBy) {
      setFormState((prev) => ({ ...prev, receivedBy: currentUser.full_name }));
    }
  }, [currentUser]);

  // Load PO detail when selection changes
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!selectedPoNumber) {
        setDetailState({ status: "idle", data: null, error: "" });
        return;
      }

      setDetailState({ status: "loading", data: null, error: "" });

      try {
        const payload = await apiFetch(
          `/purchase-orders/${encodeURIComponent(selectedPoNumber)}`
        );
        if (cancelled) return;

        setDetailState({ status: "success", data: payload, error: "" });
        setFormState((prev) => ({
          ...prev,
          lines: buildInitialLineState(payload.lines || []),
        }));
        setSuccessSummary(null);
        setValidationMessage("");
      } catch (error) {
        if (cancelled) return;
        setDetailState({
          status: "error",
          data: null,
          error: error.message || "Unable to load purchase order.",
        });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedPoNumber, detailRequestKey]);

  // Live per-line summary
  const liveLineSummary = useMemo(() => {
    const lines = detailState.data?.lines || [];
    return lines.map((line) => {
      const draftQty = formState.lines[line.id]?.quantityReceived;
      const qtyNow = draftQty === "" ? 0 : Number(draftQty);
      const validQty = Number.isFinite(qtyNow) && qtyNow > 0 ? qtyNow : 0;
      const serials = formState.lines[line.id]?.serials || [];
      return {
        ...line,
        quantity_now: validQty,
        quantity_after: Math.max(0, Number(line.remainingQuantity) - validQty),
        serials,
      };
    });
  }, [detailState.data, formState.lines]);

  function handlePoSelect(poNumber) {
    setSelectedPoNumber(poNumber);
    setSuccessSummary(null);
    setValidationMessage("");
  }

  function updateLineQty(lineId, value) {
    setValidationMessage("");
    setFormState((prev) => ({
      ...prev,
      lines: {
        ...prev.lines,
        [lineId]: {
          ...(prev.lines[lineId] || { quantityReceived: "", serials: [] }),
          quantityReceived: value,
        },
      },
    }));
  }

  function addSerials(lineId, serialsToAdd) {
    setValidationMessage("");
    setFormState((prev) => {
      const existing = prev.lines[lineId]?.serials || [];
      return {
        ...prev,
        lines: {
          ...prev.lines,
          [lineId]: {
            ...(prev.lines[lineId] || { quantityReceived: "", serials: [] }),
            serials: [...existing, ...serialsToAdd],
          },
        },
      };
    });
  }

  function removeSerial(lineId, serial) {
    setValidationMessage("");
    setFormState((prev) => {
      const existing = prev.lines[lineId]?.serials || [];
      const idx = existing.indexOf(serial);
      const next =
        idx === -1
          ? existing
          : [...existing.slice(0, idx), ...existing.slice(idx + 1)];
      return {
        ...prev,
        lines: {
          ...prev.lines,
          [lineId]: {
            ...(prev.lines[lineId] || { quantityReceived: "", serials: [] }),
            serials: next,
          },
        },
      };
    });
  }

  function handleHeaderField(field, value) {
    setValidationMessage("");
    setFormState((prev) => ({ ...prev, [field]: value }));
  }

  function handleNavigateToSO(soNumber) {
    if (typeof onNavigate === "function") {
      onNavigate(`/sales-orders?so=${encodeURIComponent(soNumber)}`);
    } else {
      window.history.pushState({}, "", `/sales-orders?so=${encodeURIComponent(soNumber)}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setValidationMessage("");
    setSuccessSummary(null);
    setShowSuggestions(false);

    if (!selectedPoNumber) {
      setValidationMessage("Select a purchase order first.");
      return;
    }
    if (!formState.deliveryNumber.trim()) {
      setValidationMessage("Enter the supplier delivery number.");
      return;
    }
    if (!formState.receivedBy.trim()) {
      setValidationMessage("Enter who received the delivery.");
      return;
    }

    const submissionLines = liveLineSummary
      .filter((line) => line.quantity_now > 0)
      .map((line) => ({
        purchaseOrderLineId: line.id,
        quantityReceived: line.quantity_now,
        serialNumbers: line.serials,
      }));

    if (!submissionLines.length) {
      setValidationMessage("Enter at least one quantity to receive.");
      return;
    }

    setSubmitting(true);

    try {
      const payload = await apiFetch(
        `/purchase-orders/${encodeURIComponent(selectedPoNumber)}/receive`,
        {
          method: "POST",
          body: JSON.stringify({
            deliveryNumber: formState.deliveryNumber.trim(),
            receivedBy: formState.receivedBy.trim(),
            receivedDate: formState.receivedDate,
            lines: submissionLines,
          }),
        }
      );

      setSuccessSummary(payload);
      setShowSuggestions(true);
      purchaseOrders.reload();
    } catch (error) {
      setValidationMessage(error.message || "Unable to receive goods.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleReceiveAnother() {
    setSuccessSummary(null);
    setShowSuggestions(false);
    setSelectedPoNumber("");
    setFormState({
      deliveryNumber: "",
      receivedBy: currentUser?.full_name || "",
      receivedDate: new Date().toISOString().slice(0, 10),
      lines: {},
    });
    setDetailState({ status: "idle", data: null, error: "" });
  }

  // ── Success screen ──────────────────────────────────────────────────────────

  if (successSummary) {
    return (
      <div className="page-stack">
        <PageHeader
          eyebrow="Goods In"
          title="Receipt Confirmed"
          description={`Delivery ${successSummary.deliveryNumber} booked against ${successSummary.purchaseOrderNumber}.`}
        />

        <div className="receive-success-hero">
          <div className="receive-success-check">✓</div>
          <div className="receive-success-hero-body">
            <p className="eyebrow">{successSummary.purchaseOrderNumber}</p>
            <h2>{successSummary.receiptNumber}</h2>
            <p className="receive-success-meta">
              {successSummary.holdingLocation} ·{" "}
              {formatDate(successSummary.receivedDate)} ·{" "}
              <span className={`pill ${statusPillClass(successSummary.status)}`}>
                {formatLabel(successSummary.status)}
              </span>
            </p>
          </div>
        </div>

        <div className="receive-success-lines">
          {successSummary.lines.map((line) => (
            <div key={line.purchase_order_line_id} className="receive-success-line">
              <div className="receive-success-line-left">
                <strong>{line.sku}</strong>
                <span>{line.product_name}</span>
              </div>
              <dl className="receive-success-line-metrics">
                <div>
                  <dt>Received now</dt>
                  <dd>{formatNumber(line.quantity_received_now)}</dd>
                </div>
                <div>
                  <dt>Remaining</dt>
                  <dd>{formatNumber(line.quantity_remaining_after_receipt)}</dd>
                </div>
              </dl>
              {line.serial_numbers?.length > 0 && (
                <div className="receive-success-serials">
                  {line.serial_numbers.map((s) => (
                    <span key={s} className="serial-chip">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {showSuggestions && (
          <SuggestionsPanel
            poNumber={selectedPoNumber}
            onNavigateToSO={handleNavigateToSO}
          />
        )}

        <div className="receive-success-actions">
          {onNavigate && (
            <Button onClick={() => onNavigate("/stock")}>View Stock</Button>
          )}
          <Button variant="secondary" onClick={handleReceiveAnother}>
            Receive Another PO
          </Button>
        </div>
      </div>
    );
  }

  // ── Main form ───────────────────────────────────────────────────────────────

  const po = detailState.data;

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

      {/* Step 1 — Select PO */}
      <Card title="Select Purchase Order" subtitle="Inbound Queue">
        {purchaseOrders.status === "loading" ? (
          <div className="table-state">
            <strong>Loading purchase orders…</strong>
          </div>
        ) : (
          <div className="receive-po-search-block">
            <POSearchInput
              options={poOptions}
              selectedPoNumber={selectedPoNumber}
              onSelect={handlePoSelect}
            />
            {poOptions.length > 0 && (
              <small className="receive-po-count">
                {
                  poOptions.filter(
                    (po) =>
                      !String(po.status || "").toLowerCase().includes("fully")
                  ).length
                }{" "}
                orders with outstanding lines
              </small>
            )}
          </div>
        )}
      </Card>

      {detailState.status === "loading" && (
        <Card>
          <div className="table-state">
            <strong>Loading purchase order…</strong>
            <p>Fetching lines for receipt entry.</p>
          </div>
        </Card>
      )}

      {detailState.status === "error" && (
        <Card>
          <div className="table-state error">
            <strong>Unable to load purchase order</strong>
            <p>{detailState.error}</p>
            <div className="table-state-actions">
              <Button
                variant="secondary"
                onClick={() => setDetailRequestKey((k) => k + 1)}
              >
                Try Again
              </Button>
            </div>
          </div>
        </Card>
      )}

      {detailState.status === "success" && po && (
        <form className="receive-form" onSubmit={handleSubmit}>
          {/* Step 2 — PO summary */}
          <Card title={po.poNumber} subtitle={po.supplier}>
            <dl className="po-line-metrics">
              <div>
                <dt>Status</dt>
                <dd>
                  <span className={`pill ${statusPillClass(po.status)}`}>
                    {po.status}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Ordered</dt>
                <dd>{formatNumber(po.totalOrderedQuantity)}</dd>
              </div>
              <div>
                <dt>Previously received</dt>
                <dd>{formatNumber(po.totalReceivedQuantity)}</dd>
              </div>
              <div>
                <dt>Remaining</dt>
                <dd>
                  {formatNumber(
                    Math.max(
                      0,
                      po.totalOrderedQuantity - po.totalReceivedQuantity
                    )
                  )}
                </dd>
              </div>
              {po.expectedDeliveryDate && (
                <div>
                  <dt>Expected</dt>
                  <dd>{formatDate(po.expectedDeliveryDate)}</dd>
                </div>
              )}
            </dl>
          </Card>

          {/* Step 3 — Delivery details */}
          <Card title="Delivery Details" subtitle="Step 2 of 3">
            <div className="receive-header-grid">
              <label className="receive-field">
                <span>
                  Delivery number{" "}
                  <span className="receive-required">*</span>
                </span>
                <input
                  value={formState.deliveryNumber}
                  onChange={(e) =>
                    handleHeaderField("deliveryNumber", e.target.value)
                  }
                  placeholder="e.g. DN-2024-001"
                  autoComplete="off"
                />
              </label>
              <label className="receive-field">
                <span>
                  Received by <span className="receive-required">*</span>
                </span>
                <input
                  value={formState.receivedBy}
                  onChange={(e) =>
                    handleHeaderField("receivedBy", e.target.value)
                  }
                  placeholder="Warehouse team member"
                />
              </label>
              <label className="receive-field">
                <span>Delivery date</span>
                <input
                  type="date"
                  value={formState.receivedDate}
                  onChange={(e) =>
                    handleHeaderField("receivedDate", e.target.value)
                  }
                />
              </label>
            </div>
          </Card>

          {/* Step 4 — Receipt lines */}
          <Card title="Receipt Lines" subtitle="Step 3 of 3">
            {validationMessage && (
              <div
                className="notice error"
                style={{ marginBottom: "1rem" }}
              >
                <strong>Check required fields</strong>
                <p>{validationMessage}</p>
              </div>
            )}

            <div className="receive-line-list">
              {liveLineSummary.map((line) => {
                const alreadyComplete = Number(line.remainingQuantity) <= 0;
                const hasQty = line.quantity_now > 0;
                const needsSerials = line.serialTrackingRequired && hasQty;
                const serialsOk =
                  !needsSerials ||
                  line.serials.length === line.quantity_now;
                const hasDuplicates =
                  new Set(line.serials).size !== line.serials.length;

                return (
                  <article
                    key={line.id}
                    className={`receive-line-card${alreadyComplete ? " receive-line-complete" : ""}`}
                  >
                    <div className="receive-line-header">
                      <div className="receive-line-identity">
                        <strong>{line.productCode}</strong>
                        <span className="receive-line-name">
                          {line.productName}
                        </span>
                        <span
                          className={`pill ${line.serialTrackingRequired ? "serial-required" : "subtle"}`}
                        >
                          {line.serialTrackingRequired
                            ? "Serial tracked"
                            : "Qty tracked"}
                        </span>
                      </div>
                      <span
                        className={`pill ${
                          alreadyComplete
                            ? "positive"
                            : hasQty
                            ? "info"
                            : "subtle"
                        }`}
                      >
                        {alreadyComplete
                          ? "Complete"
                          : hasQty
                          ? `Receiving ${line.quantity_now}`
                          : "Pending"}
                      </span>
                    </div>

                    <dl className="po-line-metrics">
                      <div>
                        <dt>Ordered</dt>
                        <dd>{formatNumber(line.orderedQuantity)}</dd>
                      </div>
                      <div>
                        <dt>Prev. received</dt>
                        <dd>{formatNumber(line.receivedQuantity)}</dd>
                      </div>
                      <div>
                        <dt>Remaining</dt>
                        <dd>{formatNumber(line.remainingQuantity)}</dd>
                      </div>
                      <div>
                        <dt>After receipt</dt>
                        <dd
                          className={
                            line.quantity_after === 0 && hasQty
                              ? "receive-metric-done"
                              : ""
                          }
                        >
                          {formatNumber(line.quantity_after)}
                        </dd>
                      </div>
                    </dl>

                    {!alreadyComplete && (
                      <div className="receive-line-entry">
                        <label className="receive-field receive-qty-field">
                          <span>Quantity receiving now</span>
                          <input
                            type="number"
                            min="0"
                            max={line.remainingQuantity}
                            step={line.serialTrackingRequired ? "1" : "0.01"}
                            value={
                              formState.lines[line.id]?.quantityReceived || ""
                            }
                            onChange={(e) =>
                              updateLineQty(line.id, e.target.value)
                            }
                            placeholder="0"
                            className="receive-qty-input"
                          />
                        </label>

                        {line.serialTrackingRequired && (
                          <div className="serial-entry-block">
                            <div className="serial-entry-header">
                              <span className="serial-entry-label">
                                Serial numbers
                              </span>
                              <span
                                className={`serial-progress-badge${
                                  serialsOk && hasQty
                                    ? " complete"
                                    : hasDuplicates
                                    ? " error"
                                    : ""
                                }`}
                              >
                                {line.serials.length} of{" "}
                                {line.quantity_now || "?"} scanned
                              </span>
                            </div>
                            <SerialChipInput
                              lineId={line.id}
                              scanned={line.serials}
                              onAdd={addSerials}
                              onRemove={removeSerial}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            <div className="receive-form-actions">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving Receipt…" : "Submit Receipt"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={submitting}
                onClick={() => setDetailRequestKey((k) => k + 1)}
              >
                Refresh Lines
              </Button>
            </div>
          </Card>
        </form>
      )}

      {detailState.status === "idle" && (
        <Card>
          <div className="table-state">
            <strong>No purchase order selected</strong>
            <p>Search for an order above to start receiving goods.</p>
          </div>
        </Card>
      )}
    </div>
  );
}

export default ReceiveGoodsPage;
