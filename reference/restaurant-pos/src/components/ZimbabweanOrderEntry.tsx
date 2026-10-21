import React, { useState } from 'react';
import {
  Order,
  RestaurantSettings,
  ServiceType,
  PaymentMethod,
  ZimbabweanMealItem,
  DrinkOrderItem,
  BaseStaple,
  RelishOption,
  VegetableSide,
  DrinkOption,
  ThemeMode
} from '../types';
import {
  BASE_STAPLES,
  RELISH_OPTIONS,
  VEGETABLE_SIDES,
  DRINK_OPTIONS
} from '../data/zimbabweanData';
import {
  Utensils,
  Coffee,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  DollarSign,
  Smartphone,
  CreditCard,
  Banknote,
  X,
  Sparkles,
  Layers,
  ArrowRight
} from 'lucide-react';

interface ZimbabweanOrderEntryProps {
  settings: RestaurantSettings;
  cashierName: string;
  onCompleteNewOrder: (order: Order) => void;
  onOpenPrinterModal: () => void;
  nextOrderNumber: number;
  lowStockIngredients?: string[];
  theme?: ThemeMode;
}

// Popular Zimbabwean 1-Tap Combos
interface PopularCombo {
  id: string;
  name: string;
  shonaName: string;
  price: number;
  stapleId: string;
  stapleName: string;
  relishId: string;
  relishName: string;
  vegId: string;
  vegName: string;
  popularNote?: string;
}

const POPULAR_COMBOS: PopularCombo[] = [
  {
    id: 'combo-tbone',
    name: 'Sadza & T-Bone Steak',
    shonaName: 'Sadza neT-Bone yeMombe',
    price: 6.50,
    stapleId: 'staple-sadza',
    stapleName: 'Sadza (White Maize)',
    relishId: 'rel-tbone',
    relishName: 'T-Bone Steak',
    vegId: 'veg-covo-dovi',
    vegName: 'Covo neDovi (Greens in Peanut Butter)'
  },
  {
    id: 'combo-beef',
    name: 'Sadza & Beef Stew',
    shonaName: 'Sadza neNyama yeMombe',
    price: 5.00,
    stapleId: 'staple-sadza',
    stapleName: 'Sadza (White Maize)',
    relishId: 'rel-beef',
    relishName: 'Beef Stew',
    vegId: 'veg-rape',
    vegName: 'Fried Rape / Tsunga Greens'
  },
  {
    id: 'combo-roadrunner',
    name: 'Sadza & Road Runner Chicken',
    shonaName: 'Sadza neHuku yeChibhoyi',
    price: 6.50,
    stapleId: 'staple-sadza',
    stapleName: 'Sadza (White Maize)',
    relishId: 'rel-roadrunner',
    relishName: 'Roadrunner Chicken',
    vegId: 'veg-covo-dovi',
    vegName: 'Covo neDovi (Greens in Peanut Butter)'
  },
  {
    id: 'combo-pork',
    name: 'Sadza & Pork Chop',
    shonaName: 'Sadza nePork Chop',
    price: 5.50,
    stapleId: 'staple-sadza',
    stapleName: 'Sadza (White Maize)',
    relishId: 'rel-porkchop',
    relishName: 'Pork Chop',
    vegId: 'veg-chakalaka',
    vegName: 'Spicy Chakalaka Relish'
  },
  {
    id: 'combo-maguru',
    name: 'Sadza & Maguru (Offals)',
    shonaName: 'Sadza neMaguru neMatumbu',
    price: 4.50,
    stapleId: 'staple-sadza',
    stapleName: 'Sadza (White Maize)',
    relishId: 'rel-maguru',
    relishName: 'Maguru & Matumbu (Offals)',
    vegId: 'veg-rape',
    vegName: 'Fried Rape / Tsunga Greens'
  },
  {
    id: 'combo-mazondo',
    name: 'Sadza & Mazondo (Cow Trotters)',
    shonaName: 'Sadza neMazondo eMombe',
    price: 5.50,
    stapleId: 'staple-sadza',
    stapleName: 'Sadza (White Maize)',
    relishId: 'rel-mazondo',
    relishName: 'Mazondo (Cow Trotters)',
    vegId: 'veg-covo-dovi',
    vegName: 'Covo neDovi (Greens in Peanut Butter)'
  },
  {
    id: 'combo-fish',
    name: 'Sadza & Crispy Fried Fish',
    shonaName: 'Sadza neHove yeBream',
    price: 6.00,
    stapleId: 'staple-sadza',
    stapleName: 'Sadza (White Maize)',
    relishId: 'rel-fish',
    relishName: 'Fried Kariba Bream / Fish',
    vegId: 'veg-rape',
    vegName: 'Fried Rape / Tsunga Greens'
  },
  {
    id: 'combo-zviyo-chicken',
    name: 'Sadza Rezviyo & Roadrunner',
    shonaName: 'Sadza Rezviyo neHuku yeChibhoyi',
    price: 6.50,
    stapleId: 'staple-rezviyo',
    stapleName: 'Sadza Rezviyo (Brown Millet)',
    relishId: 'rel-roadrunner',
    relishName: 'Roadrunner Chicken',
    vegId: 'veg-covo-dovi',
    vegName: 'Covo neDovi (Greens in Peanut Butter)'
  },
  {
    id: 'combo-ricedovi-beef',
    name: 'Rice neDovi & Beef Stew',
    shonaName: 'Mupunga uneDovi neNyama',
    price: 6.00,
    stapleId: 'staple-ricedovi',
    stapleName: 'Rice neDovi (Peanut Butter Rice)',
    relishId: 'rel-beef',
    relishName: 'Beef Stew',
    vegId: 'veg-rape',
    vegName: 'Fried Rape / Tsunga Greens'
  },
  {
    id: 'combo-beans',
    name: 'Sadza & Sugar Beans (Veg)',
    shonaName: 'Sadza neMabhinzi ane Muto',
    price: 3.50,
    stapleId: 'staple-sadza',
    stapleName: 'Sadza (White Maize)',
    relishId: 'rel-beans',
    relishName: 'Sugar Beans Stew (Vegetarian)',
    vegId: 'veg-covo-dovi',
    vegName: 'Covo neDovi (Greens in Peanut Butter)'
  }
];

