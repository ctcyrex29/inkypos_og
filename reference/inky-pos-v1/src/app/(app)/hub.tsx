import {
    ArrowRight,
    Building2,
    Layers3,
    ShieldCheck,
    Store,
    Users,
} from "lucide-react-native";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, CardContent } from "../../components/ui/Card";
import {
    companyPortalCards,
    dataPrincipleItems,
    hubOverviewMetrics,
    permissionMatrix,
    platformHubCards,
    storeHierarchyRows,
} from "../../utils/hub";
import { usePortalRouteGuard } from "../../utils/portalGuard";

export default function HubScreen() {
  usePortalRouteGuard(["hub"]);

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 96 }}>
        <View className="mb-6">
          <Text className="text-2xl font-extrabold text-slate-900 dark:text-white">
            InkyPOS Central Hub
          </Text>
          <Text className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            A multi-tenant platform view for Inkgenius operations, client
            companies, and store rollout management.
          </Text>
        </View>

        <Card className="mb-6 border border-slate-200 dark:border-slate-800">
          <CardContent className="p-5">
            <View className="flex-row items-center mb-4">
              <View className="w-10 h-10 rounded-2xl bg-primary/10 items-center justify-center mr-3">
                <Building2 color="#0A2540" size={20} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-slate-800 dark:text-white">
                  Platform overview
                </Text>
                <Text className="text-xs text-slate-500 dark:text-slate-400">
                  Super admin view for companies, stores, installations, and
                  billing.
                </Text>
              </View>
            </View>

            <View className="flex-row flex-wrap justify-between">
              {hubOverviewMetrics.map((metric) => (
                <View key={metric.label} className="w-[48%] mb-3">
                  <View className={`rounded-2xl ${metric.accent} p-3`}>
                    <Text className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {metric.label}
                    </Text>
                    <Text className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
                      {metric.value}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </CardContent>
        </Card>

        <Text className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
          Platform operations
        </Text>
        <View className="flex-row flex-wrap justify-between mb-6">
          {platformHubCards.map((item) => (
            <TouchableOpacity
              key={item.title}
              className="w-full sm:w-[48%] mb-3"
            >
              <Card className="border border-slate-200 dark:border-slate-800">
                <CardContent className="p-4">
                  <View className="flex-row justify-between items-start mb-2">
                    <Text className="text-sm font-semibold text-slate-900 dark:text-white flex-1">
                      {item.title}
                    </Text>
                    <View className="bg-primary/10 rounded-full px-2 py-1">
                      <Text className="text-[10px] font-semibold text-primary">
                        {item.badge}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-xs text-slate-500 dark:text-slate-400">
                    {item.description}
                  </Text>
                </CardContent>
              </Card>
            </TouchableOpacity>
          ))}
        </View>

        <Text className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
          Company portal
        </Text>
        <View className="flex-row flex-wrap justify-between mb-6">
          {companyPortalCards.map((item) => (
            <TouchableOpacity
              key={item.title}
              className="w-full sm:w-[48%] mb-3"
            >
              <Card className="border border-slate-200 dark:border-slate-800">
                <CardContent className="p-4">
                  <View className="flex-row justify-between items-start mb-2">
                    <Text className="text-sm font-semibold text-slate-900 dark:text-white flex-1">
                      {item.title}
                    </Text>
                    <View className="bg-emerald-500/10 rounded-full px-2 py-1">
                      <Text className="text-[10px] font-semibold text-emerald-600">
                        {item.badge}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-xs text-slate-500 dark:text-slate-400">
                    {item.description}
                  </Text>
                </CardContent>
              </Card>
            </TouchableOpacity>
          ))}
        </View>

        <Card className="mb-6 border border-slate-200 dark:border-slate-800">
          <CardContent className="p-5">
            <View className="flex-row items-center mb-4">
              <View className="w-10 h-10 rounded-2xl bg-amber-500/10 items-center justify-center mr-3">
                <Store color="#B45309" size={20} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-slate-800 dark:text-white">
                  Store hierarchy
                </Text>
                <Text className="text-xs text-slate-500 dark:text-slate-400">
                  Each company can own multiple stores with delegated teams and
                  roles.
                </Text>
              </View>
            </View>

            {storeHierarchyRows.map((row) => (
              <View key={row.title} className="flex-row items-start mb-3">
                <View className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center mr-3 mt-0.5">
                  <Layers3 color="#64748B" size={16} />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-slate-900 dark:text-white">
                    {row.title}
                  </Text>
                  <Text className="text-xs text-slate-500 dark:text-slate-400">
                    {row.subtitle}
                  </Text>
                </View>
              </View>
            ))}
          </CardContent>
        </Card>

        <Card className="mb-6 border border-slate-200 dark:border-slate-800">
          <CardContent className="p-5">
            <View className="flex-row items-center mb-4">
              <View className="w-10 h-10 rounded-2xl bg-purple-500/10 items-center justify-center mr-3">
                <ShieldCheck color="#7C3AED" size={20} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-slate-800 dark:text-white">
                  Permission matrix
                </Text>
                <Text className="text-xs text-slate-500 dark:text-slate-400">
                  Roles stay scoped to the appropriate company, store, and
                  module.
                </Text>
              </View>
            </View>

            {permissionMatrix.map((row) => (
              <View
                key={row.role}
                className="flex-row justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-b-0"
              >
                <Text className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {row.role}
                </Text>
                <Text className="text-sm text-slate-500 dark:text-slate-400">
                  {row.capability}
                </Text>
              </View>
            ))}
          </CardContent>
        </Card>

        <Card className="border border-slate-200 dark:border-slate-800">
          <CardContent className="p-5">
            <View className="flex-row items-center mb-4">
              <View className="w-10 h-10 rounded-2xl bg-blue-500/10 items-center justify-center mr-3">
                <Users color="#2563EB" size={20} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-slate-800 dark:text-white">
                  Data model principle
                </Text>
                <Text className="text-xs text-slate-500 dark:text-slate-400">
                  Every record should carry a company anchor and a store anchor
                  where applicable.
                </Text>
              </View>
            </View>

            {dataPrincipleItems.map((item) => (
              <View key={item} className="flex-row items-start mb-2">
                <ArrowRight color="#0A2540" size={14} className="mt-1 mr-2" />
                <Text className="text-sm text-slate-600 dark:text-slate-300 flex-1">
                  {item}
                </Text>
              </View>
            ))}
          </CardContent>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
