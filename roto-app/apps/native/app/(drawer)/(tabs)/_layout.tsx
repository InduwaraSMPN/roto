import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useThemeColor } from "heroui-native";

import { useLang } from "@/lib/i18n";

export default function TabLayout() {
  // ponytail: tab titles must come from `t` or the bar stays English in si/ta — the drawer layout
  // does this correctly, the tab bar did not, and only a screenshot in Tamil caught it.
  const { t } = useLang();
  const themeColorForeground = useThemeColor("foreground");
  const themeColorBackground = useThemeColor("background");

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        headerStyle: {
          backgroundColor: themeColorBackground,
        },
        headerTintColor: themeColorForeground,
        headerTitleStyle: {
          color: themeColorForeground,
          fontWeight: "600",
        },
        tabBarStyle: {
          backgroundColor: themeColorBackground,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t.home,
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: t.sectionRide,
          tabBarIcon: ({ color, size }) => <Ionicons name="bicycle" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="two"
        options={{
          title: t.ridesTab,
          tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
