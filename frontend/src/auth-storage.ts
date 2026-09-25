import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "nomnom_token";

export async function saveToken(token: string) {
  if (Platform.OS === "web") {
    globalThis.window?.localStorage.setItem(KEY, token);
  } else {
    await SecureStore.setItemAsync(KEY, token);
  }
}
export async function getToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    return globalThis.window?.localStorage.getItem(KEY) ?? null;
  }
  return await SecureStore.getItemAsync(KEY);
}
export async function clearToken() {
  if (Platform.OS === "web") {
    globalThis.window?.localStorage.removeItem(KEY);
  } else {
    await SecureStore.deleteItemAsync(KEY);
  }
}
