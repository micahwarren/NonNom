import React, { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Link } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { useThemeStyles, ThemeColors, spacing, radius } from "@/src/theme";

export default function ForgotPassword() {
  const { colors, styles } = useThemeStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<"email" | "reset" | "done">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function requestCode() {
    if (busy) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter your email address."); return;
    }
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api.forgotPassword(email.trim());
      setMessage(result.message); setCode(""); setCooldown(60); setStep("reset");
    } catch (e: any) { setError(e.message ?? "Couldn't request a reset code. Please try again."); }
    finally { setBusy(false); }
  }

  async function resetPassword() {
    if (busy) return;
    setError("");
    if (!/^\d{8}$/.test(code)) { setError("Enter the 8-digit code from your email."); return; }
    if (password.length < 6) { setError("Use at least 6 characters for your new password."); return; }
    if (password !== confirmation) { setError("Your passwords don't match."); return; }
    setBusy(true);
    try {
      await api.resetPassword(email.trim(), code, password);
      setPassword(""); setConfirmation(""); setCode(""); setStep("done");
    } catch (e: any) { setError(e.message ?? "Couldn't reset your password. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={[styles.wrap, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{step === "done" ? "Password updated" : "Reset your password"}</Text>
        <Text style={styles.subtitle}>{step === "done" ? "Log in with your new password. Your other sessions have been signed out." : step === "email" ? "Enter the email address you used to create your account." : `Enter the code sent to ${email.trim()}. Codes expire after 15 minutes.`}</Text>
        {step === "email" && <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput testID="reset-email" accessibilityLabel="Email" value={email} onChangeText={setEmail} editable={!busy} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" placeholder="you@example.com" placeholderTextColor={colors.muted} style={styles.input} />
        </View>}
        {step === "reset" && <>
          {!!message && <Text accessibilityLiveRegion="polite" style={styles.subtitle}>{message}</Text>}
          <View style={styles.field}>
            <Text style={styles.label}>8-digit code</Text>
            <TextInput testID="reset-code" accessibilityLabel="8-digit reset code" value={code} onChangeText={value => setCode(value.replace(/\D/g, "").slice(0, 8))} editable={!busy} keyboardType="number-pad" autoComplete="one-time-code" maxLength={8} style={styles.input} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>New password</Text>
            <TextInput testID="reset-password" accessibilityLabel="New password" value={password} onChangeText={setPassword} editable={!busy} secureTextEntry autoComplete="new-password" maxLength={128} placeholder="At least 6 characters" placeholderTextColor={colors.muted} style={styles.input} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Confirm new password</Text>
            <TextInput testID="reset-confirm-password" accessibilityLabel="Confirm new password" value={confirmation} onChangeText={setConfirmation} editable={!busy} secureTextEntry autoComplete="new-password" maxLength={128} style={styles.input} />
          </View>
        </>}
        {!!error && <Text testID="reset-error" accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {step !== "done" && <Pressable testID="reset-submit" accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={step === "email" ? requestCode : resetPassword} style={[styles.button, busy && { opacity: 0.6 }]}>
          {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.buttonText}>{step === "email" ? "Send reset code" : "Update password"}</Text>}
        </Pressable>}
        {step === "reset" && <>
          <Pressable testID="reset-resend" accessibilityRole="button" disabled={busy || cooldown > 0} onPress={requestCode} style={styles.linkButton}>
            <Text style={[styles.link, (busy || cooldown > 0) && { color: colors.muted }]}>{cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setStep("email"); setError(""); setMessage(""); setCode(""); setPassword(""); setConfirmation(""); }} style={styles.linkButton}>
            <Text style={styles.link}>Use a different email</Text>
          </Pressable>
        </>}
        <Link href="/(auth)/login" replace asChild><Pressable accessibilityRole="link" style={styles.linkButton}><Text style={styles.link}>Back to login</Text></Pressable></Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  wrap: { paddingHorizontal: spacing.xl, gap: spacing.md },
  title: { fontSize: 30, fontWeight: "800", color: colors.onSurface, textAlign: "center" },
  subtitle: { fontSize: 15, lineHeight: 22, color: colors.muted, textAlign: "center" },
  field: { gap: spacing.xs },
  label: { fontSize: 13, fontWeight: "600", color: colors.onSurfaceSecondary },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1.5, borderColor: colors.border, fontSize: 16, color: colors.onSurface },
  button: { backgroundColor: colors.brandPrimary, padding: spacing.lg, borderRadius: radius.pill, alignItems: "center", marginTop: spacing.md },
  buttonText: { color: colors.onBrandPrimary, fontSize: 17, fontWeight: "800" },
  linkButton: { minHeight: 44, justifyContent: "center" },
  link: { color: colors.brandPrimary, textAlign: "center", fontWeight: "700" },
  error: { color: colors.error, textAlign: "center", fontWeight: "600" },
});
