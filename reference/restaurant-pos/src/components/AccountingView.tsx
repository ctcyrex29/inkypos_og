import React, { useState, useMemo } from 'react';
import { CashExpense, Order, PaymentRecord, ZReport, RestaurantSettings } from '../types';
import {
  DollarSign,
  TrendingUp,
  Receipt,
  FileSpreadsheet,
  Plus,
  Printer,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowDownRight,
  ArrowUpRight,
  Smartphone,
  Banknote,
  CreditCard,
  Building,
  BarChart3,
  Award
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  ReferenceLine
} from 'recharts';

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  zigRate: number;
}

const SalesTrendTooltip: React.FC<CustomTooltipProps> = ({ active, payload, zigRate }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-3 shadow-2xl text-xs space-y-1.5 z-50 pointer-events-none min-w-[190px]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-1.5">
          <span className="font-bold text-white text-xs">{data.fullDate}</span>
          {data.isToday ? (
            <span className="bg-emerald-500/20 text-emerald-300 font-black px-1.5 py-0.5 rounded text-[10px] border border-emerald-500/30">
              TODAY
            </span>
          ) : (
            <span className="text-[10px] text-slate-400 font-medium">Completed</span>
          )}
        </div>
        <div className="flex justify-between items-center gap-3">
          <span className="text-slate-400">Gross Sales:</span>
          <span className="text-amber-400 font-black">${data.grossSalesUsd.toFixed(2)} USD</span>
        </div>
        <div className="flex justify-between items-center gap-3">
          <span className="text-slate-400">ZiG Value:</span>
          <span className="text-slate-300 font-semibold">{data.grossSalesZig.toFixed(0)} ZiG</span>
        </div>
        <div className="flex justify-between items-center gap-3">
          <span className="text-slate-400">Orders Served:</span>
          <span className="text-white font-bold">{data.orderCount} meals</span>
        </div>
      </div>
    );
  }
  return null;
};

interface AccountingViewProps {
  orders: Order[];
  cashExpenses: CashExpense[];
  openingFloat: number;
  currentCashier: string;
  onAddExpense: (expense: CashExpense) => void;
  onGenerateZReport: (countedCash: number) => ZReport;
  onPrintZReport: (report: ZReport) => void;
  onPrintOrderReceipt: (order: Order, payment?: PaymentRecord) => void;
  settings: RestaurantSettings;
}

