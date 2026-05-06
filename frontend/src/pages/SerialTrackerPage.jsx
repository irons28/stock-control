import { useState } from "react";
import Card from "../components/Card";
import GuidedHelpPanel from "../components/GuidedHelpPanel";
import PageHeader from "../components/PageHeader";
import ScannerInput from "../components/ScannerInput";
import { HELP_CONTENT } from "../config/helpContent";
import { apiFetch } from "../lib/api";
import { formatDate, formatDateTime, formatLabel } from "../lib/formatters";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TIMELINE_META = {
  receipt:             { label: "Received",             tone: "receipt"     },
  allocation:          { label: "Allocated",            tone: "allocation"  },
  dispatch:            { label: "Dispatched",           tone: "dispatch"    },
  returned:            { label: "Returned",             tone: "returned"    },
  quarantined:         { label: "Quarantined",          tone: "quarantined" },
  warranty_replacement:{ label: "Warranty Replacement", tone: "warranty"    },
  scrapped:            { label: "Scrapped",             tone: "scrapped"    },
};

const STATUS_META = {
  available:           { label: "Available",            tone: "available"   },
  received:            { label: "Received",             tone: "received"    },
  allocated:           { label: "Allocated",            tone: "allocated"   },
  pending_allocation:  { label: "Pending Allocation",   tone: "pending"     },
  dispatched:          { label: "Dispatched",           tone: "dispatched"  },
  returned:            { label: "Returned",             tone: "returned"    },
  quarantined:         { label: "Quarantined",          tone: "quarantined" },
  scrapped:            { label: "Scrapped",             tone: "scrapped"    },
};

function getTimelineMeta(eventType) {
  return TIMELINE_META[eventType] || { label: formatLabel(eventType), tone: "neutral" };
}

function getStatusMeta(holdStatus) {
  return STATUS_META[holdStatus] || { label: formatLabel(holdStatus), tone: "neutral" };
}

// ── Status hero card ──────────────────────────────────────────────────────────

