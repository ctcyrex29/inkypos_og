// src/store/useSettingsStore.ts
import { create } from 'zustand';
import { getDatabase } from '../db/sqlite';
import { Business } from '../db/schema';

interface SettingsState {
  business: Business | null;
  zigExchangeRate: number; // e.g. 25.5 ZiG to 1 USD
  baseCurrency: 'USD' | 'ZiG';
  printerAddress: string | null;
  printerWidth: '58mm' | '80mm';
  isLoading: boolean;
  
  // Actions
  loadSettings: (businessId?: string) => Promise<void>;
  updateExchangeRate: (rate: number) => Promise<boolean>;
  updateBusinessDetails: (details: Partial<Business>) => Promise<boolean>;
  setPrinterAddress: (address: string | null) => void;
  setPrinterWidth: (width: '58mm' | '80mm') => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  business: null,
  zigExchangeRate: 25.5,
  baseCurrency: 'USD',
  printerAddress: null,
  printerWidth: '80mm',
  isLoading: false,

  loadSettings: async (businessId?: string) => {
    set({ isLoading: true });
    try {
      const db = await getDatabase();
      let queryStr = 'SELECT * FROM businesses LIMIT 1;';
      let queryParams: any[] = [];
      
      if (businessId) {
        queryStr = 'SELECT * FROM businesses WHERE id = ? LIMIT 1;';
        queryParams = [businessId];
      }

      const results = await db.getAllAsync<Business>(queryStr, queryParams);
      if (results.length > 0) {
        const biz = results[0];
        set({
          business: biz,
          zigExchangeRate: biz.zig_exchange_rate,
          baseCurrency: biz.currency,
          isLoading: false
        });
      } else {
        set({ isLoading: false });
      }
    } catch (err) {
      console.error('Failed to load settings from SQLite:', err);
      set({ isLoading: false });
    }
  },

  updateExchangeRate: async (rate: number) => {
    const biz = get().business;
    if (!biz) return false;
    
    try {
      const db = await getDatabase();
      const now = new Date().toISOString();
      await db.runAsync(
        'UPDATE businesses SET zig_exchange_rate = ?, updated_at = ? WHERE id = ?;',
        [rate, now, biz.id]
      );
      
      // Update local products selling price where cached (optional but clean)
      await db.runAsync(
        'UPDATE products SET selling_price_zig = selling_price * ?, updated_at = ? WHERE business_id = ?;',
        [rate, now, biz.id]
      );

      set({
        zigExchangeRate: rate,
        business: { ...biz, zig_exchange_rate: rate, updated_at: now }
      });
      return true;
    } catch (err) {
      console.error('Failed to update exchange rate:', err);
      return false;
    }
  },

  updateBusinessDetails: async (details: Partial<Business>) => {
    const biz = get().business;
    if (!biz) return false;

    try {
      const db = await getDatabase();
      const updatedBiz = { ...biz, ...details, updated_at: new Date().toISOString() };
      
      await db.runAsync(
        `UPDATE businesses 
         SET name = ?, address = ?, tax_number = ?, vat_number = ?, currency = ?, tax_rate = ?, updated_at = ? 
         WHERE id = ?;`,
        [
          updatedBiz.name,
          updatedBiz.address || null,
          updatedBiz.tax_number || null,
          updatedBiz.vat_number || null,
          updatedBiz.currency,
          updatedBiz.tax_rate,
          updatedBiz.updated_at,
          biz.id
        ]
      );

      set({
        business: updatedBiz,
        baseCurrency: updatedBiz.currency
      });
      return true;
    } catch (err) {
      console.error('Failed to update business details in SQLite:', err);
      return false;
    }
  },

  setPrinterAddress: (address: string | null) => set({ printerAddress: address }),
  setPrinterWidth: (width: '58mm' | '80mm') => set({ printerWidth: width })
}));
