import { useEffect, useMemo, useState } from "react";
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
import DispatchPage from "./pages/DispatchPage";
import CustomersPage from "./pages/CustomersPage";
import UsersPage from "./pages/UsersPage";
import LoginPage from "./pages/LoginPage";
import AccessDeniedPage from "./pages/AccessDeniedPage";
import { useApiResource } from "./hooks/useApiResource";
import { UserProvider, useUser } from "./context/UserContext";
import { canDo } from "./hooks/usePermission";
import { DemoProvider } from "./context/DemoContext";
import DemoWalkthrough from "./components/DemoWalkthrough";

const routes = [
  {
    key: "dashboard",
    label: "Dashboard",
    group: "Dashboard",
    path: "/",
    component: DashboardPage,
    permission: "dashboard:view",
    description: "Operational overview and exceptions.",
  },
  {
    key: "sales-orders",
    label: "Sales Orders",
    group: "Sales",
    path: "/sales-orders",
    component: SalesOrdersPage,
    permission: "so:view",
    description: "Review customer demand and order progress.",
  },
  {
    key: "allocation",
    label: "Allocation",
    group: "Sales",
    path: "/allocation",
    component: SalesOrdersPage,
    permission: "so:allocate",
    description: "Reserve stock against customer orders.",
    pageProps: { initialMode: "allocation" },
  },
  {
    key: "dispatch",
    label: "Dispatch Ready",
    group: "Sales",
    path: "/dispatch",
    component: DispatchPage,
    permission: "so:dispatch",
    description: "Confirm outbound orders once checks are complete.",
  },
  {
    key: "customers",
    label: "Customers",
    group: "Sales",
    path: "/customers",
    component: CustomersPage,
    permission: "master-data:view",
    description: "Customer accounts used in sales and dispatch.",
  },
  {
    key: "purchase-orders",
    label: "Purchase Orders",
    group: "Purchasing",
    path: "/purchase-orders",
    component: PurchaseOrdersPage,
    permission: "po:view",
    description: "Inbound supplier order review and control.",
  },
  {
    key: "receive-goods",
    label: "Receive Goods",
    group: "Purchasing",
    path: "/receive-goods",
    component: ReceiveGoodsPage,
    permission: "po:receive",
    description: "Book deliveries against open purchase orders.",
  },
  {
    key: "stock",
    label: "Current Stock",
    group: "Stock",
    path: "/stock",
    component: StockPage,
    permission: "stock:view",
    description: "Stock on hand, movements, and availability.",
  },
  {
    key: "serial-tracker",
    label: "Serial Number Search",
    group: "Stock",
    path: "/serial-tracker",
    component: SerialTrackerPage,
    permission: "serial:view",
    description: "Trace serialised items end to end.",
  },
  {
    key: "search",
    label: "Global Search",
    group: "Stock",
    path: "/search",
    component: SearchPage,
    permission: "stock:view",
    description: "Search orders, products, customers, and serials.",
  },
  {
    key: "users",
    label: "Users",
    group: "Admin",
    path: "/users",
    component: UsersPage,
    permission: "users:view",
    description: "Manage sign-in access, roles, and passwords.",
  },
  {
    key: "import",
    label: "Import Data",
    group: "Admin",
    path: "/import",
    component: ImportPage,
    permission: "import:use",
    description: "Bulk import trusted operational data.",
  },
  {
    key: "products",
    label: "Products",
    group: "Admin",
    path: "/products",
    component: ProductsPage,
    permission: "master-data:view",
    description: "SKU catalogue and product tracking rules.",
  },
  {
    key: "suppliers",
    label: "Suppliers",
    group: "Admin",
    path: "/suppliers",
    component: SuppliersPage,
    permission: "master-data:view",
    description: "Supplier records and purchasing contacts.",
  },
  {
    key: "locations",
    label: "Locations",
    group: "Admin",
    path: "/locations",
    component: LocationsPage,
    permission: "master-data:manage",
    description: "Warehouse and stock location setup.",
  },
  {
    key: "audit-log",
    label: "Audit Log",
    group: "Admin",
    path: "/audit-log",
    component: AuditLogPage,
    permission: "audit:view",
    description: "User actions and operational trace history.",
  },
  {
    key: "returns",
    label: "Returns",
    group: "Stock",
    path: "/returns",
    component: ReturnsPage,
    permission: "returns:manage",
    description: "Customer returns, quarantine, and replacements.",
  },
  {
    key: "exceptions",
    label: "Exceptions",
    group: "Admin",
    path: "/exceptions",
    component: ExceptionDashboardPage,
    permission: "exceptions:view",
    description: "Operational exceptions and overdue work.",
  },
  {
    key: "new-sales-order",
    path: "/sales-orders/new",
    component: NewSalesOrderPage,
    permission: "so:create",
    navPath: "/sales-orders",
  },
  {
    key: "purchase-order-create",
    path: "/purchase-orders/new",
    component: NewPurchaseOrderPage,
    permission: "po:create",
    navPath: "/purchase-orders",
  },
];

