// Global "Add" bottom sheet (center tab button) + water quick-add helper.
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useThemeStyles, ThemeColors, fontSize, radius, spacing } from "./theme";
import { Icon, IconName, Sheet, useToast } from "./ui";
import { api } from "./api";
import { track } from "./analytics";

type Ctx = { open: () => void; close: () => void };
const AddSheetCtx = createContext<Ctx>({ open: () => {}, close: () => {} });

const actions = (colors: ThemeColors): { key: string; title: string; sub: string; icon: IconName; route?: string; color: string }[] => [
  { key: "photo", title: "Take Food Photo", sub: "Buddy estimates the meal", icon: "camera", route: "/scan", color: colors.brandPrimary },
  { key: "barcode", title: "Scan Barcode", sub: "Packaged foods, no AI needed", icon: "barcode", route: "/barcode", color: colors.onSurface },
  { key: "search", title: "Search Food", sub: "USDA + Open Food Facts", icon: "search", route: "/search", color: colors.protein },
  { key: "describe", title: "Describe Meal", sub: "Type or dictate what you ate", icon: "chatbubble-ellipses", route: "/describe", color: colors.carbs },
  { key: "water", title: "Add Water", sub: "A cup at a time · 250 mL per cup", icon: "water", color: colors.water },
  { key: "weight", title: "Log Weight", sub: "Track your trend", icon: "scale", route: "/weight", color: colors.fat },
  { key: "exercise", title: "Log Exercise", sub: "Activity and calories burned", icon: "walk", route: "/exercise", color: colors.success },
  { key: "saved", title: "Saved Meals", sub: "Re-log a favorite in one tap", icon: "bookmark", route: "/saved", color: colors.premium },
];

export function AddSheetProvider({ children }: { children: React.ReactNode }) {
  const { colors, styles } = useThemeStyles(createStyles);
  const [visible, setVisible] = useState(false);
  const [waterMode, setWaterMode] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const open = useCallback(() => { setWaterMode(false); setVisible(true); }, []);
  const close = useCallback(() => setVisible(false), []);
  const value = useMemo(() => ({ open, close }), [open, close]);

  async function addWater(ml: number) {
    close();
    try {
      const r = await api.logWater(ml);
      track("water_logged", { ml });
      toast.show(`Added ${ml} ml of water`, { icon: "water", actionTitle: "Undo", onAction: () => api.undoWater(r.id).catch(() => {}) });
    } catch (e: any) { toast.show(e.message ?? "Couldn't log water", { icon: "alert-circle" }); }
  }

  return (
    <AddSheetCtx.Provider value={value}>
      {children}
      <Sheet visible={visible} onClose={close} title={waterMode ? "Add water" : "What would you like to log?"} scroll={false}>
        {waterMode ? (
          <View style={styles.waterRow}>
            {[250, 500, 750].map(ml => (
              <Pressable key={ml} testID={`sheet-water-${ml}`} onPress={() => addWater(ml)} style={({ pressed }) => [styles.waterBtn, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel={`Add ${ml} milliliters`}>
                <Icon name="water" size={18} color={colors.water} />
                <Text style={styles.waterText}>+ {ml / 250} {ml === 250 ? "cup" : "cups"}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.grid}>
            {actions(colors).map(a => (
              <Pressable key={a.key} testID={`add-${a.key}`} accessibilityRole="button" accessibilityLabel={a.title}
                onPress={() => { if (a.key === "water") { setWaterMode(true); return; } close(); if (a.route) router.push(a.route as any); }}
                style={({ pressed }) => [styles.action, pressed && { backgroundColor: colors.surfaceTertiary }]}>
                <View style={[styles.actionIcon, { backgroundColor: a.color + "1F" }]}><Icon name={a.icon} size={22} color={a.color} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionTitle}>{a.title}</Text>
                  <Text style={styles.actionSub}>{a.sub}</Text>
                </View>
                <Icon name="chevron-forward" size={16} color={colors.muted} />
              </Pressable>
            ))}
          </View>
        )}
      </Sheet>
    </AddSheetCtx.Provider>
  );
}

export const useAddSheet = () => useContext(AddSheetCtx);

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  grid: { gap: 2 },
  action: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 10, paddingHorizontal: spacing.sm, borderRadius: radius.md, minHeight: 56 },
  actionIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  actionTitle: { fontSize: fontSize.md, fontWeight: "700", color: colors.onSurface },
  actionSub: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 1 },
  waterRow: { flexDirection: "row", gap: spacing.sm, paddingBottom: spacing.sm },
  waterBtn: { flex: 1, height: 64, borderRadius: radius.md, backgroundColor: colors.water + "18", alignItems: "center", justifyContent: "center", gap: 4 },
  waterText: { fontWeight: "800", color: colors.onSurface },
});
