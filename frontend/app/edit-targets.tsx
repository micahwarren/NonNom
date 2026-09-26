import React, { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useThemeStyles, ThemeColors, fontSize, spacing } from "@/src/theme";
import { api, TargetPreview } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { Button, Card, Field, Icon, ScreenHeader, Sheet, useToast } from "@/src/ui";

const integerInRange = (value: string, min: number, max: number) => /^\d+$/.test(value) && Number(value) >= min && Number(value) <= max;

export default function EditTargets() {
  const { colors, styles } = useThemeStyles(createStyles);
  const router = useRouter();
  const toast = useToast();
  const { user, setUser } = useAuth();
  const t = user?.targets;
  const [cal, setCal] = useState(String(t?.calories ?? 2000));
  const [p, setP] = useState(String(t?.protein_g ?? 150));
  const [c, setC] = useState(String(t?.carbs_g ?? 225));
  const [f, setF] = useState(String(t?.fat_g ?? 65));
  const [w, setW] = useState(String(t?.water_ml ?? 2500));
  const [automatic, setAutomatic] = useState(user?.macro_mode !== "manual");
  const [preview, setPreview] = useState<TargetPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const profileKey = JSON.stringify(user?.profile ?? {});
  const validCal = integerInRange(cal, 1000, 6000);
  const validWater = integerInRange(w, 500, 6000);
  const validManual = integerInRange(p, 20, 400) && integerInRange(c, 0, 1000) && integerInRange(f, 10, 300);
  const previewReady = preview?.calories === Number(cal) && !calculating && !previewError;
  const canSave = validCal && validWater && (automatic ? previewReady : validManual);
  const macroCal = (Number(p) || 0) * 4 + (Number(c) || 0) * 4 + (Number(f) || 0) * 9;

  useEffect(() => {
    let ignore = false;
    setPreview(null); setPreviewError(null);
    if (!automatic || !validCal) { setCalculating(false); return; }
    setCalculating(true);
    const timer = setTimeout(() => {
      api.previewTargets({}, Number(cal)).then(result => {
        if (ignore) return;
        setPreview(result); setP(String(result.protein_g)); setC(String(result.carbs_g)); setF(String(result.fat_g));
      }).catch(error => { if (!ignore) setPreviewError(error.message); })
        .finally(() => { if (!ignore) setCalculating(false); });
    }, 300);
    return () => { ignore = true; clearTimeout(timer); };
  }, [cal, automatic, validCal, profileKey, retry]);

  async function save() {
    if (!canSave || busy) return;
    setBusy(true);
    try {
      const targets = { calories: Number(cal), water_ml: Number(w), ...(!automatic ? { protein_g: Number(p), carbs_g: Number(c), fat_g: Number(f) } : {}) };
      setUser(await api.updateMe({ targets, auto_macros: automatic }));
      toast.show(automatic ? "Calories and recommended macros updated" : "Targets updated");
      router.back();
    } catch (error: any) { toast.show(error.message, { icon: "alert-circle" }); }
    finally { setBusy(false); }
  }

  async function recalc() {
    setBusy(true);
    try {
      const result = await api.previewTargets({});
      setCal(String(result.calories)); setW(String(result.water_ml)); setAutomatic(true); setRetry(value => value + 1);
    } catch (error: any) { toast.show(error.message, { icon: "alert-circle" }); }
    finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Daily Targets" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID="targets-scroll">
        <Card style={{ gap: spacing.md }}>
          <Field label="Calories (kcal)" value={cal} onChangeText={setCal} keyboardType="number-pad" editable={!busy} testID="target-calories" />
          {!validCal && <Text style={styles.error} testID="target-calorie-error">Enter a whole number from 1,000 to 6,000 kcal.</Text>}
          <View style={styles.modeRow}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.label} testID="macro-mode-label">Auto-adjust macros</Text>
              <Text style={styles.hint} testID="macro-mode-description">{automatic ? "Protein, carbs, and fat adjust with calories" : "Manual targets — edit each macro yourself"}</Text>
            </View>
            <Switch testID="auto-macros-toggle" accessibilityLabel="Auto-adjust macros" value={automatic} onValueChange={setAutomatic} disabled={busy} trackColor={{ false: colors.borderStrong, true: colors.brandPrimary }} />
          </View>
          <View style={styles.macroRow}>
            <View style={styles.macroField}><Field label="Protein (g)" value={p} onChangeText={setP} keyboardType="number-pad" editable={!automatic && !busy} testID="target-protein" /></View>
            <View style={styles.macroField}><Field label="Carbs (g)" value={c} onChangeText={setC} keyboardType="number-pad" editable={!automatic && !busy} testID="target-carbs" /></View>
            <View style={styles.macroField}><Field label="Fat (g)" value={f} onChangeText={setF} keyboardType="number-pad" editable={!automatic && !busy} testID="target-fat" /></View>
          </View>
          {calculating ? <View style={styles.loadingRow} testID="macros-calculating"><ActivityIndicator color={colors.brandPrimary} size="small" /><Text style={styles.hint}>Recalculating your macros…</Text></View> : <Text style={styles.hint} testID="target-macro-calories">Macros add up to {macroCal} kcal{Math.abs(macroCal - Number(cal)) > 150 ? " — check the difference from your calorie target." : "."}</Text>}
          {!automatic && !validManual && <Text style={styles.error} testID="manual-macro-error">Use whole grams: protein 20–400, carbs 0–1,000, fat 10–300.</Text>}
          {previewError && <View style={{ gap: spacing.sm }}><Text style={styles.error} testID="macro-preview-error">{previewError}</Text><Button title="Retry calculation" variant="secondary" onPress={() => setRetry(value => value + 1)} testID="retry-macro-preview" /></View>}
          <Field label="Water (mL)" value={w} onChangeText={setW} keyboardType="number-pad" editable={!busy} testID="target-water" />
          {!validWater && <Text style={styles.error} testID="target-water-error">Enter 500–6,000 mL.</Text>}
        </Card>
        {automatic && preview && <Card style={{ gap: spacing.sm }} testID="macro-evidence-card">
          <View style={styles.loadingRow}><Icon name="flask-outline" color={colors.protein} /><Text style={styles.label}>Evidence-informed, not guessed</Text></View>
          <Text style={styles.hint} testID="macro-reference-weight">Planning weight: {preview.reference_weight_kg} kg. Your goal and activity set a protein baseline of {preview.baseline_protein_g} g at {preview.baseline_calories} kcal.</Text>
          <Text style={styles.hint} testID="protein-scaling-explanation">Protein starts from {preview.protein_energy_percent}% of your calorie budget, so it changes when calories change. Whole-gram rounding and nutrition safeguards still apply.</Text>
          <Button title="How this is calculated · sources" variant="ghost" onPress={() => setMethodOpen(true)} testID="macro-method-button" />
        </Card>}
        {automatic && preview?.warnings?.map((warning, index) => <Text key={warning} style={styles.warning} testID={`macro-warning-${index}`}>{warning}</Text>)}
        <Text style={styles.hint}>General adult planning estimates, not medical advice. A clinician can tailor targets for your health, pregnancy, or training needs.</Text>
        <Button title="Save targets" onPress={save} loading={busy} disabled={!canSave} size="lg" testID="targets-save" />
        <Button title="Recalculate calories from my profile" variant="ghost" onPress={recalc} disabled={busy} testID="targets-recalculate" />
      </ScrollView>
      <Sheet visible={methodOpen} onClose={() => setMethodOpen(false)} title="The calculation & evidence" testID="macro-method-sheet" footer={<Button title="Got it" onPress={() => setMethodOpen(false)} testID="macro-method-close" />}>
        {preview?.rationale?.map((line, index) => <Text key={line} style={styles.methodText} testID={`macro-method-step-${index}`}>{line}</Text>)}
        <Text style={styles.label}>Research and reference values</Text>
        {preview?.sources?.map(source => <Pressable key={source.id} accessibilityRole="link" style={({ pressed }) => [styles.sourceLink, pressed && { opacity: 0.6 }]} onPress={() => Linking.openURL(source.url).catch(() => toast.show("Couldn’t open this reference", { icon: "alert-circle" }))} testID={`macro-source-${source.id}`}><Text style={styles.sourceText}>{source.title}</Text><Icon name="open-outline" size={17} color={colors.brandPrimary} /></Pressable>)}
      </Sheet>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  modeRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  macroRow: { flexDirection: "row", gap: spacing.sm },
  macroField: { flex: 1 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  hint: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  label: { fontSize: fontSize.md, fontWeight: "700", color: colors.onSurface },
  error: { fontSize: fontSize.sm, color: colors.error, lineHeight: 20 },
  warning: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 21, borderLeftWidth: 3, borderColor: colors.carbs, paddingLeft: spacing.md },
  methodText: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 22, marginBottom: spacing.md },
  sourceLink: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md },
  sourceText: { flex: 1, fontSize: fontSize.sm, fontWeight: "700", lineHeight: 21, color: colors.brandPrimary },
});