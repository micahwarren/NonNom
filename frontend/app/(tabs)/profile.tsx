import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors, spacing, radius } from "@/src/theme";
import { useAuth } from "@/src/auth-context";
import { api } from "@/src/api";
import { PetCharacter } from "@/src/pet-character";

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut, refresh, setUser } = useAuth();
  const [calGoal, setCalGoal] = useState(String(user?.daily_calorie_goal ?? 2000));
  const [waterGoal, setWaterGoal] = useState(String(user?.daily_water_goal_ml ?? 2500));
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const u = await api.updateGoals({
        daily_calorie_goal: Number(calGoal),
        daily_water_goal_ml: Number(waterGoal),
      });
      setUser(u);
      Alert.alert("Saved", "Goals updated");
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Failed");
    } finally { setBusy(false); }
  }

  async function downgrade() {
    await api.downgrade();
    await refresh();
  }

  async function share() {
    // MVP: mock share via alert
    Alert.alert("Share your buddy", `Look at ${user?.name}'s pet! ${user?.streak_days} day streak 🔥`);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={[styles.wrap, { paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxxl }]}>
        <View style={styles.header}>
          <PetCharacter mood={user?.plan === "premium" ? "glowing" : "happy"} size={110} />
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <View style={[styles.planPill, user?.plan === "premium" ? styles.planPremium : styles.planFree]}>
            <Text style={styles.planText}>{user?.plan === "premium" ? "⭐ Premium" : "Free plan"}</Text>
          </View>
        </View>

        {user?.plan !== "premium" && (
          <Pressable testID="paywall-cta" style={({ pressed }) => [styles.paywall, pressed && styles.pressed]} onPress={() => router.push("/paywall")}>
            <View style={styles.paywallInner}>
              <Text style={styles.paywallTitle}>Unlock Premium ✨</Text>
              <Text style={styles.paywallSub}>Unlimited AI scans · Advanced insights · Custom pet skins</Text>
              <View style={styles.paywallBtn}>
                <Text style={styles.paywallBtnText}>Upgrade</Text>
              </View>
            </View>
          </Pressable>
        )}

        <Text style={styles.section}>Daily goals</Text>
        <View style={styles.card}>
          <View style={styles.field}>
            <Text style={styles.label}>Calorie goal</Text>
            <TextInput testID="cal-goal-input" value={calGoal} onChangeText={setCalGoal} keyboardType="numeric" style={styles.input} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Water goal (ml)</Text>
            <TextInput testID="water-goal-input" value={waterGoal} onChangeText={setWaterGoal} keyboardType="numeric" style={styles.input} />
          </View>
          <Pressable testID="save-goals" style={styles.saveBtn} onPress={save} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.saveText}>Save goals</Text>}
          </Pressable>
        </View>

        <Text style={styles.section}>Social</Text>
        <View style={styles.card}>
          <Pressable testID="share-btn" style={styles.rowBtn} onPress={share}>
            <Text style={styles.rowLeft}>📤 Share my buddy</Text>
            <Text style={styles.rowChev}>›</Text>
          </Pressable>
        </View>

        <Text style={styles.section}>Account</Text>
        <View style={styles.card}>
          {user?.plan === "premium" && (
            <Pressable testID="downgrade-btn" style={styles.rowBtn} onPress={downgrade}>
              <Text style={styles.rowLeft}>Cancel Premium</Text>
              <Text style={styles.rowChev}>›</Text>
            </Pressable>
          )}
          <Pressable testID="logout-btn" style={styles.rowBtn} onPress={signOut}>
            <Text style={[styles.rowLeft, { color: colors.error }]}>Log out</Text>
            <Text style={styles.rowChev}>›</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, gap: spacing.md },
  header: { alignItems: "center", gap: spacing.xs, paddingVertical: spacing.md },
  name: { fontSize: 22, fontWeight: "800", color: colors.onSurface, marginTop: spacing.sm },
  email: { fontSize: 13, color: colors.muted },
  planPill: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, marginTop: spacing.sm },
  planFree: { backgroundColor: colors.surfaceTertiary },
  planPremium: { backgroundColor: colors.brandSecondary },
  planText: { fontWeight: "800", color: colors.onSurface },

  paywall: {
    backgroundColor: colors.brandPrimary, borderRadius: radius.lg, padding: spacing.lg,
    shadowColor: colors.brandPrimary, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35, shadowRadius: 16, elevation: 6,
  },
  paywallInner: { gap: spacing.xs },
  paywallTitle: { fontSize: 22, fontWeight: "800", color: colors.onBrandPrimary },
  paywallSub: { fontSize: 13, color: colors.onBrandPrimary, opacity: 0.9 },
  paywallBtn: { backgroundColor: colors.onBrandPrimary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.pill, alignSelf: "flex-start", marginTop: spacing.md },
  paywallBtnText: { color: colors.brandPrimary, fontWeight: "800" },

  section: { fontSize: 16, fontWeight: "800", color: colors.onSurface, marginTop: spacing.sm },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  field: { gap: 4 },
  label: { fontSize: 13, fontWeight: "600", color: colors.onSurfaceSecondary },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 16, color: colors.onSurface },
  saveBtn: { backgroundColor: colors.brandPrimary, paddingVertical: spacing.md, borderRadius: radius.pill, alignItems: "center" },
  saveText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 15 },

  rowBtn: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.sm },
  rowLeft: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  rowChev: { fontSize: 22, color: colors.muted },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
});
