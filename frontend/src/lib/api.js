const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001/api";

export async function apiFetch(endpoint, options = {}) {
  const userId = localStorage.getItem("stock_user_id");
  const config = {
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(userId ? { "X-User-Id": userId } : {}),
      ...(options.headers || {}),
    },
    ...options,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `Request failed with status ${response.status}`);
  }

  return payload;
}

export async function apiPost(endpoint, body) {
  const userId = localStorage.getItem("stock_user_id");
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(userId ? { "X-User-Id": userId } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || data.error || `Request failed with status ${response.status}`);
  }

  return response.json();
}

export async function apiPostFile(endpoint, formData) {
  const userId = localStorage.getItem("stock_user_id");
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: { ...(userId ? { "X-User-Id": userId } : {}) },
    body: formData,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return response.json();
}
