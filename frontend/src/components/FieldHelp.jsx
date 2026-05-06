import { cloneElement, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function TooltipBubble({ anchorRef, text, id, align = "left" }) {
  const [style, setStyle] = useState(null);

  useLayoutEffect(() => {
    function updatePosition() {
      const anchor = anchorRef.current;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const left =
        align === "right"
          ? rect.right
          : align === "center"
          ? rect.left + rect.width / 2
          : rect.left;

      setStyle({
        position: "fixed",
        top: rect.bottom + 10,
        left,
        transform:
          align === "right"
            ? "translateX(-100%)"
            : align === "center"
            ? "translateX(-50%)"
            : "translateX(0)",
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
  }, [align, anchorRef]);

  if (!style || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div id={id} className="help-tooltip help-tooltip--portal" style={style} role="tooltip">
      {text}
    </div>,
    document.body
  );
}

function mergeHandlers(original, injected) {
  return (...args) => {
    if (typeof original === "function") {
      original(...args);
    }
    injected(...args);
  };
}

function FieldHelp({
  label,
  help,
  children,
  required = false,
  className = "",
  labelClassName = "master-data-field-label",
  align = "left",
}) {
  const tooltipId = useId();
  const wrapperRef = useRef(null);
  const iconRef = useRef(null);
  const [open, setOpen] = useState(false);

  // Only wire up focus/blur on the child input — hover is managed by the
  // label wrapper's onMouseEnter/Leave so moving within the label doesn't
  // prematurely close the tooltip.
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
        {label}
        {required ? <span className="master-data-required">*</span> : null}
        <button
          ref={iconRef}
          type="button"
          className="help-tooltip-trigger"
          aria-label={`Help for ${label}`}
          aria-describedby={open ? tooltipId : undefined}
          aria-expanded={open}
          onClick={(event) => {
            event.preventDefault();
            setOpen((value) => !value);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
        >
          ?
        </button>
      </span>
      {child}
      {open ? (
        <TooltipBubble anchorRef={iconRef.current ? iconRef : wrapperRef} text={help} id={tooltipId} align={align} />
      ) : null}
    </label>
  );
}

export default FieldHelp;
