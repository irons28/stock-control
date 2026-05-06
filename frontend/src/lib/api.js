import {
  clearAuthSession,
  getStoredAuthToken,
  getStoredCurrentUser,
} from "../config/users";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001/api";

export { API_BASE_URL };

export function buildUserHeaders(user = getStoredCurrentUser()) {
  const token = getStoredAuthToken();
  const headers = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (user?.id) {
    headers["x-user-id"] = user.id;
    headers["x-user-name"] = user.name;
    headers["x-user-role"] = user.role;
  }

  return headers;
}

function notifyAuthExpired() {
  if (typeof window === "undefined") {
    return;
  }

  clearAuthSession();
  window.dispatchEvent(new CustomEvent("stock-control-auth-expired"));
}

export async function apiFetch(endpoint, options = {}) {
  const config = {
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...buildUserHeaders(),
      ...(options.headers || {}),
    },
    ...options,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
  const payload = await response.json().catch(() => null);

  if (response.status === 401) {
    notifyAuthExpired();
  }

  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `Request failed with status ${response.status}`);
  }

  return payload;
}

export async function apiPost(endpoint, body) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildUserHeaders(),
    },
    body: JSON.stringify(body),
  });

  if (response.status === 401) {
    notifyAuthExpired();
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || data.error || `Request failed with status ${response.status}`);
  }

  return response.json();
}

export async function apiPostFile(endpoint, formData) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: buildUserHeaders(),
    body: formData,
  });

  if (response.status === 401) {
    notifyAuthExpired();
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return response.json();
}
