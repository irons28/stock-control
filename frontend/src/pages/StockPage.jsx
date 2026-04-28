import Button from "../components/Button";
import Card from "../components/Card";
import DataTable from "../components/DataTable";
import PageHeader from "../components/PageHeader";
import StatusPill from "../components/StatusPill";
import { useApiResource } from "../hooks/useApiResource";
import { formatDateTime, formatNumber } from "../lib/formatters";

const columns = [
  {
    key: "movement_type",
    header: "Movement",
    render: (row) => <StatusPill value={row.movement_type} subtle />,
  },
  { key: "product_name", header: "Product" },
  {
    key: "route",
    header: "Route",
    render: (row) =>
      `${row.source_location_code || "External"} → ${row.destination_location_code || "External"}`,
  },
  {
    key: "quantity",
    header: "Qty",
    render: (row) => formatNumber(row.quantity),
  },
  {
    key: "reference_type",
    header: "Reference",
    render: (row) => (row.reference_type ? <StatusPill value={row.reference_type} subtle /> : "—"),
  },
  {
    key: "created_at",
    header: "Recorded",
    render: (row) => formatDateTime(row.created_at),
  },
];

function StockPage() {
  const stockMovements = useApiResource("/stock-movements");
  const rows = stockMovements.data?.items || [];

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Inventory"
        title="Stock"
        description="Review inventory movement history across receiving, transfers, dispatch, and exception handling."
        actions={
          <Button variant="secondary" onClick={stockMovements.reload}>
            Refresh
          </Button>
        }
      />

      <Card title="Stock Movements" subtitle="Live Data">
        <DataTable
          columns={columns}
          rows={rows}
          loading={stockMovements.status === "loading"}
          error={stockMovements.status === "error" ? stockMovements.error : ""}
          emptyMessage="No stock movements have been recorded yet."
          onRetry={stockMovements.reload}
        />
      </Card>
    </div>
  );
}

export default StockPage;
