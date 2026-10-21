// src/app/(app)/menu.tsx
import { useRouter } from "expo-router";
import { Lock, LogOut, RefreshCw, User } from "lucide-react-native";
import { useState } from "react";
import {
    Alert,
    Modal,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import { SyncManager } from "../../db/sync";
import { useAuthStore } from "../../store/useAuthStore";
import { useSyncStore } from "../../store/useSyncStore";
import { appMenuItems, canShowMenuItem } from "../../utils/appMenu";

export default function MenuScreen() {
  const router = useRouter();
  const { user, portalContext, lockScreen, logout } = useAuthStore();
  const { isOnline, isSyncing, lastSyncTime, syncPendingCount, loadSyncStats } =
    useSyncStore();

  // Custom dialog toggles
  const [isShiftModalVisible, setIsShiftModalVisible] = useState(false);
  const [isQuoteModalVisible, setIsQuoteModalVisible] = useState(false);

  // Trigger manual sync
  const handleForceSync = async () => {
    if (!isOnline) {
      Alert.alert(
        "Offline Mode",
        "Cannot sync right now. Please check your internet connectivity.",
      );
      return;
    }
    Alert.alert("Cloud Sync", "Starting synchronization with Supabase...", [], {
      cancelable: false,
    });
    const success = await SyncManager.runFullSync();
    if (success) {
      Alert.alert(
        "Sync Completed",
        "All local offline logs uploaded and cloud schemas updated.",
      );
    } else {
      Alert.alert(
        "Sync Interrupted",
        "Database sync interrupted. Will auto-retry when connection improves.",
      );
    }
  };

  const handleTerminalLock = () => {
    lockScreen();
    router.replace("/(auth)/pin");
  };

  const handleSignOut = () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to exit the InkyPOS terminal?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Exit",
          style: "destructive",
          onPress: () => {
            logout();
            router.replace("/(auth)/login");
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* Cashier Session Card */}
        <Card className="mb-6 bg-primary border-0 shadow-lg">
          <CardContent className="p-5 flex-row items-center">
            <View className="w-12 h-12 bg-white/10 rounded-full items-center justify-center mr-4">
              <User color="#FFD700" size={24} />
            </View>
            <View className="flex-1">
              <Text className="text-base font-extrabold text-white">
                {user?.full_name}
              </Text>
              <Text className="text-xs text-blue-200 mt-0.5">
                {user?.email}
              </Text>
              <View className="flex-row flex-wrap mt-2">
                <Badge
                  label={user?.role?.toUpperCase() || "OPERATOR"}
                  variant="secondary"
                  className="mr-2"
                />
                {portalContext && (
                  <Badge label={portalContext.badge} variant="warning" />
                )}
              </View>
            </View>
          </CardContent>
        </Card>

        {/* Sync Panel Status */}
        <Card className="mb-6">
          <CardContent className="p-5">
            <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Cloud Synchronization
            </Text>

            <View className="flex-row justify-between items-center mb-4">
              <View>
                <Text className="text-sm font-bold text-slate-800 dark:text-white">
                  Supabase Cloud Ledger
                </Text>
                <Text className="text-xs text-slate-500 mt-0.5">
                  Last Sync:{" "}
                  {lastSyncTime ? lastSyncTime.substring(11, 16) : "Never"}
                </Text>
              </View>
              <Badge
                label={
                  isSyncing
                    ? "Syncing..."
                    : isOnline
                      ? "Online Synced"
                      : "Offline Mode"
                }
                variant={isOnline ? "success" : "warning"}
              />
            </View>

            <TouchableOpacity
              disabled={isSyncing}
              onPress={handleForceSync}
              className="bg-primary py-3 rounded-xl flex-row justify-center items-center space-x-2 active:opacity-85"
            >
              <RefreshCw color="#FFFFFF" size={16} />
              <Text className="text-xs font-bold text-white">
                {isSyncing
                  ? "Synchronizing..."
                  : `Sync Cloud Queue (${syncPendingCount} pending)`}
              </Text>
            </TouchableOpacity>
          </CardContent>
        </Card>

        {/* System Operations Grid */}
        <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5">
          System Options
        </Text>
        <View className="flex-row flex-wrap justify-between mb-6">
          {appMenuItems
            .filter((item) =>
              canShowMenuItem(
                item,
                portalContext?.portalType ?? "company",
                user?.role,
                portalContext?.allowedAppTabs ?? [],
              ),
            )
            .map((item) => {
              const Icon = item.icon;
              return (
                <TouchableOpacity
                  key={item.route}
                  onPress={() => {
                    router.push(`/(app)${item.route}` as any);
                  }}
                  className="w-full sm:w-[48%] bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-2xl mb-4 shadow-sm flex-row items-center space-x-3 active:opacity-75"
                >
                  <View className="w-8 h-8 rounded-lg bg-primary/10 items-center justify-center mr-2">
                    <Icon color="#0A2540" size={16} />
                  </View>
                  <Text className="text-xs font-bold text-slate-800 dark:text-slate-200 flex-1">
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
        </View>

        {/* Account Controls */}
        <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5">
          Access Controls
        </Text>
        <Card className="mb-6">
          <CardContent className="p-2">
            <TouchableOpacity
              onPress={handleTerminalLock}
              className="flex-row items-center justify-between p-3.5 border-b border-slate-100 last:border-b-0 active:opacity-75"
            >
              <View className="flex-row items-center space-x-3">
                <Lock color="#64748B" size={18} />
                <Text className="text-xs font-bold text-slate-700 ml-2">
                  Lock Active Terminal
                </Text>
              </View>
              <Text className="text-[10px] text-slate-400">PIN Screen</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSignOut}
              className="flex-row items-center justify-between p-3.5 active:opacity-75"
            >
              <View className="flex-row items-center space-x-3">
                <LogOut color="#EF4444" size={18} />
                <Text className="text-xs font-bold text-red-600 ml-2">
                  Exit POS Account
                </Text>
              </View>
              <Text className="text-[10px] text-slate-400">Sign Out</Text>
            </TouchableOpacity>
          </CardContent>
        </Card>
      </ScrollView>

      {/* MODAL dialog: Shift registry */}
      <Modal visible={isShiftModalVisible} transparent animationType="slide">
        <View className="flex-1 bg-black/55 justify-center p-6">
          <View className="bg-white rounded-3xl p-6">
            <Text className="text-base font-bold text-slate-800 mb-2">
              Cashier Shift Register
            </Text>
            <Text className="text-xs text-slate-400 mb-4">
              Track float registers and collections.
            </Text>

            <Card className="p-4 bg-slate-50 border border-slate-100 mb-4">
              <View className="flex-row justify-between mb-2">
                <Text className="text-xs text-slate-500">
                  Active Shift Cashier:
                </Text>
                <Text className="text-xs font-bold text-slate-800">
                  {user?.full_name}
                </Text>
              </View>
              <View className="flex-row justify-between mb-2">
                <Text className="text-xs text-slate-500">
                  Opening Cash Float:
                </Text>
                <Text className="text-xs font-bold text-slate-800">
                  $50.00 USD
                </Text>
              </View>
              <View className="flex-row justify-between mb-2">
                <Text className="text-xs text-slate-500">
                  Register Sales Today:
                </Text>
                <Text className="text-xs font-bold text-emerald-600">
                  $0.00 USD
                </Text>
              </View>
            </Card>

            <View className="flex-row flex-wrap gap-3">
              <Button
                label="End Cashier Shift"
                variant="danger"
                className="w-full sm:w-[48%]"
                onPress={() => {
                  Alert.alert(
                    "Z-Report Printed",
                    "Shift Z-Report printed successfully. Cash drawer drawer lock released.",
                  );
                  setIsShiftModalVisible(false);
                }}
              />
              <Button
                label="Close"
                variant="outline"
                className="w-full sm:w-[48%]"
                onPress={() => setIsShiftModalVisible(false)}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL dialog: Quotations */}
      <Modal visible={isQuoteModalVisible} transparent animationType="slide">
        <View className="flex-1 bg-black/55 justify-center p-6">
          <View className="bg-white rounded-3xl p-6">
            <Text className="text-base font-bold text-slate-800 mb-2">
              Quotations Builder
            </Text>
            <Text className="text-xs text-slate-400 mb-4">
              Pro-forma tax invoices & validation periods.
            </Text>

            <ScrollView className="max-h-[200px] mb-4">
              <View className="bg-slate-50 p-3 rounded-xl border border-slate-100 mb-2 flex-row justify-between items-center">
                <View>
                  <Text className="text-xs font-bold text-slate-800">
                    QT-88901 - Sally Mutasa
                  </Text>
                  <Text className="text-[10px] text-slate-400">
                    Total: $230.50 USD • Status: Sent
                  </Text>
                </View>
                <Badge label="Valid" variant="success" />
              </View>
              <View className="bg-slate-50 p-3 rounded-xl border border-slate-100 mb-2 flex-row justify-between items-center">
                <View>
                  <Text className="text-xs font-bold text-slate-800">
                    QT-88902 - John Moyo
                  </Text>
                  <Text className="text-[10px] text-slate-400">
                    Total: $75.00 USD • Status: Draft
                  </Text>
                </View>
                <Badge label="Draft" variant="outline" />
              </View>
            </ScrollView>

            <View className="flex-row flex-wrap gap-3">
              <Button
                label="New Quote"
                variant="primary"
                className="w-full sm:w-[48%]"
                onPress={() => {
                  Alert.alert(
                    "Action",
                    "Launch POS cart builder to compile items.",
                  );
                  setIsQuoteModalVisible(false);
                }}
              />
              <Button
                label="Close"
                variant="outline"
                className="w-full sm:w-[48%]"
                onPress={() => setIsQuoteModalVisible(false)}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
