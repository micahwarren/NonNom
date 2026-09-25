import React, { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { colors, fontSize, radius, spacing } from "@/src/theme";
import { api, DaySummary, ProgressData, WeeklyReport } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { BuddyAvatar } from "@/src/buddy";
import { Card, EmptyState, ErrorState, Icon, LoadingState, PremiumBadge, Segmented, StatCard } from "@/src/ui";
import { fmtNum, fmtWater, fmtWeight, dayName } from "@/src/units";

type Range = "7" | "30" | "90" | "365";

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isPremium } = useAuth();
  const units = user?.profile?.units ?? "imperial";
  const [range, setRange] = useState<Range>("7");
  const [data, setData] = useState<ProgressData | null>(null);
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [history, setHistory] = useState<DaySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [p, r, h] = await Promise.all([api.progress(Number(range) as 7 | 30 | 90 | 365), api.weeklyReport(), api.summaryHistory(7)]);
      setData(p); setReport(r); setHistory(h);
    } catch (e: any) { setErr(e.message); }
  }, [range]);
  useFocusEffect(useCallback(() => { load().finally(() => setLoading(false)); }, [load]));
  useEffect(() => { load(); }, [range]);

  const hasData = (data?.days_logged ?? 0) > 0;
  const weights = data?.weight_history ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={[styles.wrap, { paddingTop: insets.top + spacing.md }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.brandPrimary} />} testID="progress-scroll">
        <Text style={styles.title}>Progress</Text>
        <Segmented options={[{ value: "7", label: "7D" }, { value: "30", label: "30D" }, { value: "90", label: "3M" }, { value: "365", label: "1Y" }]} value={range} onChange={setRange} />

        {loading ? <LoadingState rows={4} /> : err ? <ErrorState message={err} onRetry={load} /> : !data ? null : (
          <>
            {!hasData && <EmptyState icon="trending-up-outline" title="No trends yet" message="Log a few days and Buddy will start showing trends." compact />}

            {/* Weight */}
            <Card style={{ gap: spacing.sm }} testID="weight-card">
              <View style={styles.cardHead}><Text style={styles.cardLabel}>Weight</Text><Pressable onPress={() => router.push("/weight")} hitSlop={8} testID="log-weight-link"><Text style={styles.link}>Log weight</Text></Pressable></View>
              {weights.length ? (
                <>
                  <View style={styles.cardHead}>
                    <View><Text style={styles.sub}>Start</Text><Text style={styles.bigStat} testID="weight-start">{fmtWeight(data.weight_start_kg, units)}</Text></View>
                    <Icon name="arrow-forward" size={18} color={colors.muted} />
                    <View style={{ alignItems: "flex-end" }}><Text style={styles.sub}>Now</Text><Text style={styles.bigStat} testID="weight-now">{fmtWeight(data.weight_end_kg, units)}</Text></View>
                  </View>
                  {data.weight_start_kg != null && data.weight_end_kg != null && Math.abs(data.weight_end_kg - data.weight_start_kg) > 0.05 && (
                    <Text style={[styles.sub, { color: colors.success, fontWeight: "700" }]} testID="weight-delta">{data.weight_end_kg < data.weight_start_kg ? "Down" : "Up"} {fmtWeight(Math.abs(data.weight_end_kg - data.weight_start_kg), units)} since you started</Text>
                  )}
                  <WeightChart points={weights.map(w => w.weight_kg)} labels={weights.map(w => dayName(w.date))} color={colors.fat} goal={data.goal_weight_kg} units={units} />
                  {data.goal_weight_kg && <Text style={styles.sub}>Goal {fmtWeight(data.goal_weight_kg, units)}{data.weight_end_kg != null ? ` · ${fmtWeight(Math.abs(data.weight_end_kg - data.goal_weight_kg), units)} to go` : ""}</Text>}
                </>
              ) : <Text style={styles.sub}>{data.weight_end_kg ? `Current ${fmtWeight(data.weight_end_kg, units)}. Log weight regularly to see a trend.` : "Log your weight to see your trend here."}</Text>}
            </Card>

            {/* Calories chart */}
            <Card style={{ gap: spacing.sm }} testID="calories-card">
              <View style={styles.cardHead}><Text style={styles.cardLabel}>Average calories</Text><Text style={styles.sub}>Goal {fmtNum(data.targets.calories)}</Text></View>
              <Text style={styles.bigStat}>{fmtNum(data.avg_calories)}<Text style={styles.unit}> /day</Text></Text>
              <BarChart series={data.series.map(d => d.calories)} target={data.targets.calories} color={colors.brandPrimary} labels={Number(range) <= 7 ? data.series.map(d => d.date.slice(8)) : undefined} />
            </Card>

            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <StatCard label="Protein" value={`${data.avg_protein_g}g`} sub={`${data.protein_pct}% of goal · /day`} icon="barbell-outline" color={colors.protein} testID="protein-stat" />
              <StatCard label="Consistency" value={`${data.days_in_range} of ${data.days_logged}`} sub="days within target range" icon="checkmark-circle-outline" color={colors.success} />
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <StatCard label="Water" value={fmtWater(data.avg_water_ml, units)} sub="average per day" icon="water-outline" color={colors.water} />
              <StatCard label="Streak" value={`${data.streak_days} day${data.streak_days === 1 ? "" : "s"}`} sub={`Longest ${data.longest_streak}`} icon="flame-outline" color={colors.brandPrimary} testID="streak-stat" />
            </View>

            {/* Weekly report */}
            <Card style={styles.report} testID="weekly-report">
              <View style={styles.reportHead}>
                <BuddyAvatar state="doing_well" equipped={user?.buddy?.equipped} size={56} animate={false} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.reportTitle}>Buddy's Weekly Report</Text>
                  <Text style={styles.sub}>{report?.headline}</Text>
                </View>
                {!isPremium && <PremiumBadge small />}
              </View>
              {(isPremium ? report?.insights : report?.insights.slice(0, 1))?.map((i, idx) => (
                <View key={idx} style={styles.insight}><Icon name="ellipse" size={6} color={colors.brandPrimary} /><Text style={styles.insightText}>{i}</Text></View>
              ))}
              {!isPremium && (report?.insights.length ?? 0) > 1 && (
                <Pressable onPress={() => router.push("/paywall")} style={styles.unlockRow} testID="report-upgrade"><Icon name="lock-closed" size={14} color={colors.premium} /><Text style={styles.unlockText}>{report!.insights.length - 1} more insights with Premium</Text></Pressable>
              )}
            </Card>

            {/* Daily history */}
            <Text style={styles.section}>Daily History</Text>
            <Card style={{ padding: 0, overflow: "hidden" }} testID="daily-history">
              {history.map((d, idx) => (
                <Pressable key={d.date} testID={`history-${d.date}`} onPress={() => router.push({ pathname: "/(tabs)/log", params: { date: d.date } } as any)} style={({ pressed }) => [styles.histRow, idx > 0 && { borderTopWidth: 1, borderTopColor: colors.divider }, pressed && { backgroundColor: colors.surface }]} accessibilityRole="button">
                  <BuddyAvatar state={d.entries ? d.buddy.state : "neutral"} equipped={user?.buddy?.equipped} size={40} animate={false} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.histDay}>{dayName(d.date)} <Text style={styles.histLabel}>· {d.day_label}</Text></Text>
                    <Text style={styles.sub}>{d.entries ? `${fmtNum(d.calories_in)} kcal · ${Math.round(d.protein_g)}g protein` : "No entries"}</Text>
                  </View>
                  <Icon name="chevron-forward" size={16} color={colors.muted} />
                </Pressable>
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function BarChart({ series, target, color, labels }: { series: number[]; target: number; color: string; labels?: string[] }) {
  const max = Math.max(target * 1.2, ...series, 1);
  const step = Math.max(1, Math.ceil(series.length / 45));
  const shown = series.filter((_, i) => i % step === 0);
  return (
    <View style={{ height: 120 }}>
      <View style={[styles.targetLine, { bottom: (target / max) * 100 }]} />
      <View style={styles.bars}>
        {shown.map((v, i) => <View key={i} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", height: 100 }}><View style={{ width: shown.length > 14 ? "70%" : "55%", height: Math.max(v > 0 ? 3 : 0, (v / max) * 100), backgroundColor: v > 0 ? color : colors.skeleton, borderRadius: 4 }} /></View>)}
      </View>
      {labels && <View style={styles.bars}>{labels.map((l, i) => <Text key={i} style={styles.axis}>{l}</Text>)}</View>}
    </View>
  );
}

/** True line chart: dots joined by rotated segments (no SVG dependency). */
function WeightChart({ points, labels, color, goal, units }: { points: number[]; labels: string[]; color: string; goal: number | null; units: "imperial" | "metric" }) {
  const [w, setW] = useState(0);
  const h = 110, padY = 14, padX = 10;
  const all = goal != null ? [...points, goal] : points;
  const min = Math.min(...all), max = Math.max(...all);
  const span = Math.max(max - min, 0.5);
  const n = points.length;
  const x = (i: number) => n === 1 ? w / 2 : padX + (i / (n - 1)) * (w - padX * 2);
  const y = (v: number) => padY + (1 - (v - min) / span) * (h - padY * 2);
  return (
    <View onLayout={e => setW(e.nativeEvent.layout.width)} style={{ height: h + 18 }}>
      {w > 0 && (
        <>
          {goal != null && <View style={{ position: "absolute", left: 0, right: 0, top: y(goal), borderTopWidth: 1, borderColor: colors.success, borderStyle: "dashed", opacity: 0.6 }} />}
          {points.slice(1).map((p, i) => {
            const x1 = x(i), y1 = y(points[i]), x2 = x(i + 1), y2 = y(p);
            const len = Math.hypot(x2 - x1, y2 - y1), ang = Math.atan2(y2 - y1, x2 - x1);
            return <View key={`s${i}`} style={{ position: "absolute", left: x1, top: y1 - 1, width: len, height: 2.5, backgroundColor: color, borderRadius: 2, transformOrigin: "0 50%", transform: [{ rotate: `${ang}rad` }] }} />;
          })}
          {points.map((p, i) => (
            <View key={`d${i}`} style={{ position: "absolute", left: x(i) - 5, top: y(p) - 5, width: 10, height: 10, borderRadius: 5, backgroundColor: i === n - 1 ? color : colors.surfaceSecondary, borderWidth: 2.5, borderColor: color }} />
          ))}
          {n > 1 && [0, n - 1].map(i => (
            <Text key={`l${i}`} style={{ position: "absolute", top: h + 2, left: i === 0 ? 0 : undefined, right: i === 0 ? undefined : 0, fontSize: fontSize.xs, color: colors.muted, fontWeight: "600" }}>{labels[i]} · {fmtWeight(points[i], units, 1)}</Text>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.5 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardLabel: { fontSize: fontSize.sm, fontWeight: "800", color: colors.onSurface, textTransform: "uppercase", letterSpacing: 0.5 },
  link: { fontSize: fontSize.sm, fontWeight: "700", color: colors.brandPrimary },
  bigStat: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.onSurface },
  unit: { fontSize: fontSize.sm, color: colors.muted, fontWeight: "600" },
  sub: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: "600" },
  bars: { flexDirection: "row", gap: 2, alignItems: "flex-end" },
  targetLine: { position: "absolute", left: 0, right: 0, height: 1, borderTopWidth: 1, borderStyle: "dashed", borderColor: colors.borderStrong },
  axis: { flex: 1, textAlign: "center", fontSize: 10, color: colors.muted, fontWeight: "600", marginTop: 4 },
  report: { gap: spacing.sm, backgroundColor: colors.surfaceTertiary, borderColor: colors.surfaceTertiary },
  reportHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  reportTitle: { fontSize: fontSize.md, fontWeight: "800", color: colors.onSurface },
  insight: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingRight: spacing.sm },
  insightText: { flex: 1, fontSize: fontSize.sm, color: colors.onSurface, lineHeight: 20, fontWeight: "600" },
  unlockRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.xs },
  unlockText: { fontSize: fontSize.sm, fontWeight: "700", color: colors.premium },
  section: { fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface, marginTop: spacing.xs },
  histRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 60 },
  histDay: { fontSize: fontSize.md, fontWeight: "800", color: colors.onSurface },
  histLabel: { fontWeight: "700", color: colors.textSecondary, fontSize: fontSize.sm },
});
