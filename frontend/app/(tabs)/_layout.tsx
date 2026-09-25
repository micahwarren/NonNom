import React from "react";
import { Tabs } from "expo-router";
import { Platform, Text, View, StyleSheet } from "react-native";
import { colors, spacing } from "@/src/theme";

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <View style={styles.iconWrap}>
      <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{label}</Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700", marginBottom: 4 },
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
      }}
    >
      <Tabs.Screen name="index" options={{
        title: "Buddy",
        tabBarIcon: ({ focused }) => <TabIcon label="🐣" focused={focused} />,
      }} />
      <Tabs.Screen name="log" options={{
        title: "Log",
        tabBarIcon: ({ focused }) => <TabIcon label="🍽️" focused={focused} />,
      }} />
      <Tabs.Screen name="stats" options={{
        title: "Stats",
        tabBarIcon: ({ focused }) => <TabIcon label="📊" focused={focused} />,
      }} />
      <Tabs.Screen name="profile" options={{
        title: "You",
        tabBarIcon: ({ focused }) => <TabIcon label="👤" focused={focused} />,
      }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: { alignItems: "center", justifyContent: "center", paddingTop: spacing.xs },
});
