import { useEffect, useRef } from "react";

function HelpPopover({ title, summary, steps = [], warnings = [], onClose }) {
  const panelRef = useRef(null);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        onClose();
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <div className="help-popover" ref={panelRef} role="dialog" aria-modal="false">
      <div className="help-popover-header">
        <div>
          <p className="eyebrow">Workflow Help</p>
          <h3>{title}</h3>
        </div>
        <button type="button" className="help-close" onClick={onClose} aria-label="Close help">
          ×
        </button>
      </div>
      {summary ? <p className="help-summary">{summary}</p> : null}
      {steps.length ? (
        <div className="help-section">
          <strong>Suggested steps</strong>
          <ol className="help-list">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}
      {warnings.length ? (
        <div className="help-section help-section--warning">
          <strong>Watch out for</strong>
          <ul className="help-list">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default HelpPopover;