export const AccountingView: React.FC<AccountingViewProps> = ({
  orders,
  cashExpenses,
  openingFloat,
  currentCashier,
  onAddExpense,
  onGenerateZReport,
  onPrintZReport,
  onPrintOrderReceipt,
  settings,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'drawer' | 'expenses' | 'orders'>('overview');

  // Drawer count state
  const [countedCashInput, setCountedCashInput] = useState<string>('');
  const [lastZReport, setLastZReport] = useState<ZReport | null>(null);

  // Expense modal
  const [showExpenseModal, setShowExpenseModal] = useState<boolean>(false);
  const [expenseDesc, setExpenseDesc] = useState<string>('');
  const [expenseAmount, setExpenseAmount] = useState<string>('');
  const [expenseCat, setExpenseCat] = useState<CashExpense['category']>('Produce');

  // All settled/active paid orders (excluding cancelled)
  const paidOrders = orders.filter(
    (o) => o.status !== 'cancelled' && ((o.payments && o.payments.length > 0) || o.paidAt)
  );

  // Gross Sales (USD)
  const grossSalesUsd = paidOrders.reduce((acc, o) => acc + (o.totalAmount || o.subtotal || 0), 0);
  const grossSalesZig = grossSalesUsd * settings.zigExchangeRate;

  // Payments breakdown
  const allPayments = paidOrders.flatMap((o) => o.payments || []);

  const usdCashSales = allPayments
    .filter((p) => p.method === 'usd_cash' || p.method === 'cash')
    .reduce((acc, p) => acc + p.total, 0);

  const ecocashSales = allPayments
    .filter((p) => p.method === 'ecocash')
    .reduce((acc, p) => acc + p.total, 0);

  const innbucksSales = allPayments
    .filter((p) => p.method === 'innbucks')
    .reduce((acc, p) => acc + p.total, 0);

  const zigCashSales = allPayments
    .filter((p) => p.method === 'zig_cash')
    .reduce((acc, p) => acc + p.total, 0);

  const zigSwipeSales = allPayments
    .filter((p) => p.method === 'zig_swipe')
    .reduce((acc, p) => acc + p.total, 0);

  const cardSales = allPayments
    .filter((p) => p.method === 'card' || p.method === 'apple_pay' || p.method === 'google_pay')
    .reduce((acc, p) => acc + p.total, 0);

  const averageCheckUsd = paidOrders.length > 0 ? grossSalesUsd / paidOrders.length : 0;

  // 7-day daily sales revenue trend aggregation
  const last7DaysData = useMemo(() => {
    const days: {
      dateKey: string;
      dayLabel: string;
      fullDate: string;
      grossSalesUsd: number;
      grossSalesZig: number;
      orderCount: number;
      isToday: boolean;
    }[] = [];

    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().split('T')[0];
      const isToday = i === 0;
      const dayName = isToday ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' });
      const dayLabel = isToday ? 'Today' : `${dayName} ${d.getDate()}`;
      const fullDate = d.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });

      days.push({
        dateKey,
        dayLabel,
        fullDate,
        grossSalesUsd: 0,
        grossSalesZig: 0,
        orderCount: 0,
        isToday
      });
    }

    orders.forEach((o) => {
      if (o.status === 'cancelled') return;
      const isPaid = (o.payments && o.payments.length > 0) || o.paidAt;
      if (!isPaid) return;

      const dateStr = (o.paidAt || o.createdAt).split('T')[0];
      const targetDay = days.find((d) => d.dateKey === dateStr);
      const amount = o.totalAmount || o.subtotal || 0;
      if (targetDay) {
        targetDay.grossSalesUsd += amount;
        targetDay.grossSalesZig += amount * settings.zigExchangeRate;
        targetDay.orderCount += 1;
      }
    });

    return days;
  }, [orders, settings.zigExchangeRate]);

  // Derived 7-day stats
  const total7DaySalesUsd = useMemo(
    () => last7DaysData.reduce((sum, d) => sum + d.grossSalesUsd, 0),
    [last7DaysData]
  );
  const total7DayOrders = useMemo(
    () => last7DaysData.reduce((sum, d) => sum + d.orderCount, 0),
    [last7DaysData]
  );
  const avgDailySalesUsd = total7DaySalesUsd / 7;
  const peakDay = useMemo(() => {
    return [...last7DaysData].sort((a, b) => b.grossSalesUsd - a.grossSalesUsd)[0];
  }, [last7DaysData]);

  // Drawer calculations (USD cash strictly)
  const totalCashPayouts = cashExpenses.reduce((acc, exp) => acc + exp.amount, 0);
  const expectedDrawerCash = openingFloat + usdCashSales - totalCashPayouts;
  const countedCashNumber = parseFloat(countedCashInput) || 0;
  const variance = countedCashInput !== '' ? countedCashNumber - expectedDrawerCash : 0;

  const handleCreateExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(expenseAmount);
    if (!expenseDesc || isNaN(amt) || amt <= 0) return;

    const newExp: CashExpense = {
      id: `exp-${Date.now()}`,
      description: expenseDesc,
      amount: amt,
      category: expenseCat,
      timestamp: new Date().toISOString(),
      staffName: currentCashier,
    };

    onAddExpense(newExp);
    setExpenseDesc('');
    setExpenseAmount('');
    setShowExpenseModal(false);
  };

  const handleCloseShiftZReport = () => {
    const report = onGenerateZReport(countedCashNumber || expectedDrawerCash);
    setLastZReport(report);
  };

  return (
    <div className="pb-32 pt-2 px-3 sm:px-4 max-w-5xl mx-auto space-y-4">
      {/* Sub-tabs header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-slate-900 border border-slate-800 rounded-3xl p-3 gap-3 shadow-xl">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveSubTab('overview')}
            className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition-all ${
              activeSubTab === 'overview'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            Sales Overview
          </button>
          <button
            onClick={() => setActiveSubTab('drawer')}
            className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition-all ${
              activeSubTab === 'drawer'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            Cash Drawer Audit
          </button>
          <button
            onClick={() => setActiveSubTab('expenses')}
            className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition-all ${
              activeSubTab === 'expenses'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            Petty Expenses ({cashExpenses.length})
          </button>
          <button
            onClick={() => setActiveSubTab('orders')}
            className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition-all ${
              activeSubTab === 'orders'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            Settled Orders ({paidOrders.length})
          </button>
        </div>

        <button
          onClick={handleCloseShiftZReport}
          className="flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/30"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Generate Z-Report</span>
        </button>
      </div>

      {/* SUB-TAB 1: Overview */}
      {activeSubTab === 'overview' && (
        <div className="space-y-4">
          {/* Key Metric Tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-lg">
              <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider block">
                Gross Sales (USD)
              </span>
              <p className="text-2xl font-black text-amber-400 mt-1">
                ${grossSalesUsd.toFixed(2)}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">{paidOrders.length} customer tokens paid</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-lg">
              <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider block">
                Local ZiG Value
              </span>
              <p className="text-2xl font-black text-slate-200 mt-1">
                {grossSalesZig.toFixed(0)} ZiG
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">Rate: {settings.zigExchangeRate.toFixed(2)} ZiG/$1</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-lg">
              <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider block">
                USD Cash Tender
              </span>
              <p className="text-2xl font-black text-emerald-400 mt-1">
                ${usdCashSales.toFixed(2)}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">Physical notes in till</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-lg">
              <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider block">
                Avg. Meal Check
              </span>
              <p className="text-2xl font-black text-sky-400 mt-1">
                ${averageCheckUsd.toFixed(2)}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">Per order token</p>
            </div>
          </div>

          {/* Last 7 Days Gross Daily Sales Trend (Recharts Bar Chart) */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <BarChart3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Last 7 Days Gross Sales Trend</span>
                    <span className="text-[10px] bg-slate-800 text-slate-300 font-semibold px-2 py-0.5 rounded-full border border-slate-700">
                      Revenue Trends
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Gross daily revenue in USD &amp; local ZiG value across all completed order tokens
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="bg-slate-850 px-3 py-1.5 rounded-xl border border-slate-800 text-right">
                  <span className="text-[10px] text-slate-400 font-medium block">7-Day Turnover</span>
                  <span className="text-sm font-black text-amber-400">${total7DaySalesUsd.toFixed(2)}</span>
                </div>
                <div className="bg-slate-850 px-3 py-1.5 rounded-xl border border-slate-800 text-right">
                  <span className="text-[10px] text-slate-400 font-medium block">Daily Avg</span>
                  <span className="text-sm font-black text-sky-400">${avgDailySalesUsd.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Recharts Bar Chart Container */}
            <div className="w-full h-64 pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={last7DaysData} margin={{ top: 12, right: 12, left: -16, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.35} vertical={false} />
                  <XAxis
                    dataKey="dayLabel"
                    stroke="#64748b"
                    tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
                    tickLine={false}
                    axisLine={{ stroke: '#334155' }}
                  />
                  <YAxis
                    stroke="#64748b"
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => `$${val}`}
                  />
                  <Tooltip
                    content={<SalesTrendTooltip zigRate={settings.zigExchangeRate} />}
                    cursor={{ fill: 'rgba(255, 255, 255, 0.04)', radius: 8 }}
                  />
                  {avgDailySalesUsd > 0 && (
                    <ReferenceLine
                      y={avgDailySalesUsd}
                      stroke="#38bdf8"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      label={{
                        value: `Avg: $${avgDailySalesUsd.toFixed(0)}`,
                        fill: '#38bdf8',
                        fontSize: 10,
                        fontWeight: 600,
                        position: 'insideTopRight'
                      }}
                    />
                  )}
                  <Bar
                    dataKey="grossSalesUsd"
                    radius={[8, 8, 0, 0]}
                    maxBarSize={44}
                    animationDuration={800}
                  >
                    {last7DaysData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.isToday ? '#10b981' : '#f59e0b'}
                        className="transition-all hover:opacity-80"
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 7-Day Performance Insight Highlights */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 border-t border-slate-800/80">
              <div className="bg-slate-850/60 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-medium">7-Day Gross Sales</span>
                <span className="text-xs font-bold text-white block mt-0.5">
                  ${total7DaySalesUsd.toFixed(2)} USD
                </span>
                <span className="text-[9px] text-slate-500">
                  {(total7DaySalesUsd * settings.zigExchangeRate).toFixed(0)} ZiG
                </span>
              </div>

              <div className="bg-slate-850/60 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-medium">Peak Revenue Day</span>
                <span className="text-xs font-bold text-amber-400 block mt-0.5">
                  {peakDay ? `${peakDay.dayLabel} ($${peakDay.grossSalesUsd.toFixed(2)})` : 'N/A'}
                </span>
                <span className="text-[9px] text-slate-500">Highest daily sales</span>
              </div>

              <div className="bg-slate-850/60 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-medium">Orders Completed</span>
                <span className="text-xs font-bold text-white block mt-0.5">
                  {total7DayOrders} meals served
                </span>
                <span className="text-[9px] text-slate-500">
                  ~{(total7DayOrders / 7).toFixed(1)} meals/day
                </span>
              </div>

              <div className="bg-slate-850/60 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-medium">Today&apos;s Contribution</span>
                <span className="text-xs font-bold text-emerald-400 block mt-0.5">
                  ${(last7DaysData.find((d) => d.isToday)?.grossSalesUsd || 0).toFixed(2)} USD
                </span>
                <span className="text-[9px] text-slate-500">
                  {total7DaySalesUsd > 0
                    ? `${(((last7DaysData.find((d) => d.isToday)?.grossSalesUsd || 0) / total7DaySalesUsd) * 100).toFixed(1)}% of 7-day total`
                    : 'Active shift'}
                </span>
              </div>
            </div>
          </div>

          {/* Zimbabwean Multi-Currency Tender Breakdown */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-lg">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white">Zimbabwean Tender & Currency Distribution</h3>
              <span className="text-xs text-amber-400 font-bold">Total: ${grossSalesUsd.toFixed(2)} USD</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-850 p-3.5 rounded-2xl border border-slate-800 space-y-1">
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <Banknote className="w-4 h-4" />
                  <span className="text-xs font-bold">USD Cash</span>
                </div>
                <span className="text-xl font-black text-white block">${usdCashSales.toFixed(2)}</span>
                <span className="text-[10px] text-slate-400">Hard Currency Notes</span>
              </div>

              <div className="bg-slate-850 p-3.5 rounded-2xl border border-slate-800 space-y-1">
                <div className="flex items-center gap-1.5 text-blue-400">
                  <Smartphone className="w-4 h-4" />
                  <span className="text-xs font-bold">EcoCash / Mobile</span>
                </div>
                <span className="text-xl font-black text-white block">
                  ${(ecocashSales + innbucksSales).toFixed(2)}
                </span>
                <span className="text-[10px] text-slate-400">Till: {settings.ecocashMerchantCode}</span>
              </div>

              <div className="bg-slate-850 p-3.5 rounded-2xl border border-slate-800 space-y-1">
                <div className="flex items-center gap-1.5 text-amber-400">
                  <Banknote className="w-4 h-4" />
                  <span className="text-xs font-bold">ZiG Cash & Swipe</span>
                </div>
                <span className="text-xl font-black text-amber-400 block">
                  ${(zigCashSales + zigSwipeSales).toFixed(2)}
                </span>
                <span className="text-[10px] text-slate-400">
                  {((zigCashSales + zigSwipeSales) * settings.zigExchangeRate).toFixed(0)} ZiG
                </span>
              </div>

              <div className="bg-slate-850 p-3.5 rounded-2xl border border-slate-800 space-y-1">
                <div className="flex items-center gap-1.5 text-purple-400">
                  <CreditCard className="w-4 h-4" />
                  <span className="text-xs font-bold">Card / POS Swipe</span>
                </div>
                <span className="text-xl font-black text-white block">${cardSales.toFixed(2)}</span>
                <span className="text-[10px] text-slate-400">Zimswitch / Visa</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: Cash Drawer Audit */}
      {activeSubTab === 'drawer' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
          <div>
            <h3 className="text-base font-bold text-white">USD Cash Drawer Reconciliation</h3>
            <p className="text-xs text-slate-400">
              Audit physical USD cash received at the counter against payouts and float.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-850 p-3.5 rounded-2xl border border-slate-800">
              <span className="text-xs text-slate-400 block">Opening Cash Float</span>
              <span className="text-xl font-bold text-white">${openingFloat.toFixed(2)}</span>
            </div>

            <div className="bg-slate-850 p-3.5 rounded-2xl border border-slate-800">
              <span className="text-xs text-slate-400 block">(+) USD Cash Sales</span>
              <span className="text-xl font-bold text-emerald-400">+${usdCashSales.toFixed(2)}</span>
            </div>

            <div className="bg-slate-850 p-3.5 rounded-2xl border border-slate-800">
              <span className="text-xs text-slate-400 block">(-) Petty Cash Expenses</span>
              <span className="text-xl font-bold text-rose-400">-${totalCashPayouts.toFixed(2)}</span>
            </div>
          </div>

          <div className="bg-slate-850 p-4 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-300 block">Expected Drawer Cash</span>
                <span className="text-2xl font-black text-amber-400">
                  ${expectedDrawerCash.toFixed(2)}
                </span>
              </div>

              <div className="text-right">
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Actual Counted Cash ($ USD)
                </label>
                <input
                  type="number"
                  step="1"
                  placeholder="0.00"
                  value={countedCashInput}
                  onChange={(e) => setCountedCashInput(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-right text-sm font-bold text-white w-32 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {countedCashInput !== '' && (
              <div
                className={`p-3 rounded-xl border flex items-center justify-between text-xs font-bold ${
                  variance === 0
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                    : variance > 0
                    ? 'bg-blue-950/40 border-blue-500/40 text-blue-300'
                    : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                }`}
              >
                <span>Drawer Variance:</span>
                <span>
                  {variance >= 0 ? `+$${variance.toFixed(2)} (Over)` : `-$${Math.abs(variance).toFixed(2)} (Short)`}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: Petty Cash Expenses */}
      {activeSubTab === 'expenses' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white">Petty Cash Payouts</h3>
              <p className="text-xs text-slate-400">
                Log cash taken from till for firewood, vegetables at Mbare Musika, gas refills, etc.
              </p>
            </div>
            <button
              onClick={() => setShowExpenseModal(true)}
              className="py-2 px-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md"
            >
              <Plus className="w-4 h-4" />
              <span>Record Expense</span>
            </button>
          </div>

          {cashExpenses.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-xs">
              No petty cash expenses logged today.
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {cashExpenses.map((exp) => (
                <div
                  key={exp.id}
                  className="p-3 bg-slate-850 rounded-2xl border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-bold text-white block">{exp.description}</span>
                    <span className="text-[10px] text-slate-400">
                      {exp.category} • by {exp.staffName} • {new Date(exp.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <span className="text-sm font-black text-rose-400">-${exp.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 4: Settled Orders */}
      {activeSubTab === 'orders' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3 shadow-xl">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white">Settled Orders Today</h3>
            <span className="text-xs text-slate-400">{paidOrders.length} orders total</span>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {paidOrders.map((order) => {
              const orderTotal = order.totalAmount || order.subtotal || 0;
              return (
                <div
                  key={order.id}
                  className="p-3 bg-slate-850 rounded-2xl border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-amber-400 text-sm">#{order.orderNumber}</span>
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                        {order.serviceType === 'sit_in' ? 'Sit-In' : 'Takeaway'}
                      </span>
                      {order.customerName && (
                        <span className="text-slate-300 font-medium">{order.customerName}</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {order.meals?.map((m) => `${m.quantity}x ${m.baseStapleName} + ${m.relishName}`).join(', ') ||
                        order.items?.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="font-black text-sm text-white block">${orderTotal.toFixed(2)}</span>
                      <span className="text-[10px] text-slate-400">
                        {(orderTotal * settings.zigExchangeRate).toFixed(0)} ZiG
                      </span>
                    </div>

                    <button
                      onClick={() => onPrintOrderReceipt(order, order.payments?.[0])}
                      className="p-2 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-xl border border-slate-700"
                      title="Reprint receipt"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL: RECORD EXPENSE */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-sm text-white shadow-2xl p-5 space-y-4">
            <h3 className="text-base font-bold text-white">Record Petty Cash Expense</h3>

            <form onSubmit={handleCreateExpense} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">Description *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Cooking Gas, Firewood, Covo at Mbare..."
                  value={expenseDesc}
                  onChange={(e) => setExpenseDesc(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Amount ($ USD) *</label>
                <input
                  type="number"
                  step="0.5"
                  required
                  placeholder="5.00"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Category</label>
                <select
                  value={expenseCat}
                  onChange={(e) => setExpenseCat(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                >
                  <option value="Produce">Produce / Muriwo</option>
                  <option value="Dairy/Meat">Meat / Nyama</option>
                  <option value="Bar/Beverage">Beverages / Chibuku</option>
                  <option value="Maintenance">Cooking Gas & Fuel</option>
                  <option value="Miscellaneous">Miscellaneous</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl shadow-md shadow-amber-500/20"
                >
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
