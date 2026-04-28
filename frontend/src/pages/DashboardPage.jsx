import Card from "../components/Card";
import DataTable from "../components/DataTable";
import PageHeader from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";
import { formatDate, formatDateTime, formatLabel } from "../lib/formatters";

function SummaryCard({ title, value, detail, status, error }) {
  return (
    <Card className="summary-card">
      <p className="summary-label">{title}</p>
      <strong className="summary-value">
        {status === "loading" ? "…" : status === "error" ? "!" : value}
      </strong>
      <p className="summary-detail">{status === "error" ? error : detail}</p>
    </Card>
  );
}

function DashboardPage() {
  const health = useApiResource("/health");
  const purchaseOrders = useApiResource("/purchase-orders");
  const salesOrders = useApiResource("/sales-orders");
  const products = useApiResource("/products");
  const stockMovements = useApiResource("/stock-movements");
  const locations = useApiResource("/stock-locations");

  const purchaseRows = purchaseOrders.data?.items || [];
  const salesRows = salesOrders.data?.items || [];
  const productRows = products.data?.items || [];
  const movementRows = stockMovements.data?.items || [];
  const locationRows = locations.data?.items || [];

  const pendingPurchaseOrders = purchaseRows.filter((item) => item.status !== "received").length;
  const openSalesOrders = salesRows.filter((item) => item.status !== "dispatched").length;
  const dispatchReadyCount = salesRows.filter(
    (item) => item.summary?.allocationStatus === "Ready to Dispatch",
  ).length;
  const activeProducts = productRows.filter((item) => item.status === "active").length;
  const activeLocations = locationRows.filter((item) => item.status === "active").length;

  const purchaseColumns = [
    { key: "order_number", header: "PO Number" },
    { key: "supplier_name", header: "Supplier" },
    {
      key: "status",
      header: "Status",
      render: (row) => <span className="pill">{formatLabel(row.status)}</span>,
    },
    {
      key: "expected_at",
      header: "Expected",
      render: (row) => formatDate(row.expected_at),
    },
  ];

  const movementColumns = [
    {
      key: "movement_type",
      header: "Type",
      render: (row) => <span className="pill subtle">{formatLabel(row.movement_type)}</span>,
    },
    { key: "product_name", header: "Product" },
    {
      key: "route",
      header: "Route",
      render: (row) =>
        `${row.source_location_code || "External"} → ${row.destination_location_code || "External"}`,
    },
    {
      key: "created_at",
      header: "Recorded",
      render: (row) => formatDateTime(row.created_at),
    },
  ];

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="A single operational view for open orders, core master data, and the latest stock activity."
      />

      <section className="summary-grid">
        <SummaryCard
          title="Purchase Orders"
          value={purchaseRows.length}
          detail={`${pendingPurchaseOrders} still in progress`}
          status={purchaseOrders.status}
          error={purchaseOrders.error}
        />
        <SummaryCard
          title="Sales Orders"
          value={salesRows.length}
          detail={`${openSalesOrders} still awaiting dispatch, ${dispatchReadyCount} dispatch-ready`}
          status={salesOrders.status}
          error={salesOrders.error}
        />
        <SummaryCard
          title="Products"
          value={productRows.length}
          detail={`${activeProducts} currently active`}
          status={products.status}
          error={products.error}
        />
        <SummaryCard
          title="Locations"
          value={locationRows.length}
          detail={`${activeLocations} active stock locations`}
          status={locations.status}
          error={locations.error}
        />
      </section>

      <section className="dashboard-grid">
        <Card
          title="System Readiness"
          subtitle="Platform"
          className="dashboard-panel"
        >
          <dl className="definition-list">
            <div>
              <dt>Backend</dt>
              <dd>{health.status === "success" ? "Connected" : "Unavailable"}</dd>
            </div>
            <div>
              <dt>Database Time</dt>
              <dd>{health.data?.database?.database_time || "—"}</dd>
            </div>
            <div>
              <dt>Movement Records</dt>
              <dd>{stockMovements.status === "success" ? movementRows.length : "—"}</dd>
            </div>
          </dl>
        </Card>

        <Card
          title="Recent Purchase Orders"
          subtitle="Inbound"
          className="dashboard-panel"
        >
          <DataTable
            columns={purchaseColumns}
            rows={purchaseRows.slice(0, 5)}
            loading={purchaseOrders.status === "loading"}
            error={purchaseOrders.status === "error" ? purchaseOrders.error : ""}
            emptyMessage="No purchase orders have been created yet."
            onRetry={purchaseOrders.reload}
          />
        </Card>

        <Card
          title="Latest Stock Activity"
          subtitle="Inventory"
          className="dashboard-panel dashboard-panel-wide"
        >
          <DataTable
            columns={movementColumns}
            rows={movementRows.slice(0, 6)}
            loading={stockMovements.status === "loading"}
            error={stockMovements.status === "error" ? stockMovements.error : ""}
            emptyMessage="Stock movements will appear here once receiving or dispatch starts."
            onRetry={stockMovements.reload}
          />
        </Card>
      </section>
    </div>
  );
}

export default DashboardPage;
