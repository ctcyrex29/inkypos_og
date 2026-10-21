// src/app/_layout.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, View, useColorScheme } from "react-native";
import { Colors } from "../constants/theme";
import { initDatabase } from "../db/sqlite";
import "../global.css";
import { useSettingsStore } from "../store/useSettingsStore";
import { useSyncStore } from "../store/useSyncStore";

const queryClient = new QueryClient();

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);
  const scheme = useColorScheme();
  const theme =
    Colors[scheme === "unspecified" ? "light" : scheme] ?? Colors.light;
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const setOnline = useSyncStore((state) => state.setOnline);

  useEffect(() => {
    async function prepareApp() {
      // 1. Initialize SQLite Database Tables & Seeds
      await initDatabase();
      // 2. Load Local Business Config (Exchange rates, currency settings)
      await loadSettings();
      // 3. Mark app state ready
      setDbReady(true);
      // 4. Simulate network check
      setOnline(true);
    }

    prepareApp();
  }, []);

  if (!dbReady) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: theme.background,
        }}
      >
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" options={{ animation: "fade" }} />
        <Stack.Screen name="(app)" />
      </Stack>
    </QueryClientProvider>
  );
}
