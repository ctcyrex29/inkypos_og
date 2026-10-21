import { Text, View } from "react-native";
import { Card, CardContent } from "./ui/Card";

interface PortalSwitchCardProps {
  title: string;
  subtitle: string;
  badge: string;
  sections: string[];
  permissions: string[];
}

export function PortalSwitchCard({
  title,
  subtitle,
  badge,
  sections,
  permissions,
}: PortalSwitchCardProps) {
  return (
    <Card className="mb-4 border border-slate-200 dark:border-slate-800">
      <CardContent className="p-4">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-1">
            <Text className="text-lg font-bold text-slate-900 dark:text-white">
              {title}
            </Text>
            <Text className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {subtitle}
            </Text>
          </View>
          <View className="px-3 py-1 rounded-full bg-primary/10">
            <Text className="text-xs font-semibold text-primary">{badge}</Text>
          </View>
        </View>

        <View className="mb-3">
          <Text className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
            Portal areas
          </Text>
          <View className="flex-row flex-wrap">
            {sections.map((section) => (
              <View
                key={section}
                className="mr-2 mb-2 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1"
              >
                <Text className="text-xs text-slate-700 dark:text-slate-200">
                  {section}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View>
          <Text className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
            Core permissions
          </Text>
          {permissions.map((permission) => (
            <View key={permission} className="flex-row items-start mb-2">
              <Text className="text-sm text-primary mr-2">•</Text>
              <Text className="text-sm text-slate-600 dark:text-slate-300 flex-1">
                {permission}
              </Text>
            </View>
          ))}
        </View>
      </CardContent>
    </Card>
  );
}
