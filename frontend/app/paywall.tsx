import React, { useEffect, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { PurchasesPackage } from "react-native-purchases";
import { useThemeStyles, ThemeColors, fontSize, radius, spacing } from "@/src/theme";
import { useAuth } from "@/src/auth-context";
import { rcSimulated, useSubscription } from "@/src/revenuecat";
import { BuddyAvatar } from "@/src/buddy";
import { Button, Card, Icon, ScreenHeader, Sheet, Skeleton, useToast } from "@/src/ui";
import { track } from "@/src/analytics";

const BENEFITS = [
  "Unlimited AI meal scans and Describe Meal", "Full Buddy customization", "Premium outfits, skins and accessories",
  "Advanced progress insights", "Buddy's full weekly report", "Unlimited AI meal suggestions and saved meals", "Future premium features",
];
const LEGAL = { terms: process.env.EXPO_PUBLIC_TERMS_URL, privacy: process.env.EXPO_PUBLIC_PRIVACY_URL };
const TARGET_USD_PRICING = { monthly: 7.99, annual: 49.99 } as const;

function monthlyEquivalent(pkg: PurchasesPackage) {
  const monthly = pkg.product.price / 12;
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: pkg.product.currencyCode, maximumFractionDigits: 2 }).format(monthly); }
  catch { return `$${monthly.toFixed(2)}`; }
}

