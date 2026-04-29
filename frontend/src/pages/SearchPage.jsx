import { useEffect, useRef, useState } from "react";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import StatusPill from "../components/StatusPill";
import { apiFetch } from "../lib/api";

// ── Group metadata (label + icon char) ────────────────────────────────────────
const GROUP_META = {
  purchase_orders: { label: "Purchase Orders", icon: "📦", emptyIcon: "📦" },
  sales_orders:    { label: "Sales Orders",    icon: "🧾", emptyIcon: "🧾" },
  serials:         { label: "Serial Numbers",  icon: "🔲", emptyIcon: "🔲" },
  customers:       { label: "Customers",       icon: "🏢", emptyIcon: "🏢" },
  suppliers:       { label: "Suppliers",       icon: "🚚", emptyIcon: "🚚" },
  products:        { label: "Products",        icon: "📋", emptyIcon: "📋" },
};

const GROUP_ORDER = ["purchase_orders", "sales_orders", "serials", "customers", "suppliers", "products"];

// ── Type badge colours ─────────────────────────────────────────────────────────
const TYPE_TONE = {
  purchase_order: "info",
  sales_order:    "info",
  serial:         "neutral",
  customer:       "positive",
  supplier:       "positive",
  product:        "neutral",
};

// ── Single result row ──────────────────────────────────────────────────────────
function ResultRow({ result, onNavigate, searchQuery }) {
  const tone = TYPE_TONE[result.type] || "neutral";

  function handleClick() {
    if (result.type === "serial" && result.extra?.serial) {
      // Navigate to serial tracker and carry the serial as a query hint via custom event
      window.dispatchEvent(
        new CustomEvent("search:serial", { detail: { serial: result.extra.serial } }),
      );
    }
    onNavigate(result.path);
  }

  // Highlight matching substring in title
  function highlight(text) {
    if (!searchQuery || !text) return text;
    const idx = text.toLowerCase().indexOf(searchQuery.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="search-highlight">{text.slice(idx, idx + searchQuery.length)}</mark>
        {text.slice(idx + searchQuery.length)}
      </>
    );
  }

  return (
    <button type="button" className="search-result-row" onClick={handleClick}>
      <div className="search-result-body">
        <span className="search-result-title">{highlight(result.title)}</span>
        {result.subtitle && (
          <span className="search-result-subtitle">{highlight(result.subtitle)}</span>
        )}
        {result.meta && result.meta.length > 0 && (
          <span className="search-result-meta">{result.meta.join(" · ")}</span>
        )}
      </div>
      <div className="search-result-aside">
        {result.status && <StatusPill value={result.status} subtle />}
        <span className={`search-type-badge tone-${tone}`}>{result.type.replace("_", " ")}</span>
        <span className="search-result-arrow">→</span>
      </div>
    </button>
  );
}

