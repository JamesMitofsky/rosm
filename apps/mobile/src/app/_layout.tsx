import "../global.css";
import "../tasks/runLocationTask"; // registers the background location task at launch
import { useEffect } from "react";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import cfg from "@rosm/core/appConfig.json";
import { configureMobilePorts } from "../ports";
import { useAuth } from "../auth/useAuth";
import { ConfettiHost } from "../ports/confetti";
import { OutboxSyncBridge } from "../components/OutboxSyncBridge";

// Wire @rosm/core to the Expo adapters once, before any screen renders.
configureMobilePorts();
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { signedIn, ready } = useAuth();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null; // keep the splash up until the keychain read resolves

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <BottomSheetModalProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: cfg.colors.paper },
            }}
          >
            <Stack.Protected guard={!signedIn}>
              <Stack.Screen name="login" />
            </Stack.Protected>
            <Stack.Protected guard={signedIn}>
              <Stack.Screen name="index" />
              <Stack.Screen name="plan" />
              <Stack.Screen name="run" />
              <Stack.Screen name="quick-update" />
              <Stack.Screen name="run-detail" />
            </Stack.Protected>
          </Stack>
          <ConfettiHost />
          <OutboxSyncBridge />
        </BottomSheetModalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
