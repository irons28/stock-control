import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import HelpPopover from "./HelpPopover";

const MARGIN = 14; // px gap from viewport edges
const GAP = 8;     // px gap between button and popover

function PageHelpButton({ title, help }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const popoverRef = useRef(null);

  // Viewport-safe position state — start off-screen hidden
  const [style, setStyle] = useState({
    position: "fixed",
    top: -9999,
    left: -9999,
    visibility: "hidden",
    zIndex: 1200,
  });

  // Measure + position popover after it mounts / on scroll / resize
  useLayoutEffect(() => {
    if (!open) return;

    function measure() {
      const button = buttonRef.current;
      const popover = popoverRef.current;
      if (!button) return;

      const rect = button.getBoundingClientRect();
      const pw = popover ? popover.offsetWidth : 340;
      const ph = popover ? popover.offsetHeight : 300;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Default: right-aligned to button, below button
      let left = rect.right - pw;
      let top = rect.bottom + GAP;

      // Flip above if overflows bottom
      if (top + ph > vh - MARGIN) {
        top = rect.top - ph - GAP;
      }
      // Clamp top
      if (top < MARGIN) top = MARGIN;

      // Clamp right → shift left
      if (left + pw > vw - MARGIN) {
        left = vw - MARGIN - pw;
      }
      // Clamp left
      if (left < MARGIN) left = MARGIN;

      setStyle({ position: "fixed", top, left, visibility: "visible", zIndex: 1200 });
    }

    // Reset to hidden so popover renders once before measuring
    setStyle({ position: "fixed", top: -9999, left: -9999, visibility: "hidden", zIndex: 1200 });
    // Use rAF to allow the portal to paint before we measure
    const frame = requestAnimationFrame(measure);

    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event) {
      const clickedButton = buttonRef.current && buttonRef.current.contains(event.target);
      const clickedPopover = popoverRef.current && popoverRef.current.contains(event.target);
      if (!clickedButton && !clickedPopover) {
        setOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div className="page-help-button-wrap">
      <button
        ref={buttonRef}
        type="button"
        className="page-help-button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={`Help for ${title}`}
      >
        ?
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <HelpPopover
              ref={popoverRef}
              title={help.title || title}
              summary={help.summary}
              steps={help.steps}
              warnings={help.warnings}
              onClose={() => setOpen(false)}
              style={style}
            />,
            document.body
          )
        : null}
    </div>
  );
}

export default PageHelpButton;
