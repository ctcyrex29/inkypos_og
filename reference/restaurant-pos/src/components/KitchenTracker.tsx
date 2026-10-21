import React, { useState } from 'react';
import { Order, OrderStatus, RestaurantSettings, ThemeMode } from '../types';
import {
  ChefHat,
  CheckCircle2,
  Clock,
  Printer,
  Utensils,
  Volume2,
  Bell,
  Coffee,
  CheckCheck,
  Flame,
  ArrowRight
} from 'lucide-react';

interface KitchenTrackerProps {
  orders: Order[];
  onUpdateOrderStatus: (orderId: string, newStatus: OrderStatus) => void;
  onUpdateItemStatus?: (orderId: string, itemUid: string, newStatus: 'kitchen' | 'ready' | 'served') => void;
  onPrintTicket: (order: Order) => void;
  settings: RestaurantSettings;
  theme?: ThemeMode;
}

export const KitchenTracker: React.FC<KitchenTrackerProps> = ({
  orders,
  onUpdateOrderStatus,
  onPrintTicket,
  settings,
  theme = 'light'
}) => {
  const isDark = theme === 'dark';
  const [activeTab, setActiveTab] = useState<'all' | 'in_prep' | 'ready' | 'served'>('all');
  const [lastCalledOut, setLastCalledOut] = useState<number | null>(null);

  // Audio voice callout helper
  const triggerVoiceCallout = (order: Order) => {
    setLastCalledOut(order.orderNumber);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window && settings.voiceCallerEnabled) {
      window.speechSynthesis.cancel();
      const mealsSummary = order.meals && order.meals.length > 0
        ? order.meals.map((m) => `${m.baseStapleName} with ${m.relishName}`).join(', ')
        : 'Meal';

      const text = `Order Number ${order.orderNumber}! ${order.serviceType === 'sit_in' ? 'Sit-in' : 'Takeaway parcel'} ${mealsSummary} is ready for collection!`;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = settings.speechRate || 0.95;
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleBumpToReady = (order: Order) => {
    onUpdateOrderStatus(order.id, 'ready');
    triggerVoiceCallout(order);
  };

  const getElapsedMinutes = (dateStr: string) => {
    const elapsedMs = Date.now() - new Date(dateStr).getTime();
    return Math.floor(elapsedMs / (60 * 1000));
  };

  // Filter orders
  const activeOrders = orders.filter((o) => o.status !== 'cancelled');
  const inPrepOrders = activeOrders.filter((o) => o.status === 'in_prep' || o.status === 'pending');
  const readyOrders = activeOrders.filter((o) => o.status === 'ready');
  const servedOrders = activeOrders.filter((o) => o.status === 'served' || o.status === 'paid');

  const displayedOrders =
    activeTab === 'in_prep'
      ? inPrepOrders
      : activeTab === 'ready'
      ? readyOrders
      : activeTab === 'served'
      ? servedOrders.slice(0, 10)
      : activeOrders.filter((o) => o.status === 'in_prep' || o.status === 'ready' || o.status === 'pending');

  return (
    <div className="pb-32 pt-2 px-3 sm:px-4 max-w-5xl mx-auto space-y-4">
      {/* BIG ZIMBABWEAN CALL-OUT BANNER (READY ORDERS) */}
      <div className={`rounded-2xl p-4 sm:p-5 shadow-xs border space-y-3 ${
        isDark
          ? 'bg-slate-900 border-slate-800 text-white'
          : 'bg-white border-slate-200 text-slate-900'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <span className="text-xs font-bold text-[#F9812A] uppercase tracking-wider">
                NOW SERVING • ORDER CALL-OUT BOARD
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
              Ready for Collection & Sit-In Callout
            </h2>
            <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              Customers waiting for order numbers. Tap any ticket to trigger the voice audio caller.
            </p>
          </div>

          <div className={`flex items-center gap-2 p-1.5 rounded-xl border text-xs font-bold ${
            isDark ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}>
            <Volume2 className="w-4 h-4 text-[#F9812A] ml-1" />
            <span className="pr-2">
              Voice: {settings.voiceCallerEnabled ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>

        {/* Ready Token Number Badges */}
        <div className={`mt-4 pt-3 border-t ${
          isDark ? 'border-slate-800' : 'border-slate-100'
        }`}>
          {readyOrders.length === 0 ? (
            <div className={`py-4 text-center text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              No orders waiting for call-out. Orders bumped from prep will appear here!
            </div>
          ) : (
            <div className="flex flex-wrap gap-2.5">
              {readyOrders.map((ro) => (
                <div
                  key={ro.id}
                  className="bg-[#F9812A] text-white p-2.5 sm:p-3 rounded-2xl shadow-xs flex items-center gap-3 border border-[#F9812A]/80"
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-lg sm:text-xl font-bold tracking-tight leading-none">
                        #{ro.orderNumber}
                      </span>
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-white text-[#F9812A]">
                        {ro.serviceType === 'sit_in' ? 'Sit-In' : 'Takeaway'}
                      </span>
                    </div>
                    <span className="text-[11px] font-medium block mt-0.5 line-clamp-1 max-w-[150px] opacity-95">
                      {ro.customerName || (ro.meals?.[0] ? `${ro.meals[0].baseStapleName} + ${ro.meals[0].relishName}` : 'Order')}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => triggerVoiceCallout(ro)}
                      className="px-2 py-1 bg-white/20 hover:bg-white/30 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-xs cursor-pointer"
                      title="Call out order number over speakers"
                    >
                      <Volume2 className="w-3 h-3" />
                      <span>Call Out</span>
                    </button>

                    <button
                      onClick={() => onUpdateOrderStatus(ro.id, 'served')}
                      className="px-2 py-1 bg-slate-950 hover:bg-slate-900 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-xs cursor-pointer"
                      title="Customer collected food - deducts inventory"
                    >
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span>Collected</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* KITCHEN TICKETS BOARD */}
      <div className="space-y-3">
        {/* Navigation Tabs */}
        <div className={`flex items-center justify-between border-b pb-2 ${
          isDark ? 'border-slate-800' : 'border-slate-200'
        }`}>
          <div className="flex gap-1 overflow-x-auto">
            <button
              onClick={() => setActiveTab('all')}
              className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'all'
                  ? 'bg-[#6495ED] text-white shadow-xs'
                  : isDark
                  ? 'text-slate-400 hover:text-white hover:bg-slate-850'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Active Tickets ({inPrepOrders.length + readyOrders.length})
            </button>
            <button
              onClick={() => setActiveTab('in_prep')}
              className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'in_prep'
                  ? 'bg-[#F9812A] text-white shadow-xs'
                  : isDark
                  ? 'text-slate-400 hover:text-white hover:bg-slate-850'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>In Prep / Cooking ({inPrepOrders.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('ready')}
              className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'ready'
                  ? 'bg-[#F9812A] text-white shadow-xs'
                  : isDark
                  ? 'text-slate-400 hover:text-white hover:bg-slate-850'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Ready for Caller ({readyOrders.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('served')}
              className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'served'
                  ? 'bg-[#6495ED] text-white shadow-xs'
                  : isDark
                  ? 'text-slate-400 hover:text-white hover:bg-slate-850'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Completed / Served ({servedOrders.length})
            </button>
          </div>

          <span className={`text-[11px] hidden sm:inline font-medium ${
            isDark ? 'text-slate-400' : 'text-slate-500'
          }`}>
            Auto-deducts inventory upon collection
          </span>
        </div>

        {/* Tickets Grid */}
        {displayedOrders.length === 0 ? (
          <div className={`text-center py-16 rounded-3xl p-6 space-y-2 border ${
            isDark
              ? 'bg-slate-900 border-slate-800 text-white'
              : 'bg-white border-blue-100 text-slate-900 shadow-sm'
          }`}>
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto opacity-70" />
            <h3 className="text-sm font-black">No Tickets in this view</h3>
            <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              New orders taken from the POS counter will instantly appear here for the kitchen crew.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {displayedOrders.map((order) => {
              const minutesElapsed = getElapsedMinutes(order.createdAt);
              const isReady = order.status === 'ready';
              const isServed = order.status === 'served' || order.status === 'paid';

              return (
                <div
                  key={order.id}
                  className={`border rounded-3xl p-4 flex flex-col justify-between shadow-xs transition-all ${
                    isReady
                      ? isDark
                        ? 'bg-slate-900 border-[#F9812A]/60 ring-1 ring-[#F9812A]/30'
                        : 'bg-white border-[#F9812A]/40 ring-1 ring-[#F9812A]/20'
                      : isServed
                      ? isDark
                        ? 'bg-slate-900/60 border-slate-800 opacity-75'
                        : 'bg-slate-50 border-slate-200 opacity-75'
                      : isDark
                      ? 'bg-slate-900 border-slate-800'
                      : 'bg-white border-slate-200 shadow-xs'
                  }`}
                >
                  {/* Top Ticket Header */}
                  <div className={`pb-2.5 border-b flex items-start justify-between ${
                    isDark ? 'border-slate-800' : 'border-slate-100'
                  }`}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-bold text-[#F9812A]">
                          #{order.orderNumber}
                        </span>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                          isDark
                            ? 'bg-slate-800 text-slate-200 border-slate-700'
                            : 'bg-[#6495ED]/10 text-[#6495ED] border-[#6495ED]/20'
                        }`}>
                          {order.serviceType === 'sit_in' ? 'Sit-In' : 'Takeaway'}
                        </span>
                      </div>
                      <p className={`text-[11px] mt-0.5 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {order.serviceType === 'sit_in' && order.tableNumber
                          ? `${order.tableNumber} • `
                          : ''}
                        {order.customerName ? `${order.customerName} • ` : ''}
                        Cashier: {order.cashierName}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[10px] font-mono flex items-center gap-1 px-2 py-0.5 rounded-lg border ${
                        isDark
                          ? 'bg-slate-800 text-slate-400 border-slate-700'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}>
                        <Clock className="w-3 h-3" />
                        {minutesElapsed}m ago
                      </span>
                      <button
                        onClick={() => onPrintTicket(order)}
                        className={`text-[10px] flex items-center gap-1 p-0.5 font-bold cursor-pointer ${
                          isDark ? 'text-slate-400 hover:text-white' : 'text-[#6495ED] hover:text-[#507ecf]'
                        }`}
                      >
                        <Printer className="w-3 h-3" />
                        <span>Print</span>
                      </button>
                    </div>
                  </div>

                  {/* Meals & Relish List */}
                  <div className="py-3 space-y-2.5 flex-1">
                    {order.meals && order.meals.length > 0 ? (
                      order.meals.map((meal, idx) => (
                        <div
                          key={meal.uid || idx}
                          className={`p-2.5 rounded-2xl border space-y-1 ${
                            isDark
                              ? 'bg-slate-850 border-slate-800'
                              : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex items-baseline justify-between">
                            <span className="text-xs font-bold">
                              {meal.quantity}x {meal.baseStapleName}
                            </span>
                            <span className="text-xs font-bold text-[#F9812A]">
                              + {meal.relishName}
                            </span>
                          </div>
                          {meal.vegetableName && (
                            <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                              Greens: {meal.vegetableName}
                            </p>
                          )}
                          {meal.notes && (
                            <div className="text-[10px] text-[#F9812A] font-bold bg-[#F9812A]/10 px-2 py-0.5 rounded-lg border border-[#F9812A]/20">
                              Note: {meal.notes}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      order.items?.map((it, idx) => (
                        <div
                          key={it.uid || idx}
                          className={`p-2 rounded-xl border text-xs ${
                            isDark ? 'bg-slate-850 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                          }`}
                        >
                          <span className="font-bold">{it.quantity}x {it.name}</span>
                          {it.specialInstructions && (
                            <p className="text-[10px] text-[#F9812A] italic">{it.specialInstructions}</p>
                          )}
                        </div>
                      ))
                    )}

                    {/* Cold Drinks */}
                    {order.drinks && order.drinks.length > 0 && (
                      <div className="pt-1 text-[11px] text-slate-400 flex flex-wrap gap-1">
                        {order.drinks.map((d, i) => (
                          <span
                            key={i}
                            className={`px-2 py-0.5 rounded-lg border text-xs font-bold ${
                              isDark
                                ? 'bg-slate-800 text-slate-300 border-slate-700'
                                : 'bg-[#6495ED]/10 text-[#6495ED] border-[#6495ED]/20'
                            }`}
                          >
                            {d.quantity}x {d.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions / Bump Controls */}
                  <div className={`pt-2 border-t flex gap-2 ${
                    isDark ? 'border-slate-800' : 'border-slate-100'
                  }`}>
                    {!isReady && !isServed && (
                      <button
                        onClick={() => handleBumpToReady(order)}
                        className="w-full py-2.5 bg-[#F9812A] hover:bg-[#e0701a] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-transform cursor-pointer"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>Ready • Call Out #{order.orderNumber}</span>
                      </button>
                    )}

                    {isReady && (
                      <div className="w-full flex gap-2">
                        <button
                          onClick={() => triggerVoiceCallout(order)}
                          className={`flex-1 py-2 font-bold rounded-xl text-xs flex items-center justify-center gap-1 border cursor-pointer ${
                            isDark
                              ? 'bg-slate-800 hover:bg-slate-750 text-[#F9812A] border-slate-700'
                              : 'bg-white hover:bg-slate-50 text-[#F9812A] border-slate-200'
                          }`}
                        >
                          <Volume2 className="w-3 h-3" />
                          <span>Call Again</span>
                        </button>

                        <button
                          onClick={() => onUpdateOrderStatus(order.id, 'served')}
                          className="flex-1 py-2 bg-[#6495ED] hover:bg-[#507ecf] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1 shadow-xs cursor-pointer"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                          <span>Mark Collected</span>
                        </button>
                      </div>
                    )}

                    {isServed && (
                      <div className={`w-full py-1.5 text-center text-xs font-bold rounded-xl border flex items-center justify-center gap-1.5 ${
                        isDark
                          ? 'text-emerald-400 bg-emerald-950/30 border-emerald-500/30'
                          : 'text-emerald-700 bg-emerald-50 border-emerald-300'
                      }`}>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Served & Stock Deducted</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
