import React, { useEffect, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useThemeStyles, ThemeColors, fontSize, radius, spacing } from "@/src/theme";
import { api, DbFood, FoodEntry, Meal } from "@/src/api";
import { Button, EmptyState, ErrorState, Field, Icon, LoadingState, MealPicker, ScreenHeader, Sheet, useToast } from "@/src/ui";
import { DbFoodSheet, MacroLine } from "@/src/food-components";
import { track } from "@/src/analytics";

export default function SearchScreen() {
  const { colors, styles } = useThemeStyles(createStyles);
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ meal?: Meal; date?: string }>();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<DbFood[] | null>(null);
  const [recent, setRecent] = useState<FoodEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<DbFood | null>(null);
  const [manual, setManual] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => { api.recentFoods().then(setRecent).catch(() => {}); setTimeout(() => inputRef.current?.focus(), 300); }, []);

  function onChange(text: string) {
    setQ(text);
    if (timer.current) clearTimeout(timer.current);
    if (text.trim().length < 2) { setResults(null); return; }
    timer.current = setTimeout(() => search(text.trim()), 450);
  }
  async function search(text: string) {
    setLoading(true); setErr(null);
    try { const r = await api.searchFood(text); setResults(r.results); } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  }

  async function relog(item: FoodEntry) {
    try { await api.duplicateFood(item.id, params.meal); track("meal_logged", { source: "recent" }); toast.show(`Logged ${item.name}`); router.back(); } catch (e: any) { toast.show(e.message, { icon: "alert-circle" }); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Search Food" onBack={() => router.back()} close subtitle={params.meal ? `Adding to ${params.meal}` : undefined} />
      <View style={styles.searchBox}>
        <Icon name="search" size={18} color={colors.muted} />
        <TextInput ref={inputRef} value={q} onChangeText={onChange} placeholder="Chicken breast, banana, Greek yogurt…" placeholderTextColor={colors.muted} style={styles.input} returnKeyType="search" onSubmitEditing={() => q.trim().length >= 2 && search(q.trim())} testID="search-input" autoCorrect={false} />
        {q.length > 0 && <Pressable onPress={() => { setQ(""); setResults(null); }} hitSlop={8}><Icon name="close-circle" size={18} color={colors.muted} /></Pressable>}
      </View>

      {loading ? <LoadingState message="Searching USDA + Open Food Facts…" rows={4} /> : err ? (
        <ErrorState message={err} onRetry={() => search(q.trim())} secondaryTitle="Enter manually" onSecondary={() => setManual(true)} title="Search unavailable" />
      ) : results ? (
        <FlatList
          data={results} keyExtractor={(i, idx) => `${i.provider}-${i.provider_id}-${idx}`} contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<EmptyState icon="search-outline" title="No matches" message="Try a simpler name, or add it manually." ctaTitle="Enter manually" onCta={() => setManual(true)} compact />}
          ListHeaderComponent={results.length ? <Text style={styles.hint}>{results.length} results · database values</Text> : null}
          renderItem={({ item, index }) => (
            <Pressable testID={`search-result-${index}`} onPress={() => setSelected(item)} style={({ pressed }) => [styles.result, pressed && { backgroundColor: colors.surfaceSecondary }]} accessibilityRole="button">
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.meta} numberOfLines={1}>{item.brand ? `${item.brand} · ` : ""}{item.serving_label}</Text>
                <MacroLine p={item.per_serving.protein_g} c={item.per_serving.carbs_g} f={item.per_serving.fat_g} />
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Text style={styles.kcal}>{item.per_serving.calories} <Text style={styles.kcalU}>kcal</Text></Text>
                <Text style={styles.provider}>{item.provider === "usda" ? "USDA" : "Open Food Facts"}</Text>
              </View>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={recent} keyExtractor={i => i.id} contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled"
          ListHeaderComponent={<View style={styles.recentHead}><Text style={styles.sectionTitle}>{recent.length ? "Recent foods" : "Start typing to search"}</Text><Pressable onPress={() => setManual(true)} testID="manual-entry-link"><Text style={styles.link}>Enter manually</Text></Pressable></View>}
          ListEmptyComponent={<EmptyState icon="time-outline" title="Search 1M+ foods" message="Generic foods come from USDA; packaged foods from Open Food Facts. Recently logged foods will appear here for one-tap re-logging." compact />}
          renderItem={({ item }) => (
            <Pressable testID={`recent-${item.id}`} onPress={() => relog(item)} style={({ pressed }) => [styles.result, pressed && { backgroundColor: colors.surfaceSecondary }]} accessibilityRole="button" accessibilityLabel={`Log ${item.name} again`}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.meta}>{item.serving_label}{item.quantity !== 1 ? ` × ${item.quantity}` : ""}</Text>
              </View>
              <Text style={styles.kcal}>{item.calories} <Text style={styles.kcalU}>kcal</Text></Text>
              <Icon name="add-circle" size={24} color={colors.brandPrimary} />
            </Pressable>
          )}
        />
      )}

      <DbFoodSheet food={selected} onClose={() => setSelected(null)} onLogged={() => router.back()} source="search" />
      <ManualSheet visible={manual} onClose={() => setManual(false)} meal={params.meal} initialName={q} onLogged={() => router.back()} />
    </View>
  );
}

