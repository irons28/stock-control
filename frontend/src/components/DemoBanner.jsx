import { useDemo } from "../context/DemoContext";

export default function DemoBanner({ onResetClick }) {
  const { isDemoMode, step, totalSteps, resetting, resetDemoData, exitDemoMode } = useDemo();

  if (!isDemoMode) return null;

  return (
    <div className="demo-banner" role="banner" aria-label="Demo mode active">
      <div className="demo-banner-left">
        <span className="demo-banner-badge">DEMO MODE</span>
        <span className="demo-banner-text">
          Presentation data active — step {step + 1}/{totalSteps}
        </span>
      </div>
      <div className="demo-banner-actions">
        <button
          type="button"
          className="demo-banner-btn"
          onClick={resetDemoData}
          disabled={resetting}
          title="Wipe and rebuild demo data"
        >
          {resetting ? "Resetting…" : "↺ Reset Demo Data"}
        </button>
        <button
          type="button"
          className="demo-banner-btn demo-banner-btn--exit"
          onClick={exitDemoMode}
          title="Exit demo mode"
        >
          Exit Demo
        </button>
      </div>
    </div>
  );
}
