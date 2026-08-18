import { supabase } from './supabase';
import { localDb, SETTINGS_ID } from './localDb';
import {
  mapProduct,
  mapCustomer,
  mapSale,
  mapStoreOrder,
  mapExpense,
  mapSupplier,
  mapCategory,
  mapDiscount,
  mapPurchaseRecord,
  mapSalesman,
  mapUser,
  mapSettings,
  mapPayment,
  mapStockHistory,
  mapVariantStockHistory,
  mapProductAddon,
  mapBundle,
  fetchAllPages,
} from './services';

/**
 * CLOUD PULL ENGINE — cloud → local (the missing half of the sync system).
 *
 * The app previously only PUSHED local changes to the cloud (syncEngine).
 * Nothing ever pulled OTHER devices' changes back, so every device showed
 * stale data even after refresh. This engine:
 *   1. Incrementally fetches rows changed since the last pull (per entity).
 *   2. Applies cloud DELETES via row_tombstones.
 *   3. Respects local pending ops — unsynced local edits are never clobbered.
 *   4. Writes to localDb, then signals the AppContext to refresh React state.
 *   5. Optionally subscribes to Supabase Realtime (graceful — polling is the
 *      universal fallback that works on every project/clone without config).
 */

export type PullEntity =
  | 'products'
  | 'customers'
  | 'sales'
  | 'store_orders'
  | 'expenses'
  | 'suppliers'
  | 'categories'
  | 'discounts'
  | 'purchase_records'
  | 'salesmen'
  | 'users'
  | 'app_settings'
  | 'payments'
  | 'supplier_transactions'
  | 'stock_history'
  | 'variant_stock_history'
  | 'product_addons'
  | 'bundles';

const PULL_INTERVAL = 15_000;
const LAST_PULL_KEY = 'cloud_last_pull_v1';

let _pullRunning = false;
let _timer: ReturnType<typeof setInterval> | null = null;
let _channel: ReturnType<typeof supabase.channel> | null = null;
let _onChanged: ((entities: PullEntity[]) => void) | null = null;
let _sessionActive = false;

export function getLastPullTime(): Date {
  const raw = localStorage.getItem(LAST_PULL_KEY);
  if (raw) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date(0); // epoch → full pull on first run
}

export function setLastPullTime(d: Date = new Date()) {
  localStorage.setItem(LAST_PULL_KEY, d.toISOString());
}

export function resetLastPullTime() {
  setLastPullTime(new Date(0));
}

/**
 * Resolve once no pull cycle is currently in flight.
 * A manual Force Sync must wait for the periodic 15s pull to finish —
 * otherwise its full pull is skipped by the `_pullRunning` guard and the
 * refresh silently does nothing.
 */
