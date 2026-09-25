import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { colors, fontSize, radius, spacing } from "@/src/theme";
import { api, Meal, Suggestion, Targets } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { BuddyAvatar } from "@/src/buddy";
import { Button, Card, ErrorState, Icon, MealPicker, ScreenHeader, Sheet, useToast } from "@/src/ui";
import { MacroLine, SourceTag } from "@/src/food-components";
import { track } from "@/src/analytics";

export default function FeedMe() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ remaining: Targets; suggestions: Suggestion[] } | null>(null);
  const [error, setError] = useState<{ msg: string; status: number } | null>(null);
  const [recipe, setRecipe] = useState<Suggestion | null>(null);
  const [logging, setLogging] = useState<Suggestion | null>(null);
  const [meal, setMeal] = useState<Meal>("lunch");
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState<string[]>([]);

  async function load(exclude: string[] = []) {
    setLoading(true); setError(null);
    try { const r = await api.feedMe(exclude); track("feed_me_used"); setData(r); setSeen(s => [...s, ...r.suggestions.map(x => x.name)]); }
    catch (e: any) { setError({ msg: e.message, status: e.status ?? 0 }); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function logIt() {
    if (!logging) return;
    setBusy(true);
    try {
      await api.logFood({ name: logging.name, calories: logging.calories, protein_g: logging.protein_g, carbs_g: logging.carbs_g, fat_g: logging.fat_g, serving_label: "1 serving", meal, source: "describe", data_source: "ai_estimate" });
      track("meal_logged", { source: "feed_me" }); toast.show(`Logged ${logging.name}`); setLogging(null); router.replace("/(tabs)/log");
    } catch (e: any) { toast.show(e.message, { icon: "alert-circle" }); } finally { setBusy(false); }
  }

  const r = data?.remaining;
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="What should I eat?" onBack={() => router.back()} close subtitle="AI suggestions" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}>
        {r && (
          <Card style={styles.left} testID="feed-remaining">
            <Text style={styles.leftLabel}>You have left today</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Big v={`${Math.max(0, r.calories)}`} l="kcal" />
              <Big v={`${Math.max(0, r.protein_g)}g`} l="protein" c={colors.protein} />
              <Big v={`${Math.max(0, r.carbs_g)}g`} l="carbs" c={colors.carbs} />
              <Big v={`${Math.max(0, r.fat_g)}g`} l="fat" c={colors.fat} />
            </View>
          </Card>
        )}
        {loading ? (
          <View style={{ alignItems: "center", gap: spacing.md, paddingVertical: spacing.xl }} testID="feed-loading">
            <BuddyAvatar state="doing_well" equipped={user?.buddy?.equipped} size={100} />
            <Text style={styles.status}>Buddy is thinking about what fits…</Text>
          </View>
        ) : error ? (
          <Card>{error.status === 402
            ? <ErrorState title="Free limit reached" message={error.msg} onRetry={() => router.push("/paywall")} secondaryTitle="Search foods" onSecondary={() => router.replace("/search")} />
            : <ErrorState title="Buddy is stumped" message={error.msg} onRetry={() => load()} />}</Card>
        ) : (
          <>
            {data?.suggestions.map((s, i) => (
              <Card key={i} style={{ gap: spacing.sm }} testID={`suggestion-${i}`}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.sm }}>
                  <Text style={styles.name}>{s.name}</Text>
                  <Text style={styles.kcal}>{s.calories} <Text style={styles.kcalU}>kcal</Text></Text>
                </View>
                <MacroLine p={s.protein_g} c={s.carbs_g} f={s.fat_g} size={fontSize.sm} />
                <Text style={styles.desc}>{s.description}</Text>
                <View style={styles.reason}><Icon name="checkmark-circle" size={14} color={colors.success} /><Text style={styles.reasonText}>{s.reason}</Text></View>
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <Button title="Log this" size="sm" onPress={() => setLogging(s)} style={{ flex: 1 }} testID={`log-suggestion-${i}`} />
                  <Button title="Show recipe" size="sm" variant="secondary" onPress={() => setRecipe(s)} style={{ flex: 1 }} />
                </View>
              </Card>
            ))}
            <Button title="Another suggestion" icon="refresh" variant="ghost" onPress={() => load(seen)} testID="feed-another" />
            <View style={{ alignItems: "center", gap: 4 }}><SourceTag source="ai_estimate" /><Text style={styles.note}>Nutrition values are estimates. Nearby restaurant options aren't available yet.</Text></View>
          </>
        )}
      </ScrollView>

      <Sheet visible={!!recipe} onClose={() => setRecipe(null)} title={recipe?.name}>
        {recipe?.recipe.map((step, i) => <View key={i} style={styles.step}><Text style={styles.stepNum}>{i + 1}</Text><Text style={styles.stepText}>{step}</Text></View>)}
        <Button title="Log this meal" onPress={() => { setLogging(recipe); setRecipe(null); }} style={{ marginTop: spacing.sm }} />
      </Sheet>
      <Sheet visible={!!logging} onClose={() => setLogging(null)} title={`Log ${logging?.name ?? ""}`}>
        <Text style={styles.desc}>{logging?.calories} kcal · estimated</Text>
        <Text style={[styles.leftLabel, { marginTop: spacing.sm }]}>Meal</Text>
        <MealPicker value={meal} onChange={setMeal} />
        <Button title="Add to log" onPress={logIt} loading={busy} style={{ marginTop: spacing.md }} testID="feed-confirm-log" />
      </Sheet>
    </View>
  );
}

function Big({ v, l, c = colors.onSurface }: { v: string; l: string; c?: string }) {
  return <View><Text style={[styles.big, { color: c }]}>{v}</Text><Text style={styles.bigL}>{l}</Text></View>;
}

const styles = StyleSheet.create({
  left: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse, gap: spacing.sm },
  leftLabel: { fontSize: fontSize.xs, fontWeight: "800", color: colors.onSurfaceInverse, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.5 },
  big: { fontSize: fontSize.xl, fontWeight: "800", color: colors.onSurfaceInverse },
  bigL: { fontSize: fontSize.xs, color: colors.onSurfaceInverse, opacity: 0.7, fontWeight: "600" },
  status: { fontWeight: "700", color: colors.textSecondary },
  name: { flex: 1, fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface },
  kcal: { fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface },
  kcalU: { fontSize: fontSize.xs, color: colors.muted, fontWeight: "600" },
  desc: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  reason: { flexDirection: "row", alignItems: "flex-start", gap: 6, backgroundColor: colors.success + "14", padding: spacing.sm, borderRadius: radius.md },
  reasonText: { flex: 1, fontSize: fontSize.xs, fontWeight: "700", color: colors.onSurface, lineHeight: 18 },
  note: { fontSize: fontSize.xs, color: colors.muted, textAlign: "center" },
  step: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", paddingVertical: 6 },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surfaceTertiary, textAlign: "center", lineHeight: 24, fontWeight: "800", fontSize: fontSize.xs, color: colors.onSurface },
  stepText: { flex: 1, fontSize: fontSize.sm, color: colors.onSurface, lineHeight: 20 },
});
