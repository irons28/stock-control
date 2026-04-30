import { useUser } from "../context/UserContext";

const PERMISSIONS = {
  "po:receive": ["admin", "warehouse", "purchasing"],
  "po:view": ["admin", "warehouse", "purchasing", "dispatch", "management"],
  "so:dispatch": ["admin", "dispatch"],
  "so:allocate": ["admin", "warehouse", "dispatch"],
  "so:view": ["admin", "warehouse", "purchasing", "dispatch", "management"],
  "master-data:manage": ["admin", "purchasing"],
  "stock:view": ["admin", "warehouse", "dispatch", "management"],
  "serial:view": ["admin", "warehouse", "dispatch", "management"],
  "audit:view": ["admin", "management"],
  "users:view": ["admin", "management"],
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
