import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import Purchases from "react-native-purchases";
import { api, clearAuthToken, getAuthToken, PublicUser, saveAuthToken } from "./api";
import { rcEnabled, useSubscription } from "./revenuecat";
import { track } from "./analytics";
import { syncReminders } from "./reminders";

type AuthCtx = {
  user: PublicUser | null;
  loading: boolean;
  isPremium: boolean;
  purchaseIdentityError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string, inviteCode?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: PublicUser | null) => void;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchaseIdentityError, setPurchaseIdentityError] = useState<string | null>(null);
  const rcIdentityRef = useRef<string | null>(null);
  const remindersSyncedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!user || remindersSyncedFor.current === user.id) return;
    remindersSyncedFor.current = user.id;
    syncReminders(user.notifications as Record<string, boolean>).catch(() => {});
  }, [user?.id]);
  const { isSubscribed, customerInfo, refetchIdentity, appUserId } = useSubscription();

  useEffect(() => {
    (async () => {
      const t = await getAuthToken();
      if (t) {
        try { setUser(await api.me()); } catch (e: any) { if (e?.status === 401) await clearAuthToken(); }
      }
      setLoading(false);
    })();
  }, []);

  // Bind RevenueCat identity to the stable backend user id on every auth path.
  useEffect(() => {
    if (!rcEnabled) return;
    (async () => {
      try {
        if (user?.id && rcIdentityRef.current !== user.id) {
          const { customerInfo: info } = await Purchases.logIn(user.id);
          rcIdentityRef.current = user.id;
          setPurchaseIdentityError(null);
          refetchIdentity();
          console.log("[RevenueCat] identity bound:", await Purchases.getAppUserID(), "(original:", info.originalAppUserId, ")");
        } else if (!user?.id && rcIdentityRef.current) {
          await Purchases.logOut();
          rcIdentityRef.current = null;
          refetchIdentity();
        }
      } catch (e) {
        setPurchaseIdentityError(String(e));
      }
    })();
  }, [user?.id]);

  // Mirror the SDK entitlement to the backend so server-side AI limits and cosmetics resolve for this user.
  useEffect(() => {
    // Only trust customerInfo once the SDK confirms it belongs to this user (avoids syncing the anonymous cache).
    if (!user || !customerInfo || rcIdentityRef.current !== user.id || appUserId !== user.id) return;
    const premium = isSubscribed;
    if ((user.plan === "premium") !== premium) {
      api.syncEntitlement(premium).then(setUser).catch(() => {});
    }
  }, [isSubscribed, customerInfo, user?.id, appUserId]);

  async function signIn(email: string, password: string) {
    const r = await api.login(email, password);
    await saveAuthToken(r.access_token);
    setUser(r.user);
  }
  async function signUp(email: string, password: string, name: string, inviteCode?: string) {
    const r = await api.signup(email, password, name, inviteCode);
    await saveAuthToken(r.access_token);
    setUser(r.user);
    track("signup_completed");
  }
  async function signOut() {
    await clearAuthToken();
    setUser(null);
  }
  async function refresh() {
    try { setUser(await api.me()); } catch {}
  }

  const isPremium = isSubscribed || user?.plan === "premium";
  return <Ctx.Provider value={{ user, loading, isPremium, purchaseIdentityError, signIn, signUp, signOut, refresh, setUser }}>{children}</Ctx.Provider>;
}

export function useAuthToken() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => { getAuthToken().then(setToken); }, []);
  return token;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside provider");
  return v;
}
