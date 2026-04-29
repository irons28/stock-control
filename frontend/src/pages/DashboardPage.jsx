import Button from "../components/Button";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";
import { formatNumber } from "../lib/formatters";

const dashboardCards = [
  {
    key: "overduePurchaseOrders",
    title: "Overdue Purchase Orders",
    badge: "Attention",
    emptyMessage: "No overdue supplier orders.",
    detail: "Supplier orders past their expected delivery date with outstanding lines.",
    actionLabel: "Open Purchase Orders",
    path: "/purchase-orders",
  },
  {
    key: "partiallyReceivedOrders",
    title: "Partially Received Orders",
    badge: "In Progress",
    emptyMessage: "No partially received orders.",
    detail: "Purchase orders with some inbound stock received but still outstanding.",
    actionLabel: "Review Receiving",
    path: "/purchase-orders",
  },
  {
    key: "stockAwaitingAllocation",
    title: "Stock Awaiting Allocation",
    badge: "Queue",
    emptyMessage: "No stock waiting to be allocated.",
    detail: "Units received into stock not yet assigned to any customer demand.",
    actionLabel: "View Stock",
    path: "/stock",
  },
  {
    key: "urgentCustomerOrders",
    title: "Urgent Customer Orders",
    badge: "Priority",
    emptyMessage: "No urgent customer orders.",
    detail: "Customer orders due today or tomorrow with outstanding dispatch lines.",
    actionLabel: "Open Sales Orders",
    path: "/sales-orders",
  },
  {
    key: "dispatchReadyItems",
    title: "Dispatch-Ready Items",
    badge: "Ready",
    emptyMessage: "No items staged for dispatch.",
    detail: "Allocated order quantity fully staged and ready to leave the warehouse.",
    actionLabel: "Review Dispatch",
    path: "/sales-orders",
  },
];

function getStatusTone(key, value) {
  if (value <= 0) {
    return "neutral";
  }

  if (key === "overduePurchaseOrders" || key === "urgentCustomerOrders") {
    return "danger";
  }

  if (key === "dispatchReadyItems") {
    return "success";
  }

  return "warning";
}

function navigateTo(path) {
  if (window.location.pathname === path) {
    return;
  }

  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function DashboardCard({ config, value }) {
  const tone = getStatusTone(config.key, value);
  const message = value > 0 ? config.detail : config.emptyMessage;

  return (
    <button
      type="button"
      className="dashboard-summary-card"
      onClick={() => navigateTo(config.path)}
    >
      <Card className={`dashboard-summary-card-shell tone-${tone}`}>
        <div className="dashboard-card-topline">
          <p className="dashboard-card-label">{config.title}</p>
          <span className={`status-badge ${tone}`}>{config.badge}</span>
        </div>
        <strong className="dashboard-card-value">{formatNumber(value)}</strong>
        <p className="dashboard-card-detail">{message}</p>
        <span className="dashboard-card-link">{config.actionLabel}</span>
      </Card>
    </button>
  );
}

function DashboardLoadingState() {
  return (
    <section className="dashboard-card-grid" aria-label="Loading dashboard summary">
      {dashboardCards.map((card) => (
        <div key={card.key} className="card dashboard-loading-card">
          <div className="card-body">
            <div className="dashboard-card-topline">
              <div className="loading-block loading-label" />
              <div className="loading-block loading-badge" />
            </div>
            <div className="loading-block loading-value" />
            <div className="loading-block loading-detail" />
            <div className="loading-block loading-link" />
          </div>
        </div>
      ))}
    </section>
  );
}

function DashboardErrorState({ message, onRetry }) {
  return (
    <Card className="dashboard-state-card">
      <div className="dashboard-state">
        <span className="status-badge danger">Offline</span>
        <h3>Dashboard unavailable</h3>
        <p>{message}</p>
        <div className="dashboard-state-actions">
          <Button variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        </div>
      </div>
    </Card>
  );
}

function DashboardEmptyState() {
  return (
    <Card className="dashboard-state-card">
      <div className="dashboard-state">
        <span className="status-badge neutral">All Clear</span>
        <h3>No operational exceptions</h3>
        <p>
          The dashboard is connected. There are no overdue orders, urgent dispatch items, or
          unallocated stock in the current dataset.
        </p>
      </div>
    </Card>
  );
}

function DashboardPage() {
  const summary = useApiResource("/dashboard/summary");
  const counts = summary.data || null;
  const hasWork =
    counts &&
    Object.values(counts).some((value) => {
      const numericValue = Number(value);
      return Number.isFinite(numericValue) && numericValue > 0;
    });

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="Monitor purchasing exceptions, unallocated stock, urgent customer demand, and dispatch readiness in one operational view."
        actions={
          <Button variant="secondary" onClick={summary.reload}>
            Refresh
          </Button>
        }
      />

      {summary.status === "loading" ? <DashboardLoadingState /> : null}

      {summary.status === "error" ? (
        <DashboardErrorState
          message={`${summary.error} Confirm the backend is running on port 3001.`}
          onRetry={summary.reload}
        />
      ) : null}

      {summary.status === "success" && !hasWork ? <DashboardEmptyState /> : null}

      {summary.status === "success" && hasWork ? (
        <section className="dashboard-card-grid" aria-label="Operational dashboard summary">
          {dashboardCards.map((card) => (
            <DashboardCard key={card.key} config={card} value={Number(counts[card.key] || 0)} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

export default DashboardPage;
