import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform, Modal, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { colors, spacing, radius } from "@/src/theme";
import { api, FoodLog } from "@/src/api";

export default function LogScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | "food" | "exercise">(null);

  const load = useCallback(async () => {
    try { setLogs(await api.foodToday()); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { setLoading(true); load().finally(() => setLoading(false)); }, [load]));

  async function del(id: string) {
    await api.deleteFood(id).catch(() => {});
    await load();
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.title}>Today's log</Text>
        <Text style={styles.subtitle}>{logs.length} meals</Text>
      </View>

      <ScrollView testID="log-scroll" contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        <View style={styles.actions}>
          <Pressable testID="scan-btn" style={styles.actionCard} onPress={() => router.push("/scan")}>
            <Text style={styles.actionEmoji}>📸</Text>
            <Text style={styles.actionText}>AI Scan</Text>
          </Pressable>
          <Pressable testID="manual-btn" style={styles.actionCard} onPress={() => setModal("food")}>
            <Text style={styles.actionEmoji}>✍️</Text>
            <Text style={styles.actionText}>Manual</Text>
          </Pressable>
          <Pressable testID="exercise-btn" style={styles.actionCard} onPress={() => setModal("exercise")}>
            <Text style={styles.actionEmoji}>🏃</Text>
            <Text style={styles.actionText}>Exercise</Text>
          </Pressable>
        </View>

        {loading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} /> : (
          logs.length === 0 ? (
            <View style={styles.empty} testID="log-empty">
              <Text style={styles.emptyEmoji}>🍽️</Text>
              <Text style={styles.emptyTitle}>Your plate is empty</Text>
              <Text style={styles.emptySub}>Log your first meal to feed your buddy</Text>
            </View>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {logs.map(l => (
                <View key={l.id} style={styles.logCard} testID={`food-log-${l.id}`}>
                  <View style={styles.logIconWrap}>
                    <Text style={{ fontSize: 28 }}>{l.source === "photo" ? "📸" : "🍽️"}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.logName}>{l.name}</Text>
                    <Text style={styles.logMacros}>
                      P {l.protein_g.toFixed(0)}  ·  C {l.carbs_g.toFixed(0)}  ·  F {l.fat_g.toFixed(0)}
                    </Text>
                    <View style={styles.healthBar}>
                      <View style={[styles.healthBarFill, { width: `${l.health_score * 10}%`, backgroundColor: healthColor(l.health_score) }]} />
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.logCal}>{l.calories}</Text>
                    <Text style={styles.logCalUnit}>kcal</Text>
                    <Pressable testID={`delete-${l.id}`} onPress={() => del(l.id)}>
                      <Text style={styles.del}>✕</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )
        )}
      </ScrollView>

      <FoodModal visible={modal === "food"} onClose={() => setModal(null)} onSaved={load} />
      <ExerciseModal visible={modal === "exercise"} onClose={() => setModal(null)} onSaved={load} />
    </View>
  );
}

function healthColor(s: number) {
  if (s >= 7) return colors.success;
  if (s >= 4) return colors.warning;
  return colors.error;
}

