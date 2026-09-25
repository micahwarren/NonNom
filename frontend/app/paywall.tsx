import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors, spacing, radius } from "@/src/theme";
import { PetCharacter } from "@/src/pet-character";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";

export default function Paywall() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { setUser } = useAuth();
  const [plan, setPlan] = useState<"premium_monthly" | "premium_yearly">("premium_yearly");
  const [busy, setBusy] = useState(false);

  async function subscribe() {
    setBusy(true);
    try {
      const u = await api.mockUpgrade(plan);
      setUser(u);
      router.replace("/(tabs)");
    } finally { setBusy(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.brandPrimary }}>
      <ScrollView contentContainerStyle={[styles.wrap, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl }]}>
        <Pressable testID="paywall-close" onPress={() => router.back()} style={styles.close}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>

        <View style={styles.hero}>
          <PetCharacter mood="glowing" size={180} />
          <Text style={styles.title}>Go Premium ⭐</Text>
          <Text style={styles.subtitle}>Unlock everything your buddy needs to thrive</Text>
        </View>

        <View style={styles.features}>
          {[
            ["📸", "Unlimited AI food scans", "Free plan: only 3/day"],
            ["🎨", "Exclusive pet skins & outfits", "Customize your buddy"],
            ["📊", "Advanced weekly insights", "Trends, macros, patterns"],
            ["🏆", "Streak protection", "Never lose a streak"],
            ["💝", "No ads. Ever.", "Peace of mind"],
          ].map(([e, t, s]) => (
            <View key={t} style={styles.featureRow}>
              <Text style={styles.featureEmoji}>{e}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>{t}</Text>
                <Text style={styles.featureSub}>{s}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.plans}>
          <Pressable testID="plan-yearly" onPress={() => setPlan("premium_yearly")} style={[styles.planCard, plan === "premium_yearly" && styles.planActive]}>
            <View style={styles.saveBadge}><Text style={styles.saveBadgeText}>SAVE 40%</Text></View>
            <Text style={styles.planName}>Yearly</Text>
            <Text style={styles.planPrice}>$47.99</Text>
            <Text style={styles.planPer}>/year · $4/mo</Text>
          </Pressable>
          <Pressable testID="plan-monthly" onPress={() => setPlan("premium_monthly")} style={[styles.planCard, plan === "premium_monthly" && styles.planActive]}>
            <Text style={styles.planName}>Monthly</Text>
            <Text style={styles.planPrice}>$6.99</Text>
            <Text style={styles.planPer}>/month</Text>
          </Pressable>
        </View>

        <Pressable testID="paywall-subscribe" style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]} onPress={subscribe} disabled={busy}>
          {busy ? <ActivityIndicator color={colors.brandPrimary} /> : <Text style={styles.ctaText}>Start Premium</Text>}
        </Pressable>
        <Text style={styles.fine}>Cancel anytime · Instant activation (demo mode)</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  close: { alignSelf: "flex-end", width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  closeText: { color: colors.onBrandPrimary, fontSize: 18, fontWeight: "800" },
  hero: { alignItems: "center", gap: spacing.sm },
  title: { fontSize: 32, fontWeight: "800", color: colors.onBrandPrimary, marginTop: spacing.md },
  subtitle: { fontSize: 15, color: colors.onBrandPrimary, opacity: 0.9, textAlign: "center", paddingHorizontal: spacing.lg },
  features: { backgroundColor: "rgba(255,255,255,0.15)", borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  featureRow: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  featureEmoji: { fontSize: 26 },
  featureTitle: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 15 },
  featureSub: { color: colors.onBrandPrimary, opacity: 0.85, fontSize: 12, marginTop: 2 },

  plans: { flexDirection: "row", gap: spacing.sm },
  planCard: { flex: 1, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: radius.lg, padding: spacing.lg, borderWidth: 2, borderColor: "transparent", position: "relative" },
  planActive: { backgroundColor: colors.onBrandPrimary, borderColor: colors.brandSecondary },
  saveBadge: { position: "absolute", top: -8, right: -8, backgroundColor: colors.brandSecondary, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
  saveBadgeText: { color: colors.onBrandSecondary, fontWeight: "800", fontSize: 10 },
  planName: { color: colors.onSurface, fontWeight: "800", fontSize: 14 },
  planPrice: { color: colors.onSurface, fontWeight: "800", fontSize: 26, marginTop: spacing.xs },
  planPer: { color: colors.muted, fontSize: 12, fontWeight: "600" },

  cta: { backgroundColor: colors.onBrandPrimary, paddingVertical: spacing.lg, borderRadius: radius.pill, alignItems: "center" },
  ctaText: { color: colors.brandPrimary, fontWeight: "800", fontSize: 17 },
  fine: { color: colors.onBrandPrimary, opacity: 0.7, textAlign: "center", fontSize: 12 },
});
