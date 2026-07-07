import Dexie, { Table } from 'dexie';
import {
  Product,
  Customer,
  Sale,
  Discount,
  User,
  AppSettings,
  SalesTab,
  Expense,
  PurchaseRecord,
  Category,
  Supplier,
  ProductBatch,
  StockHistory,
  Payment
} from '../types';

export const SETTINGS_ID = '00000000-0000-4000-8000-000000000001';

export type PendingOpEntity =
  | 'products'
  | 'customers'
  | 'sales'
  | 'discounts'
  | 'users'
  | 'app_settings'
  | 'sales_tabs'
  | 'expenses'
  | 'categories'
  | 'suppliers'
  | 'product_batches'
  | 'purchase_records'
  | 'purchase_orders'
  | 'purchase_order_items'
  | 'supplier_transactions'
  | 'payments'
  | 'stock_history'
  | 'bundles'
  | 'bundle_items';

export type PendingOpType = 'create' | 'update' | 'delete' | 'upsert';

export interface PendingOp {
  id?: number;
  entity: PendingOpEntity;
  opType: PendingOpType;
  entityId: string;
  payload: any;
  createdAt: number;
  retries: number;
  status: 'pending' | 'failed' | 'error';
  lastError?: string;
  batchId?: string;
}

export interface SyncHistoryItem {
  id?: number;
  timestamp: number;
  itemsSynced: number;
  entities: string[];
  status: 'success' | 'partial' | 'failed';
}

export class ZaynahsPosDB extends Dexie {
  products!: Table<Product>;
  customers!: Table<Customer>;
  sales!: Table<Sale>;
  discounts!: Table<Discount>;
  users!: Table<User>;
  categories!: Table<Category>;
  suppliers!: Table<Supplier>;
  productBatches!: Table<any>;
  purchaseRecords!: Table<any>;
  purchaseOrders!: Table<any>;
  purchaseOrderItems!: Table<any>;
  supplierTransactions!: Table<any>;
  payments!: Table<any>;
  stockHistory!: Table<any>;
  salesTabs!: Table<SalesTab>;
  expenses!: Table<Expense>;
  appSettings!: Table<any>;
  pendingOps!: Table<PendingOp>;
  syncHistory!: Table<SyncHistoryItem>;
  bundles!: Table<any>;
  bundleItems!: Table<any>;

