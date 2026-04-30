import { useEffect, useState } from "react";
import Layout from "./components/Layout";
import DashboardPage from "./pages/DashboardPage";
import PurchaseOrdersPage from "./pages/PurchaseOrdersPage";
import NewPurchaseOrderPage from "./pages/NewPurchaseOrderPage";
import ReceiveGoodsPage from "./pages/ReceiveGoodsPage";
import SalesOrdersPage from "./pages/SalesOrdersPage";
import SuppliersPage from "./pages/SuppliersPage";
import ProductsPage from "./pages/ProductsPage";
import StockPage from "./pages/StockPage";
import LocationsPage from "./pages/LocationsPage";
import SerialTrackerPage from "./pages/SerialTrackerPage";
import SearchPage from "./pages/SearchPage";
import ReturnsPage from "./pages/ReturnsPage";
import ExceptionDashboardPage from "./pages/ExceptionDashboardPage";
import AuditLogPage from "./pages/AuditLogPage";
import { useApiResource } from "./hooks/useApiResource";
import { UserProvider } from "./context/UserContext";

const navigationItems = [
  {
    key: "dashboard",
    label: "Dashboard",
    path: "/",
    description: "Operational overview for inventory, orders, and exceptions.",
  },
  {
    key: "search",
    label: "Search",
    path: "/search",
    description: "Global search across orders, serials, customers, and products.",
  },
  {
    key: "purchase-orders",
    label: "Purchase Orders",
    path: "/purchase-orders",
    description: "Raise, receive, and reconcile purchase orders from suppliers.",
  },
  {
    key: "receive-goods",
    label: "Receive Goods",
    path: "/receive-goods",
    description: "Book supplier deliveries and update inbound stock in real time.",
  },
  {
    key: "sales-orders",
    label: "Sales Orders",
    path: "/sales-orders",
    description: "Create customer orders, allocate stock, and dispatch goods.",
  },
  {
    key: "suppliers",
    label: "Suppliers",
    path: "/suppliers",
    description: "Maintain supplier records, contacts, and purchasing availability.",
  },
  {
    key: "products",
    label: "Products",
    path: "/products",
    description: "Maintain SKUs, tracking rules, and unit-cost master data.",
  },
  {
    key: "stock",
    label: "Stock",
    path: "/stock",
    description: "Track movements, receiving flow, and stock handling activity.",
  },
  {
    key: "locations",
    label: "Locations",
    path: "/locations",
    description: "Define holding, shelf, bin, dispatch, and damaged locations.",
  },
  {
    key: "serial-tracker",
    label: "Serial Tracker",
    path: "/serial-tracker",
    description: "Look up any serial number to see its location and movement history.",
  },
  {
    key: "returns",
    label: "Returns",
    path: "/returns",
    description: "Log customer returns, quarantine goods, and raise warranty replacements.",
  },
  {
    key: "exceptions",
    label: "Exceptions",
    path: "/exceptions",
    description: "Management view of overdue orders, stalled stock, and urgent customer deadlines.",
  },
  {
    key: "audit-log",
    label: "Audit Log",
    path: "/audit-log",
    description: "User activity and action history for compliance and accountability.",
  },
];

const routes = [
  {
    key: "dashboard",
    path: "/",
    navPath: "/",
    component: DashboardPage,
  },
  {
    key: "search",
    path: "/search",
    navPath: "/search",
    component: SearchPage,
  },
  {
    key: "purchase-order-create",
    path: "/purchase-orders/new",
    navPath: "/purchase-orders",
    component: NewPurchaseOrderPage,
  },
  {
    key: "purchase-orders",
    path: "/purchase-orders",
    navPath: "/purchase-orders",
    component: PurchaseOrdersPage,
  },
  {
    key: "receive-goods",
    path: "/receive-goods",
    navPath: "/receive-goods",
    component: ReceiveGoodsPage,
  },
  {
    key: "sales-orders",
    path: "/sales-orders",
    navPath: "/sales-orders",
    component: SalesOrdersPage,
  },
  {
    key: "suppliers",
    path: "/suppliers",
    navPath: "/suppliers",
    component: SuppliersPage,
  },
  {
    key: "products",
    path: "/products",
    navPath: "/products",
    component: ProductsPage,
  },
  {
    key: "stock",
    path: "/stock",
    navPath: "/stock",
    component: StockPage,
  },
  {
    key: "locations",
    path: "/locations",
    navPath: "/locations",
    component: LocationsPage,
  },
  {
    key: "serial-tracker",
    path: "/serial-tracker",
    navPath: "/serial-tracker",
    component: SerialTrackerPage,
  },
  {
    key: "returns",
    path: "/returns",
    navPath: "/returns",
    component: ReturnsPage,
  },
  {
    key: "exceptions",
    path: "/exceptions",
    navPath: "/exceptions",
    component: ExceptionDashboardPage,
  },
  {
    key: "audit-log",
    path: "/audit-log",
    navPath: "/audit-log",
    component: AuditLogPage,
  },
];

function getPathname(url) {
  return String(url || "/").split("?")[0] || "/";
}

function resolveRoute(pathname) {
  return routes.find((route) => route.path === pathname) || routes[0];
}

function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname || "/");
  const [searchQuery, setSearchQuery] = useState("");
  const currentRoute = resolveRoute(pathname);
  const currentItem =
    navigationItems.find((item) => item.path === currentRoute.navPath) || navigationItems[0];
  const ActivePage = currentRoute.component || DashboardPage;
  const health = useApiResource("/health");

  useEffect(() => {
    function handlePopState() {
      setPathname(window.location.pathname || "/");
    }

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  function handleNavigate(nextPath) {
    const nextPathname = getPathname(nextPath);
    const currentFullPath = `${window.location.pathname}${window.location.search}`;

    if (nextPath === currentFullPath) {
      return;
    }
    window.history.pushState({}, "", nextPath);
    setPathname(nextPathname);
  }

  // Called by the sidebar quick-search: navigate to /search and carry the query
  function handleSearch(term) {
    setSearchQuery(term);
    if (pathname !== "/search") {
      window.history.pushState({}, "", "/search");
      setPathname("/search");
    }
  }

  // Build page-specific props
  let pageProps = {};
  if (currentRoute.key === "dashboard") {
    pageProps = { health };
  } else if (currentRoute.key === "search") {
    pageProps = { initialQuery: searchQuery, onNavigate: handleNavigate };
  } else if (
    currentRoute.key === "purchase-orders" ||
    currentRoute.key === "purchase-order-create" ||
    currentRoute.key === "receive-goods"
  ) {
    pageProps = { onNavigate: handleNavigate };
  }

  return (
    <UserProvider>
      <Layout
        navigationItems={navigationItems}
        activePath={currentItem.path}
        onNavigate={handleNavigate}
        onSearch={handleSearch}
        health={health}
      >
        <ActivePage {...pageProps} />
      </Layout>
    </UserProvider>
  );
}

export default App;
