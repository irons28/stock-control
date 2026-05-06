import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "../components/Button";
import Card from "../components/Card";
import FieldHelp from "../components/FieldHelp";
import GuidedHelpPanel from "../components/GuidedHelpPanel";
import HelpTooltip from "../components/HelpTooltip";
import PageHeader from "../components/PageHeader";
import { HELP_CONTENT } from "../config/helpContent";
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

// ── Audible scanner feedback ──────────────────────────────────────────────────

function useScannerBeep() {
  const ctxRef = useRef(null);

  function getCtx() {
    if (!ctxRef.current) {
      try {
        ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        return null;
      }
    }
    // Resume if suspended (browser autoplay policy)
    if (ctxRef.current.state === "suspended") {
      ctxRef.current.resume().catch(() => {});
    }
    return ctxRef.current;
  }

  return useCallback(function beep(type) {
    const ctx = getCtx();
    if (!ctx) return;

    try {
      if (type === "ok") {
        // Short clean beep: 820 Hz, 80 ms
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 820;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.14, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.09);
      } else if (type === "dup") {
        // Two low blips: 280 Hz, 50 ms each
        for (let i = 0; i < 2; i++) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 280;
          osc.type = "square";
          const t = ctx.currentTime + i * 0.075;
          gain.gain.setValueAtTime(0.07, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
          osc.start(t);
          osc.stop(t + 0.055);
        }
      } else if (type === "complete") {
        // Rising two-tone completion chord
        [600, 900].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = freq;
          osc.type = "sine";
          const t = ctx.currentTime + i * 0.11;
          gain.gain.setValueAtTime(0.11, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
          osc.start(t);
          osc.stop(t + 0.19);
        });
      }
    } catch {
      // AudioContext may be blocked — silent failure is fine
    }
  }, []);
}

// ── Serial chip input (standard mode) ────────────────────────────────────────

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

// ── Scanner mode panel ────────────────────────────────────────────────────────

