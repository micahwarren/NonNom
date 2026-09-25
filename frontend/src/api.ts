import { clearToken, getToken, saveToken } from "./auth-storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL as string;

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  plan: "free" | "premium";
  daily_calorie_goal: number;
  daily_water_goal_ml: number;
  streak_days: number;
};

export type FoodLog = {
  id: string;
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  health_score: number;
  logged_at: string;
  image_path: string | null;
  source: "manual" | "photo";
};

export type DaySummary = {
  date: string;
  calories_in: number;
  calories_burned: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  water_ml: number;
  avg_health_score: number;
  meals_logged: number;
  calorie_goal: number;
  water_goal: number;
  pet_mood: "glowing" | "happy" | "neutral" | "sluggish" | "sad" | "sick";
  pet_mood_score: number;
};

async function request<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const r = await fetch(`${BASE}/api${path}`, { ...init, headers });
  const text = await r.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return { detail: text }; } })() : {};
  if (!r.ok) {
    if (r.status === 401) await clearToken();
    throw new Error(data.detail ?? `Request failed (${r.status})`);
  }
  return data as T;
}

export const api = {
  signup: (email: string, password: string, name: string) =>
    request<{ access_token: string; user: PublicUser }>("/auth/signup", {
      method: "POST", body: JSON.stringify({ email, password, name }),
    }),
  login: (email: string, password: string) =>
    request<{ access_token: string; user: PublicUser }>("/auth/login", {
      method: "POST", body: JSON.stringify({ email, password }),
    }),
  me: () => request<PublicUser>("/auth/me"),
  updateGoals: (payload: { daily_calorie_goal?: number; daily_water_goal_ml?: number }) => {
    const params = new URLSearchParams();
    if (payload.daily_calorie_goal !== undefined) params.set("daily_calorie_goal", String(payload.daily_calorie_goal));
    if (payload.daily_water_goal_ml !== undefined) params.set("daily_water_goal_ml", String(payload.daily_water_goal_ml));
    return request<PublicUser>(`/auth/goals?${params.toString()}`, { method: "PATCH" });
  },

  logFoodManual: (payload: any) =>
    request<FoodLog>("/food/manual", { method: "POST", body: JSON.stringify(payload) }),
  logFoodPhoto: (image_base64: string) =>
    request<FoodLog>("/food/photo", { method: "POST", body: JSON.stringify({ image_base64 }) }),
  foodToday: () => request<FoodLog[]>("/food/today"),
  deleteFood: (id: string) => request(`/food/${id}`, { method: "DELETE" }),

  logWater: (amount_ml: number) =>
    request("/water", { method: "POST", body: JSON.stringify({ amount_ml }) }),
  logExercise: (activity: string, duration_min: number, calories_burned: number) =>
    request("/exercise", { method: "POST", body: JSON.stringify({ activity, duration_min, calories_burned }) }),

  summaryToday: () => request<DaySummary>("/summary/today"),
  summaryHistory: (days = 7) => request<DaySummary[]>(`/summary/history?days=${days}`),

  mockUpgrade: (plan: "premium_monthly" | "premium_yearly") =>
    request<PublicUser>("/billing/mock-upgrade", { method: "POST", body: JSON.stringify({ plan }) }),
  downgrade: () => request<PublicUser>("/billing/downgrade", { method: "POST" }),
};

export async function saveAuthToken(t: string) { await saveToken(t); }
export async function clearAuthToken() { await clearToken(); }
export async function getAuthToken() { return await getToken(); }
