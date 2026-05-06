import { useRef, useState } from "react";
import { useDemo } from "../context/DemoContext";
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
  topTabs,
  activeTopTab,
  subnavItems,
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
  const { isDemoMode, enterDemoMode, exitDemoMode, feedMessage } = useDemo();
  const [quickQuery, setQuickQuery] = useState("");
  const quickRef = useRef(null);

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
    <div className={`app-shell app-shell--topnav${isDemoMode ? " app-shell--demo" : ""}`}>
      <header className="app-topbar">
        <div className="app-topbar-brand">
          <img
            className="app-brand-logo"
            src="/swan-logo.png"
            alt="Swan brand artwork"
          />

          <div className="app-topbar-brand-copy">
            <p className="eyebrow">Stock Control</p>
            <h1>Operations Workspace</h1>
            <p className="app-topbar-copy">
              Purchasing, stock, dispatch, and admin workflows with role-based access.
            </p>
          </div>
        </div>

        <div className="app-topbar-tools">
          <div className="topbar-search">
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
          </div>

          <div className="topbar-user-card">
            <div className="sidebar-user-avatar">{getInitials(currentUser.name)}</div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{currentUser.name}</span>
              <span className={`sidebar-user-role role-${currentUser.role}`}>
                {currentUser.roleLabel}
              </span>
            </div>
            <button type="button" className="sidebar-logout-btn" onClick={onLogout}>
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="app-navigation-shell">
        <nav className="top-tabs" aria-label="Primary sections">
          {topTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`top-tab${tab.key === activeTopTab ? " active" : ""}`}
              onClick={() => onNavigate(tab.items[0].path)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {subnavItems.length > 0 ? (
          <nav className="sub-tabs" aria-label="Section pages">
            {subnavItems.map((item) => (
              <button
                key={item.path}
                type="button"
                className={`sub-tab${item.path === activePath ? " active" : ""}`}
                onClick={() => onNavigate(item.path)}
                title={item.description}
              >
                {item.label}
              </button>
            ))}
          </nav>
        ) : null}
      </div>

      <div className="app-utility-row">
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

      <main className="content content--topnav">
        <DemoBanner />
        {children}
      </main>
    </div>
  );
}

export default Layout;
