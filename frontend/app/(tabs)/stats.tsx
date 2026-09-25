import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { colors, spacing, radius } from "@/src/theme";
import { api, DaySummary } from "@/src/api";
import { PetCharacter, moodLabel } from "@/src/pet-character";

export default function Stats() {
  const insets = useSafeAreaInsets();
  const [history, setHistory] = useState<DaySummary[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    api.summaryHistory(7).then(setHistory).catch(() => {}).finally(() => setLoading(false));
  }, []));

  const weekAvgHealth = history.length ? (history.reduce((a, b) => a + b.avg_health_score, 0) / history.length) : 0;
  const totalCals = history.reduce((a, b) => a + b.calories_in, 0);
  const totalWater = history.reduce((a, b) => a + b.water_ml, 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.title}>Your journey</Text>
        <Text style={styles.subtitle}>Last 7 days</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md }}>
        {loading ? <ActivityIndicator color={colors.brandPrimary} /> : (
          <>
            <View style={styles.summaryRow}>
              <SummaryCard label="Avg Health" value={weekAvgHealth.toFixed(1)} unit="/10" color={colors.success} />
              <SummaryCard label="Total kcal" value={String(totalCals)} unit="" color={colors.brandPrimary} />
              <SummaryCard label="Water" value={(totalWater / 1000).toFixed(1)} unit="L" color={colors.info} />
            </View>

            <Text style={styles.section}>Mood timeline</Text>
            <View style={{ gap: spacing.sm }}>
              {history.map((d, i) => (
                <View key={d.date} style={styles.dayCard} testID={`day-${d.date}`}>
                  <View style={styles.petWrap}>
                    <PetCharacter mood={d.pet_mood} size={64} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dayLabel}>{i === 0 ? "Today" : new Date(d.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</Text>
                    <Text style={styles.dayMood}>{moodLabel(d.pet_mood)} · {d.pet_mood_score}/100</Text>
                    <Text style={styles.dayStats}>
                      {d.calories_in} kcal · {d.meals_logged} meals · {(d.water_ml / 1000).toFixed(1)}L
                    </Text>
                  </View>
                  <View style={styles.scoreBadge}>
                    <View style={[styles.scoreBar, { height: `${d.pet_mood_score}%`, backgroundColor: moodBarColor(d.pet_mood_score) }]} />
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function moodBarColor(s: number) {
  if (s >= 70) return colors.success;
  if (s >= 40) return colors.warning;
  return colors.error;
}

function SummaryCard({ label, value, unit, color }: any) {
  return (
    <View style={styles.summary}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.summaryVal}>{value}<Text style={styles.summaryUnit}>{unit}</Text></Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surface },
  title: { fontSize: 28, fontWeight: "800", color: colors.onSurface },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 2 },
  summaryRow: { flexDirection: "row", gap: spacing.sm },
  summary: { flex: 1, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.lg, gap: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  summaryVal: { fontSize: 22, fontWeight: "800", color: colors.onSurface, marginTop: spacing.xs },
  summaryUnit: { fontSize: 12, color: colors.muted, fontWeight: "600" },
  summaryLabel: { fontSize: 11, color: colors.muted, fontWeight: "600" },
  section: { fontSize: 18, fontWeight: "800", color: colors.onSurface, marginTop: spacing.lg },
  dayCard: { flexDirection: "row", gap: spacing.md, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.lg, alignItems: "center" },
  petWrap: { width: 80, height: 80, alignItems: "center", justifyContent: "center" },
  dayLabel: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  dayMood: { fontSize: 13, color: colors.onSurfaceSecondary, marginTop: 2, fontWeight: "600" },
  dayStats: { fontSize: 12, color: colors.muted, marginTop: 2 },
  scoreBadge: { width: 8, height: 60, borderRadius: 4, backgroundColor: colors.surfaceTertiary, justifyContent: "flex-end", overflow: "hidden" },
  scoreBar: { width: "100%", borderRadius: 4 },
});
