import { useEffect, useRef, useState } from "react";
import Button from "./Button";

function defaultGetItemKey(item) {
  if (typeof item === "string") {
    return item;
  }

  if (item && typeof item === "object") {
    return item.key || item.value || item.id || JSON.stringify(item);
  }

  return String(item ?? "");
}

function defaultRenderItem(item) {
  if (typeof item === "string") {
    return (
      <div>
        <strong>{item}</strong>
      </div>
    );
  }

  return (
    <div>
      <strong>{item.label || item.value || item.id || "Scanned item"}</strong>
      {item.meta ? <p>{item.meta}</p> : null}
    </div>
  );
}

function ScannerInput({
  label,
  placeholder,
  helperText = "",
  submitLabel = "Submit",
  autoFocus = true,
  preventDuplicates = false,
  duplicateMessage = "This item has already been scanned.",
  successMessage = "",
  emptyListMessage = "Scanned items will appear here.",
  listTitle = "Scanned Items",
  secondaryAction = null,
  normalizeValue = (value) => value.trim(),
  getItemKey = defaultGetItemKey,
  renderItem = defaultRenderItem,
  onSubmit,
  onRemoveItem,
}) {
  const inputRef = useRef(null);
  const inputId = useRef(`scanner-input-${Math.random().toString(36).slice(2)}`);
  const [inputValue, setInputValue] = useState("");
  const [items, setItems] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({
    type: "",
    message: "",
  });

  useEffect(() => {
    if (!autoFocus) {
      return;
    }

    inputRef.current?.focus();
  }, [autoFocus]);

  function focusInput() {
    inputRef.current?.focus();
    inputRef.current?.select();
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const normalizedValue = normalizeValue(inputValue);
    if (!normalizedValue) {
      return;
    }

    const hasDuplicate = preventDuplicates
      && items.some((item) => normalizeValue(getItemKey(item)) === normalizedValue);

    if (hasDuplicate) {
      setFeedback({
        type: "error",
        message: duplicateMessage,
      });
      focusInput();
      return;
    }

    setSubmitting(true);
    setFeedback({
      type: "",
      message: "",
    });

    try {
      const result = (await onSubmit?.(normalizedValue, items)) || {};

      if (result.errorMessage) {
        setFeedback({
          type: "error",
          message: result.errorMessage,
        });
        return;
      }

      const nextItem = Object.prototype.hasOwnProperty.call(result, "item")
        ? result.item
        : {
            key: normalizedValue,
            label: normalizedValue,
          };

      if (result.appendItem !== false) {
        setItems([nextItem, ...items]);
      }

      setFeedback({
        type: "success",
        message: result.successMessage || successMessage,
      });
      setInputValue(result.clearInput === false ? normalizedValue : "");
    } catch (error) {
      setFeedback({
        type: "error",
        message: error.message || "Unable to process the scanned value.",
      });
    } finally {
      setSubmitting(false);
      window.requestAnimationFrame(() => {
        focusInput();
      });
    }
  }

  function handleRemoveItem(itemToRemove) {
    const nextItems = items.filter((item) => getItemKey(item) !== getItemKey(itemToRemove));
    setItems(nextItems);
    setFeedback({
      type: "",
      message: "",
    });
    onRemoveItem?.(itemToRemove, nextItems);
    focusInput();
  }

  return (
    <div className="scanner-input">
      <form className="scanner-input-form" onSubmit={handleSubmit}>
        <label className="scanner-input-label" htmlFor={inputId.current}>
          {label}
        </label>
        {helperText ? <p className="scanner-input-helper">{helperText}</p> : null}
        <div className="scanner-input-row">
          <input
            id={inputId.current}
            ref={inputRef}
            className="scanner-input-field"
            type="text"
            inputMode="text"
            enterKeyHint="done"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={placeholder}
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
          />
          <Button type="submit" disabled={submitting}>
            {submitting ? "Working…" : submitLabel}
          </Button>
          {secondaryAction ? (
            <Button
              type="button"
              variant="secondary"
              onClick={secondaryAction.onClick}
              disabled={secondaryAction.disabled}
            >
              {secondaryAction.label}
            </Button>
          ) : null}
        </div>
      </form>

      {feedback.message ? (
        <div className={`scanner-feedback ${feedback.type || "info"}`}>
          <strong>{feedback.type === "error" ? "Scan blocked" : "Scan accepted"}</strong>
          <p>{feedback.message}</p>
        </div>
      ) : null}

      <div className="scanner-list">
        <div className="scanner-list-header">
          <strong>{listTitle}</strong>
          <span>{items.length} captured</span>
        </div>

        {!items.length ? (
          <div className="table-state">
            <strong>No scanned items yet</strong>
            <p>{emptyListMessage}</p>
          </div>
        ) : (
          <div className="scanner-list-items">
            {items.map((item) => (
              <div key={getItemKey(item)} className="scanner-list-item">
                {renderItem(item)}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleRemoveItem(item)}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ScannerInput;
