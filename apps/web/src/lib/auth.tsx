import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { UserDTO } from "@whatsapp-dashboard/shared";
import { apiJson, refreshAccessToken, setAccessToken, setUnauthorizedHandler } from "./api";

interface AuthContextValue {
  user: UserDTO | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDTO | null>(null);
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(clearSession);
    // On load, the browser still holds the httpOnly refresh cookie from a prior
    // session (if any) — silently trade it for a fresh access token.
    (async () => {
      const refreshed = await refreshAccessToken().catch(() => false);
      if (refreshed) {
        const data = await apiJson<{ user: UserDTO }>("/api/auth/me").catch(() => null);
        if (data) setUser(data.user);
      }
      setLoading(false);
    })();
  }, [clearSession]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiJson<{ accessToken: string; user: UserDTO }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setAccessToken(data.accessToken);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    await apiJson("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    clearSession();
  }, [clearSession]);

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
