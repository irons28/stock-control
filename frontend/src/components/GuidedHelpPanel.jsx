import { useState } from "react";

function GuidedHelpPanel({
  title = "Help me through this",
  intro,
  steps = [],
  warnings = [],
  initialOpen = false,
}) {
  const [open, setOpen] = useState(initialOpen);

  return (
    <section className="guided-help-panel">
      <div className="guided-help-header">
        <div>
          <p className="eyebrow">Guided Help</p>
          <h3>{title}</h3>
        </div>
        <button
          type="button"
          className="guided-help-toggle"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          {open ? "Hide guide" : "Help me through this"}
        </button>
      </div>
      {open ? (
        <>
          {intro ? <p className="guided-help-intro">{intro}</p> : null}
          {steps.length ? (
            <ol className="guided-help-list">
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          ) : null}
          {warnings.length ? (
            <div className="guided-help-warnings">
              {warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export default GuidedHelpPanel;
