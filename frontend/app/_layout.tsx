import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments, useGlobalSearchParams } from "expo-router";
import { LogBox, View } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import React, { useEffect } from "react";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { AuthProvider, useAuth } from "@/src/auth-context";
import { initializeRevenueCat, SubscriptionProvider } from "@/src/revenuecat";
import { ToastProvider } from "@/src/ui";
import { AddSheetProvider } from "@/src/add-sheet";
import { initializeTheme, useTheme } from "@/src/theme";

// Keep native errors visible while investigating startup issues; browser
// bundling alone cannot verify an Expo Go launch on a physical device.
LogBox.ignoreAllLogs(false);

try {
  initializeRevenueCat();
} catch (err) {
  console.warn("RevenueCat unavailable:", err);
}

function RouterGate() {
  const { colors } = useTheme();
  const { user, loading } = useAuth();
  const segments = useSegments();
  const { edit } = useGlobalSearchParams<{ edit?: string }>();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === "(auth)";
    const inOnboarding = segments[0] === "onboarding";
    if (!user && !inAuth) router.replace("/(auth)/login");
    else if (user && !user.onboarding_complete && !inOnboarding) router.replace("/onboarding");
    else if (user && user.onboarding_complete && (inAuth || (inOnboarding && edit !== "1"))) router.replace("/(tabs)");
  }, [user?.id, user?.onboarding_complete, loading, segments[0], edit]);

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.surface }} />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
      <Stack.Screen name="paywall" options={{ presentation: "modal" }} />
      <Stack.Screen name="scan" options={{ presentation: "modal" }} />
      <Stack.Screen name="barcode" options={{ presentation: "modal" }} />
      <Stack.Screen name="describe" options={{ presentation: "modal" }} />
      <Stack.Screen name="search" options={{ presentation: "modal" }} />
      <Stack.Screen name="weight" options={{ presentation: "modal" }} />
      <Stack.Screen name="exercise" options={{ presentation: "modal" }} />
      <Stack.Screen name="feed-me" options={{ presentation: "modal" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const { colors, scheme, ready } = useTheme();
  useFonts({ Ionicons: require("@react-native-vector-icons/ionicons/fonts/Ionicons.ttf") });
  useEffect(() => { void initializeTheme(); }, []);
  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.surface }} />;
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.surface }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <SubscriptionProvider>
              <KeyboardProvider>
                <AuthProvider>
                  <ToastProvider>
                    <AddSheetProvider>
                      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
                      <RouterGate />
                    </AddSheetProvider>
                  </ToastProvider>
                </AuthProvider>
              </KeyboardProvider>
            </SubscriptionProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