export default function Paywall() {
  const { colors, styles } = useThemeStyles(createStyles);
  const router = useRouter();
  const toast = useToast();
  const { user, purchaseIdentityError, syncPremium, isPremium } = useAuth();
  const { offerings, offeringsError, identityReady, isLoading, purchase, restore, isPurchasing, isRestoring } = useSubscription();
  const [selected, setSelected] = useState<"annual" | "monthly">("annual");
  const [confirm, setConfirm] = useState<PurchasesPackage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoreResult, setRestoreResult] = useState<"none" | "found" | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [purchaseComplete, setPurchaseComplete] = useState(false);

  useEffect(() => { track("paywall_viewed"); }, []);

  const pkgs = offerings?.current?.availablePackages ?? [];
  const annual = pkgs.find(p => p.identifier === "$rc_annual" || p.packageType === "ANNUAL");
  const monthly = pkgs.find(p => p.identifier === "$rc_monthly" || p.packageType === "MONTHLY");
  const chosen = selected === "annual" ? annual : monthly;
  const savings = annual && monthly && monthly.product.price > 0 ? Math.round((1 - annual.product.price / (monthly.product.price * 12)) * 100) : null;
  const pricingMatchesTarget = !monthly || !annual || monthly.product.currencyCode !== "USD" || (
    Math.abs(monthly.product.price - TARGET_USD_PRICING.monthly) < 0.01 && Math.abs(annual.product.price - TARGET_USD_PRICING.annual) < 0.01
  );

  async function buy(pkg: PurchasesPackage) {
    if (!user) { setError("Sign in before purchasing Premium."); return; }
    setConfirm(null); setError(null); setSyncing(true);
    try {
      await syncPremium();
      const info = await purchase(pkg);
      if (!info.entitlements.active.pro) throw new Error("Purchase completed without an active Premium entitlement. Please restore purchases or contact support.");
      await syncPremium({ userId: user.id, info });
      track("subscription_started", { package: pkg.identifier });
      setPurchaseComplete(true);
      toast.show("Welcome to NomNom Premium", { icon: "sparkles" });
    } catch (e: any) {
      if (e?.userCancelled) return;
      if (String(e?.message).includes("identity_not_ready")) setError("We couldn't link this purchase to your account yet. Please sign out and back in, then try again.");
      else setError("We couldn't complete your purchase. " + (e?.message ?? "Please try again."));
    } finally { setSyncing(false); }
  }
  async function doRestore() {
    if (!user) { setError("Sign in before restoring Premium."); return; }
    setError(null); setRestoreResult(null); setSyncing(true);
    try {
      await syncPremium();
      const info = await restore();
      await syncPremium({ userId: user.id, info });
      const active = info.entitlements.active["pro"] !== undefined;
      setRestoreResult(active ? "found" : "none");
      if (active) { setPurchaseComplete(true); track("subscription_restored"); toast.show("Premium restored", { icon: "sparkles" }); }
    } catch (e: any) { setError("Restore failed. " + (e?.message ?? "Please try again.")); }
    finally { setSyncing(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="" onBack={() => router.back()} close />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}>
        <View style={{ alignItems: "center", gap: spacing.sm }}>
          <BuddyAvatar state="celebrating" equipped={{ ...(user?.buddy?.equipped ?? {}), hat: "hat_crown", background: "bg_confetti" }} size={140} />
          <Text style={styles.title}>Meet NomNom Premium</Text>
          <Text style={styles.sub}>Get more from your Buddy and your nutrition goals.</Text>
        </View>

        {isPremium ? (
          <Card style={{ alignItems: "center", gap: spacing.sm }} testID="already-premium">
            <Icon name="checkmark-circle" size={32} color={colors.success} />
            <Text style={styles.planTitle} testID={purchaseComplete ? "purchase-success" : "premium-active-title"}>{purchaseComplete ? "Premium is active!" : "You’re on Premium"}</Text>
            <Text style={styles.sub} testID="premium-unlimited-benefits">Unlimited AI scans, meal descriptions, suggestions, and saved meals. Your access is ready.</Text>
            {purchaseComplete && <Button title="Continue" onPress={() => router.back()} testID="premium-success-continue" />}
            {Platform.OS !== "web" && <Button title="Manage Subscription" variant="secondary" testID="manage-store-subscription" onPress={() => Linking.openURL(getManageUrl()).catch(() => toast.show("Couldn’t open your store subscriptions", { icon: "alert-circle" }))} />}
          </Card>
        ) : (
          <>
            <Card style={{ gap: spacing.sm }}>
              {BENEFITS.map(b => <View key={b} style={styles.benefit}><Icon name="checkmark-circle" size={18} color={colors.success} /><Text style={styles.benefitText}>{b}</Text></View>)}
            </Card>

            {isLoading ? <View style={{ gap: spacing.sm }}><Skeleton height={84} radius={radius.lg} /><Skeleton height={84} radius={radius.lg} /></View>
              : !pkgs.length ? (
                <Card style={{ alignItems: "center", gap: spacing.xs }} testID="offerings-unavailable">
                  <Icon name="cloud-offline-outline" size={26} color={colors.muted} />
                  <Text style={styles.sub}>Subscription options are unavailable right now. Please try again later.</Text>
                  {offeringsError && <Text style={styles.err}>{offeringsError.message}</Text>}
                </Card>
              ) : (
                <View style={{ gap: spacing.sm }}>
                  {annual && <PlanRow pkg={annual} label="Yearly" selected={selected === "annual"} onPress={() => setSelected("annual")} badge={savings && savings > 0 ? `Best value · Save ${savings}%` : "Best value"} sub={`${annual.product.priceString}/year · ${monthlyEquivalent(annual)}/month`} testID="plan-annual" />}
                  {monthly && <PlanRow pkg={monthly} label="Monthly" selected={selected === "monthly"} onPress={() => setSelected("monthly")} sub={`${monthly.product.priceString}/month`} testID="plan-monthly" />}
                </View>
              )}

            {purchaseIdentityError && <View style={styles.banner}><Icon name="alert-circle" size={16} color={colors.error} /><Text style={styles.bannerText}>Purchases are temporarily unavailable: account link failed. Sign out and back in to retry.</Text></View>}
            {rcSimulated && pkgs.length > 0 && <Text style={styles.simulated}>Preview mode: purchases here are simulated through RevenueCat’s Test Store. Real billing happens in the App Store / Play Store build.</Text>}
            {rcSimulated && !pricingMatchesTarget && <View style={styles.banner} testID="pricing-config-warning"><Icon name="alert-circle" size={16} color={colors.error} /><Text style={styles.bannerText}>Update the RevenueCat Test Store products to $7.99/month and $49.99/year so preview pricing matches launch pricing.</Text></View>}
            {error && <Text style={styles.err} testID="purchase-error">{error}</Text>}

            <Button title="Start Premium" size="lg" onPress={() => chosen && setConfirm(chosen)} disabled={!chosen || !identityReady || isPurchasing || syncing} loading={isPurchasing || syncing} testID="start-premium" />
            <Text style={styles.fine}>Auto-renews until cancelled. Cancel any time in your store account settings. Prices shown in your local currency by the store.</Text>
          </>
        )}

        <Button title={isRestoring || syncing ? "Connecting to store…" : "Restore Purchases"} variant="ghost" onPress={doRestore} loading={isRestoring || syncing} testID="restore-purchases" />
        {restoreResult === "none" && <Text style={styles.sub} testID="restore-none">No previous purchases found for this account.</Text>}
        {restoreResult === "found" && <Text style={[styles.sub, { color: colors.success }]} testID="restore-found">Premium restored.</Text>}
        <View style={styles.legal}>
          <Pressable onPress={() => LEGAL.terms ? Linking.openURL(LEGAL.terms) : router.push("/legal?doc=terms" as any)}><Text style={styles.legalText}>Terms</Text></Pressable>
          <Text style={styles.legalText}>·</Text>
          <Pressable onPress={() => LEGAL.privacy ? Linking.openURL(LEGAL.privacy) : router.push("/legal?doc=privacy" as any)}><Text style={styles.legalText}>Privacy Policy</Text></Pressable>
        </View>
      </ScrollView>

      <Sheet visible={!!confirm} onClose={() => setConfirm(null)} title="Confirm purchase">
        <Text style={styles.confirmText}>{confirm?.product.title || "NomNom Premium"} — {confirm?.product.priceString}{confirm?.packageType === "ANNUAL" ? "/year" : "/month"}</Text>
        {rcSimulated && <Text style={styles.simulated}>This is a simulated Test Store purchase.</Text>}
        <Button title="Confirm" onPress={() => confirm && buy(confirm)} style={{ marginTop: spacing.sm }} testID="confirm-purchase" />
        <Button title="Cancel" variant="ghost" onPress={() => setConfirm(null)} />
      </Sheet>
    </View>
  );
}

