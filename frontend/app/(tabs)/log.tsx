import React, { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useThemeStyles, ThemeColors, fontSize, spacing } from "@/src/theme";
import { api, FoodDay, FoodEntry, Meal } from "@/src/api";
import { Card, EmptyState, ErrorState, Icon, IconButton, LoadingState, MEALS } from "@/src/ui";
import { EditFoodSheet, FoodRow } from "@/src/food-components";
import { dayName, todayISO } from "@/src/units";

export default function LogScreen() {
  const { colors, styles } = useThemeStyles(createStyles);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const date = params.date ?? todayISO();
  const isToday = date === todayISO();
  const [day, setDay] = useState<FoodDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<FoodEntry | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setDay(await api.foodDay(isToday ? undefined : date)); } catch (e: any) { setErr(e.message); }
  }, [date]);
  useFocusEffect(useCallback(() => { load().finally(() => setLoading(false)); }, [load]));

  const goAdd = (meal: Meal) => router.push({ pathname: "/search", params: { meal, date } } as any);
  const totals = day?.totals;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={[styles.wrap, { paddingTop: insets.top + spacing.md }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.brandPrimary} />} testID="log-scroll">
        <View style={styles.headerRow}>
          {!isToday && <IconButton name="chevron-back" onPress={() => router.back()} label="Back" />}
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{isToday ? "Today's Log" : `${dayName(date)}'s Log`}</Text>
            <Text style={styles.sub}>{new Date(date + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</Text>
          </View>
        </View>

        <Card style={styles.summary} testID="log-summary">
          <Stat label="Calories" value={`${totals?.calories ?? 0}`} unit="kcal" />
          <View style={styles.vdiv} />
          <Stat label="Protein" value={`${Math.round(totals?.protein_g ?? 0)}`} unit="g" color={colors.protein} />
          <View style={styles.vdiv} />
          <Stat label="Meals" value={`${day?.count ?? 0}`} unit={day?.count === 1 ? "item" : "items"} />
        </Card>

        {loading ? <LoadingState rows={3} /> : err ? <ErrorState message={err} onRetry={load} /> : (
          <>
            {day && day.count === 0 && (
              <EmptyState icon="restaurant-outline" title="Nothing logged yet" message={isToday ? "Log your first meal and Buddy will start tracking your day." : "No entries were logged on this day."} ctaTitle={isToday ? "Log your first meal" : undefined} onCta={() => goAdd("breakfast")} compact />
            )}
            {MEALS.map(m => {
              const items = day?.meals[m.value] ?? [];
              const kcal = items.reduce((a, i) => a + i.calories, 0);
              return (
                <Card key={m.value} style={styles.mealCard} testID={`meal-section-${m.value}`}>
                  <View style={styles.mealHeader}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Icon name={m.icon} size={18} color={colors.textSecondary} />
                      <Text style={styles.mealTitle}>{m.label}</Text>
                    </View>
                    <Text style={styles.mealKcal}>{items.length ? `${kcal} kcal` : ""}</Text>
                  </View>
                  {items.map(it => <FoodRow key={it.id} item={it} onPress={() => setEditing(it)} testID={`food-row-${it.id}`} />)}
                  <Pressable onPress={() => goAdd(m.value)} style={({ pressed }) => [styles.addFood, pressed && { opacity: 0.7 }]} testID={`add-food-${m.value}`} accessibilityRole="button" accessibilityLabel={`Add food to ${m.label}`}>
                    <Icon name="add-circle" size={20} color={colors.brandPrimary} />
                    <Text style={styles.addFoodText}>Add Food</Text>
                  </Pressable>
                </Card>
              );
            })}
          </>
        )}
      </ScrollView>
      <EditFoodSheet item={editing} onClose={() => setEditing(null)} onChanged={load} />
    </View>
  );
}

function Stat({ label, value, unit, color }: { label: string; value: string; unit: string; color?: string }) {
  const { colors, styles } = useThemeStyles(createStyles);
  color ??= colors.onSurface;
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={[styles.statV, { color }]}>{value}<Text style={styles.statU}> {unit}</Text></Text>
      <Text style={styles.statL}>{label}</Text>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.5 },
  sub: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: "600", marginTop: 2 },
  summary: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md },
  vdiv: { width: 1, height: 32, backgroundColor: colors.divider },
  statV: { fontSize: fontSize.xl, fontWeight: "800" },
  statU: { fontSize: fontSize.xs, color: colors.muted, fontWeight: "600" },
  statL: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 2 },
  mealCard: { padding: 0, overflow: "hidden" },
  mealHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs },
  mealTitle: { fontSize: fontSize.md, fontWeight: "800", color: colors.onSurface },
  mealKcal: { fontSize: fontSize.sm, fontWeight: "700", color: colors.textSecondary },
  addFood: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 48 },
  addFoodText: { fontWeight: "700", color: colors.brandPrimary, fontSize: fontSize.sm },
});
