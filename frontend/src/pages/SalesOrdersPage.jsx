import { useEffect, useMemo, useRef, useState } from "react";
import Button from "../components/Button";
import PageHeader from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";
import { apiFetch } from "../lib/api";
import { formatDate, formatNumber } from "../lib/formatters";
import { useUser } from "../context/UserContext";

// ── Helpers ────────────────────────────────────────────────────────────────────

function classifyDispatchDate(dateStr) {
  if (!dateStr) return "none";
  const daysUntil = (new Date(dateStr) - Date.now()) / 86_400_000;
  if (daysUntil < 0) return "overdue";
  if (daysUntil <= 3) return "soon";
  return "ok";
}

function fmtQty(value, uom = "") {
  const n = formatNumber(value);
  return uom ? `${n} ${uom}` : n;
}

const STATUS_LABELS = {
  awaiting_stock: "Awaiting Stock",
  part_allocated: "Part Allocated",
  fully_allocated: "Fully Allocated",
  ready_to_dispatch: "Ready to Dispatch",
};

function allocationLabel(status) {
  return STATUS_LABELS[status] || status || "—";
}

// ── Small presentational components ──────────────────────────────────────────

function StatusPill({ status }) {
  const cls = {
    awaiting_stock: "so-pill so-pill--awaiting",
    part_allocated: "so-pill so-pill--partial",
    fully_allocated: "so-pill so-pill--full",
    ready_to_dispatch: "so-pill so-pill--ready",
  }[status] || "so-pill so-pill--awaiting";
  return <span className={cls}>{allocationLabel(status)}</span>;
}

function AllocationStatusPill({ allocationStatus }) {
  const cls = {
    "Awaiting Stock": "so-pill so-pill--awaiting",
    "Part Allocated": "so-pill so-pill--partial",
    "Fully Allocated": "so-pill so-pill--full",
    "Ready to Dispatch": "so-pill so-pill--ready",
  }[allocationStatus] || "so-pill so-pill--awaiting";
  return <span className={cls}>{allocationStatus}</span>;
}

function DispatchTag({ dateStr }) {
  const cls = classifyDispatchDate(dateStr);
  if (!dateStr) return <span className="so-dispatch-tag so-dispatch-tag--none">No due date</span>;
  const label = cls === "overdue" ? `Overdue · ${formatDate(dateStr)}` : `Due ${formatDate(dateStr)}`;
  return <span className={`so-dispatch-tag so-dispatch-tag--${cls}`}>{label}</span>;
}

