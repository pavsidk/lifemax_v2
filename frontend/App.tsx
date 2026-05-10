import React, { useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { AuthScreen } from "./src/screens/AuthScreen";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { TabNavigator } from "./src/navigation/TabNavigator";

type AppState = "auth" | "onboarding" | "main";

export default function App() {
  const [screen, setScreen] = useState<AppState>("auth");
  const [userId, setUserId] = useState<string>("");

  const handleAuth = (uid: string, isNewUser: boolean) => {
    setUserId(uid);
    setScreen(isNewUser ? "onboarding" : "main");
  };

  if (screen === "auth") {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StatusBar style="light" />
          <AuthScreen onAuth={handleAuth} />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  if (screen === "onboarding") {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StatusBar style="light" />
          <OnboardingScreen userId={userId} onComplete={() => setScreen("main")} />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <NavigationContainer>
          <TabNavigator userId={userId} />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
