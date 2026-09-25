import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useThemeStyles, ThemeColors, fontSize, spacing } from "@/src/theme";
import { Card, ScreenHeader } from "@/src/ui";

// Placeholder legal copy. Set EXPO_PUBLIC_TERMS_URL / EXPO_PUBLIC_PRIVACY_URL to link to your hosted documents instead.
export default function Legal() {
  const { colors, styles } = useThemeStyles(createStyles);
  const router = useRouter();
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  const isTerms = doc === "terms";
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title={isTerms ? "Terms of Service" : "Privacy Policy"} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <Card style={{ gap: spacing.sm }}>
          <Text style={styles.h}>Summary</Text>
          {isTerms ? (
            <Text style={styles.p}>NomNom provides nutrition tracking tools and estimates for informational purposes only. It is not medical advice. Calorie and nutrient values from databases and AI are estimates and may be inaccurate. Subscriptions renew automatically through the App Store or Google Play until cancelled. You are responsible for the accuracy of the data you enter.</Text>
          ) : (
            <Text style={styles.p}>We store the account details, food, water, weight and exercise entries you log so the app can work. Food photos you scan are stored privately to your account. We do not sell your data. Body weight, calorie totals and meal history are never shared publicly. You can delete your account and all associated data at any time from Profile → Delete account.</Text>
          )}
          <Text style={styles.note}>Final legal text must be reviewed and published by the app owner before store submission.</Text>
        </Card>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  h: { fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface },
  p: { fontSize: fontSize.sm, color: colors.onSurface, lineHeight: 22 },
  note: { fontSize: fontSize.xs, color: colors.textSecondary, fontStyle: "italic", marginTop: spacing.sm },
});
