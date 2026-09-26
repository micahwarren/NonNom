// Gentle local reminders scheduled on-device from the user's notification preferences.
// No push credentials needed. Not supported on web; Android requires a dev build for full support.
import { Linking, Platform } from "react-native";
import * as Notifications from "expo-notifications";

import { pushRegistered } from "./push";
export type ReminderPrefs = Record<string, boolean>;

// Default times (24h). Editable later via preferences.times.
export const DEFAULT_TIMES: Record<string, string> = { breakfast: "08:00", lunch: "12:30", dinner: "18:30", streak: "20:30" };
const HYDRATION_HOURS = [10, 13, 16, 19];

const COPY: Record<string, { title: string; body: string }> = {
  breakfast: { title: "Morning, from Buddy", body: "Buddy is ready when you are. Want to log breakfast?" },
  lunch: { title: "Lunch time?", body: "A quick log keeps your day on track. Buddy's waiting." },
  dinner: { title: "Dinner check-in", body: "Log dinner and see what you have left for today." },
  hydration: { title: "Water break", body: "A glass of water now would make Buddy happy." },
  streak: { title: "Keep the streak alive", body: "One small log today keeps your streak going." },
  weekly_report: { title: "Buddy's Weekly Report is ready", body: "See how your week went and what to try next." },
};

export const remindersSupported = Platform.OS !== "web";

if (remindersSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

export type PermissionResult = "granted" | "denied" | "blocked" | "unsupported";

/** Check first; request only after the user toggled a reminder on (clear intent). */
export async function ensureReminderPermission(): Promise<PermissionResult> {
  if (!remindersSupported) return "unsupported";
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return "granted";
  if (!cur.canAskAgain) return "blocked";
  const r = await Notifications.requestPermissionsAsync();
  if (r.granted) return "granted";
  return r.canAskAgain ? "denied" : "blocked";
}

export function openNotificationSettings() { Linking.openSettings(); }

function parseTime(t: string) { const [h, m] = t.split(":").map(Number); return { hour: isNaN(h) ? 8 : h, minute: isNaN(m) ? 0 : m }; }

/** Re-schedules everything from prefs. Idempotent — cancels ours first. */
export async function syncReminders(prefs: ReminderPrefs, times: Record<string, string> = {}) {
  if (!remindersSupported) return;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("reminders", { name: "Buddy reminders", importance: Notifications.AndroidImportance.DEFAULT });
  }
  await Notifications.cancelAllScheduledNotificationsAsync();
  const t = { ...DEFAULT_TIMES, ...times };
  const daily = (key: string, time: string) => Notifications.scheduleNotificationAsync({
    content: { ...COPY[key], data: { kind: key } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, ...parseTime(time), channelId: "reminders" } as Notifications.DailyTriggerInput,
  });
  // When the account is registered for remote push, meal + streak reminders come from the server (they can include what
  // you're low on); only hydration stays local.
  const remote = await pushRegistered();
  for (const key of ["breakfast", "lunch", "dinner", "streak"]) if (prefs[key] && !remote) await daily(key, t[key]);
  if (prefs.hydration) for (const h of HYDRATION_HOURS) await daily("hydration", `${String(h).padStart(2, "0")}:00`);
  if (prefs.weekly_report) {
    await Notifications.scheduleNotificationAsync({
      content: { ...COPY.weekly_report, data: { kind: "weekly_report" } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: 1, hour: 18, minute: 0, channelId: "reminders" } as Notifications.WeeklyTriggerInput,
    });
  }
}

export async function clearReminders() { if (remindersSupported) await Notifications.cancelAllScheduledNotificationsAsync(); }
