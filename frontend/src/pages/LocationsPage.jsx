import Button from "../components/Button";
import Card from "../components/Card";
import DataTable from "../components/DataTable";
import PageHeader from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";
import { formatDate, formatLabel } from "../lib/formatters";

const columns = [
  { key: "code", header: "Code" },
  { key: "name", header: "Location" },
  {
    key: "location_type",
    header: "Type",
    render: (row) => <span className="pill subtle">{formatLabel(row.location_type)}</span>,
  },
  {
    key: "status",
    header: "Status",
    render: (row) => <span className="pill">{formatLabel(row.status)}</span>,
  },
  {
    key: "updated_at",
    header: "Updated",
    render: (row) => formatDate(row.updated_at),
  },
];

function LocationsPage() {
  const locations = useApiResource("/stock-locations");
  const rows = locations.data?.items || [];

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Warehouse"
        title="Locations"
        description="Keep holding, shelf, bin, dispatch, and exception locations visible and easy to manage."
        actions={
          <Button variant="secondary" onClick={locations.reload}>
            Refresh
          </Button>
        }
      />

      <Card title="Stock Locations" subtitle="Live Data">
        <DataTable
          columns={columns}
          rows={rows}
          loading={locations.status === "loading"}
          error={locations.status === "error" ? locations.error : ""}
          emptyMessage="No locations are available in the current dataset."
          onRetry={locations.reload}
        />
      </Card>
    </div>
  );
}

export default LocationsPage;
