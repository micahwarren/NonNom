import React, { createContext, useContext, useEffect, useState } from "react";
import { api, clearAuthToken, getAuthToken, PublicUser, saveAuthToken } from "./api";

type AuthCtx = {
  user: PublicUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: PublicUser | null) => void;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const t = await getAuthToken();
      if (t) {
        try { setUser(await api.me()); } catch { await clearAuthToken(); }
      }
      setLoading(false);
    })();
  }, []);

  async function signIn(email: string, password: string) {
    const r = await api.login(email, password);
    await saveAuthToken(r.access_token);
    setUser(r.user);
  }
  async function signUp(email: string, password: string, name: string) {
    const r = await api.signup(email, password, name);
    await saveAuthToken(r.access_token);
    setUser(r.user);
  }
  async function signOut() {
    await clearAuthToken();
    setUser(null);
  }
  async function refresh() {
    try { setUser(await api.me()); } catch {}
  }

  return <Ctx.Provider value={{ user, loading, signIn, signUp, signOut, refresh, setUser }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside provider");
  return v;
}
