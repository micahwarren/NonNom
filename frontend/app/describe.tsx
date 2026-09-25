import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useThemeStyles, ThemeColors, fontSize, radius, spacing } from "@/src/theme";
import { AiItem, api, Meal } from "@/src/api";
import { Button, Card, ErrorState, Icon, ScreenHeader } from "@/src/ui";
import { ConfirmItems } from "@/src/food-components";
import { track } from "@/src/analytics";
import { useAuth } from "@/src/auth-context";

const EXAMPLES = ["Two eggs, three strips of bacon, toast with butter", "Chicken rice bowl with avocado", "Large latte with oat milk and a banana"];

export default function DescribeScreen() {
  const { colors, styles } = useThemeStyles(createStyles);
  const router = useRouter();
  const { isPremium } = useAuth();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ items: AiItem[]; meal: Meal } | null>(null);
  const [error, setError] = useState<{ msg: string; status: number } | null>(null);
  useEffect(() => { if (isPremium) setError(previous => previous?.status === 402 ? null : previous); }, [isPremium]);

  async function parse() {
    if (text.trim().length < 3) return;
    setBusy(true); setError(null);
    try {
      const r = await api.describeMeal(text.trim());
      track("describe_meal_used", { items: r.items.length });
      setResult({ items: r.items, meal: r.suggested_meal });
    } catch (e: any) { setError({ msg: e.message, status: e.status ?? 0 }); } finally { setBusy(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Describe Meal" onBack={() => router.back()} close subtitle="AI estimate" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }} keyboardShouldPersistTaps="handled">
        {!result ? (
          <>
            <Card style={{ padding: spacing.md }}>
              <TextInput value={text} onChangeText={setText} multiline placeholder="I ate two eggs, three strips of bacon, toast with butter, and a protein shake…" placeholderTextColor={colors.muted} style={styles.input} testID="describe-input" autoFocus />
              <View style={styles.inputFooter}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Icon name="mic-outline" size={14} color={colors.muted} /><Text style={styles.dictate}>Use your keyboard's dictation key to speak</Text></View>
                <Text style={styles.count}>{text.length}/1000</Text>
              </View>
            </Card>
            <Button title="Find my foods" icon="sparkles" onPress={parse} loading={busy} disabled={text.trim().length < 3} size="lg" testID="describe-submit" />
            {busy && <Text style={styles.status}>Buddy is reading your meal…</Text>}
            {error && (
              error.status === 402 && !isPremium
                ? <Card><ErrorState title="Free limit reached" message={error.msg} onRetry={() => router.push("/paywall")} secondaryTitle="Search instead" onSecondary={() => router.replace("/search")} /></Card>
                : <Card><ErrorState title="Buddy couldn't understand that" message={error.msg} onRetry={parse} secondaryTitle="Enter manually" onSecondary={() => router.replace("/search")} /></Card>
            )}
            <Text style={styles.examplesTitle}>Try something like</Text>
            {EXAMPLES.map(e => <Button key={e} title={e} variant="secondary" size="sm" onPress={() => setText(e)} style={{ alignSelf: "flex-start", maxWidth: "100%" }} />)}
          </>
        ) : (
          <>
            <Text style={styles.found}>We found {result.items.length} item{result.items.length === 1 ? "" : "s"}</Text>
            <ConfirmItems items={result.items} meal={result.meal} source="describe" onDone={() => router.replace("/(tabs)/log")} onCancel={() => setResult(null)} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  input: { minHeight: 120, fontSize: fontSize.md, color: colors.onSurface, textAlignVertical: "top", lineHeight: 22 },
  inputFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },
  dictate: { fontSize: fontSize.xs, color: colors.muted, fontWeight: "600" },
  count: { fontSize: fontSize.xs, color: colors.muted, fontWeight: "600" },
  status: { textAlign: "center", color: colors.textSecondary, fontWeight: "700" },
  examplesTitle: { fontSize: fontSize.sm, fontWeight: "800", color: colors.textSecondary, marginTop: spacing.sm, textTransform: "uppercase", letterSpacing: 0.4 },
  found: { fontSize: fontSize.xl, fontWeight: "800", color: colors.onSurface },
});
