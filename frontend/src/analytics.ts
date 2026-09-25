// Provider-agnostic analytics. Events are batched to the backend sink; swap `flush` for a real provider later.
import { api } from "./api";

export type AnalyticsEvent =
  | "signup_completed" | "onboarding_completed" | "meal_logged" | "barcode_scanned" | "ai_scan_started" | "ai_scan_completed"
  | "feed_me_used" | "water_logged" | "weight_logged" | "exercise_logged" | "achievement_unlocked" | "paywall_viewed"
  | "subscription_started" | "subscription_restored" | "premium_cosmetic_selected" | "cosmetic_equipped" | "describe_meal_used"
  | "meal_saved" | "reaction_sent" | "friend_invited" | "friend_added";

const queue: { name: string; props?: Record<string, unknown>; ts: number }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

export function track(name: AnalyticsEvent, props?: Record<string, unknown>) {
  queue.push({ name, props, ts: Date.now() });
  if (!timer) timer = setTimeout(flush, 4000);
}

export async function flush() {
  timer = null;
  if (!queue.length) return;
  const batch = queue.splice(0, 50);
  try { await api.sendEvents(batch); } catch { /* analytics must never break the app */ }
}
