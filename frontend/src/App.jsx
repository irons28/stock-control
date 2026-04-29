import { useEffect, useState } from "react";
import Layout from "./components/Layout";
import DashboardPage from "./pages/DashboardPage";
import PurchaseOrdersPage from "./pages/PurchaseOrdersPage";
import SalesOrdersPage from "./pages/SalesOrdersPage";
import ProductsPage from "./pages/ProductsPage";
import StockPage from "./pages/StockPage";
import LocationsPage from "./pages/LocationsPage";
import SerialTrackerPage from "./pages/SerialTrackerPage";
import ExceptionDashboardPage from "./pages/ExceptionDashboardPage";
import { useApiResource } from "./hooks/useApiResource";

const navigationItems = [
  {
    key: "dashboard",
    label: "Dashboard",
    path: "/",
    description: "Operational overview for inventory, orders, and exceptions.",
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
    key: "products",
    label: "Products",
    path: "/products",
    description: "Maintain SKUs, pricing, tracking mode, and supplier defaults.",
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
    key: "exceptions",
    label: "Exceptions",
    path: "/exceptions",
    description: "Management view of overdue orders, stalled stock, and urgent customer deadlines.",
  },
];

const pageComponents = {
  dashboard: DashboardPage,
  "purchase-orders": PurchaseOrdersPage,
  "sales-orders": SalesOrdersPage,
  products: ProductsPage,
  stock: StockPage,
  locations: LocationsPage,
  "serial-tracker": SerialTrackerPage,
  exceptions: ExceptionDashboardPage,
};

function getItemByPath(pathname) {
  return navigationItems.find((item) => item.path === pathname) || navigationItems[0];
}

function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname || "/");
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

  // Pass health to Dashboard so it can show system readiness without a duplicate fetch.
  const pageProps = currentItem.key === "dashboard" ? { health } : {};

  return (
    <Layout
      navigationItems={navigationItems}
      activePath={currentItem.path}
      onNavigate={handleNavigate}
      health={health}
    >
      <ActivePage {...pageProps} />
    </Layout>
  );
}

export default App;
