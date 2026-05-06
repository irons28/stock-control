import { createContext, useContext, useEffect, useState } from "react";
import {
  clearAuthSession,
  getDefaultUser,
  getStoredAuthToken,
  getStoredCurrentUser,
  normalizeUser,
  persistAuthSession,
} from "../config/users";
import { API_BASE_URL } from "../lib/api";

export const UserContext = createContext(null);

async function parseJson(response) {
  return response.json().catch(() => ({}));
}

export function UserProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => getStoredCurrentUser());
  const [authStatus, setAuthStatus] = useState(() =>
    getStoredAuthToken() ? "loading" : "unauthenticated"
  );

  async function refreshMe() {
    const token = getStoredAuthToken();
    if (!token) {
      clearAuthSession();
      setCurrentUser(getDefaultUser());
      setAuthStatus("unauthenticated");
      return null;
    }

    setAuthStatus("loading");

    try {
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await parseJson(response);
      if (!response.ok || !payload.user) {
        clearAuthSession();
        setCurrentUser(getDefaultUser());
        setAuthStatus("unauthenticated");
        return null;
      }

      const normalized = normalizeUser(payload.user);
      persistAuthSession({ token, user: normalized });
      setCurrentUser(normalized);
      setAuthStatus("authenticated");
      return normalized;
    } catch {
      clearAuthSession();
      setCurrentUser(getDefaultUser());
      setAuthStatus("unauthenticated");
      return null;
    }
  }

  useEffect(() => {
    void refreshMe();
  }, []);

  useEffect(() => {
    function handleAuthExpired() {
      clearAuthSession();
      setCurrentUser(getDefaultUser());
      setAuthStatus("unauthenticated");
      if (window.location.pathname !== "/login") {
        window.history.replaceState({}, "", "/login");
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
    }

    window.addEventListener("stock-control-auth-expired", handleAuthExpired);
    return () => window.removeEventListener("stock-control-auth-expired", handleAuthExpired);
  }, []);

  async function login(username, password) {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    const payload = await parseJson(response);
    if (!response.ok || !payload.token || !payload.user) {
      throw new Error(payload.message || "Unable to sign in.");
    }

    const normalized = normalizeUser(payload.user);
    persistAuthSession({ token: payload.token, user: normalized });
    setCurrentUser(normalized);
    setAuthStatus("authenticated");
    return normalized;
  }

  async function logout() {
    const token = getStoredAuthToken();
    if (token) {
      try {
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch {
        // Local logout still completes if the API is unavailable.
      }
    }

    clearAuthSession();
    setCurrentUser(getDefaultUser());
    setAuthStatus("unauthenticated");
  }

  return (
    <UserContext.Provider
      value={{
        authStatus,
        currentUser,
        isAuthenticated: authStatus === "authenticated" && Boolean(currentUser.id),
        login,
        logout,
        refreshMe,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return ctx;
}
