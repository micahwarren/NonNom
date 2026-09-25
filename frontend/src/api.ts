import { clearToken, getToken, saveToken } from "./auth-storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL as string;
const TZ_OFFSET = String(new Date().getTimezoneOffset());

export type Targets = { calories: number; protein_g: number; carbs_g: number; fat_g: number; water_ml: number };
export type Profile = {
  goal?: "lose" | "maintain" | "gain" | "improve"; age?: number; height_cm?: number; weight_kg?: number;
  goal_weight_kg?: number; sex?: "male" | "female" | "unspecified"; activity_level?: string;
  pace_lb_per_week?: number; diet?: string; allergies?: string[]; units?: "imperial" | "metric";
};
export type Equipped = { skin: string; hat: string; glasses: string; accessory: string; outfit: string; background: string };
export type PublicUser = {
  id: string; email: string; name: string; username: string; plan: "free" | "premium";
  onboarding_complete: boolean; profile: Profile; targets: Targets; streak_days: number; longest_streak: number;
  buddy: { equipped: Equipped }; unlocked_cosmetics: string[]; achievements: { id: string; unlocked_at: string }[];
  notifications: Record<string, boolean>; privacy: Record<string, boolean>;
};
export type Meal = "breakfast" | "lunch" | "dinner" | "snacks";
export type FoodEntry = {
  id: string; name: string; brand: string | null; meal: Meal; serving_label: string; quantity: number;
  calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g?: number | null; sugar_g?: number | null; sodium_mg?: number | null;
  source: string; data_source: "database" | "ai_estimate" | "user"; image_path: string | null; logged_at: string;
};
export type FoodDay = { date: string; meals: Record<Meal, FoodEntry[]>; totals: { calories: number; protein_g: number; carbs_g: number; fat_g: number }; count: number };
export type FoodItemIn = {
  name: string; calories: number; protein_g?: number; carbs_g?: number; fat_g?: number; fiber_g?: number | null; sugar_g?: number | null; sodium_mg?: number | null;
  brand?: string | null; serving_label?: string; quantity?: number; meal?: Meal; source?: string; data_source?: string;
  barcode?: string | null; provider?: string | null; provider_id?: string | null; image_path?: string | null; logged_date?: string;
};
export type BuddyState = "neutral" | "doing_well" | "excellent" | "tired" | "celebrating" | "needs_hydration" | "needs_protein";
export type DaySummary = {
  date: string; calories_in: number; calories_burned: number; protein_g: number; carbs_g: number; fat_g: number; water_ml: number;
  entries: number; meals_logged: number; targets: Targets; nutrition_score: number; day_label: string;
  buddy: { state: BuddyState; headline: string; message: string }; streak_days?: number; score_explanation?: string;
};
export type DbFood = {
  provider: string; provider_id: string; name: string; brand: string | null; serving_label: string; serving_g: number;
  per_serving: { calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g?: number; sugar_g?: number; sodium_mg?: number };
  per_100g: DbFood["per_serving"]; image_url: string | null; barcode: string | null; data_source: "database";
};
export type AiItem = { name: string; serving_label: string; calories: number; protein_g: number; carbs_g: number; fat_g: number; quantity: number; data_source: "ai_estimate" };
export type Cosmetic = { id: string; name: string; category: string; asset: string; premium_required: boolean; unlock_type: string; sort_order: number; available: boolean; owned: boolean };
export type Achievement = { id: string; name: string; description: string; icon: string; unlocked: boolean; unlocked_at: string | null; reward_name: string | null };
export type Suggestion = { name: string; description: string; reason: string; calories: number; protein_g: number; carbs_g: number; fat_g: number; recipe: string[] };
export type ProgressData = {
  range_days: number; series: { date: string; calories: number; protein_g: number; water_ml: number; burned: number; entries: number; weight_kg: number | null }[];
  targets: Targets; avg_calories: number; avg_protein_g: number; protein_pct: number; avg_water_ml: number; days_logged: number; days_in_range: number;
  weight_start_kg: number | null; weight_end_kg: number | null; streak_days: number; longest_streak: number; goal_weight_kg: number | null;
};
export type WeeklyReport = { week_start: string; week_end: string; headline: string; insights: string[]; this_week: Record<string, number>; last_week: Record<string, number> };

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

