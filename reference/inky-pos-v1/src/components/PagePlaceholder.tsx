import { ScrollView, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, CardContent } from "./ui/Card";

interface PagePlaceholderProps {
  title: string;
  subtitle?: string;
}

export function PagePlaceholder({ title, subtitle }: PagePlaceholderProps) {
  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 96 }}>
        <Card className="border border-slate-200 dark:border-slate-800">
          <CardContent className="p-6">
            <Text className="text-3xl font-bold text-slate-900 dark:text-white mb-3">
              {title}
            </Text>
            <Text className="text-sm text-slate-500 dark:text-slate-400">
              {subtitle || "This module is being prepared for your role."}
            </Text>
          </CardContent>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
