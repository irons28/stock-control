import { useState } from "react";
import HelpPopover from "./HelpPopover";

function PageHelpButton({ title, help }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="page-help-button-wrap">
      <button
        type="button"
        className="page-help-button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={`Help for ${title}`}
      >
        ?
      </button>
      {open ? (
        <HelpPopover
          title={help.title || title}
          summary={help.summary}
          steps={help.steps}
          warnings={help.warnings}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

export default PageHelpButton;
