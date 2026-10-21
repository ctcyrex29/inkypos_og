// src/app/(app)/index.tsx
import { useFocusEffect } from "expo-router";
import {
    AlertTriangle,
    ArrowDownRight,
    ArrowUpRight,
    DollarSign,
    Package,
    RefreshCw,
    TrendingUp,
    Users,
} from "lucide-react-native";
import React, { useState } from "react";
import {
    Image,
    RefreshControl,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Badge } from "../../components/ui/Badge";
import { Card, CardContent } from "../../components/ui/Card";
import { getDatabase } from "../../db/sqlite";
import { useAuthStore } from "../../store/useAuthStore";
import { useSettingsStore } from "../../store/useSettingsStore";
import { useSyncStore } from "../../store/useSyncStore";

interface DashboardStats {
  totalProducts: number;
  totalCustomers: number;
  salesToday: number;
  revenueToday: number;
  grossProfit: number;
  lowStockCount: number;
  debtorsTotal: number;
  creditorsTotal: number;
  bestSellers: { name: string; quantity: number; revenue: number }[];
}

export default function DashboardScreen() {
  const { business, zigExchangeRate } = useSettingsStore();
  const { isOnline, syncPendingCount, isSyncing } = useSyncStore();
  const { portalContext } = useAuthStore();

  const [stats, setStats] = useState<DashboardStats>({
    totalProducts: 0,
    totalCustomers: 0,
    salesToday: 0,
    revenueToday: 0,
    grossProfit: 0,
    lowStockCount: 0,
    debtorsTotal: 0,
    creditorsTotal: 0,
    bestSellers: [],
  });

  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardStats = async () => {
    try {
      const db = await getDatabase();

      // 1. Total Products
      const prodRes = await db.getAllAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM products WHERE deleted = 0;",
      );
      const totalProducts = prodRes[0]?.count || 0;

      // 2. Total Customers
      const custRes = await db.getAllAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM customers WHERE deleted = 0;",
      );
      const totalCustomers = custRes[0]?.count || 0;

      // 3. Today's Sales Count & Revenue
      const todayDateStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      const salesRes = await db.getAllAsync<{ count: number; revenue: number }>(
        `SELECT COUNT(*) as count, SUM(total_amount) as revenue 
         FROM sales 
         WHERE status = 'completed' AND created_at LIKE ?;`,
        [`${todayDateStr}%`],
      );
      const salesToday = salesRes[0]?.count || 0;
      const revenueToday = salesRes[0]?.revenue || 0;

      // 4. Gross Profit (Revenue - Cost of Goods Sold)
      const profitRes = await db.getAllAsync<{ profit: number }>(
        `SELECT SUM(si.total_price - (si.quantity * si.cost_price)) as profit 
         FROM sale_items si 
         JOIN sales s ON si.sale_id = s.id 
         WHERE s.status = 'completed';`,
      );
      const grossProfit = profitRes[0]?.profit || 0;

      // 5. Low Stock Count
      const stockRes = await db.getAllAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM products WHERE stock_quantity <= min_stock_level AND deleted = 0;",
      );
      const lowStockCount = stockRes[0]?.count || 0;

      // 6. Outstanding Debtors (Customer balances owed)
      const debtorsRes = await db.getAllAsync<{ total: number }>(
        "SELECT SUM(balance) as total FROM customers WHERE balance > 0 AND deleted = 0;",
      );
      const debtorsTotal = debtorsRes[0]?.total || 0;

      // 7. Outstanding Creditors (Supplier balances owed)
      const creditorsRes = await db.getAllAsync<{ total: number }>(
        "SELECT SUM(balance) as total FROM suppliers WHERE balance > 0 AND deleted = 0;",
      );
      const creditorsTotal = creditorsRes[0]?.total || 0;

      // 8. Mock/Query best sellers
      const bestSellersRes = await db.getAllAsync<{
        name: string;
        quantity: number;
        revenue: number;
      }>(
        `SELECT p.name, SUM(si.quantity) as quantity, SUM(si.total_price) as revenue
         FROM sale_items si
         JOIN products p ON si.product_id = p.id
         GROUP BY si.product_id
         ORDER BY quantity DESC
         LIMIT 3;`,
      );

      setStats({
        totalProducts,
        totalCustomers,
        salesToday,
        revenueToday,
        grossProfit,
        lowStockCount,
        debtorsTotal,
        creditorsTotal,
        bestSellers: bestSellersRes,
      });
    } catch (err) {
      console.error("Failed to load dashboard statistics:", err);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      fetchDashboardStats();
    }, []),
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardStats();
    setRefreshing(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={["#0A2540"]}
          />
        }
      >
        {/* Sync Status Banner */}
        {syncPendingCount > 0 && (
          <View className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-xl p-3.5 flex-row justify-between items-center mb-4">
            <View className="flex-row items-center">
              <AlertTriangle color="#B39700" size={18} />
              <Text className="text-xs font-semibold text-amber-800 dark:text-amber-300 ml-2">
                {syncPendingCount} transaction{syncPendingCount > 1 ? "s" : ""}{" "}
                waiting to sync cloud.
              </Text>
            </View>
            <Badge
              label={isOnline ? "Online" : "Offline"}
              variant={isOnline ? "success" : "warning"}
            />
          </View>
        )}

        {/* Business Header info */}
        <View className="flex-row justify-between items-center mb-6">
          <View className="flex-row items-center">
            <Image
              source={require("../../assets/inkypos-logo.png")}
              style={{ width: 48, height: 48, resizeMode: "contain" }}
            />
            <View className="ml-3">
              <Text className="text-xl font-bold text-slate-800 dark:text-white">
                {business?.name || "InkyPOS Terminal"}
              </Text>
              <Text className="text-xs text-slate-500">
                Exchange Rate: $1.00 = {zigExchangeRate.toFixed(2)} ZiG
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={fetchDashboardStats}
            className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl active:opacity-75"
          >
            <RefreshCw color="#0A2540" size={16} />
          </TouchableOpacity>
        </View>

        {portalContext && (
          <View className="mb-4 rounded-2xl border border-primary/20 bg-primary/5 p-3">
            <Text className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
              {portalContext.badge}
            </Text>
            <Text className="text-sm text-slate-700 dark:text-slate-300 mt-1">
              {portalContext.title} • {portalContext.subtitle}
            </Text>
          </View>
        )}

        {/* KPI Grid */}
        <View className="flex-row flex-wrap justify-between mb-4">
          <Card className="w-full sm:w-[48%] mb-4 border-l-4 border-l-primary">
            <CardContent className="p-4 flex-row items-center">
              <View className="w-8 h-8 rounded-lg bg-primary/10 items-center justify-center mr-3">
                <DollarSign color="#0A2540" size={18} />
              </View>
              <View className="flex-1">
                <Text className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                  Revenue (Today)
                </Text>
                <Text className="text-lg font-extrabold text-slate-800 dark:text-white mt-0.5">
                  ${(stats.revenueToday || 0).toFixed(2)}
                </Text>
              </View>
            </CardContent>
          </Card>

          <Card className="w-full sm:w-[48%] mb-4 border-l-4 border-l-success">
            <CardContent className="p-4 flex-row items-center">
              <View className="w-8 h-8 rounded-lg bg-success/15 items-center justify-center mr-3">
                <TrendingUp color="#00C853" size={18} />
              </View>
              <View className="flex-1">
                <Text className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                  Gross Profit
                </Text>
                <Text className="text-lg font-extrabold text-success mt-0.5">
                  ${(stats.grossProfit || 0).toFixed(2)}
                </Text>
              </View>
            </CardContent>
          </Card>

          <Card className="w-full sm:w-[48%] mb-4">
            <CardContent className="p-4 flex-row items-center">
              <View className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 items-center justify-center mr-3">
                <Package color="#64748B" size={18} />
              </View>
              <View className="flex-1">
                <Text className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                  Total Products
                </Text>
                <Text className="text-lg font-extrabold text-slate-800 dark:text-white mt-0.5">
                  {stats.totalProducts}
                </Text>
              </View>
            </CardContent>
          </Card>

          <Card className="w-full sm:w-[48%] mb-4">
            <CardContent className="p-4 flex-row items-center">
              <View className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 items-center justify-center mr-3">
                <Users color="#64748B" size={18} />
              </View>
              <View className="flex-1">
                <Text className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                  Total Customers
                </Text>
                <Text className="text-lg font-extrabold text-slate-800 dark:text-white mt-0.5">
                  {stats.totalCustomers}
                </Text>
              </View>
            </CardContent>
          </Card>
        </View>

        {/* Low Stock Banner Alert */}
        {stats.lowStockCount > 0 && (
          <Card className="border border-red-200 bg-red-50/50 mb-6 rounded-2xl">
            <CardContent className="p-4 flex-row justify-between items-center">
              <View className="flex-row items-center">
                <View className="w-8 h-8 rounded-lg bg-red-100 items-center justify-center mr-3">
                  <AlertTriangle color="#DC2626" size={18} />
                </View>
                <View>
                  <Text className="text-sm font-bold text-red-900">
                    Low Stock Warning
                  </Text>
                  <Text className="text-xs text-red-600">
                    {stats.lowStockCount} product(s) are running out.
                  </Text>
                </View>
              </View>
              <Badge label="Needs Action" variant="destructive" />
            </CardContent>
          </Card>
        )}

        {/* Ledger Summaries */}
        <View className="flex-row flex-wrap justify-between mb-6">
          <Card className="w-full sm:w-[48%] bg-white border border-slate-100 shadow-sm">
            <CardContent className="p-4">
              <View className="flex-row justify-between items-center mb-1">
                <Text className="text-[10px] font-semibold text-slate-400 uppercase">
                  Debtors Ledger
                </Text>
                <ArrowUpRight color="#DC2626" size={14} />
              </View>
              <Text className="text-base font-extrabold text-slate-800 dark:text-white">
                ${(stats.debtorsTotal || 0).toFixed(2)}
              </Text>
              <Text className="text-[9px] text-slate-400 mt-1">
                Clients owe you
              </Text>
            </CardContent>
          </Card>

          <Card className="w-full sm:w-[48%] bg-white border border-slate-100 shadow-sm">
            <CardContent className="p-4">
              <View className="flex-row justify-between items-center mb-1">
                <Text className="text-[10px] font-semibold text-slate-400 uppercase">
                  Creditors Ledger
                </Text>
                <ArrowDownRight color="#00C853" size={14} />
              </View>
              <Text className="text-base font-extrabold text-slate-800 dark:text-white">
                ${(stats.creditorsTotal || 0).toFixed(2)}
              </Text>
              <Text className="text-[9px] text-slate-400 mt-1">
                You owe suppliers
              </Text>
            </CardContent>
          </Card>
        </View>

        {/* Mock Charts Section: Sales trend */}
        <Card className="mb-6">
          <CardContent className="p-5">
            <Text className="text-sm font-bold text-slate-800 dark:text-white mb-3">
              Weekly Revenue Trend
            </Text>

            {/* Visual Custom Chart Bars */}
            <View className="flex-row justify-between items-end h-32 pt-4 border-b border-slate-100">
              {[
                { day: "Mon", val: 45, label: "$220" },
                { day: "Tue", val: 70, label: "$350" },
                { day: "Wed", val: 55, label: "$280" },
                { day: "Thu", val: 90, label: "$450" },
                { day: "Fri", val: 120, label: "$600" },
                { day: "Sat", val: 140, label: "$700" },
                {
                  day: "Sun",
                  val:
                    stats.revenueToday > 0
                      ? Math.min(140, (stats.revenueToday / 700) * 140)
                      : 20,
                  label: `$${stats.revenueToday.toFixed(0)}`,
                },
              ].map((bar, i) => (
                <View key={i} className="items-center w-[12%] min-w-[40px]">
                  <Text className="text-[8px] text-slate-400 mb-1">
                    {bar.label}
                  </Text>
                  <View
                    style={{ height: bar.val }}
                    className={`w-full rounded-t-md ${
                      i === 6 ? "bg-accent" : "bg-primary/80"
                    }`}
                  />
                  <Text className="text-[10px] font-medium text-slate-500 mt-2">
                    {bar.day}
                  </Text>
                </View>
              ))}
            </View>
          </CardContent>
        </Card>

        {/* Best Selling Products */}
        <Card className="mb-6">
          <CardContent className="p-5">
            <Text className="text-sm font-bold text-slate-800 dark:text-white mb-3">
              Best Selling Products
            </Text>

            {stats.bestSellers.length === 0 ? (
              <Text className="text-xs text-slate-400 text-center py-4">
                No sales recorded yet.
              </Text>
            ) : (
              stats.bestSellers.map((item, index) => (
                <View
                  key={index}
                  className="flex-row justify-between items-center py-2.5 border-b border-slate-100 last:border-b-0"
                >
                  <View className="flex-row items-center flex-1 pr-4">
                    <Text className="text-xs font-bold text-slate-400 mr-3">
                      #{index + 1}
                    </Text>
                    <Text
                      className="text-xs font-semibold text-slate-700 dark:text-slate-200"
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-xs font-bold text-slate-800 dark:text-slate-100">
                      {item.quantity} sold
                    </Text>
                    <Text className="text-[10px] text-slate-400">
                      ${item.revenue.toFixed(2)} revenue
                    </Text>
                  </View>
                </View>
              ))
            )}
          </CardContent>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
