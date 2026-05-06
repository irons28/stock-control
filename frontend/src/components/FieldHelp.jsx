import { cloneElement, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const PAD = 16; // minimum gap from every viewport edge
const GAP = 8;  // gap between anchor and tooltip

/**
 * TooltipBubble — portal-rendered, viewport-safe tooltip.
 *
 * Mounts only when open=true, so the deps array is empty (effect runs once on
 * mount). Scroll and resize listeners reposition the tooltip on the fly.
 *
 * Positioning:
 *   Preferred: below anchor, left-aligned to anchor.
 *   Flip:      above anchor when preferred position would overflow the bottom.
 *   Clamp:     explicit final clamp so no edge escapes the viewport.
 */
function TooltipBubble({ anchorRef, text, id }) {
  const tooltipRef = useRef(null);

  const [style, setStyle] = useState({
    position: "fixed",
    top: -9999,
    left: -9999,
    visibility: "hidden",
    zIndex: 1200,
  });

  useLayoutEffect(() => {
    function measure() {
      const anchor = anchorRef.current;
      const tooltip = tooltipRef.current;
      if (!anchor || !tooltip) return;

      const ar = anchor.getBoundingClientRect();
      const tw = Math.max(tooltip.offsetWidth, 1);
      const th = Math.max(tooltip.offsetHeight, 1);
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // ── Step 1: preferred position — below anchor, left-aligned ───────────
      let preferredTop  = ar.bottom + GAP;
      let preferredLeft = ar.left;

      // ── Step 2: flip above if preferred position clips bottom ──────────────
      if (preferredTop + th > vh - PAD) {
        preferredTop = ar.top - th - GAP;
      }

      // ── Step 3: explicit final clamp ───────────────────────────────────────
      const maxLeft = Math.max(PAD, vw - tw - PAD);
      const maxTop  = Math.max(PAD, vh - th - PAD);

      const left = Math.min(Math.max(preferredLeft, PAD), maxLeft);
      const top  = Math.min(Math.max(preferredTop,  PAD), maxTop);

      setStyle({ position: "fixed", top, left, visibility: "visible", zIndex: 1200 });
    }

    measure();

    window.addEventListener("scroll", measure, { capture: true, passive: true });
    window.addEventListener("resize", measure, { passive: true });
    return () => {
      window.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", measure);
    };
  // Empty deps: this component only mounts when open=true; no re-runs needed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      id={id}
      ref={tooltipRef}
      className="help-tooltip help-tooltip--portal"
      style={style}
      role="tooltip"
    >
      {text}
    </div>,
    document.body
  );
}

function mergeHandlers(original, injected) {
  return (...args) => {
    if (typeof original === "function") original(...args);
    injected(...args);
  };
}

/**
 * FieldHelp — wraps a form field; the label word IS the tooltip trigger.
 * No "?" icon, no circle. Hover / focus / tap the label text to see help.
 */
function FieldHelp({
  label,
  help,
  children,
  required = false,
  className = "",
  labelClassName = "master-data-field-label",
}) {
  const tooltipId = useId();
  const labelTextRef = useRef(null);
  const [open, setOpen] = useState(false);

  const child = children
    ? cloneElement(children, {
        "aria-describedby": open ? tooltipId : children.props["aria-describedby"],
        onFocus: mergeHandlers(children.props.onFocus, () => setOpen(true)),
        onBlur:  mergeHandlers(children.props.onBlur,  () => setOpen(false)),
      })
    : null;

  return (
    <label
      className={className}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span className={`${labelClassName} field-help-label`}>
        <button
          ref={labelTextRef}
          type="button"
          className="help-tooltip-trigger--field"
          aria-expanded={open}
          aria-describedby={open ? tooltipId : undefined}
          onClick={(e) => { e.preventDefault(); setOpen((v) => !v); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
        >
          {label}
        </button>
        {required ? <span className="master-data-required">*</span> : null}
      </span>

      {child}

      {open
        ? <TooltipBubble anchorRef={labelTextRef} text={help} id={tooltipId} />
        : null}
    </label>
  );
}

export default FieldHelp;