function FoodModal({ visible, onClose, onSaved }: any) {
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [health, setHealth] = useState(5);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name || !calories) return Alert.alert("Missing", "Enter name and calories");
    setBusy(true);
    try {
      await api.logFoodManual({
        name, calories: Number(calories),
        protein_g: Number(protein) || 0, carbs_g: Number(carbs) || 0, fat_g: Number(fat) || 0,
        health_score: health,
      });
      setName(""); setCalories(""); setProtein(""); setCarbs(""); setFat(""); setHealth(5);
      onSaved(); onClose();
    } catch (e: any) { Alert.alert("Error", e.message ?? "Failed"); }
    finally { setBusy(false); }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: "flex-end" }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <Text style={styles.sheetTitle}>Log a meal</Text>
          <ScrollView contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }} keyboardShouldPersistTaps="handled">
            <Field label="Food name" value={name} onChange={setName} testID="manual-name" />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1 }}><Field label="Calories" value={calories} onChange={setCalories} kb="numeric" testID="manual-cal" /></View>
              <View style={{ flex: 1 }}><Field label="Protein (g)" value={protein} onChange={setProtein} kb="numeric" testID="manual-protein" /></View>
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1 }}><Field label="Carbs (g)" value={carbs} onChange={setCarbs} kb="numeric" testID="manual-carbs" /></View>
              <View style={{ flex: 1 }}><Field label="Fat (g)" value={fat} onChange={setFat} kb="numeric" testID="manual-fat" /></View>
            </View>
            <Text style={styles.label}>How healthy? {health}/10</Text>
            <View style={styles.healthPicker}>
              {[0,1,2,3,4,5,6,7,8,9,10].map(v => (
                <Pressable key={v} testID={`health-${v}`} onPress={() => setHealth(v)} style={[styles.healthDot, { backgroundColor: health === v ? colors.brandPrimary : colors.surfaceTertiary }]}>
                  <Text style={{ color: health === v ? colors.onBrandPrimary : colors.onSurfaceTertiary, fontWeight: "800" }}>{v}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable testID="manual-save" style={styles.saveBtn} onPress={submit} disabled={busy}>
              {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.saveText}>Save meal</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ExerciseModal({ visible, onClose, onSaved }: any) {
  const [activity, setActivity] = useState("");
  const [duration, setDuration] = useState("");
  const [burned, setBurned] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!activity || !duration || !burned) return Alert.alert("Missing", "Fill all fields");
    setBusy(true);
    try {
      await api.logExercise(activity, Number(duration), Number(burned));
      setActivity(""); setDuration(""); setBurned("");
      onSaved(); onClose();
    } catch (e: any) { Alert.alert("Error", e.message ?? "Failed"); }
    finally { setBusy(false); }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: "flex-end" }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <Text style={styles.sheetTitle}>Log exercise</Text>
          <View style={{ gap: spacing.md }}>
            <Field label="Activity" value={activity} onChange={setActivity} testID="ex-activity" />
            <Field label="Duration (min)" value={duration} onChange={setDuration} kb="numeric" testID="ex-duration" />
            <Field label="Calories burned" value={burned} onChange={setBurned} kb="numeric" testID="ex-burned" />
            <Pressable testID="ex-save" style={styles.saveBtn} onPress={submit} disabled={busy}>
              {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.saveText}>Save exercise</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({ label, value, onChange, kb, testID }: any) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput testID={testID} value={value} onChangeText={onChange} keyboardType={kb ?? "default"} style={styles.input} placeholderTextColor={colors.muted} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surface },
  title: { fontSize: 28, fontWeight: "800", color: colors.onSurface },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 2 },
  actions: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  actionCard: { flex: 1, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.lg, alignItems: "center", gap: spacing.xs },
  actionEmoji: { fontSize: 28 },
  actionText: { fontWeight: "800", color: colors.onSurface },
  empty: { alignItems: "center", padding: spacing.xxxl, gap: spacing.sm },
  emptyEmoji: { fontSize: 60 },
  emptyTitle: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  emptySub: { fontSize: 14, color: colors.muted, textAlign: "center" },
  logCard: { flexDirection: "row", gap: spacing.md, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.lg, alignItems: "center" },
  logIconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  logName: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  logMacros: { fontSize: 12, color: colors.muted, marginTop: 2 },
  healthBar: { height: 4, borderRadius: 2, backgroundColor: colors.surfaceTertiary, marginTop: spacing.xs, overflow: "hidden" },
  healthBarFill: { height: "100%" },
  logCal: { fontSize: 18, fontWeight: "800", color: colors.brandPrimary },
  logCalUnit: { fontSize: 10, color: colors.muted },
  del: { fontSize: 18, color: colors.muted, padding: 4, marginTop: 4 },

  sheet: { backgroundColor: colors.surface, padding: spacing.lg, borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: "85%" },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: spacing.md },
  sheetTitle: { fontSize: 22, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.lg },
  label: { fontSize: 13, fontWeight: "600", color: colors.onSurfaceSecondary },
  input: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 16, color: colors.onSurface },
  healthPicker: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  healthDot: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  saveBtn: { backgroundColor: colors.brandPrimary, paddingVertical: spacing.lg, borderRadius: radius.pill, alignItems: "center", marginTop: spacing.md },
  saveText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 16 },
});
