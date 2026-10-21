import { useRouter } from "expo-router";
import { ArrowRight, Building2, Store } from "lucide-react-native";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PortalSwitchCard } from "../../components/PortalSwitchCard";
import { useAuthStore } from "../../store/useAuthStore";

export default function PortalScreen() {
  const router = useRouter();
  const { portalContext, user } = useAuthStore();

  if (!portalContext || !user) {
    return null;
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        <View className="mb-6">
          <Text className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
            Multi-tenant access
          </Text>
          <Text className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
            Welcome back, {user.full_name}
          </Text>
          <Text className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            Your account is now mapped to the right InkyPOS portal for your
            role.
          </Text>
        </View>

        <PortalSwitchCard
          title={portalContext.title}
          subtitle={portalContext.subtitle}
          badge={portalContext.badge}
          sections={portalContext.sections}
          permissions={portalContext.permissions}
        />

        <View className="flex-row flex-wrap justify-between mt-2">
          <TouchableOpacity
            className="w-full md:w-[48%] bg-primary rounded-2xl p-4 mb-3"
            onPress={() => router.replace("/(app)")}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <View className="flex-row items-center mb-2">
                  <Building2 color="#fff" size={18} />
                  <Text className="ml-2 text-white font-semibold">
                    Continue to workspace
                  </Text>
                </View>
                <Text className="text-sm text-blue-100">
                  Open the main dashboard for your current portal.
                </Text>
              </View>
              <ArrowRight color="#fff" size={18} />
            </View>
          </TouchableOpacity>

          <View className="w-full md:w-[48%] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 mb-3">
            <View className="flex-row items-center mb-2">
              <Store color="#0A2540" size={18} />
              <Text className="ml-2 text-slate-800 dark:text-white font-semibold">
                Company and store model
              </Text>
            </View>
            <Text className="text-sm text-slate-500 dark:text-slate-400">
              Every record can be scoped by company and store for isolation,
              permissions, and multi-branch operations.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