function LineProgressBar({ ordered, allocated }) {
  const pct = ordered > 0 ? Math.min(100, Math.round((allocated / ordered) * 100)) : 0;
  const cls = pct >= 100 ? "full" : pct > 0 ? "partial" : "empty";
  return (
    <div className="alloc-progress-track" title={`${pct}% allocated`}>
      <div className={`alloc-progress-fill alloc-progress-fill--${cls}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Serial chip input ─────────────────────────────────────────────────────────

function SerialChipInput({ lineId, needed, availableItems, selectedIds, onAdd, onRemove }) {
  const [inputValue, setInputValue] = useState("");
  const [flashError, setFlashError] = useState("");
  const inputRef = useRef(null);

  // Build a lookup map from serial number (lowercased) → stock item
  const serialMap = useMemo(() => {
    const m = new Map();
    for (const item of availableItems) {
      if (item.serialNumber) {
        m.set(item.serialNumber.toLowerCase(), item);
      }
    }
    return m;
  }, [availableItems]);

  // Items that are currently selected
  const selectedItems = useMemo(
    () => availableItems.filter((item) => selectedIds.includes(item.stockItemId)),
    [availableItems, selectedIds],
  );

  function tryAdd(raw) {
    const val = raw.trim();
    if (!val) return;

    const item = serialMap.get(val.toLowerCase());
    if (!item) {
      setFlashError(`Serial "${val}" not found in available stock`);
      setTimeout(() => setFlashError(""), 3000);
      return;
    }

    if (selectedIds.includes(item.stockItemId)) {
      setFlashError(`Serial "${val}" already selected`);
      setTimeout(() => setFlashError(""), 2000);
      setInputValue("");
      return;
    }

    onAdd(lineId, item.stockItemId);
    setInputValue("");
    setFlashError("");
    inputRef.current?.focus();
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      tryAdd(inputValue);
    } else if (e.key === "Backspace" && !inputValue && selectedIds.length) {
      onRemove(lineId, selectedIds[selectedIds.length - 1]);
    }
  }

  const remaining = needed - selectedIds.length;

  return (
    <div className="alloc-serial-picker">
      <div className="alloc-picker-header">
        <span className="alloc-picker-label">Serial numbers</span>
        <span className={`alloc-need-badge ${remaining > 0 ? "alloc-need-badge--open" : "alloc-need-badge--done"}`}>
          {remaining > 0 ? `${selectedIds.length} of ${needed} selected` : `${needed} of ${needed} — complete`}
        </span>
      </div>

      <div className="alloc-scanner-row">
        <input
          ref={inputRef}
          className="text-input alloc-scanner-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Scan or type serial, then press Enter"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="btn-sm btn-secondary"
          onClick={() => tryAdd(inputValue)}
        >
          Add
        </button>
      </div>

      {flashError ? <p className="alloc-flash-error">{flashError}</p> : null}

      {selectedItems.length > 0 && (
        <div className="alloc-chip-row">
          {selectedItems.map((item) => (
            <span key={item.stockItemId} className="alloc-chip">
              {item.serialNumber}
              <button
                type="button"
                className="alloc-chip-remove"
                aria-label={`Remove ${item.serialNumber}`}
                onClick={() => onRemove(lineId, item.stockItemId)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {remaining > 0 && availableItems.length < needed && (
        <div className="alloc-shortage-warning">
          Only {availableItems.length} serial{availableItems.length !== 1 ? "s" : ""} available · {remaining} more needed
        </div>
      )}
    </div>
  );
}

// ── Available serial cards grid ───────────────────────────────────────────────

function SerialStockGrid({ lineId, availableItems, selectedIds, onAdd, onRemove }) {
  if (!availableItems.length) {
    return (
      <div className="alloc-empty-state">
        <strong>No serials available</strong>
        <p>This line is awaiting stock before it can be allocated.</p>
      </div>
    );
  }

  return (
    <div className="alloc-serials-grid">
      {availableItems.map((item) => {
        const isSelected = selectedIds.includes(item.stockItemId);
        return (
          <div key={item.stockItemId} className={`alloc-serial-card ${isSelected ? "alloc-serial-card--selected" : ""}`}>
            <div className="alloc-serial-card-main">
              <span className="alloc-serial-number">{item.serialNumber}</span>
              <div className="alloc-serial-meta">
                {item.actualLocationCode || item.stockLocationCode ? (
                  <span className="alloc-meta-chip">
                    {item.actualLocationCode || item.stockLocationCode}
                  </span>
                ) : null}
                {item.purchaseOrderNumber ? (
                  <span className="alloc-meta-chip">{item.purchaseOrderNumber}</span>
                ) : null}
                {item.receivedAt ? (
                  <span className="alloc-meta-chip">Rcvd {formatDate(item.receivedAt)}</span>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              className={`btn-xs ${isSelected ? "btn-selected" : "btn-secondary"}`}
              onClick={() =>
                isSelected
                  ? onRemove(lineId, item.stockItemId)
                  : onAdd(lineId, item.stockItemId)
              }
            >
              {isSelected ? "✓ Selected" : "Select"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Non-serial quantity allocator ─────────────────────────────────────────────

function QuantityAllocator({ lineId, line, availableItems, quantityValue, onQuantityChange }) {
  const totalAvailable = availableItems.reduce(
    (sum, item) => sum + Number(item.availableQuantity || 0),
    0,
  );

  const maxAlloc = Math.min(totalAvailable, line.remainingQuantity);
  const parsedValue = parseFloat(quantityValue) || 0;
  const hasShortage = totalAvailable < line.remainingQuantity;

  if (!availableItems.length) {
    return (
      <div className="alloc-empty-state">
        <strong>No stock available</strong>
        <p>This line is awaiting stock before it can be allocated.</p>
      </div>
    );
  }

  return (
    <div className="alloc-qty-section">
      <div className="alloc-qty-context">
        <span className="alloc-qty-available">
          {fmtQty(totalAvailable, line.product.unitOfMeasure)} available
        </span>
        {hasShortage && (
          <span className="alloc-shortage-warning alloc-shortage-warning--inline">
            Short by {fmtQty(line.remainingQuantity - totalAvailable, line.product.unitOfMeasure)}
          </span>
        )}
      </div>

      <div className="alloc-qty-row">
        <input
          id={`qty-${lineId}`}
          className="text-input alloc-qty-input"
          type="number"
          min="0"
          step="1"
          max={maxAlloc}
          value={quantityValue}
          onChange={(e) => onQuantityChange(lineId, e.target.value)}
          placeholder="0"
        />
        <label className="alloc-qty-label" htmlFor={`qty-${lineId}`}>
          of {fmtQty(line.remainingQuantity, line.product.unitOfMeasure)} remaining
        </label>
        {parsedValue > maxAlloc && (
          <span className="alloc-qty-over">Exceeds available</span>
        )}
      </div>
    </div>
  );
}

// ── Allocation line card ──────────────────────────────────────────────────────

function AllocationLineCard({
  line,
  stock,
  stockStatus,
  serialSelections,
  quantitySelections,
  onSerialAdd,
  onSerialRemove,
  onQuantityChange,
}) {
  const availableItems = stock?.items || [];
  const selectedSerialIds = serialSelections[line.id] || [];
  const qtyValue = quantitySelections[line.id] || "";
  const isFullyAllocated = line.remainingQuantity <= 0;

  return (
    <article className="alloc-line-card">
      <div className="alloc-line-header">
        <div className="alloc-line-title-block">
          <h4 className="alloc-line-name">{line.product.name}</h4>
          <span className="alloc-line-sku">{line.product.sku}</span>
        </div>
        <AllocationStatusPill allocationStatus={line.allocationStatus} />
      </div>

      <div className="alloc-line-metrics">
        <div className="alloc-metric-item">
          <span className="alloc-metric-label">Ordered</span>
          <strong className="alloc-metric-value">{fmtQty(line.quantityOrdered, line.product.unitOfMeasure)}</strong>
        </div>
        <div className="alloc-metric-item">
          <span className="alloc-metric-label">Allocated</span>
          <strong className="alloc-metric-value alloc-metric-value--allocated">{fmtQty(line.quantityAllocated, line.product.unitOfMeasure)}</strong>
        </div>
        <div className="alloc-metric-item">
          <span className="alloc-metric-label">Remaining</span>
          <strong className={`alloc-metric-value ${line.remainingQuantity > 0 ? "alloc-metric-value--remaining" : "alloc-metric-value--done"}`}>
            {fmtQty(line.remainingQuantity, line.product.unitOfMeasure)}
          </strong>
        </div>
        <div className="alloc-metric-item alloc-metric-item--progress">
          <LineProgressBar ordered={line.quantityOrdered} allocated={line.quantityAllocated} />
        </div>
      </div>

      {isFullyAllocated ? (
        <div className="alloc-line-done">
          <span className="alloc-done-icon">✓</span> Fully allocated
        </div>
      ) : stockStatus === "loading" ? (
        <div className="alloc-loading">Loading available stock…</div>
      ) : stockStatus === "error" ? (
        <div className="alloc-empty-state alloc-empty-state--error">
          <strong>Unable to load stock</strong>
          <p>Refresh the page to retry.</p>
        </div>
      ) : line.product.isSerialTracked ? (
        <>
          <SerialChipInput
            lineId={line.id}
            needed={line.remainingQuantity}
            availableItems={availableItems}
            selectedIds={selectedSerialIds}
            onAdd={onSerialAdd}
            onRemove={onSerialRemove}
          />
          <SerialStockGrid
            lineId={line.id}
            availableItems={availableItems}
            selectedIds={selectedSerialIds}
            onAdd={onSerialAdd}
            onRemove={onSerialRemove}
          />
        </>
      ) : (
        <QuantityAllocator
          lineId={line.id}
          line={line}
          availableItems={availableItems}
          quantityValue={qtyValue}
          onQuantityChange={onQuantityChange}
        />
      )}
    </article>
  );
}

// ── Dispatch celebration ──────────────────────────────────────────────────────

function DispatchCelebration({ orderNumber, customerName, onAllocateAnother }) {
  return (
    <div className="dispatch-hero">
      <div className="dispatch-hero-icon">🚚</div>
      <h2 className="dispatch-hero-title">Ready to Dispatch</h2>
      <p className="dispatch-hero-subtitle">
        <strong>{orderNumber}</strong> for {customerName} is fully allocated and ready to go.
      </p>
      <div className="dispatch-hero-actions">
        <button type="button" className="btn-primary dispatch-go-btn" onClick={onAllocateAnother}>
          Allocate Another Order
        </button>
      </div>
    </div>
  );
}

// ── Allocation draft builder ──────────────────────────────────────────────────

function buildAllocationDraft(orderDetail, stockByProduct, serialSelections, quantitySelections) {
  if (!orderDetail) return { allocations: [], summaryItems: [], errors: [] };

  const allocations = [];
  const summaryItems = [];
  const errors = [];

  for (const line of orderDetail.lines) {
    if (line.remainingQuantity <= 0) continue;

    const stock = stockByProduct[line.productId];
    const availableById = new Map((stock?.items || []).map((item) => [item.stockItemId, item]));

    if (line.product.isSerialTracked) {
      const ids = (serialSelections[line.id] || []).map(Number).filter(Number.isFinite);
      if (!ids.length) continue;
      if (ids.length > line.remainingQuantity) {
        errors.push(`${line.product.name}: selected more serials than remaining quantity.`);
      }
      const serials = ids.map((id) => availableById.get(id)?.serialNumber || `#${id}`);
      allocations.push({ salesOrderLineId: line.id, serialStockItemIds: ids });
      summaryItems.push({ lineId: line.id, productName: line.product.name, mode: "serial", quantity: ids.length, uom: line.product.unitOfMeasure, serials });
    } else {
      const rawQty = parseFloat(quantitySelections[line.id]) || 0;
      if (rawQty <= 0) continue;
      if (rawQty > line.remainingQuantity) {
        errors.push(`${line.product.name}: quantity exceeds remaining.`);
      }
      const stockItems = stock?.items || [];
      if (!stockItems.length) {
        errors.push(`${line.product.name}: no available stock.`);
        continue;
      }
      // Allocate against the first available stock item (simplest strategy)
      const firstItem = stockItems[0];
      allocations.push({
        salesOrderLineId: line.id,
        quantityAllocations: [{ stockItemId: firstItem.stockItemId, quantity: rawQty }],
      });
      summaryItems.push({ lineId: line.id, productName: line.product.name, mode: "quantity", quantity: rawQty, uom: line.product.unitOfMeasure });
    }
  }

  if (!allocations.length) {
    errors.push("Select serials or enter quantities above before confirming.");
  }

  return { allocations, summaryItems, errors };
}

