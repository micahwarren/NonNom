import React, { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useThemeStyles, ThemeColors, fontSize, spacing } from "@/src/theme";
import { api, Meal, SavedMeal } from "@/src/api";
import { Button, Card, EmptyState, ErrorState, MealPicker, ScreenHeader, Sheet, Skeleton, useToast } from "@/src/ui";
import { MacroLine, SourceTag } from "@/src/food-components";
import { RecipeBody } from "./feed-me";
import { track } from "@/src/analytics";

export default function SavedMeals() {
  const { colors, styles } = useThemeStyles(createStyles);
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<SavedMeal[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<SavedMeal | null>(null);
  const [logging, setLogging] = useState<SavedMeal | null>(null);
  const [meal, setMeal] = useState<Meal>("lunch");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { setErr(null); try { setItems((await api.savedMeals()).items); } catch (e: any) { setErr(e.message); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function logNow(m: SavedMeal, withMeal?: Meal) {
    setBusy(true);
    try { await api.logSavedMeal(m.id, withMeal); track("meal_logged", { source: "saved" }); toast.show(`Logged ${m.name}`, { icon: "checkmark-circle" }); setLogging(null); router.replace("/(tabs)/log"); }
    catch (e: any) { toast.show(e.message ?? "Couldn't log", { icon: "alert-circle" }); } finally { setBusy(false); }
  }
  async function remove(m: SavedMeal) {
    setItems(x => (x ?? []).filter(i => i.id !== m.id)); setOpen(null);
    try { await api.deleteSavedMeal(m.id); } catch { load(); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Saved Meals" onBack={() => router.back()} />
      {err ? <ErrorState message={err} onRetry={load} /> : items === null ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>{[0, 1, 2].map(i => <Skeleton key={i} height={96} />)}</View>
      ) : items.length === 0 ? (
        <EmptyState icon="bookmark-outline" title="No saved meals yet" message="Save a suggestion from “What should I eat?” and re-log it here with one tap." ctaTitle="Get a suggestion" onCta={() => router.push("/feed-me")} />
      ) : (
        <FlatList data={items} keyExtractor={i => i.id} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }} renderItem={({ item, index }) => (
          <Card style={{ gap: spacing.sm }} testID={`saved-${index}`}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.desc} numberOfLines={2}>{item.description}</Text>
              </View>
              <Text style={styles.cal}>{item.calories} <Text style={styles.kcal}>kcal</Text></Text>
            </View>
            <MacroLine p={item.protein_g} c={item.carbs_g} f={item.fat_g} />
            <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
              <Button title="Log now" size="sm" onPress={() => logNow(item)} loading={busy} style={{ flex: 1 }} testID={`saved-log-${index}`} />
              <Button title="Pick meal" size="sm" variant="secondary" onPress={() => setLogging(item)} />
              <Button title="" icon="book-outline" size="sm" variant="ghost" onPress={() => setOpen(item)} accessibilityLabel="View recipe" />
            </View>
            {item.times_logged > 0 && <Text style={styles.meta}>Logged {item.times_logged}×</Text>}
          </Card>
        )} />
      )}
      <Sheet visible={!!open} onClose={() => setOpen(null)} title={open?.name}>
        <RecipeBody s={open} />
        <View style={{ alignItems: "center", marginTop: spacing.sm }}><SourceTag source="ai_estimate" /></View>
        <Button title="Remove from saved" variant="ghost" icon="trash-outline" onPress={() => open && remove(open)} style={{ marginTop: spacing.sm }} />
      </Sheet>
      <Sheet visible={!!logging} onClose={() => setLogging(null)} title={`Log ${logging?.name ?? ""}`}>
        <MealPicker value={meal} onChange={setMeal} />
        <Button title="Log it" onPress={() => logging && logNow(logging, meal)} loading={busy} style={{ marginTop: spacing.md }} />
      </Sheet>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  name: { fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface },
  desc: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  cal: { fontSize: fontSize.xl, fontWeight: "800", color: colors.onSurface },
  kcal: { fontSize: fontSize.xs, color: colors.muted, fontWeight: "600" },
  meta: { fontSize: fontSize.xs, color: colors.muted, fontWeight: "600" },
});
