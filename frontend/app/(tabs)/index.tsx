import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { colors, spacing, radius } from "@/src/theme";
import { PetCharacter, moodLabel, moodSubtitle } from "@/src/pet-character";
import { api, DaySummary } from "@/src/api";
import { useAuth } from "@/src/auth-context";

export default function Home() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setSummary(await api.summaryToday()); }
    catch (e: any) { setErr(e.message ?? "Failed to load"); }
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]));

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function quickWater(ml: number) {
    try { await api.logWater(ml); await load(); } catch {}
  }

  const mood = summary?.pet_mood ?? "neutral";
  const cal = summary?.calories_in ?? 0;
  const goal = summary?.calorie_goal ?? user?.daily_calorie_goal ?? 2000;
  const remaining = Math.max(0, goal - cal + (summary?.calories_burned ?? 0));
  const waterPct = summary ? Math.min(100, Math.round((summary.water_ml / summary.water_goal) * 100)) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView
        testID="home-scroll"
        contentContainerStyle={[styles.wrap, { paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxxl }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
      >
        {/* Streak header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.hi}>Hey {user?.name || "friend"}!</Text>
            <Text style={styles.date}>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</Text>
          </View>
          <View style={styles.streak} testID="streak-chip">
            <Text style={styles.streakEmoji}>🔥</Text>
            <Text style={styles.streakText}>{user?.streak_days ?? 0}</Text>
          </View>
        </View>

        {/* Pet */}
        <View style={styles.petSection}>
          {loading ? (
            <ActivityIndicator size="large" color={colors.brandPrimary} />
          ) : (
            <PetCharacter mood={mood} size={220} />
          )}
          <Text style={styles.moodLabel} testID="pet-mood-label">{moodLabel(mood)}</Text>
          <Text style={styles.moodSub}>{moodSubtitle(mood)}</Text>
        </View>

        {err && <Text style={styles.err}>{err}</Text>}

        {/* Rings */}
        <View style={styles.ringsRow}>
          <StatBubble label="Calories" value={String(cal)} sub={`/ ${goal}`} color={colors.brandPrimary} testID="stat-calories" />
          <StatBubble label="Remaining" value={String(remaining)} sub="kcal" color={colors.success} testID="stat-remaining" />
          <StatBubble label="Health" value={summary ? summary.avg_health_score.toFixed(1) : "—"} sub="/ 10" color={colors.brandSecondary} testID="stat-health" />
        </View>

        {/* Water */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>💧 Water</Text>
            <Text style={styles.cardValue} testID="water-value">
              {summary?.water_ml ?? 0} / {summary?.water_goal ?? 2500} ml
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${waterPct}%`, backgroundColor: colors.info }]} />
          </View>
          <View style={styles.waterRow}>
            {[250, 500, 750].map(ml => (
              <Pressable key={ml} testID={`water-quick-${ml}`} onPress={() => quickWater(ml)} style={({ pressed }) => [styles.waterBtn, pressed && styles.pressed]}>
                <Text style={styles.waterBtnText}>+{ml}ml</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Macros */}
        <View style={styles.macroRow}>
          <MacroCard label="Protein" value={summary?.protein_g ?? 0} unit="g" color={colors.brandPrimary} />
          <MacroCard label="Carbs" value={summary?.carbs_g ?? 0} unit="g" color={colors.brandSecondary} />
          <MacroCard label="Fat" value={summary?.fat_g ?? 0} unit="g" color={colors.brandTertiary} />
        </View>

        {/* Primary CTAs */}
        <Pressable testID="log-food-cta" style={({ pressed }) => [styles.primaryCta, pressed && styles.pressed]} onPress={() => router.push("/log")}>
          <Text style={styles.primaryCtaText}>🍽️  Log a meal</Text>
        </Pressable>
        <Pressable testID="scan-food-cta" style={({ pressed }) => [styles.secondaryCta, pressed && styles.pressed]} onPress={() => router.push("/scan")}>
          <Text style={styles.secondaryCtaText}>📸  Scan food with AI</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function StatBubble({ label, value, sub, color, testID }: { label: string; value: string; sub: string; color: string; testID?: string }) {
  return (
    <View style={[styles.bubble]} testID={testID}>
      <View style={[styles.bubbleDot, { backgroundColor: color }]} />
      <Text style={styles.bubbleVal}>{value}</Text>
      <Text style={styles.bubbleSub}>{sub}</Text>
      <Text style={styles.bubbleLabel}>{label}</Text>
    </View>
  );
}

function MacroCard({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <View style={styles.macroCard}>
      <View style={[styles.macroDot, { backgroundColor: color }]} />
      <Text style={styles.macroVal}>{value.toFixed(0)}{unit}</Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, gap: spacing.md },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  hi: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  date: { fontSize: 13, color: colors.muted, marginTop: 2 },
  streak: {
    flexDirection: "row", alignItems: "center", gap: spacing.xs,
    backgroundColor: colors.brandSecondary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  streakEmoji: { fontSize: 16 },
  streakText: { fontWeight: "800", fontSize: 16, color: colors.onBrandSecondary },

  petSection: { alignItems: "center", paddingVertical: spacing.md, gap: spacing.sm },
  moodLabel: { fontSize: 22, fontWeight: "800", color: colors.onSurface, marginTop: spacing.sm },
  moodSub: { fontSize: 14, color: colors.muted, textAlign: "center", paddingHorizontal: spacing.xl },

  ringsRow: { flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" },
  bubble: {
    flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.md, alignItems: "flex-start", gap: 2,
    shadowColor: "#2B2D42", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  bubbleDot: { width: 10, height: 10, borderRadius: 5, marginBottom: spacing.xs },
  bubbleVal: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  bubbleSub: { fontSize: 11, color: colors.muted, marginTop: -2 },
  bubbleLabel: { fontSize: 11, fontWeight: "600", color: colors.onSurfaceSecondary, marginTop: 4 },

  card: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg,
    gap: spacing.md, shadowColor: "#2B2D42", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  cardValue: { fontSize: 14, color: colors.muted, fontWeight: "700" },
  progressTrack: { height: 12, borderRadius: 6, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 6 },
  waterRow: { flexDirection: "row", gap: spacing.sm },
  waterBtn: {
    flex: 1, paddingVertical: spacing.md, borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary, alignItems: "center",
  },
  waterBtnText: { fontWeight: "800", color: colors.onSurfaceTertiary },

  macroRow: { flexDirection: "row", gap: spacing.sm },
  macroCard: {
    flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.md, alignItems: "center", gap: 2,
  },
  macroDot: { width: 8, height: 8, borderRadius: 4 },
  macroVal: { fontSize: 18, fontWeight: "800", color: colors.onSurface, marginTop: spacing.xs },
  macroLabel: { fontSize: 12, color: colors.muted, fontWeight: "600" },

  primaryCta: {
    backgroundColor: colors.brandPrimary, paddingVertical: spacing.lg,
    borderRadius: radius.pill, alignItems: "center", marginTop: spacing.sm,
    shadowColor: colors.brandPrimary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 5,
  },
  primaryCtaText: { color: colors.onBrandPrimary, fontSize: 17, fontWeight: "800" },
  secondaryCta: {
    backgroundColor: colors.surfaceSecondary, paddingVertical: spacing.lg,
    borderRadius: radius.pill, alignItems: "center",
    borderWidth: 2, borderColor: colors.brandPrimary,
  },
  secondaryCtaText: { color: colors.brandPrimary, fontSize: 16, fontWeight: "800" },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  err: { color: colors.error, textAlign: "center", fontWeight: "700" },
});
