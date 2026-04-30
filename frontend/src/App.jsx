import { useEffect, useState } from "react";
import Layout from "./components/Layout";
import DashboardPage from "./pages/DashboardPage";
import PurchaseOrdersPage from "./pages/PurchaseOrdersPage";
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

const pageComponents = {
  dashboard: DashboardPage,
  search: SearchPage,
  "purchase-orders": PurchaseOrdersPage,
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

function getItemByPath(pathname) {
  return navigationItems.find((item) => item.path === pathname) || navigationItems[0];
}

function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname || "/");
  const [searchQuery, setSearchQuery] = useState("");
  const currentItem = getItemByPath(pathname);
  const ActivePage = pageComponents[currentItem.key] || DashboardPage;
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
    if (nextPath === pathname) {
      return;
    }
    window.history.pushState({}, "", nextPath);
    setPathname(nextPath);
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
  if (currentItem.key === "dashboard") {
    pageProps = { health };
  } else if (currentItem.key === "search") {
    pageProps = { initialQuery: searchQuery, onNavigate: handleNavigate };
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
