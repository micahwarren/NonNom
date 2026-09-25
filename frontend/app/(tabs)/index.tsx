import React, { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { colors, fontSize, radius, spacing } from "@/src/theme";
import { BuddyAvatar } from "@/src/buddy";
import { api, DaySummary } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { Button, Card, ErrorState, Icon, MacroCard, ProgressBar, Sheet, Skeleton, useToast } from "@/src/ui";
import { fmtNum, fmtWater, greeting } from "@/src/units";
import { track } from "@/src/analytics";

export default function Home() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user, refresh } = useAuth();
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [scoreInfo, setScoreInfo] = useState(false);
  const units = user?.profile?.units ?? "imperial";

  const load = useCallback(async () => {
    setErr(null);
    try { setSummary(await api.summaryToday()); } catch (e: any) { setErr(e.message ?? "Failed to load"); }
  }, []);

  useFocusEffect(useCallback(() => { load().finally(() => setLoading(false)); refresh(); }, [load]));

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false); }

  async function quickWater(ml: number) {
    if (!summary) return;
    setSummary({ ...summary, water_ml: summary.water_ml + ml });
    try {
      const r = await api.logWater(ml);
      track("water_logged", { ml });
      toast.show(`Added ${ml} ml`, { icon: "water", actionTitle: "Undo", onAction: async () => { await api.undoWater(r.id).catch(() => {}); load(); } });
      if (r.unlocked?.length) toast.show(`Achievement unlocked: ${r.unlocked[0].name}`, { icon: "trophy" });
      load();
    } catch (e: any) { toast.show(e.message ?? "Couldn't log water", { icon: "alert-circle" }); load(); }
  }

  const t = summary?.targets ?? user?.targets ?? { calories: 2000, protein_g: 150, carbs_g: 225, fat_g: 65, water_ml: 2500 };
  const eaten = summary?.calories_in ?? 0;
  const burned = summary?.calories_burned ?? 0;
  const remaining = t.calories - eaten + burned;
  const streak = summary?.streak_days ?? user?.streak_days ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView testID="home-scroll" contentContainerStyle={[styles.wrap, { paddingTop: insets.top + spacing.md }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hi} testID="greeting">{greeting(user?.name)}</Text>
            <Text style={styles.date}>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</Text>
          </View>
          <Pressable style={styles.streak} testID="streak-chip" onPress={() => router.push("/achievements")} accessibilityLabel={`${streak} day streak`}>
            <Icon name="flame" size={16} color={colors.brandPrimary} />
            <Text style={styles.streakText}>{streak}-day streak</Text>
          </Pressable>
        </View>

        {/* Buddy */}
        {loading ? (
          <View style={{ alignItems: "center", gap: spacing.md, paddingVertical: spacing.md }}><Skeleton height={132} width={132} radius={66} /><Skeleton height={22} width={160} /><Skeleton height={16} width={260} /></View>
        ) : err ? (
          <ErrorState message={err} onRetry={() => { setLoading(true); load().finally(() => setLoading(false)); }} title="Couldn't load your day" />
        ) : (
          <Pressable style={styles.buddyRow} onPress={() => router.push("/customize")} accessibilityRole="button" accessibilityLabel="Customize Buddy" testID="buddy-hero">
            <BuddyAvatar state={summary?.buddy.state ?? "neutral"} equipped={user?.buddy?.equipped} size={132} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.headline} testID="buddy-headline">{summary?.buddy.headline}</Text>
              <Text style={styles.message} testID="buddy-message">{summary?.buddy.message}</Text>
              <View style={styles.customizeHint}><Icon name="color-palette-outline" size={13} color={colors.brandPrimary} /><Text style={styles.customizeText}>Customize Buddy</Text></View>
            </View>
          </Pressable>
        )}

        {/* Calorie card */}
        <Card style={styles.calCard} testID="calorie-card">
          <View style={styles.calTop}>
            <Text style={styles.cardLabel}>Calories</Text>
            <Pressable onPress={() => setScoreInfo(true)} style={styles.scoreChip} testID="score-chip" accessibilityLabel="Nutrition score info">
              <Text style={styles.scoreText}>Nutrition Score {summary?.nutrition_score ?? 0}</Text>
              <Icon name="information-circle-outline" size={14} color={colors.textSecondary} />
            </Pressable>
          </View>
          <View style={styles.calNums}>
            <View>
              <Text style={styles.calBig} testID="stat-remaining">{fmtNum(Math.max(0, remaining))}</Text>
              <Text style={styles.calSub}>{remaining >= 0 ? "remaining" : "remaining"}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.calSmall} testID="stat-calories">{fmtNum(eaten)} eaten</Text>
              {burned > 0 && <Text style={styles.calSmall}>{fmtNum(burned)} burned</Text>}
              <Text style={styles.calGoal}>Goal {fmtNum(t.calories)} kcal</Text>
            </View>
          </View>
          <ProgressBar value={eaten / Math.max(t.calories, 1)} color={remaining < 0 ? colors.carbs : colors.brandPrimary} height={12} />
          {remaining < 0 && <Text style={styles.overNote}>{fmtNum(-remaining)} kcal over target. Tomorrow's a fresh start.</Text>}
        </Card>

        {/* Macros */}
        <View style={styles.macroRow}>
          <MacroCard label="Protein" value={summary?.protein_g ?? 0} target={t.protein_g} color={colors.protein} testID="macro-protein" />
          <MacroCard label="Carbs" value={summary?.carbs_g ?? 0} target={t.carbs_g} color={colors.carbs} testID="macro-carbs" />
          <MacroCard label="Fat" value={summary?.fat_g ?? 0} target={t.fat_g} color={colors.fat} testID="macro-fat" />
        </View>

        {/* Water */}
        <Card style={{ gap: spacing.md }} testID="water-card">
          <View style={styles.calTop}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="water" size={16} color={colors.water} /><Text style={styles.cardLabel}>Water</Text></View>
            <Text style={styles.waterVal} testID="water-value">{fmtWater(summary?.water_ml ?? 0, units)} <Text style={styles.calGoal}>/ {fmtWater(t.water_ml, units)}</Text></Text>
          </View>
          <ProgressBar value={(summary?.water_ml ?? 0) / Math.max(t.water_ml, 1)} color={colors.water} height={10} />
          <View style={styles.waterRow}>
            {[250, 500, 750].map(ml => (
              <Pressable key={ml} testID={`water-quick-${ml}`} onPress={() => quickWater(ml)} style={({ pressed }) => [styles.waterBtn, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel={`Add ${ml} milliliters`}>
                <Text style={styles.waterBtnText}>+{ml} ml</Text>
              </Pressable>
            ))}
          </View>
        </Card>

        {/* Actions */}
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Button title="Log Food" icon="add" onPress={() => router.push("/search")} style={{ flex: 1 }} size="lg" testID="log-food-cta" />
          <Button title="Scan Meal" icon="camera" variant="secondary" onPress={() => router.push("/scan")} style={{ flex: 1 }} size="lg" testID="scan-food-cta" />
        </View>
        <Pressable testID="feed-me-cta" onPress={() => router.push("/feed-me")} style={({ pressed }) => [styles.feedMe, pressed && { opacity: 0.9 }]} accessibilityRole="button">
          <View style={styles.feedIcon}><Icon name="sparkles" size={20} color={colors.onSurfaceInverse} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.feedTitle}>What should I eat?</Text>
            <Text style={styles.feedSub}>Ideas that fit what you have left today</Text>
          </View>
          <Icon name="chevron-forward" size={18} color={colors.onSurfaceInverse} />
        </Pressable>
      </ScrollView>

      <Sheet visible={scoreInfo} onClose={() => setScoreInfo(false)} title="Nutrition Score">
        <Text style={styles.infoText}>{summary?.score_explanation ?? "Log a meal to start scoring your day."}</Text>
        <Button title="Got it" onPress={() => setScoreInfo(false)} style={{ marginTop: spacing.md }} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  hi: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.5 },
  date: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2, fontWeight: "600" },
  streak: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surfaceTertiary, paddingHorizontal: spacing.md, height: 36, borderRadius: radius.pill },
  streakText: { fontWeight: "800", fontSize: fontSize.sm, color: colors.onSurface },
  buddyRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  headline: { fontSize: fontSize.xl, fontWeight: "800", color: colors.onSurface },
  message: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  customizeHint: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  customizeText: { fontSize: fontSize.xs, fontWeight: "700", color: colors.brandPrimary },
  calCard: { gap: spacing.md },
  calTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardLabel: { fontSize: fontSize.sm, fontWeight: "800", color: colors.onSurface, textTransform: "uppercase", letterSpacing: 0.5 },
  scoreChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surface, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  scoreText: { fontSize: fontSize.xs, fontWeight: "700", color: colors.textSecondary },
  calNums: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  calBig: { fontSize: fontSize.hero, fontWeight: "800", color: colors.onSurface, letterSpacing: -1.5, lineHeight: 52 },
  calSub: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: "600", marginTop: -4 },
  calSmall: { fontSize: fontSize.sm, color: colors.onSurface, fontWeight: "700" },
  calGoal: { fontSize: fontSize.xs, color: colors.muted, fontWeight: "600", marginTop: 2 },
  overNote: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: "600" },
  macroRow: { flexDirection: "row", gap: spacing.sm },
  waterVal: { fontSize: fontSize.md, fontWeight: "800", color: colors.onSurface },
  waterRow: { flexDirection: "row", gap: spacing.sm },
  waterBtn: { flex: 1, height: 44, borderRadius: radius.pill, backgroundColor: colors.water + "18", alignItems: "center", justifyContent: "center" },
  waterBtnText: { fontWeight: "800", color: colors.onSurface, fontSize: fontSize.sm },
  feedMe: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceInverse, borderRadius: radius.lg, padding: spacing.lg },
  feedIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  feedTitle: { fontSize: fontSize.md, fontWeight: "800", color: colors.onSurfaceInverse },
  feedSub: { fontSize: fontSize.xs, color: colors.onSurfaceInverse, opacity: 0.75, marginTop: 2 },
  infoText: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 22 },
});
