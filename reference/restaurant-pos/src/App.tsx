import React, { useState, useEffect } from 'react';
import {
  CashExpense,
  Order,
  OrderStatus,
  PaymentRecord,
  PrinterDevice,
  RestaurantSettings,
  ZReport,
  InventoryIngredient,
  InventoryMovement,
  ZimbabweanMealItem,
  PosUser
} from './types';
import {
  DEFAULT_RESTAURANT_SETTINGS,
  INITIAL_INVENTORY_INGREDIENTS,
  INITIAL_ZIMBABWEAN_ORDERS
} from './data/zimbabweanData';
import { Header } from './components/Header';
import { Navigation, TabType } from './components/Navigation';
import { ZimbabweanOrderEntry } from './components/ZimbabweanOrderEntry';
import { KitchenTracker } from './components/KitchenTracker';
import { InventoryView } from './components/InventoryView';
import { AccountingView } from './components/AccountingView';
import { SettingsView } from './components/SettingsView';
import { ReceiptModal } from './components/ReceiptModal';
import { PrinterModal } from './components/PrinterModal';
import { LoginScreen, INITIAL_STAFF_USERS } from './components/LoginScreen';
import { bluetoothService, formatReceiptText, sendPrintJob } from './utils/bluetoothPrinter';

export default function App() {
  // Navigation: Default to POS Meals
  const [activeTab, setActiveTab] = useState<TabType>('pos');

  // Persistence keys
  const STORAGE_KEY_SETTINGS = 'zim_pos_settings_v2';
  const STORAGE_KEY_ORDERS = 'zim_pos_orders_v2';
  const STORAGE_KEY_INGREDIENTS = 'zim_pos_ingredients_v2';
  const STORAGE_KEY_MOVEMENTS = 'zim_pos_movements_v2';
  const STORAGE_KEY_EXPENSES = 'zim_pos_expenses_v2';
  const STORAGE_KEY_PRINTER = 'zim_pos_printer_v2';

  // User & Authentication State
  const [currentUser, setCurrentUser] = useState<PosUser | null>(() => {
    const saved = localStorage.getItem('zim_pos_user');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return INITIAL_STAFF_USERS[0];
  });
  const [isLocked, setIsLocked] = useState<boolean>(false);

  // Cashier Identity
  const [currentCashier, setCurrentCashier] = useState<string>(() => currentUser?.name || 'Chipo M.');

  // Settings State
  const [settings, setSettings] = useState<RestaurantSettings>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return DEFAULT_RESTAURANT_SETTINGS;
  });

  // Orders State (Zimbabwean Counter Orders)
  const [orders, setOrders] = useState<Order[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_ORDERS);
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return INITIAL_ZIMBABWEAN_ORDERS;
  });

  // Inventory Ingredients State
  const [ingredients, setIngredients] = useState<InventoryIngredient[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_INGREDIENTS);
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return INITIAL_INVENTORY_INGREDIENTS;
  });

  // Inventory Movement Audit Log
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_MOVEMENTS);
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return [
      {
        id: 'mov-init-1',
        ingredientId: 'ing-meat-1',
        ingredientName: 'T-Bone Steak Cuts',
        type: 'order_deduction',
        quantityChanged: -1,
        unit: 'portions',
        resultingStock: 24,
        reference: 'Order #38 Completed',
        timestamp: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
        staffName: 'Kitchen Plater'
      },
      {
        id: 'mov-init-2',
        ingredientId: 'ing-staple-1',
        ingredientName: 'Super White Maize Meal (Upfu)',
        type: 'order_deduction',
        quantityChanged: -0.25,
        unit: 'kg',
        resultingStock: 34.75,
        reference: 'Order #38 Completed',
        timestamp: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
        staffName: 'Kitchen Cook'
      },
      {
        id: 'mov-init-3',
        ingredientId: 'ing-meat-4',
        ingredientName: 'Maguru & Matumbu (Beef Offals)',
        type: 'manual_restock',
        quantityChanged: 15,
        unit: 'kg',
        resultingStock: 18,
        reference: 'Morning Butchery Delivery',
        timestamp: new Date(Date.now() - 180 * 60 * 1000).toISOString(),
        staffName: 'Manager Farai'
      }
    ];
  });

  // Cash Expenses State
  const [cashExpenses, setCashExpenses] = useState<CashExpense[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_EXPENSES);
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return [
      {
        id: 'exp-zim-1',
        description: 'Fresh Covo & Tsunga from Mbare Musika',
        amount: 15.00,
        category: 'Produce',
        timestamp: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
        staffName: 'Chipo M.'
      },
      {
        id: 'exp-zim-2',
        description: 'Cooking Gas Refill (48kg cylinder)',
        amount: 45.00,
        category: 'Maintenance',
        timestamp: new Date(Date.now() - 240 * 60 * 1000).toISOString(),
        staffName: 'Farai T.'
      }
    ];
  });

  const [openingFloat] = useState<number>(100.00); // 100 USD opening cash

  // Bluetooth Thermal Printer Device State
  const [printer, setPrinter] = useState<PrinterDevice>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PRINTER);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.type === 'simulated') parsed.type = 'bluetooth';
        return parsed;
      } catch {}
    }
    return {
      connected: false,
      name: 'ESC/POS 58mm Thermal Printer',
      type: 'bluetooth',
      paperWidth: '58mm',
      autoPrintOnPayment: true,
      receiptCopies: 1,
      isConnecting: false,
    };
  });

  // Modals
  const [showPrinterModal, setShowPrinterModal] = useState<boolean>(false);
  const [receiptModalData, setReceiptModalData] = useState<{
    show: boolean;
    order?: Order;
    payment?: PaymentRecord;
    zReport?: ZReport;
    mode?: 'customer' | 'kitchen' | 'bill';
  }>({ show: false });

  // Notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Sync state to local storage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ORDERS, JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_INGREDIENTS, JSON.stringify(ingredients));
  }, [ingredients]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_MOVEMENTS, JSON.stringify(inventoryMovements));
  }, [inventoryMovements]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_EXPENSES, JSON.stringify(cashExpenses));
  }, [cashExpenses]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PRINTER, JSON.stringify(printer));
  }, [printer]);

  const handleToggleTheme = () => {
    const nextTheme = settings.theme === 'dark' ? 'light' : 'dark';
    setSettings((prev) => ({ ...prev, theme: nextTheme }));
  };

  useEffect(() => {
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings.theme]);

  // Derived metrics
  const nextOrderNumber = Math.max(40, ...orders.map((o) => o.orderNumber || 0)) + 1;

  const lowStockIngredientsList = ingredients
    .filter((i) => i.currentStock <= i.lowStockThreshold)
    .map((i) => i.name);

  const kitchenBadgeCount = orders.filter(
    (o) => o.status === 'in_prep' || o.status === 'ready' || o.status === 'pending'
  ).length;

  // -------------------------------------------------------------
  // AUTOMATIC INVENTORY DEDUCTION ON ORDER COMPLETION
  // -------------------------------------------------------------
  const deductInventoryForOrder = (order: Order) => {
    const deductions: { ingredientId: string; ingredientName: string; amount: number; unit: string }[] = [];

    // Deduct meals & ingredients
    if (order.meals && order.meals.length > 0) {
      order.meals.forEach((meal) => {
        const qty = meal.quantity || 1;

        // 1. Base Staple deductions
        if (meal.baseStapleId.includes('sadza-white') || meal.baseStapleName.toLowerCase().includes('sadza')) {
          if (meal.baseStapleId.includes('zviyo') || meal.baseStapleName.toLowerCase().includes('zviyo')) {
            deductions.push({
              ingredientId: 'ing-staple-2',
              ingredientName: 'Finger Millet (Upfu hweZviyo)',
              amount: 0.25 * qty,
              unit: 'kg'
            });
          } else {
            deductions.push({
              ingredientId: 'ing-staple-1',
              ingredientName: 'Super White Maize Meal (Upfu)',
              amount: 0.25 * qty,
              unit: 'kg'
            });
          }
        } else if (meal.baseStapleName.toLowerCase().includes('rice')) {
          deductions.push({
            ingredientId: 'ing-staple-3',
            ingredientName: 'Long Grain White Rice',
            amount: 0.20 * qty,
            unit: 'kg'
          });
          if (meal.baseStapleName.toLowerCase().includes('dovi')) {
            deductions.push({
              ingredientId: 'ing-pantry-1',
              ingredientName: 'Natural Peanut Butter (Dovi)',
              amount: 0.06 * qty,
              unit: 'kg'
            });
          }
        } else if (meal.baseStapleName.toLowerCase().includes('spaghetti')) {
          deductions.push({
            ingredientId: 'ing-staple-4',
            ingredientName: 'Spaghetti Pasta',
            amount: 0.20 * qty,
            unit: 'kg'
          });
        }

        // 2. Relish deductions
        const relishLower = meal.relishName.toLowerCase();
        if (relishLower.includes('t-bone') || meal.relishId === 'rel-tbone') {
          deductions.push({
            ingredientId: 'ing-meat-1',
            ingredientName: 'T-Bone Steak Cuts',
            amount: 1 * qty,
            unit: 'portions'
          });
        } else if (relishLower.includes('pork') || meal.relishId === 'rel-pork') {
          deductions.push({
            ingredientId: 'ing-meat-2',
            ingredientName: 'Pork Chops',
            amount: 1 * qty,
            unit: 'portions'
          });
        } else if (relishLower.includes('beef') || meal.relishId === 'rel-beef') {
          deductions.push({
            ingredientId: 'ing-meat-3',
            ingredientName: 'Stewing Beef',
            amount: 0.30 * qty,
            unit: 'kg'
          });
        } else if (relishLower.includes('maguru') || relishLower.includes('matumbu') || meal.relishId === 'rel-maguru') {
          deductions.push({
            ingredientId: 'ing-meat-4',
            ingredientName: 'Maguru & Matumbu (Beef Offals)',
            amount: 0.30 * qty,
            unit: 'kg'
          });
        } else if (relishLower.includes('roadrunner') || meal.relishId === 'rel-roadrunner') {
          deductions.push({
            ingredientId: 'ing-meat-5',
            ingredientName: 'Roadrunner Village Chicken',
            amount: 1 * qty,
            unit: 'portions'
          });
        } else if (relishLower.includes('mazondo') || meal.relishId === 'rel-mazondo') {
          deductions.push({
            ingredientId: 'ing-meat-6',
            ingredientName: 'Cow Heels (Mazondo)',
            amount: 0.40 * qty,
            unit: 'kg'
          });
        } else if (relishLower.includes('bream') || relishLower.includes('fish') || meal.relishId === 'rel-fish') {
          deductions.push({
            ingredientId: 'ing-meat-7',
            ingredientName: 'Fresh Kariba Bream Fish',
            amount: 1 * qty,
            unit: 'portions'
          });
        } else if (relishLower.includes('oxtail') || meal.relishId === 'rel-oxtail') {
          deductions.push({
            ingredientId: 'ing-meat-8',
            ingredientName: 'Oxtail Cuts',
            amount: 0.35 * qty,
            unit: 'kg'
          });
        } else if (relishLower.includes('bean') || meal.relishId === 'rel-beans') {
          deductions.push({
            ingredientId: 'ing-meat-9',
            ingredientName: 'Sugar Beans',
            amount: 0.20 * qty,
            unit: 'kg'
          });
        }

        // 3. Vegetable side deductions
        if (meal.vegetableName) {
          const vegLower = meal.vegetableName.toLowerCase();
          if (vegLower.includes('covo')) {
            deductions.push({
              ingredientId: 'ing-veg-1',
              ingredientName: 'Fresh Covo Greens',
              amount: 0.15 * qty,
              unit: 'bundles'
            });
            if (vegLower.includes('dovi')) {
              deductions.push({
                ingredientId: 'ing-pantry-1',
                ingredientName: 'Natural Peanut Butter (Dovi)',
                amount: 0.04 * qty,
                unit: 'kg'
              });
            }
          } else if (vegLower.includes('rape') || vegLower.includes('tsunga')) {
            deductions.push({
              ingredientId: 'ing-veg-2',
              ingredientName: 'Rape / Tsunga Greens',
              amount: 0.15 * qty,
              unit: 'bundles'
            });
          } else if (vegLower.includes('chakalaka')) {
            deductions.push({
              ingredientId: 'ing-veg-3',
              ingredientName: 'Fresh Tomatoes & Salad Veg',
              amount: 0.10 * qty,
              unit: 'kg'
            });
          }
        }

        // 4. Cooking Oil per meal
        deductions.push({
          ingredientId: 'ing-pantry-2',
          ingredientName: 'Pure Cooking Oil',
          amount: 0.02 * qty,
          unit: 'liters'
        });
      });
    }

    // 5. Drinks Deductions
    if (order.drinks && order.drinks.length > 0) {
      order.drinks.forEach((d) => {
        const dLower = d.name.toLowerCase();
        let targetId = 'ing-bev-1';
        let targetName = 'Mazoe Orange Crush (2L / Portions)';

        if (dLower.includes('chibuku')) {
          targetId = 'ing-bev-2';
          targetName = 'Chibuku Super Carton';
        } else if (dLower.includes('zambezi')) {
          targetId = 'ing-bev-3';
          targetName = 'Zambezi Lager (330ml Can)';
        } else if (dLower.includes('castle')) {
          targetId = 'ing-bev-4';
          targetName = 'Castle Lite (330ml Can)';
        }

        deductions.push({
          ingredientId: targetId,
          ingredientName: targetName,
          amount: d.quantity || 1,
          unit: targetId === 'ing-bev-1' ? 'liters' : 'bottles'
        });
      });
    }

    if (deductions.length === 0) return;

    // Apply deductions to stock and record movements
    const newMovements: InventoryMovement[] = [];

    setIngredients((prev) =>
      prev.map((ing) => {
        const match = deductions.find((d) => d.ingredientId === ing.id || ing.name.toLowerCase().includes(d.ingredientName.toLowerCase()));
        if (match) {
          const newStock = Math.max(0, ing.currentStock - match.amount);
          newMovements.push({
            id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            ingredientId: ing.id,
            ingredientName: ing.name,
            type: 'order_deduction',
            quantityChanged: -match.amount,
            unit: ing.unit,
            resultingStock: newStock,
            reference: `Order #${order.orderNumber} Completed`,
            timestamp: new Date().toISOString(),
            staffName: currentCashier
          });
          return { ...ing, currentStock: newStock };
        }
        return ing;
      })
    );

    if (newMovements.length > 0) {
      setInventoryMovements((prev) => [...newMovements, ...prev]);
    }

    showToast(`Order #${order.orderNumber} served! Auto-deducted ${deductions.length} ingredients from stock.`);
  };

  // -------------------------------------------------------------
  // ACTIONS
  // -------------------------------------------------------------
  const handleCompleteNewOrder = (newOrder: Order) => {
    setOrders((prev) => [newOrder, ...prev]);

    // Always open receipt modal upon placing order so cashier can immediately print / hand slip to customer
    setReceiptModalData({
      show: true,
      order: newOrder,
      payment: newOrder.payments?.[0],
      mode: 'customer'
    });

    if (printer.connected && (settings.autoPrintOnPayment || printer.autoPrintOnPayment)) {
      const receiptText = formatReceiptText(newOrder, newOrder.payments?.[0], printer.paperWidth, settings);
      sendPrintJob(receiptText, printer, settings).catch(console.warn);
    }

    const serviceMsg = newOrder.serviceType === 'sit_in'
      ? `Order #${newOrder.orderNumber} sent to kitchen! Customer waiting for number to be called.`
      : `Order #${newOrder.orderNumber} sent to kitchen (Takeaway parcel).`;

    showToast(serviceMsg);
  };

  const handleUpdateOrderStatus = (orderId: string, newStatus: OrderStatus) => {
    const target = orders.find((o) => o.id === orderId);
    if (!target) return;

    // Trigger inventory deduction if moving to 'served'
    if (newStatus === 'served' && target.status !== 'served') {
      deductInventoryForOrder(target);
    }

    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
    );

    if (newStatus === 'ready') {
      showToast(`Order #${target.orderNumber} is Ready! Called out for collection.`);
    }
  };

  // Inventory Management Actions
  const handleAddIngredient = (newIngredient: InventoryIngredient) => {
    setIngredients((prev) => [newIngredient, ...prev]);
    showToast(`Added "${newIngredient.name}" to inventory.`);
  };

  const handleUpdateStock = (
    ingredientId: string,
    delta: number,
    type: 'manual_restock' | 'adjustment' | 'spoilage',
    reference: string
  ) => {
    const target = ingredients.find((i) => i.id === ingredientId);
    if (!target) return;

    const resultingStock = Math.max(0, target.currentStock + delta);
    setIngredients((prev) =>
      prev.map((i) => (i.id === ingredientId ? { ...i, currentStock: resultingStock } : i))
    );

    const movement: InventoryMovement = {
      id: `mov-${Date.now()}`,
      ingredientId,
      ingredientName: target.name,
      type,
      quantityChanged: delta,
      unit: target.unit,
      resultingStock,
      reference,
      timestamp: new Date().toISOString(),
      staffName: currentCashier
    };

    setInventoryMovements((prev) => [movement, ...prev]);
    showToast(`Updated stock for ${target.name}: ${resultingStock} ${target.unit}`);
  };

  const handleUpdateThreshold = (ingredientId: string, newThreshold: number) => {
    setIngredients((prev) =>
      prev.map((i) => (i.id === ingredientId ? { ...i, lowStockThreshold: newThreshold } : i))
    );
  };

  // Z-Report Generation
  const handleGenerateZReport = (countedCash: number): ZReport => {
    const paidOrders = orders.filter((o) => o.status !== 'cancelled' && (o.payments?.length || 0) > 0);
    const grossSales = paidOrders.reduce((acc, o) => acc + (o.totalAmount || o.subtotal || 0), 0);
    const allPayments = paidOrders.flatMap((o) => o.payments || []);

    const cashSales = allPayments
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

    const totalCashPayouts = cashExpenses.reduce((acc, exp) => acc + exp.amount, 0);
    const expectedCash = openingFloat + cashSales - totalCashPayouts;
    const variance = countedCash - expectedCash;

    const report: ZReport = {
      id: `Z-${Date.now().toString().slice(-6)}`,
      date: new Date().toLocaleDateString(),
      generatedAt: new Date().toISOString(),
      closedBy: currentCashier,
      openingFloat,
      grossSales,
      taxCollected: 0,
      tipsCollected: 0,
      netSales: grossSales,
      totalOrders: paidOrders.length,
      cashSales,
      cardSales,
      mobileSales: ecocashSales + innbucksSales,
      otherSales: zigCashSales + zigSwipeSales,
      paymentBreakdown: {
        usd_cash: cashSales,
        ecocash: ecocashSales,
        innbucks: innbucksSales,
        zig_cash: zigCashSales,
        zig_swipe: zigSwipeSales,
        card: cardSales
      },
      cashPayouts: totalCashPayouts,
      expectedDrawerCash: expectedCash,
      countedCash,
      cashVariance: variance,
      zigExchangeRateUsed: settings.zigExchangeRate
    };

    setReceiptModalData({
      show: true,
      zReport: report
    });

    return report;
  };

  const handleResetDemoData = () => {
    setOrders(INITIAL_ZIMBABWEAN_ORDERS);
    setIngredients(INITIAL_INVENTORY_INGREDIENTS);
    setSettings(DEFAULT_RESTAURANT_SETTINGS);
    showToast('Reset data to Zimbabwean authentic menu and ingredients.');
  };

  if (isLocked || !currentUser) {
    return (
      <LoginScreen
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          setCurrentCashier(user.name);
          setIsLocked(false);
          localStorage.setItem('zim_pos_user', JSON.stringify(user));
          showToast(`Welcome ${user.name}`);
        }}
        settings={settings}
        theme={settings.theme || 'light'}
        onToggleTheme={handleToggleTheme}
        initialSelectedUserId={currentUser?.id}
      />
    );
  }

  const isDark = settings.theme === 'dark';

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-150 ${
      isDark ? 'bg-slate-950 text-slate-100 dark' : 'bg-slate-100 text-slate-900'
    }`}>
      {/* App Header */}
      <Header
        currentCashier={currentCashier}
        onCashierChange={setCurrentCashier}
        printer={printer}
        onOpenPrinterModal={() => setShowPrinterModal(true)}
        settings={settings}
        lowStockCount={lowStockIngredientsList.length}
        onNavigateToInventory={() => setActiveTab('inventory')}
        theme={settings.theme || 'light'}
        onToggleTheme={handleToggleTheme}
        currentUser={currentUser}
        onLockPos={() => setIsLocked(true)}
      />

      {/* Main Tab Views */}
      <main className="flex-1 overflow-x-hidden">
        {activeTab === 'pos' && (
          <ZimbabweanOrderEntry
            settings={settings}
            cashierName={currentCashier}
            onCompleteNewOrder={handleCompleteNewOrder}
            onOpenPrinterModal={() => setShowPrinterModal(true)}
            nextOrderNumber={nextOrderNumber}
            lowStockIngredients={lowStockIngredientsList}
            theme={settings.theme || 'light'}
          />
        )}

        {activeTab === 'kitchen' && (
          <KitchenTracker
            orders={orders}
            onUpdateOrderStatus={handleUpdateOrderStatus}
            onPrintTicket={(order) => {
              setReceiptModalData({ show: true, order, mode: 'kitchen' });
            }}
            settings={settings}
            theme={settings.theme || 'light'}
          />
        )}

        {activeTab === 'inventory' && (
          <InventoryView
            ingredients={ingredients}
            inventoryMovements={inventoryMovements}
            onAddIngredient={handleAddIngredient}
            onUpdateStock={handleUpdateStock}
            onUpdateThreshold={handleUpdateThreshold}
            theme={settings.theme || 'light'}
          />
        )}

        {activeTab === 'accounting' && (
          <AccountingView
            orders={orders}
            cashExpenses={cashExpenses}
            openingFloat={openingFloat}
            currentCashier={currentCashier}
            onAddExpense={(exp) => setCashExpenses((prev) => [exp, ...prev])}
            onGenerateZReport={handleGenerateZReport}
            onPrintZReport={(report) => setReceiptModalData({ show: true, zReport: report })}
            onPrintOrderReceipt={(order, payment) => setReceiptModalData({ show: true, order, payment })}
            settings={settings}
            theme={settings.theme || 'light'}
          />
        )}

        {activeTab === 'printer' && (
          <div className="py-6 px-4 max-w-xl mx-auto">
            <PrinterModal
              printer={printer}
              onUpdatePrinter={(updates) => setPrinter((prev) => ({ ...prev, ...updates }))}
              onClose={() => setActiveTab('pos')}
              onPrintTestReceipt={() => {
                const sampleOrder = orders[0] || INITIAL_ZIMBABWEAN_ORDERS[0];
                setReceiptModalData({
                  show: true,
                  order: sampleOrder,
                  payment: sampleOrder.payments?.[0]
                });
              }}
              settings={settings}
              theme={settings.theme || 'light'}
            />
          </div>
        )}

        {activeTab === 'settings' && (
          <SettingsView
            settings={settings}
            onUpdateSettings={(newSettings) => {
              setSettings(newSettings);
              showToast('Saved restaurant settings & ZiG exchange rate!');
            }}
            printer={printer}
            onOpenPrinterModal={() => setShowPrinterModal(true)}
            onResetDemoData={handleResetDemoData}
            theme={settings.theme || 'light'}
          />
        )}
      </main>

      {/* Bottom Sticky Navigation */}
      <Navigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        kitchenBadgeCount={kitchenBadgeCount}
        lowStockCount={lowStockIngredientsList.length}
        theme={settings.theme || 'light'}
      />

      {/* RECEIPT MODAL (Thermal Print & System Print) */}
      {receiptModalData.show && (
        <ReceiptModal
          order={receiptModalData.order}
          payment={receiptModalData.payment}
          zReport={receiptModalData.zReport}
          printer={printer}
          initialType={receiptModalData.mode}
          onClose={() => setReceiptModalData({ show: false })}
          onOpenPrinterSetup={() => {
            setReceiptModalData({ show: false });
            setShowPrinterModal(true);
          }}
          settings={settings}
          theme={settings.theme}
        />
      )}

      {/* STANDALONE PRINTER MODAL (When triggered from Header) */}
      {showPrinterModal && (
        <PrinterModal
          printer={printer}
          onUpdatePrinter={(updates) => setPrinter((prev) => ({ ...prev, ...updates }))}
          onClose={() => setShowPrinterModal(false)}
          onPrintTestReceipt={() => {
            const sampleOrder = orders[0] || INITIAL_ZIMBABWEAN_ORDERS[0];
            setReceiptModalData({
              show: true,
              order: sampleOrder,
              payment: sampleOrder.payments?.[0]
            });
            setShowPrinterModal(false);
          }}
          settings={settings}
        />
      )}

      {/* Global Toast Notification */}
      {toastMessage && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-[#6495ED] text-white font-bold px-4 py-2 rounded-xl shadow-md text-xs max-w-sm text-center border border-[#6495ED]/80">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
