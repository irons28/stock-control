import Button from "../components/Button";
import Card from "../components/Card";
import DataTable from "../components/DataTable";
import PageHeader from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";
import { formatDate, formatLabel } from "../lib/formatters";

const columns = [
  { key: "order_number", header: "SO Number" },
  { key: "customer_name", header: "Customer" },
  {
    key: "status",
    header: "Status",
    render: (row) => <span className="pill">{formatLabel(row.status)}</span>,
  },
  {
    key: "requested_at",
    header: "Requested",
    render: (row) => formatDate(row.requested_at),
  },
  {
    key: "dispatch_due_at",
    header: "Dispatch Due",
    render: (row) => formatDate(row.dispatch_due_at),
  },
  {
    key: "updated_at",
    header: "Updated",
    render: (row) => formatDate(row.updated_at),
  },
];

function SalesOrdersPage() {
  const salesOrders = useApiResource("/sales-orders");
  const rows = salesOrders.data?.items || [];

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Outbound"
        title="Sales Orders"
        description="Monitor customer demand, dispatch deadlines, and operational status without leaving the shell."
        actions={
          <Button variant="secondary" onClick={salesOrders.reload}>
            Refresh
          </Button>
        }
      />

      <Card title="All Sales Orders" subtitle="Live Data">
        <DataTable
          columns={columns}
          rows={rows}
          loading={salesOrders.status === "loading"}
          error={salesOrders.status === "error" ? salesOrders.error : ""}
          emptyMessage="No sales orders are available in the current dataset."
          onRetry={salesOrders.reload}
        />
      </Card>
    </div>
  );
}

export default SalesOrdersPage;
