export const USER_STORAGE_KEY = "stock_current_user";
export const USER_ID_STORAGE_KEY = "stock_user_id";

const ROLE_LABELS = {
  admin: "Admin",
  office: "Office",
  warehouse: "Warehouse",
};

const ROLE_ALIASES = {
  management: "admin",
  purchasing: "office",
  dispatch: "office",
};

export function normalizeRole(role) {
  const value = String(role || "").trim().toLowerCase();
  return ROLE_ALIASES[value] || value || "warehouse";
}

export function getRoleLabel(role) {
  return ROLE_LABELS[normalizeRole(role)] || "Warehouse";
}

export function normalizeUser(user = {}) {
  const role = normalizeRole(user.role);
  const name = String(user.name || user.full_name || "").trim();

  return {
    id: String(user.id || ""),
    name,
    role,
    roleLabel: user.roleLabel || getRoleLabel(role),
    email: String(user.email || "").trim(),
    full_name: name,
  };
}

export const USERS = [
  {
    id: "admin-1",
    name: "Alex Admin",
    role: "admin",
    roleLabel: "Admin",
  },
  {
    id: "office-1",
    name: "Olivia Office",
    role: "office",
    roleLabel: "Office",
  },
  {
    id: "warehouse-1",
    name: "Wayne Warehouse",
    role: "warehouse",
    roleLabel: "Warehouse",
  },
].map(normalizeUser);

export function getDefaultUser() {
  return USERS[0];
}

export function getUserById(id) {
  const userId = String(id || "").trim();
  return USERS.find((user) => user.id === userId) || null;
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function persistCurrentUser(user) {
  if (!canUseStorage()) {
    return;
  }

  const normalized = normalizeUser(user);
  window.localStorage.setItem(USER_ID_STORAGE_KEY, normalized.id);
  window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(normalized));
}

export function getStoredCurrentUser() {
  const fallback = getDefaultUser();
  if (!canUseStorage()) {
    return fallback;
  }

  const rawUser = window.localStorage.getItem(USER_STORAGE_KEY);
  if (rawUser) {
    try {
      const parsed = normalizeUser(JSON.parse(rawUser));
      return getUserById(parsed.id) || parsed;
    } catch {
      // Ignore corrupt storage and fall through to the id-based lookup.
    }
  }

  const storedId = window.localStorage.getItem(USER_ID_STORAGE_KEY);
  return getUserById(storedId) || fallback;
}
