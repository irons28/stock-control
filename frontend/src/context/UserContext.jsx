import { createContext, useContext, useEffect, useState } from "react";
import {
  getDefaultUser,
  getStoredCurrentUser,
  getUserById,
  persistCurrentUser,
  USERS,
} from "../config/users";

export const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [currentUserId, setCurrentUserId] = useState(
    () => getStoredCurrentUser().id || getDefaultUser().id
  );

  const currentUser = getUserById(currentUserId) || getDefaultUser();

  useEffect(() => {
    persistCurrentUser(currentUser);
  }, [currentUser]);

  function switchUser(id) {
    const nextUser = getUserById(id);
    if (!nextUser) {
      return;
    }
    persistCurrentUser(nextUser);
    setCurrentUserId(nextUser.id);
  }

  return (
    <UserContext.Provider value={{ currentUser, users: USERS, switchUser }}>
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
