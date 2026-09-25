import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { colors, fontSize, spacing } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { Button, Card, Field, ScreenHeader, Segmented, useToast } from "@/src/ui";
import { fmtWeight, weightToKg, weightValue } from "@/src/units";
import { track } from "@/src/analytics";

export default function WeightScreen() {
  const router = useRouter();
  const toast = useToast();
  const { user, refresh } = useAuth();
  const [units, setUnits] = useState<"imperial" | "metric">(user?.profile?.units ?? "imperial");
  const current = user?.profile?.weight_kg;
  const [value, setValue] = useState(current ? weightValue(current, units).toFixed(1) : "");
  const [busy, setBusy] = useState(false);

  async function save() {
    const v = parseFloat(value);
    if (!v) return toast.show("Enter your weight", { icon: "alert-circle" });
    setBusy(true);
    try {
      await api.logWeight(weightToKg(v, units));
      if (units !== user?.profile?.units) await api.updateMe({ profile: { units } });
      track("weight_logged"); await refresh(); toast.show("Weight logged"); router.back();
    } catch (e: any) { toast.show(e.message, { icon: "alert-circle" }); } finally { setBusy(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Log Weight" onBack={() => router.back()} close />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
        <Segmented options={[{ value: "imperial", label: "lb" }, { value: "metric", label: "kg" }]} value={units} onChange={u => { setUnits(u); if (value) setValue(weightValue(weightToKg(parseFloat(value), units), u).toFixed(1)); }} />
        <Card style={{ gap: spacing.sm }}>
          <Field label={`Weight (${units === "metric" ? "kg" : "lb"})`} value={value} onChangeText={setValue} keyboardType="decimal-pad" autoFocus testID="weight-input" style={{ fontSize: fontSize.xxl, fontWeight: "800", height: 64 }} />
          {current && <Text style={styles.sub}>Last recorded: {fmtWeight(current, units)}{user?.profile?.goal_weight_kg ? ` · Goal ${fmtWeight(user.profile.goal_weight_kg, units)}` : ""}</Text>}
        </Card>
        <Button title="Save" onPress={save} loading={busy} size="lg" testID="weight-save" />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({ sub: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: "600" } });
