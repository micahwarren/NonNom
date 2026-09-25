import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { useThemeStyles, ThemeColors, fontSize, radius, spacing } from "@/src/theme";
import { api, BuddyState, Cosmetic, Equipped } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { BuddyAvatar, DEFAULT_EQUIPPED } from "@/src/buddy";
import { Button, ErrorState, Icon, LoadingState, PremiumBadge, ScreenHeader, Segmented, Sheet, useToast } from "@/src/ui";
import { track } from "@/src/analytics";

const CATS: { key: keyof Equipped; label: string }[] = [
  { key: "shape", label: "Noms" },
  { key: "skin", label: "Skin" }, { key: "hat", label: "Hats" }, { key: "glasses", label: "Glasses" },
  { key: "accessory", label: "Accessories" }, { key: "outfit", label: "Outfits" }, { key: "shoes", label: "Shoes" }, { key: "background", label: "Backgrounds" },
];

export default function Customize() {
  const { colors, styles } = useThemeStyles(createStyles);
  const { width } = useWindowDimensions();
  const columns = width >= 600 ? 5 : 3;
  const tileWidth = (width - spacing.lg * 2 - spacing.sm * (columns - 1)) / columns;
  const router = useRouter();
  const toast = useToast();
  const { refresh, isPremium } = useAuth();
  const [items, setItems] = useState<Cosmetic[]>([]);
  const [equipped, setEquipped] = useState<Equipped>(DEFAULT_EQUIPPED);
  const [preview, setPreview] = useState<Equipped>(DEFAULT_EQUIPPED);
  const [cat, setCat] = useState<keyof Equipped>("shape");
  const [saving, setSaving] = useState(false);
  const [todayState, setTodayState] = useState<BuddyState>("neutral");
  const [expression, setExpression] = useState<"today" | "happy" | "sad">("today");
  const previewState = expression === "today" ? todayState : expression === "happy" ? "celebrating" : "tired";
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [locked, setLocked] = useState<Cosmetic | null>(null);

  async function load() {
    setErr(null);
    try { const r = await api.cosmetics(); setItems(r.items); setEquipped(r.equipped); setPreview(r.equipped); } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
    api.summaryToday().then(s => setTodayState(s.buddy.state)).catch(() => {});
  }
  useEffect(() => { load(); }, [isPremium]);

  async function select(c: Cosmetic) {
    if (saving) return;
    if (!c.available) { track("premium_cosmetic_selected", { id: c.id }); setLocked(c); return; }
    const next = { ...preview, [c.category]: c.id } as Equipped;
    setPreview(next);
    setSaving(true);
    try { const r = await api.equip(c.category, c.id); setEquipped(r.equipped); setPreview(r.equipped); track("cosmetic_equipped", { id: c.id }); await refresh(); }
    catch (e: any) { setPreview(equipped); toast.show(e.message, { icon: "alert-circle" }); }
    finally { setSaving(false); }
  }

  const list = items.filter(i => i.category === cat);
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Customize Buddy" onBack={() => router.back()} right={!isPremium ? <Pressable onPress={() => router.push("/paywall")} testID="customize-premium"><PremiumBadge small /></Pressable> : undefined} />
      <View style={styles.stage}>
        <BuddyAvatar state={previewState} equipped={preview} size={150} testID="buddy-preview" />
        <View style={styles.expressionPicker}>
          <Text style={styles.previewLabel} testID="expression-preview-label">PREVIEW EXPRESSIONS</Text>
          <Segmented value={expression} onChange={setExpression} options={[{ value: "today", label: "Today" }, { value: "happy", label: "Happy" }, { value: "sad", label: "Low energy" }]} />
        </View>
        <Text style={styles.saveStatus} testID="customization-save-status">{saving ? "Saving your look…" : "Your look saves automatically"}</Text>
      </View>
      <ScrollView horizontal style={styles.categoryScroll} testID="customization-categories" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {CATS.map(c => (
          <Pressable key={c.key} onPress={() => setCat(c.key)} testID={`cat-${c.key}`} style={[styles.tab, cat === c.key && styles.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: cat === c.key }}>
            <Text style={[styles.tabText, cat === c.key && { color: colors.onBrandPrimary }]}>{c.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {loading ? <LoadingState rows={2} /> : err ? <ErrorState message={err} onRetry={load} /> : (
        <ScrollView testID="cosmetics-grid" contentContainerStyle={styles.grid}>
          {list.map(c => {
            const on = preview[cat] === c.id;
            return (
              <Pressable key={c.id} testID={`cosmetic-${c.id}`} disabled={saving} onPress={() => select(c)} accessibilityRole="radio" accessibilityState={{ checked: on, selected: on, disabled: saving }} accessibilityLabel={`${c.name}${on ? ", selected" : ""}${c.available ? "" : c.unlock_type === "achievement" ? ", achievement locked" : ", premium"}`}
                style={({ pressed }) => [styles.tile, { width: tileWidth }, on && styles.tileOn, pressed && { opacity: 0.85 }]}>
                <View style={{ opacity: c.available ? 1 : 0.55 }}>
                  <BuddyAvatar state={previewState} equipped={{ ...DEFAULT_EQUIPPED, shape: preview.shape, skin: preview.skin, [cat]: c.id }} size={74} animate={false} showBackground={cat === "background"} />
                </View>
                <Text style={styles.tileName} numberOfLines={2}>{c.name}</Text>
                {on && <View testID={`cosmetic-${c.id}-selected`} style={styles.selectedMark}><Icon name="checkmark-circle" size={16} color={colors.brandPrimary} /></View>}
                {!c.available && <View style={styles.lock}><Icon name="lock-closed" size={11} color={colors.onSurfaceInverse} /></View>}
                {c.unlock_type === "premium" && <View style={styles.badge}><Icon name="sparkles" size={9} color={colors.premium} /></View>}
                {c.unlock_type === "achievement" && !c.available && <Text style={styles.earn}>Earn it</Text>}
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <Sheet visible={!!locked} onClose={() => setLocked(null)}>
        <View style={{ alignItems: "center", gap: spacing.sm }}>
          {locked && <BuddyAvatar state="celebrating" equipped={{ ...preview, [locked.category]: locked.id }} size={140} />}
          <Text style={styles.lockTitle}>{locked?.unlock_type === "achievement" ? `Unlock ${locked?.name} with an achievement` : "Unlock Buddy Style"}</Text>
          {locked?.unlock_type === "achievement" ? (
            <>
              <Text style={styles.lockSub}>This item is a reward. Keep your streak going and check Achievements to see how to earn it.</Text>
              <Button title="View achievements" onPress={() => { setLocked(null); router.push("/achievements"); }} style={{ alignSelf: "stretch" }} />
            </>
          ) : (
            <>
              <Text style={styles.lockSub}>Upgrade to NomNom Premium to unlock:</Text>
              {["All Buddy outfits", "Premium accessories", "Exclusive skins", "Seasonal items", "AI coaching features"].map(b => <View key={b} style={styles.benefit}><Icon name="checkmark" size={16} color={colors.success} /><Text style={styles.benefitText}>{b}</Text></View>)}
              <Button title="Try Premium" onPress={() => { setLocked(null); router.push("/paywall"); }} style={{ alignSelf: "stretch", marginTop: spacing.sm }} testID="locked-try-premium" />
            </>
          )}
          <Button title="Not now" variant="ghost" onPress={() => setLocked(null)} />
        </View>
      </Sheet>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  stage: { alignItems: "center", paddingBottom: spacing.md, gap: spacing.sm },
  expressionPicker: { width: "85%", maxWidth: 360, gap: spacing.sm },
  previewLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.2, color: colors.textSecondary, textAlign: "center" },
  saveStatus: { color: colors.textSecondary, fontSize: fontSize.xs },
  categoryScroll: { flexGrow: 0, flexShrink: 0 },
  selectedMark: { position: "absolute", bottom: 5, right: 5 },
  tabs: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.md },
  tab: { paddingHorizontal: spacing.lg, height: 44, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, justifyContent: "center" },
  tabOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  tabText: { fontWeight: "700", color: colors.onSurface, fontSize: fontSize.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  tile: { aspectRatio: 0.85, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center", gap: 4, padding: spacing.xs },
  tileOn: { borderColor: colors.brandPrimary, backgroundColor: colors.surfaceTertiary },
  tileName: { fontSize: fontSize.xs, fontWeight: "700", color: colors.onSurface, textAlign: "center", paddingHorizontal: 4 },
  lock: { position: "absolute", top: 6, right: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.surfaceInverse, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: 6, left: 6, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.premium + "22", alignItems: "center", justifyContent: "center" },
  earn: { fontSize: 9, fontWeight: "800", color: colors.textSecondary, textTransform: "uppercase" },
  lockTitle: { fontSize: fontSize.xl, fontWeight: "800", color: colors.onSurface, textAlign: "center" },
  lockSub: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: "center", lineHeight: 20 },
  benefit: { flexDirection: "row", alignItems: "center", gap: spacing.sm, alignSelf: "stretch" },
  benefitText: { fontSize: fontSize.sm, fontWeight: "600", color: colors.onSurface },
});
