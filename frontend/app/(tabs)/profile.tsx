import React, { useState } from "react";
import { Linking, Platform, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors, fontSize, radius, spacing } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { ensureReminderPermission, openNotificationSettings, PermissionResult, remindersSupported, syncReminders } from "@/src/reminders";
import { useSubscription } from "@/src/revenuecat";
import { BuddyAvatar } from "@/src/buddy";
import { Button, Card, Field, Icon, PremiumBadge, Row, SectionTitle, Sheet, useToast } from "@/src/ui";
import { fmtWater, fmtWeight, fmtNum } from "@/src/units";

const GOAL_LABEL: Record<string, string> = { lose: "Lose weight", maintain: "Maintain weight", gain: "Gain weight", improve: "Improve nutrition" };
const LEGAL = { terms: process.env.EXPO_PUBLIC_TERMS_URL, privacy: process.env.EXPO_PUBLIC_PRIVACY_URL, support: process.env.EXPO_PUBLIC_SUPPORT_EMAIL };
const NOTIF: { key: string; label: string; sub: string }[] = [
  { key: "breakfast", label: "Breakfast reminder", sub: "Morning nudge to log" }, { key: "lunch", label: "Lunch reminder", sub: "Midday nudge" },
  { key: "dinner", label: "Dinner reminder", sub: "Evening nudge" }, { key: "hydration", label: "Hydration", sub: "Gentle water reminders" },
  { key: "streak", label: "Streak", sub: "Keep your streak alive" }, { key: "weekly_report", label: "Weekly Buddy report", sub: "Sunday summary" },
  { key: "achievements", label: "Achievements", sub: "When you unlock something" },
];
const PRIV: { key: string; label: string }[] = [
  { key: "show_streak", label: "Show streak to friends" }, { key: "show_achievements", label: "Show achievements" }, { key: "show_cosmetics", label: "Show Buddy cosmetics" },
  { key: "show_hydration_achievements", label: "Show hydration achievements" }, { key: "show_nutrition_achievements", label: "Show nutrition goal achievements" },
];

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user, signOut, refresh, isPremium, setUser } = useAuth();
  const { isSubscribed } = useSubscription();
  const [sheet, setSheet] = useState<null | "personal" | "notifications" | "privacy" | "units" | "delete">(null);
  const [name, setName] = useState(user?.name ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [busy, setBusy] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const units = user?.profile?.units ?? "imperial";
  const t = user?.targets;
  const p = user?.profile ?? {};

  async function savePersonal() {
    setBusy(true);
    try { setUser(await api.updateMe({ name: name.trim(), username: username.trim() || undefined })); toast.show("Saved"); setSheet(null); } catch (e: any) { toast.show(e.message, { icon: "alert-circle" }); } finally { setBusy(false); }
  }
  const [permState, setPermState] = useState<PermissionResult | null>(null);
  async function toggle(kind: "notifications" | "privacy", key: string, v: boolean) {
    if (!user) return;
    if (kind === "notifications" && v && key !== "achievements") {
      const perm = await ensureReminderPermission();
      setPermState(perm);
      if (perm === "blocked" || perm === "denied") return; // UI shows why + Open Settings
    }
    const next = { ...user[kind], [key]: v };
    setUser({ ...user, [kind]: next });
    try {
      if (kind === "notifications") { await api.updateNotifications({ [key]: v }); await syncReminders(next as Record<string, boolean>); }
      else await api.updatePrivacy({ [key]: v });
    } catch { refresh(); }
  }
  async function setUnits(u: "imperial" | "metric") { setUser(await api.updateMe({ profile: { units: u } })); }
  async function deleteAccount() {
    if (deleteText.trim().toUpperCase() !== "DELETE") return;
    setBusy(true);
    try { await api.deleteAccount(); await signOut(); } catch (e: any) { toast.show(e.message, { icon: "alert-circle" }); setBusy(false); }
  }
  const manageUrl = Platform.OS === "ios" ? "https://apps.apple.com/account/subscriptions" : "https://play.google.com/store/account/subscriptions";

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={[styles.wrap, { paddingTop: insets.top + spacing.md }]} testID="profile-scroll">
        <View style={styles.hero}>
          <BuddyAvatar state="doing_well" equipped={user?.buddy?.equipped} size={72} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user?.name}</Text>
            <Text style={styles.handle}>@{user?.username}</Text>
          </View>
          {isPremium ? <PremiumBadge /> : <Button title="Go Premium" size="sm" onPress={() => router.push("/paywall")} testID="profile-go-premium" />}
        </View>

        <SectionTitle title="My Goal" action="Edit Goal" onAction={() => router.push("/onboarding?edit=1" as any)} />
        <Card style={{ gap: 4 }} testID="goal-card">
          <Text style={styles.big}>{GOAL_LABEL[p.goal ?? "maintain"]}</Text>
          {p.weight_kg && p.goal_weight_kg && p.goal !== "maintain" && <Text style={styles.sub}>{fmtWeight(p.weight_kg, units, 0)} → {fmtWeight(p.goal_weight_kg, units, 0)}{p.pace_lb_per_week ? ` · ${p.pace_lb_per_week} lb/week` : ""}</Text>}
          {!p.goal && <Text style={styles.sub}>Set up your goal to personalize your targets.</Text>}
        </Card>

        <SectionTitle title="Daily Targets" action="Edit Targets" onAction={() => router.push("/edit-targets")} />
        <Card style={styles.targets} testID="targets-card">
          <Target label="Calories" v={fmtNum(t?.calories ?? 0)} />
          <Target label="Protein" v={`${t?.protein_g ?? 0}g`} c={colors.protein} />
          <Target label="Carbs" v={`${t?.carbs_g ?? 0}g`} c={colors.carbs} />
          <Target label="Fat" v={`${t?.fat_g ?? 0}g`} c={colors.fat} />
          <Target label="Water" v={fmtWater(t?.water_ml ?? 0, units)} c={colors.water} />
        </Card>

        <SectionTitle title="Buddy" />
        <Card style={{ padding: 0 }}>
          <Row icon="color-palette-outline" title="Customize Buddy" onPress={() => router.push("/customize")} testID="row-customize" />
          <Row icon="trophy-outline" title="Achievements" onPress={() => router.push("/achievements")} />
          <Row icon="people-outline" title="Friends" subtitle="Feed, high fives and side-by-side Buddies" onPress={() => router.push("/friends")} testID="row-friends" />
          <Row icon="person-add-outline" title="Invite a Friend" onPress={() => router.push("/friends?tab=invite")} testID="row-invite" />
          <Row icon="bookmark-outline" title="Saved Meals" onPress={() => router.push("/saved")} testID="row-saved" />
        </Card>

        <SectionTitle title="Subscription" />
        <Card style={{ padding: 0 }} testID="subscription-card">
          <Row icon={isPremium ? "sparkles" : "sparkles-outline"} title={isPremium ? "NomNom Premium" : "NomNom Free"} subtitle={isPremium ? (isSubscribed ? "Active via RevenueCat" : "Active") : "Upgrade for full Buddy customization and more AI"} onPress={() => (isPremium ? Linking.openURL(manageUrl) : router.push("/paywall"))} right={<Text style={styles.link}>{isPremium ? "Manage Subscription" : "Upgrade"}</Text>} />
          <Row icon="refresh-outline" title="Restore Purchases" onPress={() => router.push("/paywall")} />
        </Card>

        <SectionTitle title="Account" />
        <Card style={{ padding: 0 }}>
          <Row icon="person-outline" title="Personal information" onPress={() => setSheet("personal")} testID="row-personal" />
          <Row icon="notifications-outline" title="Notifications" onPress={() => setSheet("notifications")} testID="row-notifications" />
          <Row icon="shield-checkmark-outline" title="Privacy" onPress={() => setSheet("privacy")} testID="row-privacy" />
          <Row icon="swap-horizontal-outline" title="Units" subtitle={units === "metric" ? "Metric (kg, cm, L)" : "Imperial (lb, ft, oz)"} onPress={() => setSheet("units")} testID="row-units" />
          <Row icon="help-circle-outline" title="Support" onPress={() => Linking.openURL(LEGAL.support ? `mailto:${LEGAL.support}` : "mailto:support@nomnom.app")} />
          <Row icon="document-text-outline" title="Terms" onPress={() => (LEGAL.terms ? Linking.openURL(LEGAL.terms) : router.push("/legal?doc=terms" as any))} />
          <Row icon="lock-closed-outline" title="Privacy Policy" onPress={() => (LEGAL.privacy ? Linking.openURL(LEGAL.privacy) : router.push("/legal?doc=privacy" as any))} />
          <Row icon="log-out-outline" title="Log Out" onPress={signOut} testID="logout" />
          <Row icon="trash-outline" title="Delete account" danger onPress={() => setSheet("delete")} testID="row-delete" />
        </Card>
        <Text style={styles.version}>NomNom · {user?.email}</Text>
      </ScrollView>

      <Sheet visible={sheet === "personal"} onClose={() => setSheet(null)} title="Personal information">
        <Field label="Name" value={name} onChangeText={setName} testID="personal-name" />
        <Field label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" hint="Letters, numbers, underscores. Shown to friends instead of your email." testID="personal-username" />
        <Button title="Save" onPress={savePersonal} loading={busy} style={{ marginTop: spacing.sm }} testID="personal-save" />
      </Sheet>
      <Sheet visible={sheet === "notifications"} onClose={() => setSheet(null)} title="Notifications">
        {!remindersSupported && <Text style={styles.sub}>Reminders are delivered on your phone — they aren't available in the web preview.</Text>}
        {remindersSupported && <Text style={styles.sub}>Reminders are scheduled on this device at sensible times (breakfast 8:00, lunch 12:30, dinner 18:30, water every few hours, streak 20:30). Never guilt-based.</Text>}
        {(permState === "blocked" || permState === "denied") && (
          <View style={styles.permBox} testID="notif-perm-box">
            <Text style={styles.permText}>Notifications are turned off for NomNom. Enable them in Settings to receive Buddy's reminders.</Text>
            <Button title="Open Settings" size="sm" variant="secondary" onPress={openNotificationSettings} />
          </View>
        )}
        <Text style={styles.sub}>Choose what Buddy can remind you about. Delivery requires the store build with push enabled.</Text>
        {NOTIF.map(n => <Row key={n.key} title={n.label} subtitle={n.sub} right={<Switch value={!!user?.notifications?.[n.key]} onValueChange={v => toggle("notifications", n.key, v)} trackColor={{ true: colors.brandPrimary }} />} />)}
      </Sheet>
      <Sheet visible={sheet === "privacy"} onClose={() => setSheet(null)} title="Privacy">
        <Text style={styles.sub}>Your weight, calories and meal history are never shared. These control what friends will see when social features launch.</Text>
        {PRIV.map(n => <Row key={n.key} title={n.label} right={<Switch value={!!user?.privacy?.[n.key]} onValueChange={v => toggle("privacy", n.key, v)} trackColor={{ true: colors.brandPrimary }} />} />)}
      </Sheet>
      <Sheet visible={sheet === "units"} onClose={() => setSheet(null)} title="Units">
        <Row title="Imperial" subtitle="lb, ft/in, fl oz" onPress={() => { setUnits("imperial"); setSheet(null); }} right={units === "imperial" ? <Icon name="checkmark" color={colors.brandPrimary} /> : undefined} />
        <Row title="Metric" subtitle="kg, cm, L" onPress={() => { setUnits("metric"); setSheet(null); }} right={units === "metric" ? <Icon name="checkmark" color={colors.brandPrimary} /> : undefined} />
      </Sheet>
      <Sheet visible={sheet === "delete"} onClose={() => setSheet(null)} title="Delete account">
        <Text style={styles.sub}>This permanently deletes your account, food logs, weight history and Buddy. Active store subscriptions must be cancelled separately in your store account.</Text>
        <Field label='Type "DELETE" to confirm' value={deleteText} onChangeText={setDeleteText} autoCapitalize="characters" testID="delete-confirm-input" />
        <Button title="Delete my account" variant="danger" onPress={deleteAccount} loading={busy} disabled={deleteText.trim().toUpperCase() !== "DELETE"} style={{ marginTop: spacing.sm }} testID="delete-confirm" />
      </Sheet>
    </View>
  );
}

function Target({ label, v, c = colors.onSurface }: { label: string; v: string; c?: string }) {
  return <View style={{ alignItems: "center", minWidth: 56 }}><Text style={[styles.tv, { color: c }]}>{v}</Text><Text style={styles.tl}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  permBox: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, marginBottom: spacing.sm },
  permText: { fontSize: fontSize.sm, color: colors.onSurface, lineHeight: 20 },
  wrap: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxxl },
  hero: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.sm },
  name: { fontSize: fontSize.xl, fontWeight: "800", color: colors.onSurface },
  handle: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: "600" },
  big: { fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  targets: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: spacing.sm },
  tv: { fontSize: fontSize.md, fontWeight: "800" },
  tl: { fontSize: 10, color: colors.textSecondary, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
  link: { fontSize: fontSize.sm, fontWeight: "700", color: colors.brandPrimary },
  version: { textAlign: "center", fontSize: fontSize.xs, color: colors.muted, marginTop: spacing.md },
});