const routeOrder = [...routes].sort((left, right) => right.path.length - left.path.length);

function getPathname(url) {
  return String(url || "/").split("?")[0] || "/";
}

function findRoute(pathname) {
  return (
    routeOrder.find((route) =>
      route.path === "/"
        ? pathname === "/"
        : pathname === route.path || pathname.startsWith(`${route.path}/`)
    ) || null
  );
}

function AppShell() {
  const { currentUser, authStatus, isAuthenticated, logout } = useUser();
  const [pathname, setPathname] = useState(() => window.location.pathname || "/");
  const [searchQuery, setSearchQuery] = useState("");
  const health = useApiResource("/health");

  const navigationSections = useMemo(() => {
    const visibleRoutes = routes.filter(
      (route) =>
        route.group &&
        (!route.permission || canDo(currentUser.role, route.permission))
    );

    const grouped = visibleRoutes.reduce((accumulator, route) => {
      if (!accumulator[route.group]) {
        accumulator[route.group] = [];
      }
      accumulator[route.group].push(route);
      return accumulator;
    }, {});

    return ["Dashboard", "Sales", "Purchasing", "Stock", "Admin"]
      .map((group) => ({
        label: group,
        items: grouped[group] || [],
      }))
      .filter((section) => section.items.length > 0);
  }, [currentUser.role]);

  const matchedRoute = findRoute(pathname);
  const activeRoute = matchedRoute || routes[0];
  const ActivePage = activeRoute?.component || DashboardPage;
  const isAllowed = !activeRoute?.permission || canDo(currentUser.role, activeRoute.permission);

  useEffect(() => {
    function handlePopState() {
      setPathname(window.location.pathname || "/");
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (authStatus === "authenticated" && pathname === "/login") {
      window.history.replaceState({}, "", "/");
      setPathname("/");
    }
  }, [authStatus, pathname]);

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

  async function handleLogout() {
    await logout();
    window.history.replaceState({}, "", "/login");
    setPathname("/login");
  }

  if (authStatus === "loading") {
    return <div className="app-loading">Checking your session…</div>;
  }

  if (!isAuthenticated) {
    return <LoginPage onSuccess={() => handleNavigate("/")} />;
  }

  if (!matchedRoute || !isAllowed) {
    return (
      <Layout
        navigationSections={navigationSections}
        activePath={activeRoute.navPath || activeRoute.path}
        onNavigate={handleNavigate}
        onSearch={handleSearch}
        health={health}
        currentUser={currentUser}
        onLogout={handleLogout}
      >
        <AccessDeniedPage
          title={matchedRoute ? "Access denied" : "Page not found"}
          description={
            matchedRoute
              ? undefined
              : "That page does not exist in the current workspace navigation."
          }
        />
      </Layout>
    );
  }

  let pageProps = activeRoute.pageProps || {};
  if (activeRoute.key === "dashboard") {
    pageProps = { ...pageProps, health };
  }
  if (activeRoute.key === "search") {
    pageProps = { ...pageProps, initialQuery: searchQuery, onNavigate: handleNavigate };
  }
  if (["new-sales-order", "purchase-orders", "purchase-order-create", "receive-goods"].includes(activeRoute.key)) {
    pageProps = { ...pageProps, onNavigate: handleNavigate };
  }

  return (
    <DemoProvider onNavigate={handleNavigate}>
      <Layout
        navigationSections={navigationSections}
        activePath={activeRoute.navPath || activeRoute.path}
        onNavigate={handleNavigate}
        onSearch={handleSearch}
        health={health}
        currentUser={currentUser}
        onLogout={handleLogout}
      >
        <ActivePage {...pageProps} />
        <DemoWalkthrough />
      </Layout>
    </DemoProvider>
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