function SerialStatusCard({ item }) {
  const meta = getStatusMeta(item.hold_status);
  const isWarning = ["quarantined", "returned"].includes(item.hold_status);
  const isDanger  = item.hold_status === "quarantined";
  const isScrap   = item.hold_status === "scrapped";

  return (
    <div className={`serial-status-card card serial-status--${meta.tone}`}>
      <div className="serial-status-header">
        <div>
          <p className="serial-status-label">Serial Number</p>
          <p className="serial-status-number">{item.serial_number}</p>
        </div>
        <span className={`serial-status-badge badge--${meta.tone}`}>{meta.label}</span>
      </div>

      {/* Warning banners */}
      {isDanger && item.quarantine_reason && (
        <div className="serial-alert serial-alert--danger">
          <strong>Quarantine</strong> {item.quarantine_reason}
        </div>
      )}
      {item.hold_status === "returned" && item.return_date && (
        <div className="serial-alert serial-alert--warning">
          <strong>Returned</strong> Unit returned {formatDate(item.return_date)}
          {item.replaced_by_serial && ` — replacement: ${item.replaced_by_serial}`}
        </div>
      )}
      {isScrap && item.scrapped_reason && (
        <div className="serial-alert serial-alert--neutral">
          <strong>Scrapped</strong> {item.scrapped_reason}
        </div>
      )}

      {/* Quick-glance metrics */}
      <div className="serial-status-metrics">
        <div className="serial-metric">
          <span className="serial-metric-label">Product</span>
          <span className="serial-metric-value">{item.product_name}</span>
        </div>
        <div className="serial-metric">
          <span className="serial-metric-label">SKU</span>
          <span className="serial-metric-value mono">{item.sku}</span>
        </div>
        <div className="serial-metric">
          <span className="serial-metric-label">Location</span>
          <span className="serial-metric-value">
            {item.location_code ? `${item.location_code} — ${item.location_name}` : "Not located"}
          </span>
        </div>
        {item.supplier_name && (
          <div className="serial-metric">
            <span className="serial-metric-label">Supplier</span>
            <span className="serial-metric-value">{item.supplier_name}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Full detail card ──────────────────────────────────────────────────────────

function DetailSection({ title, children }) {
  return (
    <div className="serial-detail-section">
      <p className="serial-detail-section-title">{title}</p>
      <dl className="serial-detail-grid">{children}</dl>
    </div>
  );
}

function DetailRow({ label, value, mono = false }) {
  if (!value && value !== 0) return null;
  return (
    <div className="serial-detail-row">
      <dt>{label}</dt>
      <dd className={mono ? "mono" : ""}>{value}</dd>
    </div>
  );
}

function SerialDetailCard({ item }) {
  const hasReturn      = item.hold_status === "returned" || item.return_date;
  const hasDispatch    = item.dispatch_reference || item.dispatch_date;
  const hasCustomer    = item.customer_name || item.sales_order_number;
  const hasReplacement = item.replaced_by_serial || item.replaces_serial;

  return (
    <Card title="Lifecycle Record" subtitle="Full Detail">
      <div className="serial-detail-body">
        {/* Origin */}
        <DetailSection title="Origin">
          <DetailRow label="Supplier"          value={item.supplier_name} />
          <DetailRow label="Supplier Contact"  value={item.supplier_contact} />
          <DetailRow label="Purchase Order"    value={item.purchase_order_number} mono />
          <DetailRow label="PO Date"           value={formatDate(item.purchase_order_date)} />
          <DetailRow label="Delivery Note"     value={item.goods_receipt_ref || item.delivery_note_ref || null} mono />
          <DetailRow label="Received Date"     value={formatDate(item.received_date)} />
        </DetailSection>

        {/* Customer / order */}
        {hasCustomer && (
          <DetailSection title="Customer & Order">
            <DetailRow label="Customer"        value={item.customer_name} />
            <DetailRow label="Customer Code"   value={item.customer_code} mono />
            <DetailRow label="Sales Order"     value={item.sales_order_number} mono />
          </DetailSection>
        )}

        {/* Dispatch */}
        {hasDispatch && (
          <DetailSection title="Dispatch">
            <DetailRow label="Dispatch Ref"    value={item.dispatch_reference} mono />
            <DetailRow label="Dispatch Date"   value={formatDate(item.dispatch_date)} />
          </DetailSection>
        )}

        {/* Return */}
        {hasReturn && (
          <DetailSection title="Return">
            <DetailRow label="Return Date"     value={formatDate(item.return_date)} />
          </DetailSection>
        )}

        {/* Quarantine */}
        {item.quarantine_reason && (
          <DetailSection title="Quarantine">
            <DetailRow label="Reason"          value={item.quarantine_reason} />
          </DetailSection>
        )}

        {/* Scrap */}
        {(item.scrapped_date || item.scrapped_reason) && (
          <DetailSection title="Disposal">
            <DetailRow label="Scrapped Date"   value={formatDate(item.scrapped_date)} />
            <DetailRow label="Reason"          value={item.scrapped_reason} />
          </DetailSection>
        )}

        {/* Replacement chain */}
        {hasReplacement && (
          <DetailSection title="Replacement Chain">
            {item.replaces_serial && (
              <DetailRow label="Replaced Unit"   value={item.replaces_serial} mono />
            )}
            {item.replaced_by_serial && (
              <DetailRow label="Replacement Unit" value={item.replaced_by_serial} mono />
            )}
          </DetailSection>
        )}

        {/* Record info */}
        <DetailSection title="Record">
          <DetailRow label="Hold Reason"       value={item.hold_reason || null} />
          <DetailRow label="Record Status"     value={formatLabel(item.status)} />
          <DetailRow label="First Recorded"    value={formatDateTime(item.created_at)} />
          <DetailRow label="Last Updated"      value={formatDateTime(item.updated_at)} />
        </DetailSection>
      </div>
    </Card>
  );
}

// ── Lifecycle timeline ────────────────────────────────────────────────────────

function TimelineEvent({ event, isLast }) {
  const meta = getTimelineMeta(event.event_type);
  const parts = [];
  if (event.reference_number) parts.push(event.reference_number);
  if (event.customer_name)    parts.push(event.customer_name);
  if (event.destination_location_code) parts.push(`→ ${event.destination_location_code}`);
  if (event.source_location_code && !event.destination_location_code) {
    parts.push(`from ${event.source_location_code}`);
  }

  return (
    <div className={`timeline-event${isLast ? " timeline-event--last" : ""}`}>
      <div className={`timeline-dot tone-${meta.tone}`} aria-hidden="true" />
      <div className="timeline-content">
        <div className="timeline-header">
          <span className={`timeline-type-badge tone-${meta.tone}`}>{meta.label}</span>
          <span className="timeline-date">{formatDateTime(event.event_at)}</span>
        </div>
        {parts.length > 0 && (
          <p className="timeline-ref">{parts.join(" · ")}</p>
        )}
        {event.notes && (
          <p className="timeline-notes">{event.notes}</p>
        )}
      </div>
    </div>
  );
}

function SerialTimelineCard({ timeline }) {
  return (
    <Card
      title={`Lifecycle Timeline — ${timeline.length} event${timeline.length !== 1 ? "s" : ""}`}
      subtitle="History"
    >
      {timeline.length === 0 ? (
        <p className="tracker-state">No events recorded for this serial.</p>
      ) : (
        <div className="serial-timeline">
          {timeline.map((ev, idx) => (
            <TimelineEvent
              key={`${ev.source}-${ev.id}`}
              event={ev}
              isLast={idx === timeline.length - 1}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function SerialTrackerPage() {
  const [query, setQuery]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [result, setResult]   = useState(null);

  async function handleSearch(term) {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await apiFetch(`/serials/${encodeURIComponent(term)}`);
      setResult(data);
    } catch (err) {
      if (err.message.includes("404") || err.message.toLowerCase().includes("not found")) {
        setError(`No serial record found for "${term}".`);
      } else {
        setError(err.message || "Unable to look up serial.");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    setQuery("");
    setError(null);
    setResult(null);
  }

  const item     = result?.item;
  const timeline = result?.timeline || [];

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Inventory"
        title="Serial Tracker"
        description="Scan a barcode or enter a serial number to view full lifecycle history — from supplier receipt through allocation, dispatch, returns, and warranty events."
        help={HELP_CONTENT.serialSearch}
      />

      <GuidedHelpPanel
        intro={HELP_CONTENT.serialSearch.summary}
        steps={HELP_CONTENT.serialSearch.steps}
        warnings={HELP_CONTENT.serialSearch.warnings}
      />

      {/* Search */}
      <Card title="Serial Lookup" subtitle="Scan or Type">
        <div className="tracker-search-area">
          <ScannerInput
            value={query}
            onChange={setQuery}
            onSubmit={handleSearch}
            placeholder="Scan barcode or enter serial number…"
            autoFocus
            disabled={loading}
          />
          {(result || error) && (
            <button type="button" className="button secondary" onClick={handleClear}>
              Clear
            </button>
          )}
        </div>
        {loading && <p className="tracker-state">Looking up serial…</p>}
        {error   && <p className="tracker-state tracker-error">{error}</p>}
      </Card>

      {/* Results */}
      {item && (
        <>
          <SerialStatusCard item={item} />
          <SerialDetailCard item={item} />
          <SerialTimelineCard timeline={timeline} />
        </>
      )}
    </div>
  );
}

export default SerialTrackerPage;
