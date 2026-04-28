import { useEffect, useState } from "react";
import AppShell from "./components/AppShell";
import ModulePanel from "./components/ModulePanel";
import { modules } from "./pages/modules";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

function getInitialModuleKey() {
  const hash = window.location.hash.replace("#", "");
  return modules.some((item) => item.key === hash) ? hash : modules[0].key;
}

function App() {
  const [activeKey, setActiveKey] = useState(getInitialModuleKey);
  const [health, setHealth] = useState({
    isHealthy: false,
    message: "Checking backend connection...",
    detail: apiBaseUrl,
  });

  useEffect(() => {
    async function loadHealth() {
      try {
        const response = await fetch(`${apiBaseUrl}/health`);
        if (!response.ok) {
          throw new Error(`Health check failed with status ${response.status}`);
        }

        const payload = await response.json();
        setHealth({
          isHealthy: true,
          message: `${payload.status.toUpperCase()} · ${payload.service}`,
          detail: `SQLite ${payload.database.status} at ${payload.database.timestamp}`,
        });
      } catch (error) {
        setHealth({
          isHealthy: false,
          message: "Backend unavailable",
          detail: error.message,
        });
      }
    }

    loadHealth();
  }, []);

  useEffect(() => {
    function handleHashChange() {
      setActiveKey(getInitialModuleKey());
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  const activeModule = modules.find((item) => item.key === activeKey) || modules[0];

  function handleNavigate(nextKey) {
    window.location.hash = nextKey;
    setActiveKey(nextKey);
  }

  return (
    <AppShell
      navigation={modules}
      activeKey={activeModule.key}
      onNavigate={handleNavigate}
      health={health}
    >
      <header className="hero">
        <p className="eyebrow">Warehouse Platform Blueprint</p>
        <h2>Full-stack foundation for stock control operations</h2>
        <p className="hero-copy">
          This first phase creates the technical base for purchase order receiving,
          allocation workflows, serial tracking, partial delivery handling, dashboards, and
          barcode or QR-assisted activity.
        </p>
      </header>

      <ModulePanel title={activeModule.title} description={activeModule.description} />
    </AppShell>
  );
}

export default App;
