import { formatLabel, getStatusVariant } from "../lib/formatters";

function StatusPill({ value, subtle = false }) {
  const variant = getStatusVariant(value);
  const classes = ["pill", variant, subtle ? "subtle" : ""].filter(Boolean).join(" ");
  return <span className={classes}>{formatLabel(value)}</span>;
}

export default StatusPill;
