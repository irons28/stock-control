import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MARGIN = 14;
const GAP = 8;

/**
 * HelpTooltip
 *
 * Two modes:
 *   Page / icon mode  (no children) — renders a circular "?" button.
 *     Use next to page titles or section headings.
 *
 *   Field / text mode  (children provided) — renders the children as a
 *     styled text trigger (dotted underline, accent hover, cursor:help).
 *     No circle, no "?" icon.  Use in table headers and beside field labels.
 *
 * Tooltip is portal-rendered to document.body with position:fixed and
 * viewport-safe placement (flip above/below, clamp left/right).
 */
function HelpTooltip({ text, label = "Help", className = "", align = "center", children }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const tooltipId = useId();

  const isFieldMode = Boolean(children);

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
      if (!trigger || !tooltip) return;

      const rect = trigger.getBoundingClientRect();
      const tw = tooltip.offsetWidth || 300;
      const th = tooltip.offsetHeight || 60;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Initial horizontal position based on align prop
      let left;
      if (align === "right")      left = rect.right - tw;
      else if (align === "left")  left = rect.left;
      else                        left = rect.left + rect.width / 2 - tw / 2;

      // Start below trigger
      let top = rect.bottom + GAP;

      // Flip above if overflows bottom
      if (top + th > vh - MARGIN) top = rect.top - th - GAP;
      // If still clips top, clamp
      if (top < MARGIN) top = MARGIN;

      // Clamp right then left
      if (left + tw > vw - MARGIN) left = vw - MARGIN - tw;
      if (left < MARGIN)           left = MARGIN;

      setStyle({ position: "fixed", top, left, visibility: "visible", zIndex: 1200 });
    }

    // Reset to hidden so we measure at natural size, not stale position
    setStyle({ position: "fixed", top: -9999, left: -9999, visibility: "hidden", zIndex: 1200 });

    // rAF lets the hidden render commit before we measure
    const frame = requestAnimationFrame(measure);

    window.addEventListener("scroll", measure, { capture: true, passive: true });
    window.addEventListener("resize", measure, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", measure);
    };
  }, [open, align]);

  // Close on outside click and Escape
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
        className={isFieldMode ? "help-tooltip-trigger--field" : "help-tooltip-trigger"}
        aria-label={isFieldMode ? undefined : label}
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
        {children ?? "?"}
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
