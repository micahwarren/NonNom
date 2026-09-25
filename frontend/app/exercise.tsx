import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { colors, fontSize, spacing } from "@/src/theme";
import { api } from "@/src/api";
import { Button, Card, Chip, Field, ScreenHeader, useToast } from "@/src/ui";
import { track } from "@/src/analytics";

const PRESETS = ["Walking", "Running", "Cycling", "Strength", "Yoga", "Swimming", "HIIT", "Other"];

export default function ExerciseScreen() {
  const router = useRouter();
  const toast = useToast();
  const [activity, setActivity] = useState("Walking");
  const [duration, setDuration] = useState("30");
  const [calories, setCalories] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    const d = parseInt(duration, 10), c = parseInt(calories || "0", 10);
    if (!activity.trim() || !d) return toast.show("Add an activity and duration", { icon: "alert-circle" });
    setBusy(true);
    try { await api.logExercise(activity.trim(), d, c); track("exercise_logged"); toast.show("Exercise logged"); router.back(); }
    catch (e: any) { toast.show(e.message, { icon: "alert-circle" }); } finally { setBusy(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Log Exercise" onBack={() => router.back()} close />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {PRESETS.map(p => <Chip key={p} label={p} selected={activity === p} onPress={() => setActivity(p)} testID={`activity-${p}`} />)}
        </View>
        <Card style={{ gap: spacing.md }}>
          <Field label="Activity" value={activity} onChangeText={setActivity} testID="exercise-activity" />
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 1 }}><Field label="Duration (min)" value={duration} onChangeText={setDuration} keyboardType="number-pad" testID="exercise-duration" /></View>
            <View style={{ flex: 1 }}><Field label="Calories burned" value={calories} onChangeText={setCalories} keyboardType="number-pad" placeholder="optional" testID="exercise-calories" /></View>
          </View>
          <Text style={styles.sub}>Calories burned are added back to your daily budget.</Text>
        </Card>
        <Button title="Save" onPress={save} loading={busy} size="lg" testID="exercise-save" />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({ sub: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: "600" } });
