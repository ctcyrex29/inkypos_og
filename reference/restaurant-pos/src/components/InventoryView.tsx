import React, { useState } from 'react';
import { InventoryIngredient, InventoryMovement } from '../types';
import {
  Package,
  AlertTriangle,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  TrendingDown,
  Info,
  DollarSign,
  Layers
} from 'lucide-react';

interface InventoryViewProps {
  ingredients: InventoryIngredient[];
  inventoryMovements: InventoryMovement[];
  onAddIngredient: (ingredient: InventoryIngredient) => void;
  onUpdateStock: (ingredientId: string, delta: number, type: 'manual_restock' | 'adjustment' | 'spoilage', reference: string) => void;
  onUpdateThreshold: (ingredientId: string, newThreshold: number) => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  ingredients,
  inventoryMovements,
  onAddIngredient,
  onUpdateStock,
  onUpdateThreshold,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showRestockModal, setShowRestockModal] = useState<{ show: boolean; ingredient?: InventoryIngredient }>({
    show: false
  });
  const [restockAmount, setRestockAmount] = useState<string>('');
  const [restockNote, setRestockNote] = useState<string>('Supplier Delivery');
  const [activeSubTab, setActiveSubTab] = useState<'stock' | 'audit_log' | 'recipes'>('stock');

  // Form for New Ingredient
  const [newForm, setNewForm] = useState<{
    name: string;
    category: 'staples' | 'meat' | 'vegetables' | 'pantry' | 'beverages';
    currentStock: number;
    unit: 'kg' | 'portions' | 'liters' | 'bottles' | 'bundles' | 'packs';
    lowStockThreshold: number;
    costPerUnit: number;
    supplier: string;
  }>({
    name: '',
    category: 'staples',
    currentStock: 10,
    unit: 'kg',
    lowStockThreshold: 3,
    costPerUnit: 1.5,
    supplier: 'Local Market'
  });

  // Calculations
  const lowStockItems = ingredients.filter((i) => i.currentStock <= i.lowStockThreshold);
  const outOfStockItems = ingredients.filter((i) => i.currentStock <= 0);
  const totalValuation = ingredients.reduce((acc, i) => acc + Math.max(0, i.currentStock) * i.costPerUnit, 0);

  // Filtered list
  const filteredIngredients = ingredients.filter((item) => {
    const matchesCat =
      selectedCategory === 'all'
        ? true
        : selectedCategory === 'low_stock'
        ? item.currentStock <= item.lowStockThreshold
        : item.category === selectedCategory;
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.supplier && item.supplier.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  const handleCreateIngredient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForm.name.trim()) return;

    const newIng: InventoryIngredient = {
      id: `ing-${Date.now()}`,
      name: newForm.name.trim(),
      category: newForm.category,
      currentStock: Number(newForm.currentStock) || 0,
      unit: newForm.unit,
      lowStockThreshold: Number(newForm.lowStockThreshold) || 1,
      costPerUnit: Number(newForm.costPerUnit) || 0,
      supplier: newForm.supplier.trim() || undefined,
      lastRestocked: new Date().toISOString()
    };

    onAddIngredient(newIng);
    setShowAddModal(false);
    setNewForm({
      name: '',
      category: 'staples',
      currentStock: 10,
      unit: 'kg',
      lowStockThreshold: 3,
      costPerUnit: 1.5,
      supplier: 'Local Market'
    });
  };

  const handleExecuteRestock = () => {
    if (!showRestockModal.ingredient) return;
    const qty = parseFloat(restockAmount);
    if (!qty || isNaN(qty)) return;

    onUpdateStock(showRestockModal.ingredient.id, qty, 'manual_restock', restockNote);
    setShowRestockModal({ show: false });
    setRestockAmount('');
  };

  return (
    <div className="pb-32 pt-2 px-3 sm:px-4 max-w-5xl mx-auto space-y-4">
      {/* Top Banner & Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
              Stock Control & Deductions
            </span>
            {lowStockItems.length > 0 && (
              <span className="bg-amber-500/20 text-amber-300 text-[10px] font-black px-2 py-0.5 rounded-full border border-amber-500/40 animate-pulse">
                {lowStockItems.length} Low Stock Alerts
              </span>
            )}
          </div>
          <h2 className="text-xl font-black text-white tracking-tight">Restaurant Inventory</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Automatic ingredient deduction on order completion & low-stock warnings.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/20 transition-transform active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Ingredient</span>
        </button>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Total Items</span>
            <Package className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-black text-white">{ingredients.length}</p>
          <p className="text-[10px] text-slate-500">Tracked in recipes</p>
        </div>

        <div
          onClick={() => setSelectedCategory('low_stock')}
          className={`cursor-pointer rounded-2xl p-3.5 space-y-1 border transition-all ${
            lowStockItems.length > 0
              ? 'bg-amber-950/30 border-amber-500/40 text-amber-400'
              : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">Low Stock Alerts</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-black text-amber-300">{lowStockItems.length}</p>
          <p className="text-[10px] text-amber-400/80 font-medium">Under alert threshold</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Stock Valuation</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-emerald-400">${totalValuation.toFixed(2)}</p>
          <p className="text-[10px] text-slate-500">Cost value on shelf</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Auto-Deductions</span>
            <Layers className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-2xl font-black text-blue-400">
            {inventoryMovements.filter((m) => m.type === 'order_deduction').length}
          </p>
          <p className="text-[10px] text-slate-500">Linked to meals served</p>
        </div>
      </div>

      {/* Sub-Tab Selector: Stock List vs Live Deduction Log vs Recipes */}
      <div className="flex gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveSubTab('stock')}
          className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all ${
            activeSubTab === 'stock'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-850'
          }`}
        >
          Ingredients Stock List ({ingredients.length})
        </button>

        <button
          onClick={() => setActiveSubTab('audit_log')}
          className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeSubTab === 'audit_log'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-850'
          }`}
        >
          <span>Auto-Deduction Log</span>
          <span className="bg-slate-800 text-amber-400 text-[10px] px-1.5 py-0.2 rounded-full">
            {inventoryMovements.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('recipes')}
          className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all ${
            activeSubTab === 'recipes'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-850'
          }`}
        >
          Recipe Linkage Guide
        </button>
      </div>

      {/* SUB-TAB 1: INGREDIENTS STOCK LIST */}
      {activeSubTab === 'stock' && (
        <div className="space-y-3">
          {/* Filters and Search */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search mealie-meal, T-Bone, pork chops, dovi, supplier..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* Category Filter Pills */}
            <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
              {[
                { id: 'all', label: 'All' },
                { id: 'low_stock', label: `Low Stock (${lowStockItems.length})` },
                { id: 'staples', label: 'Staples (Upfu/Rice)' },
                { id: 'meat', label: 'Meat & Relish' },
                { id: 'vegetables', label: 'Greens & Veg' },
                { id: 'pantry', label: 'Dovi & Oil' },
                { id: 'beverages', label: 'Beverages' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedCategory(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    selectedCategory === tab.id
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Grid of Ingredient Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredIngredients.map((item) => {
              const isLow = item.currentStock <= item.lowStockThreshold;
              const isOut = item.currentStock <= 0;
              const ratio = Math.min(100, Math.max(0, (item.currentStock / (item.lowStockThreshold * 3)) * 100));

              return (
                <div
                  key={item.id}
                  className={`bg-slate-900 border rounded-2xl p-4 transition-all space-y-3 ${
                    isOut
                      ? 'border-red-500/50 bg-red-950/10'
                      : isLow
                      ? 'border-amber-500/50 bg-amber-950/10'
                      : 'border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white">{item.name}</h4>
                        <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700">
                          {item.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Supplier: {item.supplier || 'Local Market'} • Unit Cost: ${item.costPerUnit.toFixed(2)}/{item.unit}
                      </p>
                    </div>

                    {/* Stock Alert Badge */}
                    <div>
                      {isOut ? (
                        <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/40 text-[10px] font-bold">
                          DEPLETED
                        </span>
                      ) : isLow ? (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-amber-400" />
                          LOW STOCK
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                          IN STOCK
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stock Quantity Meter */}
                  <div className="space-y-1.5 bg-slate-850/80 p-3 rounded-xl border border-slate-800/80">
                    <div className="flex items-baseline justify-between">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-medium">Available Quantity</span>
                        <span className={`text-xl font-black ${isOut ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-white'}`}>
                          {item.currentStock.toFixed(item.unit === 'kg' || item.unit === 'liters' ? 2 : 0)} {item.unit}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">Alert Threshold</span>
                        <span className="text-xs font-bold text-slate-300">
                          &lt;= {item.lowStockThreshold} {item.unit}
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isOut ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${ratio}%` }}
                      />
                    </div>
                  </div>

                  {/* Quick Action Controls */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                    <span className="text-[10px] text-slate-500">
                      Total Val: ${(item.currentStock * item.costPerUnit).toFixed(2)}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          const note = prompt('Reason for stock reduction/waste:', 'Kitchen tasting / spoilage');
                          if (note) onUpdateStock(item.id, -1, 'spoilage', note);
                        }}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-white rounded-lg text-xs font-semibold border border-slate-700"
                        title="Reduce stock for spoilage"
                      >
                        -1 Waste
                      </button>

                      <button
                        onClick={() => {
                          setShowRestockModal({ show: true, ingredient: item });
                          setRestockAmount(item.unit === 'portions' || item.unit === 'bottles' ? '10' : '5');
                        }}
                        className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1 shadow-sm"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Restock</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: AUTO-DEDUCTION & MOVEMENT AUDIT LOG */}
      {activeSubTab === 'audit_log' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Stock Movement & Deduction Audit Trail</h3>
            <span className="text-xs text-slate-400">{inventoryMovements.length} total events</span>
          </div>

          {inventoryMovements.length === 0 ? (
            <div className="text-center py-10 text-slate-500 space-y-2">
              <Info className="w-8 h-8 mx-auto opacity-40" />
              <p className="text-xs">No stock movements recorded yet.</p>
              <p className="text-[11px] text-slate-500">
                When kitchen orders are marked &quot;Completed&quot;, ingredient deductions will show here automatically!
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {inventoryMovements.map((move) => {
                const isDeduction = move.quantityChanged < 0;
                return (
                  <div
                    key={move.id}
                    className="p-3 bg-slate-850 rounded-2xl border border-slate-800 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold ${
                          isDeduction
                            ? 'bg-red-500/15 text-red-400 border border-red-500/20'
                            : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                        }`}
                      >
                        {isDeduction ? (
                          <ArrowDownRight className="w-4 h-4" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{move.ingredientName}</span>
                          <span className="text-[10px] text-slate-400 font-mono">[{move.reference}]</span>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          {new Date(move.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} • By {move.staffName}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span
                        className={`font-mono font-black text-sm block ${
                          isDeduction ? 'text-red-400' : 'text-emerald-400'
                        }`}
                      >
                        {move.quantityChanged > 0 ? `+${move.quantityChanged}` : move.quantityChanged} {move.unit}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        Remaining: {move.resultingStock.toFixed(1)} {move.unit}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 3: RECIPE LINKAGE GUIDE */}
      {activeSubTab === 'recipes' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">How Automatic Deduction Works</h3>
            <p className="text-xs text-slate-400">
              Whenever an order is marked as served/completed, the POS calculates the recipe matrix and
              deducts stock immediately:
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 bg-slate-850 rounded-2xl border border-slate-800 space-y-2">
              <h4 className="font-bold text-amber-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Sadza + T-Bone Steak
              </h4>
              <ul className="space-y-1 text-slate-300">
                <li className="flex justify-between">
                  <span>Maize Meal (Mealie Meal):</span>
                  <span className="font-bold text-white">-0.25 kg</span>
                </li>
                <li className="flex justify-between">
                  <span>T-Bone Cut:</span>
                  <span className="font-bold text-white">-1 portion</span>
                </li>
                <li className="flex justify-between">
                  <span>Covo Greens (Muriwo):</span>
                  <span className="font-bold text-white">-0.15 bundle</span>
                </li>
                <li className="flex justify-between">
                  <span>Pure Cooking Oil:</span>
                  <span className="font-bold text-white">-0.03 liters</span>
                </li>
              </ul>
            </div>

            <div className="p-3.5 bg-slate-850 rounded-2xl border border-slate-800 space-y-2">
              <h4 className="font-bold text-amber-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Sadza Rezviyo + Maguru neMatumbu
              </h4>
              <ul className="space-y-1 text-slate-300">
                <li className="flex justify-between">
                  <span>Finger Millet (Upfu hweZviyo):</span>
                  <span className="font-bold text-white">-0.25 kg</span>
                </li>
                <li className="flex justify-between">
                  <span>Maguru & Matumbu (Offals):</span>
                  <span className="font-bold text-white">-0.30 kg</span>
                </li>
                <li className="flex justify-between">
                  <span>Greens in Dovi:</span>
                  <span className="font-bold text-white">-0.15 bundle + 0.04kg Dovi</span>
                </li>
              </ul>
            </div>

            <div className="p-3.5 bg-slate-850 rounded-2xl border border-slate-800 space-y-2">
              <h4 className="font-bold text-amber-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Rice neDovi + Beef Stew
              </h4>
              <ul className="space-y-1 text-slate-300">
                <li className="flex justify-between">
                  <span>Long Grain Rice:</span>
                  <span className="font-bold text-white">-0.20 kg</span>
                </li>
                <li className="flex justify-between">
                  <span>Peanut Butter (Dovi):</span>
                  <span className="font-bold text-white">-0.06 kg</span>
                </li>
                <li className="flex justify-between">
                  <span>Stewing Beef:</span>
                  <span className="font-bold text-white">-0.30 kg</span>
                </li>
              </ul>
            </div>

            <div className="p-3.5 bg-slate-850 rounded-2xl border border-slate-800 space-y-2">
              <h4 className="font-bold text-amber-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Beverages & Chibuku
              </h4>
              <ul className="space-y-1 text-slate-300">
                <li className="flex justify-between">
                  <span>Chibuku Super / Mazoe / Zambezi:</span>
                  <span className="font-bold text-white">-1 unit per bottle/can</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD NEW INGREDIENT */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md text-white shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="p-4 bg-slate-850 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">Add New Ingredient</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateIngredient} className="p-4 overflow-y-auto space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">Ingredient / Stock Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Goat Meat (Mbudzi), Sugar Beans, Cooking Gas..."
                  value={newForm.name}
                  onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Category</label>
                  <select
                    value={newForm.category}
                    onChange={(e) => setNewForm({ ...newForm, category: e.target.value as any })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="staples">Staples (Upfu/Rice)</option>
                    <option value="meat">Meat & Relish</option>
                    <option value="vegetables">Greens & Veg</option>
                    <option value="pantry">Pantry & Oil</option>
                    <option value="beverages">Beverages</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Unit of Measure</label>
                  <select
                    value={newForm.unit}
                    onChange={(e) => setNewForm({ ...newForm, unit: e.target.value as any })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="kg">Kilograms (kg)</option>
                    <option value="portions">Portions / Cuts</option>
                    <option value="liters">Liters (L)</option>
                    <option value="bottles">Bottles / Cans</option>
                    <option value="bundles">Bundles (Greens)</option>
                    <option value="packs">Packs</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Initial Stock Quantity</label>
                  <input
                    type="number"
                    step="0.1"
                    value={newForm.currentStock}
                    onChange={(e) => setNewForm({ ...newForm, currentStock: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Low Stock Alert Threshold</label>
                  <input
                    type="number"
                    step="0.5"
                    value={newForm.lowStockThreshold}
                    onChange={(e) =>
                      setNewForm({ ...newForm, lowStockThreshold: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Cost Per Unit ($ USD)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={newForm.costPerUnit}
                    onChange={(e) => setNewForm({ ...newForm, costPerUnit: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Supplier / Market Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Mbare Musika..."
                    value={newForm.supplier}
                    onChange={(e) => setNewForm({ ...newForm, supplier: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full mt-2 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs shadow-lg shadow-amber-500/20"
              >
                Save Ingredient To Inventory
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: QUICK RESTOCK */}
      {showRestockModal.show && showRestockModal.ingredient && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-sm text-white shadow-2xl p-5 space-y-4">
            <div>
              <span className="text-[10px] font-bold uppercase text-amber-400">Add Stock Delivery</span>
              <h3 className="text-base font-bold text-white">{showRestockModal.ingredient.name}</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Current: {showRestockModal.ingredient.currentStock} {showRestockModal.ingredient.unit}
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Quantity to Add ({showRestockModal.ingredient.unit})
                </label>
                <input
                  type="number"
                  step="0.5"
                  autoFocus
                  value={restockAmount}
                  onChange={(e) => setRestockAmount(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-bold focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Delivery / Supplier Note</label>
                <input
                  type="text"
                  value={restockNote}
                  onChange={(e) => setRestockNote(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowRestockModal({ show: false })}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteRestock}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black shadow-lg shadow-amber-500/20"
              >
                Add To Stock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
