import { useEffect, useMemo, useState } from "react";
import Button from "../components/Button";
import Card from "../components/Card";
import DataTable from "../components/DataTable";
import GuidedHelpPanel from "../components/GuidedHelpPanel";
import PageHeader from "../components/PageHeader";
import PermissionGate, { PermissionButton } from "../components/PermissionGate";
import ActivityTimeline from "../components/ActivityTimeline";
import { HELP_CONTENT } from "../config/helpContent";
import { useApiResource } from "../hooks/useApiResource";
import { formatDate, formatNumber } from "../lib/formatters";

function getStatusBadgeClass(status) {
  return `pill ${String(status).toLowerCase().replace(/\s+/g, "-")}`;
}

function getSearchResultSummary(rows, activePoNumber) {
  if (!rows.length) {
    return "No purchase orders match the current search.";
  }

  const selectedLabel = activePoNumber ? `Selected ${activePoNumber}.` : "No purchase order selected.";
  return `${rows.length} result${rows.length === 1 ? "" : "s"}. ${selectedLabel}`;
}

const resultColumns = [
  {
    key: "poNumber",
    header: "PO Number",
    render: (row) => (
      <div>
        <strong>{row.poNumber}</strong>
        <div className="result-meta">{row.supplier}</div>
      </div>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (row) => <span className={getStatusBadgeClass(row.status)}>{row.status}</span>,
  },
  {
    key: "expectedDeliveryDate",
    header: "Expected",
    render: (row) => formatDate(row.expectedDeliveryDate),
  },
  {
    key: "remaining",
    header: "Still To Receive",
    render: (row) => formatNumber(row.totalOrderedQuantity - row.totalReceivedQuantity),
  },
];

const lineColumns = [
  { key: "productCode", header: "Product Code" },
  { key: "productName", header: "Product Name" },
  {
    key: "orderedQuantity",
    header: "Ordered",
    render: (row) => formatNumber(row.orderedQuantity),
  },
  {
    key: "receivedQuantity",
    header: "Received",
    render: (row) => formatNumber(row.receivedQuantity),
  },
  {
    key: "remainingQuantity",
    header: "Remaining",
    render: (row) => (
      <span className={row.remainingQuantity > 0 ? "line-remaining" : "line-complete"}>
        {formatNumber(row.remainingQuantity)}
      </span>
    ),
  },
  {
    key: "serialTrackingRequired",
    header: "Serial Tracking",
    render: (row) => (
      <span className={row.serialTrackingRequired ? "pill serial-required" : "pill subtle"}>
        {row.serialTrackingRequired ? "Required" : "Not Required"}
      </span>
    ),
  },
  {
    key: "linkedSalesOrderReferences",
    header: "Linked Sales Orders",
    render: (row) =>
      row.linkedSalesOrderReferences.length ? row.linkedSalesOrderReferences.join(", ") : "—",
  },
];

function PurchaseOrdersPage({ onNavigate }) {
  const initialPoNumber = new URLSearchParams(window.location.search).get("po") || "";
  const [inputValue, setInputValue] = useState(initialPoNumber);
  const [searchValue, setSearchValue] = useState(initialPoNumber);
  const purchaseOrders = useApiResource(
    `/purchase-orders${searchValue ? `?poNumber=${encodeURIComponent(searchValue)}` : ""}`,
  );
  const rows = purchaseOrders.data?.items || [];
  const [selectedPoNumber, setSelectedPoNumber] = useState(initialPoNumber);
  const detail = useApiResource(
    selectedPoNumber ? `/purchase-orders/${encodeURIComponent(selectedPoNumber)}` : "",
  );

  useEffect(() => {
    if (!rows.length) {
      setSelectedPoNumber("");
      return;
    }

    if (!selectedPoNumber || !rows.some((row) => row.poNumber === selectedPoNumber)) {
      setSelectedPoNumber(rows[0].poNumber);
    }
  }, [rows, selectedPoNumber]);

  const summaryText = useMemo(
    () => getSearchResultSummary(rows, selectedPoNumber),
    [rows, selectedPoNumber],
  );

  function handleSearch(event) {
    event.preventDefault();
    setSearchValue(inputValue.trim());
  }

  function handleClear() {
    setInputValue("");
    setSearchValue("");
  }

  const detailData = detail.data;
  const timeline = useApiResource(
    selectedPoNumber ? `/purchase-orders/${encodeURIComponent(selectedPoNumber)}/timeline` : null,
  );

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Inbound"
        title="Purchase Orders"
        description="Search by PO number, review supplier receipt progress, and spot the lines that still need to be booked in."
        help={HELP_CONTENT.purchaseOrders}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                purchaseOrders.reload();
                detail.reload();
              }}
            >
              Refresh Results
            </Button>
            <PermissionButton permission="po:create" className="btn" onClick={() => onNavigate?.("/purchase-orders/new")}>New Purchase Order</PermissionButton>
          </>
        }
      />

      <GuidedHelpPanel
        intro={HELP_CONTENT.purchaseOrders.summary}
        steps={HELP_CONTENT.purchaseOrders.steps}
        warnings={HELP_CONTENT.purchaseOrders.warnings}
      />

      <Card title="Search Purchase Orders" subtitle="PO Finder">
        <form className="search-form" onSubmit={handleSearch}>
          <label className="search-field">
            <span>PO Number</span>
            <input
              type="search"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder="Search PO-1002"
              aria-label="Search by purchase order number"
            />
          </label>
          <div className="search-actions">
            <Button type="submit">Search</Button>
            <Button type="button" variant="secondary" onClick={handleClear}>
              Clear
            </Button>
          </div>
        </form>
        <p className="search-summary">{summaryText}</p>
      </Card>

      <section className="purchase-orders-layout">
        <Card title="Search Results" subtitle="Inbound Queue" className="purchase-orders-results">
          <DataTable
            columns={resultColumns}
            rows={rows}
            loading={purchaseOrders.status === "loading"}
            error={purchaseOrders.status === "error" ? purchaseOrders.error : ""}
            emptyMessage={
              searchValue
                ? `No purchase orders matched "${searchValue}".`
                : "No purchase orders are available in the current dataset."
            }
            onRetry={purchaseOrders.reload}
            getRowKey={(row) => row.poNumber}
            onRowClick={(row) => setSelectedPoNumber(row.poNumber)}
            getRowClassName={(row) =>
              row.poNumber === selectedPoNumber ? "data-row selectable selected" : "data-row selectable"
            }
          />
        </Card>

        <Card title="Purchase Order Detail" subtitle="Line Breakdown" className="purchase-orders-detail">
          {detail.status === "loading" ? (
            <div className="detail-state">
              <strong>Loading purchase order</strong>
              <p>Fetching header and line detail for the selected PO.</p>
            </div>
          ) : null}

          {detail.status === "error" ? (
            <div className="detail-state error">
              <strong>Unable to load purchase order detail</strong>
              <p>{detail.error}</p>
            </div>
          ) : null}

          {detail.status === "idle" ? (
            <div className="detail-state">
              <strong>Select a purchase order</strong>
              <p>Choose a result from the list to inspect the line-level receiving status.</p>
            </div>
          ) : null}

          {detail.status === "success" && detailData ? (
            <div className="detail-stack">
              <div className="detail-header">
                <div>
                  <h3>{detailData.poNumber}</h3>
                  <p>{detailData.supplier}</p>
                </div>
                <div className="purchase-orders-detail-actions">
                  <span className={getStatusBadgeClass(detailData.status)}>{detailData.status}</span>
                  <PermissionButton
                    permission="po:receive"
                    className="btn btn--secondary"
                    onClick={() => onNavigate?.(`/receive-goods?po=${encodeURIComponent(detailData.poNumber)}`)}
                  >
                    Receive Goods
                  </PermissionButton>
                </div>
              </div>

              <dl className="po-meta-grid">
                <div>
                  <dt>Order Date</dt>
                  <dd>{formatDate(detailData.orderDate)}</dd>
                </div>
                <div>
                  <dt>Expected Delivery</dt>
                  <dd>{formatDate(detailData.expectedDeliveryDate)}</dd>
                </div>
                <div>
                  <dt>Lines</dt>
                  <dd>{detailData.lineCount}</dd>
                </div>
                <div>
                  <dt>Still Open</dt>
                  <dd>{detailData.openLineCount}</dd>
                </div>
              </dl>

              <div className="receipt-progress">
                <div>
                  <span>Received</span>
                  <strong>
                    {formatNumber(detailData.totalReceivedQuantity)} /{" "}
                    {formatNumber(detailData.totalOrderedQuantity)}
                  </strong>
                </div>
                <div className="receipt-progress-bar" aria-hidden="true">
                  <span
                    style={{
                      width: `${
                        detailData.totalOrderedQuantity
                          ? Math.min(
                              100,
                              (detailData.totalReceivedQuantity / detailData.totalOrderedQuantity) * 100,
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>

              <DataTable
                columns={lineColumns}
                rows={detailData.lines}
                loading={false}
                error=""
                emptyMessage="This purchase order does not contain any lines."
                getRowKey={(row) => row.productCode}
                getRowClassName={(row) =>
                  row.remainingQuantity > 0 ? "data-row line-needs-receiving" : "data-row"
                }
              />

              <div className="po-timeline-section">
                <h4 className="po-timeline-heading">Activity</h4>
                <ActivityTimeline
                  events={timeline.data?.events}
                  loading={timeline.status === "loading"}
                  error={timeline.status === "error" ? "Unable to load activity." : null}
                  emptyMessage="No activity recorded for this purchase order yet."
                />
              </div>
            </div>
          ) : null}
        </Card>
      </section>
    </div>
  );
}

export default PurchaseOrdersPage;