export function ManualSheet({ visible, onClose, meal: initialMeal, initialName = "", onLogged }: { visible: boolean; onClose: () => void; meal?: Meal; initialName?: string; onLogged: () => void }) {
  const { styles } = useThemeStyles(createStyles);
  const toast = useToast();
  const [name, setName] = useState(initialName); const [cal, setCal] = useState(""); const [p, setP] = useState(""); const [c, setC] = useState(""); const [f, setF] = useState(""); const [serving, setServing] = useState("");
  const [meal, setMeal] = useState<Meal>(initialMeal ?? "lunch");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) setName(initialName); }, [visible]);
  async function save() {
    if (!name.trim() || cal === "") return toast.show("Add a name and calories", { icon: "alert-circle" });
    setBusy(true);
    try {
      await api.logFood({ name: name.trim(), calories: parseFloat(cal) || 0, protein_g: parseFloat(p) || 0, carbs_g: parseFloat(c) || 0, fat_g: parseFloat(f) || 0, serving_label: serving.trim() || "1 serving", meal, source: "manual", data_source: "user" });
      track("meal_logged", { source: "manual" }); toast.show(`Added ${name.trim()}`); onClose(); onLogged();
    } catch (e: any) { toast.show(e.message, { icon: "alert-circle" }); } finally { setBusy(false); }
  }
  return (
    <Sheet visible={visible} onClose={onClose} title="Enter nutrition manually">
      <Field label="Food name" value={name} onChangeText={setName} placeholder="e.g. Homemade chili" testID="manual-name" />
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1 }}><Field label="Serving" value={serving} onChangeText={setServing} placeholder="1 bowl" testID="manual-serving" /></View>
        <View style={{ flex: 1 }}><Field label="Calories" value={cal} onChangeText={setCal} keyboardType="number-pad" placeholder="0" testID="manual-cal" /></View>
      </View>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1 }}><Field label="Protein g" value={p} onChangeText={setP} keyboardType="decimal-pad" placeholder="0" testID="manual-protein" /></View>
        <View style={{ flex: 1 }}><Field label="Carbs g" value={c} onChangeText={setC} keyboardType="decimal-pad" placeholder="0" /></View>
        <View style={{ flex: 1 }}><Field label="Fat g" value={f} onChangeText={setF} keyboardType="decimal-pad" placeholder="0" /></View>
      </View>
      <Text style={styles.label}>Meal</Text>
      <MealPicker value={meal} onChange={setMeal} />
      <View style={{ height: spacing.sm }} />
      <Button title="Add to log" onPress={save} loading={busy} testID="manual-save" />
    </Sheet>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  searchBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, height: 50 },
  input: { flex: 1, fontSize: fontSize.md, color: colors.onSurface, height: 50 },
  hint: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: "600", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  result: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider, minHeight: 64 },
  name: { fontSize: fontSize.md, fontWeight: "700", color: colors.onSurface },
  meta: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: "600" },
  kcal: { fontSize: fontSize.md, fontWeight: "800", color: colors.onSurface },
  kcalU: { fontSize: fontSize.xs, color: colors.muted, fontWeight: "600" },
  provider: { fontSize: 10, color: colors.muted, fontWeight: "700" },
  recentHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  sectionTitle: { fontSize: fontSize.md, fontWeight: "800", color: colors.onSurface },
  link: { fontWeight: "700", color: colors.brandPrimary, fontSize: fontSize.sm },
  label: { fontSize: fontSize.sm, fontWeight: "700", color: colors.onSurface, marginTop: spacing.xs },
});
