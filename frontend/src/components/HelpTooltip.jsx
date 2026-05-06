import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const PAD = 16; // minimum gap from every viewport edge
const GAP = 8;  // gap between trigger and tooltip

/**
 * HelpTooltip — viewport-safe portal tooltip.
 *
 * Two modes:
 *   Page / icon mode  (no children) — circular "?" button.
 *   Field / text mode (children)   — label text is the trigger; no circle.
 *
 * Positioning algorithm (runs in useLayoutEffect, directly after DOM commit):
 *   1. Calculate preferred position based on trigger rect + align prop.
 *   2. Flip above trigger if preferred position overflows bottom edge.
 *   3. Apply explicit final clamp so no edge of the tooltip ever escapes
 *      the viewport (minimum PAD px from every side).
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
      // offsetWidth/Height are accurate for position:fixed elements even when
      // rendered off-screen with visibility:hidden.
      const tw = Math.max(tooltip.offsetWidth, 1);
      const th = Math.max(tooltip.offsetHeight, 1);
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // ── Step 1: preferred horizontal position ──────────────────────────────
      let preferredLeft;
      if (align === "right")      preferredLeft = rect.right - tw;
      else if (align === "left")  preferredLeft = rect.left;
      else                        preferredLeft = rect.left + rect.width / 2 - tw / 2; // centre

      // ── Step 2: preferred vertical — below trigger, flip if it clips bottom ─
      let preferredTop = rect.bottom + GAP;
      if (preferredTop + th > vh - PAD) {
        preferredTop = rect.top - th - GAP;
      }

      // ── Step 3: explicit final clamp ───────────────────────────────────────
      // Ensures the tooltip never escapes any viewport edge regardless of
      // trigger position, tooltip width, or viewport size.
      const maxLeft = Math.max(PAD, vw - tw - PAD);
      const maxTop  = Math.max(PAD, vh - th - PAD);

      let left = Math.min(Math.max(preferredLeft, PAD), maxLeft);
      let top  = Math.min(Math.max(preferredTop,  PAD), maxTop);

      setStyle({ position: "fixed", top, left, visibility: "visible", zIndex: 1200 });

      // ── Second-pass correction ─────────────────────────────────────────────
      // After the first setStyle, CSS rules (e.g. transforms on the base
      // .help-tooltip class) may still shift the rendered element. Read the
      // actual bounding rect after paint and nudge if any edge escapes.
      requestAnimationFrame(() => {
        const el = tooltipRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        let dl = 0, dt = 0;
        if (r.left < PAD)          dl = PAD - r.left;
        else if (r.right > vw - PAD) dl = (vw - PAD) - r.right;
        if (r.top  < PAD)          dt = PAD - r.top;
        else if (r.bottom > vh - PAD) dt = (vh - PAD) - r.bottom;
        if (dl || dt) {
          setStyle((prev) => ({ ...prev, left: prev.left + dl, top: prev.top + dt }));
        }
      });
    }

    // Call measure directly — useLayoutEffect runs after the DOM commit, so
    // tooltipRef.current is already set and offsetWidth/Height are readable.
    measure();

    window.addEventListener("scroll", measure, { capture: true, passive: true });
    window.addEventListener("resize", measure, { passive: true });
    return () => {
      window.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", measure);
    };
  }, [open, align]);

  // Close on outside click and Escape
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e) {
      if (triggerRef.current && !triggerRef.current.contains(e.target)) setOpen(false);
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
        onClick={(e) => { e.preventDefault(); setOpen((v) => !v); }}
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
