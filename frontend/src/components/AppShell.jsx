function AppShell({ navigation, activeKey, onNavigate, children, health }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <p className="eyebrow">Phase 1 Foundation</p>
          <h1>Stock Control</h1>
          <p className="brand-copy">
            A modular platform for inbound receiving, stock visibility, sales allocation,
            serial traceability, and dispatch operations.
          </p>
        </div>

        <nav className="nav-panel" aria-label="Primary">
          {navigation.map((item) => (
            <a
              key={item.key}
              href={`#${item.key}`}
              className={item.key === activeKey ? "nav-link active" : "nav-link"}
              onClick={(event) => {
                event.preventDefault();
                onNavigate(item.key);
              }}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <section className={health.isHealthy ? "status-card online" : "status-card offline"}>
          <div className="status-header">
            <span className="status-dot" aria-hidden="true" />
            <strong>API Health</strong>
          </div>
          <p>{health.message}</p>
          <small>{health.detail}</small>
        </section>
      </aside>

      <main className="content">{children}</main>
    </div>
  );
}

export default AppShell;
