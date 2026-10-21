import React, { useState } from 'react';
import { Table, Order } from '../types';
import { Users, Clock, Plus, CheckCircle2, DollarSign, UtensilsCrossed } from 'lucide-react';

interface TableSelectorProps {
  tables: Table[];
  orders: Order[];
  activeTableId?: string;
  onSelectTable: (table: Table) => void;
  onOpenNewOrder: (table: Table, guestCount: number) => void;
}

export const TableSelector: React.FC<TableSelectorProps> = ({
  tables,
  orders,
  activeTableId,
  onSelectTable,
  onOpenNewOrder,
}) => {
  const [selectedZone, setSelectedZone] = useState<string>('All');
  const [seatingModalTable, setSeatingModalTable] = useState<Table | null>(null);
  const [guestCountInput, setGuestCountInput] = useState<number>(2);

  const zones = ['All', 'Main Dining', 'Patio', 'Bar'];

  const filteredTables = selectedZone === 'All'
    ? tables
    : tables.filter((t) => t.zone === selectedZone);

  // Status stats
  const availableCount = tables.filter((t) => t.status === 'available').length;
  const occupiedCount = tables.filter((t) => t.status === 'seated' || t.status === 'occupied').length;
  const billingCount = tables.filter((t) => t.status === 'billing').length;

  const handleTableClick = (table: Table) => {
    if (table.status === 'available') {
      setGuestCountInput(Math.min(table.capacity, 2));
      setSeatingModalTable(table);
    } else {
      onSelectTable(table);
    }
  };

  const confirmSeating = () => {
    if (seatingModalTable) {
      onOpenNewOrder(seatingModalTable, guestCountInput);
      setSeatingModalTable(null);
    }
  };

  return (
    <div className="pb-24 pt-2 px-3 max-w-4xl mx-auto space-y-4">
      {/* Top Floor Summary Stats */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-2.5">
          <p className="text-xs text-slate-400 font-medium">Available</p>
          <p className="text-xl font-bold text-emerald-400">{availableCount}</p>
        </div>
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-2.5">
          <p className="text-xs text-slate-400 font-medium">Occupied</p>
          <p className="text-xl font-bold text-amber-400">{occupiedCount}</p>
        </div>
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-2.5">
          <p className="text-xs text-slate-400 font-medium">Check Out / Pay</p>
          <p className="text-xl font-bold text-orange-400">{billingCount}</p>
        </div>
      </div>

      {/* Zone Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {zones.map((zone) => (
          <button
            key={zone}
            onClick={() => setSelectedZone(zone)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
              selectedZone === zone
                ? 'bg-amber-500 text-slate-950 font-semibold shadow-md shadow-amber-500/20'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700/60'
            }`}
          >
            {zone}
          </button>
        ))}
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {filteredTables.map((table) => {
          const activeOrder = orders.find(
            (o) => o.tableId === table.id && o.status !== 'paid' && o.status !== 'cancelled'
          );
          const isSelected = activeTableId === table.id;

          const isAvailable = table.status === 'available';
          const isBilling = table.status === 'billing';

          // Calculate order total
          let orderTotal = 0;
          if (activeOrder) {
            const subtotal = activeOrder.items.reduce((sum, item) => {
              const modSum = (item.modifiers || []).reduce((m, mod) => m + mod.price, 0);
              return sum + (item.price + modSum) * item.quantity;
            }, 0);
            orderTotal = subtotal * (1 + activeOrder.taxRate);
          }

          return (
            <button
              key={table.id}
              onClick={() => handleTableClick(table)}
              className={`relative flex flex-col justify-between p-3.5 rounded-2xl border text-left transition-all active:scale-[0.98] ${
                isSelected
                  ? 'border-amber-400 bg-amber-500/10 ring-2 ring-amber-400/40 shadow-lg shadow-amber-500/10'
                  : isAvailable
                  ? 'border-slate-700/60 bg-slate-800/40 hover:bg-slate-800/80 hover:border-slate-600'
                  : isBilling
                  ? 'border-orange-500/60 bg-orange-950/20 hover:bg-orange-900/30'
                  : 'border-amber-600/40 bg-slate-800/90 hover:bg-slate-750'
              }`}
            >
              {/* Header: Table name & capacity */}
              <div className="flex items-start justify-between w-full">
                <div>
                  <h3 className="font-bold text-white text-base leading-tight">{table.name}</h3>
                  <span className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                    <Users className="w-3 h-3 text-slate-400" />
                    Cap {table.capacity}p
                  </span>
                </div>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    isAvailable
                      ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/30'
                      : isBilling
                      ? 'bg-orange-950/60 text-orange-400 border border-orange-500/40'
                      : 'bg-amber-950/60 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  {isAvailable ? 'Free' : isBilling ? 'Bill Ready' : 'Active'}
                </span>
              </div>

              {/* Body: Active order details or tap to seat */}
              <div className="mt-4 pt-3 border-t border-slate-700/50 w-full flex items-center justify-between">
                {activeOrder ? (
                  <>
                    <div>
                      <p className="text-xs text-slate-400 font-medium">
                        {activeOrder.items.length} items
                      </p>
                      <p className="text-sm font-bold text-white tracking-tight">
                        ${orderTotal.toFixed(2)}
                      </p>
                    </div>
                    <span className="text-[11px] font-medium text-amber-400 bg-amber-400/10 px-2 py-1 rounded-lg">
                      #{activeOrder.orderNumber}
                    </span>
                  </>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium py-1">
                    <Plus className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Seat Guests</span>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Seating Modal */}
      {seatingModalTable && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-5 w-full max-w-sm shadow-2xl text-white space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">Seat {seatingModalTable.name}</h3>
                <p className="text-xs text-slate-400">Zone: {seatingModalTable.zone} • Max {seatingModalTable.capacity} guests</p>
              </div>
              <button
                onClick={() => setSeatingModalTable(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-2">Number of Guests</label>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => (
                  <button
                    key={num}
                    onClick={() => setGuestCountInput(num)}
                    className={`py-3 rounded-xl font-bold text-base border transition-all ${
                      guestCountInput === num
                        ? 'bg-amber-500 border-amber-400 text-slate-950 shadow-md shadow-amber-500/30'
                        : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-750'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                onClick={() => setSeatingModalTable(null)}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmSeating}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-sm shadow-lg shadow-amber-500/20"
              >
                Open Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
