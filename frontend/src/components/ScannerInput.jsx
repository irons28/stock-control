import { useRef } from "react";

// Large, scanner-friendly text input.
// Submits on Enter or when a scanner sends its suffix character (also Enter).
function ScannerInput({ value, onChange, onSubmit, placeholder = "Scan barcode or type…", autoFocus = true, disabled = false }) {
  const inputRef = useRef(null);

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = value.trim();
      if (trimmed) {
        onSubmit(trimmed);
      }
    }
  }

  function handleSubmitClick() {
    const trimmed = value.trim();
    if (trimmed) {
      onSubmit(trimmed);
    } else {
      inputRef.current?.focus();
    }
  }

  return (
    <div className="scanner-field">
      <input
        ref={inputRef}
        type="text"
        className="scanner-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="characters"
        spellCheck={false}
        disabled={disabled}
        aria-label={placeholder}
      />
      <button
        type="button"
        className="button scanner-submit"
        onClick={handleSubmitClick}
        disabled={disabled || !value.trim()}
      >
        Search
      </button>
    </div>
  );
}

export default ScannerInput;
