import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api.js";

// This file is the only place in the frontend that knows how login works.
// There are two ways in: SSO (the backend sends the browser back with a token
// in the URL) and the temporary password login. Components use useAuth() and
// do not care which one was used.

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

// After SSO, the backend sends the browser to "/#token=..." or "/#error=<code>".
// This runs once, when the page loads and before React renders, so the token
// is already saved when the session is restored below (the same path as a
// page reload). Returns the error code, if there is one.
function takeSsoResultFromUrl() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get("token");
  const error = params.get("error");
  if (!token && !error) return null;

  // Remove it from the address bar, so the token is not kept in the browser
  // history or shared by copying the URL.
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  if (token) saveToken(token);
  return error;
}

const ssoErrorOnLoad = takeSsoResultFromUrl();

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Error code sent back by SSO (for example "sso_not_allowed"), shown on the
  // login page until the next sign-in attempt.
  const [ssoError, setSsoError] = useState(ssoErrorOnLoad);
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
    setSsoError(null);
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
    setSsoError(null);
  }, []);

  const value = useMemo(
    () => ({ user, token, isRestoring, ssoError, login, logout }),
    [user, token, isRestoring, ssoError, login, logout]
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
