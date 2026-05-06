import PageHelpButton from "./PageHelpButton";

function PageHeader({ eyebrow = "Module", title, description, actions, help }) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <div className="page-title-row">
          <h2>{title}</h2>
          {help ? <PageHelpButton title={title} help={help} /> : null}
        </div>
        <p className="page-description">{description}</p>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export default PageHeader;
