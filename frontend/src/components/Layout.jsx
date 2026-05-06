import { useRef, useState } from "react";
import { useDemo, DEMO_STEPS } from "../context/DemoContext";
import DemoBanner from "./DemoBanner";

function getInitials(name) {
  return String(name || "")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function LiveFeedTicker({ message }) {
  if (!message) return null;
  return (
    <div className="demo-live-feed" aria-live="polite" aria-label="Live activity">
      <span className="demo-live-dot" aria-hidden="true" />
      <div className="demo-live-content">
        <span className={`demo-live-user demo-live-user--${message.role}`}>{message.user}</span>
        <span className="demo-live-text">{message.text}</span>
      </div>
    </div>
  );
}

function Layout({
  navigationSections,
  activePath,
  onNavigate,
  onSearch,
  health,
  currentUser,
  onLogout,
  children,
}) {
  const backendOnline = health.status === "success";
  const timestamp = backendOnline ? health.data?.database?.database_time : null;
  const { isDemoMode, step, enterDemoMode, exitDemoMode, feedMessage } = useDemo();
  const [quickQuery, setQuickQuery] = useState("");
  const quickRef = useRef(null);
  const activeStepNavKey = isDemoMode ? DEMO_STEPS[step]?.navKey : null;

  function handleQuickKeyDown(event) {
    if (event.key === "Enter" && quickQuery.trim()) {
      onSearch(quickQuery.trim());
      setQuickQuery("");
      quickRef.current?.blur();
    }
    if (event.key === "Escape") {
      setQuickQuery("");
      quickRef.current?.blur();
    }
  }

  return (
    <div className={`app-shell${isDemoMode ? " app-shell--demo" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-section">
          <p className="eyebrow">Stock Control</p>
          <h1>Operations Workspace</h1>
          <p className="sidebar-copy">
            Authenticated purchasing, stock, and dispatch workflows with role-based access.
          </p>
        </div>

        <div className="sidebar-search">
          <span className="sidebar-search-icon" aria-hidden="true">⌕</span>
          <input
            ref={quickRef}
            type="text"
            className="sidebar-search-input"
            value={quickQuery}
            onChange={(event) => setQuickQuery(event.target.value)}
            onKeyDown={handleQuickKeyDown}
            placeholder="Quick search…"
            autoComplete="off"
            spellCheck={false}
            aria-label="Quick search"
          />
          {quickQuery ? (
            <button
              type="button"
              className="sidebar-search-clear"
              onClick={() => {
                setQuickQuery("");
                quickRef.current?.focus();
              }}
              aria-label="Clear"
            >
              ×
            </button>
          ) : null}
        </div>

        <nav className="nav-list nav-list--grouped" aria-label="Primary">
          {navigationSections.map((section) => (
            <div key={section.label} className="nav-group">
              <p className="nav-group-label">{section.label}</p>
              {section.items.map((item) => {
                const isActive = item.path === activePath;
                const isDemoTarget = isDemoMode && item.key === activeStepNavKey;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={[
                      "nav-item",
                      isActive ? "active" : "",
                      isDemoTarget ? "nav-item--demo-target" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => onNavigate(item.path)}
                  >
                    <span>
                      {isDemoTarget ? <span className="demo-nav-pulse" aria-hidden="true" /> : null}
                      {item.label}
                    </span>
                    <small>{item.description}</small>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-section sidebar-footer">
          <div className="sidebar-user sidebar-user--static">
            <div className="sidebar-user-avatar">{getInitials(currentUser.name)}</div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{currentUser.name}</span>
              <span className={`sidebar-user-role role-${currentUser.role}`}>
                {currentUser.roleLabel}
              </span>
              <span className="sidebar-user-role-label">@{currentUser.username}</span>
            </div>
            <button type="button" className="sidebar-logout-btn" onClick={onLogout}>
              Log out
            </button>
          </div>

          <div className="demo-mode-toggle">
            {isDemoMode ? (
              <button
                type="button"
                className="demo-toggle-btn demo-toggle-btn--active"
                onClick={exitDemoMode}
              >
                <span className="demo-toggle-dot" aria-hidden="true" />
                Demo Mode On
              </button>
            ) : (
              <button type="button" className="demo-toggle-btn" onClick={enterDemoMode}>
                ▶ Start Demo Mode
              </button>
            )}
          </div>

          <LiveFeedTicker message={feedMessage} />

          <div className={backendOnline ? "system-status online" : "system-status"}>
            <span className="status-dot" aria-hidden="true" />
            <div>
              <strong>{backendOnline ? "API Connected" : "API Unavailable"}</strong>
              <p>
                {backendOnline
                  ? `DB time: ${timestamp}`
                  : "Start the backend on port 3001 to load live data."}
              </p>
            </div>
          </div>
        </div>
      </aside>

      <main className="content">
        <DemoBanner />
        {children}
      </main>
    </div>
  );
}

export default Layout;
