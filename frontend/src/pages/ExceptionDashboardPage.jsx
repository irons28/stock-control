import { useState } from "react";
import Button from "../components/Button";
import PageHeader from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";
import { formatDate, formatDateTime } from "../lib/formatters";

// ── Navigation helper ──────────────────────────────────────────────────────────
function navigateTo(path) {
  if (window.location.pathname === path) return;
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

// ── Category display order (critical first) ────────────────────────────────────
const CATEGORY_ORDER = [
  "overdue_dispatches",
  "stalled_allocations",
  "overdue_purchase_orders",
  "urgent_deadlines",
  "partially_allocated_orders",
  "quarantined_stock",
  "returned_stock",
];

// ── Category → page path for "View" links ─────────────────────────────────────
const CATEGORY_PATH = {
  overdue_purchase_orders:  "/purchase-orders",
  overdue_dispatches:       "/sales-orders",
  urgent_deadlines:         "/sales-orders",
  quarantined_stock:        "/serial-tracker",
  returned_stock:           "/stock",
  partially_allocated_orders: "/sales-orders",
  stalled_allocations:      "/sales-orders",
};

// ── Severity helpers ───────────────────────────────────────────────────────────
const SEVERITY_LABEL = {
  critical: "Critical",
  warning:  "Warning",
  clear:    "Clear",
};

const SEVERITY_ICON = {
  critical: "●",
  warning:  "●",
  clear:    "✓",
};

// ── Days display ───────────────────────────────────────────────────────────────
function DaysChip({ days, mode = "overdue" }) {
  if (days == null) return null;
  const n = Number(days);

  if (mode === "overdue") {
    const cls = n >= 7 ? "exc-days-chip critical" : n >= 3 ? "exc-days-chip warning" : "exc-days-chip mild";
    return <span className={cls}>{n}d overdue</span>;
  }

  if (mode === "remaining") {
    const cls = n <= 0 ? "exc-days-chip critical" : n <= 1 ? "exc-days-chip critical" : "exc-days-chip warning";
    const label = n <= 0 ? "Today" : n === 1 ? "Tomorrow" : `${n}d left`;
    return <span className={cls}>{label}</span>;
  }

  if (mode === "held") {
    const cls = n >= 14 ? "exc-days-chip critical" : n >= 7 ? "exc-days-chip warning" : "exc-days-chip mild";
    return <span className={cls}>{n}d held</span>;
  }

  return null;
}

// ── Item rows per category ─────────────────────────────────────────────────────

function OverduePoRows({ items }) {
  return (
    <table className="exc-table">
      <thead>
        <tr>
          <th>PO Number</th>
          <th>Supplier</th>
          <th>Expected</th>
          <th>Age</th>
          <th>Outstanding</th>
          <th>Linked SOs</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.ref}>
            <td className="exc-ref">{item.ref}</td>
            <td>{item.party}</td>
            <td className="exc-date">{formatDate(item.date)}</td>
            <td><DaysChip days={item.days_overdue} mode="overdue" /></td>
            <td className="exc-qty">{item.qty_outstanding} units · {item.open_lines} lines</td>
            <td className="exc-linked">{item.linked_so_count > 0 ? <span className="exc-link-badge">{item.linked_so_count} SO{item.linked_so_count > 1 ? "s" : ""}</span> : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OverdueDispatchRows({ items }) {
  return (
    <table className="exc-table">
      <thead>
        <tr>
          <th>SO Number</th>
          <th>Customer</th>
          <th>Due Date</th>
          <th>Age</th>
          <th>Remaining</th>
          <th>Allocated</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.ref}>
            <td className="exc-ref">{item.ref}</td>
            <td>{item.party}</td>
            <td className="exc-date">{formatDate(item.date)}</td>
            <td><DaysChip days={item.days_overdue} mode="overdue" /></td>
            <td className="exc-qty">{item.qty_remaining} units</td>
            <td className="exc-qty">{item.qty_allocated} / {item.qty_remaining + item.qty_allocated}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function UrgentDeadlineRows({ items }) {
  return (
    <table className="exc-table">
      <thead>
        <tr>
          <th>SO Number</th>
          <th>Customer</th>
          <th>Deadline</th>
          <th>Window</th>
          <th>Remaining Qty</th>
          <th>Allocated</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.ref} className={item.item_severity === "critical" ? "exc-row-critical" : "exc-row-warning"}>
            <td className="exc-ref">{item.ref}</td>
            <td>{item.party}</td>
            <td className="exc-date">{formatDate(item.date)}</td>
            <td><DaysChip days={item.days_remaining} mode="remaining" /></td>
            <td className="exc-qty">{item.qty_remaining}</td>
            <td className="exc-qty">
              {item.qty_ordered > 0
                ? `${item.qty_allocated} / ${item.qty_ordered}`
                : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function QuarantinedRows({ items }) {
  return (
    <table className="exc-table">
      <thead>
        <tr>
          <th>Serial</th>
          <th>Product</th>
          <th>SKU</th>
          <th>Location</th>
          <th>Time in Hold</th>
          <th>Reason</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.ref}>
            <td className="exc-serial">{item.ref}</td>
            <td>{item.party}</td>
            <td className="exc-sku">{item.sku}</td>
            <td>{item.location || "—"}</td>
            <td><DaysChip days={item.days_held} mode="held" /></td>
            <td className="exc-reason">{item.hold_reason || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReturnedRows({ items }) {
  return (
    <table className="exc-table">
      <thead>
        <tr>
          <th>Serial</th>
          <th>Product</th>
          <th>SKU</th>
          <th>Location</th>
          <th>Time in Returns</th>
          <th>Note</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.ref}>
            <td className="exc-serial">{item.ref}</td>
            <td>{item.party}</td>
            <td className="exc-sku">{item.sku}</td>
            <td>{item.location || "—"}</td>
            <td><DaysChip days={item.days_held} mode="held" /></td>
            <td className="exc-reason">{item.hold_reason || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PartialAllocRows({ items }) {
  return (
    <table className="exc-table">
      <thead>
        <tr>
          <th>SO Number</th>
          <th>Customer</th>
          <th>Dispatch Due</th>
          <th>Unallocated Lines</th>
          <th>Unallocated Qty</th>
          <th>Progress</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.ref}>
            <td className="exc-ref">{item.ref}</td>
            <td>{item.party}</td>
            <td className="exc-date">{item.date ? formatDate(item.date) : "—"}</td>
            <td className="exc-qty">{item.unallocated_lines} line{item.unallocated_lines !== 1 ? "s" : ""}</td>
            <td className="exc-qty">{item.unallocated_qty} units</td>
            <td>
              <div className="exc-progress-wrap">
                <div
                  className="exc-progress-bar"
                  style={{
                    backgroundSize: item.qty_ordered > 0
                      ? `${Math.min(100, Math.round((item.qty_allocated / item.qty_ordered) * 100))}% 100%`
                      : "0% 100%",
                  }}
                />
                <span className="exc-progress-label">
                  {item.qty_ordered > 0
                    ? `${Math.round((item.qty_allocated / item.qty_ordered) * 100)}%`
                    : "0%"}
                </span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StalledAllocRows({ items }) {
  return (
    <table className="exc-table">
      <thead>
        <tr>
          <th>SO Number</th>
          <th>Customer</th>
          <th>Dispatch Due</th>
          <th>Age</th>
          <th>Allocated Items</th>
          <th>Serials</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.ref}>
            <td className="exc-ref">{item.ref}</td>
            <td>{item.party}</td>
            <td className="exc-date">{formatDate(item.date)}</td>
            <td><DaysChip days={item.days_overdue} mode="overdue" /></td>
            <td className="exc-qty">{item.allocated_item_count} item{item.allocated_item_count !== 1 ? "s" : ""}</td>
            <td className="exc-serials">{item.serial_numbers || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function renderRows(key, items) {
  if (key === "overdue_purchase_orders")    return <OverduePoRows items={items} />;
  if (key === "overdue_dispatches")         return <OverdueDispatchRows items={items} />;
  if (key === "urgent_deadlines")           return <UrgentDeadlineRows items={items} />;
  if (key === "quarantined_stock")          return <QuarantinedRows items={items} />;
  if (key === "returned_stock")             return <ReturnedRows items={items} />;
  if (key === "partially_allocated_orders") return <PartialAllocRows items={items} />;
  if (key === "stalled_allocations")        return <StalledAllocRows items={items} />;
  return null;
}

// ── Exception category card ────────────────────────────────────────────────────
const PREVIEW_COUNT = 5;

function ExceptionCard({ categoryKey, category }) {
  const [expanded, setExpanded] = useState(false);
  const { severity, label, description, count, items = [] } = category;
  const isClear = severity === "clear" || count === 0;
  const visibleItems = expanded ? items : items.slice(0, PREVIEW_COUNT);
  const hasMore = items.length > PREVIEW_COUNT;
  const destPath = CATEGORY_PATH[categoryKey];

  return (
    <div className={`exc-card exc-card--${isClear ? "clear" : severity}`}>
      <div className="exc-card-header">
        <div className="exc-card-header-left">
          <span className={`exc-severity-dot exc-severity-dot--${isClear ? "clear" : severity}`}>
            {SEVERITY_ICON[isClear ? "clear" : severity]}
          </span>
          <div className="exc-card-titles">
            <h3 className="exc-card-title">{label}</h3>
            <p className="exc-card-desc">{description}</p>
          </div>
        </div>
        <div className="exc-card-header-right">
          {!isClear && (
            <span className={`exc-count-badge exc-count-badge--${severity}`}>{count}</span>
          )}
          {isClear && <span className="exc-clear-badge">All Clear</span>}
          {!isClear && destPath && (
            <button
              type="button"
              className="exc-view-btn"
              onClick={() => navigateTo(destPath)}
            >
              View →
            </button>
          )}
        </div>
      </div>

      {!isClear && items.length > 0 && (
        <div className="exc-card-body">
          <div className="table-wrap">
            {renderRows(categoryKey, visibleItems)}
          </div>
          {hasMore && (
            <button
              type="button"
              className="exc-expand-btn"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded
                ? "Show fewer"
                : `Show ${items.length - PREVIEW_COUNT} more…`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Summary hero banner ────────────────────────────────────────────────────────
function SummaryHero({ data, onRefresh, loading }) {
  const { total_exceptions, critical_count, warning_count, clear, generated_at } = data;

  if (clear) {
    return (
      <div className="exc-hero exc-hero--clear">
        <div className="exc-hero-icon">✓</div>
        <div className="exc-hero-text">
          <h2 className="exc-hero-title">All Operations Clear</h2>
          <p className="exc-hero-sub">No exceptions detected across all monitored categories.</p>
        </div>
        <div className="exc-hero-actions">
          <p className="exc-hero-ts">Updated {formatDateTime(generated_at)}</p>
          <Button variant="secondary" onClick={onRefresh} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>
    );
  }

  const overallSeverity = critical_count > 0 ? "critical" : "warning";

  return (
    <div className={`exc-hero exc-hero--${overallSeverity}`}>
      <div className="exc-hero-metrics">
        <div className="exc-hero-metric">
          <span className="exc-hero-metric-value exc-metric--critical">{critical_count}</span>
          <span className="exc-hero-metric-label">Critical</span>
        </div>
        <div className="exc-hero-metric-divider" />
        <div className="exc-hero-metric">
          <span className="exc-hero-metric-value exc-metric--warning">{warning_count}</span>
          <span className="exc-hero-metric-label">Warning</span>
        </div>
        <div className="exc-hero-metric-divider" />
        <div className="exc-hero-metric">
          <span className="exc-hero-metric-value exc-metric--total">{total_exceptions}</span>
          <span className="exc-hero-metric-label">Total</span>
        </div>
      </div>
      <div className="exc-hero-actions">
        <p className="exc-hero-ts">Updated {formatDateTime(generated_at)}</p>
        <Button variant="secondary" onClick={onRefresh} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
    </div>
  );
}

// ── Loading skeleton ───────────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div className="exc-skeleton-stack">
      <div className="exc-skeleton-hero loading-block" />
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="exc-skeleton-card">
          <div className="exc-skeleton-header">
            <div className="loading-block exc-skeleton-dot" />
            <div className="loading-block exc-skeleton-title" />
            <div className="loading-block exc-skeleton-badge" />
          </div>
          <div className="exc-skeleton-rows">
            {[1, 2, 3].map((j) => (
              <div key={j} className="loading-block exc-skeleton-row" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
function ExceptionDashboardPage() {
  const exceptions = useApiResource("/dashboard/exceptions");
  const data = exceptions.data;

  const orderedCategories = data
    ? CATEGORY_ORDER.map((key) => ({ key, category: data.exceptions[key] })).filter(
        (e) => e.category,
      )
    : [];

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Management"
        title="Exception Dashboard"
        description="Real-time visibility of overdue orders, stalled stock, quarantine holds, and urgent customer commitments requiring immediate action."
        actions={
          exceptions.status !== "loading" && (
            <Button variant="secondary" onClick={exceptions.reload}>
              Refresh
            </Button>
          )
        }
      />

      {exceptions.status === "loading" && <LoadingSkeleton />}

      {exceptions.status === "error" && (
        <div className="exc-error-card">
          <span className="exc-error-icon">⚠</span>
          <div>
            <strong>Exception data unavailable</strong>
            <p>{exceptions.error} Confirm the backend is running on port 3001.</p>
          </div>
          <Button variant="secondary" onClick={exceptions.reload}>Retry</Button>
        </div>
      )}

      {exceptions.status === "success" && data && (
        <>
          <SummaryHero
            data={data}
            onRefresh={exceptions.reload}
            loading={exceptions.status === "loading"}
          />

          <div className="exc-categories">
            {orderedCategories.map(({ key, category }) => (
              <ExceptionCard key={key} categoryKey={key} category={category} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default ExceptionDashboardPage;
