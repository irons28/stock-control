const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001/api";

export async function apiFetch(endpoint) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`);

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json();
}