export async function waitForPullIdle(maxMs = 30000): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (_pullRunning && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** True when any row is still locally unsynced for a given entity. */
async function hasPendingOpsFor(entity: PullEntity, id: string): Promise<boolean> {
  const pending = await localDb.pendingOps
    .where('[entity+entityId]')
    .equals([entity, id])
    .first();
  return !!pending;
}

/** Delete local rows that were hard-deleted in the cloud (row_tombstones). */
async function applyTombstones(since: Date): Promise<PullEntity[]> {
  const changed: PullEntity[] = [];
  try {
    // NOTE: row_tombstones has NO created_at column — only table_name, ref_id,
    // deleted_at. Filtering by created_at made this query fail silently every
    // time (error → early return), so cloud deletes NEVER reached local devices.
    // Paginated via fetchAllPages so >500 tombstones can't get truncated.
    const tombs = await fetchAllPages(() => {
      let q = supabase.from('row_tombstones').select('table_name, ref_id');
      if (since && since.getTime() > 0) q = q.gte('deleted_at', since.toISOString());
      return q;
    });
    if (!tombs || tombs.length === 0) return changed;

    const grouped = new Map<string, string[]>();
    for (const t of tombs) {
      if (!t || !t.table_name || !t.ref_id) continue;
      const list = grouped.get(t.table_name) || [];
      list.push(t.ref_id);
      grouped.set(t.table_name, list);
    }

    const tableMap: Record<string, { entity: PullEntity; table: any }> = {
      products: { entity: 'products', table: localDb.products },
      customers: { entity: 'customers', table: localDb.customers },
      sales: { entity: 'sales', table: localDb.sales },
      store_orders: { entity: 'store_orders', table: localDb.storeOrders },
      expenses: { entity: 'expenses', table: localDb.expenses },
      suppliers: { entity: 'suppliers', table: localDb.suppliers },
      categories: { entity: 'categories', table: localDb.categories },
      discounts: { entity: 'discounts', table: localDb.discounts },
      purchase_records: { entity: 'purchase_records', table: localDb.purchaseRecords },
      salesmen: { entity: 'salesmen', table: localDb.salesmen },
      users: { entity: 'users', table: localDb.users },
      payments: { entity: 'payments', table: localDb.payments },
      product_addons: { entity: 'product_addons', table: localDb.productAddons },
    };

    for (const [tableName, ids] of grouped) {
      const def = tableMap[tableName];
      if (!def) continue;
      let deleted = 0;
      for (const id of ids) {
        // Never delete a row that still has unsynced local ops (F20 — financial safety).
        if (await hasPendingOpsFor(def.entity, id)) continue;
        const exists = await def.table.get(id);
        if (exists) {
          await def.table.delete(id);
          deleted++;
        }
      }
      if (deleted > 0) {
        changed.push(def.entity);
        console.log(`[CloudPull] Tombstone cleanup: deleted ${deleted} ${def.entity} locally`);
      }
    }
  } catch (err) {
    console.warn('[CloudPull] Tombstone cleanup failed (non-fatal):', err);
  }
  return changed;
}

interface PullDef {
  entity: PullEntity;
  remoteTable: string;
  fetch: (since?: Date) => Promise<any[]>; // returns LOCAL-mapped rows
  write: (rows: any[]) => Promise<void>;
}

const PULL_DEFS: PullDef[] = [
  {
    entity: 'products',
    remoteTable: 'products',
    fetch: async (since) => {
      const rows = await fetchAllPages(() => {
        let q = supabase.from('products').select('*');
        if (since && since.getTime() > 0) q = q.gte('updated_at', since.toISOString());
        return q;
      });
      return rows.map(mapProduct);
    },
    write: async (rows) => { if (rows.length) await localDb.products.bulkPut(rows as any); },
  },
  {
    entity: 'customers',
    remoteTable: 'customers',
    fetch: async (since) => {
      const rows = await fetchAllPages(() => {
        let q = supabase.from('customers').select('*');
        if (since && since.getTime() > 0) q = q.gte('updated_at', since.toISOString());
        return q;
      });
      return rows.map(mapCustomer);
    },
    write: async (rows) => { if (rows.length) await localDb.customers.bulkPut(rows as any); },
  },
  {
    entity: 'sales',
    remoteTable: 'sales',
    fetch: async (since) => {
      // Soft-deleted sales (status='deleted', deleted_at set) are historical
      // audit rows — never re-surface them. Tombstones remove them locally.
      // SMALL pages (200): sales rows carry big items jsonb (~35KB avg, 45MB
      // table) — 1000-row pages hit the 8s PostgREST statement timeout.
      const rows = await fetchAllPages(() => {
        let q = supabase.from('sales').select('*').is('deleted_at', null);
        if (since && since.getTime() > 0) q = q.gte('updated_at', since.toISOString());
        return q;
      }, 200);
      return rows.map(mapSale);
    },
    write: async (rows) => { if (rows.length) await localDb.sales.bulkPut(rows as any); },
  },
  {
    entity: 'store_orders',
    remoteTable: 'store_orders',
    fetch: async (since) => {
      const rows = await fetchAllPages(() => {
        let q = supabase.from('store_orders').select('*');
        if (since && since.getTime() > 0) q = q.gte('updated_at', since.toISOString());
        return q;
      });
      return rows.map(mapStoreOrder);
    },
    write: async (rows) => { if (rows.length) await localDb.storeOrders.bulkPut(rows as any); },
  },
  {
    entity: 'expenses',
    remoteTable: 'expenses',
    fetch: async (since) => {
      const rows = await fetchAllPages(() => {
        let q = supabase.from('expenses').select('*');
        if (since && since.getTime() > 0) q = q.gte('updated_at', since.toISOString());
        return q;
      });
      return rows.map(mapExpense);
    },
    write: async (rows) => { if (rows.length) await localDb.expenses.bulkPut(rows as any); },
  },
  {
    entity: 'suppliers',
    remoteTable: 'suppliers',
    fetch: async (since) => {
      const rows = await fetchAllPages(() => {
        let q = supabase.from('suppliers').select('*');
        if (since && since.getTime() > 0) q = q.gte('updated_at', since.toISOString());
        return q;
      });
      return rows.map(mapSupplier);
    },
    write: async (rows) => { if (rows.length) await localDb.suppliers.bulkPut(rows as any); },
  },
  {
    entity: 'categories',
    remoteTable: 'categories',
    fetch: async (since) => {
      const rows = await fetchAllPages(() => {
        let q = supabase.from('categories').select('*');
        if (since && since.getTime() > 0) q = q.gte('updated_at', since.toISOString());
        return q;
      });
      return rows.map(mapCategory);
    },
    write: async (rows) => { if (rows.length) await localDb.categories.bulkPut(rows as any); },
  },
  {
    entity: 'discounts',
    remoteTable: 'discounts',
    fetch: async (since) => {
      const rows = await fetchAllPages(() => {
        let q = supabase.from('discounts').select('*');
        if (since && since.getTime() > 0) q = q.gte('updated_at', since.toISOString());
        return q;
      });
      return rows.map(mapDiscount);
    },
    write: async (rows) => { if (rows.length) await localDb.discounts.bulkPut(rows as any); },
  },
  {
    entity: 'purchase_records',
    remoteTable: 'purchase_records',
    fetch: async (since) => {
      const rows = await fetchAllPages(() => {
        let q = supabase.from('purchase_records').select('*');
        if (since && since.getTime() > 0) q = q.gte('updated_at', since.toISOString());
        return q;
      });
      return rows.map(mapPurchaseRecord);
    },
    write: async (rows) => { if (rows.length) await localDb.purchaseRecords.bulkPut(rows as any); },
  },
  {
    entity: 'salesmen',
    remoteTable: 'salesmen',
    fetch: async (since) => {
      const rows = await fetchAllPages(() => {
        let q = supabase.from('salesmen').select('*');
        if (since && since.getTime() > 0) q = q.gte('updated_at', since.toISOString());
        return q;
      });
      return rows.map(mapSalesman);
    },
    write: async (rows) => { if (rows.length) await localDb.salesmen.bulkPut(rows as any); },
  },
  {
    entity: 'users',
    remoteTable: 'users',
    fetch: async (since) => {
      const rows = await fetchAllPages(() => {
        let q = supabase.from('users').select('*');
        if (since && since.getTime() > 0) q = q.gte('updated_at', since.toISOString());
        return q;
      });
      return rows.map(mapUser);
    },
    write: async (rows) => { if (rows.length) await localDb.users.bulkPut(rows as any); },
  },
  {
    entity: 'app_settings',
    remoteTable: 'app_settings',
    fetch: async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('*')
        .eq('id', SETTINGS_ID)
        .maybeSingle();
      return data ? [mapSettings(data)] : [];
    },
    write: async (rows) => { if (rows.length) await localDb.appSettings.put(rows[0]); },
  },
  {
    entity: 'payments',
    remoteTable: 'payments',
    fetch: async (since) => {
      const rows = await fetchAllPages(() => {
        let q = supabase.from('payments').select('*');
        if (since && since.getTime() > 0) q = q.gte('created_at', since.toISOString());
        return q;
      });
      return rows.map(mapPayment);
    },
    write: async (rows) => { if (rows.length) await localDb.payments.bulkPut(rows as any); },
  },
  {
    entity: 'supplier_transactions',
    remoteTable: 'supplier_transactions',
    fetch: async (since) => {
      const rows = await fetchAllPages(() => {
        let q = supabase.from('supplier_transactions').select('*');
        if (since && since.getTime() > 0) q = q.gte('updated_at', since.toISOString());
        return q;
      });
      return rows;
    },
    write: async (rows) => { if (rows.length) await localDb.supplierTransactions.bulkPut(rows as any); },
  },
  {
    entity: 'stock_history',
    remoteTable: 'stock_history',
    fetch: async (since) => {
      const rows = await fetchAllPages(() => {
        let q = supabase.from('stock_history').select('*');
        if (since && since.getTime() > 0) q = q.gte('created_at', since.toISOString());
        return q;
      });
      return rows.map(mapStockHistory);
    },
    write: async (rows) => { if (rows.length) await localDb.stockHistory.bulkPut(rows as any); },
  },
  {
    entity: 'variant_stock_history',
    remoteTable: 'variant_stock_history',
    fetch: async (since) => {
      const rows = await fetchAllPages(() => {
        let q = supabase.from('variant_stock_history').select('*');
        if (since && since.getTime() > 0) q = q.gte('created_at', since.toISOString());
        return q;
      });
      return rows.map(mapVariantStockHistory);
    },
    write: async (rows) => { if (rows.length) await localDb.variantStockHistory.bulkPut(rows as any); },
  },
  {
    entity: 'product_addons',
    remoteTable: 'product_addons',
    fetch: async (since) => {
      const rows = await fetchAllPages(() => {
        let q = supabase.from('product_addons').select('*');
        if (since && since.getTime() > 0) q = q.gte('updated_at', since.toISOString());
        return q;
      });
      return rows.map(mapProductAddon);
    },
    write: async (rows) => { if (rows.length) await localDb.productAddons.bulkPut(rows as any); },
  },
  {
    entity: 'bundles',
    remoteTable: 'bundles',
    fetch: async (since) => {
      const rows = await fetchAllPages(() => {
        let q = supabase.from('bundles').select('*');
        if (since && since.getTime() > 0) q = q.gte('updated_at', since.toISOString());
        return q;
      });
      return rows.map(mapBundle);
    },
    write: async (rows) => { if (rows.length) await localDb.bundles.bulkPut(rows as any); },
  },
];

