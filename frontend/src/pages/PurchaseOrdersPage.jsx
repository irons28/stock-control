import { useEffect, useState } from "react";
import Button from "../components/Button";
import Card from "../components/Card";
import DataTable from "../components/DataTable";
import PageHeader from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";
import { apiFetch } from "../lib/api";
import { formatDate, formatDateTime, formatLabel, formatNumber } from "../lib/formatters";

function PurchaseOrderLines({ lines }) {
  return (
    <div className="po-line-list">
      {lines.map((line) => (
        <article key={line.id} className="po-line-card">
          <div className="po-line-card-header">
            <div>
              <strong>
                {line.sku} · {line.product_name}
              </strong>
              <p>
                {line.is_serial_tracked ? "Serial tracked" : "Quantity tracked"} · Unit cost{" "}
                {formatNumber(line.unit_cost)}
              </p>
            </div>
            <span className={line.quantity_remaining > 0 ? "pill subtle" : "pill"}>
              {line.quantity_remaining > 0 ? "Outstanding" : "Complete"}
            </span>
          </div>

          <dl className="po-line-metrics">
            <div>
              <dt>Ordered</dt>
              <dd>{formatNumber(line.quantity_ordered)}</dd>
            </div>
            <div>
              <dt>Received</dt>
              <dd>{formatNumber(line.quantity_received)}</dd>
            </div>
            <div>
              <dt>Remaining</dt>
              <dd>{formatNumber(line.quantity_remaining)}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}

function PurchaseOrderDetail({ status, error, detail, onRetry, onReceive }) {
  if (status === "loading") {
    return (
      <div className="table-state">
        <strong>Loading purchase order</strong>
        <p>Fetching line details and receipt history.</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="table-state error">
        <strong>Unable to load purchase order</strong>
        <p>{error}</p>
        <div className="table-state-actions">
          <Button variant="secondary" onClick={onRetry}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="table-state">
        <strong>Select a purchase order</strong>
        <p>Choose a row above to inspect line-level receiving progress.</p>
      </div>
    );
  }

  return (
    <div className="page-stack compact">
      <section className="po-detail-grid">
        <div className="po-summary">
          <p className="eyebrow">Selected Order</p>
          <h3>{detail.order.order_number}</h3>
          <p className="po-summary-copy">
            {detail.order.supplier_name} · Expected {formatDate(detail.order.expected_at)}
          </p>
          <dl className="po-line-metrics">
            <div>
              <dt>Status</dt>
              <dd>{formatLabel(detail.order.status)}</dd>
            </div>
            <div>
              <dt>Total ordered</dt>
              <dd>{formatNumber(detail.order.total_ordered)}</dd>
            </div>
            <div>
              <dt>Total received</dt>
              <dd>{formatNumber(detail.order.total_received)}</dd>
            </div>
            <div>
              <dt>Remaining</dt>
              <dd>{formatNumber(detail.order.total_remaining)}</dd>
            </div>
          </dl>
        </div>

        <div className="po-detail-actions">
          <p className="eyebrow">Next Step</p>
          <p className="po-summary-copy">
            Open the receive workspace to capture quantities, delivery details, and serial
            numbers.
          </p>
          <Button onClick={() => onReceive(detail.order.order_number)}>Receive Goods</Button>
        </div>
      </section>

      <section>
        <h4 className="section-title">PO Lines</h4>
        <PurchaseOrderLines lines={detail.lines} />
      </section>

      <section>
        <h4 className="section-title">Recent Receipts</h4>
        {detail.receipts.length ? (
          <div className="receipt-history-list">
            {detail.receipts.map((receipt) => (
              <article key={receipt.id} className="receipt-history-card">
                <strong>{receipt.delivery_number || receipt.receipt_number}</strong>
                <p>
                  {formatDateTime(receipt.received_at)} · {receipt.received_by}
                </p>
                <small>{formatNumber(receipt.total_received)} units received</small>
              </article>
            ))}
          </div>
        ) : (
          <div className="table-state">
            <strong>No receipts yet</strong>
            <p>This order has not had any deliveries booked yet.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function PurchaseOrdersPage() {
  const purchaseOrders = useApiResource("/purchase-orders");
  const [selectedPoNumber, setSelectedPoNumber] = useState("");
  const [detailRequestKey, setDetailRequestKey] = useState(0);
  const [detailState, setDetailState] = useState({
    status: "idle",
    data: null,
    error: "",
  });
  const rows = purchaseOrders.data?.items || [];

  useEffect(() => {
    if (!rows.length) {
      setSelectedPoNumber("");
      return;
    }

    setSelectedPoNumber((current) =>
      current && rows.some((row) => row.order_number === current) ? current : rows[0].order_number
    );
  }, [rows]);

  useEffect(() => {
    let cancelled = false;

    async function loadDetail() {
      if (!selectedPoNumber) {
        setDetailState({
          status: "idle",
          data: null,
          error: "",
        });
        return;
      }

      setDetailState({
        status: "loading",
        data: null,
        error: "",
      });

      try {
        const payload = await apiFetch(`/purchase-orders/${encodeURIComponent(selectedPoNumber)}`);
        if (cancelled) {
          return;
        }

        setDetailState({
          status: "success",
          data: payload,
          error: "",
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setDetailState({
          status: "error",
          data: null,
          error: error.message || "Unable to load purchase order detail.",
        });
      }
    }

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [selectedPoNumber, detailRequestKey]);

  const columns = [
    {
      key: "order_number",
      header: "PO Number",
      render: (row) => (
        <button
          type="button"
          className="table-link"
          onClick={() => setSelectedPoNumber(row.order_number)}
        >
          {row.order_number}
        </button>
      ),
    },
    { key: "supplier_name", header: "Supplier" },
    {
      key: "status",
      header: "Status",
      render: (row) => <span className="pill">{formatLabel(row.status)}</span>,
    },
    {
      key: "progress",
      header: "Progress",
      render: (row) =>
        `${formatNumber(row.total_received)} / ${formatNumber(row.total_ordered)} received`,
    },
    {
      key: "expected_at",
      header: "Expected",
      render: (row) => formatDate(row.expected_at),
    },
    {
      key: "updated_at",
      header: "Updated",
      render: (row) => formatDate(row.updated_at),
    },
  ];

  function handleReceive(poNumber) {
    window.history.pushState({}, "", `/receive-goods?po=${encodeURIComponent(poNumber)}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Inbound"
        title="Purchase Orders"
        description="Review inbound orders, inspect outstanding lines, and jump straight into the receive-goods workflow."
        actions={
          <Button variant="secondary" onClick={purchaseOrders.reload}>
            Refresh
          </Button>
        }
      />

      <Card title="All Purchase Orders" subtitle="Live Data">
        <DataTable
          columns={columns}
          rows={rows}
          loading={purchaseOrders.status === "loading"}
          error={purchaseOrders.status === "error" ? purchaseOrders.error : ""}
          emptyMessage="No purchase orders are available in the current dataset."
          onRetry={purchaseOrders.reload}
        />
      </Card>

      <Card title="Purchase Order Detail" subtitle="Selected Order">
        <PurchaseOrderDetail
          status={detailState.status}
          error={detailState.error}
          detail={detailState.data}
          onRetry={() => setDetailRequestKey((current) => current + 1)}
          onReceive={handleReceive}
        />
      </Card>
    </div>
  );
}

export default PurchaseOrdersPage;
