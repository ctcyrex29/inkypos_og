export type ServiceType = 'sit_in' | 'takeaway';

export interface IngredientDeduction {
  ingredientId: string;
  amount: number;
}

export interface RelishOption {
  id: string;
  name: string;
  shonaName?: string;
  category: 'beef' | 'pork' | 'chicken' | 'offals' | 'fish' | 'vegetarian';
  price: number; // USD
  description: string;
  ingredients: IngredientDeduction[];
  isAvailable: boolean;
}

export interface BaseStaple {
  id: string;
  name: string;
  shonaName?: string;
  description: string;
  ingredients: IngredientDeduction[];
  isAvailable: boolean;
}

export interface VegetableSide {
  id: string;
  name: string;
  shonaName?: string;
  price: number; // 0 if standard choice
  ingredients: IngredientDeduction[];
}

export interface DrinkOption {
  id: string;
  name: string;
  category: 'cordial' | 'soft_drink' | 'beer' | 'traditional' | 'water';
  price: number; // USD
  description?: string;
  ingredientId: string;
  isAvailable: boolean;
}

export interface ZimbabweanMealItem {
  uid: string;
  baseStapleId: string;
  baseStapleName: string;
  relishId: string;
  relishName: string;
  relishPrice: number;
  vegetableId?: string;
  vegetableName?: string;
  extraRelishId?: string;
  extraRelishName?: string;
  extraRelishPrice?: number;
  notes?: string; // e.g. "Sadza rakaoma", "Extra soup/muto"
  quantity: number;
  totalPrice: number;
}

export interface DrinkOrderItem {
  uid: string;
  drinkId: string;
  name: string;
  price: number;
  quantity: number;
  totalPrice: number;
}

export type OrderStatus = 'pending_payment' | 'in_prep' | 'ready' | 'served' | 'cancelled' | 'ordering' | 'paid';

export type PaymentMethod = 
  | 'usd_cash' 
  | 'ecocash' 
  | 'innbucks' 
  | 'zig_cash' 
  | 'zig_swipe' 
  | 'card'
  | 'cash'
  | 'apple_pay'
  | 'google_pay';

export interface PaymentRecord {
  id: string;
  orderId: string;
  amount: number; // In USD
  total: number; // In USD
  method: PaymentMethod;
  currency?: 'USD' | 'ZiG';
  zigAmount?: number;
  zigRateUsed?: number;
  timestamp: string;
  tenderedCash?: number;
  changeGiven?: number;
  ecocashRef?: string;
  cardLast4?: string;
  note?: string;
  tip?: number;
  splitType?: string;
  guestLabel?: string;
  // Extended & compatibility fields
  orderNumber?: number;
  amountUsd?: number;
  amountZig?: number;
  tenderedUsd?: number;
  changeUsd?: number;
  ecocashReference?: string;
  cashierName?: string;
}

export interface MenuItemModifier {
  id: string;
  name: string;
  price: number;
}

export interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  category: string;
  available?: boolean;
  isAvailable?: boolean;
  modifiers?: MenuItemModifier[];
  availableModifiers?: MenuItemModifier[];
  isVegetarian?: boolean;
  isGlutenFree?: boolean;
  prepTimeMinutes?: number;
  imageUrl?: string;
}

export interface Table {
  id: string;
  number: number;
  name: string;
  capacity: number;
  status: 'available' | 'seated' | 'ordering' | 'paid' | 'billing' | 'served';
  currentOrderId?: string;
  area?: string;
  zone?: string;
}

export interface OrderItem {
  uid: string;
  menuItemId?: string;
  name: string;
  price: number;
  quantity: number;
  seatNumber?: number;
  modifiers?: MenuItemModifier[];
  specialInstructions?: string;
  status?: string;
}