  constructor() {
    // Make the IndexedDB name unique per Supabase Project so different clones on localhost don't share data
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    const projectRef = supabaseUrl.split('//')[1]?.split('.')[0] || 'default';
    const dbName = `ZaynahsPosDB_${projectRef}`;
    
    super(dbName);
    this.version(15).stores({
      products: 'id, name, barcode, barcodeValue, sku, categoryId, supplierId, isDraft, trackInventory, stock',
      categories: 'id, name',
      suppliers: 'id, name',
      sales: 'id, invoiceNumber, customerId, timestamp, saleDate, status, dcNumber, extraCharges',
      customers: 'id, name, phone, email',
      expenses: 'id, categoryId, date',
      discounts: 'id, name, type, active',
      users: 'id, username, email',
      productBatches: 'id, productId, created_at, status',
      purchaseRecords: 'id, productId, supplierId, date',
      purchaseOrders: 'id, poNumber, supplierId',
      purchaseOrderItems: 'id, poId, productId',
      supplierTransactions: 'id, supplierId',
      payments: 'id, supplierId',
      stockHistory: 'id, productId, timestamp, type',
      salesTabs: 'id, userId',
      appSettings: 'id, storeName, currency, theme, interfaceMode, receiptPaperSize, receiptTemplate, country, businessType, posGridColumns, enableSplitPayment',
      pendingOps: '++id, [entity+entityId], status, createdAt',
      syncHistory: '++id, timestamp',
      bundles: 'id, name, active, workspaceId',
      bundleItems: 'id, bundleId, productId',
      // Legacy compatibility:
      app_settings: 'id, storeName, currency, enableSplitPayment, enableExtraCharges',
      purchase_records: 'id, productId, supplierId, date'
    });

    this.version(14).stores({
      products: 'id, name, barcode, barcodeValue, sku, categoryId, supplierId, isDraft, trackInventory, stock',
      categories: 'id, name',
      suppliers: 'id, name',
      sales: 'id, invoiceNumber, customerId, timestamp, saleDate, status, dcNumber, extraCharges',
      customers: 'id, name, phone, email',
      expenses: 'id, categoryId, date',
      discounts: 'id, name, type, active',
      users: 'id, username, email',
      productBatches: 'id, productId, created_at, status',
      purchaseRecords: 'id, productId, supplierId, date',
      purchaseOrders: 'id, poNumber, supplierId',
      purchaseOrderItems: 'id, poId, productId',
      supplierTransactions: 'id, supplierId',
      payments: 'id, supplierId',
      stockHistory: 'id, productId, timestamp, type',
      salesTabs: 'id, userId',
      appSettings: 'id, storeName, currency, theme, interfaceMode, receiptPaperSize, receiptTemplate, country, businessType, posGridColumns, enableSplitPayment',
      pendingOps: '++id, [entity+entityId], status, createdAt',
      syncHistory: '++id, timestamp',
      // Legacy compatibility:
      app_settings: 'id, storeName, currency, enableSplitPayment, enableExtraCharges',
      purchase_records: 'id, productId, supplierId, date'
    });

    this.version(13).stores({
      products: 'id, name, barcode, barcodeValue, sku, categoryId, supplierId, isDraft, trackInventory, stock',
      categories: 'id, name',
      suppliers: 'id, name',
      sales: 'id, invoiceNumber, customerId, shiftId, timestamp, saleDate, status, dcNumber, extraCharges',
      customers: 'id, name, phone, email',
      expenses: 'id, categoryId, shiftId, date',
      shifts: 'id, userId, startTime, endTime, status',
      discounts: 'id, name, type, active',
      users: 'id, username, email',
      productBatches: 'id, productId, created_at, status',
      purchaseRecords: 'id, productId, supplierId, date',
      purchaseOrders: 'id, poNumber, supplierId',
      purchaseOrderItems: 'id, poId, productId',
      supplierTransactions: 'id, supplierId',
      payments: 'id, supplierId',
      stockHistory: 'id, productId, timestamp, type',
      salesTabs: 'id, userId',
      appSettings: 'id, storeName, currency, theme, interfaceMode, receiptPaperSize, receiptTemplate, country, businessType, posGridColumns, enableSplitPayment',
      pendingOps: '++id, [entity+entityId], status, createdAt',
      syncHistory: '++id, timestamp',
      shiftDenominations: 'id, shiftId',
      // Legacy compatibility:
      app_settings: 'id, storeName, currency, enableSplitPayment, enableExtraCharges',
      purchase_records: 'id, productId, supplierId, date'
    }).upgrade(async trans => {
      try {
        const legacySettings = await trans.table('app_settings').toArray();
        if (legacySettings.length > 0) {
          const currentSettings = await trans.table('appSettings').toArray();
          if (currentSettings.length === 0) {
            await trans.table('appSettings').bulkPut(legacySettings);
            console.log(`[DB] Legacy app_settings (${legacySettings.length} rows) migrated to appSettings.`);
          }
          await trans.table('app_settings').clear();
        }
      } catch (err) {
        console.warn('[DB] Failed to migrate legacy app_settings:', err);
      }

      try {
        const legacyPurchases = await trans.table('purchase_records').toArray();
        if (legacyPurchases.length > 0) {
          const currentPurchases = await trans.table('purchaseRecords').toArray();
          if (currentPurchases.length === 0) {
            await trans.table('purchaseRecords').bulkPut(legacyPurchases);
            console.log(`[DB] Legacy purchase_records (${legacyPurchases.length} rows) migrated to purchaseRecords.`);
          }
          await trans.table('purchase_records').clear();
        }
      } catch (err) {
        console.warn('[DB] Failed to migrate legacy purchase_records:', err);
      }
    });

    this.version(12).stores({
      products: 'id, name, barcode, barcodeValue, sku, categoryId, supplierId, isDraft, trackInventory, stock',
      categories: 'id, name',
      suppliers: 'id, name',
      sales: 'id, invoiceNumber, customerId, shiftId, timestamp, saleDate, status, dcNumber, extraCharges',
      customers: 'id, name, phone, email',
      expenses: 'id, categoryId, shiftId, date',
      expense_categories: 'id, name',
      purchase_records: 'id, productId, supplierId, date',
      app_settings: 'id, storeName, currency, enableSplitPayment, enableExtraCharges',
      shifts: 'id, userId, startTime, endTime, status',
      discounts: 'id, name, type, active',
      terminal_stats: 'id',
      sync_status: 'id'
    });

    this.version(11).stores({
      products: 'id, name, barcode, sku, categoryId, supplierId, isDraft, trackInventory, stock',
      categories: 'id, name',
      suppliers: 'id, name',
      sales: 'id, invoiceNumber, customerId, shiftId, timestamp, saleDate, status, dcNumber, extraCharges',
      customers: 'id, name, phone, email',
      expenses: 'id, categoryId, shiftId, date',
      expense_categories: 'id, name',
      purchase_records: 'id, productId, supplierId, date',
      app_settings: 'id, storeName, currency, enableSplitPayment, enableExtraCharges',
      shifts: 'id, userId, startTime, endTime, status',
      discounts: 'id, name, type, active',
      terminal_stats: 'id',
      sync_status: 'id'
    });

    this.version(1).stores({
      products: 'id, name, sku, barcode, category, supplier',
      customers: 'id, name, email, phone',
      sales: 'id, invoiceNumber, customerId, timestamp',
      discounts: 'id, name',
      users: 'id, username, email',
      categories: 'id, name',
      suppliers: 'id, name',
      productBatches: 'id, productId',
      purchaseRecords: 'id, productId, date',
      purchaseOrders: 'id, poNumber, supplierId',
      purchaseOrderItems: 'id, poId, productId',
      supplierTransactions: 'id, supplierId',
      payments: 'id, supplierId',
      stockHistory: 'id, productId',
      shifts: 'id, userId, status',
      shiftDenominations: 'id, shiftId',
      salesTabs: 'id, userId',
      expenses: 'id, category, date',
      appSettings: 'id',
      pendingOps: '++id, [entity+entityId], status, createdAt',
      syncHistory: '++id, timestamp'
    });

    this.version(2).stores({
      products: 'id, name, sku, barcode, category, supplier',
      customers: 'id, name, email, phone',
      sales: 'id, invoiceNumber, customerId, timestamp',
      discounts: 'id, name',
      users: 'id, username, email',
      categories: 'id, name',
      suppliers: 'id, name',
      productBatches: 'id, productId',
      purchaseRecords: 'id, productId, date',
      purchaseOrders: 'id, poNumber, supplierId',
      purchaseOrderItems: 'id, poId, productId',
      supplierTransactions: 'id, supplierId',
      payments: 'id, supplierId',
      stockHistory: 'id, productId',
      shifts: 'id, userId, status',
      shiftDenominations: 'id, shiftId',
      salesTabs: 'id, userId',
      expenses: 'id, category, date',
      appSettings: 'id',
      pendingOps: '++id, [entity+entityId], status, createdAt',
      syncHistory: '++id, timestamp'
    });

    this.version(4).stores({
      products: 'id, name, sku, barcode, category, supplier',
      customers: 'id, name, email, phone',
      sales: 'id, invoiceNumber, customerId, timestamp',
      discounts: 'id, name',
      users: 'id, username, email',
      categories: 'id, name',
      suppliers: 'id, name',
      productBatches: 'id, productId',
      purchaseRecords: 'id, productId, date',
      purchaseOrders: 'id, poNumber, supplierId',
      purchaseOrderItems: 'id, poId, productId',
      supplierTransactions: 'id, supplierId',
      payments: 'id, supplierId',
      stockHistory: 'id, productId',
      shifts: 'id, userId, status',
      shiftDenominations: 'id, shiftId',
      salesTabs: 'id, userId',
      expenses: 'id, category, date',
      appSettings: 'id',
      pendingOps: '++id, [entity+entityId], status, createdAt',
      syncHistory: '++id, timestamp'
    }).upgrade(async trans => {
      await trans.table('products').clear();
      await trans.table('customers').clear();
      await trans.table('sales').clear();
      await trans.table('appSettings').clear();
      console.log('✅ LocalDB v4 Upgrade: Purged inconsistent caches for fresh sync.');
    });

    this.version(5).stores({
      products: 'id, name, sku, barcode, category, supplier',
      customers: 'id, name, email, phone',
      sales: 'id, invoiceNumber, customerId, timestamp',
      discounts: 'id, name',
      users: 'id, username, email',
      categories: 'id, name',
      suppliers: 'id, name',
      productBatches: 'id, productId',
      purchaseRecords: 'id, productId, date',
      purchaseOrders: 'id, poNumber, supplierId',
      purchaseOrderItems: 'id, poId, productId',
      supplierTransactions: 'id, supplierId',
      payments: 'id, supplierId',
      stockHistory: 'id, productId',
      shifts: 'id, userId, status',
      shiftDenominations: 'id, shift_id',
      salesTabs: 'id, userId',
      expenses: 'id, category, date',
      appSettings: 'id, storeName, currency, theme, interfaceMode, receiptPaperSize, receiptTemplate, country, businessType',
      pendingOps: '++id, [entity+entityId], status, createdAt',
      syncHistory: '++id, timestamp'
    });

    this.version(6).stores({
      products: 'id, name, sku, barcode, category, supplier',
      customers: 'id, name, email, phone',
      sales: 'id, invoiceNumber, customerId, timestamp',
      discounts: 'id, name',
      users: 'id, username, email',
      categories: 'id, name',
      suppliers: 'id, name',
      productBatches: 'id, productId',
      purchaseRecords: 'id, productId, date',
      purchaseOrders: 'id, poNumber, supplierId',
      purchaseOrderItems: 'id, poId, productId',
      supplierTransactions: 'id, supplierId',
      payments: 'id, supplierId',
      stockHistory: 'id, productId',
      shifts: 'id, userId, status',
      shiftDenominations: 'id, shiftId',
      salesTabs: 'id, userId',
      expenses: 'id, category, date',
      appSettings: 'id, storeName, currency, theme, interfaceMode, receiptPaperSize, receiptTemplate, country, businessType, posGridColumns',
      pendingOps: '++id, [entity+entityId], status, createdAt',
      syncHistory: '++id, timestamp'
    });

    this.version(7).stores({
      sales: 'id, invoiceNumber, customerId, timestamp, shiftId, refundShiftId',
      expenses: 'id, category, date, shiftId'
    });

    this.version(8).stores({
      salesTabs: 'id, userId'
    }).upgrade(async trans => {
      // Clear salesTabs to ensure new fields (notes, editingSaleId) are hydrated correctly from cloud
      await trans.table('salesTabs').clear();
    });

    this.version(9).stores({
      sales: 'id, invoiceNumber, customerId, timestamp, shiftId, refundShiftId, status, paymentMethod',
      products: 'id, name, sku, barcode, category, supplier, stock, active',
      stockHistory: 'id, productId, timestamp, type',
      expenses: 'id, category, date, shiftId, paymentMethod',
      customers: 'id, name, email, phone',
      productBatches: 'id, productId, created_at, status'
    });

    this.version(10).stores({
      sales: 'id, invoiceNumber, dcNumber, customerId, timestamp, shiftId, refundShiftId, status, paymentMethod',
      appSettings: 'id, storeName, currency, theme, interfaceMode, receiptPaperSize, receiptTemplate, country, businessType, posGridColumns, enableSplitPayment'
    });
  }
}

