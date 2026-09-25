import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useThemeStyles, ThemeColors, fontSize, spacing } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { Button, Card, Field, ScreenHeader, useToast } from "@/src/ui";

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
  const [busy, setBusy] = useState(false);
  const macroCal = (parseInt(p) || 0) * 4 + (parseInt(c) || 0) * 4 + (parseInt(f) || 0) * 9;

  async function save() {
    setBusy(true);
    try {
      setUser(await api.updateMe({ targets: { calories: parseInt(cal), protein_g: parseInt(p), carbs_g: parseInt(c), fat_g: parseInt(f), water_ml: parseInt(w) } }));
      toast.show("Targets updated"); router.back();
    } catch (e: any) { toast.show(e.message, { icon: "alert-circle" }); } finally { setBusy(false); }
  }
  async function recalc() {
    setBusy(true);
    try { const r = await api.previewTargets(user?.profile ?? {}); setCal(String(r.calories)); setP(String(r.protein_g)); setC(String(r.carbs_g)); setF(String(r.fat_g)); setW(String(r.water_ml)); }
    catch (e: any) { toast.show(e.message, { icon: "alert-circle" }); } finally { setBusy(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Daily Targets" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: spacing.md }}>
          <Field label="Calories (kcal)" value={cal} onChangeText={setCal} keyboardType="number-pad" testID="target-calories" />
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 1 }}><Field label="Protein (g)" value={p} onChangeText={setP} keyboardType="number-pad" testID="target-protein" /></View>
            <View style={{ flex: 1 }}><Field label="Carbs (g)" value={c} onChangeText={setC} keyboardType="number-pad" /></View>
            <View style={{ flex: 1 }}><Field label="Fat (g)" value={f} onChangeText={setF} keyboardType="number-pad" /></View>
          </View>
          <Text style={styles.hint}>Macros add up to {macroCal} kcal{Math.abs(macroCal - (parseInt(cal) || 0)) > 150 ? " — that's a fair bit off your calorie target." : "."}</Text>
          <Field label="Water (ml)" value={w} onChangeText={setW} keyboardType="number-pad" testID="target-water" />
        </Card>
        <Text style={styles.hint}>Targets are estimates based on your profile. Adjust them to what works for you.</Text>
        <Button title="Save targets" onPress={save} loading={busy} size="lg" testID="targets-save" />
        <Button title="Recalculate from my profile" variant="ghost" onPress={recalc} disabled={busy} />
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({ hint: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 } });
