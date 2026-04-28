const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001/api";

export async function apiFetch(endpoint, options = {}) {
  const headers = new Headers(options.headers || {});
  const hasJsonBody = options.body !== undefined && !headers.has("Content-Type");

  if (hasJsonBody) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
    body:
      options.body !== undefined && headers.get("Content-Type") === "application/json"
        ? JSON.stringify(options.body)
        : options.body,
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;

    try {
      const errorPayload = await response.json();
      if (errorPayload?.error) {
        message = errorPayload.error;
      }
    } catch (_error) {
      // Fall back to the generic message when the response is not JSON.
    }

    throw new Error(message);
  }

  return response.json();
}
