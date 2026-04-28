import { useEffect, useState } from "react";
import Layout from "./components/Layout";
import DashboardPage from "./pages/DashboardPage";
import DispatchPage from "./pages/DispatchPage";
import PurchaseOrdersPage from "./pages/PurchaseOrdersPage";
import ReceiveGoodsPage from "./pages/ReceiveGoodsPage";
import SalesOrdersPage from "./pages/SalesOrdersPage";
import ProductsPage from "./pages/ProductsPage";
import SerialTrackerPage from "./pages/SerialTrackerPage";
import StockPage from "./pages/StockPage";
import LocationsPage from "./pages/LocationsPage";
import ImportsPage from "./pages/ImportsPage";
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
    key: "receive-goods",
    label: "Receive Goods",
    path: "/receive-goods",
    description: "Receive partial or complete deliveries and capture serial numbers.",
  },
  {
    key: "sales-orders",
    label: "Sales Orders",
    path: "/sales-orders",
    description: "Create customer orders, allocate stock, and dispatch goods.",
  },
  {
    key: "dispatch",
    label: "Dispatch",
    path: "/dispatch",
    description: "Review dispatch-ready orders, verify serials, and confirm shipment.",
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
    key: "serial-tracker",
    label: "Serial Tracker",
    path: "/serial-tracker",
    description: "Find where a serial came from, where it went, and what happened next.",
  },
  {
    key: "locations",
    label: "Locations",
    path: "/locations",
    description: "Define holding, shelf, bin, dispatch, and damaged locations.",
  },
  {
    key: "imports",
    label: "Imports",
    path: "/imports",
    description: "Import customers, suppliers, products, and orders from CSV files.",
  },
];

const pageComponents = {
  dashboard: DashboardPage,
  dispatch: DispatchPage,
  "purchase-orders": PurchaseOrdersPage,
  "receive-goods": ReceiveGoodsPage,
  "sales-orders": SalesOrdersPage,
  products: ProductsPage,
  stock: StockPage,
  "serial-tracker": SerialTrackerPage,
  locations: LocationsPage,
  imports: ImportsPage,
};

function getCurrentLocation() {
  return `${window.location.pathname || "/"}${window.location.search || ""}`;
}

function getItemByLocation(locationValue) {
  const pathname = locationValue.split("?")[0] || "/";
  return navigationItems.find((item) => item.path === pathname) || navigationItems[0];
}

function App() {
  const [locationValue, setLocationValue] = useState(getCurrentLocation);
  const currentItem = getItemByLocation(locationValue);
  const ActivePage = pageComponents[currentItem.key] || DashboardPage;
  const health = useApiResource("/health");

  useEffect(() => {
    function handlePopState() {
      setLocationValue(getCurrentLocation());
    }

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  function handleNavigate(nextPath) {
    if (nextPath === locationValue) {
      return;
    }

    window.history.pushState({}, "", nextPath);
    setLocationValue(nextPath);
  }

  return (
    <Layout
      navigationItems={navigationItems}
      activePath={currentItem.path}
      onNavigate={handleNavigate}
      health={health}
    >
      <ActivePage />
    </Layout>
  );
}

export default App;
