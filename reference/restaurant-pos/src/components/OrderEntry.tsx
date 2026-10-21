import React, { useState } from 'react';
import { MenuItem, MenuItemModifier, Order, OrderItem, Table } from '../types';
import { Search, Plus, Minus, Send, Split, Trash2, Check, Sparkles, ChefHat } from 'lucide-react';

interface OrderEntryProps {
  menuItems: MenuItem[];
  activeTable?: Table;
  activeOrder?: Order;
  onAddItem: (menuItem: MenuItem, seatNumber: number, selectedModifiers?: MenuItemModifier[], specialInstructions?: string) => void;
  onRemoveItem: (orderItemUid: string) => void;
  onSendToKitchen: () => void;
  onOpenSplitBill: () => void;
  onSwitchTable: () => void;
}

export const OrderEntry: React.FC<OrderEntryProps> = ({
  menuItems,
  activeTable,
  activeOrder,
  onAddItem,
  onRemoveItem,
  onSendToKitchen,
  onOpenSplitBill,
  onSwitchTable,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSeat, setSelectedSeat] = useState<number>(1);
  const [showOrderDrawer, setShowOrderDrawer] = useState<boolean>(false);

  // Modifier modal state
  const [modalItem, setModalItem] = useState<MenuItem | null>(null);
  const [chosenModifiers, setChosenModifiers] = useState<MenuItemModifier[]>([]);
  const [specialNote, setSpecialNote] = useState<string>('');

  const categories = [
    { id: 'all', label: 'All Items' },
    { id: 'starters', label: 'Starters' },
    { id: 'mains', label: 'Mains' },
    { id: 'pizzas', label: 'Pizzas' },
    { id: 'drinks', label: 'Drinks' },
    { id: 'desserts', label: 'Desserts' },
  ];

  const filteredItems = menuItems.filter((item) => {
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleItemTap = (item: MenuItem) => {
    if (item.availableModifiers && item.availableModifiers.length > 0) {
      setModalItem(item);
      setChosenModifiers([]);
      setSpecialNote('');
    } else {
      onAddItem(item, selectedSeat);
    }
  };

  const handleConfirmModifiers = () => {
    if (modalItem) {
      onAddItem(modalItem, selectedSeat, chosenModifiers, specialNote);
      setModalItem(null);
    }
  };

  const toggleModifier = (mod: MenuItemModifier) => {
    if (chosenModifiers.some((m) => m.id === mod.id)) {
      setChosenModifiers(chosenModifiers.filter((m) => m.id !== mod.id));
    } else {
      setChosenModifiers([...chosenModifiers, mod]);
    }
  };

  // Order totals
  const totalItemsCount = activeOrder
    ? activeOrder.items.reduce((sum, item) => sum + item.quantity, 0)
    : 0;

  const subtotal = activeOrder
    ? activeOrder.items.reduce((sum, item) => {
        const modSum = (item.modifiers || []).reduce((m, mod) => m + mod.price, 0);
        return sum + (item.price + modSum) * item.quantity;
      }, 0)
    : 0;

  const guestCount = activeOrder?.guestCount || activeTable?.capacity || 2;
  const seats = Array.from({ length: guestCount }, (_, i) => i + 1);

  if (!activeTable) {
    return (
      <div className="pb-24 pt-12 px-4 max-w-md mx-auto text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto text-amber-400">
          <ChefHat className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white">No Table Selected</h2>
        <p className="text-sm text-slate-400">
          Select a table from the floor plan to start taking an order.
        </p>
        <button
          onClick={onSwitchTable}
          className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-sm shadow-lg shadow-amber-500/20"
        >
          View Tables
        </button>
      </div>
    );
  }

  return (
    <div className="pb-32 pt-2 px-3 max-w-4xl mx-auto space-y-3">
      {/* Top Table & Seat Bar */}
      <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="px-2.5 py-1 bg-amber-500 text-slate-950 font-black rounded-lg text-sm">
            {activeTable.name}
          </div>
          <span className="text-xs text-slate-400 font-medium">
            Order #{activeOrder?.orderNumber || 'New'}
          </span>
        </div>

        {/* Seat assignment buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <span className="text-[11px] text-slate-400 font-medium mr-0.5">Assign to:</span>
          {seats.map((seat) => (
            <button
              key={seat}
              onClick={() => setSelectedSeat(seat)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                selectedSeat === seat
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'bg-slate-700/80 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Seat {seat}
            </button>
          ))}
          <button
            onClick={() => setSelectedSeat(0)}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
              selectedSeat === 0
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'bg-slate-700/80 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Shared
          </button>
        </div>
      </div>

      {/* Search Bar & Category Pills */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search food, cocktails, wine, allergens..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800/90 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                selectedCategory === cat.id
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                  : 'bg-slate-800 text-slate-300 border border-slate-700/80 hover:bg-slate-750'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Menu Items Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {filteredItems.map((item) => {
          return (
            <button
              key={item.id}
              onClick={() => handleItemTap(item)}
              className="group bg-slate-800/70 hover:bg-slate-800 active:scale-[0.98] border border-slate-700/70 hover:border-slate-600 rounded-2xl p-3 text-left flex flex-col justify-between transition-all"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-bold text-white text-sm group-hover:text-amber-400 transition-colors">
                    {item.name}
                  </h4>
                  <span className="font-extrabold text-amber-400 text-sm whitespace-nowrap">
                    ${item.price.toFixed(2)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 line-clamp-2 mt-1 leading-snug">
                  {item.description}
                </p>
              </div>

              <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-700/50">
                <div className="flex gap-1">
                  {item.isVegetarian && (
                    <span className="text-[9px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                      Veg
                    </span>
                  )}
                  {item.isGlutenFree && (
                    <span className="text-[9px] font-semibold bg-sky-950/60 text-sky-400 border border-sky-500/30 px-1.5 py-0.5 rounded">
                      GF
                    </span>
                  )}
                </div>
                <span className="flex items-center gap-1 text-[11px] font-bold text-slate-300 bg-slate-700/60 group-hover:bg-amber-500 group-hover:text-slate-950 px-2 py-0.5 rounded-lg transition-colors">
                  <Plus className="w-3 h-3" />
                  Add ({selectedSeat === 0 ? 'Shared' : `S${selectedSeat}`})
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Floating Bottom Cart Bar */}
      {activeOrder && activeOrder.items.length > 0 && (
        <div className="fixed bottom-16 left-0 right-0 z-30 px-4 pointer-events-none">
          <div className="max-w-md mx-auto pointer-events-auto bg-slate-900/95 backdrop-blur-xl border border-amber-500/40 rounded-2xl p-3 shadow-2xl shadow-black/80 flex items-center justify-between gap-2">
            <button
              onClick={() => setShowOrderDrawer(true)}
              className="flex items-center gap-2.5 text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex flex-col items-center justify-center font-black text-xs shadow-md">
                <span>{totalItemsCount}</span>
                <span className="text-[9px] font-medium -mt-1">items</span>
              </div>
              <div>
                <p className="text-xs text-slate-400">Order #{activeOrder.orderNumber}</p>
                <p className="text-base font-bold text-white tracking-tight">
                  ${(subtotal * (1 + activeOrder.taxRate)).toFixed(2)}
                </p>
              </div>
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={onSendToKitchen}
                className="flex items-center gap-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/30"
                title="Send ticket to kitchen"
              >
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Send</span> KDS
              </button>
              <button
                onClick={onOpenSplitBill}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold shadow-md shadow-amber-500/30"
              >
                <Split className="w-3.5 h-3.5" />
                Split & Pay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slide-over Active Order Drawer */}
      {showOrderDrawer && activeOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full flex flex-col text-white p-4 shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white">
                  {activeTable.name} • Ticket #{activeOrder.orderNumber}
                </h3>
                <p className="text-xs text-slate-400">Server: {activeOrder.serverName}</p>
              </div>
              <button
                onClick={() => setShowOrderDrawer(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg bg-slate-800"
              >
                ✕
              </button>
            </div>

            {/* Items list */}
            <div className="flex-1 overflow-y-auto py-3 space-y-2.5">
              {activeOrder.items.map((item) => (
                <div
                  key={item.uid}
                  className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-2.5 flex items-start justify-between gap-2"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">
                        {item.quantity}x {item.name}
                      </span>
                      <span className="text-[10px] font-semibold bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">
                        {item.seatNumber ? `Seat ${item.seatNumber}` : 'Shared'}
                      </span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                          item.status === 'ready'
                            ? 'bg-emerald-950 text-emerald-400'
                            : item.status === 'kitchen'
                            ? 'bg-amber-950 text-amber-400'
                            : 'bg-slate-700 text-slate-400'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>

                    {item.modifiers && item.modifiers.length > 0 && (
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {item.modifiers.map((m) => m.name).join(', ')}
                      </div>
                    )}
                    {item.specialInstructions && (
                      <p className="text-[11px] italic text-amber-400/80 mt-0.5">
                        Note: {item.specialInstructions}
                      </p>
                    )}

                    <p className="text-xs font-bold text-amber-400 mt-1">
                      ${(item.price * item.quantity).toFixed(2)}
                    </p>
                  </div>

                  <button
                    onClick={() => onRemoveItem(item.uid)}
                    className="text-rose-400 hover:text-rose-300 p-1.5 hover:bg-rose-950/40 rounded-lg"
                    title="Remove item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Order totals & actions */}
            <div className="pt-3 border-t border-slate-800 space-y-2">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>Tax ({(activeOrder.taxRate * 100).toFixed(2)}%)</span>
                <span>${(subtotal * activeOrder.taxRate).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-white pt-1 border-t border-slate-800">
                <span>Total</span>
                <span className="text-amber-400">
                  ${(subtotal * (1 + activeOrder.taxRate)).toFixed(2)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  onClick={() => {
                    onSendToKitchen();
                    setShowOrderDrawer(false);
                  }}
                  className="py-2.5 bg-emerald-600 hover:bg-emerald-500 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  Send to Kitchen
                </button>
                <button
                  onClick={() => {
                    setShowOrderDrawer(false);
                    onOpenSplitBill();
                  }}
                  className="py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5"
                >
                  <Split className="w-3.5 h-3.5" />
                  Split & Pay
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modifier Dialog Modal */}
      {modalItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-5 w-full max-w-sm shadow-2xl text-white space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-base">{modalItem.name}</h3>
                <p className="text-xs text-amber-400 font-bold mt-0.5">
                  Base: ${modalItem.price.toFixed(2)}
                </p>
              </div>
              <button
                onClick={() => setModalItem(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            {/* Modifiers List */}
            {modalItem.availableModifiers && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Select Custom Options / Modifiers
                </label>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {modalItem.availableModifiers.map((mod) => {
                    const isSelected = chosenModifiers.some((m) => m.id === mod.id);
                    return (
                      <button
                        key={mod.id}
                        onClick={() => toggleModifier(mod)}
                        className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-xs transition-all ${
                          isSelected
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-medium'
                            : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
                        }`}
                      >
                        <span>{mod.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">
                            {mod.price > 0 ? `+$${mod.price.toFixed(2)}` : 'Included'}
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-amber-400" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Special Instructions Note */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Kitchen Special Note (e.g. Allergy, Extra Sauce)
              </label>
              <input
                type="text"
                placeholder="No onions, dressing on side..."
                value={specialNote}
                onChange={(e) => setSpecialNote(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="pt-2 flex gap-2">
              <button
                onClick={() => setModalItem(null)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmModifiers}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs shadow-lg shadow-amber-500/20"
              >
                Add to Ticket
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