/** Fetch remote deltas for one entity, write to localDb, skip pending-op rows. */
async function pullEntity(def: PullDef, since: Date, forceFull: boolean): Promise<boolean> {
  try {
    const effectiveSince = forceFull ? new Date(0) : since;
    const rows = await def.fetch(effectiveSince.getTime() > 0 ? effectiveSince : undefined);
    if (!rows || rows.length === 0) return false;

    // Respect unsynced local edits: never overwrite a row with a pending op.
    const pending = await localDb.pendingOps.where('entity').equals(def.entity).toArray();
    const pendingIds = new Set(pending.filter(op => op.opType !== 'delete').map(op => op.entityId));

    let changed = 0;
    for (const row of rows) {
      if (row && row.id && pendingIds.has(row.id)) continue;
      changed++;
    }

    const writable = rows.filter((r: any) => r && r.id && !pendingIds.has(r.id));
    if (writable.length > 0) {
      await def.write(writable);
    }
    return changed > 0;
  } catch (err) {
    console.warn(`[CloudPull] ${def.entity} pull failed (non-fatal):`, err);
    return false;
  }
}

/** Check whether the current user was blocked/deactivated on another device. */
async function checkUserStatus(): Promise<void> {
  try {
    const cached = localStorage.getItem('pos_offline_profile');
    if (!cached) return;
    const profile = JSON.parse(cached);
    if (!profile?.id) return;

    const { data } = await supabase.from('users').select('id, active, role').eq('id', profile.id).maybeSingle();
    if (!data) return; // user row missing — ignore (fresh signup edge case)
    if (data.active === false) {
      console.warn('[CloudPull] Current user deactivated on another device — forcing logout.');
      window.dispatchEvent(new Event('user-blocked'));
    }
  } catch (err) {
    console.warn('[CloudPull] User status check failed:', err);
  }
}