export const localDb = new ZaynahsPosDB();

/**
 * Initialize the DB for a specific workspace.
 * In the current Dexie implementation, we ensure the DB is open.
 */
export async function initForWorkspace(workspaceId: string) {
  console.log(`[DB] Initializing for workspace: ${workspaceId}`);
  if (!localDb.isOpen()) {
    await localDb.open();
  }
}

// Atomic ID generation helper
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Queue Operation Helper
 * Handles deduplication logic: if item is already in queue, we merge payloads or keep 'create' status.
 */
export async function queueOp(
  entity: PendingOpEntity,
  opType: PendingOpType,
  entityId: string,
  payload: any,
  options?: { batchId?: string }
) {
  // ── WORKSPACE INJECTION (RLS Safety Net) ──
  if (opType !== 'delete' && payload && typeof payload === 'object' && !Array.isArray(payload)) {
    if (!payload.workspace_id && !payload.workspaceId) {
      const storedWs = localStorage.getItem('active_workspace_id');
      if (storedWs) {
        payload.workspace_id = storedWs;
      }
    }
  }

  try {
    // ── QUEUE SIZE CAP ──
    const queueCount = await localDb.pendingOps.count();
    if (queueCount >= 1000) {
      console.warn(`[DB] Pending ops queue has ${queueCount} items — dropping new op to prevent unbounded growth.`);
      return;
    }

    const existing = await localDb.pendingOps
      .where('[entity+entityId]')
      .equals([entity, entityId])
      .first();

    if (existing && opType !== 'delete') {
      // If we already have a 'create' or 'upsert' pending, stay in that state
      const newOpType = (existing.opType === 'create' || existing.opType === 'upsert')
        ? existing.opType
        : opType;

      const mergedPayload = { ...existing.payload, ...payload };

      await localDb.pendingOps.update(existing.id!, {
        payload: mergedPayload,
        opType: newOpType,
        createdAt: Date.now(),
        status: 'pending',
        ...(options?.batchId && !existing.batchId ? { batchId: options.batchId } : {})
      });
    } else {
      await localDb.pendingOps.add({
        entity,
        opType,
        entityId,
        payload,
        createdAt: Date.now(),
        retries: 0,
        status: 'pending',
        ...(options?.batchId ? { batchId: options.batchId } : {})
      });
    }

    // Trigger network sync if online (Debounced or Async)
    // We will import this dynamically to avoid circular dependencies
    import('./syncEngine').then(m => m.syncToCloud().catch(null));

    window.dispatchEvent(new Event('pendingops-changed'));
  } catch (err) {
    console.error('[DB] Queue Operation Failed:', err);
  }
}

