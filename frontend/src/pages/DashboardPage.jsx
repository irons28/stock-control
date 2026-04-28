import Card from "../components/Card";
import DataTable from "../components/DataTable";
import PageHeader from "../components/PageHeader";
import { formatLabel } from "../lib/formatters";

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

function DashboardPage({ health }) {
  const schema = health.data?.schema;
  const tableCounts = schema?.tables || {};
  const serialStatusRows = schema?.serialStatusCounts || [];
  const requiredTableRows = (schema?.requiredTables || []).map((tableName) => ({
    tableName,
    rowCount: tableCounts[tableName] ?? 0,
  }));

  const tableColumns = [
    { key: "tableName", header: "Table" },
    {
      key: "rowCount",
      header: "Rows",
      render: (row) => row.rowCount,
    },
  ];

  const serialColumns = [
    {
      key: "status",
      header: "Serial Status",
      render: (row) => <span className="pill subtle">{formatLabel(row.status)}</span>,
    },
    { key: "count", header: "Count" },
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
          title="Required Tables"
          value={schema?.requiredTables?.length || 0}
          detail={schema?.ready ? "Schema is fully present" : `${schema?.missingTables?.length || 0} missing`}
          status={health.status}
          error={health.error}
        />
        <SummaryCard
          title="Products"
          value={tableCounts.products || 0}
          detail={`${tableCounts.serial_numbers || 0} serial numbers loaded`}
          status={health.status}
          error={health.error}
        />
        <SummaryCard
          title="Purchase Orders"
          value={tableCounts.purchase_orders || 0}
          detail={`${tableCounts.received_goods || 0} receipts recorded`}
          status={health.status}
          error={health.error}
        />
        <SummaryCard
          title="Sales Orders"
          value={tableCounts.sales_orders || 0}
          detail={`${tableCounts.dispatches || 0} dispatches created`}
          status={health.status}
          error={health.error}
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
              <dt>Schema Status</dt>
              <dd>{schema?.ready ? "Ready" : "Incomplete"}</dd>
            </div>
          </dl>
        </Card>

        <Card
          title="Table Row Counts"
          subtitle="Database"
          className="dashboard-panel"
        >
          <DataTable
            columns={tableColumns}
            rows={requiredTableRows}
            loading={health.status === "loading"}
            error={health.status === "error" ? health.error : ""}
            emptyMessage="Database status will appear here once the backend responds."
            onRetry={health.reload}
          />
        </Card>

        <Card
          title="Serial Status Summary"
          subtitle="Tracking"
          className="dashboard-panel dashboard-panel-wide"
        >
          <DataTable
            columns={serialColumns}
            rows={serialStatusRows}
            loading={health.status === "loading"}
            error={health.status === "error" ? health.error : ""}
            emptyMessage="Serial status counts will appear once seed data is loaded."
            onRetry={health.reload}
          />
        </Card>
      </section>
    </div>
  );
}

export default DashboardPage;
