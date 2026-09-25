import React, { useEffect, useState } from "react";
import { Image, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { colors, fontSize, radius, spacing } from "@/src/theme";
import { AiItem, api, Meal } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { BuddyAvatar } from "@/src/buddy";
import { Button, Card, ErrorState, Icon, PremiumBadge, ScreenHeader } from "@/src/ui";
import { ConfirmItems } from "@/src/food-components";
import { track } from "@/src/analytics";

export default function Scan() {
  const router = useRouter();
  const { user, isPremium } = useAuth();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<{ items: AiItem[]; meal: Meal; image_path: string | null; confidence: string } | null>(null);
  const [error, setError] = useState<{ msg: string; status: number } | null>(null);
  const [usage, setUsage] = useState<{ used: number; limit: number | null } | null>(null);
  const [permDenied, setPermDenied] = useState(false);

  useEffect(() => { api.usage().then(u => setUsage(u.meal_photo_scan)).catch(() => {}); }, [result]);

  async function pickImage(source: "camera" | "library") {
    setError(null); setResult(null); setPermDenied(false);
    const perm = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setPermDenied(true); return; }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], allowsEditing: true, quality: 0.6, base64: true };
    const res = source === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setImageUri(asset.uri);
    if (!asset.base64) return setError({ msg: "Couldn't read the image data.", status: 0 });
    setAnalyzing(true); track("ai_scan_started");
    try {
      const r = await api.analyzePhoto(asset.base64);
      track("ai_scan_completed", { items: r.items.length });
      setResult({ items: r.items, meal: r.suggested_meal, image_path: r.image_path, confidence: r.confidence });
    } catch (e: any) { setError({ msg: e.message ?? "Buddy couldn't recognize this meal.", status: e.status ?? 0 }); } finally { setAnalyzing(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Scan Meal" onBack={() => router.back()} close subtitle="AI estimate" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md }} keyboardShouldPersistTaps="handled">
        {!isPremium && usage && usage.limit != null && (
          <View style={styles.limit} testID="scan-limit">
            <Text style={styles.limitText}>{Math.max(0, usage.limit - usage.used)} of {usage.limit} free scans left today</Text>
            <Button title="Go Premium" size="sm" variant="ghost" onPress={() => router.push("/paywall")} />
          </View>
        )}

        {!result && (
          <View style={styles.preview}>
            {imageUri ? <Image source={{ uri: imageUri }} style={styles.previewImg} /> : (
              <View style={styles.placeholder}>
                <Icon name="camera-outline" size={44} color={colors.muted} />
                <Text style={styles.hint}>Snap or upload a photo. Buddy identifies the foods and estimates portions, and you confirm before anything is logged.</Text>
              </View>
            )}
            {analyzing && (
              <View style={styles.overlay} testID="scan-analyzing">
                <BuddyAvatar state="doing_well" equipped={user?.buddy?.equipped} size={90} showBackground={false} />
                <Text style={styles.overlayText}>Buddy is checking your meal…</Text>
              </View>
            )}
          </View>
        )}

        {!result && (
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button title="Camera" icon="camera" onPress={() => pickImage("camera")} disabled={analyzing} style={{ flex: 1 }} testID="pick-camera" />
            <Button title="Gallery" icon="images-outline" variant="secondary" onPress={() => pickImage("library")} disabled={analyzing} style={{ flex: 1 }} testID="pick-library" />
          </View>
        )}
        {permDenied && (
          <Card><Text style={styles.hint}>Camera and photo access let Buddy see your meal. You can enable it in Settings.</Text><Button title="Open Settings" size="sm" variant="secondary" onPress={() => Linking.openSettings()} style={{ marginTop: spacing.sm }} /></Card>
        )}

        {error && (
          <Card>
            {error.status === 402 ? (
              <View style={{ alignItems: "center", gap: spacing.sm }}>
                <PremiumBadge />
                <Text style={styles.errTitle}>You've used today's free scans</Text>
                <Text style={styles.hint}>Premium includes expanded AI scans. Barcode scanning and search are always free and unlimited.</Text>
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <Button title="Try Premium" onPress={() => router.push("/paywall")} size="sm" />
                  <Button title="Scan barcode" variant="secondary" size="sm" onPress={() => router.replace("/barcode")} />
                </View>
              </View>
            ) : (
              <ErrorState title="Buddy couldn't recognize this meal." message={error.msg} onRetry={() => pickImage("camera")} secondaryTitle="Enter manually" onSecondary={() => router.replace("/search")} />
            )}
          </Card>
        )}

        {result && (
          <View style={{ gap: spacing.md }} testID="scan-result">
            {imageUri && <Image source={{ uri: imageUri }} style={styles.resultImg} />}
            {result.items.length === 0 && <ErrorState title="No food detected" message="Try a clearer photo, or add items below." />}
            <ConfirmItems items={result.items} meal={result.meal} imagePath={result.image_path} source="photo" onDone={() => router.replace("/(tabs)/log")} onCancel={() => { setResult(null); setImageUri(null); }} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  limit: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.surfaceTertiary, paddingLeft: spacing.lg, paddingRight: spacing.xs, paddingVertical: spacing.xs, borderRadius: radius.pill },
  limitText: { fontWeight: "700", color: colors.onSurface, fontSize: fontSize.sm },
  preview: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, height: 300, overflow: "hidden", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  previewImg: { width: "100%", height: "100%", resizeMode: "cover" },
  resultImg: { width: "100%", height: 160, borderRadius: radius.lg, resizeMode: "cover" },
  placeholder: { alignItems: "center", gap: spacing.md, padding: spacing.xl },
  hint: { color: colors.textSecondary, textAlign: "center", fontSize: fontSize.sm, lineHeight: 20 },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(255,249,245,0.92)", alignItems: "center", justifyContent: "center", gap: spacing.md },
  overlayText: { fontWeight: "800", color: colors.onSurface, fontSize: fontSize.md },
  errTitle: { fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface, textAlign: "center" },
});
