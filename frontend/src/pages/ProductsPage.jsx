import Button from "../components/Button";
import Card from "../components/Card";
import DataTable from "../components/DataTable";
import PageHeader from "../components/PageHeader";
import StatusPill from "../components/StatusPill";
import { useApiResource } from "../hooks/useApiResource";
import { formatCurrency, formatLabel } from "../lib/formatters";

const columns = [
  { key: "sku", header: "SKU" },
  { key: "name", header: "Product" },
  { key: "category", header: "Category" },
  {
    key: "tracking_mode",
    header: "Tracking",
    render: (row) => <span className="pill neutral">{formatLabel(row.tracking_mode)}</span>,
  },
  {
    key: "cost_price",
    header: "Cost",
    render: (row) => formatCurrency(row.cost_price),
  },
  {
    key: "sell_price",
    header: "Sell",
    render: (row) => formatCurrency(row.sell_price),
  },
  {
    key: "status",
    header: "Status",
    render: (row) => <StatusPill value={row.status} />,
  },
];

function ProductsPage() {
  const products = useApiResource("/products");
  const rows = products.data?.items || [];

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Master Data"
        title="Products"
        description="A clean SKU list for pricing, tracking rules, and the product catalogue needed by purchasing and fulfilment."
        actions={
          <Button variant="secondary" onClick={products.reload}>
            Refresh
          </Button>
        }
      />

      <Card title="Product Catalogue" subtitle="Live Data">
        <DataTable
          columns={columns}
          rows={rows}
          loading={products.status === "loading"}
          error={products.status === "error" ? products.error : ""}
          emptyMessage="No products are available in the current dataset."
          onRetry={products.reload}
        />
      </Card>
    </div>
  );
}

export default ProductsPage;
