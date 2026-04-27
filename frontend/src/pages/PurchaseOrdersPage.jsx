import Button from "../components/Button";
import Card from "../components/Card";
import DataTable from "../components/DataTable";
import PageHeader from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";
import { formatDate, formatLabel } from "../lib/formatters";

const columns = [
  { key: "order_number", header: "PO Number" },
  { key: "supplier_name", header: "Supplier" },
  {
    key: "status",
    header: "Status",
    render: (row) => <span className="pill">{formatLabel(row.status)}</span>,
  },
  {
    key: "ordered_at",
    header: "Ordered",
    render: (row) => formatDate(row.ordered_at),
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

function PurchaseOrdersPage() {
  const purchaseOrders = useApiResource("/purchase-orders");
  const rows = purchaseOrders.data?.items || [];

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Inbound"
        title="Purchase Orders"
        description="Track supplier orders, expected arrivals, and receiving progress in one operational list."
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
    </div>
  );
}

export default PurchaseOrdersPage;
