import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api.js";

// This file is the only place in the frontend that knows how login works.
// Components use useAuth(); when SSO replaces the temporary login, only this
// file changes.

const TOKEN_STORAGE_KEY = "accessToken";

// sessionStorage keeps the token until the tab is closed. Access is wrapped in
// try/catch because the browser can block storage (e.g. strict privacy mode).
function readToken() {
  try {
    return sessionStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveToken(token) {
  try {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // Storage blocked: the session will not survive a reload.
  }
}

function clearToken() {
  try {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Storage blocked: there is nothing saved to remove.
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Kept in state as well, so pages can send it with API calls.
  const [token, setToken] = useState(readToken);
  // True while a saved session is being checked after a page reload.
  const [isRestoring, setIsRestoring] = useState(() => readToken() !== null);

  // After a reload the token is still in sessionStorage, but the user is not
  // in memory anymore. Ask the backend who the token belongs to.
  useEffect(() => {
    const token = readToken();
    if (!token) return;

    const controller = new AbortController();
    apiRequest("/auth/me", { token, signal: controller.signal })
      .then((restoredUser) => setUser(restoredUser))
      .catch((error) => {
        if (error.name === "AbortError") return;
        // Forget the token only if the server rejected it (expired, or signed
        // with an old key). A network error does not mean the token is bad.
        if (error.status === 401) {
          clearToken();
          setToken(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsRestoring(false);
      });

    return () => controller.abort();
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await apiRequest("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    saveToken(data.access_token);
    setToken(data.access_token);
    setUser(data.user);
  }, []);

  // The token cannot be revoked on the server yet; signing out forgets it.
  const logout = useCallback(() => {
    clearToken();
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, token, isRestoring, login, logout }),
    [user, token, isRestoring, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth() must be used inside <AuthProvider>");
  }
  return context;
}
