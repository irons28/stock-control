import { useEffect, useState } from "react";

const defaultNavigation = [
  { key: "dashboard", label: "Dashboard", path: "/" },
  { key: "customers", label: "Customers", path: "/customers" },
  { key: "suppliers", label: "Suppliers", path: "/suppliers" },
  { key: "products", label: "Products", path: "/products" },
  { key: "purchase-orders", label: "Purchase Orders", path: "/purchase-orders" },
  { key: "sales-orders", label: "Sales Orders", path: "/sales-orders" },
  { key: "stock-locations", label: "Stock Locations", path: "/stock-locations" },
  { key: "stock-movements", label: "Stock Movements", path: "/stock-movements" },
  { key: "goods-receiving", label: "Goods Receiving", path: "/goods-receiving" },
  { key: "order-linking", label: "PO to SO Linking", path: "/order-linking" },
];

const workflowCards = [
  {
    title: "Inbound",
    detail: "Purchase orders, supplier coordination, and goods receiving into holding stock.",
  },
  {
    title: "Inventory",
    detail: "Products, locations, stock movements, and future stock adjustment controls.",
  },
  {
    title: "Outbound",
    detail: "Sales orders, order links, allocation, and dispatch visibility for customers.",
  },
];

function App() {
  const [navigation, setNavigation] = useState(defaultNavigation);
  const [activeItemKey, setActiveItemKey] = useState(defaultNavigation[0].key);
  const [apiStatus, setApiStatus] = useState({
    state: "loading",
    message: "Checking backend connection...",
  });

  useEffect(() => {
    let cancelled = false;

    async function loadNavigation() {
      try {
        const [navigationResponse, healthResponse] = await Promise.all([
          fetch("http://localhost:3001/api/navigation"),
          fetch("http://localhost:3001/api/health"),
        ]);

        if (!navigationResponse.ok || !healthResponse.ok) {
          throw new Error("Backend responded with an error");
        }

        const navigationPayload = await navigationResponse.json();
        const healthPayload = await healthResponse.json();

        if (cancelled) {
          return;
        }

        if (Array.isArray(navigationPayload.items) && navigationPayload.items.length > 0) {
          setNavigation(navigationPayload.items);
          setActiveItemKey((currentKey) => currentKey || navigationPayload.items[0].key);
        }

        setApiStatus({
          state: "ready",
          message: `API online. Database time: ${healthPayload.database.database_time}`,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setApiStatus({
          state: "offline",
          message: "Backend unavailable. Start the API on port 3001 to enable live data.",
        });
      }
    }

    void loadNavigation();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeItem =
    navigation.find((item) => item.key === activeItemKey) ||
    defaultNavigation[0];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Stock Control</p>
          <h1>Phase 1 Foundation</h1>
          <p className="sidebar-copy">
            A clean foundation for purchasing, stock handling, and customer fulfilment.
          </p>
        </div>

        <nav className="nav-list" aria-label="Primary">
          {navigation.map((item) => (
            <button
              key={item.key}
              type="button"
              className={item.key === activeItem.key ? "nav-item active" : "nav-item"}
              onClick={() => setActiveItemKey(item.key)}
            >
              <span>{item.label}</span>
              <small>{item.path}</small>
            </button>
          ))}
        </nav>
      </aside>

      <main className="content">
        <section className="hero">
          <div>
            <p className="eyebrow">Current Focus</p>
            <h2>{activeItem.label}</h2>
            <p className="hero-copy">
              {activeItem.description ||
                "This module is scaffolded and ready for endpoint and UI expansion."}
            </p>
          </div>

          <div className={apiStatus.state === "ready" ? "status-card ready" : "status-card"}>
            <span className="status-label">Backend Status</span>
            <strong>{apiStatus.state === "ready" ? "Connected" : "Waiting"}</strong>
            <p>{apiStatus.message}</p>
          </div>
        </section>

        <section className="card-grid">
          {workflowCards.map((card) => (
            <article key={card.title} className="workflow-card">
              <p className="eyebrow">{card.title}</p>
              <h3>{card.title} Workflow</h3>
              <p>{card.detail}</p>
            </article>
          ))}
        </section>

        <section className="foundation-panel">
          <div>
            <p className="eyebrow">Included Now</p>
            <ul className="check-list">
              <li>Express REST API with SQLite bootstrapping</li>
              <li>Core phase-one database schema for inventory and order flow</li>
              <li>React + Vite frontend shell with module-aware navigation</li>
              <li>Backend health and navigation endpoints for early integration</li>
            </ul>
          </div>

          <div>
            <p className="eyebrow">Next Build Targets</p>
            <ul className="check-list">
              <li>CRUD flows for master data modules</li>
              <li>Purchase order receiving workflow into holding stock</li>
              <li>Sales allocation and dispatch operations</li>
              <li>Stock movement journaling and audit reporting</li>
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
