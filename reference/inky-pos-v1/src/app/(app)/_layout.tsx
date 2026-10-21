// src/app/(app)/_layout.tsx
import { Tabs, useRouter } from "expo-router";
import {
    BookOpen,
    FileText,
    LayoutDashboard,
    Menu as MenuIcon,
    Package,
    Radar,
    Settings,
    ShoppingBag,
} from "lucide-react-native";
import { useEffect } from "react";
import { useColorScheme } from "react-native";
import { Colors } from "../../constants/theme";
import { useAuthStore } from "../../store/useAuthStore";

const screens = [
  {
    name: "index",
    title: "Dashboard",
    label: "Dashboard",
    Icon: LayoutDashboard,
  },
  {
    name: "pos",
    title: "POS Terminal",
    label: "POS Checkout",
    Icon: ShoppingBag,
  },
  {
    name: "inventory",
    title: "Inventory Catalog",
    label: "Inventory",
    Icon: Package,
  },
  {
    name: "hub",
    title: "Central Hub",
    label: "Hub",
    Icon: Radar,
  },
  {
    name: "accounting",
    title: "Cash Book & Ledger",
    label: "Accounting",
    Icon: BookOpen,
  },
  {
    name: "reports",
    title: "Analytical Reports",
    label: "Reports",
    Icon: FileText,
  },
  {
    name: "settings",
    title: "System Settings",
    label: "Settings",
    Icon: Settings,
  },
  {
    name: "menu",
    title: "System Menu",
    label: "Menu",
    Icon: MenuIcon,
  },
];

export default function AppLayout() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors =
    Colors[scheme === "unspecified" ? "light" : scheme] ?? Colors.light;
  const { isAuthenticated, pinLocked } = useAuthStore();

  useEffect(() => {
    // Navigation security guards
    if (!isAuthenticated) {
      router.replace("/(auth)/login");
    } else if (pinLocked) {
      router.replace("/(auth)/pin");
    }
  }, [isAuthenticated, pinLocked]);

  if (!isAuthenticated || pinLocked) return null;

  const { portalContext } = useAuthStore();
  const allowedTabs = portalContext?.allowedAppTabs ?? ["index", "menu"];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        headerStyle: {
          backgroundColor: "#0A2540",
        },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: {
          fontWeight: "bold",
        },
        tabBarStyle: {
          backgroundColor: "#0A2540",
          borderTopWidth: 0,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: "#FFD700",
        tabBarInactiveTintColor: "#94A3B8",
      }}
    >
      {screens.map(({ name, title, label, Icon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarLabel: label,
            tabBarIcon: ({ color }) => <Icon color={color} size={22} />,
            tabBarButton: allowedTabs.includes(name) ? undefined : () => null,
          }}
        />
      ))}
    </Tabs>
  );
}
