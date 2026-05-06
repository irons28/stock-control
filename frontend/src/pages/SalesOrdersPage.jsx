import { useEffect, useMemo, useRef, useState } from "react";
import Button from "../components/Button";
import FieldHelp from "../components/FieldHelp";
import GuidedHelpPanel from "../components/GuidedHelpPanel";
import PageHeader from "../components/PageHeader";
import PermissionGate, { PermissionButton } from "../components/PermissionGate";
import ActivityTimeline from "../components/ActivityTimeline";
import { HELP_CONTENT } from "../config/helpContent";
import { useApiResource } from "../hooks/useApiResource";
import { usePermission } from "../hooks/usePermission";
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

// Sort stock items by received date ascending (earliest first), then by id
function sortByEarliestReceived(items) {
  return [...items].sort((a, b) => {
    if (!a.receivedAt && !b.receivedAt) return a.stockItemId - b.stockItemId;
    if (!a.receivedAt) return 1;
    if (!b.receivedAt) return -1;
    return new Date(a.receivedAt) - new Date(b.receivedAt);
  });
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

function PriorityBadge({ priority }) {
  if (!priority || priority === "normal") return null;
  return <span className="so-priority-badge so-priority-badge--urgent">🔴 Urgent</span>;
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

  const serialMap = useMemo(() => {
    const m = new Map();
    for (const item of availableItems) {
      if (item.serialNumber) m.set(item.serialNumber.toLowerCase(), item);
    }
    return m;
  }, [availableItems]);

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
        <button type="button" className="btn-sm btn-secondary" onClick={() => tryAdd(inputValue)}>
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
                {(item.actualLocationCode || item.stockLocationCode) && (
                  <span className="alloc-meta-chip">{item.actualLocationCode || item.stockLocationCode}</span>
                )}
                {item.purchaseOrderNumber && (
                  <span className="alloc-meta-chip">{item.purchaseOrderNumber}</span>
                )}
                {item.receivedAt && (
                  <span className="alloc-meta-chip">Rcvd {formatDate(item.receivedAt)}</span>
                )}
              </div>
            </div>
            <button
              type="button"
              className={`btn-xs ${isSelected ? "btn-selected" : "btn-secondary"}`}
              onClick={() => isSelected ? onRemove(lineId, item.stockItemId) : onAdd(lineId, item.stockItemId)}
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

// ── Quick-apply suggestion banner ─────────────────────────────────────────────

function QuickApplyBanner({ line, availableItems, selectedSerialIds, onQuickApplySerials, onQuickApplyQty, quantityValue }) {
  if (!availableItems.length || line.remainingQuantity <= 0) return null;

  if (line.product.isSerialTracked) {
    const unselected = availableItems.filter((item) => !selectedSerialIds.includes(item.stockItemId));
    const needed = line.remainingQuantity - selectedSerialIds.length;
    if (needed <= 0 || !unselected.length) return null;

    const poCounts = new Map();
    for (const item of availableItems) {
      const po = item.purchaseOrderNumber || "Unknown PO";
      poCounts.set(po, (poCounts.get(po) || 0) + 1);
    }
    const poSummary = [...poCounts.entries()]
      .map(([po, count]) => `${count} from ${po}`)
      .join(", ");

    return (
      <div className="alloc-quick-apply-banner">
        <div className="alloc-quick-apply-info">
          <span className="alloc-quick-apply-label">Quick apply</span>
          <span className="alloc-quick-apply-detail">{poSummary} — select all up to needed</span>
        </div>
        <button
          type="button"
          className="btn-xs btn-secondary"
          onClick={() => onQuickApplySerials(line.id, unselected, needed)}
        >
          Select {Math.min(needed, unselected.length)} serial{Math.min(needed, unselected.length) !== 1 ? "s" : ""}
        </button>
      </div>
    );
  }

  const totalAvail = availableItems.reduce((s, i) => s + i.availableQuantity, 0);
  const suggestQty = Math.min(totalAvail, line.remainingQuantity);
  const currentQty = parseFloat(quantityValue) || 0;
  if (suggestQty <= 0 || currentQty >= suggestQty) return null;

  const poNums = [...new Set(availableItems.map((i) => i.purchaseOrderNumber).filter(Boolean))];
  const poHint = poNums.length ? `from ${poNums.slice(0, 2).join(", ")}` : "";

  return (
    <div className="alloc-quick-apply-banner">
      <div className="alloc-quick-apply-info">
        <span className="alloc-quick-apply-label">Quick apply</span>
        <span className="alloc-quick-apply-detail">
          {formatNumber(totalAvail)} available {poHint} — fill to needed
        </span>
      </div>
      <button
        type="button"
        className="btn-xs btn-secondary"
        onClick={() => onQuickApplyQty(line.id, String(suggestQty))}
      >
        Fill {fmtQty(suggestQty, line.product.unitOfMeasure)}
      </button>
    </div>
  );
}

// ── Allocation line card ──────────────────────────────────────────────────────

function AllocationLineCard({
  line, stock, stockStatus,
  serialSelections, quantitySelections,
  onSerialAdd, onSerialRemove, onQuantityChange,
  onQuickApplySerials, onQuickApplyQty,
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

      {!isFullyAllocated && stockStatus === "success" && availableItems.length > 0 && (
        <QuickApplyBanner
          line={line}
          availableItems={availableItems}
          selectedSerialIds={selectedSerialIds}
          quantityValue={qtyValue}
          onQuickApplySerials={onQuickApplySerials}
          onQuickApplyQty={onQuickApplyQty}
        />
      )}

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

// ── Bulk allocation: auto-suggestion algorithm ────────────────────────────────

/**
 * Builds a full allocation suggestion for every unallocated line in the order.
 * Serials: sorted by receivedAt ascending (earliest-in, first-out).
 * Qty: fill to min(available, needed), spread across stock items earliest-first.
 *
 * Returns { serialSelections, quantitySelections, lines, totals } where
 * lines is an array of per-line coverage objects used to render the preview.
 */
function buildAutoAllocationSuggestions(orderDetail, stockByProduct) {
  const serialSelections = {};
  const quantitySelections = {};
  const lines = [];

  for (const line of orderDetail.lines) {
    if (line.remainingQuantity <= 0) continue;

    const stock = stockByProduct[line.productId];
    const items = stock?.items || [];
    const needed = line.remainingQuantity;

    if (line.product.isSerialTracked) {
      const sorted = sortByEarliestReceived(items);
      const toSelect = sorted.slice(0, needed);
      const selected = toSelect.length;

      if (selected > 0) {
        serialSelections[line.id] = toSelect.map((i) => i.stockItemId);
      }

      lines.push({
        lineId: line.id,
        productName: line.product.name,
        sku: line.product.sku,
        mode: "serial",
        needed,
        available: items.length,
        selected,
        // Show first few serial numbers for preview
        serialPreview: toSelect
          .slice(0, 5)
          .map((i) => i.serialNumber)
          .filter(Boolean),
        hasMore: selected > 5,
        coverage: selected >= needed ? "full" : selected > 0 ? "partial" : "none",
      });
    } else {
      const sorted = sortByEarliestReceived(items);
      const totalAvailable = sorted.reduce((s, i) => s + Number(i.availableQuantity || 0), 0);
      const qty = Math.min(totalAvailable, needed);

      if (qty > 0) {
        quantitySelections[line.id] = String(qty);
      }

      lines.push({
        lineId: line.id,
        productName: line.product.name,
        sku: line.product.sku,
        uom: line.product.unitOfMeasure,
        mode: "quantity",
        needed,
        available: totalAvailable,
        selected: qty,
        coverage: qty >= needed ? "full" : qty > 0 ? "partial" : "none",
      });
    }
  }

  const coveredLines = lines.filter((l) => l.coverage === "full").length;
  const shortageLines = lines.filter((l) => l.coverage === "partial").length;
  const noStockLines = lines.filter((l) => l.coverage === "none").length;

  return {
    serialSelections,
    quantitySelections,
    lines,
    totalLines: lines.length,
    coveredLines,
    shortageLines,
    noStockLines,
    hasAnyStock: lines.some((l) => l.selected > 0),
  };
}

// ── Bulk allocation preview modal ─────────────────────────────────────────────

function BulkAllocationPreview({ orderNumber, customerName, suggestions, onApply, onCancel }) {
  const { lines, coveredLines, shortageLines, noStockLines, totalLines, hasAnyStock } = suggestions;
  const hasShortages = shortageLines > 0 || noStockLines > 0;

  // Close on Escape
  useEffect(() => {
    function handleKey(e) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onCancel();
  }

  return (
    <div className="bulk-overlay" onClick={handleOverlayClick} role="presentation">
      <div
        className="bulk-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-modal-title"
      >
        {/* Header */}
        <div className="bulk-modal-header">
          <div>
            <div className="bulk-modal-eyebrow">Auto-Allocate Preview</div>
            <h3 id="bulk-modal-title" className="bulk-modal-title">{orderNumber}</h3>
            {customerName && <p className="bulk-modal-customer">{customerName}</p>}
          </div>
          <button
            type="button"
            className="bulk-modal-close"
            onClick={onCancel}
            aria-label="Close preview"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="bulk-modal-body">
          <p className="bulk-modal-sub">
            Stock suggested using <strong>earliest-received first</strong>. Nothing is committed until
            you confirm allocation below.
          </p>

          {/* Per-line coverage rows */}
          <div className="bulk-lines-list" role="list">
            {lines.map((line) => (
              <div
                key={line.lineId}
                className={`bulk-line-row bulk-line-row--${line.coverage}`}
                role="listitem"
              >
                <div className="bulk-line-icon" aria-hidden="true">
                  {line.coverage === "full" ? "✓" : line.coverage === "partial" ? "⚠" : "✗"}
                </div>

                <div className="bulk-line-info">
                  <div className="bulk-line-name">{line.productName}</div>
                  <div className="bulk-line-sku">{line.sku}</div>
                  {line.mode === "serial" && line.serialPreview?.length > 0 && (
                    <div className="bulk-line-serials">
                      {line.serialPreview.map((s) => (
                        <span key={s} className="bulk-serial-chip">{s}</span>
                      ))}
                      {line.hasMore && (
                        <span className="bulk-serial-more">+{line.selected - 5} more</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="bulk-line-qty">
                  <span className="bulk-qty-selected">
                    {line.mode === "serial"
                      ? `${line.selected} serial${line.selected !== 1 ? "s" : ""}`
                      : fmtQty(line.selected, line.uom)}
                  </span>
                  <span className="bulk-qty-of">of</span>
                  <span className="bulk-qty-needed">
                    {line.mode === "serial"
                      ? `${line.needed} needed`
                      : fmtQty(line.needed, line.uom)}
                  </span>
                </div>

                <div className="bulk-line-badge-col">
                  {line.coverage === "full" && (
                    <span className="bulk-badge bulk-badge--ok">Covered</span>
                  )}
                  {line.coverage === "partial" && (
                    <span className="bulk-badge bulk-badge--warn">
                      Short {line.mode === "serial"
                        ? `${line.needed - line.selected} unit${line.needed - line.selected !== 1 ? "s" : ""}`
                        : fmtQty(line.needed - line.selected, line.uom)}
                    </span>
                  )}
                  {line.coverage === "none" && (
                    <span className="bulk-badge bulk-badge--none">No stock</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Summary chips */}
          <div className="bulk-modal-summary">
            {coveredLines > 0 && (
              <span className="bulk-summary-chip bulk-summary-chip--ok">
                {coveredLines} line{coveredLines !== 1 ? "s" : ""} covered
              </span>
            )}
            {shortageLines > 0 && (
              <span className="bulk-summary-chip bulk-summary-chip--warn">
                {shortageLines} short
              </span>
            )}
            {noStockLines > 0 && (
              <span className="bulk-summary-chip bulk-summary-chip--none">
                {noStockLines} no stock
              </span>
            )}
          </div>

          {/* Shortage note */}
          {hasShortages && hasAnyStock && (
            <div className="bulk-shortage-note">
              Shortages highlighted above. You can still apply partial allocations — wait for remaining
              stock to arrive before confirming the rest.
            </div>
          )}

          {!hasAnyStock && (
            <div className="bulk-no-stock-note">
              No available stock found for any line on this order. Check that goods have been received
              and are in a holding location.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bulk-modal-footer">
          <button type="button" className="btn-sm btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <Button onClick={onApply} disabled={!hasAnyStock}>
            Apply Suggestions
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Auto-allocate CTA banner ──────────────────────────────────────────────────

function AutoAllocateBanner({ stockStatus, hasUnallocatedLines, onAutoAllocate }) {
  if (stockStatus !== "success" || !hasUnallocatedLines) return null;

  return (
    <div className="bulk-auto-cta">
      <div className="bulk-auto-cta-body">
        <span className="bulk-auto-cta-title">Auto-allocate available stock</span>
        <span className="bulk-auto-cta-sub">
          Fills all lines using earliest-received stock · review before applying
        </span>
      </div>
      <button type="button" className="bulk-auto-btn" onClick={onAutoAllocate}>
        ⚡ Auto-Allocate
      </button>
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
      summaryItems.push({
        lineId: line.id,
        productName: line.product.name,
        mode: "serial",
        quantity: ids.length,
        uom: line.product.unitOfMeasure,
        serials,
      });
    } else {
      const rawQty = parseFloat(quantitySelections[line.id]) || 0;
      if (rawQty <= 0) continue;
      if (rawQty > line.remainingQuantity) {
        errors.push(`${line.product.name}: quantity exceeds remaining.`);
      }

      const stockItems = sortByEarliestReceived(stock?.items || []);
      if (!stockItems.length) {
        errors.push(`${line.product.name}: no available stock.`);
        continue;
      }

      // Spread allocation across stock items (earliest-received first)
      let qtyLeft = rawQty;
      const qtyAllocations = [];
      for (const item of stockItems) {
        if (qtyLeft <= 0) break;
        const fromThis = Math.min(qtyLeft, Number(item.availableQuantity || 0));
        if (fromThis > 0) {
          qtyAllocations.push({ stockItemId: item.stockItemId, quantity: fromThis });
          qtyLeft -= fromThis;
        }
      }

      if (!qtyAllocations.length) {
        errors.push(`${line.product.name}: no available quantity.`);
        continue;
      }

      allocations.push({ salesOrderLineId: line.id, quantityAllocations: qtyAllocations });
      summaryItems.push({
        lineId: line.id,
        productName: line.product.name,
        mode: "quantity",
        quantity: rawQty,
        uom: line.product.unitOfMeasure,
      });
    }
  }

  if (!allocations.length) {
    errors.push("Select serials or enter quantities above before confirming.");
  }

  return { allocations, summaryItems, errors };
}

// ── Main page ─────────────────────────────────────────────────────────────────

function SalesOrdersPage({ onNavigate }) {
  const { currentUser } = useUser();
  const canAllocate = usePermission("so:allocate");
  const canCreateSO = usePermission("so:create");
  const salesOrders = useApiResource("/sales-orders");
  const [timelineVisible, setTimelineVisible] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);

  const [selectedOrderNumber, setSelectedOrderNumber] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("so") || null;
  });

  // Clean ?so= from URL after capturing it
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("so")) {
      params.delete("so");
      const qs = params.toString();
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${qs ? `?${qs}` : ""}`,
      );
    }
  }, []);

  const timeline = useApiResource(
    selectedOrderNumber && timelineVisible
      ? `/sales-orders/${encodeURIComponent(selectedOrderNumber)}/timeline`
      : null,
  );

  const [orderDetail, setOrderDetail] = useState(null);
  const [detailStatus, setDetailStatus] = useState("idle");
  const [detailError, setDetailError] = useState("");
  const [stockByProduct, setStockByProduct] = useState({});
  const [stockStatus, setStockStatus] = useState("idle");
  const [serialSelections, setSerialSelections] = useState({});
  const [quantitySelections, setQuantitySelections] = useState({});
  const [submitStatus, setSubmitStatus] = useState("idle");
  const [submitError, setSubmitError] = useState("");
  const [celebrateOrder, setCelebrateOrder] = useState(null);

  // Bulk allocation state
  const [showBulkPreview, setShowBulkPreview] = useState(false);
  const [bulkSuggestions, setBulkSuggestions] = useState(null);

  const allOrders = salesOrders.data?.items || [];

  const filteredOrders = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    let orders = allOrders;
    if (!showCompleted) {
      orders = orders.filter((o) => !["dispatched", "cancelled"].includes(o.status));
    }
    if (!q) return orders;
    return orders.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q),
    );
  }, [allOrders, searchTerm, showCompleted]);

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
      } catch {
        if (cancelled) return;
        setStockByProduct({});
        setStockStatus("error");
      }
    }

    void loadStock();
    return () => { cancelled = true; };
  }, [orderDetail]);

  // Clear all selections when order changes
  useEffect(() => {
    setSerialSelections({});
    setQuantitySelections({});
    setSubmitStatus("idle");
    setSubmitError("");
    setCelebrateOrder(null);
    setShowBulkPreview(false);
    setBulkSuggestions(null);
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

  function handleQuickApplySerials(lineId, unselectedItems, count) {
    const sorted = sortByEarliestReceived(unselectedItems);
    const toAdd = sorted.slice(0, count).map((item) => item.stockItemId);
    setSerialSelections((prev) => ({
      ...prev,
      [lineId]: [...new Set([...(prev[lineId] || []), ...toAdd])],
    }));
  }

  function handleQuickApplyQty(lineId, value) {
    setQuantitySelections((prev) => ({ ...prev, [lineId]: value }));
  }

  // ── Bulk allocation handlers ──────────────────────────────────────────────

  function handleAutoAllocate() {
    if (!orderDetail || stockStatus !== "success") return;
    const suggestions = buildAutoAllocationSuggestions(orderDetail, stockByProduct);
    if (!suggestions.lines.length) return;
    setBulkSuggestions(suggestions);
    setShowBulkPreview(true);
  }

  function handleApplyBulkSuggestions() {
    if (!bulkSuggestions) return;
    // Merge suggestions into existing selections (don't overwrite manual changes)
    setSerialSelections((prev) => ({ ...prev, ...bulkSuggestions.serialSelections }));
    setQuantitySelections((prev) => ({ ...prev, ...bulkSuggestions.quantitySelections }));
    setShowBulkPreview(false);
    setBulkSuggestions(null);
  }

  function handleCancelBulkPreview() {
    setShowBulkPreview(false);
    setBulkSuggestions(null);
  }

  // ── Confirm allocation ────────────────────────────────────────────────────

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
        setOrderDetail({ order: response.order, lines: response.lines });
        setSerialSelections({});
        setQuantitySelections({});
        setSubmitStatus("idle");

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

  function handleSelectOrderWithReset(orderNumber) {
    setTimelineVisible(false);
    handleSelectOrder(orderNumber);
  }

  function handleAllocateAnother() {
    setCelebrateOrder(null);
    setSubmitStatus("idle");
    setSelectedOrderNumber(null);
    setTimelineVisible(false);
    salesOrders.reload();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const hasUnallocatedLines = orderDetail?.lines?.some((l) => l.remainingQuantity > 0) ?? false;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Outbound"
        title="Sales Orders"
        description="Search customer orders, review open demand, and allocate available stock."
        help={HELP_CONTENT.salesOrders}
        actions={
          <>
            <Button variant="secondary" onClick={salesOrders.reload}>Refresh</Button>
            {canCreateSO && (
              <Button onClick={() => onNavigate?.("/sales-orders/new")}>New Sales Order</Button>
            )}
          </>
        }
      />

      <GuidedHelpPanel
        intro={HELP_CONTENT.allocation.summary}
        steps={HELP_CONTENT.allocation.steps}
        warnings={HELP_CONTENT.allocation.warnings}
      />

      <div className="so-layout">
        {/* ── Left: order queue ─────────────────────────────────────────────── */}
        <aside className="so-queue">
          <div className="so-queue-search">
            <FieldHelp
              className="search-field"
              label="Sales order search"
              help="Search by the customer sales order reference or the customer name."
            >
              <input
                className="text-input so-search-input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search SO number or customer…"
              />
            </FieldHelp>
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
              <div className="so-queue-filter-row">
                <span className="so-queue-filter-count">
                  {filteredOrders.length} order{filteredOrders.length !== 1 ? "s" : ""}
                </span>
                <button
                  type="button"
                  className={`so-filter-toggle ${showCompleted ? "so-filter-toggle--active" : ""}`}
                  onClick={() => setShowCompleted((v) => !v)}
                >
                  {showCompleted ? "Active only" : "Show completed"}
                </button>
              </div>

              {filteredOrders.length === 0 ? (
                <div className="so-queue-state">
                  {searchTerm
                    ? `No orders match "${searchTerm}".`
                    : showCompleted
                    ? "No orders in the system."
                    : "No active orders. Toggle to show completed orders."}
                </div>
              ) : (
                filteredOrders.map((order) => {
                  const isActive = order.orderNumber === selectedOrderNumber;
                  return (
                    <button
                      key={order.orderNumber}
                      type="button"
                      className={`so-queue-item ${isActive ? "so-queue-item--active" : ""} ${order.priority === "urgent" ? "so-queue-item--urgent" : ""}`}
                      onClick={() => handleSelectOrderWithReset(order.orderNumber)}
                    >
                      <div className="so-queue-item-top">
                        <span className="so-queue-number">{order.orderNumber}</span>
                        <AllocationStatusPill allocationStatus={order.summary.allocationStatus} />
                      </div>
                      <p className="so-queue-customer">{order.customerName}</p>
                      <div className="so-queue-item-bottom">
                        <DispatchTag dateStr={order.dispatchDueAt} />
                        {order.priority === "urgent" && <PriorityBadge priority={order.priority} />}
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

        {/* ── Right: workspace ──────────────────────────────────────────────── */}
        <main className="so-workspace">
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
                  <h2 className="alloc-order-number">
                    {orderDetail.order.orderNumber}
                  </h2>
                  <p className="alloc-order-customer">
                    {orderDetail.order.customerName}
                  </p>
                </div>
                <div className="alloc-order-header-right">
                  <AllocationStatusPill allocationStatus={orderDetail.order.summary.allocationStatus} />
                  {orderDetail.order.priority === "urgent" && <PriorityBadge priority="urgent" />}
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
                  <strong className="alloc-summary-value alloc-summary-value--allocated">
                    {formatNumber(orderDetail.order.summary.quantityAllocated)}
                  </strong>
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
                    <strong className="alloc-summary-value alloc-summary-value--date">
                      {formatDate(orderDetail.order.requestedAt)}
                    </strong>
                  </div>
                )}
              </div>

              {/* Auto-allocate CTA */}
              {canAllocate && (
                <AutoAllocateBanner
                  stockStatus={stockStatus}
                  hasUnallocatedLines={hasUnallocatedLines}
                  onAutoAllocate={handleAutoAllocate}
                />
              )}

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
                    onQuickApplySerials={handleQuickApplySerials}
                    onQuickApplyQty={handleQuickApplyQty}
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
                  {canAllocate ? (
                    <>
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
                    </>
                  ) : (
                    <PermissionGate permission="so:allocate" />
                  )}
                </div>
              </div>

              {/* Activity timeline */}
              <div className="so-timeline-section">
                <button
                  type="button"
                  className="so-timeline-toggle"
                  onClick={() => setTimelineVisible((v) => !v)}
                >
                  {timelineVisible ? "Hide activity" : "Show activity"}
                  <span className="so-timeline-toggle-arrow">{timelineVisible ? "▲" : "▼"}</span>
                </button>
                {timelineVisible && (
                  <ActivityTimeline
                    events={timeline.data?.events}
                    loading={timeline.status === "loading"}
                    error={timeline.status === "error" ? "Unable to load activity." : null}
                    emptyMessage="No activity recorded for this order yet."
                  />
                )}
              </div>

              {/* Bulk allocation preview modal (rendered inside workspace for proper z-index stacking) */}
              {showBulkPreview && bulkSuggestions && (
                <BulkAllocationPreview
                  orderNumber={orderDetail.order.orderNumber}
                  customerName={orderDetail.order.customerName}
                  suggestions={bulkSuggestions}
                  onApply={handleApplyBulkSuggestions}
                  onCancel={handleCancelBulkPreview}
                />
              )}
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}

export default SalesOrdersPage;
