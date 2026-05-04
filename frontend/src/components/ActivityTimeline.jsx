import { formatDateTime, formatLabel } from "../lib/formatters";

// Visual config per action_type
const EVENT_CONFIG = {
  purchase_order_created:  { tone: "created",    label: "Created" },
  sales_order_created:     { tone: "created",    label: "Created" },
  received_goods:          { tone: "received",   label: "Received" },
  created:                 { tone: "received",   label: "Received" },
  serial_allocated:        { tone: "allocated",  label: "Allocated" },
  quantity_allocated:      { tone: "allocated",  label: "Allocated" },
  dispatched:              { tone: "dispatched", label: "Dispatched" },
  returned:                { tone: "returned",   label: "Returned" },
  quarantined:             { tone: "returned",   label: "Quarantined" },
  supplier_created:        { tone: "admin",      label: "Supplier Created" },
  supplier_updated:        { tone: "admin",      label: "Supplier Updated" },
  product_created:         { tone: "admin",      label: "Product Created" },
  product_updated:         { tone: "admin",      label: "Product Updated" },
  csv_import:              { tone: "admin",      label: "Import" },
};

function getConfig(actionType) {
  return EVENT_CONFIG[actionType] || { tone: "default", label: formatLabel(actionType) };
}

function TimelineEvent({ event }) {
  const cfg = getConfig(event.action_type);
  let details = null;
  try {
    details = event.details_json ? JSON.parse(event.details_json) : null;
  } catch {
    details = null;
  }

  return (
    <div className={`tl-event tl-event--${cfg.tone}`}>
      <div className="tl-dot" aria-hidden="true" />
      <div className="tl-body">
        <div className="tl-header">
          <span className={`tl-badge tl-badge--${cfg.tone}`}>{cfg.label}</span>
          <span className="tl-user">
            {event.user_name && event.user_name !== "System" ? event.user_name : "System"}
          </span>
          <time className="tl-time" dateTime={event.created_at}>
            {formatDateTime(event.created_at)}
          </time>
        </div>
        {event.summary && <p className="tl-summary">{event.summary}</p>}
        {details && <TimelineDetails details={details} actionType={event.action_type} />}
      </div>
    </div>
  );
}

function TimelineDetails({ details, actionType }) {
  const entries = [];

  if (actionType === "received_goods" || actionType === "created") {
    if (details.deliveryNumber) entries.push(["Delivery ref", details.deliveryNumber]);
    if (details.receivedBy)     entries.push(["Received by", details.receivedBy]);
    if (details.lineCount)      entries.push(["Lines", details.lineCount]);
  } else if (actionType === "serial_allocated") {
    if (details.serialNumber)   entries.push(["Serial", details.serialNumber]);
    if (details.customerName)   entries.push(["Customer", details.customerName]);
  } else if (actionType === "quantity_allocated") {
    if (details.allocatedQuantity !== undefined) entries.push(["Qty", details.allocatedQuantity]);
    if (details.customerName)   entries.push(["Customer", details.customerName]);
  } else if (actionType === "dispatched") {
    if (details.dispatchReference) entries.push(["Reference", details.dispatchReference]);
    if (details.dispatchedBy)      entries.push(["Dispatched by", details.dispatchedBy]);
    if (details.serialNumber)      entries.push(["Serial", details.serialNumber]);
    if (details.quantityDispatched !== undefined) entries.push(["Qty", details.quantityDispatched]);
  } else if (actionType === "purchase_order_created") {
    if (details.supplierName)  entries.push(["Supplier", details.supplierName]);
    if (details.lineCount)     entries.push(["Lines", details.lineCount]);
  } else if (actionType === "sales_order_created") {
    if (details.customerName)  entries.push(["Customer", details.customerName]);
    if (details.lineCount)     entries.push(["Lines", details.lineCount]);
  }

  if (!entries.length) return null;

  return (
    <dl className="tl-details">
      {entries.map(([k, v]) => (
        <div key={k} className="tl-detail-pair">
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function ActivityTimeline({ events, loading, error, emptyMessage }) {
  if (loading) {
    return <div className="tl-state">Loading timeline…</div>;
  }
  if (error) {
    return <div className="tl-state tl-state--error">{error}</div>;
  }
  if (!events || !events.length) {
    return <div className="tl-state tl-state--empty">{emptyMessage || "No activity recorded yet."}</div>;
  }

  return (
    <div className="tl-root">
      {events.map((event) => (
        <TimelineEvent key={event.id} event={event} />
      ))}
    </div>
  );
}
