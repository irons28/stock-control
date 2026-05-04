import { useDemo, DEMO_STEPS } from "../context/DemoContext";

export default function DemoWalkthrough() {
  const {
    isDemoMode, step, totalSteps, currentStep,
    nextStep, prevStep, goToStep,
    resetting, resetError, resetDemoData, exitDemoMode,
  } = useDemo();

  if (!isDemoMode) return null;

  const isFirst = step === 0;
  const isLast  = step === totalSteps - 1;

  return (
    <div className="demo-walkthrough" role="complementary" aria-label="Demo walkthrough">
      {/* Header */}
      <div className="demo-wt-header">
        <span className="demo-wt-badge">DEMO</span>
        <span className="demo-wt-counter">Step {step + 1} of {totalSteps}</span>
        <button
          type="button"
          className="demo-wt-exit"
          onClick={exitDemoMode}
          title="Exit demo mode"
          aria-label="Exit demo mode"
        >
          ✕
        </button>
      </div>

      {/* Step content */}
      <div className="demo-wt-body">
        <div className="demo-wt-icon" aria-hidden="true">{currentStep.icon}</div>
        <h3 className="demo-wt-title">{currentStep.title}</h3>
        <p className="demo-wt-description">{currentStep.description}</p>
        <div className="demo-wt-action">
          <span className="demo-wt-action-label">▶ Next</span>
          <span>{currentStep.action}</span>
        </div>
      </div>

      {/* Step dots */}
      <div className="demo-wt-dots" role="tablist" aria-label="Steps">
        {DEMO_STEPS.map((s, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === step}
            className={`demo-wt-dot ${i === step ? "demo-wt-dot--active" : ""} ${i < step ? "demo-wt-dot--done" : ""}`}
            onClick={() => goToStep(i)}
            title={s.title}
          />
        ))}
      </div>

      {/* Navigation */}
      <div className="demo-wt-nav">
        <button
          type="button"
          className="demo-wt-btn demo-wt-btn--secondary"
          onClick={prevStep}
          disabled={isFirst}
        >
          ← Back
        </button>

        {isLast ? (
          <button
            type="button"
            className="demo-wt-btn demo-wt-btn--reset"
            onClick={resetDemoData}
            disabled={resetting}
          >
            {resetting ? "Resetting…" : "↺ Reset Data"}
          </button>
        ) : (
          <button
            type="button"
            className="demo-wt-btn demo-wt-btn--primary"
            onClick={nextStep}
          >
            Next →
          </button>
        )}
      </div>

      {resetError && (
        <p className="demo-wt-error">{resetError}</p>
      )}
    </div>
  );
}
