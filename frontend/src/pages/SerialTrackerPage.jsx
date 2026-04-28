import { useState } from "react";
import Button from "../components/Button";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import { apiFetch } from "../lib/api";
import { formatDate, formatDateTime, formatLabel } from "../lib/formatters";

function StatusBadge({ status }) {
  const toneClass = `status-badge ${status || "available"}`;

  return <span className={toneClass}>{formatLabel(status)}</span>;
}

function SearchMatchList({ items, onSelect }) {
  return (
    <Card title="Matching Serials" subtitle="Search Results">
      <div className="serial-match-list">
        {items.map((item) => (
          <button
            key={item.serialNumber}
            type="button"
            className="serial-match-item"
            onClick={() => onSelect(item.serialNumber)}
          >
            <div>
              <strong>{item.serialNumber}</strong>
              <p>
                {item.product.name}
                {item.salesOrder ? ` • ${item.salesOrder}` : ""}
              </p>
            </div>
            <StatusBadge status={item.currentStatus} />
          </button>
        ))}
      </div>
    </Card>
  );
}

function SerialDetailCard({ detail }) {
  return (
    <Card title={detail.serialNumber} subtitle="Serial Detail">
      <div className="serial-detail-grid">
        <div>
          <span className="detail-label">Current Status</span>
          <div className="detail-value-row">
            <StatusBadge status={detail.currentStatus} />
          </div>
        </div>
        <div>
          <span className="detail-label">Product</span>
          <strong>{detail.product.name}</strong>
          <p className="detail-meta">{detail.product.sku}</p>
        </div>
        <div>
          <span className="detail-label">Supplier</span>
          <strong>{detail.supplier.name}</strong>
          <p className="detail-meta">{detail.supplier.code}</p>
        </div>
        <div>
          <span className="detail-label">Current Location</span>
          <strong>
            {detail.currentLocation
              ? `${detail.currentLocation.code} • ${detail.currentLocation.name}`
              : "Out of warehouse"}
          </strong>
        </div>
        <div>
          <span className="detail-label">Purchase Order</span>
          <strong>{detail.purchaseOrder.orderNumber || "—"}</strong>
          <p className="detail-meta">Received {formatDateTime(detail.purchaseOrderReceivedDate)}</p>
        </div>
        <div>
          <span className="detail-label">Delivery Number</span>
          <strong>{detail.deliveryNumber || "—"}</strong>
          <p className="detail-meta">Receipt {detail.receiptNumber || "—"}</p>
        </div>
        <div>
          <span className="detail-label">Allocated Customer</span>
          <strong>{detail.allocatedCustomer?.name || "Not allocated"}</strong>
          <p className="detail-meta">
            {detail.salesOrder?.orderNumber ? `Sales Order ${detail.salesOrder.orderNumber}` : "No active sales order"}
          </p>
        </div>
        <div>
          <span className="detail-label">Dispatch Date</span>
          <strong>{formatDateTime(detail.dispatchDate)}</strong>
          <p className="detail-meta">{detail.holdReason || "No active hold reason recorded."}</p>
        </div>
      </div>

      <div className="serial-answer-grid">
        <div className="serial-answer-card">
          <span className="detail-label">Where did it come from?</span>
          <strong>{detail.supplier.name}</strong>
          <p className="detail-meta">
            Delivered on {formatDate(detail.purchaseOrderReceivedDate)} under {detail.deliveryNumber || detail.receiptNumber || "the recorded receipt"}.
          </p>
        </div>
        <div className="serial-answer-card">
          <span className="detail-label">Which PO did it arrive on?</span>
          <strong>{detail.purchaseOrder.orderNumber || "—"}</strong>
          <p className="detail-meta">
            Ordered {formatDate(detail.purchaseOrder.orderedAt)} and received {formatDate(detail.purchaseOrderReceivedDate)}.
          </p>
        </div>
        <div className="serial-answer-card">
          <span className="detail-label">Which customer/SO was it allocated to?</span>
          <strong>{detail.allocatedCustomer?.name || "No allocation recorded"}</strong>
          <p className="detail-meta">{detail.salesOrder?.orderNumber || "No sales order linked"}</p>
        </div>
        <div className="serial-answer-card">
          <span className="detail-label">Has it been dispatched?</span>
          <strong>{detail.dispatchDate ? "Yes" : "No"}</strong>
          <p className="detail-meta">
            {detail.dispatchDate ? `Dispatched on ${formatDateTime(detail.dispatchDate)}.` : "No dispatch movement has been recorded yet."}
          </p>
        </div>
      </div>
    </Card>
  );
}

