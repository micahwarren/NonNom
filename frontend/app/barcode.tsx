import React, { useEffect, useRef, useState } from "react";
import { Linking, Platform, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { colors, fontSize, radius, spacing } from "@/src/theme";
import { api, DbFood } from "@/src/api";
import { Button, Card, ErrorState, Field, Icon, ScreenHeader } from "@/src/ui";
import { DbFoodSheet } from "@/src/food-components";
import { ManualSheet } from "./search";
import { track } from "@/src/analytics";

type Status = "idle" | "looking" | "found" | "notfound" | "error";

export default function BarcodeScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<Status>("idle");
  const [product, setProduct] = useState<DbFood | null>(null);
  const [errMsg, setErrMsg] = useState("");
  const [manual, setManual] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const lastCode = useRef<string | null>(null);
  const lockedUntil = useRef(0);

  useEffect(() => { if (permission && !permission.granted && permission.canAskAgain) requestPermission(); }, [permission?.granted]);

  async function lookup(code: string) {
    const now = Date.now();
    if (status === "looking" || now < lockedUntil.current || lastCode.current === code) return;
    lastCode.current = code; lockedUntil.current = now + 2500;
    setStatus("looking");
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const r = await api.barcode(code);
      track("barcode_scanned", { found: true });
      setProduct(r.product); setStatus("found");
    } catch (e: any) {
      track("barcode_scanned", { found: false });
      if (e.status === 404) setStatus("notfound"); else { setErrMsg(e.message); setStatus("error"); }
    }
  }
  function reset() { lastCode.current = null; setProduct(null); setStatus("idle"); }

  const cameraOk = permission?.granted && Platform.OS !== "web";

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Scan Barcode" onBack={() => router.back()} close subtitle="No AI credits used" />
      <View style={styles.cameraWrap}>
        {cameraOk ? (
          <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128"] }} onBarcodeScanned={status === "idle" ? r => lookup(r.data) : undefined} />
        ) : (
          <View style={styles.noCam}>
            <Icon name="camera-outline" size={36} color={colors.muted} />
            {Platform.OS === "web" ? <Text style={styles.noCamText}>Camera scanning works on iPhone and Android. Enter the barcode below to test the lookup.</Text>
              : permission && !permission.granted ? (
                <>
                  <Text style={styles.noCamText}>NomNom uses the camera to read barcodes so you can log packaged foods instantly.</Text>
                  {permission.canAskAgain ? <Button title="Allow camera" onPress={requestPermission} size="sm" /> : <Button title="Open Settings" onPress={() => Linking.openSettings()} size="sm" />}
                </>
              ) : <Text style={styles.noCamText}>Starting camera…</Text>}
          </View>
        )}
        <View style={styles.frame} pointerEvents="none">{[0, 1, 2, 3].map(i => <View key={i} style={[styles.corner, i === 1 && { right: 0, left: undefined, borderLeftWidth: 0, borderRightWidth: 3 }, i === 2 && { bottom: 0, top: undefined, borderTopWidth: 0, borderBottomWidth: 3 }, i === 3 && { bottom: 0, right: 0, top: undefined, left: undefined, borderTopWidth: 0, borderLeftWidth: 0, borderBottomWidth: 3, borderRightWidth: 3 }]} />)}</View>
        {status === "looking" && <View style={styles.overlay}><Text style={styles.overlayText}>Looking up product…</Text></View>}
      </View>

      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        {status === "notfound" && (
          <Card>
            <ErrorState title="We couldn't find this product." message="It isn't in Open Food Facts yet. You can search by name, enter nutrition from the label, or take a photo." onRetry={reset} />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Button title="Search" variant="secondary" size="sm" onPress={() => router.replace("/search")} style={{ flex: 1 }} />
              <Button title="Enter manually" variant="secondary" size="sm" onPress={() => setManual(true)} style={{ flex: 1 }} testID="barcode-manual" />
              <Button title="Photo" variant="secondary" size="sm" onPress={() => router.replace("/scan")} style={{ flex: 1 }} />
            </View>
          </Card>
        )}
        {status === "error" && <Card><ErrorState title="Lookup failed" message={errMsg} onRetry={reset} secondaryTitle="Enter manually" onSecondary={() => setManual(true)} /></Card>}
        {(status === "idle" || status === "looking") && (
          <>
            <Text style={styles.help}>Point the camera at a barcode. Nutrition comes from Open Food Facts and is cached for speed.</Text>
            <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-end" }}>
              <View style={{ flex: 1 }}><Field label="Or type the barcode" value={manualCode} onChangeText={setManualCode} keyboardType="number-pad" placeholder="e.g. 3017624010701" testID="barcode-input" /></View>
              <Button title="Look up" onPress={() => manualCode.length >= 6 && lookup(manualCode)} disabled={manualCode.length < 6 || status === "looking"} testID="barcode-lookup" />
            </View>
          </>
        )}
      </View>

      <DbFoodSheet food={status === "found" ? product : null} onClose={reset} onLogged={() => router.back()} source="barcode" />
      <ManualSheet visible={manual} onClose={() => setManual(false)} onLogged={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  cameraWrap: { marginHorizontal: spacing.lg, height: 300, borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.surfaceInverse, alignItems: "center", justifyContent: "center" },
  noCam: { alignItems: "center", gap: spacing.md, padding: spacing.xl },
  noCamText: { color: colors.onSurfaceInverse, textAlign: "center", fontSize: fontSize.sm, opacity: 0.85, lineHeight: 20 },
  frame: { position: "absolute", width: 220, height: 140 },
  corner: { position: "absolute", top: 0, left: 0, width: 28, height: 28, borderColor: colors.brandPrimary, borderTopWidth: 3, borderLeftWidth: 3, borderRadius: 4 },
  overlay: { position: "absolute", bottom: spacing.md, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill },
  overlayText: { fontWeight: "800", color: colors.onSurface, fontSize: fontSize.sm },
  help: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: "center", lineHeight: 20 },
});
