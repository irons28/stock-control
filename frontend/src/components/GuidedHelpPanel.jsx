function GuidedHelpPanel({ title = "Help me through this", intro, steps = [], warnings = [] }) {
  return (
    <section className="guided-help-panel">
      <div className="guided-help-header">
        <div>
          <p className="eyebrow">Guided Help</p>
          <h3>{title}</h3>
        </div>
      </div>
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
    </section>
  );
}

export default GuidedHelpPanel;
