// Emergent managed push: permission → native device token → backend relay (/api/register-push). Re-run on every app open
// because tokens rotate. Never blocks auth; denial simply means no remote pushes.
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { getAuthToken } from "./api";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL as string;
export const PUSH_REGISTERED_KEY = "pushRegistered";

export async function registerForPush(userId: string): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") { await AsyncStorage.removeItem(PUSH_REGISTERED_KEY); return false; }
    const tokenResp = await Notifications.getDevicePushTokenAsync();
    const token = await getAuthToken();
    const r = await fetch(`${BASE}/api/register-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-TZ-Offset": String(new Date().getTimezoneOffset()), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ user_id: userId, platform: Platform.OS, device_token: String(tokenResp.data) }),
    });
    await AsyncStorage.setItem(PUSH_REGISTERED_KEY, r.ok ? "1" : "0");
    return r.ok;
  } catch (e) {
    // Expo Go has no push capability; a dev/production build is required.
    console.warn("push registration skipped", e);
    return false;
  }
}

export async function pushRegistered() {
  return (await AsyncStorage.getItem(PUSH_REGISTERED_KEY)) === "1";
}
