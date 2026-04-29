import { useRef, useState } from "react";
import { useUser } from "../context/UserContext";

function Layout({ navigationItems, activePath, onNavigate, onSearch, health, children }) {
  const backendOnline = health.status === "success";
  const timestamp = backendOnline ? health.data?.database?.database_time : null;
  const { currentUser, users, switchUser } = useUser();

  const [quickQuery, setQuickQuery] = useState("");
  const quickRef = useRef(null);

  function handleQuickKeyDown(e) {
    if (e.key === "Enter" && quickQuery.trim()) {
      onSearch(quickQuery.trim());
      setQuickQuery("");
      quickRef.current?.blur();
    }
    if (e.key === "Escape") {
      setQuickQuery("");
      quickRef.current?.blur();
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-section">
          <p className="eyebrow">Stock Control</p>
          <h1>Operations</h1>
          <p className="sidebar-copy">
            Purchasing, stock handling, and sales order fulfilment.
          </p>
        </div>

        {/* Quick search */}
        <div className="sidebar-search">
          <span className="sidebar-search-icon" aria-hidden="true">⌕</span>
          <input
            ref={quickRef}
            type="text"
            className="sidebar-search-input"
            value={quickQuery}
            onChange={(e) => setQuickQuery(e.target.value)}
            onKeyDown={handleQuickKeyDown}
            placeholder="Quick search…"
            autoComplete="off"
            spellCheck={false}
            aria-label="Quick search — press Enter to search"
          />
          {quickQuery && (
            <button
              type="button"
              className="sidebar-search-clear"
              onClick={() => { setQuickQuery(""); quickRef.current?.focus(); }}
              aria-label="Clear"
            >
              ×
            </button>
          )}
        </div>

        <nav className="nav-list" aria-label="Primary">
          {navigationItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={item.path === activePath ? "nav-item active" : "nav-item"}
              onClick={() => onNavigate(item.path)}
            >
              <span>{item.label}</span>
              <small>{item.description}</small>
            </button>
          ))}
        </nav>

        <div className="sidebar-user">
          <div className="sidebar-user-info">
            <span className="sidebar-user-name">{currentUser.full_name}</span>
            <span className={`role-pill role-pill--${currentUser.role}`}>{currentUser.role}</span>
          </div>
          <select
            className="role-switcher-select"
            value={currentUser.id}
            onChange={(e) => switchUser(e.target.value)}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name} ({u.role})
              </option>
            ))}
          </select>
        </div>

        <div className="sidebar-section sidebar-footer">
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

      <main className="content">{children}</main>
    </div>
  );
}

export default Layout;
