// Centralized Nom state contract. The backend engine (nom_state.py) is the single source of truth; this file only types it,
// converts legacy 8-state values from static screens, and overlays short-lived log reactions without inventing a second engine.
import type { BuddyReaction, BuddyState } from "./api";

export type NomExpression = "neutral" | "happy" | "joyful" | "sad" | "tired" | "sick" | "stressed" | "sore" | "hungry" | "stuffed" | "thirsty" | "energetic";
export type NomBody = "normal" | "full" | "bloated" | "slim";
export type NomAnimation = "idle" | "slow_idle" | "bounce" | "celebrate" | "shiver" | "jitter" | "stiff";
export type NomAccessory = "thermometer" | "blanket" | "ice_pack" | "pillow" | "zzz" | "bandage" | "sweat" | "rain_cloud" | "food_cue" | "sparkles" | "sun" | "water_drop" | "protein";

export type NomState = {
  facialExpression: NomExpression; bodyState: NomBody; accessories: NomAccessory[]; animation: NomAnimation;
  headline: string; message: string; priority: string; widgetState: string; moods: string[]; legacyState: BuddyState; voiceLines?: string[];
};

const LEGACY: Record<BuddyState, Partial<NomState>> = {
  neutral: { facialExpression: "neutral" },
  doing_well: { facialExpression: "happy", animation: "bounce" },
  excellent: { facialExpression: "joyful", animation: "bounce" },
  tired: { facialExpression: "tired", animation: "slow_idle" },
  celebrating: { facialExpression: "joyful", animation: "celebrate", accessories: ["sparkles"] },
  needs_hydration: { facialExpression: "thirsty", accessories: ["water_drop"] },
  needs_protein: { facialExpression: "sad", accessories: ["protein"] },
  full: { facialExpression: "stuffed", bodyState: "full", animation: "slow_idle", accessories: ["zzz"] },
};

export function nomFromLegacy(state: BuddyState = "neutral"): NomState {
  return { facialExpression: "neutral", bodyState: "normal", accessories: [], animation: "idle", headline: "", message: "", priority: "general", widgetState: state, moods: [], legacyState: state, ...LEGACY[state] };
}

/** Overlay a transient log reaction. Health/body layers stay visible; only the face and pace change briefly. */
export function withReaction(nom: NomState, event: BuddyReaction | null): NomState {
  if (!event || nom.bodyState === "full" || nom.priority === "health_state") return nom;
  if (event.direction === "improved") return { ...nom, facialExpression: "joyful", animation: "celebrate", accessories: Array.from(new Set([...nom.accessories, "sparkles" as NomAccessory])) };
  if (event.direction === "worsened") return { ...nom, facialExpression: "sad", animation: "slow_idle" };
  return nom;
}

export const EXPRESSION_LABEL: Record<NomExpression, string> = {
  neutral: "neutral", happy: "happy", joyful: "joyful", sad: "sad", tired: "tired", sick: "under the weather", stressed: "stressed",
  sore: "sore", hungry: "hungry", stuffed: "full and sleepy", thirsty: "thirsty", energetic: "energetic",
};
