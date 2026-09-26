import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeStyles, ThemeColors, fontSize, spacing } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { BuddyAvatar } from "@/src/buddy";
import { Button, useToast } from "@/src/ui";

// Shown once when the Terms or Privacy Policy version changed since the user last accepted (or for accounts created before
// consent tracking existed). Users can read both documents before agreeing.
export default function LegalUpdate() {
  const { colors, styles } = useThemeStyles(createStyles);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user, setUser, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const first = !user?.legal?.terms_version;
  async function accept() {
    setBusy(true);
    try { const legal = await api.acceptLegal(); if (user) setUser({ ...user, legal }); router.replace("/(tabs)"); }
    catch (e: any) { toast.show(e.message, { icon: "alert-circle" }); } finally { setBusy(false); }
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={[styles.wrap, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]} testID="legal-update-screen">
        <BuddyAvatar state="doing_well" equipped={user?.buddy?.equipped} size={120} />
        <Text style={styles.title}>{first ? "A quick agreement" : "We've updated our policies"}</Text>
        <Text style={styles.p}>{first ? "Before you continue, please review and accept the Terms of Service and Privacy Policy. They explain how NomNom works, that it isn't medical advice, and exactly what data the app stores." : "Our Terms of Service and/or Privacy Policy changed. Please review the current versions and accept to keep using NomNom."}</Text>
        <Pressable onPress={() => router.push("/legal?doc=terms" as any)} style={styles.linkRow} accessibilityRole="link" testID="legal-update-terms"><Text style={styles.link}>Read the Terms of Service</Text></Pressable>
        <Pressable onPress={() => router.push("/legal?doc=privacy" as any)} style={styles.linkRow} accessibilityRole="link" testID="legal-update-privacy"><Text style={styles.link}>Read the Privacy Policy</Text></Pressable>
        <Text style={styles.small}>Terms v{user?.legal?.current_terms_version} · Privacy v{user?.legal?.current_privacy_version}</Text>
        <Button title="I agree" onPress={accept} loading={busy} testID="legal-update-accept" style={{ marginTop: spacing.md }} />
        <Button title="Log out" variant="secondary" onPress={signOut} testID="legal-update-logout" />
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  wrap: { paddingHorizontal: spacing.xl, gap: spacing.md, alignItems: "center" },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.onSurface, textAlign: "center" },
  p: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 22, textAlign: "center" },
  linkRow: { minHeight: 44, justifyContent: "center" },
  link: { color: colors.brandPrimary, fontWeight: "700", fontSize: fontSize.sm },
  small: { fontSize: fontSize.xs, color: colors.muted },
});
