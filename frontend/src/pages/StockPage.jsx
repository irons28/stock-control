import Button from "../components/Button";
import Card from "../components/Card";
import DataTable from "../components/DataTable";
import PageHeader from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";
import { formatDateTime, formatLabel, formatNumber } from "../lib/formatters";

const columns = [
  {
    key: "movement_type",
    header: "Movement",
    render: (row) => <span className="pill">{formatLabel(row.movement_type)}</span>,
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
    header: "Quantity",
    render: (row) => formatNumber(row.quantity),
  },
  {
    key: "reference_type",
    header: "Reference",
    render: (row) => formatLabel(row.reference_type),
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