const TABLE_OPTIONS = ['Table 1', 'Table 2', 'Table 3', 'Table 4', 'Table 5', 'Table 6', 'Braai Patio', 'Counter'];

export const ZimbabweanOrderEntry: React.FC<ZimbabweanOrderEntryProps> = ({
  settings,
  cashierName,
  onCompleteNewOrder,
  nextOrderNumber,
  theme = 'light'
}) => {
  const isDark = theme === 'dark';

  // Order Context
  const [serviceType, setServiceType] = useState<ServiceType>(settings.defaultServiceType || 'sit_in');
  const [tableNumber, setTableNumber] = useState<string>('Table 1');
  const [customerName, setCustomerName] = useState<string>('');

  // Active Catalog Tab: 'combos' | 'custom' | 'drinks'
  const [activeCatalogTab, setActiveCatalogTab] = useState<'combos' | 'custom' | 'drinks'>('combos');

  // Custom Builder state (for custom tab)
  const [customStaple, setCustomStaple] = useState<BaseStaple>(BASE_STAPLES[0]);
  const [customRelish, setCustomRelish] = useState<RelishOption>(RELISH_OPTIONS[0]);
  const [customVeg, setCustomVeg] = useState<VegetableSide>(VEGETABLE_SIDES[0]);
  const [customNotes, setCustomNotes] = useState<string>('');

  // Cart / Ticket
  const [cartMeals, setCartMeals] = useState<ZimbabweanMealItem[]>([]);
  const [cartDrinks, setCartDrinks] = useState<DrinkOrderItem[]>([]);

  // Payment Modal
  const [showPayModal, setShowPayModal] = useState<boolean>(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('usd_cash');
  const [tenderedAmount, setTenderedAmount] = useState<string>('');
  const [ecocashRef, setEcocashRef] = useState<string>('');

  // Calculations
  const mealsTotal = cartMeals.reduce((sum, m) => sum + m.totalPrice, 0);
  const drinksTotal = cartDrinks.reduce((sum, d) => sum + d.totalPrice, 0);
  const totalUsd = mealsTotal + drinksTotal;
  const totalZig = totalUsd * settings.zigExchangeRate;
  const totalItemsCount = cartMeals.reduce((sum, m) => sum + m.quantity, 0) + cartDrinks.reduce((sum, d) => sum + d.quantity, 0);

  // 1-Click Add Popular Combo
  const handleAddPopularCombo = (combo: PopularCombo) => {
    setCartMeals((prev) => {
      const existingIndex = prev.findIndex(
        (m) => m.baseStapleId === combo.stapleId && m.relishId === combo.relishId && !m.notes
      );
      if (existingIndex > -1) {
        return prev.map((item, idx) =>
          idx === existingIndex
            ? {
                ...item,
                quantity: item.quantity + 1,
                totalPrice: (item.quantity + 1) * combo.price
              }
            : item
        );
      }
      return [
        ...prev,
        {
          uid: `meal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          baseStapleId: combo.stapleId,
          baseStapleName: combo.stapleName,
          relishId: combo.relishId,
          relishName: combo.relishName,
          relishPrice: combo.price,
          vegetableId: combo.vegId,
          vegetableName: combo.vegName,
          quantity: 1,
          totalPrice: combo.price
        }
      ];
    });
  };

  // Add Custom Plate
  const handleAddCustomPlate = () => {
    const price = customRelish.price;
    setCartMeals((prev) => [
      ...prev,
      {
        uid: `meal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        baseStapleId: customStaple.id,
        baseStapleName: customStaple.name,
        relishId: customRelish.id,
        relishName: customRelish.name,
        relishPrice: price,
        vegetableId: customVeg.id,
        vegetableName: customVeg.name,
        notes: customNotes.trim() || undefined,
        quantity: 1,
        totalPrice: price
      }
    ]);
    setCustomNotes('');
  };

  // Quick 1-Tap Add Drink
  const handleAddDrink = (drink: DrinkOption) => {
    setCartDrinks((prev) => {
      const existing = prev.find((d) => d.drinkId === drink.id);
      if (existing) {
        return prev.map((d) =>
          d.drinkId === drink.id
            ? { ...d, quantity: d.quantity + 1, totalPrice: (d.quantity + 1) * d.price }
            : d
        );
      }
      return [
        ...prev,
        {
          uid: `drink-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          drinkId: drink.id,
          name: drink.name,
          price: drink.price,
          quantity: 1,
          totalPrice: drink.price
        }
      ];
    });
  };

  // Meal quantity modifiers
  const handleUpdateMealQty = (uid: string, delta: number) => {
    setCartMeals((prev) =>
      prev
        .map((m) => {
          if (m.uid === uid) {
            const nextQty = m.quantity + delta;
            if (nextQty <= 0) return null;
            return {
              ...m,
              quantity: nextQty,
              totalPrice: nextQty * m.relishPrice
            };
          }
          return m;
        })
        .filter(Boolean) as ZimbabweanMealItem[]
    );
  };

  // Drink quantity modifiers
  const handleUpdateDrinkQty = (uid: string, delta: number) => {
    setCartDrinks((prev) =>
      prev
        .map((d) => {
          if (d.uid === uid) {
            const nextQty = d.quantity + delta;
            if (nextQty <= 0) return null;
            return {
              ...d,
              quantity: nextQty,
              totalPrice: nextQty * d.price
            };
          }
          return d;
        })
        .filter(Boolean) as DrinkOrderItem[]
    );
  };

  const handleRemoveMeal = (uid: string) => {
    setCartMeals((prev) => prev.filter((m) => m.uid !== uid));
  };

  const handleRemoveDrink = (uid: string) => {
    setCartDrinks((prev) => prev.filter((d) => d.uid !== uid));
  };

  const handleClearCart = () => {
    setCartMeals([]);
    setCartDrinks([]);
  };

  // Open Checkout Modal
  const handleOpenPayment = () => {
    if (totalItemsCount === 0) return;
    setTenderedAmount(Math.ceil(totalUsd).toString());
    setShowPayModal(true);
  };

  // Confirm Order Submission
  const handleConfirmOrder = () => {
    const tendered = parseFloat(tenderedAmount) || totalUsd;
    const changeUsd = Math.max(0, tendered - totalUsd);

    const newOrder: Order = {
      id: `ord-${Date.now()}`,
      orderNumber: nextOrderNumber,
      status: 'in_prep',
      serviceType,
      tableNumber: serviceType === 'sit_in' ? tableNumber : undefined,
      customerName: customerName.trim() || undefined,
      cashierName,
      createdAt: new Date().toISOString(),
      meals: cartMeals,
      drinks: cartDrinks,
      total: totalUsd,
      totalUsd,
      totalZig,
      tax: 0,
      discount: 0,
      items: [
        ...cartMeals.map((m) => ({
          uid: m.uid,
          name: `${m.baseStapleName} with ${m.relishName}`,
          price: m.relishPrice,
          quantity: m.quantity,
          side: m.vegetableName,
          specialInstructions: m.notes
        })),
        ...cartDrinks.map((d) => ({
          uid: d.uid,
          name: d.name,
          price: d.price,
          quantity: d.quantity
        }))
      ],
      payments: [
        {
          id: `pay-${Date.now()}`,
          orderId: `ord-${Date.now()}`,
          orderNumber: nextOrderNumber,
          amount: totalUsd,
          total: totalUsd,
          amountUsd: totalUsd,
          amountZig: totalZig,
          currency: paymentMethod === 'zig_cash' || paymentMethod === 'zig_swipe' ? 'ZiG' : 'USD',
          zigAmount: totalZig,
          zigRateUsed: settings.zigExchangeRate,
          method: paymentMethod,
          tenderedCash: paymentMethod === 'usd_cash' ? tendered : undefined,
          tenderedUsd: paymentMethod === 'usd_cash' ? tendered : totalUsd,
          changeGiven: paymentMethod === 'usd_cash' ? changeUsd : 0,
          changeUsd: paymentMethod === 'usd_cash' ? changeUsd : 0,
          ecocashRef: paymentMethod === 'ecocash' ? ecocashRef.trim() : undefined,
          ecocashReference: paymentMethod === 'ecocash' ? ecocashRef.trim() : undefined,
          timestamp: new Date().toISOString(),
          cashierName
        }
      ]
    };

    onCompleteNewOrder(newOrder);

    // Reset Form
    setCartMeals([]);
    setCartDrinks([]);
    setCustomerName('');
    setShowPayModal(false);
  };

  return (
    <div className="pb-28 pt-2 px-3 sm:px-5 max-w-7xl mx-auto">
      {/* 1. ORDER CONTEXT BAR: Dine In / Takeaway + Table + Token */}
      <div className={`p-3 rounded-2xl border mb-4 flex flex-wrap items-center justify-between gap-3 ${
        isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
      }`}>
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Service Toggle */}
          <div className={`inline-flex p-1 rounded-xl border ${
            isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
          }`}>
            <button
              onClick={() => setServiceType('sit_in')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                serviceType === 'sit_in'
                  ? 'bg-[#6495ED] text-white shadow-xs'
                  : isDark
                  ? 'text-slate-400 hover:text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Utensils className="w-3.5 h-3.5" />
              <span>Dine In (Sit-In)</span>
            </button>
            <button
              onClick={() => setServiceType('takeaway')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                serviceType === 'takeaway'
                  ? 'bg-[#6495ED] text-white shadow-xs'
                  : isDark
                  ? 'text-slate-400 hover:text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Coffee className="w-3.5 h-3.5" />
              <span>Takeaway</span>
            </button>
          </div>

          {/* Table Selector (If Dine In) */}
          {serviceType === 'sit_in' && (
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Table:
              </span>
              <select
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                className={`text-xs font-bold py-1.5 px-2.5 rounded-xl border focus:outline-none ${
                  isDark
                    ? 'bg-slate-800 border-slate-700 text-white'
                    : 'bg-white border-slate-200 text-slate-800'
                }`}
              >
                {TABLE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Customer Name / Note */}
          <input
            type="text"
            placeholder="Customer name (optional)..."
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className={`text-xs py-1.5 px-3 rounded-xl border focus:outline-none max-w-[180px] sm:max-w-xs ${
              isDark
                ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500'
                : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
            }`}
          />
        </div>

        {/* Current Token Badge */}
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Next Order:
          </span>
          <span className="bg-[#F9812A] text-white text-xs font-bold px-2.5 py-1 rounded-xl shadow-xs">
            Token #{nextOrderNumber}
          </span>
        </div>
      </div>

      {/* 2. MAIN 2-COLUMN POS LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT 7-8 COLS: MENU CATALOG */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-3">
          {/* Category Tabs: Popular Combos, Custom Plate, Drinks */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setActiveCatalogTab('combos')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                activeCatalogTab === 'combos'
                  ? 'bg-[#6495ED] text-white shadow-xs'
                  : isDark
                  ? 'text-slate-400 hover:text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Popular Combos (1-Tap)</span>
            </button>

            <button
              onClick={() => setActiveCatalogTab('custom')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                activeCatalogTab === 'custom'
                  ? 'bg-[#6495ED] text-white shadow-xs'
                  : isDark
                  ? 'text-slate-400 hover:text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Custom Plate</span>
            </button>

            <button
              onClick={() => setActiveCatalogTab('drinks')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                activeCatalogTab === 'drinks'
                  ? 'bg-[#6495ED] text-white shadow-xs'
                  : isDark
                  ? 'text-slate-400 hover:text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Coffee className="w-3.5 h-3.5" />
              <span>Cold Drinks & Beers</span>
            </button>
          </div>

          {/* TAB 1: POPULAR COMBOS (1-Tap Add) */}
          {activeCatalogTab === 'combos' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {POPULAR_COMBOS.map((combo) => {
                const inCart = cartMeals.find(
                  (m) => m.baseStapleId === combo.stapleId && m.relishId === combo.relishId && !m.notes
                );
                const comboZig = (combo.price * settings.zigExchangeRate).toFixed(0);

                return (
                  <button
                    key={combo.id}
                    onClick={() => handleAddPopularCombo(combo)}
                    className={`p-3 rounded-2xl border text-left transition-all active:scale-97 cursor-pointer flex flex-col justify-between relative group ${
                      inCart
                        ? isDark
                          ? 'bg-[#6495ED]/15 border-[#6495ED] ring-1 ring-[#6495ED]'
                          : 'bg-[#6495ED]/10 border-[#6495ED] ring-1 ring-[#6495ED]/30 shadow-xs'
                        : isDark
                        ? 'bg-slate-900 border-slate-800 hover:border-slate-700'
                        : 'bg-white border-slate-200 hover:border-[#6495ED]/50 hover:shadow-xs'
                    }`}
                  >
                    {inCart && (
                      <div className="absolute top-2 right-2 bg-[#6495ED] text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-xs">
                        {inCart.quantity}
                      </div>
                    )}
                    <div>
                      <h4 className="text-xs font-bold leading-tight text-slate-900 dark:text-white pr-4">
                        {combo.name}
                      </h4>
                      <p className={`text-[10px] font-medium italic mt-0.5 line-clamp-1 ${
                        isDark ? 'text-slate-400' : 'text-slate-500'
                      }`}>
                        {combo.shonaName}
                      </p>
                      <p className={`text-[10px] mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        Served with {combo.vegName.split(' ')[0]}
                      </p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-baseline justify-between">
                      <span className="text-sm font-bold text-[#F9812A]">
                        ${combo.price.toFixed(2)}
                      </span>
                      <span className={`text-[10px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {comboZig} ZiG
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* TAB 2: CUSTOM PLATE BUILDER */}
          {activeCatalogTab === 'custom' && (
            <div className={`p-4 rounded-2xl border space-y-4 ${
              isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              {/* Row 1: Staple */}
              <div>
                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-2 ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  1. Choose Base Staple
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {BASE_STAPLES.map((st) => {
                    const sel = customStaple.id === st.id;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setCustomStaple(st)}
                        className={`p-2.5 rounded-xl border text-left text-xs font-bold cursor-pointer transition-colors ${
                          sel
                            ? 'bg-[#6495ED] text-white border-[#6495ED] shadow-xs'
                            : isDark
                            ? 'bg-slate-850 border-slate-800 text-slate-300 hover:border-slate-700'
                            : 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100'
                        }`}
                      >
                        <div>{st.name}</div>
                        <div className={`text-[10px] font-normal italic ${sel ? 'text-blue-100' : 'text-slate-400'}`}>
                          {st.shonaName}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row 2: Meat / Relish */}
              <div>
                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-2 ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  2. Choose Relish (Nyama)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {RELISH_OPTIONS.map((rel) => {
                    const sel = customRelish.id === rel.id;
                    return (
                      <button
                        key={rel.id}
                        type="button"
                        onClick={() => setCustomRelish(rel)}
                        className={`p-2.5 rounded-xl border text-left text-xs font-bold cursor-pointer transition-colors flex justify-between items-center ${
                          sel
                            ? 'bg-[#6495ED] text-white border-[#6495ED] shadow-xs'
                            : isDark
                            ? 'bg-slate-850 border-slate-800 text-slate-300 hover:border-slate-700'
                            : 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100'
                        }`}
                      >
                        <span className="truncate pr-1">{rel.name}</span>
                        <span className={`text-xs font-bold ${sel ? 'text-white' : 'text-[#F9812A]'}`}>
                          ${rel.price.toFixed(2)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row 3: Greens */}
              <div>
                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-2 ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  3. Complimentary Greens (Muriwo)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {VEGETABLE_SIDES.map((veg) => {
                    const sel = customVeg.id === veg.id;
                    return (
                      <button
                        key={veg.id}
                        type="button"
                        onClick={() => setCustomVeg(veg)}
                        className={`p-2.5 rounded-xl border text-left text-xs font-bold cursor-pointer transition-colors ${
                          sel
                            ? 'bg-[#6495ED] text-white border-[#6495ED] shadow-xs'
                            : isDark
                            ? 'bg-slate-850 border-slate-800 text-slate-300 hover:border-slate-700'
                            : 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100'
                        }`}
                      >
                        <div>{veg.name}</div>
                        <div className={`text-[10px] font-normal ${sel ? 'text-blue-100' : 'text-slate-400'}`}>
                          Included
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row 4: Custom Notes & Add Button */}
              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="text"
                  placeholder="Notes: e.g. Firm Sadza, Extra Gravy, Muto parutivi..."
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                  className={`flex-1 text-xs py-2 px-3 rounded-xl border focus:outline-none ${
                    isDark
                      ? 'bg-slate-850 border-slate-700 text-white placeholder-slate-500'
                      : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
                  }`}
                />
                <button
                  type="button"
                  onClick={handleAddCustomPlate}
                  className="py-2.5 px-5 bg-[#6495ED] hover:bg-[#5284dc] text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Custom Plate (${customRelish.price.toFixed(2)})</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: COLD DRINKS & BEERS */}
          {activeCatalogTab === 'drinks' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {DRINK_OPTIONS.map((drink) => {
                const inCart = cartDrinks.find((d) => d.drinkId === drink.id);
                const drinkZig = (drink.price * settings.zigExchangeRate).toFixed(0);

                return (
                  <button
                    key={drink.id}
                    onClick={() => handleAddDrink(drink)}
                    className={`p-3 rounded-2xl border text-left transition-all active:scale-97 cursor-pointer flex flex-col justify-between relative group ${
                      inCart
                        ? isDark
                          ? 'bg-[#6495ED]/15 border-[#6495ED] ring-1 ring-[#6495ED]'
                          : 'bg-[#6495ED]/10 border-[#6495ED] ring-1 ring-[#6495ED]/30 shadow-xs'
                        : isDark
                        ? 'bg-slate-900 border-slate-800 hover:border-slate-700'
                        : 'bg-white border-slate-200 hover:border-[#6495ED]/50 hover:shadow-xs'
                    }`}
                  >
                    {inCart && (
                      <div className="absolute top-2 right-2 bg-[#6495ED] text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-xs">
                        {inCart.quantity}
                      </div>
                    )}
                    <div>
                      <h4 className="text-xs font-bold leading-tight text-slate-900 dark:text-white pr-4">
                        {drink.name}
                      </h4>
                      <p className={`text-[10px] mt-0.5 uppercase tracking-wider font-bold ${
                        isDark ? 'text-slate-400' : 'text-slate-500'
                      }`}>
                        {drink.category}
                      </p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-baseline justify-between">
                      <span className="text-sm font-bold text-[#F9812A]">
                        ${drink.price.toFixed(2)}
                      </span>
                      <span className={`text-[10px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {drinkZig} ZiG
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT 4-5 COLS: ACTIVE ORDER TICKET (CART) */}
        <div className="lg:col-span-5 xl:col-span-4 sticky top-16">
          <div className={`rounded-2xl border overflow-hidden shadow-xs flex flex-col ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            {/* Ticket Header */}
            <div className={`p-3.5 border-b flex items-center justify-between ${
              isDark ? 'bg-slate-850 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
                    Order Ticket #{nextOrderNumber}
                  </h3>
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-[#F9812A] text-white">
                    {serviceType === 'sit_in' ? 'Sit-In' : 'Takeaway'}
                  </span>
                </div>
                <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {serviceType === 'sit_in' ? `${tableNumber} • ` : ''}Cashier: {cashierName}
                </p>
              </div>

              {totalItemsCount > 0 && (
                <button
                  onClick={handleClearCart}
                  className={`text-[11px] font-bold px-2 py-1 rounded-lg cursor-pointer transition-colors ${
                    isDark ? 'text-slate-400 hover:text-rose-400' : 'text-slate-500 hover:text-rose-600'
                  }`}
                  title="Clear Ticket"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Ticket Items List */}
            <div className="p-3 max-h-[380px] overflow-y-auto space-y-2.5 divide-y divide-slate-100 dark:divide-slate-800/60">
              {totalItemsCount === 0 ? (
                <div className={`py-12 text-center text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  <Utensils className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="font-bold">Ticket is Empty</p>
                  <p className="text-[11px] mt-0.5">Tap any combo or drink on the left to add</p>
                </div>
              ) : (
                <>
                  {/* Meals */}
                  {cartMeals.map((meal) => (
                    <div key={meal.uid} className="pt-2.5 first:pt-0 flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h5 className="text-xs font-bold truncate text-slate-900 dark:text-white">
                          {meal.baseStapleName.split(' ')[0]} + {meal.relishName}
                        </h5>
                        <p className={`text-[10px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          Side: {meal.vegetableName?.split(' ')[0]}
                          {meal.notes ? ` • Note: ${meal.notes}` : ''}
                        </p>
                        <span className="text-xs font-bold text-[#F9812A]">
                          ${meal.totalPrice.toFixed(2)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleUpdateMealQty(meal.uid, -1)}
                          className={`w-6 h-6 rounded-lg border flex items-center justify-center cursor-pointer ${
                            isDark
                              ? 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                              : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-black w-5 text-center">{meal.quantity}</span>
                        <button
                          onClick={() => handleUpdateMealQty(meal.uid, 1)}
                          className={`w-6 h-6 rounded-lg border flex items-center justify-center cursor-pointer ${
                            isDark
                              ? 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                              : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleRemoveMeal(meal.uid)}
                          className="w-6 h-6 rounded-lg text-slate-400 hover:text-rose-500 flex items-center justify-center cursor-pointer ml-0.5"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Drinks */}
                  {cartDrinks.map((drink) => (
                    <div key={drink.uid} className="pt-2.5 first:pt-0 flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h5 className="text-xs font-bold truncate text-slate-900 dark:text-white">
                          {drink.name}
                        </h5>
                        <span className="text-xs font-bold text-[#F9812A]">
                          ${drink.totalPrice.toFixed(2)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleUpdateDrinkQty(drink.uid, -1)}
                          className={`w-6 h-6 rounded-lg border flex items-center justify-center cursor-pointer ${
                            isDark
                              ? 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                              : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-bold w-5 text-center">{drink.quantity}</span>
                        <button
                          onClick={() => handleUpdateDrinkQty(drink.uid, 1)}
                          className={`w-6 h-6 rounded-lg border flex items-center justify-center cursor-pointer ${
                            isDark
                              ? 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                              : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleRemoveDrink(drink.uid)}
                          className="w-6 h-6 rounded-lg text-slate-400 hover:text-rose-500 flex items-center justify-center cursor-pointer ml-0.5"
                          title="Remove drink"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Ticket Totals & Checkout CTA */}
            <div className={`p-3.5 border-t space-y-3 ${
              isDark ? 'bg-slate-850 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="space-y-1">
                <div className="flex items-baseline justify-between">
                  <span className={`text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Total Due (USD):
                  </span>
                  <span className="text-xl font-bold text-slate-900 dark:text-white">
                    ${totalUsd.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Converted to ZiG ({settings.zigExchangeRate.toFixed(2)}/USD):
                  </span>
                  <span className="text-xs font-mono font-bold text-[#F9812A]">
                    {totalZig.toFixed(2)} ZiG
                  </span>
                </div>
              </div>

              {/* Big High-Intent Action Button */}
              <button
                onClick={handleOpenPayment}
                disabled={totalItemsCount === 0}
                className={`w-full py-3.5 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-xs ${
                  totalItemsCount === 0
                    ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                    : 'bg-[#F9812A] hover:bg-[#e0701a] text-white active:scale-98 cursor-pointer'
                }`}
              >
                <span>Pay ${totalUsd.toFixed(2)}</span>
                <span className="text-[11px] font-mono bg-black/15 px-2 py-0.5 rounded-md">
                  {totalZig.toFixed(0)} ZiG
                </span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. FAST SIMPLIFIED PAYMENT MODAL */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className={`border rounded-2xl w-full max-w-md shadow-lg overflow-hidden ${
            isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            {/* Modal Header */}
            <div className={`p-4 border-b flex items-center justify-between ${
              isDark ? 'bg-slate-850 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div>
                <h3 className="text-base font-bold">
                  Complete Payment • Order #{nextOrderNumber}
                </h3>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Total: <strong className="text-[#F9812A]">${totalUsd.toFixed(2)} USD</strong> ({totalZig.toFixed(2)} ZiG)
                </p>
              </div>
              <button
                onClick={() => setShowPayModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-4">
              {/* Payment Method Selector */}
              <div>
                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-2 ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  Select Payment Method
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('usd_cash')}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
                      paymentMethod === 'usd_cash'
                        ? 'bg-[#6495ED] text-white border-[#6495ED]'
                        : isDark
                        ? 'bg-slate-850 border-slate-800 text-slate-300'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Banknote className="w-4 h-4" />
                    <span>USD Cash</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('ecocash')}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
                      paymentMethod === 'ecocash'
                        ? 'bg-[#6495ED] text-white border-[#6495ED]'
                        : isDark
                        ? 'bg-slate-850 border-slate-800 text-slate-300'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>EcoCash</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('zig_cash')}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
                      paymentMethod === 'zig_cash'
                        ? 'bg-[#6495ED] text-white border-[#6495ED]'
                        : isDark
                        ? 'bg-slate-850 border-slate-800 text-slate-300'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <DollarSign className="w-4 h-4" />
                    <span>ZiG Cash</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('card')}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
                      paymentMethod === 'card'
                        ? 'bg-[#6495ED] text-white border-[#6495ED]'
                        : isDark
                        ? 'bg-slate-850 border-slate-800 text-slate-300'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Card / POS Swipe</span>
                  </button>
                </div>
              </div>

              {/* Method Specific Fields */}
              {paymentMethod === 'usd_cash' && (
                <div className={`p-3 rounded-xl border space-y-2 ${
                  isDark ? 'bg-slate-850 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold">USD Tendered:</span>
                    <div className="flex gap-1">
                      {[Math.ceil(totalUsd), 5, 10, 20, 50, 100].filter((v, i, arr) => arr.indexOf(v) === i && v >= Math.ceil(totalUsd)).slice(0, 4).map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setTenderedAmount(val.toString())}
                          className={`px-2 py-0.5 rounded text-[11px] font-bold border cursor-pointer ${
                            tenderedAmount === val.toString()
                              ? 'bg-[#6495ED] text-white border-[#6495ED]'
                              : isDark
                              ? 'bg-slate-800 border-slate-700 text-slate-300'
                              : 'bg-white border-slate-300 text-slate-700'
                          }`}
                        >
                          ${val}
                        </button>
                      ))}
                    </div>
                  </div>

                  <input
                    type="number"
                    step="0.5"
                    value={tenderedAmount}
                    onChange={(e) => setTenderedAmount(e.target.value)}
                    className={`w-full rounded-lg px-3 py-2 text-sm font-bold border focus:outline-none ${
                      isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />

                  {parseFloat(tenderedAmount) >= totalUsd && (
                    <div className="pt-1 flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                      <span>Change to Return:</span>
                      <span className="font-bold text-sm">
                        ${(parseFloat(tenderedAmount) - totalUsd).toFixed(2)} USD
                      </span>
                    </div>
                  )}
                </div>
              )}

              {paymentMethod === 'ecocash' && (
                <div className={`p-3 rounded-xl border space-y-2 ${
                  isDark ? 'bg-slate-850 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="text-xs p-2 rounded-lg bg-[#6495ED]/10 text-[#6495ED] border border-[#6495ED]/30">
                    <p className="font-bold">EcoCash Merchant Till:</p>
                    <p className="font-mono text-xs font-bold mt-0.5">{settings.ecocashMerchantCode}</p>
                  </div>
                  <div>
                    <label className={`block text-[11px] font-bold mb-1 ${
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}>
                      EcoCash Approval Code / Reference
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. MP240918.1234..."
                      value={ecocashRef}
                      onChange={(e) => setEcocashRef(e.target.value)}
                      className={`w-full rounded-lg px-3 py-2 text-xs border focus:outline-none ${
                        isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                </div>
              )}

              {paymentMethod === 'zig_cash' && (
                <div className={`p-3 rounded-xl border space-y-2 text-xs ${
                  isDark ? 'bg-slate-850 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <span>Total Due in ZiG:</span>
                    <span className="font-mono font-bold text-sm text-[#F9812A]">
                      {totalZig.toFixed(2)} ZiG
                    </span>
                  </div>
                  <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Rate: 1 USD = {settings.zigExchangeRate.toFixed(2)} ZiG
                  </p>
                </div>
              )}

              {paymentMethod === 'card' && (
                <div className={`p-3 rounded-xl border text-xs ${
                  isDark ? 'bg-slate-850 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <p className="font-bold">Swipe or Tap on POS Terminal</p>
                  <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Charge: ${totalUsd.toFixed(2)} USD or equivalent ZiG swipe
                  </p>
                </div>
              )}

              {/* Submit CTA */}
              <button
                onClick={handleConfirmOrder}
                className="w-full py-3 px-4 bg-[#F9812A] hover:bg-[#e0701a] text-white font-bold text-sm rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2 active:scale-98"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm & Print Receipt</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
