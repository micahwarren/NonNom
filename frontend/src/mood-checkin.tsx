// Optional daily "How are you feeling?" check-in. Lives on the Log tab; saves standardized states so the Nom State Engine
// can react. Free text is interpreted server-side (keywords first, AI fallback) and never treated as a diagnosis.
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { api, MoodCheckin, MoodOption } from "./api";
import { useAuth } from "./auth-context";
import { Button, Card, Chip, Icon, IconName, useToast } from "./ui";
import { ThemeColors, useThemeStyles, fontSize, radius, spacing } from "./theme";

export function MoodCheckinCard({ onSaved }: { onSaved?: () => void }) {
  const { colors, styles } = useThemeStyles(createStyles);
  const { user } = useAuth();
  const toast = useToast();
  const nomName = user?.nom_name ?? "Nom";
  const [options, setOptions] = useState<MoodOption[]>([]);
  const [checkin, setCheckin] = useState<MoodCheckin | null>(null);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const r = await api.moodToday(); setOptions(r.options); setCheckin(r.checkin); } catch { /* card stays in its last state */ }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { if (!editing) { setSelected(checkin?.states ?? []); setText(checkin?.text ?? ""); } }, [checkin, editing]);

  const toggle = (id: string) => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  const labelOf = (id: string) => options.find(o => o.id === id)?.label ?? id.replace(/_/g, " ");

  async function save() {
    if (!selected.length && !text.trim()) { toast.show("Pick a feeling or describe your day", { icon: "information-circle" }); return; }
    setBusy(true);
    try {
      const r = await api.moodCheckin(selected, text.trim() || undefined);
      setCheckin(r.checkin); setEditing(false);
      toast.show(r.unmatched_text ? `Saved your note. ${nomName} couldn't map it to a feeling yet.` : `${nomName} knows how you feel today`, { icon: "heart" });
      onSaved?.();
    } catch (e: any) { toast.show(e.message ?? "Couldn't save", { icon: "alert-circle" }); }
    finally { setBusy(false); }
  }
  async function clear() {
    setBusy(true);
    try { await api.clearMood(); setCheckin(null); setEditing(false); onSaved?.(); } catch (e: any) { toast.show(e.message, { icon: "alert-circle" }); }
    finally { setBusy(false); }
  }

  if (checkin && !editing) {
    return (
      <Card style={styles.card} testID="mood-card">
        <View style={styles.headerRow}>
          <Icon name="heart" size={18} color={colors.brandPrimary} />
          <Text style={styles.title}>Today you feel</Text>
          <Pressable onPress={() => setEditing(true)} style={styles.editBtn} accessibilityRole="button" accessibilityLabel="Edit check-in" testID="mood-edit"><Text style={styles.link}>Edit</Text></Pressable>
        </View>
        <View style={styles.chips} testID="mood-saved-states">{checkin.states.map(s => <Chip key={s} label={labelOf(s)} selected icon={(options.find(o => o.id === s)?.icon as IconName) ?? undefined} />)}</View>
        {checkin.text && <Text style={styles.note} testID="mood-saved-text">“{checkin.text}”</Text>}
        <Text style={styles.hint}>{nomName} is reflecting how you feel alongside your food today. Resets tomorrow.</Text>
      </Card>
    );
  }

  return (
    <Card style={styles.card} testID="mood-card">
      <View style={styles.headerRow}>
        <Icon name="heart-outline" size={18} color={colors.brandPrimary} />
        <Text style={styles.title}>How are you feeling today?</Text>
        {editing && <Pressable onPress={() => setEditing(false)} style={styles.editBtn} accessibilityRole="button" accessibilityLabel="Cancel editing" testID="mood-cancel"><Text style={styles.link}>Cancel</Text></Pressable>}
      </View>
      <Text style={styles.hint}>Optional. Pick any that fit — {nomName} will show it. Not medical advice.</Text>
      <View style={styles.chips} testID="mood-options">
        {options.map(o => <Chip key={o.id} label={o.label} icon={o.icon as IconName} selected={selected.includes(o.id)} onPress={() => toggle(o.id)} testID={`mood-opt-${o.id}`} />)}
      </View>
      <TextInput value={text} onChangeText={setText} placeholder="Or describe it in your own words…" placeholderTextColor={colors.muted} style={styles.input} multiline maxLength={400} testID="mood-text" accessibilityLabel="Describe how you feel" />
      <View style={styles.actions}>
        {checkin && <Button title="Clear today" variant="secondary" size="sm" onPress={clear} disabled={busy} testID="mood-clear" />}
        <Button title={checkin ? "Update" : "Save check-in"} size="sm" onPress={save} loading={busy} testID="mood-save" style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  card: { gap: spacing.sm },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { flex: 1, fontSize: fontSize.md, fontWeight: "800", color: colors.onSurface },
  editBtn: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.sm },
  link: { color: colors.brandPrimary, fontWeight: "700", fontSize: fontSize.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  input: { minHeight: 48, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.onSurface, fontSize: fontSize.sm },
  note: { fontSize: fontSize.sm, color: colors.onSurface, fontStyle: "italic" },
  hint: { fontSize: fontSize.xs, color: colors.textSecondary, lineHeight: 18 },
  actions: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
});
