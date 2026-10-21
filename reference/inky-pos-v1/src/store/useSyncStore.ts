// src/store/useSyncStore.ts
import { create } from 'zustand';
import { getDatabase } from '../db/sqlite';

interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime: string | null;
  syncPendingCount: number;
  
  // Actions
  setOnline: (status: boolean) => void;
  loadSyncStats: () => Promise<void>;
  startSync: () => void;
  completeSync: (syncTime: string) => Promise<void>;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  isOnline: false,
  isSyncing: false,
  lastSyncTime: null,
  syncPendingCount: 0,

  setOnline: (status: boolean) => {
    set({ isOnline: status });
    if (status) {
      // Proactively check pending items when coming online
      get().loadSyncStats();
    }
  },

  loadSyncStats: async () => {
    try {
      const db = await getDatabase();
      
      // Load last sync time from settings table
      const timeSettings = await db.getAllAsync<{ value: string }>(
        "SELECT value FROM settings WHERE key = 'last_sync_time' LIMIT 1;"
      );
      const lastSyncTime = timeSettings.length > 0 ? timeSettings[0].value : null;

      // Count pending records in major syncable tables
      const tables = ['categories', 'products', 'suppliers', 'customers', 'sales', 'expenses', 'journal_entries', 'inky_finder_listings'];
      let totalPending = 0;

      for (const table of tables) {
        const result = await db.getAllAsync<{ count: number }>(
          `SELECT COUNT(*) as count FROM ${table} WHERE sync_status != 'synced';`
        );
        if (result.length > 0) {
          totalPending += result[0].count;
        }
      }

      set({ lastSyncTime, syncPendingCount: totalPending });
    } catch (err) {
      console.error('Failed to load sync statistics:', err);
    }
  },

  startSync: () => set({ isSyncing: true }),

  completeSync: async (syncTime: string) => {
    try {
      const db = await getDatabase();
      
      // Update last sync time in settings table
      await db.runAsync(
        `INSERT INTO settings (id, business_id, key, value, updated_at) 
         VALUES ('last_sync_uuid_dummy', 'global', 'last_sync_time', ?, ?)
         ON CONFLICT(id) DO UPDATE SET value = ?, updated_at = ?;`,
        [syncTime, syncTime, syncTime, syncTime]
      );
      
      // Mark all pending rows as synced in local SQLite
      const tables = ['categories', 'products', 'suppliers', 'customers', 'sales', 'expenses', 'journal_entries', 'inky_finder_listings'];
      for (const table of tables) {
        await db.runAsync(`UPDATE ${table} SET sync_status = 'synced' WHERE sync_status != 'synced';`);
      }

      set({
        isSyncing: false,
        lastSyncTime: syncTime,
        syncPendingCount: 0
      });
    } catch (err) {
      console.error('Error recording sync completion:', err);
      set({ isSyncing: false });
    }
  }
}));
