import { useState } from "react";
import Button from "../components/Button";
import Card from "../components/Card";
import DataTable from "../components/DataTable";
import PageHeader from "../components/PageHeader";
import StatusPill from "../components/StatusPill";
import { useApiResource } from "../hooks/useApiResource";
import { formatDate } from "../lib/formatters";

const columns = [
  { key: "order_number", header: "PO Number" },
  { key: "supplier_name", header: "Supplier" },
  {
    key: "status",
    header: "Status",
    render: (row) => <StatusPill value={row.status} />,
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
  const [search, setSearch] = useState("");
  const allRows = purchaseOrders.data?.items || [];

  const rows = search.trim()
    ? allRows.filter((r) => {
        const term = search.toLowerCase();
        return (
          r.order_number?.toLowerCase().includes(term) ||
          r.supplier_name?.toLowerCase().includes(term) ||
          r.status?.toLowerCase().includes(term)
        );
      })
    : allRows;

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
        <div className="table-search-bar">
          <input
            type="search"
            className="table-search-input"
            placeholder="Filter by PO number, supplier, or status…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Filter purchase orders"
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
          loading={purchaseOrders.status === "loading"}
          error={purchaseOrders.status === "error" ? purchaseOrders.error : ""}
          emptyMessage={search ? `No purchase orders match "${search}".` : "No purchase orders are available in the current dataset."}
          onRetry={purchaseOrders.reload}
        />
      </Card>
    </div>
  );
}

export default PurchaseOrdersPage;
