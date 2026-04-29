import { useRef, useState } from "react";
import { useUser } from "../context/UserContext";

const DEMO_USERS = [
  { id: "1", full_name: "Alex Admin",        role: "admin"      },
  { id: "2", full_name: "Priya Purchasing",   role: "purchasing" },
  { id: "3", full_name: "Wayne Warehouse",    role: "warehouse"  },
  { id: "4", full_name: "Diana Dispatch",     role: "dispatch"   },
  { id: "5", full_name: "Marcus Management",  role: "management" },
];

function getInitials(name) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function Layout({ navigationItems, activePath, onNavigate, onSearch, health, children }) {
  const backendOnline = health.status === "success";
  const timestamp = backendOnline ? health.data?.database?.database_time : null;
  const { currentUser, users, switchUser } = useUser();

  const [quickQuery, setQuickQuery] = useState("");
  const quickRef = useRef(null);

  const [userId, setUserId] = useState(
    () => localStorage.getItem("sc_user_id") || "1"
  );
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const currentUser = DEMO_USERS.find((u) => u.id === userId) || DEMO_USERS[0];

  function handleUserSwitch(user) {
    localStorage.setItem("sc_user_id", user.id);
    setUserId(user.id);
    setUserDropdownOpen(false);
  }

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
          {/* User panel */}
          <div style={{ position: "relative" }}>
            <div className="sidebar-user">
              <div className="sidebar-user-avatar">
                {getInitials(currentUser.full_name)}
              </div>
              <div className="sidebar-user-info">
                <span className="sidebar-user-name">{currentUser.full_name}</span>
                <span className={`sidebar-user-role role-${currentUser.role}`}>
                  {currentUser.role}
                </span>
              </div>
              <button
                type="button"
                className="sidebar-user-switch"
                onClick={() => setUserDropdownOpen((v) => !v)}
                aria-label="Switch user"
                aria-expanded={userDropdownOpen}
              >
                ⇅
              </button>
            </div>

            {userDropdownOpen && (
              <div className="sidebar-user-dropdown">
                {DEMO_USERS.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    className={`sidebar-user-option${user.id === userId ? " active" : ""}`}
                    onClick={() => handleUserSwitch(user)}
                  >
                    <span className="sidebar-user-option-name">{user.full_name}</span>
                    <span className="sidebar-user-option-role">{user.role}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* API status */}
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