// ── Main page ─────────────────────────────────────────────────────────────────

function SalesOrdersPage() {
  const { currentUser } = useUser();
  const salesOrders = useApiResource("/sales-orders");

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOrderNumber, setSelectedOrderNumber] = useState(null);
  const [orderDetail, setOrderDetail] = useState(null);
  const [detailStatus, setDetailStatus] = useState("idle"); // idle | loading | success | error
  const [detailError, setDetailError] = useState("");
  const [stockByProduct, setStockByProduct] = useState({});
  const [stockStatus, setStockStatus] = useState("idle");
  const [serialSelections, setSerialSelections] = useState({});       // { lineId: [stockItemId, ...] }
  const [quantitySelections, setQuantitySelections] = useState({});   // { lineId: "string" }
  const [submitStatus, setSubmitStatus] = useState("idle"); // idle | submitting | success | error
  const [submitError, setSubmitError] = useState("");
  const [celebrateOrder, setCelebrateOrder] = useState(null);         // order payload when fully allocated

  const allOrders = salesOrders.data?.items || [];

  const filteredOrders = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return allOrders;
    return allOrders.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q),
    );
  }, [allOrders, searchTerm]);

  // Auto-select first order when list loads
  useEffect(() => {
    if (!filteredOrders.length) return;
    if (!selectedOrderNumber || !filteredOrders.find((o) => o.orderNumber === selectedOrderNumber)) {
      setSelectedOrderNumber(filteredOrders[0].orderNumber);
    }
  }, [filteredOrders, selectedOrderNumber]);

  // Load order detail when selection changes
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!selectedOrderNumber) {
        setOrderDetail(null);
        setDetailStatus("idle");
        return;
      }

      setDetailStatus("loading");
      setDetailError("");
      setCelebrateOrder(null);

      try {
        const detail = await apiFetch(`/sales-orders/${selectedOrderNumber}`);
        if (cancelled) return;
        setOrderDetail(detail);
        setDetailStatus("success");
      } catch (err) {
        if (cancelled) return;
        setOrderDetail(null);
        setDetailStatus("error");
        setDetailError(err.message || "Unable to load order.");
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [selectedOrderNumber]);

  // Load available stock when order changes
  useEffect(() => {
    let cancelled = false;

    async function loadStock() {
      if (!orderDetail) {
        setStockByProduct({});
        return;
      }

      const productIds = [
        ...new Set(
          orderDetail.lines
            .filter((l) => l.remainingQuantity > 0)
            .map((l) => l.productId),
        ),
      ];

      if (!productIds.length) {
        setStockByProduct({});
        setStockStatus("success");
        return;
      }

      setStockStatus("loading");

      try {
        const responses = await Promise.all(
          productIds.map((id) => apiFetch(`/allocation/available-stock/${id}`)),
        );
        if (cancelled) return;
        setStockByProduct(
          responses.reduce((acc, r) => { acc[r.product.id] = r; return acc; }, {}),
        );
        setStockStatus("success");
      } catch (err) {
        if (cancelled) return;
        setStockByProduct({});
        setStockStatus("error");
      }
    }

    void loadStock();
    return () => { cancelled = true; };
  }, [orderDetail]);

  // Clear selections when order changes
  useEffect(() => {
    setSerialSelections({});
    setQuantitySelections({});
    setSubmitStatus("idle");
    setSubmitError("");
    setCelebrateOrder(null);
  }, [selectedOrderNumber]);

  const allocationDraft = useMemo(
    () => buildAllocationDraft(orderDetail, stockByProduct, serialSelections, quantitySelections),
    [orderDetail, stockByProduct, serialSelections, quantitySelections],
  );

  function handleSelectOrder(orderNumber) {
    setSelectedOrderNumber(orderNumber);
  }

  function handleSerialAdd(lineId, stockItemId) {
    setSerialSelections((prev) => ({
      ...prev,
      [lineId]: [...(prev[lineId] || []), stockItemId],
    }));
  }

  function handleSerialRemove(lineId, stockItemId) {
    setSerialSelections((prev) => ({
      ...prev,
      [lineId]: (prev[lineId] || []).filter((id) => id !== stockItemId),
    }));
  }

  function handleQuantityChange(lineId, value) {
    setQuantitySelections((prev) => ({ ...prev, [lineId]: value }));
  }

  async function handleConfirm() {
    if (!orderDetail || submitStatus === "submitting") return;

    if (allocationDraft.errors.length) {
      setSubmitError(allocationDraft.errors[0]);
      return;
    }

    setSubmitStatus("submitting");
    setSubmitError("");

    try {
      const response = await apiFetch(
        `/sales-orders/${orderDetail.order.orderNumber}/allocate`,
        {
          method: "POST",
          body: JSON.stringify({
            allocations: allocationDraft.allocations,
            allocatedBy: currentUser?.full_name || "System",
          }),
        },
      );

      salesOrders.reload();

      const isReady = response.order?.summary?.allocationStatus === "Ready to Dispatch";

      if (isReady) {
        setCelebrateOrder(response.order);
        setSubmitStatus("success");
      } else {
        // Refresh and stay in the allocation view for more work
        setOrderDetail({ order: response.order, lines: response.lines });
        setSerialSelections({});
        setQuantitySelections({});
        setSubmitStatus("idle");

        // Reload stock for remaining lines
        const productIds = [
          ...new Set(
            response.lines
              .filter((l) => l.remainingQuantity > 0)
              .map((l) => l.productId),
          ),
        ];
        if (productIds.length) {
          const responses = await Promise.all(
            productIds.map((id) => apiFetch(`/allocation/available-stock/${id}`)),
          );
          setStockByProduct(
            responses.reduce((acc, r) => { acc[r.product.id] = r; return acc; }, {}),
          );
        } else {
          setStockByProduct({});
        }
      }
    } catch (err) {
      setSubmitStatus("error");
      setSubmitError(err.message || "Unable to save allocation.");
    }
  }

  function handleAllocateAnother() {
    setCelebrateOrder(null);
    setSubmitStatus("idle");
    setSelectedOrderNumber(null);
    salesOrders.reload();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Outbound"
        title="Sales Orders"
        description="Search customer orders, review open demand, and allocate available stock."
        actions={
          <Button variant="secondary" onClick={salesOrders.reload}>
            Refresh
          </Button>
        }
      />

      <div className="so-layout">
        {/* ── Left: order queue ──────────────────────────────────────────── */}
        <aside className="so-queue">
          <div className="so-queue-search">
            <input
              className="text-input so-search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search SO number or customer…"
            />
          </div>

          {salesOrders.status === "loading" && (
            <div className="so-queue-state">Loading orders…</div>
          )}
          {salesOrders.status === "error" && (
            <div className="so-queue-state so-queue-state--error">
              {salesOrders.error || "Unable to load orders."}
            </div>
          )}
          {salesOrders.status === "success" && (
            <div className="so-queue-list">
              {filteredOrders.length === 0 ? (
                <div className="so-queue-state">No orders match your search.</div>
              ) : (
                filteredOrders.map((order) => {
                  const dateCls = classifyDispatchDate(order.dispatchDueAt);
                  const isActive = order.orderNumber === selectedOrderNumber;
                  return (
                    <button
                      key={order.orderNumber}
                      type="button"
                      className={`so-queue-item ${isActive ? "so-queue-item--active" : ""}`}
                      onClick={() => handleSelectOrder(order.orderNumber)}
                    >
                      <div className="so-queue-item-top">
                        <span className="so-queue-number">{order.orderNumber}</span>
                        <StatusPill status={order.status} />
                      </div>
                      <p className="so-queue-customer">{order.customerName}</p>
                      <div className="so-queue-item-bottom">
                        <DispatchTag dateStr={order.dispatchDueAt} />
                        {order.summary.quantityRemaining > 0 && (
                          <span className="so-remaining-badge">
                            {formatNumber(order.summary.quantityRemaining)} remaining
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </aside>

        {/* ── Right: workspace ───────────────────────────────────────────── */}
        <main className="so-workspace">
          {/* Celebrate dispatch-ready state */}
          {celebrateOrder ? (
            <DispatchCelebration
              orderNumber={celebrateOrder.orderNumber}
              customerName={celebrateOrder.customerName}
              onAllocateAnother={handleAllocateAnother}
            />
          ) : !selectedOrderNumber ? (
            <div className="so-workspace-empty">
              <div className="so-empty-icon">📋</div>
              <h3>Select an order</h3>
              <p>Choose a sales order from the queue to view and allocate stock.</p>
            </div>
          ) : detailStatus === "loading" ? (
            <div className="so-workspace-loading">
              <div className="so-loading-spinner" />
              <p>Loading order…</p>
            </div>
          ) : detailStatus === "error" ? (
            <div className="so-workspace-empty">
              <div className="so-empty-icon">⚠️</div>
              <h3>Unable to load order</h3>
              <p>{detailError}</p>
            </div>
          ) : detailStatus === "success" && orderDetail ? (
            <>
              {/* Order header */}
              <div className="alloc-order-header">
                <div className="alloc-order-header-left">
                  <div className="alloc-order-eyebrow">Sales Order</div>
                  <h2 className="alloc-order-number">{orderDetail.order.orderNumber}</h2>
                  <p className="alloc-order-customer">{orderDetail.order.customerName}</p>
                </div>
                <div className="alloc-order-header-right">
                  <AllocationStatusPill allocationStatus={orderDetail.order.summary.allocationStatus} />
                  <DispatchTag dateStr={orderDetail.order.dispatchDueAt} />
                </div>
              </div>

              {/* Summary metrics */}
              <div className="alloc-summary-bar">
                <div className="alloc-summary-metric">
                  <span className="alloc-summary-label">Lines</span>
                  <strong className="alloc-summary-value">{orderDetail.order.summary.lineCount}</strong>
                </div>
                <div className="alloc-summary-metric">
                  <span className="alloc-summary-label">Ordered</span>
                  <strong className="alloc-summary-value">{formatNumber(orderDetail.order.summary.quantityOrdered)}</strong>
                </div>
                <div className="alloc-summary-metric">
                  <span className="alloc-summary-label">Allocated</span>
                  <strong className="alloc-summary-value alloc-summary-value--allocated">{formatNumber(orderDetail.order.summary.quantityAllocated)}</strong>
                </div>
                <div className="alloc-summary-metric">
                  <span className="alloc-summary-label">Remaining</span>
                  <strong className={`alloc-summary-value ${orderDetail.order.summary.quantityRemaining > 0 ? "alloc-summary-value--remaining" : "alloc-summary-value--done"}`}>
                    {formatNumber(orderDetail.order.summary.quantityRemaining)}
                  </strong>
                </div>
                {orderDetail.order.requestedAt && (
                  <div className="alloc-summary-metric">
                    <span className="alloc-summary-label">Requested</span>
                    <strong className="alloc-summary-value alloc-summary-value--date">{formatDate(orderDetail.order.requestedAt)}</strong>
                  </div>
                )}
              </div>

              {/* Line allocation cards */}
              <div className="alloc-lines">
                {orderDetail.lines.map((line) => (
                  <AllocationLineCard
                    key={line.id}
                    line={line}
                    stock={stockByProduct[line.productId]}
                    stockStatus={stockStatus}
                    serialSelections={serialSelections}
                    quantitySelections={quantitySelections}
                    onSerialAdd={handleSerialAdd}
                    onSerialRemove={handleSerialRemove}
                    onQuantityChange={handleQuantityChange}
                  />
                ))}
              </div>

              {/* Confirm panel */}
              <div className="alloc-confirm-panel">
                {submitError && (
                  <div className="alloc-confirm-error">{submitError}</div>
                )}

                {allocationDraft.summaryItems.length > 0 && (
                  <div className="alloc-draft-summary">
                    {allocationDraft.summaryItems.map((item) => (
                      <div key={item.lineId} className="alloc-draft-item">
                        <strong>{item.productName}</strong>
                        <span className="alloc-draft-detail">
                          {item.mode === "serial"
                            ? `${item.quantity} serial${item.quantity !== 1 ? "s" : ""}: ${item.serials?.join(", ")}`
                            : fmtQty(item.quantity, item.uom)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="alloc-confirm-actions">
                  <Button
                    onClick={handleConfirm}
                    disabled={
                      submitStatus === "submitting" ||
                      allocationDraft.allocations.length === 0 ||
                      detailStatus !== "success"
                    }
                  >
                    {submitStatus === "submitting" ? "Saving…" : "Confirm Allocation"}
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}

export default SalesOrdersPage;
