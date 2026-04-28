import Button from "../components/Button";
import Card from "../components/Card";
import DataTable from "../components/DataTable";
import PageHeader from "../components/PageHeader";
import ScannerInput from "../components/ScannerInput";
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

const receiptColumns = [
  { key: "receipt_number", header: "Receipt" },
  { key: "order_number", header: "PO Number" },
  { key: "delivery_number", header: "Delivery" },
  {
    key: "received_at",
    header: "Received",
    render: (row) => formatDate(row.received_at),
  },
];

function PurchaseOrdersPage() {
  const purchaseOrders = useApiResource("/purchase-orders");
  const goodsReceiving = useApiResource("/goods-receiving");
  const rows = purchaseOrders.data?.items || [];
  const receiptRows = goodsReceiving.data?.items || [];

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

      <Card title="Receive Goods Serial Entry" subtitle="Scanner Ready">
        <ScannerInput
          label="Scan serial into the current receipt"
          placeholder="Scan inbound barcode or QR serial"
          helperText="Scanner focus stays here so handheld devices can type the serial and submit with Enter."
          submitLabel="Add Serial"
          preventDuplicates
          duplicateMessage="That serial is already in the current receipt capture list."
          successMessage="Serial captured for the next goods receipt."
          listTitle="Scanned Receipt Serials"
          emptyListMessage="Inbound serials captured during receiving will collect here."
          normalizeValue={(value) => value.trim().toUpperCase()}
          onSubmit={async (value) => ({
            item: {
              key: value,
              label: value,
              meta: "Queued for receive-goods validation.",
            },
          })}
        />
      </Card>

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

      <Card title="Recent Goods Receipts" subtitle="Existing Receive Goods Flow">
        <DataTable
          columns={receiptColumns}
          rows={receiptRows}
          loading={goodsReceiving.status === "loading"}
          error={goodsReceiving.status === "error" ? goodsReceiving.error : ""}
          emptyMessage="No goods receipts are available in the current dataset."
          onRetry={goodsReceiving.reload}
        />
      </Card>
    </div>
  );
}

export default PurchaseOrdersPage;