async function request<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("X-TZ-Offset", TZ_OFFSET);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let r: Response;
  try {
    r = await fetch(`${BASE}/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "You appear to be offline. Check your connection and try again.");
  }
  const text = await r.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return { detail: text }; } })() : {};
  if (!r.ok) {
    if (r.status === 401) await clearToken();
    const detail = typeof data.detail === "string" ? data.detail : Array.isArray(data.detail) ? data.detail[0]?.msg ?? "Invalid input" : `Request failed (${r.status})`;
    throw new ApiError(r.status, detail);
  }
  return data as T;
}

const json = (body: unknown) => JSON.stringify(body);

export const api = {
  signup: (email: string, password: string, name: string) => request<{ access_token: string; user: PublicUser }>("/auth/signup", { method: "POST", body: json({ email, password, name }) }),
  login: (email: string, password: string) => request<{ access_token: string; user: PublicUser }>("/auth/login", { method: "POST", body: json({ email, password }) }),
  me: () => request<PublicUser>("/auth/me"),
  usage: () => request<Record<string, { used: number; limit: number | null }>>("/me/usage"),
  updateMe: (payload: { name?: string; username?: string; profile?: Profile; targets?: Partial<Targets> }) => request<PublicUser>("/me", { method: "PATCH", body: json(payload) }),
  onboarding: (profile: Profile, name?: string) => request<PublicUser>("/me/onboarding", { method: "POST", body: json({ profile, name }) }),
  previewTargets: (profile: Profile) => request<Targets>("/me/targets/preview", { method: "POST", body: json(profile) }),
  updateNotifications: (prefs: Record<string, boolean>) => request<Record<string, boolean>>("/me/notifications", { method: "PATCH", body: json(prefs) }),
  updatePrivacy: (prefs: Record<string, boolean>) => request<Record<string, boolean>>("/me/privacy", { method: "PATCH", body: json(prefs) }),
  syncEntitlement: (premium: boolean) => request<PublicUser>("/me/entitlement", { method: "POST", body: json({ premium, source: "revenuecat" }) }),
  deleteAccount: () => request("/me", { method: "DELETE" }),

  foodDay: (date?: string) => request<FoodDay>(`/food${date ? `?date=${date}` : ""}`),
  logFood: (item: FoodItemIn) => request<FoodEntry & { unlocked: Achievement[] }>("/food", { method: "POST", body: json(item) }),
  logFoodBatch: (items: FoodItemIn[], meal?: Meal, image_path?: string | null) => request<{ items: FoodEntry[]; unlocked: Achievement[] }>("/food/batch", { method: "POST", body: json({ items, meal, image_path }) }),
  editFood: (id: string, patch: Partial<Pick<FoodEntry, "name" | "calories" | "protein_g" | "carbs_g" | "fat_g" | "serving_label" | "quantity" | "meal">>) => request<FoodEntry>(`/food/${id}`, { method: "PATCH", body: json(patch) }),
  duplicateFood: (id: string, meal?: Meal) => request<FoodEntry>(`/food/${id}/duplicate${meal ? `?meal=${meal}` : ""}`, { method: "POST" }),
  deleteFood: (id: string) => request(`/food/${id}`, { method: "DELETE" }),
  recentFoods: () => request<FoodEntry[]>("/food/recent"),
  analyzePhoto: (image_base64: string) => request<{ items: AiItem[]; confidence: string; image_path: string | null; suggested_meal: Meal }>("/food/photo/analyze", { method: "POST", body: json({ image_base64 }) }),
  describeMeal: (text: string) => request<{ items: AiItem[]; suggested_meal: Meal }>("/food/describe", { method: "POST", body: json({ text }) }),
  searchFood: (q: string) => request<{ results: DbFood[]; providers: string[] }>(`/food/search?q=${encodeURIComponent(q)}`),
  barcode: (code: string) => request<{ product: DbFood }>(`/food/barcode/${encodeURIComponent(code)}`),

  logWater: (amount_ml: number) => request<{ id: string; unlocked: Achievement[] }>("/water", { method: "POST", body: json({ amount_ml }) }),
  undoWater: (id: string) => request(`/water/${id}`, { method: "DELETE" }),
  waterToday: () => request<{ id: string; amount_ml: number; logged_at: string }[]>("/water"),
  logWeight: (weight_kg: number) => request("/weight", { method: "POST", body: json({ weight_kg }) }),
  logExercise: (activity: string, duration_min: number, calories_burned: number) => request("/exercise", { method: "POST", body: json({ activity, duration_min, calories_burned }) }),

  summaryToday: () => request<DaySummary>("/summary/today"),
  summaryHistory: (days = 7) => request<DaySummary[]>(`/summary/history?days=${days}`),
  progress: (range: 7 | 30 | 90 | 365) => request<ProgressData>(`/progress?range=${range}`),
  weeklyReport: (offset = 0) => request<WeeklyReport>(`/reports/weekly?offset=${offset}`),
  feedMe: (exclude: string[] = []) => request<{ remaining: Targets; suggestions: Suggestion[] }>("/ai/feed-me", { method: "POST", body: json({ exclude }) }),

  cosmetics: () => request<{ items: Cosmetic[]; equipped: Equipped; categories: string[] }>("/buddy/cosmetics"),
  equip: (category: string, cosmetic_id: string) => request<{ equipped: Equipped }>("/buddy/equip", { method: "POST", body: json({ category, cosmetic_id }) }),
  achievements: () => request<{ achievements: Achievement[]; unlocked_count: number; total: number }>("/achievements"),
  sendEvents: (events: { name: string; props?: Record<string, unknown>; ts: number }[]) => request("/analytics/events", { method: "POST", body: json({ events }) }),
};

export const fileUrl = (path: string) => `${BASE}/api/files/${path}`;
export async function saveAuthToken(t: string) { await saveToken(t); }
export async function clearAuthToken() { await clearToken(); }
export async function getAuthToken() { return await getToken(); }