export interface Order {
  id: string;
  orderNumber: number; // Token called out: e.g. 42
  serviceType?: ServiceType; // Sit-in vs Takeaway
  customerName?: string;
  tableNumber?: string; // Optional for sit-in
  cashierName?: string;
  status: OrderStatus;
  meals?: ZimbabweanMealItem[];
  drinks?: DrinkOrderItem[];
  notes?: string;
  createdAt: string;
  paidAt?: string;
  readyAt?: string;
  sentToKitchenAt?: string;
  completedAt?: string;
  payments: PaymentRecord[];
  subtotal?: number; // USD
  taxRate?: number; // e.g. 0.15 or 0
  taxAmount?: number; // USD
  totalAmount?: number; // USD
  total?: number; // USD convenience alias
  tax?: number; // USD convenience alias
  discount?: number; // USD convenience alias
  totalUsd?: number; // USD direct
  totalZig?: number; // ZiG direct
  // Legacy / print compatibility fields
  tableId?: string;
  tableName?: string;
  serverName?: string;
  guestCount?: number;
  items?: Array<{
    uid: string;
    menuItemId?: string;
    name: string;
    price: number;
    quantity: number;
    seatNumber?: number;
    modifiers?: MenuItemModifier[];
    specialInstructions?: string;
    status?: string;
  }>;
}

export interface InventoryIngredient {
  id: string;
  name: string;
  category: 'staples' | 'meat' | 'vegetables' | 'pantry' | 'beverages';
  currentStock: number;
  unit: 'kg' | 'portions' | 'liters' | 'bottles' | 'bundles' | 'packs';
  lowStockThreshold: number;
  costPerUnit: number; // USD
  supplier?: string;
  lastRestocked: string;
}

export interface InventoryMovement {
  id: string;
  ingredientId: string;
  ingredientName: string;
  type: 'order_deduction' | 'manual_restock' | 'adjustment' | 'spoilage';
  quantityChanged: number; // negative for deduction, positive for restock
  resultingStock: number;
  unit: string;
  reference: string; // e.g. "Order #42" or "Supplier Purchase"
  timestamp: string;
  staffName: string;
}

export interface RestaurantSettings {
  restaurantName: string;
  tagline: string;
  address: string;
  phone: string;
  ecocashMerchantCode: string;
  innbucksCode?: string;
  zigExchangeRate: number; // e.g. 27.5 ZiG per 1 USD
  taxRate: number; // e.g. 0 or 0.15 (15% ZIMRA VAT)
  taxEnabled: boolean;
  voiceCallerEnabled: boolean;
  speechRate: number;
  defaultServiceType: ServiceType;
  autoPrintOnPayment: boolean;
  paperWidth: '58mm' | '80mm';
  printDarkness?: 'normal' | 'dark' | 'deep_black';
  receiptLogo?: string;
  receiptLogoTitle?: string;
  showLogoOnReceipt?: boolean;
  receiptCopies?: number;
}

export interface PrinterDevice {
  connected: boolean;
  name: string;
  id?: string;
  isConnecting: boolean;
  paperWidth: '58mm' | '80mm';
  printDarkness?: 'normal' | 'dark' | 'deep_black';
  autoPrintOnPayment: boolean;
  receiptCopies?: number;
  batteryLevel?: number;
  type: 'bluetooth' | 'browser' | 'usb_serial' | 'android_intent';
}

export interface CashExpense {
  id: string;
  description: string;
  amount: number;
  category: 'Produce' | 'Dairy/Meat' | 'Meat' | 'Beverages' | 'Bar/Beverage' | 'Charcoal/Gas' | 'Petty Cash' | 'Maintenance' | 'Miscellaneous';
  timestamp: string;
  staffName: string;
}

export interface ZReport {
  id: string;
  date: string;
  generatedAt: string;
  closedBy: string;
  totalOrders: number;
  grossSales: number;
  discounts?: number;
  netSales: number;
  taxCollected: number;
  tipsCollected: number;
  paymentBreakdown: {
    usd_cash: number;
    ecocash: number;
    innbucks: number;
    zig_cash: number;
    zig_swipe: number;
    card: number;
  };
  openingFloat: number;
  cashSales: number;
  cardSales?: number;
  mobileSales?: number;
  otherSales?: number;
  cashPayouts: number;
  expectedDrawerCash: number;
  countedCash: number;
  cashVariance: number;
  zigExchangeRateUsed: number;
}

export type StaffRole = 'cashier' | 'server' | 'manager' | 'kitchen';

export interface PosUser {
  id: string;
  name: string;
  role: StaffRole;
  pin: string;
  avatarInitials: string;
  color?: string;
}

export type ThemeMode = 'light' | 'dark';