function ScannerModePanel({
  serialLines,
  qtyLines,
  formState,
  onAddSerials,
  onRemoveSerial,
  onQtyChange,
  onExit,
  onSubmit,
  submitting,
}) {
  const beep = useScannerBeep();
  const [activeLineIndex, setActiveLineIndex] = useState(0);
  const [inputValue, setInputValue] = useState("");
  // feedback: { type: "ok"|"dup", serial: string, count: number } | null
  const [feedback, setFeedback] = useState(null);
  const inputRef = useRef(null);

  const activeLine = serialLines[activeLineIndex] ?? serialLines[0];

  // Auto-focus on mount and when active line changes
  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, [activeLineIndex]);

  // Clear feedback after 1.2s
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 1200);
    return () => clearTimeout(t);
  }, [feedback]);

  function commitScan(raw) {
    const serials = parseRawSerials(raw);
    if (!serials.length || !activeLine) return;

    const existing = formState.lines[activeLine.id]?.serials || [];
    const dups = serials.filter((s) => existing.includes(s));
    const fresh = serials.filter((s) => !existing.includes(s));

    if (dups.length && !fresh.length) {
      // All duplicates — error feedback only
      setFeedback({ type: "dup", serial: dups[0], count: dups.length });
      beep("dup");
      return;
    }

    if (fresh.length) {
      onAddSerials(activeLine.id, fresh);

      // Auto-sync quantity to serial count
      const newTotal = existing.length + fresh.length;
      const currentQty = Number(formState.lines[activeLine.id]?.quantityReceived) || 0;
      if (newTotal > currentQty) {
        onQtyChange(activeLine.id, String(newTotal));
      }

      const target = Number(activeLine.remainingQuantity);
      const isNowComplete = target > 0 && newTotal >= target;

      if (isNowComplete) {
        setFeedback({ type: "ok", serial: fresh[fresh.length - 1], count: fresh.length });
        beep("complete");
        // Auto-advance to the next incomplete serial line
        const nextIdx = serialLines.findIndex(
          (l, i) =>
            i > activeLineIndex &&
            (formState.lines[l.id]?.serials?.length || 0) < Number(l.remainingQuantity)
        );
        if (nextIdx !== -1) {
          setTimeout(() => setActiveLineIndex(nextIdx), 700);
        }
      } else {
        setFeedback({ type: "ok", serial: fresh[fresh.length - 1], count: fresh.length });
        beep("ok");
      }

      if (dups.length) {
        // Mixed: some new, some dup — show dup warning alongside the ok
        setTimeout(() => {
          setFeedback({ type: "dup", serial: dups[0], count: dups.length });
        }, 800);
      }
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (inputValue.trim()) {
        commitScan(inputValue);
        setInputValue("");
      }
    } else if (e.key === "Escape") {
      onExit();
    } else if (e.key === "Tab" && !e.shiftKey) {
      if (activeLineIndex < serialLines.length - 1) {
        e.preventDefault();
        setActiveLineIndex((i) => i + 1);
        setInputValue("");
      }
    } else if (e.key === "Tab" && e.shiftKey) {
      if (activeLineIndex > 0) {
        e.preventDefault();
        setActiveLineIndex((i) => i - 1);
        setInputValue("");
      }
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text");
    if (pasted.trim()) {
      commitScan(pasted);
      setInputValue("");
    }
  }

  if (!serialLines.length) {
    return (
      <div className="scanner-panel">
        <div className="scanner-no-lines">
          <p>No serial-tracked lines on this order — nothing to scan.</p>
          <button type="button" className="scanner-exit-btn" onClick={onExit}>
            Exit Scanner Mode
          </button>
        </div>
      </div>
    );
  }

  const scanned = formState.lines[activeLine.id]?.serials || [];
  const target = Number(activeLine.remainingQuantity);
  const count = scanned.length;
  const isOver = target > 0 && count > target;
  const isComplete = target > 0 && count >= target;

  const counterMod = isOver
    ? "scanner-counter--over"
    : isComplete
    ? "scanner-counter--done"
    : count > 0
    ? "scanner-counter--progress"
    : "";

  // All serial lines complete?
  const allSerialsDone = serialLines.every(
    (l) =>
      Number(l.remainingQuantity) > 0 &&
      (formState.lines[l.id]?.serials?.length || 0) >= Number(l.remainingQuantity)
  );

  return (
    <div className="scanner-panel">
      {/* ── Header ── */}
      <div className="scanner-panel-header">
        <div className="scanner-panel-title">
          <span className="scanner-mode-badge">⚡ Scanner Mode</span>
          {serialLines.length > 1 && (
            <div className="scanner-line-nav" role="tablist" aria-label="Select line to scan">
              {serialLines.map((line, idx) => {
                const lineScanned = formState.lines[line.id]?.serials?.length || 0;
                const lineDone =
                  Number(line.remainingQuantity) > 0 &&
                  lineScanned >= Number(line.remainingQuantity);
                return (
                  <button
                    key={line.id}
                    type="button"
                    role="tab"
                    aria-selected={idx === activeLineIndex}
                    className={`scanner-line-tab${idx === activeLineIndex ? " active" : ""}${lineDone ? " done" : ""}`}
                    onClick={() => {
                      setActiveLineIndex(idx);
                      setInputValue("");
                      inputRef.current?.focus();
                    }}
                  >
                    {line.productCode}
                    <span className="scanner-line-tab-count">
                      {lineDone ? " ✓" : ` ${lineScanned}/${Number(line.remainingQuantity)}`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <button type="button" className="scanner-exit-btn" onClick={onExit}>
          ✕ Exit Scanner
        </button>
      </div>

      {/* ── Product info ── */}
      <div className="scanner-line-info">
        <div className="scanner-product-name">{activeLine.productName}</div>
        <div className="scanner-product-sku">{activeLine.productCode}</div>
      </div>

      {/* ── Counter ── */}
      <div className={`scanner-counter ${counterMod}`} aria-live="polite" aria-atomic="true">
        <span className="scanner-counter-value">{count}</span>
        <span className="scanner-counter-sep">/</span>
        <span className="scanner-counter-target">{target || "?"}</span>
        <span className="scanner-counter-label">scanned</span>
      </div>

      {/* ── Progress bar ── */}
      {target > 0 && (
        <div className="scanner-progress-track" role="progressbar" aria-valuenow={count} aria-valuemax={target}>
          <div
            className={`scanner-progress-fill${isComplete ? " scanner-progress-fill--done" : ""}`}
            style={{ width: `${Math.min(100, (count / target) * 100)}%` }}
          />
        </div>
      )}

      {/* ── Feedback toast ── */}
      {feedback && (
        <div
          key={`${feedback.type}-${feedback.serial}`}
          className={`scanner-feedback scanner-feedback--${feedback.type}`}
          role="status"
          aria-live="assertive"
        >
          {feedback.type === "ok"
            ? feedback.count > 1
              ? `✓ ${feedback.count} serials added`
              : `✓ ${feedback.serial}`
            : `⚠ Already scanned: ${feedback.serial}`}
        </div>
      )}

      {/* ── Scan input ── */}
      <div className="scanner-input-wrap">
        <input
          ref={inputRef}
          type="text"
          className={[
            "scanner-scan-input",
            feedback?.type === "ok" ? "scanner-scan-input--ok" : "",
            feedback?.type === "dup" ? "scanner-scan-input--error" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Scan barcode or type serial…"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label={`Scan serial number for ${activeLine.productName}`}
        />
        <div className="scanner-input-hints">
          <span><kbd>Enter</kbd> commit</span>
          <span><kbd>Paste</kbd> bulk import</span>
          {serialLines.length > 1 && <span><kbd>Tab</kbd> next line</span>}
          <span><kbd>Esc</kbd> exit</span>
        </div>
      </div>

      {/* ── Qty-only lines (compact) ── */}
      {qtyLines.length > 0 && (
        <div className="scanner-qty-lines">
          <div className="scanner-qty-lines-header">Quantity lines</div>
          {qtyLines.map((line) => (
            <div key={line.id} className="scanner-qty-row">
              <div className="scanner-qty-label">
                <strong>{line.productCode}</strong>
                <span className="scanner-qty-line-name">{line.productName}</span>
              </div>
              <div className="scanner-qty-remaining">
                {formatNumber(line.remainingQuantity)} remaining
              </div>
              <input
                type="number"
                className="scanner-qty-input"
                min="0"
                max={line.remainingQuantity}
                step="0.01"
                value={formState.lines[line.id]?.quantityReceived || ""}
                onChange={(e) => onQtyChange(line.id, e.target.value)}
                placeholder="0"
                aria-label={`Quantity for ${line.productName}`}
              />
            </div>
          ))}
        </div>
      )}

      {/* ── Scanned chips (most recent first) ── */}
      {scanned.length > 0 && (
        <div className="scanner-scanned-list">
          <div className="scanner-scanned-header">
            Captured serials — {activeLine.productName}
          </div>
          <div className="scanner-chips">
            {[...scanned].reverse().map((serial, idx) => (
              <span key={`${serial}-${idx}`} className="scanner-chip">
                {serial}
                <button
                  type="button"
                  className="scanner-chip-remove"
                  onClick={() => onRemoveSerial(activeLine.id, serial)}
                  aria-label={`Remove ${serial}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="scanner-form-actions">
        {allSerialsDone && (
          <Button type="button" onClick={onSubmit} disabled={submitting}>
            {submitting ? "Saving Receipt…" : "Submit Receipt"}
          </Button>
        )}
        <button type="button" className="scanner-exit-btn scanner-exit-btn--secondary" onClick={onExit}>
          Back to Form View
        </button>
      </div>
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

function SuggestionCard({
  productName,
  productSku,
  isSerialTracked,
  availableQuantity,
  requiresPutaway,
  soMatch,
  onAllocate,
}) {
  const dateCls = classifyDispatchDate(soMatch.dispatchDueAt);

  return (
    <article className="sug-card">
      <div className="sug-card-header">
        <div className="sug-card-product">
          <span className="sug-product-name">{productName}</span>
          <span className="sug-product-sku">{productSku}</span>
        </div>
        <div className="sug-card-meta">
          {soMatch.isLinked && <span className="sug-linked-badge">🔗 Linked PO</span>}
          {soMatch.priority === "urgent" && <span className="sug-urgent-badge">🔴 Urgent</span>}
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
              <strong
                className={`sug-qty-value ${soMatch.canFullyFulfill ? "sug-qty--ok" : "sug-qty--short"}`}
              >
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
        <p className="sug-putaway-notice">⚠ Stock is in hold — put away required before allocating</p>
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
        const data = await apiFetch(
          `/allocation/suggestions/${encodeURIComponent(poNumber)}`
        );
        if (cancelledRef.current) return;
        setSuggestions(data.suggestions || []);
        setStatus("success");
      } catch {
        if (cancelledRef.current) return;
        setStatus("error");
      }
    }

    void load();
    return () => {
      cancelledRef.current = true;
    };
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

  if (status === "error") return null;

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

  // Scanner mode
  const [scannerMode, setScannerMode] = useState(false);

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

  // Load PO detail when selection changes; exit scanner mode on PO change
  useEffect(() => {
    let cancelled = false;
    setScannerMode(false);

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

  // Lines split by type for scanner mode
  const serialLines = useMemo(
    () => liveLineSummary.filter((l) => l.serialTrackingRequired && Number(l.remainingQuantity) > 0),
    [liveLineSummary]
  );
  const qtyLines = useMemo(
    () => liveLineSummary.filter((l) => !l.serialTrackingRequired && Number(l.remainingQuantity) > 0),
    [liveLineSummary]
  );
  const hasScannable = serialLines.length > 0;

  function handlePoSelect(poNumber) {
    setSelectedPoNumber(poNumber);
    setSuccessSummary(null);
    setValidationMessage("");
    setScannerMode(false);
  }

  const updateLineQty = useCallback(
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
    },
    []
  );

  const addSerials = useCallback(
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
    },
    []
  );

  const removeSerial = useCallback(
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
    },
    []
  );

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
    if (event?.preventDefault) event.preventDefault();
    setValidationMessage("");
    setSuccessSummary(null);
    setShowSuggestions(false);

    if (!selectedPoNumber) {
      setValidationMessage("Select a purchase order first.");
      return;
    }
    if (!formState.deliveryNumber.trim()) {
      setValidationMessage("Enter the supplier delivery number.");
      setScannerMode(false);
      return;
    }
    if (!formState.receivedBy.trim()) {
      setValidationMessage("Enter who received the delivery.");
      setScannerMode(false);
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
      setScannerMode(false);
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

      setScannerMode(false);
      setSuccessSummary(payload);
      setShowSuggestions(true);
      purchaseOrders.reload();
    } catch (error) {
      setValidationMessage(error.message || "Unable to receive goods.");
      setScannerMode(false);
    } finally {
      setSubmitting(false);
    }
  }

  function handleReceiveAnother() {
    setSuccessSummary(null);
    setShowSuggestions(false);
    setScannerMode(false);
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

        {/* Jira integration result */}
        {successSummary.jiraResult?.attempted && (
          <div className={`alert ${successSummary.jiraResult.success ? "success" : "warning"}`}>
            {successSummary.jiraResult.success
              ? `Jira comment added to ${successSummary.jiraResult.issueKey}.`
              : `Jira update could not be completed for ${successSummary.jiraResult.issueKey}. The receipt was still saved.`}
          </div>
        )}

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
        help={HELP_CONTENT.receiveGoods}
        actions={
          <Button variant="secondary" onClick={purchaseOrders.reload}>
            Refresh Orders
          </Button>
        }
      />

      <GuidedHelpPanel
        intro={HELP_CONTENT.receiveGoods.summary}
        steps={HELP_CONTENT.receiveGoods.steps}
        warnings={HELP_CONTENT.receiveGoods.warnings}
      />

      {/* Step 1 — Select PO */}
      <Card title="Select Purchase Order" subtitle="Inbound Queue">
        {purchaseOrders.status === "loading" ? (
          <div className="table-state">
            <strong>Loading purchase orders…</strong>
          </div>
        ) : (
          <div className="receive-po-search-block">
            <div className="receive-field-help-row">
              <FieldHelp
                label="Purchase order"
                help="Search for or select the purchase order you are receiving against."
                className="receive-inline-help"
                labelClassName="receive-inline-help-label"
              />
            </div>
            <POSearchInput
              options={poOptions}
              selectedPoNumber={selectedPoNumber}
              onSelect={handlePoSelect}
            />
            {poOptions.length > 0 && (
              <small className="receive-po-count">
                {
                  poOptions.filter(
                    (po) => !String(po.status || "").toLowerCase().includes("fully")
                  ).length
                }{" "}
                <HelpTooltip text="Choose the purchase order that matches the physical delivery before you enter any quantities.">
                  orders with outstanding lines
                </HelpTooltip>
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
                    Math.max(0, po.totalOrderedQuantity - po.totalReceivedQuantity)
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
              <FieldHelp
                className="receive-field"
                label="Delivery note/reference"
                help="Enter the supplier delivery note or reference from the paperwork."
                required
              >
                <input
                  value={formState.deliveryNumber}
                  onChange={(e) => handleHeaderField("deliveryNumber", e.target.value)}
                  placeholder="e.g. DN-2024-001"
                  autoComplete="off"
                />
              </FieldHelp>
              <label className="receive-field">
                <span>
                  Received by <span className="receive-required">*</span>
                </span>
                <input
                  value={formState.receivedBy}
                  onChange={(e) => handleHeaderField("receivedBy", e.target.value)}
                  placeholder="Warehouse team member"
                />
              </label>
              <label className="receive-field">
                <span>Delivery date</span>
                <input
                  type="date"
                  value={formState.receivedDate}
                  onChange={(e) => handleHeaderField("receivedDate", e.target.value)}
                />
              </label>
            </div>
          </Card>

          {/* Step 4 — Receipt lines */}
          <Card title="Receipt Lines" subtitle={scannerMode ? "⚡ Scanner Mode active" : "Step 3 of 3"}>
            {validationMessage && !scannerMode && (
              <div className="notice error" style={{ marginBottom: "1rem" }}>
                <strong>Check required fields</strong>
                <p>{validationMessage}</p>
              </div>
            )}

            {/* Scanner mode toggle */}
            {!scannerMode && hasScannable && (
              <button
                type="button"
                className="scanner-mode-toggle"
                onClick={() => setScannerMode(true)}
              >
                <span className="scanner-mode-toggle-icon">⚡</span>
                <span className="scanner-mode-toggle-text">
                  <span className="scanner-mode-toggle-title">Switch to Scanner Mode</span>
                  <span className="scanner-mode-toggle-sub">
                    Auto-focus · audible feedback · Enter to scan · paste to bulk import
                  </span>
                </span>
                <span className="scanner-mode-toggle-arrow">→</span>
              </button>
            )}

            {/* Scanner mode panel */}
            {scannerMode && (
              <ScannerModePanel
                serialLines={serialLines}
                qtyLines={qtyLines}
                formState={formState}
                onAddSerials={addSerials}
                onRemoveSerial={removeSerial}
                onQtyChange={updateLineQty}
                onExit={() => setScannerMode(false)}
                onSubmit={handleSubmit}
                submitting={submitting}
              />
            )}

            {/* Normal line list */}
            {!scannerMode && (
              <>
                <div className="receive-line-list">
                  {liveLineSummary.map((line) => {
                    const alreadyComplete = Number(line.remainingQuantity) <= 0;
                    const hasQty = line.quantity_now > 0;
                    const needsSerials = line.serialTrackingRequired && hasQty;
                    const serialsOk =
                      !needsSerials || line.serials.length === line.quantity_now;
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
                            <span className="receive-line-name">{line.productName}</span>
                            <span
                              className={`pill ${line.serialTrackingRequired ? "serial-required" : "subtle"}`}
                            >
                              {line.serialTrackingRequired ? "Serial tracked" : "Qty tracked"}
                            </span>
                          </div>
                          <span
                            className={`pill ${
                              alreadyComplete ? "positive" : hasQty ? "info" : "subtle"
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
                            <FieldHelp
                              className="receive-field receive-qty-field"
                              label="Received quantity"
                              help="Enter how many units arrived today. Do not enter more than the remaining quantity."
                            >
                              <input
                                type="number"
                                min="0"
                                max={line.remainingQuantity}
                                step={line.serialTrackingRequired ? "1" : "0.01"}
                                value={formState.lines[line.id]?.quantityReceived || ""}
                                onChange={(e) => updateLineQty(line.id, e.target.value)}
                                placeholder="0"
                                className="receive-qty-input"
                              />
                            </FieldHelp>

                            {line.serialTrackingRequired && (
                              <div className="serial-entry-block">
                                <div className="serial-entry-header">
                                  <HelpTooltip
                                    text="Scan or type the serial number for this item. Required for serialised stock."
                                    align="left"
                                    className="serial-entry-label"
                                  >
                                    Serial numbers
                                  </HelpTooltip>
                                  <span
                                    className={`serial-progress-badge${
                                      serialsOk && hasQty
                                        ? " complete"
                                        : hasDuplicates
                                        ? " error"
                                        : ""
                                    }`}
                                  >
                                    {line.serials.length} of {line.quantity_now || "?"} scanned
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

                        {line.remainingQuantity <= 0 && (
                          <p className="rg-line-complete">
                            ✓ All {formatNumber(line.orderedQuantity)} units received.
                          </p>
                        )}
                      </article>
                    );
                  })}
                </div>

                <div className="receive-form-actions">
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Saving Receipt…" : "Confirm Receipt"}
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
              </>
            )}
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
