import React, { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator,
} from "react-native";
import { Link, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth-context";
import { colors, spacing, radius } from "@/src/theme";
import { BuddyAvatar } from "@/src/buddy";

export default function Signup() {
  const insets = useSafeAreaInsets();
  const { signUp } = useAuth();
  const { ref } = useLocalSearchParams<{ ref?: string }>();
  const [invite, setInvite] = useState(typeof ref === "string" ? ref.toUpperCase() : "");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null); setBusy(true);
    try { await signUp(email.trim(), password, name.trim(), invite.trim() || undefined); }
    catch (e: any) { setErr(e.message ?? "Signup failed"); }
    finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={[styles.wrap, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
        <View style={styles.petWrap}><BuddyAvatar state="celebrating" size={150} /></View>
        <Text style={styles.title}>Adopt your buddy</Text>
        <Text style={styles.subtitle}>Eat well, keep them glowing</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Name</Text>
          <TextInput testID="signup-name-input" value={name} onChangeText={setName}
            style={styles.input} placeholder="What should we call you?" placeholderTextColor={colors.muted} />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput testID="signup-email-input" value={email} onChangeText={setEmail}
            style={styles.input} autoCapitalize="none" keyboardType="email-address"
            placeholder="you@example.com" placeholderTextColor={colors.muted} />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput testID="signup-password-input" value={password} onChangeText={setPassword}
            style={styles.input} secureTextEntry placeholder="At least 6 characters"
            placeholderTextColor={colors.muted} />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Invite code <Text style={{ color: colors.muted }}>(optional)</Text></Text>
          <TextInput testID="signup-invite-input" value={invite} onChangeText={setInvite} style={styles.input} autoCapitalize="characters" autoCorrect={false} placeholder="From a friend" placeholderTextColor={colors.muted} />
        </View>

        {err && <Text style={styles.err} testID="signup-error">{err}</Text>}

        <Pressable testID="signup-submit-button" style={({ pressed }) => [styles.cta, pressed && styles.pressed]} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaText}>Create account</Text>}
        </Pressable>
        <Link href="/(auth)/login" asChild>
          <Pressable testID="go-to-login"><Text style={styles.link}>Already have an account? Log in</Text></Pressable>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.xl, gap: spacing.md },
  petWrap: { alignItems: "center", marginBottom: spacing.md },
  title: { fontSize: 32, fontWeight: "800", color: colors.onSurface, textAlign: "center" },
  subtitle: { fontSize: 15, color: colors.muted, textAlign: "center", marginBottom: spacing.lg },
  field: { gap: spacing.xs },
  label: { fontSize: 13, color: colors.onSurfaceSecondary, fontWeight: "600" },
  input: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.lg,
    borderWidth: 1.5, borderColor: colors.border, fontSize: 16, color: colors.onSurface,
  },
  cta: {
    backgroundColor: colors.brandPrimary, paddingVertical: spacing.lg,
    borderRadius: radius.pill, alignItems: "center", marginTop: spacing.md,
    shadowColor: colors.brandPrimary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 4,
  },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  ctaText: { color: colors.onBrandPrimary, fontSize: 17, fontWeight: "800" },
  link: { color: colors.brandPrimary, textAlign: "center", fontWeight: "700", marginTop: spacing.md },
  err: { color: colors.error, textAlign: "center", fontWeight: "600" },
});
