import { useState } from "react";

function HelpTooltip({ text, label = "Help" }) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="help-tooltip-wrap"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <button type="button" className="help-tooltip-trigger" aria-label={label}>
        ?
      </button>
      {open ? <span className="help-tooltip">{text}</span> : null}
    </span>
  );
}

export default HelpTooltip;