/**
 * Run one pull cycle. Returns the list of entities whose local data changed.
 * Force-full resets the cursor to epoch (used by header refresh button).
 */
export async function pullCloudChanges(forceFull = false): Promise<PullEntity[]> {
  if (!_sessionActive) return [];
  if (!navigator.onLine) return [];
  if (_pullRunning) {
    // A periodic 15s pull is in flight — wait briefly (bounded) instead of
    // skipping: a manual Force Sync that returns immediately with zero changes
    // looks like a fake success. 8s covers a normal cycle; past that, give up
    // rather than pile onto a stuck cycle.
    const deadline = Date.now() + 8000;
    while (_pullRunning && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (_pullRunning) return [];
  }

  _pullRunning = true;
  const changed: PullEntity[] = [];
  try {
    const since = getLastPullTime();

    // Phase 1: cloud deletes (tombstones). Also applied on full pulls (epoch
    // cursor) so rows deleted on the cloud are never resurrected locally.
    const tombSince = forceFull ? new Date(0) : since;
    const tombChanged = await applyTombstones(tombSince);
    changed.push(...tombChanged);

    // Phase 2: per-entity incremental deltas
    const results = await Promise.all(
      PULL_DEFS.map(async (def) => {
        const didChange = await pullEntity(def, since, forceFull);
        return { entity: def.entity, didChange };
      })
    );

    for (const r of results) {
      if (r.didChange && !changed.includes(r.entity)) changed.push(r.entity);
    }

    // Phase 3: check if the current user was blocked on another device
    if (!forceFull) {
      await checkUserStatus();
    }

    if (forceFull) {
      // Full pull — move cursor to now so next cycle is incremental again.
      setLastPullTime();
      console.log('[CloudPull] Full pull complete. Entities changed:', changed.join(', ') || 'none');
    } else if (changed.length > 0) {
      setLastPullTime();
    }

    if (changed.length > 0) {
      window.dispatchEvent(new CustomEvent('cloud-pull-changed', { detail: { entities: changed } }));
      _onChanged?.(changed);
    }
  } catch (err) {
    console.warn('[CloudPull] Pull cycle failed:', err);
  } finally {
    _pullRunning = false;
  }
  return changed;
}

/** Subscribe to Supabase Realtime for instant cross-device notifications (best-effort). */
function startRealtime() {
  try {
    if (_channel) {
      supabase.removeChannel(_channel).catch(() => { });
      _channel = null;
    }

    const tables = PULL_DEFS.map(d => d.remoteTable);
    const ch = supabase
      .channel('cloud-pull')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        // Any change → debounce a lightweight incremental pull (10ms coalesce).
        clearTimeout((ch as any)._debounce);
        (ch as any)._debounce = setTimeout(() => {
          pullCloudChanges(false).catch(() => { });
        }, 10);
      })
      .subscribe((status) => {
        console.log(`[CloudPull] Realtime channel status: ${status}`);
      });
    _channel = ch;
    // Keep a reference to tables for potential per-table subscriptions.
    (ch as any)._tables = tables;
  } catch (err) {
    console.warn('[CloudPull] Realtime unavailable — polling fallback active:', err);
  }
}

