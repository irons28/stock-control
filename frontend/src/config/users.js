export const USER_STORAGE_KEY = "stock_current_user";
export const AUTH_TOKEN_STORAGE_KEY = "stock_auth_token";

const ROLE_LABELS = {
  admin: "Admin",
  office: "Office",
  warehouse: "Warehouse",
  read_only: "Read Only",
  guest: "Guest",
};

const ROLE_ALIASES = {
  management: "admin",
  purchasing: "office",
  dispatch: "office",
  readonly: "read_only",
};

export function normalizeRole(role) {
  const value = String(role || "").trim().toLowerCase();
  return ROLE_ALIASES[value] || value || "guest";
}

export function getRoleLabel(role) {
  return ROLE_LABELS[normalizeRole(role)] || "Guest";
}

export function normalizeUser(user = {}) {
  const role = normalizeRole(user.role);
  const displayName = String(
    user.display_name || user.full_name || user.name || user.username || ""
  ).trim();

  return {
    id: String(user.id || ""),
    username: String(user.username || "").trim(),
    name: displayName || "Guest",
    display_name: displayName || "Guest",
    full_name: displayName || "Guest",
    role,
    roleLabel: user.roleLabel || getRoleLabel(role),
    email: String(user.email || "").trim(),
    active: user.active !== false,
  };
}

export function getDefaultUser() {
  return normalizeUser({
    id: "",
    username: "",
    display_name: "Guest",
    role: "guest",
    email: "",
    active: false,
  });
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function persistAuthSession({ token, user }) {
  if (!canUseStorage()) {
    return;
  }

  const normalized = normalizeUser(user);
  if (token) {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  }
  window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(normalized));
}

export function clearAuthSession() {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(USER_STORAGE_KEY);
}

export function getStoredAuthToken() {
  if (!canUseStorage()) {
    return "";
  }

  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || "";
}

export function getStoredCurrentUser() {
  const fallback = getDefaultUser();
  if (!canUseStorage()) {
    return fallback;
  }

  const rawUser = window.localStorage.getItem(USER_STORAGE_KEY);
  if (!rawUser) {
    return fallback;
  }

  try {
    return normalizeUser(JSON.parse(rawUser));
  } catch {
    return fallback;
  }
}
