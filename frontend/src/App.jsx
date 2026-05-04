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
import ImportPage from "./pages/ImportPage";
import { useApiResource } from "./hooks/useApiResource";
import { UserProvider, useUser } from "./context/UserContext";
import { canDo } from "./hooks/usePermission";

// permission = which permission key guards this nav item (undefined = always visible)
const allNavigationItems = [
  {
    key: "dashboard",
    label: "Dashboard",
    path: "/",
    description: "Operational overview for inventory, orders, and exceptions.",
    permission: "dashboard:view",
  },
  {
    key: "search",
    label: "Search",
    path: "/search",
    description: "Global search across orders, serials, customers, and products.",
    permission: "stock:view",
  },
  {
    key: "purchase-orders",
    label: "Purchase Orders",
    path: "/purchase-orders",
    description: "Raise, receive, and reconcile purchase orders from suppliers.",
    permission: "po:view",
  },
  {
    key: "receive-goods",
    label: "Receive Goods",
    path: "/receive-goods",
    description: "Book deliveries against open purchase orders and get suggested SO allocations.",
    permission: "po:receive",
  },
  {
    key: "sales-orders",
    label: "Sales Orders",
    path: "/sales-orders",
    description: "Create customer orders, allocate stock, and dispatch goods.",
    permission: "so:view",
  },
  {
    key: "new-sales-order",
    label: "New Sales Order",
    path: "/sales-orders/new",
    description: "Create a customer order and allocate stock.",
    permission: "so:create",
  },
  {
    key: "suppliers",
    label: "Suppliers",
    path: "/suppliers",
    description: "Maintain supplier records, contacts, and purchasing availability.",
    permission: "master-data:view",
  },
  {
    key: "products",
    label: "Products",
    path: "/products",
    description: "Maintain SKUs, tracking rules, and unit-cost master data.",
    permission: "master-data:view",
  },
  {
    key: "stock",
    label: "Stock",
    path: "/stock",
    description: "Track movements, receiving flow, and stock handling activity.",
    permission: "stock:view",
  },
  {
    key: "locations",
    label: "Locations",
    path: "/locations",
    description: "Define holding, shelf, bin, dispatch, and damaged locations.",
    permission: "master-data:manage",
  },
  {
    key: "serial-tracker",
    label: "Serial Tracker",
    path: "/serial-tracker",
    description: "Look up any serial number to see its location and movement history.",
    permission: "serial:view",
  },
  {
    key: "returns",
    label: "Returns",
    path: "/returns",
    description: "Log customer returns, quarantine goods, and raise warranty replacements.",
    permission: "returns:manage",
  },
  {
    key: "exceptions",
    label: "Exceptions",
    path: "/exceptions",
    description: "Management view of overdue orders, stalled stock, and urgent customer deadlines.",
    permission: "exceptions:view",
  },
  {
    key: "audit-log",
    label: "Audit Log",
    path: "/audit-log",
    description: "User activity and action history for compliance and accountability.",
    permission: "audit:view",
  },
  {
    key: "import",
    label: "Import Data",
    path: "/import",
    description: "Bulk-import products, customers, suppliers and orders from CSV.",
    permission: "import:use",
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
  import: ImportPage,
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

function getItemByPath(pathname, items) {
  const exact = items.find((item) => item.path === pathname);
  if (exact) return exact;
  const prefix = items.find(
    (item) => item.path !== "/" && pathname.startsWith(item.path + "/")
  );
  if (prefix) {
    const actual = items.find((item) => item.path === pathname);
    return actual || prefix;
  }
  return items[0] || allNavigationItems[0];
}

function resolveRouteKey(pathname) {
  const exact = allNavigationItems.find((item) => item.path === pathname);
  if (exact) return exact.key;
  return pathToKeyMap[pathname] || null;
}

function AppShell() {
  const { currentUser } = useUser();
  const [pathname, setPathname] = useState(() => window.location.pathname || "/");
  const [searchQuery, setSearchQuery] = useState("");
  const health = useApiResource("/health");

  // Filter nav items the current role can see
  const navigationItems = allNavigationItems.filter(
    (item) => !item.permission || canDo(currentUser.role, item.permission)
  );

  const routeKey = resolveRouteKey(pathname);
  const currentItem = getItemByPath(pathname, navigationItems);
  const activeNavPath = routeKey && routeNavPaths[routeKey]
    ? routeNavPaths[routeKey]
    : currentItem.path;
  const ActivePage = (routeKey ? pageComponents[routeKey] : null) || pageComponents[currentItem.key] || DashboardPage;

  useEffect(() => {
    function handlePopState() {
      setPathname(window.location.pathname || "/");
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function handleNavigate(nextPath) {
    const nextPathname = getPathname(nextPath);
    const currentFullPath = `${window.location.pathname}${window.location.search}`;
    if (nextPath === currentFullPath) return;
    window.history.pushState({}, "", nextPath);
    setPathname(nextPathname);
  }

  function handleSearch(term) {
    setSearchQuery(term);
    if (pathname !== "/search") {
      window.history.pushState({}, "", "/search");
      setPathname("/search");
    }
  }

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
    <Layout
      navigationItems={navigationItems}
      activePath={activeNavPath}
      onNavigate={handleNavigate}
      onSearch={handleSearch}
      health={health}
    >
      <ActivePage {...pageProps} />
    </Layout>
  );
}

function App() {
  return (
    <UserProvider>
      <AppShell />
    </UserProvider>
  );
}

export default App;
