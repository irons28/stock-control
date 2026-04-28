import { useState } from "react";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import ScannerInput from "../components/ScannerInput";
import StatusPill from "../components/StatusPill";
import { apiFetch } from "../lib/api";
import { formatDateTime, formatLabel } from "../lib/formatters";

function SerialTrackerPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { item, movements }

  async function handleSearch(term) {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await apiFetch(`/serials/${encodeURIComponent(term)}`);
      setResult(data);
    } catch (err) {
      if (err.message.includes("404")) {
        setError(`No serial record found for "${term}".`);
      } else {
        setError(err.message || "Unable to look up serial.");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    setQuery("");
    setError(null);
    setResult(null);
  }

  const item = result?.item;
  const movements = result?.movements || [];

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Inventory"
        title="Serial Tracker"
        description="Scan a barcode or enter a serial number to see its current location, hold status, and full movement history."
      />

      <Card title="Serial Lookup" subtitle="Scan or Type">
        <div className="tracker-search-area">
          <ScannerInput
            value={query}
            onChange={setQuery}
            onSubmit={handleSearch}
            placeholder="Scan barcode or enter serial number…"
            autoFocus
            disabled={loading}
          />
          {(result || error) && (
            <button type="button" className="button secondary" onClick={handleClear}>
              Clear
            </button>
          )}
        </div>
        {loading && <p className="tracker-state">Looking up serial…</p>}
        {error && <p className="tracker-state tracker-error">{error}</p>}
      </Card>

      {item && (
        <Card title={item.serial_number} subtitle="Serial Record">
          <dl className="definition-list">
            <div>
              <dt>Product</dt>
              <dd>{item.product_name}</dd>
            </div>
            <div>
              <dt>SKU</dt>
              <dd>{item.sku}</dd>
            </div>
            <div>
              <dt>Current Location</dt>
              <dd>{item.location_code ? `${item.location_code} — ${item.location_name}` : "Not located"}</dd>
            </div>
            <div>
              <dt>Hold Status</dt>
              <dd>
                <StatusPill value={item.hold_status} />
              </dd>
            </div>
            <div>
              <dt>Record Status</dt>
              <dd>
                <StatusPill value={item.status} />
              </dd>
            </div>
            {item.hold_reason && (
              <div>
                <dt>Hold Reason</dt>
                <dd>{item.hold_reason}</dd>
              </div>
            )}
          </dl>
        </Card>
      )}

      {item && (
        <Card
          title={`Movement History — ${movements.length} event${movements.length !== 1 ? "s" : ""}`}
          subtitle="Timeline"
        >
          {movements.length === 0 ? (
            <p className="tracker-state">No movement records for this serial.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Qty</th>
                    <th>Notes</th>
                    <th>Recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((mv) => (
                    <tr key={mv.id}>
                      <td>
                        <StatusPill value={mv.movement_type} subtle />
                      </td>
                      <td>{mv.source_code || "—"}</td>
                      <td>{mv.destination_code || "—"}</td>
                      <td>{mv.quantity}</td>
                      <td>{mv.notes || "—"}</td>
                      <td>{formatDateTime(mv.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

export default SerialTrackerPage;
