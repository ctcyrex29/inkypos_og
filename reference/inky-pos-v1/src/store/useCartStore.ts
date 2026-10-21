// src/store/useCartStore.ts
import { create } from 'zustand';
import { Product } from '../db/schema';
import { generateUUID } from '../db/sqlite';

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface HeldTransaction {
  id: string;
  items: CartItem[];
  notes: string;
  timestamp: string;
}

interface CartState {
  items: CartItem[];
  heldTransactions: HeldTransaction[];
  discountAmount: number; // in USD (base currency)
  discountType: 'fixed' | 'percent';
  
  // Actions
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  setDiscount: (amount: number, type: 'fixed' | 'percent') => void;
  
  // Hold & Resume
  holdCart: (notes?: string) => void;
  resumeCart: (heldId: string) => void;
  deleteHeldTransaction: (heldId: string) => void;
  
  // Computations
  getTotals: (taxRate: number, exchangeRate: number) => {
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    totalZiG: number;
  };
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  heldTransactions: [],
  discountAmount: 0,
  discountType: 'fixed',

  addToCart: (product: Product, quantity = 1) => {
    const currentItems = get().items;
    const existingIndex = currentItems.findIndex((item) => item.product.id === product.id);

    if (existingIndex > -1) {
      const updated = [...currentItems];
      updated[existingIndex].quantity += quantity;
      set({ items: updated });
    } else {
      set({ items: [...currentItems, { product, quantity }] });
    }
  },

  removeFromCart: (productId: string) => {
    set({ items: get().items.filter((item) => item.product.id !== productId) });
  },

  updateQuantity: (productId: string, quantity: number) => {
    if (quantity <= 0) {
      get().removeFromCart(productId);
      return;
    }
    const updated = get().items.map((item) => 
      item.product.id === productId ? { ...item, quantity } : item
    );
    set({ items: updated });
  },

  clearCart: () => {
    set({ items: [], discountAmount: 0, discountType: 'fixed' });
  },

  setDiscount: (amount: number, type: 'fixed' | 'percent') => {
    set({ discountAmount: amount, discountType: type });
  },

  holdCart: (notes = 'Held Sale') => {
    const currentItems = get().items;
    if (currentItems.length === 0) return;

    const newHeld: HeldTransaction = {
      id: generateUUID(),
      items: currentItems,
      notes,
      timestamp: new Date().toISOString()
    };

    set({
      heldTransactions: [...get().heldTransactions, newHeld],
      items: [],
      discountAmount: 0,
      discountType: 'fixed'
    });
  },

  resumeCart: (heldId: string) => {
    const target = get().heldTransactions.find((h) => h.id === heldId);
    if (!target) return;

    set({
      items: target.items,
      heldTransactions: get().heldTransactions.filter((h) => h.id !== heldId)
    });
  },

  deleteHeldTransaction: (heldId: string) => {
    set({
      heldTransactions: get().heldTransactions.filter((h) => h.id !== heldId)
    });
  },

  getTotals: (taxRate: number, exchangeRate: number) => {
    const items = get().items;
    const discountAmount = get().discountAmount;
    const discountType = get().discountType;

    // Subtotal
    const subtotal = items.reduce((acc, item) => acc + item.product.selling_price * item.quantity, 0);

    // Discount
    let discount = 0;
    if (discountType === 'fixed') {
      discount = Math.min(discountAmount, subtotal);
    } else {
      discount = subtotal * (discountAmount / 100);
    }

    const discountedSubtotal = Math.max(0, subtotal - discount);

    // Tax (exclusive VAT)
    const tax = discountedSubtotal * (taxRate / 100);
    
    // Total
    const total = discountedSubtotal + tax;
    const totalZiG = total * exchangeRate;

    return {
      subtotal,
      discount,
      tax,
      total,
      totalZiG
    };
  }
}));