function SerialTimeline({ items }) {
  return (
    <Card title="Movement History" subtitle="Timeline">
      {!items.length ? (
        <div className="table-state">
          <strong>No movement history</strong>
          <p>This serial does not yet have any stock or activity log entries.</p>
        </div>
      ) : (
        <ol className="timeline-list">
          {items.map((item) => (
            <li key={item.id} className="timeline-item">
              <div className="timeline-marker" aria-hidden="true" />
              <div className="timeline-content">
                <div className="timeline-header">
                  <strong>{formatLabel(item.event_type)}</strong>
                  <span>{formatDateTime(item.occurred_at)}</span>
                </div>
                <p className="timeline-summary">{item.summary || "No note recorded."}</p>
                <div className="timeline-meta">
                  <span>Source: {item.source === "activity_log" ? "Activity log" : "Stock movement"}</span>
                  {item.source_location_code || item.destination_location_code ? (
                    <span>
                      Route: {item.source_location_code || "External"} → {item.destination_location_code || "External"}
                    </span>
                  ) : null}
                  {item.purchase_order_number ? <span>PO: {item.purchase_order_number}</span> : null}
                  {item.sales_order_number ? <span>SO: {item.sales_order_number}</span> : null}
                  {item.customer_name ? <span>Customer: {item.customer_name}</span> : null}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function SerialTrackerPage() {
  const [searchInput, setSearchInput] = useState("");
  const [searchState, setSearchState] = useState({
    status: "idle",
    items: [],
    error: "",
    searchedFor: "",
  });
  const [detailState, setDetailState] = useState({
    status: "idle",
    data: null,
    error: "",
  });

  async function loadSerialDetail(serialNumber) {
    setDetailState({
      status: "loading",
      data: null,
      error: "",
    });

    try {
      const data = await apiFetch(`/serials/${encodeURIComponent(serialNumber)}`);
      setDetailState({
        status: "success",
        data,
        error: "",
      });
    } catch (error) {
      setDetailState({
        status: "error",
        data: null,
        error: error.message || "Unable to load serial detail.",
      });
    }
  }

  async function handleSearch(event) {
    event.preventDefault();

    const nextSearch = searchInput.trim().toUpperCase();
    if (!nextSearch) {
      return;
    }

    setSearchState({
      status: "loading",
      items: [],
      error: "",
      searchedFor: nextSearch,
    });
    setDetailState({
      status: "idle",
      data: null,
      error: "",
    });

    try {
      const data = await apiFetch(`/serials?search=${encodeURIComponent(nextSearch)}`);
      const exactMatch = data.items.find((item) => item.serialNumber.toUpperCase() === nextSearch);

      setSearchState({
        status: "success",
        items: data.items,
        error: "",
        searchedFor: nextSearch,
      });

      if (exactMatch) {
        await loadSerialDetail(exactMatch.serialNumber);
        return;
      }

      if (data.items.length === 1) {
        await loadSerialDetail(data.items[0].serialNumber);
      }
    } catch (error) {
      setSearchState({
        status: "error",
        items: [],
        error: error.message || "Unable to search serials.",
        searchedFor: nextSearch,
      });
    }
  }

  function handleClear() {
    setSearchInput("");
    setSearchState({
      status: "idle",
      items: [],
      error: "",
      searchedFor: "",
    });
    setDetailState({
      status: "idle",
      data: null,
      error: "",
    });
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Traceability"
        title="Serial Tracker"
        description="Scan or type a serial number to see where it was received, who it was allocated to, and whether it has been dispatched, returned, or quarantined."
      />

      <Card title="Search Serial Number" subtitle="Scanner Ready">
        <form className="serial-search-form" onSubmit={handleSearch}>
          <label className="serial-search-label" htmlFor="serial-search-input">
            Scan or enter serial number
          </label>
          <div className="serial-search-row">
            <input
              id="serial-search-input"
              className="serial-search-input"
              type="text"
              autoFocus
              inputMode="text"
              enterKeyHint="search"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="e.g. PRN-2026-0001"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value.toUpperCase())}
            />
            <Button type="submit" disabled={searchState.status === "loading" || detailState.status === "loading"}>
              {searchState.status === "loading" ? "Searching…" : "Search"}
            </Button>
            <Button type="button" variant="secondary" onClick={handleClear}>
              Clear
            </Button>
          </div>
        </form>
      </Card>

      {searchState.status === "loading" || detailState.status === "loading" ? (
        <Card title="Loading Serial" subtitle="Lookup">
          <div className="table-state">
            <strong>Looking up serial activity</strong>
            <p>Checking inbound receipt, allocation, dispatch, and movement history.</p>
          </div>
        </Card>
      ) : null}

      {searchState.status === "error" ? (
        <Card title="Search Error" subtitle="Lookup">
          <div className="table-state error">
            <strong>Unable to search serials</strong>
            <p>{searchState.error}</p>
          </div>
        </Card>
      ) : null}

      {searchState.status === "success" && !searchState.items.length ? (
        <Card title="No Result" subtitle="Lookup">
          <div className="table-state">
            <strong>No serial found</strong>
            <p>No serial matched {searchState.searchedFor}. Check the scan and try again.</p>
          </div>
        </Card>
      ) : null}

      {searchState.status === "success" && searchState.items.length > 1 && detailState.status !== "success" ? (
        <SearchMatchList items={searchState.items} onSelect={loadSerialDetail} />
      ) : null}

      {detailState.status === "error" ? (
        <Card title="Serial Error" subtitle="Lookup">
          <div className="table-state error">
            <strong>Unable to load serial detail</strong>
            <p>{detailState.error}</p>
          </div>
        </Card>
      ) : null}

      {detailState.status === "success" ? (
        <>
          <SerialDetailCard detail={detailState.data} />
          <SerialTimeline items={detailState.data.movementHistory || []} />
        </>
      ) : null}
    </div>
  );
}

export default SerialTrackerPage;
