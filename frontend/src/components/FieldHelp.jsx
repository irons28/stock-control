import { cloneElement, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MARGIN = 14; // px gap from viewport edges
const GAP = 10;    // px gap between anchor and tooltip

function TooltipBubble({ anchorRef, text, id }) {
  const tooltipRef = useRef(null);
  // Start invisible so we can measure before showing
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
      if (!anchor) return;

      const anchorRect = anchor.getBoundingClientRect();
      const tw = tooltip ? tooltip.offsetWidth : 300;
      const th = tooltip ? tooltip.offsetHeight : 80;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Start: below anchor, left-aligned to anchor
      let top = anchorRect.bottom + GAP;
      let left = anchorRect.left;

      // Flip above if overflows bottom
      if (top + th > vh - MARGIN) {
        top = anchorRect.top - th - GAP;
      }
      // Clamp top
      if (top < MARGIN) top = MARGIN;

      // Clamp right → shift left
      if (left + tw > vw - MARGIN) {
        left = vw - MARGIN - tw;
      }
      // Clamp left
      if (left < MARGIN) left = MARGIN;

      setStyle({ position: "fixed", top, left, visibility: "visible", zIndex: 1200 });
    }

    measure(); // measure after initial hidden render
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [anchorRef]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div id={id} ref={tooltipRef} className="help-tooltip help-tooltip--portal" style={style} role="tooltip">
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
 * Wraps a form field with a label whose text is itself the help trigger.
 * No "?" icon — the label word(s) get a dotted underline and accent hover.
 * Hovering the label, focusing the label text, or focusing the child input
 * all open the tooltip.
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
  const wrapperRef = useRef(null);
  const [open, setOpen] = useState(false);

  // Inject focus/blur into the child input so tooltip opens when input is focused
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
      ref={wrapperRef}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span className={`${labelClassName} field-help-label`}>
        {/* The label text IS the trigger — styled as underlined text, no circle */}
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
        ? <TooltipBubble anchorRef={labelTextRef.current ? labelTextRef : wrapperRef} text={help} id={tooltipId} />
        : null}
    </label>
  );
}

export default FieldHelp;
