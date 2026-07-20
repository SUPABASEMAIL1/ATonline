import React, { useRef, useState } from 'react';
import {
  Download,
  Upload,
  Database,
  ShieldAlert,
  CheckCircle2,
  FileJson,
  Loader2,
  RefreshCw,
  History,
  Package,
  Users,
  ShoppingCart,
  Receipt,
  Tag,
  Settings,
  Layers,
  Truck,
  ClipboardList,
  CheckSquare,
  Square,
  Barcode
} from 'lucide-react';
import { localDb, queueOp, purgeLocalData, SETTINGS_ID } from '../../lib/localDb';
import { seedMissingBarcodes, auditStockIntegrity } from '../../lib/services';
import { useApp } from '../../context/SupabaseAppContext';
import { sonner } from '../../lib/sonner';

interface ImportSummary {
  table: string;
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  duplicate: number;
}

const STORE_OPTIONS = [
  { key: 'products', label: 'Products', icon: Package, color: 'text-primary' },
  { key: 'customers', label: 'Customers', icon: Users, color: 'text-blue-500' },
  { key: 'sales', label: 'Sales', icon: ShoppingCart, color: 'text-primary' },
  { key: 'expenses', label: 'Expenses', icon: Receipt, color: 'text-red-500' },
  { key: 'discounts', label: 'Discounts', icon: Tag, color: 'text-orange-500' },
  { key: 'users', label: 'Users', icon: Users, color: 'text-violet-500' },
  { key: 'salesTabs', label: 'Sales Tabs', icon: Layers, color: 'text-cyan-500' },
  { key: 'settings', label: 'Settings', icon: Settings, color: 'text-gray-600' },
  { key: 'categories', label: 'Categories', icon: Tag, color: 'text-primary' },
  { key: 'suppliers', label: 'Suppliers', icon: Truck, color: 'text-orange-500' },
  { key: 'productBatches', label: 'Product Batches', icon: ClipboardList, color: 'text-pink-500' },
  { key: 'purchaseRecords', label: 'Purchase Records', icon: ClipboardList, color: 'text-lime-600' },
  { key: 'purchase_orders', label: 'Purchase Orders', icon: ClipboardList, color: 'text-orange-600', dbKey: 'purchaseOrders' },
  { key: 'purchase_order_items', label: 'PO Items', icon: Package, color: 'text-orange-400', dbKey: 'purchaseOrderItems' },
  { key: 'supplier_transactions', label: 'Supplier Txns', icon: Database, color: 'text-red-600', dbKey: 'supplierTransactions' },
  { key: 'payments', label: 'Payments', icon: CheckCircle2, color: 'text-primary' },
  { key: 'stock_history', label: 'Stock History', icon: History, color: 'text-gray-600', dbKey: 'stockHistory' },
  { key: 'variant_stock_history', label: 'Variant Stock History', icon: History, color: 'text-gray-500', dbKey: 'variantStockHistory' },
  { key: 'bundles', label: 'Bundles & Deals', icon: Tag, color: 'text-purple-500' },
  { key: 'bundle_items', label: 'Bundle Items', icon: Package, color: 'text-purple-400', dbKey: 'bundleItems' },
  { key: 'bundle_slots', label: 'Bundle Slots', icon: Layers, color: 'text-purple-300', dbKey: 'bundleSlots' },
  { key: 'bundle_slot_options', label: 'Slot Options', icon: CheckCircle2, color: 'text-purple-200', dbKey: 'bundleSlotOptions' },
  { key: 'toppings', label: 'Toppings', icon: Layers, color: 'text-amber-400' },
  { key: 'productAddons', label: 'Product Addons', icon: Package, color: 'text-teal-500' },
];

