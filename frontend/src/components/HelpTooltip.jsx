import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function HelpTooltip({ text, label = "Help", className = "", align = "center" }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const tooltipId = useId();
  const [style, setStyle] = useState(null);

  useLayoutEffect(() => {
    if (!open) return undefined;

    function updatePosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const left =
        align === "right"
          ? rect.right
          : align === "left"
          ? rect.left
          : rect.left + rect.width / 2;

      setStyle({
        position: "fixed",
        top: rect.bottom + 10,
        left,
        transform:
          align === "right"
            ? "translateX(-100%)"
            : align === "left"
            ? "translateX(0)"
            : "translateX(-50%)",
        zIndex: 1000,
      });
    }

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [align, open]);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (triggerRef.current && !triggerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setOpen(false);
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
        onClick={(event) => {
          event.preventDefault();
          setOpen((value) => !value);
        }}
      >
        ?
      </button>
      {open && style && typeof document !== "undefined"
        ? createPortal(
            <div
              id={tooltipId}
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
