function ModulePanel({ title, description }) {
  return (
    <section className="module-panel">
      <div className="module-copy">
        <p className="eyebrow">Planned Module</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>

      <div className="placeholder-card">
        <h3>Foundation Status</h3>
        <ul>
          <li>Frontend route shell ready</li>
          <li>Backend API project scaffold ready</li>
          <li>SQLite development setup ready</li>
          <li>Business rules intentionally deferred</li>
        </ul>
      </div>
    </section>
  );
}

export default ModulePanel;
