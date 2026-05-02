import { useEffect, useState } from "react";
import Layout from "./components/Layout";
import DashboardPage from "./pages/DashboardPage";
import PurchaseOrdersPage from "./pages/PurchaseOrdersPage";
import NewPurchaseOrderPage from "./pages/NewPurchaseOrderPage";
import ReceiveGoodsPage from "./pages/ReceiveGoodsPage";
import SalesOrdersPage from "./pages/SalesOrdersPage";
import NewSalesOrderPage from "./pages/NewSalesOrderPage";
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
    description: "Book deliveries against open purchase orders and get suggested SO allocations.",
  },
  {
    key: "sales-orders",
    label: "Sales Orders",
    path: "/sales-orders",
    description: "Create customer orders, allocate stock, and dispatch goods.",
  },
  {
    key: "new-sales-order",
    label: "New Sales Order",
    path: "/sales-orders/new",
    description: "Create a customer order and allocate stock.",
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

const pageComponents = {
  dashboard: DashboardPage,
  search: SearchPage,
  "purchase-orders": PurchaseOrdersPage,
  "purchase-order-create": NewPurchaseOrderPage,
  "receive-goods": ReceiveGoodsPage,
  "new-sales-order": NewSalesOrderPage,
  "sales-orders": SalesOrdersPage,
  suppliers: SuppliersPage,
  products: ProductsPage,
  stock: StockPage,
  locations: LocationsPage,
  "serial-tracker": SerialTrackerPage,
  returns: ReturnsPage,
  exceptions: ExceptionDashboardPage,
  "audit-log": AuditLogPage,
};

// navPath lets sub-routes highlight their parent nav item in the sidebar
const routeNavPaths = {
  "new-sales-order": "/sales-orders",
  "purchase-order-create": "/purchase-orders",
};

// Direct path-to-key for routes not in navigationItems
const pathToKeyMap = {
  "/purchase-orders/new": "purchase-order-create",
};

function getPathname(url) {
  return String(url || "/").split("?")[0] || "/";
}

// navPath lets sub-routes highlight their parent nav item in the sidebar
function getItemByPath(pathname) {
  // Exact match first
  const exact = navigationItems.find((item) => item.path === pathname);
  if (exact) return exact;
  // Prefix match for sub-routes (e.g. /sales-orders/new → sales-orders key)
  const prefix = navigationItems.find(
    (item) => item.path !== "/" && pathname.startsWith(item.path + "/")
  );
  if (prefix) {
    // Return an item with the actual path so the correct page is resolved
    const actual = navigationItems.find((item) => item.path === pathname);
    return actual || prefix;
  }
  return navigationItems[0];
}

function resolveRouteKey(pathname) {
  const exact = navigationItems.find((item) => item.path === pathname);
  if (exact) return exact.key;
  return pathToKeyMap[pathname] || null;
}

function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname || "/");
  const [searchQuery, setSearchQuery] = useState("");
  const routeKey = resolveRouteKey(pathname);
  const currentItem = getItemByPath(pathname);
  // For sidebar highlighting: use navPath override if available
  const activeNavPath = routeKey && routeNavPaths[routeKey]
    ? routeNavPaths[routeKey]
    : currentItem.path;
  const ActivePage = (routeKey ? pageComponents[routeKey] : null) || pageComponents[currentItem.key] || DashboardPage;
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
  const effectiveKey = routeKey || currentItem.key;
  let pageProps = {};
  if (effectiveKey === "dashboard") {
    pageProps = { health };
  } else if (effectiveKey === "search") {
    pageProps = { initialQuery: searchQuery, onNavigate: handleNavigate };
  } else if (
    effectiveKey === "new-sales-order" ||
    effectiveKey === "purchase-orders" ||
    effectiveKey === "purchase-order-create" ||
    effectiveKey === "receive-goods"
  ) {
    pageProps = { onNavigate: handleNavigate };
  }

  return (
    <UserProvider>
      <Layout
        navigationItems={navigationItems}
        activePath={activeNavPath}
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
