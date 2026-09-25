import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { colors, fontSize, radius, spacing } from "@/src/theme";
import { Achievement, api } from "@/src/api";
import { Card, ErrorState, Icon, IconName, LoadingState, ScreenHeader } from "@/src/ui";

export default function Achievements() {
  const router = useRouter();
  const [data, setData] = useState<{ achievements: Achievement[]; unlocked_count: number; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => api.achievements().then(setData).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Achievements" onBack={() => router.back()} subtitle={data ? `${data.unlocked_count} of ${data.total} unlocked` : undefined} />
      {err ? <ErrorState message={err} onRetry={load} /> : !data ? <LoadingState rows={4} /> : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxxl }}>
          {data.achievements.map(a => (
            <Card key={a.id} style={[styles.row, { opacity: a.unlocked ? 1 : 0.6 }]} testID={`achievement-${a.id}`}>
              <View style={[styles.icon, a.unlocked && { backgroundColor: colors.brandSecondary }]}><Icon name={(a.icon + (a.unlocked ? "" : "-outline")) as IconName} size={22} color={a.unlocked ? colors.onBrandSecondary : colors.muted} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{a.name}</Text>
                <Text style={styles.desc}>{a.description}</Text>
                {a.reward_name && <Text style={styles.reward}>{a.unlocked ? "Unlocked" : "Reward"}: {a.reward_name}</Text>}
              </View>
              {a.unlocked && <Icon name="checkmark-circle" size={22} color={colors.success} />}
            </Card>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  icon: { width: 46, height: 46, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  name: { fontSize: fontSize.md, fontWeight: "800", color: colors.onSurface },
  desc: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  reward: { fontSize: fontSize.xs, color: colors.premium, fontWeight: "700", marginTop: 4 },
});
