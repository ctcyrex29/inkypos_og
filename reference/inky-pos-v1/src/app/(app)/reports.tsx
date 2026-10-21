// src/app/(app)/reports.tsx
import * as Print from "expo-print";
import { useFocusEffect, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import {
    ArrowLeft,
    BarChart2,
    Download,
    FileText,
    ShieldAlert,
    TrendingUp,
} from "lucide-react-native";
import React, { useState } from "react";
import {
    Alert,
    Platform,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Badge } from "../../components/ui/Badge";
import { Card, CardContent } from "../../components/ui/Card";
import { Table } from "../../components/ui/Table";
import { getDatabase } from "../../db/sqlite";
import { useSettingsStore } from "../../store/useSettingsStore";
import { usePortalRouteGuard } from "../../utils/portalGuard";

interface SalesReportLine {
  sales_number: string;
  payment_method: string;
  total_amount: number;
  tax_amount: number;
  created_at: string;
}

interface AuditLogLine {
  action: string;
  description: string;
  created_at: string;
}

export default function ReportsScreen() {
  usePortalRouteGuard(["reports"]);

  const router = useRouter();
  const dbPromise = getDatabase();
  const { zigExchangeRate, business } = useSettingsStore();

  const [activeTab, setActiveTab] = useState<"sales" | "tax" | "audit">(
    "sales",
  );
  const [salesReport, setSalesReport] = useState<SalesReportLine[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogLine[]>([]);
  const [methodBreakdown, setMethodBreakdown] = useState<{
    [key: string]: number;
  }>({});

  const loadReports = async () => {
    try {
      const db = await dbPromise;

      // 1. Fetch Sales Log
      const sales = await db.getAllAsync<SalesReportLine>(
        "SELECT sales_number, payment_method, total_amount, tax_amount, created_at FROM sales ORDER BY created_at DESC LIMIT 50;",
      );
      setSalesReport(sales);

      // 2. Fetch Audit Logs
      const audits = await db.getAllAsync<AuditLogLine>(
        "SELECT action, description, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 30;",
      );
      setAuditLogs(audits);

      // 3. Method Breakdown calculations
      const breakdownRes = await db.getAllAsync<{
        payment_method: string;
        total: number;
      }>(
        "SELECT payment_method, SUM(total_amount) as total FROM sales WHERE status = 'completed' GROUP BY payment_method;",
      );
      const breakdownObj: { [key: string]: number } = {};
      breakdownRes.forEach((item) => {
        breakdownObj[item.payment_method] = item.total;
      });
      setMethodBreakdown(breakdownObj);
    } catch (err) {
      console.error("Failed to load analytical reports:", err);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      loadReports();
    }, []),
  );

  // PDF Export Engine (using HTML layout and expo-print)
  const handleExportPDF = async () => {
    const today = new Date().toLocaleDateString();

    // Synthesize HTML document
    const htmlContent = `
      <html>
        <head>
          <style>
            body { font-family: 'Helvetica', sans-serif; padding: 20px; color: #333; }
            h1 { color: #0A2540; margin-bottom: 5px; }
            .header-info { font-size: 11px; color: #666; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th { background-color: #0A2540; color: #FFF; font-size: 11px; text-transform: uppercase; padding: 8px; text-align: left; }
            td { border-bottom: 1px style solid #E2E8F0; font-size: 11px; padding: 8px; }
            .total-row { font-weight: bold; background-color: #F8FAFC; }
            .footer { margin-top: 30px; font-size: 10px; color: #999; text-align: center; border-top: 1px dashed #CCC; padding-top: 10px; }
          </style>
        </head>
        <body>
          <h1>InkyPOS Audit & Sales Report</h1>
          <div class="header-info">
            <strong>Business:</strong> ${
              business?.name || "Harare Mega Mart"
            }<br/>
            <strong>Date:</strong> ${today}<br/>
            <strong>ZiG Conversion Rate:</strong> $1.00 = ${zigExchangeRate.toFixed(
              2,
            )} ZiG
          </div>
          
          <h3>Sales Transactions Log</h3>
          <table>
            <thead>
              <tr>
                <th>Receipt ID</th>
                <th>Payment Mode</th>
                <th>Tax (USD)</th>
                <th>Total (USD)</th>
                <th>Total (ZiG)</th>
              </tr>
            </thead>
            <tbody>
              ${salesReport
                .map(
                  (item) => `
                <tr>
                  <td>${item.sales_number}</td>
                  <td>${item.payment_method}</td>
                  <td>$${item.tax_amount.toFixed(2)}</td>
                  <td>$${item.total_amount.toFixed(2)}</td>
                  <td>${(item.total_amount * zigExchangeRate).toFixed(2)}</td>
                </tr>
              `,
                )
                .join("")}
              <tr class="total-row">
                <td colspan="3">Grand Total</td>
                <td>$${salesReport
                  .reduce((acc, i) => acc + i.total_amount, 0)
                  .toFixed(2)}</td>
                <td>${(
                  salesReport.reduce((acc, i) => acc + i.total_amount, 0) *
                  zigExchangeRate
                ).toFixed(2)} ZiG</td>
              </tr>
            </tbody>
          </table>
          
          <div class="footer">
            Generated by InkyPOS Terminal. Zimbabwe Smart Bookkeeping.
          </div>
        </body>
      </html>
    `;

    try {
      if (Platform.OS === "web") {
        const blob = new Blob([htmlContent], {
          type: "text/html;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "inkypos-sales-report.html";
        link.click();
        URL.revokeObjectURL(url);
        return;
      }

      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri);
    } catch (err) {
      console.error("PDF export failed:", err);
      Alert.alert("Export Failed", "Could not compile PDF report.");
    }
  };

  // CSV Export Engine
  const handleExportCSV = async () => {
    let csvString =
      "Receipt Number,Payment Method,Tax Amount (USD),Total Amount (USD),Created At\n";

    salesReport.forEach((line) => {
      csvString += `"${line.sales_number}","${line.payment_method}",${line.tax_amount},${line.total_amount},"${line.created_at}"\n`;
    });

    try {
      if (Platform.OS === "web") {
        const blob = new Blob([csvString], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "inkypos-sales-report.csv";
        link.click();
        URL.revokeObjectURL(url);
        return;
      }

      const htmlContent = `<html><body><pre>${csvString}</pre></body></html>`;
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri);
    } catch (err) {
      console.error("CSV export failed:", err);
      Alert.alert("Export Failed", "Could not export report data.");
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <View className="bg-primary px-4 py-3.5 flex-row items-center justify-between">
        <View className="flex-row items-center space-x-3">
          <TouchableOpacity
            onPress={() => router.back()}
            className="p-1 active:opacity-75 mr-2"
          >
            <ArrowLeft color="#FFFFFF" size={20} />
          </TouchableOpacity>
          <Text className="text-base font-extrabold text-white">
            Business Reports
          </Text>
        </View>
        <View className="flex-row space-x-2">
          <TouchableOpacity
            onPress={handleExportPDF}
            className="p-2 bg-white/10 rounded-lg mr-2"
          >
            <FileText color="#FFFFFF" size={16} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleExportCSV}
            className="p-2 bg-white/10 rounded-lg"
          >
            <Download color="#FFFFFF" size={16} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs */}
      <View className="flex-row bg-white border-b border-slate-200">
        {[
          { key: "sales", label: "Sales Log", icon: TrendingUp },
          { key: "tax", label: "VAT Report", icon: BarChart2 },
          { key: "audit", label: "Audit Log", icon: ShieldAlert },
        ].map((tab) => {
          const isSelected = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key as any)}
              className={`flex-1 py-3 items-center flex-row justify-center space-x-2 border-b-2 ${
                isSelected ? "border-primary bg-slate-50" : "border-transparent"
              }`}
            >
              <Icon color={isSelected ? "#0A2540" : "#94A3B8"} size={15} />
              <Text
                className={`text-xs font-bold ${
                  isSelected ? "text-primary" : "text-slate-500"
                }`}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Main Tab Panels */}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
        className="flex-1"
      >
        {/* TAB 1: Sales Analysis */}
        {activeTab === "sales" && (
          <View className="space-y-4">
            {/* Sales Mode breakdown cards */}
            <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Revenue by Payment Mode
            </Text>
            <View className="flex-row flex-wrap justify-between mb-4">
              {["CASH", "ECOCASH", "CARD", "ZIPIT"].map((method) => {
                const total = methodBreakdown[method] || 0.0;
                return (
                  <Card key={method} className="w-full sm:w-[48%] mb-3">
                    <CardContent className="p-3.5">
                      <Text className="text-[10px] font-bold text-slate-400 uppercase">
                        {method} Mode
                      </Text>
                      <Text className="text-base font-extrabold text-slate-800 mt-1">
                        ${total.toFixed(2)}
                      </Text>
                      <Text className="text-[9px] text-slate-400">
                        {(total * zigExchangeRate).toFixed(0)} ZiG equivalent
                      </Text>
                    </CardContent>
                  </Card>
                );
              })}
            </View>

            {/* Sales Table log */}
            <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Recent Sales Journal
            </Text>
            <Table
              columns={[
                { key: "ref", title: "Receipt ID", flex: 1.2 },
                { key: "mode", title: "Method", flex: 1 },
                { key: "total", title: "Total (USD)", flex: 1, align: "right" },
              ]}
              data={salesReport.map((line) => ({
                id: line.sales_number,
                ref: line.sales_number,
                mode: (
                  <Badge
                    label={line.payment_method}
                    variant="default"
                    className="px-1.5 py-0.5"
                  />
                ),
                total: `$${line.total_amount.toFixed(2)}`,
              }))}
            />
          </View>
        )}

        {/* TAB 2: ZIMRA VAT Taxes Statement */}
        {activeTab === "tax" && (
          <View className="space-y-4">
            <Card className="mb-4 bg-primary border-0 p-5 shadow">
              <Text className="text-xs font-bold text-blue-200 uppercase tracking-widest">
                VAT Collected Summary
              </Text>
              <Text className="text-2xl font-extrabold text-white mt-1">
                $
                {salesReport
                  .reduce((acc, i) => acc + i.tax_amount, 0)
                  .toFixed(2)}{" "}
                USD
              </Text>
              <Text className="text-xs text-blue-200 mt-1">
                Representing{" "}
                {(
                  salesReport.reduce((acc, i) => acc + i.tax_amount, 0) *
                  zigExchangeRate
                ).toLocaleString("en-US", { maximumFractionDigits: 2 })}{" "}
                ZiG total
              </Text>
            </Card>

            <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              VAT Liability Register
            </Text>
            <Table
              columns={[
                { key: "ref", title: "Receipt ID", flex: 1 },
                { key: "salesVal", title: "Gross Sale", flex: 1 },
                { key: "taxVal", title: "VAT (15%)", flex: 1, align: "right" },
              ]}
              data={salesReport.map((line) => ({
                id: line.sales_number,
                ref: line.sales_number,
                salesVal: `$${line.total_amount.toFixed(2)}`,
                taxVal: `$${line.tax_amount.toFixed(2)}`,
              }))}
            />
          </View>
        )}

        {/* TAB 3: Audit Trails */}
        {activeTab === "audit" && (
          <View className="space-y-4">
            <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Audit Logs
            </Text>
            <Table
              columns={[
                { key: "time", title: "Time", flex: 1.2 },
                { key: "action", title: "Action Event", flex: 1.5 },
                { key: "desc", title: "Description Details", flex: 2 },
              ]}
              data={auditLogs.map((log, index) => ({
                id: index,
                time: log.created_at.substring(11, 19),
                action: (
                  <Badge
                    label={log.action}
                    variant={
                      log.action === "VOID_SALE" || log.action === "REFUND"
                        ? "destructive"
                        : "outline"
                    }
                    className="px-1 py-0.5"
                  />
                ),
                desc: log.description,
              }))}
              emptyMessage="No audit log entries found."
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
