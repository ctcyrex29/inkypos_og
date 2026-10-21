import React, { useState } from 'react';
import { Order, OrderItem, PaymentRecord } from '../types';
import {
  CreditCard,
  Banknote,
  Smartphone,
  Split,
  Users,
  CheckCircle2,
  DollarSign,
  Printer,
  Receipt,
  RotateCcw,
  Sparkles,
  ArrowRight
} from 'lucide-react';

interface SplitBillModalProps {
  order: Order;
  onProcessPayment: (payment: PaymentRecord) => void;
  onPrintReceipt: (order: Order, payment?: PaymentRecord) => void;
  onClose: () => void;
}

type SplitMode = 'equal' | 'by_seat' | 'custom' | 'full';

export const SplitBillModal: React.FC<SplitBillModalProps> = ({
  order,
  onProcessPayment,
  onPrintReceipt,
  onClose,
}) => {
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [equalSplitWays, setEqualSplitWays] = useState<number>(order.guestCount || 2);
  const [selectedSeat, setSelectedSeat] = useState<number>(1);
  const [customAmountInput, setCustomAmountInput] = useState<string>('');

  // Payment method & tip states
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash' | 'apple_pay' | 'google_pay'>('card');
  const [tipPercent, setTipPercent] = useState<number>(18);
  const [customTipAmount, setCustomTipAmount] = useState<number>(0);
  const [cashTendered, setCashTendered] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [lastPaymentDone, setLastPaymentDone] = useState<PaymentRecord | null>(null);

  // Financial calculations
  const subtotal = order.items.reduce((sum, item) => {
    const modSum = (item.modifiers || []).reduce((m, mod) => m + mod.price, 0);
    return sum + (item.price + modSum) * item.quantity;
  }, 0);

  const tax = subtotal * order.taxRate;
  const orderTotal = subtotal + tax;

  const totalPaid = order.payments.reduce((sum, p) => sum + p.amount, 0);
  const remainingBase = Math.max(0, orderTotal - totalPaid);

  // Split calculations
  let currentTargetAmount = remainingBase;
  let targetLabel = 'Full Bill';

  if (splitMode === 'equal') {
    const perPersonBase = orderTotal / equalSplitWays;
    // Calculate how many equal portions are still needed
    const equalPaymentsCount = order.payments.filter((p) => p.splitType === 'equal').length;
    const currentGuestNumber = equalPaymentsCount + 1;
    targetLabel = `Guest ${currentGuestNumber} of ${equalSplitWays}`;
    currentTargetAmount = Math.min(remainingBase, perPersonBase);
  } else if (splitMode === 'by_seat') {
    // Items for this seat
    const seatItems = order.items.filter((it) => it.seatNumber === selectedSeat);
    const sharedItems = order.items.filter((it) => !it.seatNumber || it.seatNumber === 0);

    const seatItemSubtotal = seatItems.reduce((acc, it) => acc + it.price * it.quantity, 0);
    const sharedItemSubtotal = sharedItems.reduce((acc, it) => acc + it.price * it.quantity, 0) / (order.guestCount || 1);
    const seatBase = (seatItemSubtotal + sharedItemSubtotal) * (1 + order.taxRate);

    targetLabel = `Seat ${selectedSeat}`;
    currentTargetAmount = Math.min(remainingBase, seatBase);
  } else if (splitMode === 'custom') {
    targetLabel = 'Custom Amount';
    const parsed = parseFloat(customAmountInput) || 0;
    currentTargetAmount = Math.min(remainingBase, parsed);
  }

  // Calculate tip
  const calculatedTip = tipPercent >= 0
    ? (currentTargetAmount * tipPercent) / 100
    : customTipAmount;

  const totalChargeAmount = currentTargetAmount + calculatedTip;

  // Handle payment submission
  const handleExecutePayment = () => {
    if (currentTargetAmount <= 0.01) return;

    setIsProcessing(true);
    setTimeout(() => {
      const changeGiven = paymentMethod === 'cash' && cashTendered > totalChargeAmount
        ? cashTendered - totalChargeAmount
        : 0;

      const newPayment: PaymentRecord = {
        id: `pay-${Date.now()}`,
        orderId: order.id,
        amount: currentTargetAmount,
        tip: calculatedTip,
        total: totalChargeAmount,
        method: paymentMethod,
        timestamp: new Date().toISOString(),
        splitType: splitMode,
        guestLabel: targetLabel,
        tenderedCash: paymentMethod === 'cash' ? (cashTendered || totalChargeAmount) : undefined,
        changeGiven: changeGiven,
        cardLast4: paymentMethod === 'card' ? `${Math.floor(1000 + Math.random() * 9000)}` : undefined,
      };

      onProcessPayment(newPayment);
      setLastPaymentDone(newPayment);
      setIsProcessing(false);
      setCashTendered(0);
      setCustomAmountInput('');
    }, 600);
  };

  const isFullySettled = remainingBase <= 0.01;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-xl text-white shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="bg-slate-850 p-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold">{order.tableName}</span>
              <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-lg font-mono">
                #{order.orderNumber}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {order.guestCount} guests • {order.items.length} items
            </p>
          </div>

          <div className="text-right">
            <span className="text-[11px] text-slate-400 block">Remaining Balance</span>
            <span className={`text-lg font-black tracking-tight ${isFullySettled ? 'text-emerald-400' : 'text-amber-400'}`}>
              ${remainingBase.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {/* If already fully paid */}
          {isFullySettled ? (
            <div className="text-center py-6 bg-emerald-950/30 border border-emerald-500/30 rounded-2xl p-4 space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
              <h3 className="text-lg font-bold text-white">Bill Fully Paid & Settled</h3>
              <p className="text-xs text-slate-300">
                Total paid: ${orderTotal.toFixed(2)} across {order.payments.length} transactions.
              </p>
              <div className="pt-2 flex flex-wrap justify-center gap-2">
                <button
                  onClick={() => onPrintReceipt(order)}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-600/30"
                >
                  <Printer className="w-4 h-4" />
                  Print Full Master Receipt
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs"
                >
                  Done & Close
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Split Mode Tabs */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Choose Payment Split Mode
                </label>
                <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-800/80 rounded-xl border border-slate-700">
                  <button
                    onClick={() => setSplitMode('equal')}
                    className={`py-2 rounded-lg text-xs font-bold transition-all ${
                      splitMode === 'equal'
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Split Equal
                  </button>
                  <button
                    onClick={() => setSplitMode('by_seat')}
                    className={`py-2 rounded-lg text-xs font-bold transition-all ${
                      splitMode === 'by_seat'
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    By Seat
                  </button>
                  <button
                    onClick={() => setSplitMode('custom')}
                    className={`py-2 rounded-lg text-xs font-bold transition-all ${
                      splitMode === 'custom'
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Custom $
                  </button>
                  <button
                    onClick={() => setSplitMode('full')}
                    className={`py-2 rounded-lg text-xs font-bold transition-all ${
                      splitMode === 'full'
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Single Pay
                  </button>
                </div>
              </div>

              {/* Mode-specific Sub-controls */}
              {splitMode === 'equal' && (
                <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-medium">Split Bill Ways:</span>
                    <span className="font-bold text-amber-400">
                      ${(orderTotal / equalSplitWays).toFixed(2)} per guest
                    </span>
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                    {[2, 3, 4, 5, 6, 7, 8].map((ways) => (
                      <button
                        key={ways}
                        onClick={() => setEqualSplitWays(ways)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          equalSplitWays === ways
                            ? 'bg-amber-500 text-slate-950 shadow-sm'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-650'
                        }`}
                      >
                        {ways} Ways
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {splitMode === 'by_seat' && (
                <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-medium">Select Seat to Settle:</span>
                    <span className="text-slate-400">Seat {selectedSeat} items</span>
                  </div>
                  <div className="flex gap-2">
                    {Array.from({ length: order.guestCount || 2 }, (_, i) => i + 1).map((s) => (
                      <button
                        key={s}
                        onClick={() => setSelectedSeat(s)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          selectedSeat === s
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-650'
                        }`}
                      >
                        Seat {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {splitMode === 'custom' && (
                <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-3 space-y-2">
                  <label className="text-xs text-slate-300 font-medium block">
                    Enter Amount to Tender (Max ${remainingBase.toFixed(2)})
                  </label>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="number"
                      step="0.01"
                      placeholder={`0.00 (Balance: $${remainingBase.toFixed(2)})`}
                      value={customAmountInput}
                      onChange={(e) => setCustomAmountInput(e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded-xl pl-8 pr-3 py-2 text-sm text-white font-bold focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              )}

              {/* Payment Tender Method */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Payment Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setPaymentMethod('card')}
                    className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                      paymentMethod === 'card'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
                    }`}
                  >
                    <CreditCard className="w-5 h-5" />
                    <span className="text-xs">Credit/Debit</span>
                  </button>

                  <button
                    onClick={() => setPaymentMethod('cash')}
                    className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                      paymentMethod === 'cash'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
                    }`}
                  >
                    <Banknote className="w-5 h-5" />
                    <span className="text-xs">Cash</span>
                  </button>

                  <button
                    onClick={() => setPaymentMethod('apple_pay')}
                    className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                      paymentMethod === 'apple_pay'
                        ? 'bg-sky-500/20 border-sky-500 text-sky-300 font-bold'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
                    }`}
                  >
                    <Smartphone className="w-5 h-5" />
                    <span className="text-xs">Digital / Tap</span>
                  </button>
                </div>
              </div>

              {/* Tip Selection */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300">Add Staff Tip</label>
                  <span className="text-xs font-bold text-amber-400">
                    +${calculatedTip.toFixed(2)}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {[0, 15, 18, 20, 25].map((pct) => (
                    <button
                      key={pct}
                      onClick={() => setTipPercent(pct)}
                      className={`py-2 rounded-xl text-xs font-bold transition-all border ${
                        tipPercent === pct
                          ? 'bg-amber-500 border-amber-400 text-slate-950'
                          : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
                      }`}
                    >
                      {pct === 0 ? 'No Tip' : `${pct}%`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cash Change Calculator */}
              {paymentMethod === 'cash' && (
                <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-medium">Quick Cash Tendered:</span>
                    <span className="text-emerald-400 font-bold">
                      {cashTendered >= totalChargeAmount
                        ? `Change Due: $${(cashTendered - totalChargeAmount).toFixed(2)}`
                        : 'Select bill or exact'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {[
                      Math.ceil(totalChargeAmount),
                      20,
                      50,
                      100
                    ].map((amt, idx) => (
                      <button
                        key={idx}
                        onClick={() => setCashTendered(amt)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                          cashTendered === amt
                            ? 'bg-emerald-500 border-emerald-400 text-slate-950 font-black'
                            : 'bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-650'
                        }`}
                      >
                        ${amt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Historical payments for this order */}
          {order.payments.length > 0 && (
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-3 space-y-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Payments Processed ({order.payments.length})
              </span>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {order.payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-2 bg-slate-800 rounded-xl text-xs border border-slate-700/60"
                  >
                    <div>
                      <span className="font-bold text-white">{p.guestLabel || 'Payment'}</span>
                      <span className="text-slate-400 ml-2 uppercase text-[10px]">
                        • {p.method.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-emerald-400">${p.total.toFixed(2)}</span>
                      <button
                        onClick={() => onPrintReceipt(order, p)}
                        className="text-slate-400 hover:text-white p-1 hover:bg-slate-700 rounded"
                        title="Print individual split receipt"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Action Bar */}
        <div className="p-4 bg-slate-850 border-t border-slate-800 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
          >
            Close
          </button>

          {!isFullySettled && (
            <button
              onClick={handleExecutePayment}
              disabled={isProcessing || currentTargetAmount <= 0.01}
              className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-all"
            >
              {isProcessing ? (
                <span>Processing Authorization...</span>
              ) : (
                <>
                  <span>Pay ${totalChargeAmount.toFixed(2)}</span>
                  <span className="text-xs font-semibold opacity-75">
                    ({targetLabel})
                  </span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