/**
 * Utility to check if an entity is pending deletion
 */
export async function isPendingDelete(entity: PendingOpEntity, entityId: string): Promise<boolean> {
  const op = await localDb.pendingOps
    .where('[entity+entityId]')
    .equals([entity, entityId])
    .first();
  return op?.opType === 'delete';
}

/**
 * Map Dexie table names to Sync Engine Entity names
 */
export const TABLE_TO_ENTITY: Record<string, PendingOpEntity> = {
  'products': 'products',
  'customers': 'customers',
  'sales': 'sales',
  'discounts': 'discounts',
  'users': 'users',
  'categories': 'categories',
  'suppliers': 'suppliers',
  'productBatches': 'product_batches',
  'purchaseRecords': 'purchase_records',
  'purchaseOrders': 'purchase_orders',
  'purchaseOrderItems': 'purchase_order_items',
  'supplierTransactions': 'supplier_transactions',
  'payments': 'payments',
  'stockHistory': 'stock_history',
  'salesTabs': 'sales_tabs',
  'expenses': 'expenses',
  'appSettings': 'app_settings',
  'bundles': 'bundles',
  'bundleItems': 'bundle_items',
};

/**
 * Seed Local Database from Supabase data
 * Used during login/start to ensure local cache is warm.
 */
export async function seedLocalDb(data: any) {
  try {
    // We only seed if we don't have pending ops for that item to avoid overwriting local changes
    const pending = await localDb.pendingOps.toArray();
    const pendingIds = new Set(pending.map(p => `${p.entity}:${p.entityId}`));

    const seedTable = async (tableName: keyof typeof localDb, items: any[] | undefined) => {
      if (!items || !Array.isArray(items)) return;

      const entityName = TABLE_TO_ENTITY[tableName as string] || (tableName as PendingOpEntity);
      const filtered = items.filter(item => !pendingIds.has(`${entityName}:${item.id}`));

      if (filtered.length > 0) {
        const table = localDb[tableName] as Table<any>;
        if (typeof table.bulkPut === 'function') {
          await table.bulkPut(filtered);
        }
      }
    };

    const tasks = [
      seedTable('products', data.products),
      seedTable('customers', data.customers),
      seedTable('sales', data.sales),
      seedTable('discounts', data.discounts),
      seedTable('users', data.users),
      seedTable('categories', data.categories),
      seedTable('suppliers', data.suppliers),
      seedTable('salesTabs', data.salesTabs),
      seedTable('expenses', data.expenses),
      seedTable('supplierTransactions', data.supplierTransactions),
      seedTable('productBatches', data.productBatches),
      seedTable('purchaseRecords', data.purchaseRecords),
      seedTable('stockHistory', data.stockHistory),
    ];

    await Promise.all(tasks);

    if (data.settings) {
      // CRITICAL: Don't overwrite local settings if we have a pending sync operation
      const pending = await localDb.pendingOps
        .where('[entity+entityId]')
        .equals(['app_settings', SETTINGS_ID])
        .first();

      if (!pending) {
        await localDb.appSettings.put({ ...data.settings, id: SETTINGS_ID });
      }
    }

    console.log('[DB] ✅ Local seeding complete');
  } catch (err) {
    console.error('[DB] ❌ Seeding failed:', err);
  }
}

/**
 * Purge all local data from IndexedDB
 */
export async function purgeLocalData() {
  try {
    const tables = localDb.tables;
    await Promise.all(tables.map(table => table.clear()));
    console.log('[DB] 🗑️ Local database purged successfully');

    // Clear any sync markers in localStorage if applicable
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.includes('sync') || key.includes('marker') || key.includes('last_'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));

    // Force a reload to reset app state
    window.location.reload();
  } catch (err) {
    console.error('[DB] ❌ Purge failed:', err);
    throw err;
  }
}
