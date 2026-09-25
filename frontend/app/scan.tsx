import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Image, ActivityIndicator, Alert, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { colors, spacing, radius } from "@/src/theme";
import { api, FoodLog } from "@/src/api";
import { useAuth } from "@/src/auth-context";

export default function Scan() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<FoodLog | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pickImage(source: "camera" | "library") {
    setError(null); setResult(null);
    let perm;
    if (source === "camera") {
      perm = await ImagePicker.requestCameraPermissionsAsync();
    } else {
      perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    }
    if (!perm.granted) return Alert.alert("Permission needed", "Please allow access");

    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    };

    const res = source === "camera"
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets?.[0]) return;

    const asset = res.assets[0];
    setImageUri(asset.uri);
    if (!asset.base64) return setError("Could not read image data");

    setAnalyzing(true);
    try {
      const log = await api.logFoodPhoto(asset.base64);
      setResult(log);
    } catch (e: any) {
      setError(e.message ?? "AI analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable testID="scan-close" onPress={() => router.back()} style={styles.closeBtn}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
        <Text style={styles.title}>AI Food Scan</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md }}>
        {user?.plan !== "premium" && (
          <View style={styles.limitBanner}>
            <Text style={styles.limitText}>Free plan: 3 AI scans/day</Text>
            <Pressable onPress={() => router.push("/paywall")}><Text style={styles.limitLink}>Go Premium</Text></Pressable>
          </View>
        )}

        <View style={styles.preview}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.previewImg} />
          ) : (
            <View style={styles.previewPlaceholder}>
              <Text style={{ fontSize: 60 }}>📸</Text>
              <Text style={styles.previewHint}>Snap or upload a photo of your meal</Text>
            </View>
          )}
          {analyzing && (
            <View style={styles.overlay}>
              <ActivityIndicator size="large" color={colors.brandPrimary} />
              <Text style={styles.overlayText}>Scanning your meal...</Text>
            </View>
          )}
        </View>

        <View style={styles.buttonsRow}>
          <Pressable testID="pick-camera" style={({ pressed }) => [styles.btn, styles.primary, pressed && styles.pressed]} onPress={() => pickImage("camera")} disabled={analyzing}>
            <Text style={styles.btnPrimaryText}>📷  Camera</Text>
          </Pressable>
          <Pressable testID="pick-library" style={({ pressed }) => [styles.btn, styles.secondary, pressed && styles.pressed]} onPress={() => pickImage("library")} disabled={analyzing}>
            <Text style={styles.btnSecondaryText}>🖼️  Gallery</Text>
          </Pressable>
        </View>

        {error && <Text style={styles.error} testID="scan-error">{error}</Text>}

        {result && (
          <View style={styles.resultCard} testID="scan-result">
            <View style={styles.resultBadge}>
              <Text style={styles.resultBadgeText}>Fed to your buddy!</Text>
            </View>
            <Text style={styles.resultName}>{result.name}</Text>
            <Text style={styles.resultCal}>{result.calories} kcal</Text>
            <View style={styles.macroRow}>
              <Macro label="Protein" v={result.protein_g} />
              <Macro label="Carbs" v={result.carbs_g} />
              <Macro label="Fat" v={result.fat_g} />
            </View>
            <View style={styles.healthWrap}>
              <Text style={styles.healthLabel}>Health score: {result.health_score}/10</Text>
              <View style={styles.healthBar}>
                <View style={[styles.healthFill, { width: `${result.health_score * 10}%`, backgroundColor: result.health_score >= 7 ? colors.success : result.health_score >= 4 ? colors.warning : colors.error }]} />
              </View>
            </View>
            <Pressable testID="scan-done" style={styles.doneBtn} onPress={() => router.replace("/(tabs)")}>
              <Text style={styles.doneText}>See my buddy</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Macro({ label, v }: any) {
  return (
    <View style={styles.macro}>
      <Text style={styles.macroV}>{Number(v).toFixed(0)}g</Text>
      <Text style={styles.macroL}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surface },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  closeText: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  title: { fontSize: 20, fontWeight: "800", color: colors.onSurface },

  limitBanner: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.brandSecondary, padding: spacing.md, borderRadius: radius.lg },
  limitText: { fontWeight: "700", color: colors.onBrandSecondary },
  limitLink: { fontWeight: "800", color: colors.brandPrimary },

  preview: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, height: 320, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  previewImg: { width: "100%", height: "100%", resizeMode: "cover" },
  previewPlaceholder: { alignItems: "center", gap: spacing.md, padding: spacing.xl },
  previewHint: { color: colors.muted, textAlign: "center", fontWeight: "600" },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(255,249,245,0.9)", alignItems: "center", justifyContent: "center", gap: spacing.md },
  overlayText: { fontWeight: "800", color: colors.onSurface },

  buttonsRow: { flexDirection: "row", gap: spacing.sm },
  btn: { flex: 1, paddingVertical: spacing.lg, borderRadius: radius.pill, alignItems: "center" },
  primary: { backgroundColor: colors.brandPrimary },
  secondary: { backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.brandPrimary },
  btnPrimaryText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 16 },
  btnSecondaryText: { color: colors.brandPrimary, fontWeight: "800", fontSize: 16 },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },

  error: { color: colors.error, textAlign: "center", fontWeight: "700", padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg },

  resultCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  resultBadge: { backgroundColor: colors.success, alignSelf: "flex-start", paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill },
  resultBadgeText: { color: colors.onSuccess, fontWeight: "800", fontSize: 12 },
  resultName: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  resultCal: { fontSize: 30, fontWeight: "800", color: colors.brandPrimary },
  macroRow: { flexDirection: "row", gap: spacing.sm },
  macro: { flex: 1, backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.lg, alignItems: "center" },
  macroV: { fontWeight: "800", fontSize: 18, color: colors.onSurface },
  macroL: { fontSize: 11, color: colors.muted, fontWeight: "600" },
  healthWrap: { gap: spacing.xs },
  healthLabel: { fontWeight: "700", color: colors.onSurface },
  healthBar: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  healthFill: { height: "100%" },
  doneBtn: { backgroundColor: colors.brandPrimary, paddingVertical: spacing.md, borderRadius: radius.pill, alignItems: "center", marginTop: spacing.sm },
  doneText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 16 },
});
