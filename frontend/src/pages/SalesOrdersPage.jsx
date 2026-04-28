import { useState } from "react";
import Button from "../components/Button";
import Card from "../components/Card";
import DataTable from "../components/DataTable";
import PageHeader from "../components/PageHeader";
import StatusPill from "../components/StatusPill";
import { useApiResource } from "../hooks/useApiResource";
import { formatDate } from "../lib/formatters";

const columns = [
  { key: "order_number", header: "SO Number" },
  { key: "customer_name", header: "Customer" },
  {
    key: "status",
    header: "Status",
    render: (row) => <StatusPill value={row.status} />,
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
  const [search, setSearch] = useState("");
  const allRows = salesOrders.data?.items || [];

  const rows = search.trim()
    ? allRows.filter((r) => {
        const term = search.toLowerCase();
        return (
          r.order_number?.toLowerCase().includes(term) ||
          r.customer_name?.toLowerCase().includes(term) ||
          r.status?.toLowerCase().includes(term)
        );
      })
    : allRows;

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
        <div className="table-search-bar">
          <input
            type="search"
            className="table-search-input"
            placeholder="Filter by SO number, customer, or status…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Filter sales orders"
          />
          {search && (
            <span className="table-search-count">
              {rows.length} of {allRows.length}
            </span>
          )}
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          loading={salesOrders.status === "loading"}
          error={salesOrders.status === "error" ? salesOrders.error : ""}
          emptyMessage={search ? `No sales orders match "${search}".` : "No sales orders are available in the current dataset."}
          onRetry={salesOrders.reload}
        />
      </Card>
    </div>
  );
}

export default SalesOrdersPage;
