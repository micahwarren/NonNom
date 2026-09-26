import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useThemeStyles, ThemeColors, fontSize, spacing, radius } from "@/src/theme";
import { api, LegalDoc } from "@/src/api";
import { Card, ErrorState, LoadingState, ScreenHeader } from "@/src/ui";

// Renders the Terms of Service / Privacy Policy served by the backend (single source of truth for in-app and web copies).
export default function Legal() {
  const { colors, styles } = useThemeStyles(createStyles);
  const router = useRouter();
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  const which: "terms" | "privacy" = doc === "terms" ? "terms" : "privacy";
  const [data, setData] = useState<LegalDoc | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => { setErr(null); api.legalDoc(which).then(setData).catch(e => setErr(e.message)); };
  useEffect(load, [which]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title={data?.title ?? (which === "terms" ? "Terms of Service" : "Privacy Policy")} subtitle={data ? `Version ${data.version} · Effective ${data.effective}` : undefined} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }} testID="legal-scroll">
        {err ? <ErrorState message={err} onRetry={load} /> : !data ? <LoadingState rows={6} /> : (
          <>
            <Card style={styles.notice}><Text style={styles.noticeText}>Items in [brackets] are business details the app owner still needs to supply. Both documents should be reviewed by a qualified attorney before public launch.</Text></Card>
            <Text style={styles.p}>{data.intro}</Text>
            {data.sections.map(sec => (
              <View key={sec.h} style={{ gap: spacing.xs }}>
                <Text style={styles.h}>{sec.h}</Text>
                {sec.p.map((para, i) => <Text key={i} style={styles.p}>{para}</Text>)}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  h: { fontSize: fontSize.md, fontWeight: "800", color: colors.onSurface, marginTop: spacing.sm },
  p: { fontSize: fontSize.sm, color: colors.onSurface, lineHeight: 22 },
  notice: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md },
  noticeText: { fontSize: fontSize.xs, color: colors.textSecondary, lineHeight: 18, fontStyle: "italic" },
});
