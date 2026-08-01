import { generateId, purchaseRecordsService, suppliersService } from './services';
import { localDb } from './localDb';

/**
 * Shared single source of truth for committing stock-in entries to inventory.
 *
 * Used by BOTH PurchaseOrderSystem (bulk PO admit) and ProductDetailHub
 * (per-product Quick Restock) — never write a second parallel implementation.
 *
 * Per item:
 *  1. Creates a Purchase Record via purchaseRecordsService.create
 *     (handles product stock update, last-cost update + stock_history internally)
 *  2. Dispatches ADD_PURCHASE_RECORD to global state
 *  3. Optionally records the supplier ledger bill (when toggle is ON + supplier matched)
 *  4. Re-reads the fresh product from localDb and dispatches UPDATE_PRODUCT
 */

export interface StockInCommitItem {
  id: string;
  name: string;
  sku?: string;
  quantity: number;
  costPrice: number;
  supplier?: string;
  type?: string;
  notes?: string;
}

interface StockInCommitParams {
  items: StockInCommitItem[];
  recordAsSupplierBill?: boolean;
  suppliers: { id: string; name: string }[];
  profile?: { email?: string | null } | null;
  dispatch: (action: { type: string; payload?: any }) => void;
  date?: Date;
}

export async function commitStockInToInventory({
  items,
  recordAsSupplierBill = true,
  suppliers,
  profile,
  dispatch,
  date = new Date(),
}: StockInCommitParams) {
  let lastProduct: any = null;

  for (const item of items) {
    if (!item.quantity || item.quantity <= 0) continue;

    const supplier = item.supplier || 'PO TRANSIT';

    const newRecord = await purchaseRecordsService.create({
      id: generateId(),
      productId: item.id,
      productName: item.name,
      sku: item.sku || '',
      quantity: item.quantity,
      costPrice: item.costPrice || 0,
      totalAmount: item.quantity * (item.costPrice || 0),
      type: item.type || 'Stock IN',
      supplier,
      date,
      addedBy: profile?.email || 'System',
      notes: item.notes || `Stock In | ${date.toLocaleDateString()}`
    });

    dispatch({ type: 'ADD_PURCHASE_RECORD', payload: newRecord });

    // Record supplier ledger transaction if toggle is ON and a supplier is associated
    if (recordAsSupplierBill && supplier !== 'PO TRANSIT' && supplier !== 'DIRECT ENTRY') {
      const matchedSupplier = suppliers.find(
        s => s.name.toLowerCase() === supplier.toLowerCase()
      );
      if (matchedSupplier) {
        try {
          await suppliersService.recordBill({
            supplierId: matchedSupplier.id,
            amount: item.quantity * (item.costPrice || 0),
            note: `PO Stock In: ${item.name} x${item.quantity}`,
            referenceId: newRecord.id,
            sourceType: 'auto_purchase',
          });
        } catch (ledgerErr) {
          console.warn('[StockIn] Failed to record supplier ledger entry:', ledgerErr);
        }
      }
    }

    // Read fresh product from localDb so we get the updated stock from within the service
    const freshProduct = await localDb.products.get(item.id);
    if (freshProduct) {
      lastProduct = freshProduct;
      dispatch({ type: 'UPDATE_PRODUCT', payload: freshProduct });
    }
  }

  return lastProduct;
}
