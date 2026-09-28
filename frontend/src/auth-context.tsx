import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import Purchases from "react-native-purchases";
import type { CustomerInfo } from "react-native-purchases";
import { api, ApiError, clearAuthToken, getAuthToken, PublicUser, registerEntitlementSync, saveAuthToken } from "./api";
import { rcEnabled, REVENUECAT_ENTITLEMENT_IDENTIFIER, useSubscription } from "./revenuecat";
import { track } from "./analytics";
import { syncReminders } from "./reminders";
import { registerForPush } from "./push";

type PurchaseSnapshot = { userId: string; info: CustomerInfo };
type AuthCtx = {
  user: PublicUser | null; loading: boolean; isPremium: boolean;
  purchaseIdentityError: string | null;
  syncPremium: (purchase?: PurchaseSnapshot) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string, inviteCode?: string) => Promise<void>;
  signOut: () => Promise<void>; refresh: () => Promise<void>;
  setUser: (u: PublicUser | null) => void;
};
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchaseIdentityError, setPurchaseIdentityError] = useState<string | null>(null);
  const userRef = useRef<PublicUser | null>(null);
  const binding = useRef<string | null>(null);
  const inFlight = useRef<{ id: string; promise: Promise<void> } | null>(null);
  const remindersSyncedFor = useRef<string | null>(null);
  const { customerInfo, updateIdentity } = useSubscription();

  const setUser = useCallback((next: PublicUser | null) => {
    userRef.current = next;
    setUserState(next);
  }, []);

  const syncPremium = useCallback(async (purchase?: PurchaseSnapshot) => {
    const account = userRef.current;
    if (!account || !rcEnabled) return;
    if (purchase && purchase.userId !== account.id) throw new ApiError(409, "Your account changed. Please restore purchases for the current account.");
    if (inFlight.current?.id === account.id) {
      if (!purchase) return inFlight.current.promise;
      // A purchase result is newer than an already-running free snapshot.
      // Finish that request, then force a fresh server verification after purchase/restore.
      await inFlight.current.promise.catch(() => {});
      if (userRef.current?.id !== account.id) throw new ApiError(409, "Your account changed. Please try again.");
    }
    const promise = (async () => {
      try {
        let info;
        if (binding.current !== account.id || await Purchases.getAppUserID() !== account.id) {
          const login = await Purchases.logIn(account.id);
          info = login.customerInfo;
        } else {
          info = purchase?.info ?? await Purchases.getCustomerInfo();
        }
        if (userRef.current?.id !== account.id || await Purchases.getAppUserID() !== account.id) {
          throw new Error("Your account changed. Please try again.");
        }
        binding.current = account.id;
        // Only RevenueCat's server response can grant paid access.
        const synced = await api.syncEntitlement(!!purchase);
        if (userRef.current?.id !== account.id) throw new ApiError(409, "Your account changed. Please restore purchases for the current account.");
        await updateIdentity(account.id, info);
        setUser(synced);
        setPurchaseIdentityError(null);
        if (purchase && info.entitlements.active[REVENUECAT_ENTITLEMENT_IDENTIFIER] && synced.plan !== "premium") {
          throw new Error("Your purchase is still being verified. Please use Restore Purchases in a moment.");
        }
        if (__DEV__) console.info("[RevenueCat] entitlement verified", { appUserId: account.id, serverPlan: synced.plan });
      } catch (error) {
        if (__DEV__) console.warn("[RevenueCat] account sync failed", error instanceof Error ? error.message : String(error));
        if (userRef.current?.id === account.id) setPurchaseIdentityError(String(error));
        if (error instanceof ApiError && error.status !== 503 && error.status !== 0) throw error;
        throw new ApiError(503, "Couldn't confirm your subscription right now. If you already purchased, wait a moment and use Restore Purchases. You don't need to buy again.");
      }
    })();
    inFlight.current = { id: account.id, promise };
    try { await promise; }
    finally { if (inFlight.current?.promise === promise) inFlight.current = null; }
  }, [setUser, updateIdentity]);

  useEffect(() => registerEntitlementSync(syncPremium), [syncPremium]);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (await getAuthToken()) {
          const restored = await api.me();
          if (active) setUser(restored);
        }
      } catch (error: any) { if (error?.status === 401) await clearAuthToken(); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [setUser]);

  useEffect(() => { if (user?.id) void syncPremium().catch(() => {}); }, [user?.id, syncPremium]);
  // SDK listeners also fire after purchase/restore/expiry; compare only confirmed
  // snapshots, and avoid writing unknown or anonymous state as "free".
  const entitlement = customerInfo?.entitlements.active[REVENUECAT_ENTITLEMENT_IDENTIFIER];
  const entitlementKey = customerInfo ? `${!!entitlement}:${entitlement?.expirationDate ?? ""}` : "";
  useEffect(() => {
    if (userRef.current && binding.current === userRef.current.id && entitlementKey) void syncPremium().catch(() => {});
  }, [entitlementKey, syncPremium]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", state => { if (state === "active") void syncPremium().catch(() => {}); });
    return () => sub.remove();
  }, [syncPremium]);
  useEffect(() => {
    if (!user || remindersSyncedFor.current === user.id) return;
    remindersSyncedFor.current = user.id;
    // Remote push first (tokens rotate, so every app open re-registers); local reminders then skip what the server sends.
    registerForPush(user.id).catch(() => false).then(() => syncReminders(user.notifications).catch(() => {}));
  }, [user]);

  async function signIn(email: string, password: string) {
    const result = await api.login(email, password);
    await saveAuthToken(result.access_token);
    setUser(result.user);
  }
  async function signUp(email: string, password: string, name: string, inviteCode?: string) {
    const result = await api.signup(email, password, name, inviteCode);
    await saveAuthToken(result.access_token);
    setUser(result.user);
    track("signup_completed");
  }
  async function signOut() {
    // Finish old-account sync before removing its token or changing SDK identity.
    await inFlight.current?.promise.catch(() => {});
    await clearAuthToken();
    setUser(null); binding.current = null; remindersSyncedFor.current = null;
    if (rcEnabled) {
      try { const info = await Purchases.logOut(); await updateIdentity(await Purchases.getAppUserID(), info); }
      catch (error) { setPurchaseIdentityError(String(error)); }
    }
  }
  async function refresh() {
    const id = userRef.current?.id;
    try {
      await inFlight.current?.promise.catch(() => {});
      const next = await api.me();
      if (id && id === userRef.current?.id) setUser(next);
    } catch {}
  }
  // Do not advertise Premium until the backend that enforces limits agrees.
  const isPremium = user?.plan === "premium";
  return <Ctx.Provider value={{ user, loading, isPremium, purchaseIdentityError, syncPremium, signIn, signUp, signOut, refresh, setUser }}>{children}</Ctx.Provider>;
}

export function useAuthToken() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => { getAuthToken().then(setToken); }, []);
  return token;
}
export function useAuth() {
  const value = useContext(Ctx);
  if (!value) throw new Error("useAuth outside provider");
  return value;
}
