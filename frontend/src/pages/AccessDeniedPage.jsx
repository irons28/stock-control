function AccessDeniedPage({ title = "Access denied", description }) {
  return (
    <div className="page-stack">
      <section className="access-denied-card">
        <p className="eyebrow">Permissions</p>
        <h1>{title}</h1>
        <p>
          {description ||
            "Your account does not have access to this area. If you believe this is incorrect, please speak to an admin user."}
        </p>
      </section>
    </div>
  );
}

export default AccessDeniedPage;