/** Start the periodic pull engine. Call once after login. */
export function startCloudPull(onChanged?: (entities: PullEntity[]) => void) {
  _sessionActive = true;
  _onChanged = onChanged || null;

  if (_timer) clearInterval(_timer);
  _timer = setInterval(() => {
    if (navigator.onLine) {
      pullCloudChanges(false).catch(() => { });
    }
  }, PULL_INTERVAL);

  // Instant pull on reconnect + window focus (device resumed).
  window.addEventListener('online', handleNetworkEvent);
  document.addEventListener('visibilitychange', handleVisibility);

  startRealtime();

  // Kick off immediately (incremental — respects last cursor).
  pullCloudChanges(false).catch(() => { });

  console.log(`[CloudPull] Engine started (interval ${PULL_INTERVAL / 1000}s).`);
}

function handleNetworkEvent() {
  if (_sessionActive && navigator.onLine) {
    console.log('[CloudPull] Online event — pulling latest cloud data.');
    pullCloudChanges(false).catch(() => { });
  }
}

function handleVisibility() {
  if (_sessionActive && !document.hidden && navigator.onLine) {
    pullCloudChanges(false).catch(() => { });
  }
}

/** Stop the pull engine (logout). */
export function stopCloudPull() {
  _sessionActive = false;
  _onChanged = null;
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
  window.removeEventListener('online', handleNetworkEvent);
  document.removeEventListener('visibilitychange', handleVisibility);
  if (_channel) {
    supabase.removeChannel(_channel).catch(() => { });
    _channel = null;
  }
  console.log('[CloudPull] Engine stopped.');
}