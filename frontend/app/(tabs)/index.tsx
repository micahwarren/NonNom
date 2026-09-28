import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, { FadeInDown, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { useThemeStyles, ThemeColors, fontSize, radius, spacing } from "@/src/theme";
import { BuddyAvatar } from "@/src/buddy";
import { api, DaySummary } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { Button, Card, ErrorState, Icon, ProgressBar, Sheet, Skeleton, useToast } from "@/src/ui";
import { fmtNum, fmtWater } from "@/src/units";
import { track } from "@/src/analytics";
import { useBuddyReaction } from "@/src/buddy-reaction-context";
import { withReaction, nomFromLegacy } from "@/src/nom-state";
import { WidgetSync } from "@/src/widget-sync";

export default function Home() {
  const { colors, styles } = useThemeStyles(createStyles);
  const { width } = useWindowDimensions();
  const buddySize = Math.min(255, width - spacing.lg * 2);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user, refresh } = useAuth();
  const { latest, active } = useBuddyReaction();
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [streakInfo, setStreakInfo] = useState(false);
  const [buddyInfo, setBuddyInfo] = useState(false);
  const [waterBusy, setWaterBusy] = useState(false);
  const units = user?.profile?.units ?? "imperial";
  const nomName = user?.nom_name ?? "Nom";
  const nom = withReaction(summary?.nom ?? nomFromLegacy(summary?.buddy.state ?? "neutral"), active);
  useEffect(() => {
    if (latest) setSummary(previous => ({ ...previous, ...latest.summary }));
  }, [latest]);

  // Nom voice line: one short mood-aware greeting per app open (cold start + return from background).
  const [voice, setVoice] = useState<string | null>(null);
  const spokeFor = useRef<string | null>(null);
  useEffect(() => {
    const lines = summary?.nom?.voiceLines;
    if (!lines?.length || spokeFor.current === summary?.date) return;
    spokeFor.current = summary?.date ?? "x";
    setVoice(lines[Math.floor(Math.random() * lines.length)]);
  }, [summary?.nom?.voiceLines, summary?.date]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", st => { if (st === "active") { spokeFor.current = null; load(); } });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!voice) return;
    const t = setTimeout(() => setVoice(null), 4500);
    return () => clearTimeout(t);
  }, [voice]);

  const load = useCallback(async () => {
    setErr(null);
    try { setSummary(await api.summaryToday()); } catch (e: any) { setErr(e.message ?? "Failed to load"); }
  }, []);

  useFocusEffect(useCallback(() => { load().finally(() => setLoading(false)); refresh(); }, [load]));

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false); }

  async function quickWater(ml: number) {
    if (!summary || waterBusy) return;
    setWaterBusy(true);
    try {
      const r = await api.logWater(ml);
      track("water_logged", { ml });
      toast.show("Added 1 cup of water (250 mL)", { icon: "water", actionTitle: "Undo", onAction: async () => { await api.undoWater(r.id).catch(() => {}); load(); } });
      if (r.unlocked?.length) toast.show(`Achievement unlocked: ${r.unlocked[0].name}`, { icon: "trophy" });
      load();
    } catch (e: any) { toast.show(e.message ?? "Couldn't log water", { icon: "alert-circle" }); load(); }
    finally { setWaterBusy(false); }
  }

  const t = summary?.targets ?? user?.targets ?? { calories: 2000, protein_g: 150, carbs_g: 225, fat_g: 65, water_ml: 2500 };
  const eaten = summary?.calories_in ?? 0;
  const burned = summary?.calories_burned ?? 0;
  const remaining = t.calories - eaten + burned;
  const streak = summary?.streak_days ?? user?.streak_days ?? 0;
  const level = summary?.level ?? user?.level ?? 1;
  const leveledToday = summary?.leveled_today ?? user?.leveled_today ?? false;
  const freeze = summary?.streak_freeze ?? user?.streak_freeze;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView testID="home-scroll" contentContainerStyle={[styles.wrap, { paddingTop: insets.top + spacing.md }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}>
        {/* Header: date · friends · streak */}
        <View style={styles.headerRow}>
          <Text style={styles.date} testID="home-date">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</Text>
          <Pressable style={styles.iconBtn} onPress={() => router.push("/friends")} accessibilityLabel="Friends" testID="friends-btn"><Icon name="people-outline" size={20} color={colors.onSurface} /></Pressable>
          <Pressable style={styles.streak} testID="streak-chip" onPress={() => setStreakInfo(true)} accessibilityLabel={`${streak} day streak`}>
            <Icon name="flame" size={16} color={colors.brandPrimary} />
            <Text style={styles.streakText}>{streak}</Text>
            {freeze?.available && <Icon name="shield-checkmark" size={14} color={colors.water} />}
          </Pressable>
        </View>

        {/* Buddy hero */}
        {loading ? (
          <View style={{ alignItems: "center", gap: spacing.md, paddingVertical: spacing.lg }}><Skeleton height={buddySize} width={buddySize} radius={buddySize / 2} /><Skeleton height={22} width={160} /><Skeleton height={16} width={260} /></View>
        ) : err ? (
          <ErrorState message={err} onRetry={() => { setLoading(true); load().finally(() => setLoading(false)); }} title="Couldn't load your day" />
        ) : (
          <View style={styles.hero}>
            {voice && <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOut.duration(180)} style={styles.bubble} testID="nom-voice-bubble" accessibilityLiveRegion="polite">
              <Text style={styles.bubbleText}>{voice}</Text>
              <View style={styles.bubbleTail} />
            </Animated.View>}
            <Pressable onPress={() => router.push("/customize")} accessibilityRole="button" accessibilityLabel={`Customize ${nomName}`} testID="buddy-hero">
              <BuddyAvatar nom={nom} reactionKey={active?.id} equipped={user?.buddy?.equipped} size={buddySize} level={level} testID="home-buddy-avatar" />
            </Pressable>
            <View style={styles.levelPill} testID="level-pill">
              <Icon name="star" size={12} color={colors.premium} />
              <Text style={styles.levelText}>Level {level}</Text>
              <Text style={styles.levelSub}>{leveledToday ? "· leveled up today" : "· log today to level up"}</Text>
            </View>
            {!!summary?.moods?.length && <View style={styles.moodRow} testID="home-mood-row"><Icon name="heart" size={12} color={colors.brandPrimary} /><Text style={styles.moodText}>Feeling {summary.moods.map(m => m.replace("low_energy", "tired").replace(/_/g, " ")).join(" · ")}</Text></View>}
            <View style={styles.headlineRow}>
              <View style={styles.infoSpacer} />
              <Text style={styles.headline} testID="buddy-headline">{summary?.buddy.headline}</Text>
              <Pressable testID="buddy-info-button" onPress={() => setBuddyInfo(true)} accessibilityRole="button" accessibilityLabel={`Why ${nomName} feels this way`} style={styles.infoButton}>
                <Icon name="information-circle-outline" size={15} color={colors.textSecondary} />
              </Pressable>
            </View>
          </View>
        )}

        {/* Calories */}
        <Card style={styles.calCard} testID="calorie-card">
          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.calBig} testID="stat-remaining">{fmtNum(Math.max(0, remaining))}</Text>
              <Text style={styles.calSub}>kcal remaining</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.calSmall} testID="stat-calories">{fmtNum(eaten)} eaten{burned > 0 ? ` · ${fmtNum(burned)} burned` : ""}</Text>
              <Text style={styles.calGoal}>Goal {fmtNum(t.calories)}</Text>
            </View>
          </View>
          <ProgressBar value={eaten / Math.max(t.calories, 1)} color={remaining < 0 ? colors.carbs : colors.brandPrimary} height={12} />
          {remaining < 0 && <Text style={styles.overNote}>{fmtNum(-remaining)} kcal over target. Tomorrow's a fresh start.</Text>}
          <View style={styles.macroRow}>
            {([["Protein", summary?.protein_g ?? 0, t.protein_g, colors.protein, "macro-protein"], ["Carbs", summary?.carbs_g ?? 0, t.carbs_g, colors.carbs, "macro-carbs"], ["Fat", summary?.fat_g ?? 0, t.fat_g, colors.fat, "macro-fat"]] as [string, number, number, string, string][]).map(([label, v, target, c, tid]) => (
              <View key={label} style={{ flex: 1, gap: 4 }} testID={tid}>
                <View style={styles.rowBetween}><Text style={styles.macroLabel}>{label}</Text><Text style={styles.macroVal}>{Math.round(v)}<Text style={styles.macroTarget}>/{target}g</Text></Text></View>
                <ProgressBar value={v / Math.max(target, 1)} color={c} height={6} />
              </View>
            ))}
          </View>
        </Card>

        {/* Water */}
        <Card style={styles.waterCard} testID="water-card">
          <Icon name="water" size={18} color={colors.water} />
          <View style={{ flex: 1 }}>
            <Text style={styles.waterVal} testID="water-value">{fmtWater(summary?.water_ml ?? 0, units)} <Text style={styles.calGoal}>/ {fmtWater(t.water_ml, units)}</Text></Text>
            <ProgressBar value={(summary?.water_ml ?? 0) / Math.max(t.water_ml, 1)} color={colors.water} height={6} />
          </View>
          <Pressable testID="water-add-cup" disabled={waterBusy || !summary} onPress={() => quickWater(250)} style={({ pressed }) => [styles.waterBtn, (pressed || waterBusy) && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel="Add one cup of water, 250 milliliters">
            <Text style={styles.waterBtnText}>+ 1 cup</Text>
          </Pressable>
        </Card>

        {/* Actions */}
        <Pressable testID="feed-me-cta" onPress={() => router.push("/feed-me")} style={({ pressed }) => [styles.feedMe, pressed && { opacity: 0.9 }]} accessibilityRole="button">
          <View style={styles.feedIcon}><Icon name="sparkles" size={20} color={colors.onSurfaceInverse} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.feedTitle}>What should I eat?</Text>
            <Text style={styles.feedSub}>Ideas that fit what you have left today</Text>
          </View>
          <Icon name="chevron-forward" size={18} color={colors.onSurfaceInverse} />
        </Pressable>
      </ScrollView>
      {summary && user && <WidgetSync nom={nom} summary={summary} user={user} />}

      <Sheet visible={buddyInfo} onClose={() => setBuddyInfo(false)} title={summary?.buddy.headline} testID="buddy-info-sheet">
        <Text style={styles.message} testID="buddy-message">{summary?.buddy.message}</Text>
        <Button title="Got it" onPress={() => setBuddyInfo(false)} testID="buddy-info-close" style={{ marginTop: spacing.md }} />
      </Sheet>
      <Sheet visible={streakInfo} onClose={() => setStreakInfo(false)} title={`${streak}-day streak`}>
        <Text style={styles.infoText}>{`Log at least one food a day to keep your streak going. Missing a day never erases the progress you’ve made, and your weekly Streak Freeze can protect one missed day. ${nomName} also levels up once per logged day.`}</Text>
        <View style={styles.freezeRow} testID="streak-freeze-status">
          <Icon name="shield-checkmark" size={20} color={freeze?.available ? colors.water : colors.muted} />
          <View style={{ flex: 1 }}>
            <Text style={styles.freezeTitle}>Streak Freeze {freeze?.available ? "ready" : "used this week"}</Text>
            <Text style={styles.infoText}>{freeze?.available ? "If you miss one day this week, your streak is protected automatically." : `Protected ${freeze?.used_on ?? "a missed day"}. A new freeze arrives in ${freeze?.resets_in_days ?? 7} day${(freeze?.resets_in_days ?? 7) === 1 ? "" : "s"}.`}</Text>
          </View>
        </View>
        <Button title="See achievements" variant="secondary" onPress={() => { setStreakInfo(false); router.push("/achievements"); }} style={{ marginTop: spacing.md }} />
      </Sheet>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  date: { flex: 1, fontSize: fontSize.md, color: colors.textSecondary, fontWeight: "700" },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  streak: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surfaceTertiary, paddingHorizontal: spacing.md, height: 40, borderRadius: radius.pill },
  streakText: { fontWeight: "800", fontSize: fontSize.md, color: colors.onSurface },
  hero: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  bubble: { maxWidth: 300, backgroundColor: colors.surfaceInverse, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg, marginBottom: -spacing.xs, alignItems: "center", zIndex: 2 },
  bubbleText: { color: colors.onSurfaceInverse, fontWeight: "700", fontSize: fontSize.sm, textAlign: "center" },
  bubbleTail: { position: "absolute", bottom: -6, width: 12, height: 12, backgroundColor: colors.surfaceInverse, transform: [{ rotate: "45deg" }], borderRadius: 2 },
  levelPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.md, height: 30, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  levelText: { fontWeight: "800", fontSize: fontSize.sm, color: colors.onSurface },
  levelSub: { fontWeight: "600", fontSize: fontSize.xs, color: colors.textSecondary },
  moodRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  moodText: { fontSize: fontSize.xs, fontWeight: "700", color: colors.textSecondary, textTransform: "capitalize" },
  headlineRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", width: "100%" },
  infoSpacer: { width: 44, height: 44 },
  infoButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headline: { flexShrink: 1, fontSize: fontSize.xl, fontWeight: "800", color: colors.onSurface, textAlign: "center", letterSpacing: -0.5 },
  message: { fontSize: fontSize.md, color: colors.textSecondary, lineHeight: 22, textAlign: "center", paddingHorizontal: spacing.md },
  calCard: { gap: spacing.md },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  calBig: { fontSize: fontSize.hero, fontWeight: "800", color: colors.onSurface, letterSpacing: -1.5, lineHeight: 52 },
  calSub: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: "600", marginTop: -4 },
  calSmall: { fontSize: fontSize.sm, color: colors.onSurface, fontWeight: "700" },
  calGoal: { fontSize: fontSize.xs, color: colors.muted, fontWeight: "600", marginTop: 2 },
  overNote: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: "600" },
  macroRow: { flexDirection: "row", gap: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  macroLabel: { fontSize: fontSize.xs, fontWeight: "700", color: colors.textSecondary },
  macroVal: { fontSize: fontSize.sm, fontWeight: "800", color: colors.onSurface },
  macroTarget: { fontSize: fontSize.xs, fontWeight: "600", color: colors.muted },
  waterCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  waterVal: { fontSize: fontSize.md, fontWeight: "800", color: colors.onSurface, marginBottom: 6 },
  waterBtn: { height: 44, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.water + "18", alignItems: "center", justifyContent: "center" },
  waterBtnText: { fontWeight: "800", color: colors.onSurface, fontSize: fontSize.sm },
  feedMe: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceInverse, borderRadius: radius.lg, padding: spacing.lg },
  feedIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  feedTitle: { fontSize: fontSize.md, fontWeight: "800", color: colors.onSurfaceInverse },
  feedSub: { fontSize: fontSize.xs, color: colors.onSurfaceInverse, opacity: 0.75, marginTop: 2 },
  infoText: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 22 },
  freezeRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start", marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface },
  freezeTitle: { fontWeight: "800", color: colors.onSurface, fontSize: fontSize.sm, marginBottom: 2 },
});
