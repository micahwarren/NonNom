// Weekly nudge for users who denied notifications and can no longer be re-prompted (canAskAgain === false). Shows a real
// dialog with "Open Settings"; the throttle stamp is written only when the dialog is actually shown.
import React, { useEffect, useState } from "react";
import { Linking, Platform, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { useAuth } from "./auth-context";
import { Button, Sheet } from "./ui";
import { ThemeColors, useThemeStyles, fontSize, spacing } from "./theme";

const KEY = "pushNudgeAt";
const WEEK = 7 * 24 * 60 * 60 * 1000;

export function PushNudge() {
  const { user } = useAuth();
  const { styles } = useThemeStyles(createStyles);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (Platform.OS === "web" || !user?.onboarding_complete) return;
    (async () => {
      try {
        const { status, canAskAgain } = await Notifications.getPermissionsAsync();
        if (status !== "denied" || canAskAgain) return;
        const last = await AsyncStorage.getItem(KEY);
        if (last && Date.now() - Number(last) <= WEEK) return;
        setOpen(true);
      } catch { /* not available in this runtime */ }
    })();
  }, [user?.id, user?.onboarding_complete]);
  const stamp = () => AsyncStorage.setItem(KEY, String(Date.now())).catch(() => {});
  const close = async () => { await stamp(); setOpen(false); };
  return (
    <Sheet visible={open} onClose={close} title="Turn on notifications?" testID="push-nudge">
      <Text style={styles.p}>{user?.nom_name ?? "Nom"} can remind you about meals, your streak and friend activity. Notifications are currently off for NomNom in your device settings.</Text>
      <View style={styles.row}>
        <Button title="Later" variant="secondary" onPress={close} testID="push-nudge-later" />
        <Button title="Open Settings" onPress={async () => { await stamp(); setOpen(false); Linking.openSettings(); }} style={{ flex: 1 }} testID="push-nudge-settings" />
      </View>
    </Sheet>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  p: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 22 },
  row: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
});
