import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { QuestLogScreen } from "../screens/QuestLogScreen";
import { SkillsScreen } from "../screens/SkillsScreen";
import { VaultScreen } from "../screens/VaultScreen";
import { ProfileScreen } from "../screens/ProfileScreen";

const Tab = createBottomTabNavigator();

interface Props { userId: string }

export function TabNavigator({ userId }: Props) {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#050508',
          borderTopColor: 'rgba(255,255,255,0.06)',
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: colors.cyan,
        tabBarInactiveTintColor: colors.mutedDark,
      }}
    >
      <Tab.Screen
        name="Quests"
        options={{
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="sword" size={size} color={color} />
          ),
        }}
      >
        {() => <QuestLogScreen userId={userId} />}
      </Tab.Screen>

      <Tab.Screen
        name="Skills"
        options={{
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="tree" size={size} color={color} />
          ),
        }}
      >
        {() => <SkillsScreen userId={userId} />}
      </Tab.Screen>

      <Tab.Screen
        name="Vault"
        options={{
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="shield-lock" size={size} color={color} />
          ),
        }}
      >
        {() => <VaultScreen userId={userId} />}
      </Tab.Screen>

      <Tab.Screen
        name="Profile"
        options={{
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-circle-outline" size={size} color={color} />
          ),
        }}
      >
        {() => <ProfileScreen userId={userId} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}
