import { cloneElement, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MARGIN = 14; // px gap from viewport edges
const GAP = 8;     // px gap between anchor and tooltip

/**
 * TooltipBubble — portal-rendered tooltip with viewport-safe positioning.
 *
 * Two-pass approach:
 *   1. Render off-screen (visibility:hidden) so the browser can calculate
 *      the tooltip's real offsetWidth / offsetHeight.
 *   2. useLayoutEffect measures anchor + tooltip, computes a position that
 *      stays inside the viewport, then makes the tooltip visible.
 *
 * Repositions on scroll and resize.
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
      // Use real measured dimensions; fall back only if somehow zero
      const tw = tooltip.offsetWidth || 300;
      const th = tooltip.offsetHeight || 60;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Default: below anchor, left-aligned
      let top = ar.bottom + GAP;
      let left = ar.left;

      // Flip above if overflows bottom
      if (top + th > vh - MARGIN) {
        top = ar.top - th - GAP;
      }
      // If flipping above still clips (very tall tooltip / near top), clamp
      if (top < MARGIN) top = MARGIN;

      // Clamp right
      if (left + tw > vw - MARGIN) left = vw - MARGIN - tw;
      // Clamp left
      if (left < MARGIN) left = MARGIN;

      setStyle({ position: "fixed", top, left, visibility: "visible", zIndex: 1200 });
    }

    // Reset to hidden so we measure the tooltip at its natural size,
    // not at whatever position it was left at.
    setStyle({ position: "fixed", top: -9999, left: -9999, visibility: "hidden", zIndex: 1200 });

    // Use rAF so the hidden render completes before we measure.
    const frame = requestAnimationFrame(measure);

    window.addEventListener("scroll", measure, { capture: true, passive: true });
    window.addEventListener("resize", measure, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", measure);
    };
  // anchorRef is stable — this effect runs once per TooltipBubble mount
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
 * FieldHelp
 *
 * Wraps a form field with a label whose text IS the help trigger.
 * No "?" icon — the label word(s) get a dotted underline and accent hover.
 *
 * Interactions that open the tooltip:
 *   • Hover anywhere on the <label>
 *   • Focus the label-text button (keyboard Tab)
 *   • Focus the child input (keyboard Tab)
 *   • Touch / click the label text
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

  // Inject focus/blur into the child input so tooltip follows keyboard focus
  const child = children
    ? cloneElement(children, {
        "aria-describedby": open ? tooltipId : children.props["aria-describedby"],
        onFocus: mergeHandlers(children.props.onFocus, () => setOpen(true)),
        onBlur: mergeHandlers(children.props.onBlur, () => setOpen(false)),
      })
    : null;

  return (
    <label
      className={className}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span className={`${labelClassName} field-help-label`}>
        {/* Label text is the trigger — styled with dotted underline */}
        <button
          ref={labelTextRef}
          type="button"
          className="help-tooltip-trigger--field"
          aria-expanded={open}
          aria-describedby={open ? tooltipId : undefined}
          onClick={(e) => {
            e.preventDefault();
            setOpen((v) => !v);
          }}
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
