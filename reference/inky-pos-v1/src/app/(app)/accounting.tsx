// src/app/(app)/accounting.tsx
import { useFocusEffect } from "expo-router";
import { BookOpen, Receipt, TrendingUp, Users } from "lucide-react-native";
import React, { useState } from "react";
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
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Table } from "../../components/ui/Table";
import { Customer, Expense, Supplier } from "../../db/schema";
import { generateUUID, getDatabase } from "../../db/sqlite";
import { useAuthStore } from "../../store/useAuthStore";
import { useSettingsStore } from "../../store/useSettingsStore";
import { usePortalRouteGuard } from "../../utils/portalGuard";

interface CashBookEntry {
  id: string;
  type: "DEBIT" | "CREDIT";
  ref: string;
  description: string;
  amount: number;
  date: string;
}

export default function AccountingScreen() {
  usePortalRouteGuard(["accounting"]);

  const dbPromise = getDatabase();
  const { user } = useAuthStore();
  const { zigExchangeRate } = useSettingsStore();
  const isOperator = user?.role === "operator"; // Operators cannot access bookkeeping

  // Tabs
  const [activeTab, setActiveTab] = useState<
    "cashbook" | "expenses" | "debtors_creditors" | "statements"
  >("cashbook");

  // Lists
  const [cashbook, setCashbook] = useState<CashBookEntry[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [debtors, setDebtors] = useState<Customer[]>([]);
  const [creditors, setSupplierCreditors] = useState<Supplier[]>([]);

  // Expense form
  const [expAmount, setExpAmount] = useState("");
  const [expCategory, setExpCategory] = useState<
    | "RENT"
    | "ELECTRICITY"
    | "WATER"
    | "INTERNET"
    | "FUEL"
    | "SALARIES"
    | "AIRTIME"
    | "MISCELLANEOUS"
  >("MISCELLANEOUS");
  const [expDesc, setExpDesc] = useState("");
  const [expPayment, setExpPayment] = useState("CASH");

  // Debtor / Creditor repayment form
  const [isRepayModalVisible, setIsRepayModalVisible] = useState(false);
  const [repayTarget, setRepayTarget] = useState<{
    type: "DEBTOR" | "CREDITOR";
    id: string;
    name: string;
  } | null>(null);
  const [repayAmount, setRepayAmount] = useState("");
  const [repayMethod, setRepayMethod] = useState("CASH");

  // Statements
  const [pnl, setPnl] = useState({
    revenue: 0,
    cogs: 0,
    expenses: 0,
    netProfit: 0,
  });
  const [balanceSheet, setBalanceSheet] = useState({
    assets: 0,
    liabilities: 0,
    equity: 0,
  });

  // Load accounting data
  const loadAccountingData = async () => {
    if (isOperator) return;
    try {
      const db = await dbPromise;

      // 1. Fetch Expenses
      const expList = await db.getAllAsync<Expense>(
        "SELECT * FROM expenses WHERE deleted = 0 ORDER BY created_at DESC;",
      );
      setExpenses(expList);

      // 2. Fetch Debtors (Customers with positive balance)
      const debtList = await db.getAllAsync<Customer>(
        "SELECT * FROM customers WHERE balance > 0 AND deleted = 0;",
      );
      setDebtors(debtList);

      // 3. Fetch Creditors (Suppliers with positive balance)
      const credList = await db.getAllAsync<Supplier>(
        "SELECT * FROM suppliers WHERE balance > 0 AND deleted = 0;",
      );
      setSupplierCreditors(credList);

      // 4. Load Cash Book (Merge Sales receipts, repayments, expense disbursements)
      // Sales represent Debit (+ Cash), Expenses represent Credit (- Cash)
      const salesQuery = `
        SELECT id, 'DEBIT' as type, sales_number as ref, 'POS Sales Receipt' as description, total_amount as amount, created_at as date 
        FROM sales 
        WHERE status = 'completed'
      `;
      const expenseQuery = `
        SELECT id, 'CREDIT' as type, category as ref, description, amount, created_at as date 
        FROM expenses 
        WHERE deleted = 0
      `;
      const repaymentQuery = `
        SELECT id, 'DEBIT' as type, reference_number as ref, 'Client Debt Repayment' as description, amount, created_at as date
        FROM payments
        WHERE type = 'DEBTOR_REPAYMENT' OR type = 'SALE'
      `;

      const mergedCashBook = await db.getAllAsync<any>(
        `SELECT * FROM (${salesQuery} UNION ${expenseQuery}) ORDER BY date DESC LIMIT 30;`,
      );
      setCashbook(mergedCashBook);

      // 5. Generate Profit and Loss (USD base)
      const salesTot = await db.getAllAsync<{ sum: number }>(
        "SELECT SUM(total_amount) as sum FROM sales WHERE status = 'completed';",
      );
      const cogsTot = await db.getAllAsync<{ sum: number }>(
        `SELECT SUM(si.quantity * si.cost_price) as sum 
         FROM sale_items si 
         JOIN sales s ON si.sale_id = s.id 
         WHERE s.status = 'completed';`,
      );
      const expTot = await db.getAllAsync<{ sum: number }>(
        "SELECT SUM(amount) as sum FROM expenses WHERE deleted = 0;",
      );

      const revenue = salesTot[0]?.sum || 0;
      const cogs = cogsTot[0]?.sum || 0;
      const totalExp = expTot[0]?.sum || 0;
      setPnl({
        revenue,
        cogs,
        expenses: totalExp,
        netProfit: revenue - cogs - totalExp,
      });

      // 6. Generate Balance Sheet (USD base)
      // Assets = Cash Drawer (approx) + Inventory Value + Accounts Receivable
      const inventoryVal = await db.getAllAsync<{ sum: number }>(
        "SELECT SUM(stock_quantity * cost_price) as sum FROM products WHERE deleted = 0;",
      );
      const cashDebit = await db.getAllAsync<{ sum: number }>(`
        SELECT SUM(amount) as sum FROM (
          SELECT total_amount as amount FROM sales WHERE status = 'completed'
        );
      `);
      const cashCredit = await db.getAllAsync<{ sum: number }>(
        "SELECT SUM(amount) as sum FROM expenses WHERE deleted = 0;",
      );

      const currentCash = (cashDebit[0]?.sum || 0) - (cashCredit[0]?.sum || 0);
      const stockAssets = inventoryVal[0]?.sum || 0;
      const debtorsSum = debtList.reduce((acc, c) => acc + c.balance, 0);
      const totalAssets = currentCash + stockAssets + debtorsSum;

      // Liabilities = Accounts Payable
      const creditorsSum = credList.reduce((acc, s) => acc + s.balance, 0);
      const totalLiabilities = creditorsSum;

      // Equity = Assets - Liabilities
      setBalanceSheet({
        assets: totalAssets,
        liabilities: totalLiabilities,
        equity: totalAssets - totalLiabilities,
      });
    } catch (err) {
      console.error("Failed to load accounting data:", err);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      loadAccountingData();
    }, []),
  );

  // Add Expense Handler
  const handleAddExpense = async () => {
    const amt = parseFloat(expAmount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert(
        "Validation Error",
        "Expense amount must be a positive number.",
      );
      return;
    }

    try {
      const db = await dbPromise;
      const now = new Date().toISOString();
      const expId = generateUUID();

      await db.runAsync(
        `INSERT INTO expenses (id, business_id, amount, currency, exchange_rate, category, description, payment_method, user_id, sync_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          expId,
          user?.business_id || "default_biz",
          amt,
          "USD",
          1.0,
          expCategory,
          expDesc || `${expCategory} payment`,
          expPayment,
          user?.id || "system",
          "pending_insert",
          now,
          now,
        ],
      );

      setExpAmount("");
      setExpDesc("");
      Alert.alert("Success", "Expense recorded successfully.");
      loadAccountingData();
      setActiveTab("cashbook");
    } catch (err) {
      console.error("Failed to log expense:", err);
      Alert.alert("Error", "Could not record expense.");
    }
  };

  // Process Debtor/Creditor Repayments
  const handleProcessRepayment = async () => {
    if (!repayTarget || !repayAmount) return;
    const amount = parseFloat(repayAmount);
    if (isNaN(amount) || amount <= 0) return;

    try {
      const db = await dbPromise;
      const now = new Date().toISOString();

      if (repayTarget.type === "DEBTOR") {
        // Cash comes IN: Customer balance decreases
        await db.runAsync(
          "UPDATE customers SET balance = balance - ?, updated_at = ? WHERE id = ?;",
          [amount, now, repayTarget.id],
        );

        // Record payment voucher
        await db.runAsync(
          `INSERT INTO payments (id, business_id, invoice_id, amount, currency, payment_method, type, status, reference_number, sync_status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            generateUUID(),
            user?.business_id || "default_biz",
            null,
            amount,
            "USD",
            repayMethod,
            "DEBT_REPAYMENT",
            "completed",
            `RPY-${repayTarget.name.substring(0, 3).toUpperCase()}`,
            "pending_insert",
            now,
          ],
        );
      } else {
        // Cash goes OUT: Supplier balance decreases
        await db.runAsync(
          "UPDATE suppliers SET balance = balance - ?, updated_at = ? WHERE id = ?;",
          [amount, now, repayTarget.id],
        );

        // Record expense disbursement (to reduce Cash book assets)
        await db.runAsync(
          `INSERT INTO expenses (id, business_id, amount, currency, exchange_rate, category, description, payment_method, user_id, sync_status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            generateUUID(),
            user?.business_id || "default_biz",
            amount,
            "USD",
            1.0,
            "MISCELLANEOUS",
            `Supplier payment: ${repayTarget.name}`,
            repayMethod,
            user?.id || "system",
            "pending_insert",
            now,
            now,
          ],
        );
      }

      setIsRepayModalVisible(false);
      setRepayTarget(null);
      setRepayAmount("");
      Alert.alert("Success", "Payment processed and ledger updated.");
      loadAccountingData();
    } catch (err) {
      console.error("Repayment posting failed:", err);
      Alert.alert("Error", "Payment could not be logged.");
    }
  };

  if (isOperator) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
          backgroundColor: "#FFFFFF",
        }}
      >
        <BookOpen color="#0A2540" size={50} />
        <Text className="text-lg font-bold text-slate-800 mt-4 text-center">
          Permission Denied
        </Text>
        <Text className="text-sm text-slate-500 mt-2 text-center">
          Your Sales Operator role does not allow access to the Accounting
          Ledgers module.
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
      {/* Navigation Sub-Tabs */}
      <View className="flex-row bg-primary border-b border-primary-dark">
        {[
          { key: "cashbook", label: "Cash Book", icon: BookOpen },
          { key: "expenses", label: "Disburse", icon: Receipt },
          { key: "debtors_creditors", label: "Contacts Ledg", icon: Users },
          { key: "statements", label: "Financials", icon: TrendingUp },
        ].map((tab) => {
          const isSelected = activeTab === tab.key;
          const IconComponent = tab.icon;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key as any)}
              className={`flex-1 py-3 items-center flex-row justify-center space-x-1 border-b-2 ${
                isSelected
                  ? "border-accent bg-primary-light/10"
                  : "border-transparent"
              }`}
            >
              <IconComponent
                color={isSelected ? "#FFD700" : "#94A3B8"}
                size={15}
              />
              <Text
                className={`text-[11px] font-bold ${
                  isSelected ? "text-accent" : "text-slate-400"
                }`}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Main Tab Views */}
      <View className="flex-1">
        {/* TAB 1: Cash Book Transactions */}
        {activeTab === "cashbook" && (
          <ScrollView
            className="flex-1 p-4"
            contentContainerStyle={{ paddingBottom: 90 }}
          >
            <Text className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">
              Cash Book Records
            </Text>
            <Table
              columns={[
                { key: "date", title: "Date", flex: 1.2 },
                { key: "ref", title: "Ref/Category", flex: 1.5 },
                { key: "type", title: "Type", flex: 0.8 },
                { key: "amount", title: "Amount", flex: 1, align: "right" },
              ]}
              data={cashbook.map((entry) => ({
                id: entry.id,
                date: entry.date.substring(5, 16).replace("T", " "),
                ref: entry.ref,
                type: (
                  <Badge
                    label={entry.type}
                    variant={entry.type === "DEBIT" ? "success" : "destructive"}
                    className="px-1.5 py-0.5"
                  />
                ),
                amount: `$${entry.amount.toFixed(2)}`,
              }))}
              emptyMessage="No cash movements logged."
            />
          </ScrollView>
        )}

        {/* TAB 2: Expense Disbursement Form */}
        {activeTab === "expenses" && (
          <ScrollView
            className="flex-1 p-5"
            contentContainerStyle={{ paddingBottom: 90 }}
          >
            <Card className="p-5 mb-5">
              <Text className="text-base font-bold text-slate-800 mb-4">
                Record Business Expense
              </Text>

              <Input
                label="Disbursement Amount (USD) *"
                placeholder="0.00"
                keyboardType="numeric"
                value={expAmount}
                onChangeText={setExpAmount}
              />

              <View className="mb-4">
                <Text className="text-sm font-semibold text-slate-700 mb-1.5">
                  Expense Category
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {[
                    "RENT",
                    "ELECTRICITY",
                    "WATER",
                    "INTERNET",
                    "FUEL",
                    "SALARIES",
                    "AIRTIME",
                    "MISCELLANEOUS",
                  ].map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      onPress={() => setExpCategory(cat as any)}
                      className={`py-1.5 px-3 rounded-lg mr-2 border ${
                        expCategory === cat
                          ? "bg-primary border-primary"
                          : "bg-white border-slate-200"
                      }`}
                    >
                      <Text
                        className={`text-xs ${
                          expCategory === cat
                            ? "text-white font-bold"
                            : "text-slate-600"
                        }`}
                      >
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <Input
                label="Disbursement Description"
                placeholder="e.g. Fuel for generator, rent for shop"
                value={expDesc}
                onChangeText={setExpDesc}
              />

              <View className="mb-4">
                <Text className="text-sm font-semibold text-slate-700 mb-1.5">
                  Payment Method
                </Text>
                <View className="flex-row">
                  {["CASH", "ECOCASH", "CARD"].map((m) => (
                    <TouchableOpacity
                      key={m}
                      onPress={() => setExpPayment(m)}
                      className={`flex-1 py-2 rounded-xl border mr-2 items-center ${
                        expPayment === m
                          ? "bg-primary border-primary"
                          : "bg-white border-slate-200"
                      }`}
                    >
                      <Text
                        className={`text-xs ${
                          expPayment === m
                            ? "text-white font-bold"
                            : "text-slate-600"
                        }`}
                      >
                        {m}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <Button
                label="Disburse Funds"
                onPress={handleAddExpense}
                variant="danger"
                className="w-full mt-2"
              />
            </Card>
          </ScrollView>
        )}

        {/* TAB 3: Debtors & Creditors Ledger */}
        {activeTab === "debtors_creditors" && (
          <ScrollView
            className="flex-1 p-4"
            contentContainerStyle={{ paddingBottom: 90 }}
          >
            {/* Debtors Section */}
            <Text className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">
              Debtors (Clients owe you)
            </Text>
            <Card className="mb-6">
              <View className="p-4">
                {debtors.length === 0 ? (
                  <Text className="text-xs text-slate-400 text-center py-4">
                    No outstanding client debts.
                  </Text>
                ) : (
                  debtors.map((d) => (
                    <View
                      key={d.id}
                      className="flex-row justify-between items-center py-2.5 border-b border-slate-100 last:border-b-0"
                    >
                      <View>
                        <Text className="text-sm font-bold text-slate-800">
                          {d.name}
                        </Text>
                        <Text className="text-[10px] text-slate-400">
                          Phone: {d.phone || "N/A"}
                        </Text>
                      </View>
                      <View className="flex-row items-center">
                        <Text className="text-sm font-extrabold text-red-600 mr-3">
                          ${d.balance.toFixed(2)}
                        </Text>
                        <TouchableOpacity
                          onPress={() => {
                            setRepayTarget({
                              type: "DEBTOR",
                              id: d.id,
                              name: d.name,
                            });
                            setIsRepayModalVisible(true);
                          }}
                          className="bg-emerald-600 py-1 px-2.5 rounded-lg"
                        >
                          <Text className="text-[10px] font-bold text-white">
                            Receive
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </Card>

            {/* Creditors Section */}
            <Text className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">
              Creditors (You owe Suppliers)
            </Text>
            <Card>
              <View className="p-4">
                {creditors.length === 0 ? (
                  <Text className="text-xs text-slate-400 text-center py-4">
                    No supplier balances pending.
                  </Text>
                ) : (
                  creditors.map((s) => (
                    <View
                      key={s.id}
                      className="flex-row justify-between items-center py-2.5 border-b border-slate-100 last:border-b-0"
                    >
                      <View>
                        <Text className="text-sm font-bold text-slate-800">
                          {s.name}
                        </Text>
                        <Text className="text-[10px] text-slate-400">
                          Contact: {s.contact_person || "N/A"}
                        </Text>
                      </View>
                      <View className="flex-row items-center">
                        <Text className="text-sm font-extrabold text-slate-800 mr-3">
                          ${s.balance.toFixed(2)}
                        </Text>
                        <TouchableOpacity
                          onPress={() => {
                            setRepayTarget({
                              type: "CREDITOR",
                              id: s.id,
                              name: s.name,
                            });
                            setIsRepayModalVisible(true);
                          }}
                          className="bg-primary py-1 px-2.5 rounded-lg"
                        >
                          <Text className="text-[10px] font-bold text-white">
                            Pay
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </Card>
          </ScrollView>
        )}

        {/* TAB 4: Financial Statements */}
        {activeTab === "statements" && (
          <ScrollView className="flex-1 p-5">
            {/* Profit & Loss Statement */}
            <Text className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">
              Profit & Loss Summary (USD)
            </Text>
            <Card className="mb-6 p-4">
              <View className="flex-row justify-between py-2 border-b border-slate-100">
                <Text className="text-sm text-slate-600 font-semibold">
                  Total Revenue (Sales):
                </Text>
                <Text className="text-sm font-extrabold text-slate-900">
                  ${pnl.revenue.toFixed(2)}
                </Text>
              </View>
              <View className="flex-row justify-between py-2 border-b border-slate-100">
                <Text className="text-sm text-slate-600 font-semibold">
                  Cost of Goods Sold (COGS):
                </Text>
                <Text className="text-sm font-extrabold text-red-500">
                  -${pnl.cogs.toFixed(2)}
                </Text>
              </View>
              <View className="flex-row justify-between py-2 border-b border-slate-100 bg-slate-50">
                <Text className="text-sm text-slate-800 font-bold">
                  Gross Margin:
                </Text>
                <Text className="text-sm font-extrabold text-slate-800">
                  ${(pnl.revenue - pnl.cogs).toFixed(2)}
                </Text>
              </View>
              <View className="flex-row justify-between py-2 border-b border-slate-100">
                <Text className="text-sm text-slate-600 font-semibold">
                  Disbursements & Expenses:
                </Text>
                <Text className="text-sm font-extrabold text-red-500">
                  -${pnl.expenses.toFixed(2)}
                </Text>
              </View>
              <View className="flex-row justify-between py-2.5 mt-2 bg-primary/5 rounded-lg px-2">
                <Text className="text-sm font-bold text-primary">
                  NET PROFIT:
                </Text>
                <Text
                  className={`text-sm font-extrabold ${
                    pnl.netProfit >= 0 ? "text-success-dark" : "text-red-600"
                  }`}
                >
                  ${pnl.netProfit.toFixed(2)}
                </Text>
              </View>
            </Card>

            {/* Balance Sheet Statement */}
            <Text className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">
              Balance Sheet (USD)
            </Text>
            <Card className="p-4 mb-6">
              <View className="flex-row justify-between py-2 border-b border-slate-100">
                <Text className="text-sm text-slate-800 font-bold">
                  TOTAL ASSETS:
                </Text>
                <Text className="text-sm font-extrabold text-emerald-600">
                  ${balanceSheet.assets.toFixed(2)}
                </Text>
              </View>
              <View className="flex-row justify-between py-2 border-b border-slate-100 pl-4">
                <Text className="text-xs text-slate-500">
                  Current Cash & Bank Accounts:
                </Text>
                <Text className="text-xs font-semibold text-slate-700">
                  ${(balanceSheet.assets - pnl.cogs).toFixed(2)}
                </Text>
              </View>
              <View className="flex-row justify-between py-2 border-b border-slate-100 pl-4">
                <Text className="text-xs text-slate-500">
                  Inventory Assets value:
                </Text>
                <Text className="text-xs font-semibold text-slate-700">
                  ${pnl.cogs.toFixed(2)}
                </Text>
              </View>

              <View className="flex-row justify-between py-2 border-b border-slate-100 mt-2">
                <Text className="text-sm text-slate-800 font-bold">
                  TOTAL LIABILITIES:
                </Text>
                <Text className="text-sm font-extrabold text-red-500">
                  ${balanceSheet.liabilities.toFixed(2)}
                </Text>
              </View>

              <View className="flex-row justify-between py-2.5 mt-2 bg-slate-50 rounded-lg px-2">
                <Text className="text-sm font-bold text-slate-800">
                  NET EQUITY:
                </Text>
                <Text className="text-sm font-extrabold text-slate-800">
                  ${balanceSheet.equity.toFixed(2)}
                </Text>
              </View>
            </Card>
          </ScrollView>
        )}
      </View>

      {/* MODAL dialog: Repayment postings */}
      <Modal visible={isRepayModalVisible} transparent animationType="slide">
        <View className="flex-1 bg-black/55 justify-end">
          <View className="bg-white rounded-t-3xl p-6 border-t border-slate-200">
            <Text className="text-base font-bold text-slate-800 mb-2">
              Record Payment
            </Text>
            <Text className="text-xs text-slate-400 mb-4">
              {repayTarget?.name}
            </Text>

            <Input
              label="Payment Amount (USD) *"
              placeholder="0.00"
              keyboardType="numeric"
              value={repayAmount}
              onChangeText={setRepayAmount}
            />

            <View className="mb-4">
              <Text className="text-sm font-semibold text-slate-700 mb-1.5">
                Payment Method
              </Text>
              <View className="flex-row">
                {["CASH", "ECOCASH", "ZIPIT"].map((m) => (
                  <TouchableOpacity
                    key={m}
                    onPress={() => setRepayMethod(m)}
                    className={`flex-1 py-2 rounded-xl border mr-2 items-center ${
                      repayMethod === m
                        ? "bg-primary border-primary"
                        : "bg-white border-slate-200"
                    }`}
                  >
                    <Text
                      className={`text-xs ${
                        repayMethod === m
                          ? "text-white font-bold"
                          : "text-slate-600"
                      }`}
                    >
                      {m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View className="flex-row flex-wrap justify-between space-x-0 sm:space-x-3 mt-4">
              <Button
                label="Cancel"
                variant="outline"
                className="w-full sm:w-[48%]"
                onPress={() => {
                  setIsRepayModalVisible(false);
                  setRepayTarget(null);
                }}
              />
              <Button
                label="Post Payment"
                variant="success"
                className="w-full sm:w-[48%] mt-3 sm:mt-0"
                onPress={handleProcessRepayment}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
