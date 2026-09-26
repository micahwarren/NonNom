// Mirrors the Nom State Engine result into the iOS App Group so the Lock Screen / Home Screen widgets show the exact same Nom.
// The app renders Nom off-screen with the shared BuddyAvatar renderer, snapshots it to a PNG and writes it beside a small
// JSON payload (name, state, calories, protein). No tokens, emails or history ever leave the app. iOS only; no-op elsewhere.
import React, { useEffect, useRef } from "react";
import { Platform, StyleSheet, View } from "react-native";
import type { DaySummary, PublicUser } from "./api";
import type { NomState } from "./nom-state";
import { BuddyAvatar } from "./buddy";

export const APP_GROUP = "group.com.emergent.healthbuddy.cfwaxa";
export const WIDGET_KIND = "NomWidget";

type Snapshot = { nom_name: string; state: string; expression: string; body: string; moods: string; outfit: string; shape: string; calories_consumed: number; calorie_goal: number; protein_consumed: number; protein_goal: number; updated_at: string };

let storage: { set: (k: string, v: any) => void } | null | undefined;
let reload: ((kind?: string) => void) | undefined;
function bridge() {
  if (Platform.OS !== "ios") return null;
  if (storage === undefined) {
    try {
      // Only present in a native iOS build (expo prebuild); Expo Go and web have no App Group module.
      const mod = require("@bacons/apple-targets");
      storage = new mod.ExtensionStorage(APP_GROUP);
      reload = (kind?: string) => mod.ExtensionStorage.reloadWidget(kind);
    } catch { storage = null; }
  }
  return storage;
}

export function WidgetSync({ nom, summary, user }: { nom: NomState; summary: DaySummary; user: PublicUser }) {
  const ref = useRef<View>(null);
  const key = `${nom.facialExpression}|${nom.bodyState}|${nom.accessories.join(",")}|${JSON.stringify(user.buddy.equipped)}|${Math.round(summary.calories_in)}|${Math.round(summary.protein_g)}|${user.nom_name}`;
  useEffect(() => {
    const store = bridge();
    if (!store) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const { captureRef } = require("react-native-view-shot");
        const base64: string = await captureRef(ref, { format: "png", quality: 1, result: "base64", width: 240, height: 240 });
        if (cancelled) return;
        const snap: Snapshot = {
          nom_name: user.nom_name, state: nom.widgetState, expression: nom.facialExpression, body: nom.bodyState, moods: nom.moods.join(","),
          outfit: user.buddy.equipped.outfit, shape: user.buddy.equipped.shape,
          calories_consumed: Math.round(summary.calories_in), calorie_goal: summary.targets.calories,
          protein_consumed: Math.round(summary.protein_g), protein_goal: summary.targets.protein_g, updated_at: new Date().toISOString(),
        };
        store.set("nomSnapshot", JSON.stringify(snap));
        store.set("nomImage", base64);
        reload?.(WIDGET_KIND);
      } catch (e) { console.warn("widget sync skipped", e); }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [key]);
  if (Platform.OS !== "ios") return null;
  return (
    <View ref={ref} collapsable={false} style={styles.offscreen} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <BuddyAvatar nom={nom} equipped={user.buddy.equipped} size={240} animate={false} showBackground={false} level={user.level ?? 1} />
    </View>
  );
}

const styles = StyleSheet.create({ offscreen: { position: "absolute", left: -1000, top: 0, width: 240, height: 240, opacity: 0.99 } });
