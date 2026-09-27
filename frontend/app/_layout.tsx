import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { DialogProvider } from "@/src/components/dialog";
import { ToastProvider } from "@/src/components/toast";
import { ensureDirs } from "@/src/lib/fs";
import { applyThemePref, loadThemePref } from "@/src/lib/theme-pref";
import { queryClient } from "@/src/query-client";
import { useTheme } from "@/src/theme";

function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === "dark" ? "light" : "dark"} />;
}

export default function RootLayout() {
  useEffect(() => {
    void ensureDirs().catch((error) => console.warn("[startup] storage initialization failed", error));
    void loadThemePref().then(applyThemePref).catch((error) => console.warn("[startup] theme initialization failed", error));
  }, []);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <KeyboardProvider>
              <ToastProvider>
                <DialogProvider>
                  <ThemedStatusBar />
                  <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#F5F6F8" } }}>
                    <Stack.Screen name="scanner" options={{ presentation: "fullScreenModal" }} />
                    <Stack.Screen name="pdf-viewer" options={{ animation: "slide_from_right" }} />
                  </Stack>
                </DialogProvider>
              </ToastProvider>
            </KeyboardProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
