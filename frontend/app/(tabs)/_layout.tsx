import React from "react";
import { Tabs } from "expo-router";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { colors, shadow } from "@/src/theme";
import { Icon, IconName } from "@/src/ui";
import { useAddSheet } from "@/src/add-sheet";

function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  return <Icon name={name} size={24} color={focused ? colors.brandPrimary : colors.muted} />;
}

function AddButton() {
  const { open } = useAddSheet();
  return (
    <View style={styles.addWrap} pointerEvents="box-none">
      <Pressable testID="tab-add" onPress={open} accessibilityRole="button" accessibilityLabel="Add"
        style={({ pressed }) => [styles.addBtn, pressed && { transform: [{ scale: 0.94 }] }]}>
        <Icon name="add" size={30} color={colors.onBrandPrimary} />
      </Pressable>
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
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
        tabBarStyle: { backgroundColor: colors.surfaceSecondary, borderTopColor: colors.border, borderTopWidth: 1, height: Platform.OS === "web" ? 64 : 84, paddingTop: 6 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Buddy", tabBarIcon: ({ focused }) => <TabIcon name={focused ? "happy" : "happy-outline"} focused={focused} /> }} />
      <Tabs.Screen name="log" options={{ title: "Log", tabBarIcon: ({ focused }) => <TabIcon name={focused ? "restaurant" : "restaurant-outline"} focused={focused} /> }} />
      <Tabs.Screen name="add" options={{ title: "", tabBarButton: () => <AddButton /> }} listeners={{ tabPress: e => e.preventDefault() }} />
      <Tabs.Screen name="progress" options={{ title: "Progress", tabBarIcon: ({ focused }) => <TabIcon name={focused ? "stats-chart" : "stats-chart-outline"} focused={focused} /> }} />
      <Tabs.Screen name="profile" options={{ title: "You", tabBarIcon: ({ focused }) => <TabIcon name={focused ? "person" : "person-outline"} focused={focused} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  addWrap: { flex: 1, alignItems: "center", justifyContent: "flex-start" },
  addBtn: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", marginTop: -22, borderWidth: 4, borderColor: colors.surfaceSecondary, ...shadow.brand },
});
