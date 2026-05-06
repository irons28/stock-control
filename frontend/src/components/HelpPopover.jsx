import { forwardRef } from "react";

const HelpPopover = forwardRef(function HelpPopover(
  { title, summary, steps = [], warnings = [], onClose, style },
  ref
) {
  return (
    <div
      className="help-popover help-popover--portal"
      ref={ref}
      style={style}
      role="dialog"
      aria-modal="false"
    >
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
});

export default HelpPopover;