const DISPATCH_MAP: Record<string, string> = {
  products: 'SET_PRODUCTS',
  customers: 'SET_CUSTOMERS',
  sales: 'SET_SALES',
  discounts: 'SET_DISCOUNTS',
  users: 'SET_USERS',
  salesTabs: 'SET_SALES_TABS',
  expenses: 'SET_EXPENSES',
  purchaseRecords: 'SET_PURCHASE_RECORDS',
  categories: 'SET_CATEGORIES',
  suppliers: 'SET_SUPPLIERS',
  productBatches: 'SET_PRODUCT_BATCHES',
  supplier_transactions: 'SET_SUPPLIER_TRANSACTIONS',
  payments: 'SET_PAYMENTS',
  purchase_orders: 'SET_PURCHASE_ORDERS',
  purchase_order_items: 'SET_PURCHASE_ORDER_ITEMS',
  stock_history: 'SET_STOCK_HISTORY',
  variant_stock_history: 'SET_VARIANT_STOCK_HISTORY',
  bundles: 'SET_BUNDLES',
  toppings: 'SET_TOPPINGS',
  productAddons: 'SET_PRODUCT_ADDONS',
};

export function DatabaseTools() {
  const { state, dispatch } = useApp();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [selectedStores, setSelectedStores] = useState<Set<string>>(new Set(STORE_OPTIONS.map(s => s.key)));
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allSelected = selectedStores.size === STORE_OPTIONS.length;

  const toggleStore = (key: string) => {
    setSelectedStores(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedStores(new Set());
    } else {
      setSelectedStores(new Set(STORE_OPTIONS.map(s => s.key)));
    }
  };

  // ─── EXPORT ───
  const handleExport = async () => {
    if (selectedStores.size === 0) {
      sonner.error('Please select at least one table to export.');
      return;
    }
    setIsExporting(true);
    try {
      sonner.loading('Generating System Backup...');
      const backup: any = {
        version: '2.0',
        platform: 'Zaynahs POS',
        timestamp: new Date().toISOString(),
        selectedTables: Array.from(selectedStores),
        tables: {}
      };

      for (const store of selectedStores) {
        // Map snake_case keys to camelCase localDb property names
        const dbKeyMap: Record<string, string> = {
          settings: 'appSettings',
          purchase_orders: 'purchaseOrders',
          purchase_order_items: 'purchaseOrderItems',
          supplier_transactions: 'supplierTransactions',
          stock_history: 'stockHistory',
          variant_stock_history: 'variantStockHistory',
          bundles: 'bundles',
          bundle_items: 'bundleItems',
          bundle_slots: 'bundleSlots',
          bundle_slot_options: 'bundleSlotOptions',
        };
        const dbKey = dbKeyMap[store] || store;
        const table = (localDb as any)[dbKey];
        if (!table || typeof table.toArray !== 'function') {
          console.warn(`[Export] Skipping unknown store: ${store} (dbKey: ${dbKey})`);
          backup.tables[store] = [];
          continue;
        }
        backup.tables[store] = await table.toArray();
      }

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `zaynahs_pos_backup_${new Date().toLocaleDateString('en-CA')}_${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const tableList = Array.from(selectedStores).map(s => s.toUpperCase()).join(', ');
      sonner.success(`Exported ${selectedStores.size} tables: ${tableList}`);
    } catch (err: any) {
      console.error('Export failed:', err);
      sonner.error(`Backup failed: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // ─── FILE SELECT ───
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(e.target.files?.[0] || null);
  };

  // ─── IMPORT ───
  const handleImport = async () => {
    if (!selectedFile) {
      sonner.error('Please select a backup file first.');
      return;
    }
    if (selectedStores.size === 0) {
      sonner.error('Please select at least one table to import.');
      return;
    }

    const isDark = document.documentElement.classList.contains('dark');
    const bgColor = isDark ? '#171717' : '#fff';
    const textColor = isDark ? '#fff' : '#000';

    const result = await sonner.confirm(
      'Import System Data?',
      `This will merge ${selectedStores.size} selected tables. Duplicates will be skipped.`
    );

    if (!result.isConfirmed) return;

    setIsImporting(true);
    const summaries: ImportSummary[] = [];

    try {
      // Open ONE persistent loading dialog — update title per step
      sonner.loading('📂 Reading backup file...');

      const text = await selectedFile.text();
      let backup: any;
      try {
        backup = JSON.parse(text);
      } catch {
        throw new Error('Invalid JSON file. Please select a valid Zaynahs POS backup file.');
      }

      if (!backup.tables || typeof backup.tables !== 'object') {
        throw new Error('Invalid backup format. Missing "tables" object.');
      }

      const storeKeys = Array.from(selectedStores);

      for (let i = 0; i < storeKeys.length; i++) {
        const storeKey = storeKeys[i];
        const records = backup.tables[storeKey];

        sonner.update(`⏳ Processing ${storeKey.toUpperCase()} (${i + 1} / ${storeKeys.length})...`);

        // Table not in backup
        if (records === undefined || records === null) {
          summaries.push({ table: storeKey.toUpperCase(), total: 0, imported: 0, skipped: 0, failed: 0, duplicate: 0 });
          continue;
        }

        // ── SETTINGS SINGLETON ──
        if (storeKey === 'settings') {
          const settingsData = Array.isArray(records) ? records[0] : records;
          if (!settingsData) {
            summaries.push({ table: 'SETTINGS', total: 0, imported: 0, skipped: 0, failed: 0, duplicate: 0 });
          } else {
            const existing = await localDb.appSettings.get(SETTINGS_ID);
            if (existing) {
              summaries.push({ table: 'SETTINGS', total: 1, imported: 0, skipped: 1, failed: 0, duplicate: 1 });
            } else {
              try {
                await localDb.appSettings.put(settingsData);
                try {
                  await queueOp('settings', 'upsert', 'singleton', settingsData);
                } catch (qErr) {
                  console.warn('Could not queue op for settings sync:', qErr);
                }
                // Dispatch settings update to React state immediately
                dispatch({ type: 'SET_SETTINGS', payload: settingsData } as any);
                summaries.push({ table: 'SETTINGS', total: 1, imported: 1, skipped: 0, failed: 0, duplicate: 0 });
              } catch (e) {
                summaries.push({ table: 'SETTINGS', total: 1, imported: 0, skipped: 0, failed: 1, duplicate: 0 });
              }
            }
          }
          continue;
        }

        // ── ARRAY STORES ──
        if (!Array.isArray(records) || records.length === 0) {
          summaries.push({ table: storeKey.toUpperCase(), total: 0, imported: 0, skipped: 0, failed: 0, duplicate: 0 });
          continue;
        }

        let imported = 0, skipped = 0, failed = 0, duplicate = 0;
        const total = records.length;

        // Map snake_case store keys to camelCase localDb property names
        const dbKeyMap: Record<string, string> = {
          settings: 'appSettings',
          purchase_orders: 'purchaseOrders',
          purchase_order_items: 'purchaseOrderItems',
          supplier_transactions: 'supplierTransactions',
          stock_history: 'stockHistory',
          variant_stock_history: 'variantStockHistory',
          bundles: 'bundles',
          bundle_items: 'bundleItems',
          bundle_slots: 'bundleSlots',
          bundle_slot_options: 'bundleSlotOptions',
        };
        const dbKey = dbKeyMap[storeKey] || storeKey;
        const table = (localDb as any)[dbKey];

        // Pre-fetch existing data ONCE (avoids O(N²) reads)
        let existingRecords: any[] = [];
        try {
          existingRecords = await table.toArray();
        } catch {
          existingRecords = [];
        }

        const existingIdSet = new Set(existingRecords.map((r: any) => String(r.id)));

        // Build field-based duplicate sets
        const dupSets: any = {};
        if (storeKey === 'products') {
          dupSets.skus = new Set(existingRecords.filter((p: any) => p.sku).map((p: any) => p.sku));
          dupSets.barcodes = new Set(existingRecords.filter((p: any) => p.barcode).map((p: any) => p.barcode));
        } else if (storeKey === 'customers') {
          dupSets.phones = new Set(existingRecords.filter((c: any) => c.phone).map((c: any) => c.phone));
          dupSets.emails = new Set(existingRecords.filter((c: any) => c.email).map((c: any) => c.email));
        } else if (storeKey === 'sales') {
          dupSets.invoices = new Set(existingRecords.filter((s: any) => s.invoiceNumber).map((s: any) => s.invoiceNumber));
        } else if (storeKey === 'discounts') {
          dupSets.names = new Set(existingRecords.filter((d: any) => d.name).map((d: any) => d.name));
        } else if (storeKey === 'users') {
          dupSets.emails = new Set(existingRecords.filter((u: any) => u.email).map((u: any) => u.email));
        } else if (storeKey === 'categories' || storeKey === 'suppliers') {
          dupSets.names = new Set(existingRecords.filter((x: any) => x.name).map((x: any) => x.name));
        } else if (storeKey === 'purchase_orders') {
          dupSets.poNumbers = new Set(existingRecords.filter((x: any) => x.poNumber).map((x: any) => x.poNumber));
        }

        for (const record of records) {
          try {
            // Skip if same ID already exists
            if (existingIdSet.has(String(record.id))) {
              skipped++;
              duplicate++;
              continue;
            }

            // Skip field-based duplicates
            let isDuplicate = false;
            if (storeKey === 'products') {
              isDuplicate = !!(record.sku && dupSets.skus.has(record.sku)) || !!(record.barcode && dupSets.barcodes.has(record.barcode));
            } else if (storeKey === 'customers') {
              isDuplicate = !!(record.phone && dupSets.phones.has(record.phone)) || !!(record.email && dupSets.emails.has(record.email));
            } else if (storeKey === 'sales') {
              isDuplicate = !!(record.invoiceNumber && dupSets.invoices.has(record.invoiceNumber));
            } else if (storeKey === 'discounts') {
              isDuplicate = !!(record.name && dupSets.names.has(record.name));
            } else if (storeKey === 'users') {
              isDuplicate = !!(record.email && dupSets.emails.has(record.email));
            } else if (storeKey === 'categories' || storeKey === 'suppliers') {
              isDuplicate = !!(record.name && dupSets.names.has(record.name));
            } else if (storeKey === 'purchase_orders') {
              isDuplicate = !!(record.poNumber && dupSets.poNumbers.has(record.poNumber));
            }

            if (isDuplicate) {
              skipped++;
              duplicate++;
              continue;
            }

            // Save locally
            await (localDb as any)[dbKey].put(record);
            imported++;

            // Queue for sync to Supabase
            try {
              // Convert camelCase JS object to snake_case for Supabase
              const dbPayload: any = {};
              for (const key in record) {
                const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
                dbPayload[snakeKey] = record[key];
              }

              // Map localDb store keys to Supabase table names
              const entityMapping: Record<string, string> = {
                productBatches: 'product_batches',
                purchaseRecords: 'purchase_records',
                salesTabs: 'sales_tabs'
              };
              const entityName = entityMapping[storeKey] || storeKey;

              // Remove local-only joined properties before pushing to Supabase
              delete dbPayload.batches;
              delete dbPayload.product_batches;

              await queueOp(entityName as any, 'upsert', String(record.id), dbPayload);
            } catch (qErr) {
              console.warn(`Could not queue op for sync in ${storeKey}:`, qErr);
            }

            // Update in-memory dedup sets
            existingIdSet.add(String(record.id));
            if (storeKey === 'products') {
              if (record.sku) dupSets.skus.add(record.sku);
              if (record.barcode) dupSets.barcodes.add(record.barcode);
            } else if (storeKey === 'customers') {
              if (record.phone) dupSets.phones.add(record.phone);
              if (record.email) dupSets.emails.add(record.email);
            } else if (storeKey === 'sales') {
              if (record.invoiceNumber) dupSets.invoices.add(record.invoiceNumber);
            } else if (storeKey === 'discounts') {
              if (record.name) dupSets.names.add(record.name);
            } else if (storeKey === 'users') {
              if (record.email) dupSets.emails.add(record.email);
            } else if (storeKey === 'categories' || storeKey === 'suppliers') {
              if (record.name) dupSets.names.add(record.name);
            } else if (storeKey === 'purchase_orders') {
              if (record.poNumber) dupSets.poNumbers.add(record.poNumber);
            }
          } catch (itemErr) {
            console.error(`Failed record in ${storeKey}:`, itemErr);
            failed++;
          }
          
          // Update progress every 50 records
          const processed = imported + skipped + failed;
          if (processed % 50 === 0 || processed === total) {
            sonner.update(`⏳ Processing ${storeKey.toUpperCase()} (${processed} / ${total})...`);
            // Yield to main thread so UI can update
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }

        summaries.push({ table: storeKey.toUpperCase(), total, imported, skipped, failed, duplicate });
      }

      // ── REFRESH REACT STATE FROM LOCAL DB (NO SUPABASE) ──
      // We must NOT call loadData() — it fetches from Supabase and overwrites what we just imported.
      // Instead, read each store directly from IndexedDB and dispatch to React state.
      sonner.update('Refresh app state...');

      for (const storeKey of storeKeys) {
        const actionType = DISPATCH_MAP[storeKey];
        if (!actionType) continue;

        try {
          const dbKeyMap: Record<string, string> = {
            settings: 'appSettings',
            purchase_orders: 'purchaseOrders',
            purchase_order_items: 'purchaseOrderItems',
            supplier_transactions: 'supplierTransactions',
            stock_history: 'stockHistory',
            bundles: 'bundles',
            bundle_items: 'bundleItems',
            bundle_slots: 'bundleSlots',
            bundle_slot_options: 'bundleSlotOptions',
          };
          const dbKey = dbKeyMap[storeKey] || storeKey;
          const table = (localDb as any)[dbKey];

          if (table && typeof table.toArray === 'function') {
            const freshData = await table.toArray();
            dispatch({ type: actionType, payload: storeKey === 'salesTabs' ? freshData.slice(0, 3) : freshData } as any);
          }
        } catch (dispatchErr) {
          console.warn(`Could not refresh ${storeKey} in React state:`, dispatchErr);
        }
      }

      // Update in-memory dedup sets
      const totalRecords = summaries.reduce((s, r) => s + r.total, 0);
      const totalImported = summaries.reduce((s, r) => s + r.imported, 0);
      const totalSkipped = summaries.reduce((s, r) => s + r.skipped, 0);
      const totalFailed = summaries.reduce((s, r) => s + r.failed, 0);
      const totalDuplicate = summaries.reduce((s, r) => s + r.duplicate, 0);

      // Filter out tables with 0 total (not in backup)
      const activeSummaries = summaries.filter(s => s.total > 0);

      // ── BUILD SUMMARY HTML ──
      const summaryHTML = `
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin:14px 0 18px">
          <div style="text-align:center;min-width:52px">
            <div style="font-size:22px;font-weight:900;color:#6B7280">${totalRecords}</div>
            <div style="font-size:9px;font-weight:800;color:#9CA3AF;text-transform:uppercase;letter-spacing:.8px">Total</div>
          </div>
          <div style="text-align:center;min-width:52px">
            <div style="font-size:22px;font-weight:900;color:#10B981">${totalImported}</div>
            <div style="font-size:9px;font-weight:800;color:#9CA3AF;text-transform:uppercase;letter-spacing:.8px">Imported</div>
          </div>
          <div style="text-align:center;min-width:52px">
            <div style="font-size:22px;font-weight:900;color:#F59E0B">${totalSkipped}</div>
            <div style="font-size:9px;font-weight:800;color:#9CA3AF;text-transform:uppercase;letter-spacing:.8px">Skipped</div>
          </div>
          <div style="text-align:center;min-width:52px">
            <div style="font-size:22px;font-weight:900;color:#8B5CF6">${totalDuplicate}</div>
            <div style="font-size:9px;font-weight:800;color:#9CA3AF;text-transform:uppercase;letter-spacing:.8px">Duplicate</div>
          </div>
          <div style="text-align:center;min-width:52px">
            <div style="font-size:22px;font-weight:900;color:#EF4444">${totalFailed}</div>
            <div style="font-size:9px;font-weight:800;color:#9CA3AF;text-transform:uppercase;letter-spacing:.8px">Failed</div>
          </div>
        </div>
        ${activeSummaries.length > 0 ? `
        <div style="max-height:200px;overflow-y:auto;border-radius:12px;border:1px solid rgba(128,128,128,0.2)">
          <table style="width:100%;border-collapse:collapse;font-size:11px;font-weight:700">
            <thead>
              <tr style="background:rgba(128,128,128,0.1)">
                <th style="padding:7px 10px;text-align:left;color:${isDark ? '#D1D5DB' : '#374151'}">TABLE</th>
                <th style="padding:7px 6px;text-align:center;color:#6B7280">TOTAL</th>
                <th style="padding:7px 6px;text-align:center;color:#10B981">NEW</th>
                <th style="padding:7px 6px;text-align:center;color:#F59E0B">SKIP</th>
                <th style="padding:7px 6px;text-align:center;color:#8B5CF6">DUP</th>
                <th style="padding:7px 6px;text-align:center;color:#EF4444">FAIL</th>
              </tr>
            </thead>
            <tbody>
              ${activeSummaries.map(s => `
                <tr style="border-top:1px solid rgba(128,128,128,0.1)">
                  <td style="padding:6px 10px;color:${isDark ? '#E5E7EB' : '#1F2937'}">${s.table}</td>
                  <td style="padding:6px;text-align:center;color:#6B7280">${s.total}</td>
                  <td style="padding:6px;text-align:center;color:${s.imported > 0 ? '#10B981' : (isDark ? '#4B5563' : '#9CA3AF')};font-weight:${s.imported > 0 ? '900' : '700'}">${s.imported}</td>
                  <td style="padding:6px;text-align:center;color:${s.skipped > 0 ? '#F59E0B' : (isDark ? '#4B5563' : '#9CA3AF')}">${s.skipped}</td>
                  <td style="padding:6px;text-align:center;color:${s.duplicate > 0 ? '#8B5CF6' : (isDark ? '#4B5563' : '#9CA3AF')}">${s.duplicate}</td>
                  <td style="padding:6px;text-align:center;color:${s.failed > 0 ? '#EF4444' : (isDark ? '#4B5563' : '#9CA3AF')}">${s.failed}</td>
                </tr>`).join('')}
              <tr style="border-top:2px solid rgba(128,128,128,0.25);background:rgba(128,128,128,0.06)">
                <td style="padding:7px 10px;font-weight:900;color:${isDark ? '#fff' : '#111827'}">TOTAL</td>
                <td style="padding:7px 6px;text-align:center;font-weight:900;color:#6B7280">${totalRecords}</td>
                <td style="padding:7px 6px;text-align:center;font-weight:900;color:#10B981">${totalImported}</td>
                <td style="padding:7px 6px;text-align:center;font-weight:900;color:#F59E0B">${totalSkipped}</td>
                <td style="padding:7px 6px;text-align:center;font-weight:900;color:#8B5CF6">${totalDuplicate}</td>
                <td style="padding:7px 6px;text-align:center;font-weight:900;color:#EF4444">${totalFailed}</td>
              </tr>
            </tbody>
          </table>
        </div>` : `<p style="color:#9CA3AF;font-size:12px;font-weight:600">No matching tables found in backup file for selected tables.</p>`}
      `;

      await sonner.alert(
        totalImported > 0
          ? '✅ Import Complete!'
          : activeSummaries.length === 0
            ? '⚠️ Nothing to Import'
            : '🔁 No New Records',
        `
          <div style="font-size:12px;color:${isDark ? '#9CA3AF' : '#6B7280'};font-weight:600;margin-top:4px;margin-bottom:12px;text-align:center">
            ${totalImported > 0
          ? `${totalImported} new records added across ${activeSummaries.filter(s => s.imported > 0).length} table(s)`
          : totalDuplicate > 0
            ? `All ${totalDuplicate} records already exist — nothing was imported`
            : 'No records were processed'}
          </div>
          ${summaryHTML}`
      );

      // ── TRIGGER AUTO-SYNC ──
      try {
        const { syncNow } = await import('../../lib/syncEngine');
        syncNow({ resetRetries: true }).catch(e => console.warn('Post-import sync failed:', e));
      } catch (e) {
        console.warn('Sync engine not available for post-import trigger');
      }

      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

    } catch (err: any) {
      console.error('Import failed:', err);
      sonner.close();
      sonner.error(`Import failed: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handlePurgeAll = async () => {
    const result = await sonner.confirm(
      'System Reset?',
      'This will wipe ALL local data for this workspace and force a fresh synchronization. Are you sure?'
    );

    if (result.isConfirmed) {
      sonner.loading('Purging...');
      await purgeLocalData();
    }
  };

  const handleSeedBarcodes = async () => {
    setIsSeeding(true);
    sonner.loading('Scanning product catalog for missing Code 128 barcodes...');
    try {
      const res = await seedMissingBarcodes();
      sonner.close();
      if (res.count === 0) {
        sonner.success('All products already have valid Code 128 barcodes.');
      } else {
        sonner.success(`Successfully populated ${res.count} products with Code 128 barcodes.`);
      }
    } catch (err: any) {
      sonner.close();
      sonner.error(`Barcode population failed: ${err.message}`);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleAuditStock = async () => {
    setIsAuditing(true);
    sonner.loading('Executing database-level stock integrity audit...');
    try {
      const res = await auditStockIntegrity();
      sonner.close();
      if (res.length === 0) {
        sonner.success('Stock Integrity Audit Passed: 0 discrepancies found across all batches.');
      } else {
        sonner.warning(`Found ${res.length} product(s) with stock discrepancies.`);
      }
    } catch (err: any) {
      sonner.close();
      sonner.error(`Stock audit failed: ${err.message}`);
    } finally {
      setIsAuditing(false);
    }
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-gray-50 dark:border-white/5">
        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
          <Database className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg sm:text-xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Database Management</h2>
          <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest mt-0.5">Backup &amp; Restore with Table Selection</p>
        </div>
      </div>

      {/* ROW 1: Table Selection (7) + Backups (5) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Table Selection (7 Cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-black/20 p-5 rounded-[2rem] border border-gray-200 dark:border-white/5 shadow-md space-y-4">
          <div className="flex items-center justify-between border-b border-gray-200/50 dark:border-white/5 pb-2">
            <h3 className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-wider">Select Tables</h3>
            <button
              type="button"
              onClick={toggleAll}
              className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-primary dark:text-emerald-400 hover:underline"
            >
              {allSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {STORE_OPTIONS.map(store => {
              const Icon = store.icon;
              const isSelected = selectedStores.has(store.key);
              return (
                <button
                  type="button"
                  key={store.key}
                  onClick={() => toggleStore(store.key)}
                  className={`flex items-center gap-2 p-2 rounded-xl text-left text-[11px] font-bold transition-all border ${isSelected
                    ? 'bg-emerald-50 dark:bg-primary/10 border-emerald-200 dark:border-primary/30 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/10'
                    : 'bg-gray-50 dark:bg-white/[0.02] border-gray-200 dark:border-white/5 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5'
                    }`}
                >
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? store.color : 'text-gray-600 dark:text-gray-500'}`} />
                  <span className="truncate">{store.label}</span>
                  {isSelected && <CheckCircle2 className="w-3 h-3 ml-auto text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
          <div className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">
            {selectedStores.size} of {STORE_OPTIONS.length} tables selected
          </div>
        </div>

        {/* RIGHT COLUMN: Export/Import Stack (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white dark:bg-black/20 p-5 rounded-[2rem] border border-gray-200 dark:border-white/5 shadow-md space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Export Panel */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-blue-500" />
                  <h4 className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-wider">Export</h4>
                </div>
                <p className="text-[10px] text-gray-500 font-medium">Backup selected tables to JSON file.</p>
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={isExporting || selectedStores.size === 0}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-black uppercase text-[9px] tracking-widest rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5"
                >
                  {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileJson className="h-3.5 w-3.5" />}
                  {isExporting ? 'Exporting...' : 'Export'}
                </button>
              </div>

              {/* Import Panel */}
              <div className="space-y-3 border-t sm:border-t-0 sm:border-l border-gray-100 dark:border-white/5 sm:pl-4 pt-3 sm:pt-0">
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-primary" />
                  <h4 className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-wider">Import</h4>
                </div>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex items-center gap-2 p-2 rounded-xl border border-dashed cursor-pointer transition-all ${selectedFile
                    ? 'border-emerald-300 dark:border-primary/40 bg-emerald-50/50 dark:bg-primary/5'
                    : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.02]'
                    }`}
                >
                  <FileJson className={`w-4 h-4 shrink-0 ${selectedFile ? 'text-primary' : 'text-gray-400'}`} />
                  <span className={`text-[10px] font-bold truncate ${selectedFile ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-400'}`}>
                    {selectedFile ? selectedFile.name : 'Select file'}
                  </span>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept=".json"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={isImporting || !selectedFile || selectedStores.size === 0}
                  className="w-full py-2.5 bg-primary hover:bg-emerald-700 disabled:opacity-40 text-white font-black uppercase text-[9px] tracking-widest rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5"
                >
                  {isImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  {isImporting ? 'Importing...' : 'Import'}
                </button>
              </div>

            </div>

            {/* Nested Safety Notice */}
            <div className="p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/25 rounded-xl flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[9px] text-amber-800/80 dark:text-amber-400/60 font-bold leading-relaxed uppercase tracking-wider">
                Import merges records. Duplicates are auto-skipped by ID/SKU/Barcode/Invoice.
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* ROW 2: Advanced Audits (7) + Reset Danger Zone (5) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start pt-4 border-t border-gray-100 dark:border-white/5">
        
        {/* LEFT COLUMN: Advanced Tools (7 Cols) */}
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
          
          {/* Barcode Seeding */}
          <div className="bg-emerald-50/40 dark:bg-emerald-950/10 p-5 rounded-[2rem] border border-emerald-100 dark:border-emerald-950/20 shadow-sm flex flex-col justify-between space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/20 rounded-xl flex items-center justify-center shrink-0">
                <Barcode className="w-5 h-5 text-primary dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="text-xs font-black text-emerald-950 dark:text-emerald-300 uppercase tracking-tight">Barcode Seeding</h3>
                <p className="text-emerald-800/60 dark:text-emerald-400/50 text-[9px] mt-1 font-bold leading-relaxed uppercase tracking-wider">
                  Generate missing Code 128 barcodes for existing items.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSeedBarcodes}
              disabled={isSeeding}
              className="w-full py-2.5 bg-primary hover:bg-emerald-700 disabled:opacity-40 text-white font-black uppercase text-[9px] tracking-widest rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5"
            >
              {isSeeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Barcode className="w-3.5 h-3.5" />}
              {isSeeding ? 'Populating...' : 'Populate Barcodes'}
            </button>
          </div>

          {/* Stock Audit */}
          <div className="bg-blue-50/40 dark:bg-blue-950/10 p-5 rounded-[2rem] border border-blue-100 dark:border-blue-950/20 shadow-sm flex flex-col justify-between space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/20 rounded-xl flex items-center justify-center shrink-0">
                <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="text-xs font-black text-blue-950 dark:text-blue-300 uppercase tracking-tight">Integrity Audit</h3>
                <p className="text-blue-800/60 dark:text-blue-400/50 text-[9px] mt-1 font-bold leading-relaxed uppercase tracking-wider">
                  Check Rule F8 parity across products & FIFO batches.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleAuditStock}
              disabled={isAuditing}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-black uppercase text-[9px] tracking-widest rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5"
            >
              {isAuditing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
              {isAuditing ? 'Auditing...' : 'Run Stock Audit'}
            </button>
          </div>

        </div>

        {/* RIGHT COLUMN: Danger Zone (5 Cols) */}
        <div className="lg:col-span-5">
          <div className="bg-red-50/40 dark:bg-red-950/10 p-5 rounded-[2rem] border border-red-100 dark:border-red-950/20 shadow-sm space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-red-100 dark:bg-red-900/20 rounded-xl flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-500" />
              </div>
              <div>
                <h3 className="text-xs font-black text-red-950 dark:text-red-400 uppercase tracking-tight">System Reset</h3>
                <p className="text-red-800/60 dark:text-red-400/50 text-[9px] mt-1 font-bold leading-relaxed uppercase tracking-wider">
                  Wipes local database and triggers a fresh sync from cloud.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handlePurgeAll}
              className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-black uppercase text-[9px] tracking-widest rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5"
            >
              Purge Local Database
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