// ── Result group block ─────────────────────────────────────────────────────────
function ResultGroup({ groupKey, results, onNavigate, searchQuery }) {
  const meta = GROUP_META[groupKey] || { label: groupKey, icon: "•" };
  return (
    <div className="search-group">
      <div className="search-group-header">
        <span className="search-group-icon">{meta.icon}</span>
        <span className="search-group-label">{meta.label}</span>
        <span className="search-group-count">{results.length}</span>
      </div>
      <div className="search-group-rows">
        {results.map((r) => (
          <ResultRow
            key={`${r.type}-${r.id}`}
            result={r}
            onNavigate={onNavigate}
            searchQuery={searchQuery}
          />
        ))}
      </div>
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────
function EmptyState({ query }) {
  return (
    <div className="search-empty">
      <div className="search-empty-icon">⊘</div>
      <p className="search-empty-title">No results for "{query}"</p>
      <p className="search-empty-hint">
        Try a PO number, SO number, serial, customer name, supplier, or product SKU.
      </p>
    </div>
  );
}

// ── Quick hints shown before first search ──────────────────────────────────────
function SearchHints() {
  const hints = [
    { icon: "📦", text: "PO-1001", label: "PO number" },
    { icon: "🧾", text: "SO-2001", label: "SO number" },
    { icon: "🔲", text: "TILL-SN-1001", label: "Serial number" },
    { icon: "🏢", text: "Alpha Vet", label: "Customer name" },
    { icon: "🚚", text: "Nexus", label: "Supplier name" },
    { icon: "📋", text: "TILL-001", label: "Product SKU" },
  ];

  return (
    <div className="search-hints">
      <p className="search-hints-label">Search across</p>
      <div className="search-hints-grid">
        {hints.map((h) => (
          <div key={h.label} className="search-hint-chip">
            <span className="search-hint-icon">{h.icon}</span>
            <span className="search-hint-text">{h.label}</span>
            <span className="search-hint-example">{h.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
function SearchPage({ initialQuery = "", onNavigate }) {
  const [query, setQuery] = useState(initialQuery);
  const [committed, setCommitted] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null); // null = never searched
  const inputRef = useRef(null);

  // Auto-focus the input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Fire search when initialQuery changes (header quick-search navigated here)
  useEffect(() => {
    if (initialQuery && initialQuery !== committed) {
      setQuery(initialQuery);
      runSearch(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  async function runSearch(term) {
    const q = term.trim();
    if (!q) return;
    setCommitted(q);
    setLoading(true);
    setResults(null);
    try {
      const data = await apiFetch(`/search?q=${encodeURIComponent(q)}`);
      setResults(data);
    } catch {
      setResults({ query: q, total: 0, groups: {} });
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      runSearch(query);
    }
    if (e.key === "Escape") {
      setQuery("");
      setResults(null);
      setCommitted("");
    }
  }

  const orderedGroupKeys = GROUP_ORDER.filter((k) => results?.groups?.[k]?.length > 0);
  const hasResults = results && results.total > 0;
  const searched = results !== null;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Operations"
        title="Global Search"
        description="Search across purchase orders, sales orders, serials, customers, suppliers, and products."
      />

      <Card title="Search" subtitle="Scan or Type">
        <div className="search-input-row">
          <div className="search-input-wrap">
            <span className="search-input-icon" aria-hidden="true">⌕</span>
            <input
              ref={inputRef}
              type="text"
              className="search-main-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="PO number, serial, customer, SKU…"
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => {
                  setQuery("");
                  setResults(null);
                  setCommitted("");
                  inputRef.current?.focus();
                }}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
          <button
            type="button"
            className="button primary search-go-btn"
            onClick={() => runSearch(query)}
            disabled={loading || !query.trim()}
          >
            {loading ? "…" : "Search"}
          </button>
        </div>

        {!searched && !loading && <SearchHints />}

        {loading && (
          <div className="search-loading">
            <div className="search-loading-bar" />
            <p>Searching…</p>
          </div>
        )}

        {searched && !loading && results.total > 0 && (
          <p className="search-summary">
            <strong>{results.total}</strong> result{results.total !== 1 ? "s" : ""} for{" "}
            <em>"{results.query}"</em> across {orderedGroupKeys.length} categor{orderedGroupKeys.length !== 1 ? "ies" : "y"}
          </p>
        )}
      </Card>

      {/* Results */}
      {searched && !loading && hasResults && (
        <Card title="Results" subtitle={`${results.total} match${results.total !== 1 ? "es" : ""}`}>
          <div className="search-results">
            {orderedGroupKeys.map((key) => (
              <ResultGroup
                key={key}
                groupKey={key}
                results={results.groups[key]}
                onNavigate={onNavigate}
                searchQuery={committed}
              />
            ))}
          </div>
        </Card>
      )}

      {searched && !loading && !hasResults && <EmptyState query={results.query} />}
    </div>
  );
}

export default SearchPage;
