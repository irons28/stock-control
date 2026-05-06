import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MARGIN = 14;
const GAP = 10;

function HelpTooltip({ text, label = "Help", className = "", align = "center" }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const tooltipId = useId();

  // Start off-screen hidden so we can measure before revealing
  const [style, setStyle] = useState({
    position: "fixed",
    top: -9999,
    left: -9999,
    visibility: "hidden",
    zIndex: 1200,
  });

  useLayoutEffect(() => {
    if (!open) return;

    function measure() {
      const trigger = triggerRef.current;
      const tooltip = tooltipRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const tw = tooltip ? tooltip.offsetWidth : 300;
      const th = tooltip ? tooltip.offsetHeight : 80;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Initial horizontal position based on align prop
      let left;
      if (align === "right") left = rect.right - tw;
      else if (align === "left") left = rect.left;
      else left = rect.left + rect.width / 2 - tw / 2; // center

      // Start below trigger
      let top = rect.bottom + GAP;

      // Flip above if overflows bottom
      if (top + th > vh - MARGIN) {
        top = rect.top - th - GAP;
      }
      if (top < MARGIN) top = MARGIN;

      // Clamp horizontal
      if (left + tw > vw - MARGIN) left = vw - MARGIN - tw;
      if (left < MARGIN) left = MARGIN;

      setStyle({ position: "fixed", top, left, visibility: "visible", zIndex: 1200 });
    }

    // Reset to hidden so tooltip renders once before measuring
    setStyle({ position: "fixed", top: -9999, left: -9999, visibility: "hidden", zIndex: 1200 });
    measure();

    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, align]);

  // Close on click-outside and Escape
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e) {
      if (triggerRef.current && !triggerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function handleEscape(e) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <span className={`help-tooltip-wrap ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        className="help-tooltip-trigger"
        aria-label={label}
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
      >
        ?
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              id={tooltipId}
              ref={tooltipRef}
              className="help-tooltip help-tooltip--portal"
              style={style}
              role="tooltip"
            >
              {text}
            </div>,
            document.body
          )
        : null}
    </span>
  );
}

export default HelpTooltip;