function PlanRow({ pkg, label, selected, onPress, badge, sub, testID }: { pkg: PurchasesPackage; label: string; selected: boolean; onPress: () => void; badge?: string; sub: string; testID?: string }) {
  const { colors, styles } = useThemeStyles(createStyles);
  return (
    <Pressable onPress={onPress} testID={testID} accessibilityRole="radio" accessibilityState={{ selected }} style={[styles.plan, selected && styles.planOn]}>
      <View style={[styles.radio, selected && { borderColor: colors.brandPrimary }]}>{selected && <View style={styles.radioDot} />}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.planTitle}>{label}</Text>
        <Text style={styles.sub}>{sub}</Text>
      </View>
      {badge && <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View>}
    </Pressable>
  );
}

function getManageUrl() {
  return Platform.OS === "ios" ? "https://apps.apple.com/account/subscriptions" : "https://play.google.com/store/account/subscriptions";
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.onSurface, textAlign: "center", letterSpacing: -0.5 },
  sub: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: "center", lineHeight: 20 },
  benefit: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  benefitText: { fontSize: fontSize.sm, fontWeight: "600", color: colors.onSurface, flex: 1 },
  plan: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.border, minHeight: 76 },
  planOn: { borderColor: colors.brandPrimary, backgroundColor: colors.surfaceTertiary },
  planTitle: { fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.brandPrimary },
  badge: { backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  badgeText: { color: colors.onBrandPrimary, fontSize: fontSize.xs, fontWeight: "800" },
  banner: { flexDirection: "row", gap: spacing.sm, alignItems: "center", backgroundColor: colors.error + "14", padding: spacing.md, borderRadius: radius.md },
  bannerText: { flex: 1, fontSize: fontSize.xs, color: colors.error, fontWeight: "700" },
  simulated: { fontSize: fontSize.xs, color: colors.textSecondary, textAlign: "center", fontStyle: "italic" },
  err: { fontSize: fontSize.sm, color: colors.error, textAlign: "center", fontWeight: "700" },
  fine: { fontSize: fontSize.xs, color: colors.muted, textAlign: "center", lineHeight: 18 },
  legal: { flexDirection: "row", justifyContent: "center", gap: spacing.sm },
  legalText: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: "700" },
  confirmText: { fontSize: fontSize.md, fontWeight: "700", color: colors.onSurface, textAlign: "center" },
});
