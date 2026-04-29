import { createContext, useContext, useState } from "react";

export const UserContext = createContext(null);

export const DEMO_USERS = [
  { id: "1", role: "admin", full_name: "Alex Admin", email: "admin@ops.example" },
  { id: "2", role: "purchasing", full_name: "Priya Purchasing", email: "purchase@ops.example" },
  { id: "3", role: "warehouse", full_name: "Wayne Warehouse", email: "warehouse@ops.example" },
  { id: "4", role: "dispatch", full_name: "Diana Dispatch", email: "dispatch@ops.example" },
  { id: "5", role: "management", full_name: "Marcus Management", email: "manager@ops.example" },
];

export function UserProvider({ children }) {
  const [currentUserId, setCurrentUserId] = useState(
    () => localStorage.getItem("stock_user_id") || "1"
  );

  const currentUser =
    DEMO_USERS.find((u) => u.id === currentUserId) || DEMO_USERS[0];

  function switchUser(id) {
    localStorage.setItem("stock_user_id", String(id));
    setCurrentUserId(String(id));
  }

  return (
    <UserContext.Provider value={{ currentUser, users: DEMO_USERS, switchUser }}>
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
