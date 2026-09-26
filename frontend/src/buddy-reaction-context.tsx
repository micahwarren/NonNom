import React, { createContext, useContext, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BuddyReaction } from "./api";
import { nomFromLegacy, withReaction } from "./nom-state";
import { useAuth } from "./auth-context";
import { subscribeBuddyReactions } from "./buddy-events";
import { BuddyAvatar } from "./buddy";
import { Icon } from "./ui";
import { ThemeColors, useThemeStyles, spacing, radius, fontSize } from "./theme";

const Context = createContext<{ latest: BuddyReaction | null; active: BuddyReaction | null }>({ latest: null, active: null });
export const useBuddyReaction = () => useContext(Context);


export function BuddyReactionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { colors, styles } = useThemeStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [latest, setLatest] = useState<BuddyReaction | null>(null);
  const [queue, setQueue] = useState<BuddyReaction[]>([]);
  const active = queue[0] ?? null;
  useEffect(() => {
    setLatest(null); setQueue([]);
    if (!user?.id) return;
    return subscribeBuddyReactions(event => {
      setLatest(event);
      setQueue(previous => [...previous, event]);
    });
  }, [user?.id]);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setQueue(previous => previous.slice(1)), 3400);
    return () => clearTimeout(timer);
  }, [active]);
  return <Context.Provider value={{ latest, active }}>
    {children}
    {active && user && <Animated.View key={active.id} entering={FadeInDown.duration(200)} exiting={FadeOutUp.duration(150)} testID="buddy-log-reaction" accessibilityLiveRegion="polite" style={[styles.notice, { top: insets.top + spacing.sm }]}>
      <BuddyAvatar nom={withReaction(active.summary.nom ?? nomFromLegacy(active.summary.buddy.state), active)} equipped={user.buddy.equipped} size={58} testID="reaction-nom" />
      <View style={styles.copy}>
        <Text testID="buddy-reaction-message" style={styles.message}>{active.message}</Text>
        <Text testID="buddy-reaction-direction" style={styles.detail}>{active.direction === "improved" ? "Small steps count" : active.direction === "worsened" ? "A change in your log, not a judgment" : "Check-in recorded"}</Text>
      </View>
      <Pressable testID="dismiss-buddy-reaction" onPress={() => setQueue(previous => previous.slice(1))} style={styles.close} accessibilityRole="button" accessibilityLabel={`Dismiss ${user.nom_name ?? "Nom"} reaction`}><Icon name="close" size={17} color={colors.textSecondary} /></Pressable>
    </Animated.View>}
  </Context.Provider>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  notice: { position: "absolute", left: spacing.md, right: spacing.md, zIndex: 1000, elevation: 12, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.sm, flexDirection: "row", gap: spacing.sm, alignItems: "center", shadowColor: colors.onSurface, shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  copy: { flex: 1, gap: 3 },
  message: { fontSize: fontSize.sm, color: colors.onSurface, fontWeight: "800" },
  detail: { fontSize: 11, color: colors.textSecondary },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});