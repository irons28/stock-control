import { useUser } from "../context/UserContext";

// Roles: admin (full), office (PO/SO create, allocate, dispatch), warehouse (receive, scan, view only)
const PERMISSIONS = {
  "dashboard:view":      ["admin", "office", "warehouse"],
  "po:view":             ["admin", "office", "warehouse"],
  "po:create":           ["admin", "office"],
  "po:edit":             ["admin", "office"],
  "po:receive":          ["admin", "warehouse"],
  "so:view":             ["admin", "office", "warehouse"],
  "so:create":           ["admin", "office"],
  "so:edit":             ["admin", "office"],
  "so:allocate":         ["admin", "office"],
  "so:dispatch":         ["admin", "office"],
  "serial:view":         ["admin", "office", "warehouse"],
  "serial:scan":         ["admin", "warehouse"],
  "stock:view":          ["admin", "office", "warehouse"],
  "master-data:view":    ["admin", "office", "warehouse"],
  "master-data:manage":  ["admin", "office"],
  "returns:manage":      ["admin", "office", "warehouse"],
  "exceptions:view":     ["admin", "office"],
  "audit:view":          ["admin"],
  "users:view":          ["admin"],
  "import:use":          ["admin", "office"],
};

export function canDo(role, action) {
  const allowed = PERMISSIONS[action];
  if (!allowed) return false;
  return allowed.includes(role);
}

export function usePermission(action) {
  const { currentUser } = useUser();
  return canDo(currentUser.role, action);
}

// Returns the list of actions the role is NOT allowed to do (for hints)
export function getDeniedReason(action) {
  const msgs = {
    "po:create":          "Only Office and Admin users can create purchase orders.",
    "po:edit":            "Only Office and Admin users can edit purchase orders.",
    "po:receive":         "Only Warehouse and Admin users can receive goods.",
    "so:create":          "Only Office and Admin users can create sales orders.",
    "so:edit":            "Only Office and Admin users can edit sales orders.",
    "so:allocate":        "Only Office and Admin users can allocate stock.",
    "so:dispatch":        "Only Office and Admin users can dispatch orders.",
    "master-data:manage": "Only Office and Admin users can edit master data.",
    "exceptions:view":    "Only Office and Admin users can view the exceptions dashboard.",
    "audit:view":         "Only Admin users can view the audit log.",
    "import:use":         "Only Office and Admin users can import data.",
  };
  return msgs[action] || "You do not have permission to perform this action.";
}
