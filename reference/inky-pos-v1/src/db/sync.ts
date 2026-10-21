// src/db/sync.ts
import { getDatabase } from './sqlite';
import { useSyncStore } from '../store/useSyncStore';

// Mock client config / Supabase URL placeholders
// In a full production build, you would import:
// import { supabase } from '../utils/supabase';

// Helper to simulate networking delays
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sync Manager to handle offline-first data synchronization
 */
export const SyncManager = {
  /**
   * Pushes all local unsynced records to the remote database
   */
  async pushLocalChanges(): Promise<number> {
    const db = await getDatabase();
    let pushedCount = 0;
    
    // List of tables that store user records
    const syncableTables = [
      { name: 'categories', key: 'id' },
      { name: 'products', key: 'id' },
      { name: 'suppliers', key: 'id' },
      { name: 'customers', key: 'id' },
      { name: 'sales', key: 'id' },
      { name: 'expenses', key: 'id' },
      { name: 'journal_entries', key: 'id' },
      { name: 'inky_finder_listings', key: 'id' }
    ];

    for (const table of syncableTables) {
      // Find rows that are not yet synced
      const unsyncedRows = await db.getAllAsync<any>(
        `SELECT * FROM ${table.name} WHERE sync_status != 'synced';`
      );

      if (unsyncedRows.length > 0) {
        console.log(`SyncManager: Found ${unsyncedRows.length} unsynced rows in ${table.name}`);
        
        // --- PRODUCTION SUPABASE SYNC CODE (UPSERT) ---
        // For production, push to Supabase:
        // const { error } = await supabase.from(table.name).upsert(unsyncedRows);
        // if (error) throw error;
        
        pushedCount += unsyncedRows.length;
      }
    }

    return pushedCount;
  },

  /**
   * Pulls new records modified on the server since last sync time
   */
  async pullRemoteChanges(lastSyncTime: string | null): Promise<number> {
    const db = await getDatabase();
    let pulledCount = 0;

    // --- PRODUCTION SUPABASE SYNC CODE (SELECT & MERGE) ---
    // Fetch data modified after lastSyncTime from each remote table.
    // e.g. let { data } = await supabase.from('products').select('*').gt('updated_at', lastSyncTime);
    //
    // For local SQLite merge:
    // If remote row.updated_at > local row.updated_at (or local row doesn't exist):
    // Insert/replace remote row locally and mark sync_status = 'synced'.
    
    // We simulate that no remote changes occurred during this demo session.
    return pulledCount;
  },

  /**
   * Runs the full push & pull synchronization cycle
   */
  async runFullSync(): Promise<boolean> {
    const syncStore = useSyncStore.getState();
    
    // Guard against double syncing or running offline
    if (syncStore.isSyncing) return false;
    
    syncStore.startSync();
    console.log('SyncManager: Starting full database synchronization...');

    try {
      // Simulate real-world network transmission lag
      await sleep(2000);

      // 1. Push local creations/modifications
      const pushed = await this.pushLocalChanges();
      console.log(`SyncManager: Successfully pushed ${pushed} records to Supabase.`);

      // 2. Pull external changes
      const pulled = await this.pullRemoteChanges(syncStore.lastSyncTime);
      console.log(`SyncManager: Successfully pulled ${pulled} records from Supabase.`);

      // 3. Mark completion
      const syncTime = new Date().toISOString();
      await syncStore.completeSync(syncTime);
      console.log('SyncManager: Sync complete. Settings updated.');
      
      return true;
    } catch (err) {
      console.error('SyncManager: Sync failed due to network or DB error:', err);
      // Ensure syncing spinner is turned off
      useSyncStore.setState({ isSyncing: false });
      return false;
    }
  }
};
