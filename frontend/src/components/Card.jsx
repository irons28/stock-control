function Card({ title, subtitle, children, className = "" }) {
  const classes = className ? `card ${className}` : "card";

  return (
    <section className={classes}>
      {title || subtitle ? (
        <header className="card-header">
          {subtitle ? <p className="eyebrow">{subtitle}</p> : null}
          {title ? <h3>{title}</h3> : null}
        </header>
      ) : null}
      <div className="card-body">{children}</div>
    </section>
  );
}

export default Card;
