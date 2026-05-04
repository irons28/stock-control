import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";

// ── Walkthrough steps ─────────────────────────────────────────────────────────

export const DEMO_STEPS = [
  {
    navKey:      "dashboard",
    navPath:     "/",
    icon:        "📊",
    title:       "Live Operations Dashboard",
    description: "This is the nerve centre. Red numbers mean urgency — overdue POs, urgent customer orders. Green means ready to ship.",
    action:      "Point out the KPI cards. SO-2001 is overdue, dispatch-ready items are waiting.",
  },
  {
    navKey:      "purchase-orders",
    navPath:     "/purchase-orders",
    icon:        "📦",
    title:       "Incoming Delivery — PO-DEMO-001",
    description: "A new delivery from EPOS Hardware is expected: 3 tills, 2 printers, 20 label rolls for Example Retail's new store fit-out.",
    action:      "Open Purchase Orders and search for PO-DEMO-001 to see the line detail.",
  },
  {
    navKey:      "receive-goods",
    navPath:     "/receive-goods",
    icon:        "🏭",
    title:       "Book the Goods In",
    description: "The van has arrived. Warehouse staff scan serial numbers as each unit comes off the dock — the system captures every one.",
    action:      "Go to Receive Goods, select PO-DEMO-001, enter serials EPOS-TILL-A, B, C and receive.",
  },
  {
    navKey:      "sales-orders",
    navPath:     "/sales-orders",
    icon:        "📋",
    title:       "Customer Order is Waiting",
    description: "SO-DEMO-001 for Example Retail needs 2 of those 3 tills. The system already links the PO to the SO — it knows stock is on its way.",
    action:      "Open Sales Orders and select SO-DEMO-001. Allocate the 2 EPOS tills just received.",
  },
  {
    navKey:      "serial-tracker",
    navPath:     "/serial-tracker",
    icon:        "🔍",
    title:       "Full Serial Audit Trail",
    description: "Every serial carries a complete history from receipt through to dispatch, return, and warranty replacement — all automatic.",
    action:      "Search for TILL-SN-1006 to show its full return and warranty replacement chain.",
  },
  {
    navKey:      "audit-log",
    navPath:     "/audit-log",
    icon:        "📜",
    title:       "Automatic Audit Log",
    description: "Every action is logged — who did it, when, and what changed. No manual logging. Every receive, allocation, and dispatch is captured.",
    action:      "Browse the timeline. Filter by 'Received' or by user to show role-based visibility.",
  },
];

// ── Fake live-feed messages ───────────────────────────────────────────────────

const LIVE_FEED = [
  { user: "Wayne Warehouse", role: "warehouse", text: "Received 1× TILL-001 against PO-1002" },
  { user: "Olivia Office",   role: "office",    text: "Allocated 10× LABEL-001 to SO-2003" },
  { user: "Wayne Warehouse", role: "warehouse", text: "Scanned TILL-SN-1004 — put to RACK-A1" },
  { user: "Olivia Office",   role: "office",    text: "Created SO-2004 for Harbor Retail Ltd" },
  { user: "Wayne Warehouse", role: "warehouse", text: "Received 2× PRINTER-001 on PO-1001" },
  { user: "Olivia Office",   role: "office",    text: "Raised PO-1005 with Nexus Hardware" },
  { user: "Alex Admin",      role: "admin",     text: "Imported 12 new products via CSV" },
  { user: "Olivia Office",   role: "office",    text: "Dispatched SO-2002 — ref DPD-8821" },
  { user: "Wayne Warehouse", role: "warehouse", text: "Logged return: TILL-SN-1006 from Alpha Vet" },
];

// ── Context ───────────────────────────────────────────────────────────────────

const DemoContext = createContext(null);

export function DemoProvider({ children, onNavigate }) {
  const [isDemoMode, setIsDemoMode] = useState(
    () => localStorage.getItem("stock_demo_mode") === "true",
  );
  const [step, setStep]         = useState(0);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");
  const [feedMessage, setFeedMessage] = useState(null);
  const feedIndex  = useRef(0);
  const feedTimer  = useRef(null);

  // Rotate live-feed messages while demo mode is on
  useEffect(() => {
    if (!isDemoMode) {
      clearInterval(feedTimer.current);
      setFeedMessage(null);
      return;
    }

    function showNext() {
      const msg = LIVE_FEED[feedIndex.current % LIVE_FEED.length];
      feedIndex.current += 1;
      setFeedMessage(msg);
      // Clear after 4 s
      setTimeout(() => setFeedMessage(null), 4000);
    }

    showNext();
    feedTimer.current = setInterval(showNext, 8000);
    return () => clearInterval(feedTimer.current);
  }, [isDemoMode]);

  function enterDemoMode() {
    localStorage.setItem("stock_demo_mode", "true");
    setIsDemoMode(true);
    setStep(0);
    onNavigate?.("/");
  }

  function exitDemoMode() {
    localStorage.setItem("stock_demo_mode", "false");
    setIsDemoMode(false);
    setStep(0);
    setFeedMessage(null);
  }

  const goToStep = useCallback((n) => {
    const idx = Math.max(0, Math.min(DEMO_STEPS.length - 1, n));
    setStep(idx);
    onNavigate?.(DEMO_STEPS[idx].navPath);
  }, [onNavigate]);

  async function resetDemoData() {
    setResetting(true);
    setResetError("");
    try {
      await apiFetch("/demo/reset", { method: "POST" });
      setStep(0);
      onNavigate?.("/");
      // Small delay so the dashboard re-fetches with fresh data
      setTimeout(() => window.location.reload(), 400);
    } catch (err) {
      setResetError(err.message || "Reset failed.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <DemoContext.Provider value={{
      isDemoMode,
      step,
      totalSteps: DEMO_STEPS.length,
      currentStep: DEMO_STEPS[step],
      feedMessage,
      resetting,
      resetError,
      enterDemoMode,
      exitDemoMode,
      goToStep,
      nextStep:  () => goToStep(step + 1),
      prevStep:  () => goToStep(step - 1),
      resetDemoData,
    }}>
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo() {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo must be used within a DemoProvider");
  return ctx;
}
