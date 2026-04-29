export function formatDate(value) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

export function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export function formatCurrency(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "—";
  }

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amount);
}

export function formatNumber(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "—";
  }

  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatLabel(value) {
  if (!value) {
    return "—";
  }

  return String(value)
    .split(/[_-]/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

// Maps a status string to a semantic pill variant class name.
// Used by StatusPill to apply the correct colour without duplicating logic.
export function getStatusVariant(status) {
  switch (String(status || "").toLowerCase()) {
    case "active":
    case "received":
    case "available":
    case "completed":
      return "positive";
    case "dispatched":
    case "ordered":
    case "confirmed":
    case "allocated":
    case "partial":
    case "warranty_replacement":
      return "info";
    case "cancelled":
    case "inactive":
    case "scrapped":
      return "negative";
    case "returned":
    case "pending_allocation":
      return "warning";
    case "quarantined":
      return "danger";
    default:
      return "neutral";
  }
}
