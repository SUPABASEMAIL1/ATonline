import { useState, useMemo } from 'react';
import {
  Loader2, Plus, ChevronLeft, ArrowUpRight, TrendingUp, Building2, CheckCircle2, X,
  ShoppingCart, Search, Calendar, Info, Package, Save, Trash2, RefreshCw
} from 'lucide-react';
import { SearchableSelect } from '../common/SearchableSelect';
import { useApp } from '../../context/SupabaseAppContext';
import { useAuth } from '../../context/AuthContext';
import {
  productsService,
  suppliersService,
  expensesService,
  generateId,
  toRemoteProductBatch,
  toRemoteSupplierTransaction,
  toRemotePurchaseRecord,
  toRemoteStockHistory,
  toRemoteExpense
} from '../../lib/services';
import { sonner } from '../../lib/sonner';
import { Product } from '../../types';
import { formatCurrency, getCurrencySymbol } from '../../lib/currencies';
import { queueOp, localDb } from '../../lib/localDb';
import { Modal } from '../common/Modal';
import { cn } from '../../lib/utils';
import { useTranslation } from '../../hooks/useTranslation';

interface BatchStockInSystemProps {
  onClose: () => void;
  initialProduct?: Product | null;
}

export function BatchStockInSystem({ onClose, initialProduct }: BatchStockInSystemProps) {
  const { state, dispatch } = useApp();
  const { profile } = useAuth();
  const { t } = useTranslation();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItems, setSelectedItems] = useState<any[]>(initialProduct ? [{
    ...initialProduct,
    quantity: 1,
    costPrice: initialProduct.cost || 0,
    retailPrice: initialProduct.price || 0,
    batchSupplier: initialProduct.supplier || ''
  }] : []);
  const [isCommitting, setIsCommitting] = useState(false);

  const [batchData, setBatchData] = useState({
    date: new Date().toLocaleDateString('en-CA'),
    notes: '',
    paidAmount: 0,
    paymentMethod: 'cash'
  });

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return (state.products as Product[])
      .filter((p: Product) => p.active && (
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.barcode && p.barcode.toLowerCase().includes(searchQuery.toLowerCase()))
      ))
      .slice(0, 5);
  }, [state.products, searchQuery]);

  const addToBatch = (product: Product) => {
    if (selectedItems.find(p => p.id === product.id)) {
      sonner.warning('Product already in the list');
      return;
    }
    setSelectedItems(prev => [...prev, {
      ...product,
      quantity: 1,
      costPrice: product.cost || 0,
      retailPrice: product.price || 0,
      batchSupplier: product.supplier || ''
    }]);
    setSearchQuery('');
  };

  const removeItem = (id: string) => {
    setSelectedItems(prev => prev.filter(p => p.id !== id));
  };

  const updateItem = (id: string, field: string, value: any) => {
    setSelectedItems(prev => prev.map((p: any) =>
      p.id === id ? { ...p, [field]: value } : p
    ));
  };

  const totalInvoiceCost = selectedItems.reduce((sum: number, item: any) => sum + (Number(item.quantity) * Number(item.costPrice)), 0);
  const totalInvoiceSale = selectedItems.reduce((sum: number, item: any) => sum + (Number(item.quantity) * Number(item.retailPrice)), 0);
  const totalItemsCount = selectedItems.reduce((sum: number, item: any) => sum + Number(item.quantity), 0);

  const handleCommit = async () => {
    if (selectedItems.length === 0) {
      sonner.error('Please add at least one product to the invoice.');
      return;
    }

    const result = await sonner.confirm(
      t('confirm_stock_in_title'),
      t('confirm_stock_in_desc').replace('{count}', selectedItems.length.toString()),
      t('yes_confirm')
    );

    if (!result.isConfirmed) return;

    setIsCommitting(true);
    sonner.loading('Updating inventory...');

    try {
      const now = new Date();
      const dateOnly = batchData.date;
      const timestamp = new Date(dateOnly);

      if (dateOnly === now.toLocaleDateString('en-CA')) {
        timestamp.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
      } else {
        timestamp.setHours(12, 0, 0);
      }

      for (const item of selectedItems) {
        const qty = Number(item.quantity);
        const cost = Number(item.costPrice);
        const retail = Number(item.retailPrice);
        const batchId = generateId();

        const recordId = generateId();
        const newRecord = {
          id: recordId,
          productId: item.id,
          productName: item.name,
          sku: item.sku || '',
          quantity: qty,
          costPrice: cost,
          totalAmount: qty * cost,
          type: 'Stock IN',
          supplier: item.batchSupplier || item.supplier || 'DIRECT ENTRY',
          date: timestamp,
          addedBy: profile?.email || 'System',
          notes: batchData.notes ? `${batchData.notes} | Batch Record` : 'Inventory Re-stock',
          createdAt: now
        };
        await localDb.purchaseRecords.add(newRecord as any);
        queueOp('purchase_records', 'create', recordId, toRemotePurchaseRecord(newRecord as any));

        dispatch({ type: 'ADD_PURCHASE_RECORD', payload: newRecord as any });

        const newBatch = {
          id: batchId,
          productId: item.id,
          // RULE: batch_number NEVER null — use B-{timestamp}-{id} format
          batchNumber: `B-${Date.now()}-${batchId.substr(0, 6).toUpperCase()}`,
          quantity: qty,
          qtyRemaining: qty,
          costPrice: cost,
          salePrice: retail,
          supplier: item.batchSupplier || item.supplier || 'DIRECT ENTRY',
          createdAt: new Date()
        };

        await localDb.productBatches.put(newBatch as any);
        queueOp('product_batches', 'create', batchId, toRemoteProductBatch(newBatch));

        const currentProduct = state.products.find(p => p.id === item.id);
        if (currentProduct) {
          const updatedBatches = [...(currentProduct.batches || []), {
            id: newBatch.id,
            productId: item.id,
            batchNumber: newBatch.batchNumber,
            quantity: qty,
            qtyRemaining: qty,
            costPrice: cost,
            salePrice: retail,
            supplier: newBatch.supplier,
            createdAt: now
          }];

          const baselineStock = (currentProduct.stock >= 990000 || currentProduct.trackInventory === false) ? 0 : currentProduct.stock;
          const newStockCount = baselineStock + qty;

          const updatedProduct = {
            ...currentProduct,
            stock: newStockCount,
            cost: cost,
            price: retail,
            trackInventory: true,
            supplier: item.batchSupplier || currentProduct.supplier,
            batches: updatedBatches
          };

          await productsService.update(item.id, {
            stock: updatedProduct.stock,
            cost: updatedProduct.cost,
            price: updatedProduct.price,
            trackInventory: true,
            supplier: updatedProduct.supplier,
            batches: updatedBatches
          });

          const histId = generateId();
          const histEntry = {
            id: histId,
            productId: item.id,
            changeQty: qty,
            type: 'stock_in' as const,
            referenceId: recordId,
            note: `Batch Stock In: ${item.batchSupplier || item.supplier || 'DIRECT'}`,
            balanceAfter: newStockCount,
            cashierId: profile?.id || state.currentUser?.id,
            cashierName: profile?.name || state.currentUser?.name || profile?.username || state.currentUser?.username || 'System',
            createdAt: now
          };
          await localDb.stockHistory.add(histEntry);
          queueOp('stock_history', 'create', histId, toRemoteStockHistory(histEntry));

          dispatch({ type: 'UPDATE_PRODUCT', payload: updatedProduct });
        }

        // Record supplier ledger transaction if a supplier is associated
        const supplierName = item.batchSupplier || item.supplier;
        if (supplierName && supplierName !== 'DIRECT ENTRY') {
          const matchedSupplier = state.suppliers.find(
            s => s.name.toLowerCase() === supplierName.toLowerCase()
          );
          if (matchedSupplier) {
            try {
              await suppliersService.recordBill({
                supplierId: matchedSupplier.id,
                amount: qty * cost,
                note: `Stock In: ${item.name} x${qty}`,
                referenceId: recordId,
              });
            } catch (ledgerErr) {
              console.warn('[BatchStockIn] Failed to record supplier ledger entry:', ledgerErr);
            }
          }
        }
      }


      sonner.success('Batch stock-in completed successfully.');
      setSelectedItems([]);
      onClose();
    } catch (error) {
      console.error('Batch Stock In failed:', error);
      sonner.error('Failed to update inventory. Please try again.');
    } finally {
      setIsCommitting(false);
    }
  };

  const footer = (
    <div className="flex items-center justify-between w-full">
      <div className="hidden sm:flex items-center gap-6">
        <div className="flex flex-col">
          <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">{t('total_sourced_cost')}</span>
          <span className="text-xl font-black text-primary tabular-nums leading-none mt-1">{formatCurrency(totalInvoiceCost, state.settings.currency)}</span>
        </div>
        <div className="w-px h-8 bg-gray-100 dark:bg-white/10" />
        <div className="flex flex-col">
          <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">{t('unit_count')}</span>
          <span className="text-xl font-black text-gray-900 dark:text-white tabular-nums leading-none mt-1">{totalItemsCount}</span>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 sm:gap-3 flex-1">
        <button
          onClick={onClose}
          className="flex-1 sm:flex-none px-4 sm:px-6 py-2.5 sm:py-3.5 border border-rose-200 dark:border-rose-900/30 text-[#ff4b6e] hover:bg-rose-50 dark:hover:bg-rose-500/10 text-[9px] sm:text-[11px] font-black uppercase tracking-widest rounded-2xl transition-all active:scale-95 shrink-0"
        >
          {t('abort_inflow')}
        </button>
        <button
          onClick={handleCommit}
          disabled={selectedItems.length === 0 || isCommitting}
          className="btn btn-md btn-primary flex-1 sm:flex-none sm:min-w-[280px] !py-2.5 sm:!py-3.5 !text-[9px] sm:!text-[11px]"
        >
          {isCommitting ? (
            <RefreshCw className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
          ) : (
            <Save className="h-4 w-4 sm:h-5 sm:w-5" />
          )}
          <span>{t('commit_inventory')}</span>
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={t('stock_inflow_protocol')}
      maxWidth="max"
      footer={footer}
    >
      <div className="space-y-8 pb-10">
        {/* Search & Metadata Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <h3 className="text-[11px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest flex items-center gap-3">
              <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
              {t('identity_matching_buffer')}
            </h3>
            <div className="relative group">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-600 group-focus-within:text-primary transition-colors" />
              <input
                type="text"
                placeholder={t('scan_or_type_product_identity')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none rounded-2xl pl-16 pr-6 py-5 text-sm font-black uppercase tracking-widest text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 transition-all placeholder:text-gray-600"
              />
              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-3 bg-white dark:bg-surface rounded-2xl shadow-2xl border border-gray-200 dark:border-white/5 overflow-hidden z-50">
                  <div className="max-h-[300px] overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {searchResults.map(product => (
                      <button
                        key={product.id}
                        onClick={() => addToBatch(product)}
                        className={cn(
                          "w-full text-left p-3 hover:bg-primary/10 rounded-xl flex items-center justify-between transition-all group",
                          selectedItems.some(m => m.id === product.id) && 'opacity-50'
                        )}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-gray-100 dark:bg-white/5 rounded-lg flex items-center justify-center shrink-0">
                            {product.image ? <img src={product.image} className="w-full h-full object-cover rounded-lg" /> : <Package className="h-5 w-5 text-gray-600" />}
                          </div>
                          <div>
                            <p className="text-[11px] font-black uppercase text-gray-900 dark:text-white leading-tight">{product.name}</p>
                            <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest mt-0.5">{product.sku || 'NO_SKU'}</p>
                          </div>
                        </div>
                        <Plus className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-all" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-[11px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest flex items-center gap-3">
              <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
              {t('sourcing_metadata')}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest">{t('transmission_date')}</label>
                <input
                  type="date"
                  value={batchData.date}
                  onChange={(e) => setBatchData(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none p-4 rounded-xl text-[11px] font-black text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 transition-all uppercase"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest">{t('internal_ref')}</label>
                <input
                  value={batchData.notes}
                  onChange={(e) => setBatchData(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none p-4 rounded-xl text-[11px] font-black text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 transition-all uppercase"
                  placeholder="PO_ID..."
                />
              </div>
            </div>
          </div>
        </div>

        {/* Selected Items Grid */}
        <div className="space-y-6">
          <h3 className="text-[11px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest flex items-center gap-3">
            <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
            {t('staging_matrix').replace('{count}', selectedItems.length.toString())}
          </h3>
          <div className="bg-white dark:bg-surface rounded-[2rem] border border-gray-200 dark:border-white/5 overflow-hidden">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 dark:bg-white/[0.02]">
                    <th className="px-6 py-4 text-[9px] font-black text-gray-600 uppercase tracking-[0.2em]">{t('product_identity')}</th>
                    <th className="px-6 py-4 text-[9px] font-black text-gray-600 uppercase tracking-[0.2em]">{t('sourcing')}</th>
                    <th className="px-6 py-4 text-[9px] font-black text-primary uppercase tracking-[0.2em] text-center">{t('qty')}</th>
                    <th className="px-6 py-4 text-[9px] font-black text-gray-600 uppercase tracking-[0.2em] text-right">{t('cost')}</th>
                    <th className="px-6 py-4 text-[9px] font-black text-gray-600 uppercase tracking-[0.2em] text-right">{t('retail')}</th>
                    <th className="px-6 py-4 text-[9px] font-black text-gray-600 uppercase tracking-[0.2em] text-center">{t('ops')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                  {selectedItems.map(item => (
                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.01] transition-all">
                      <td className="px-6 py-4">
                        <p className="text-[11px] font-black text-gray-900 dark:text-white uppercase leading-tight">{item.name}</p>
                        <p className="text-[9px] font-bold text-gray-600 uppercase mt-0.5">{item.sku || 'SKU_UNKNOWN'}</p>
                      </td>
                      <td className="px-6 py-4">
                        <input
                          type="text"
                          value={item.batchSupplier}
                          onChange={(e) => updateItem(item.id, 'batchSupplier', e.target.value)}
                          className="w-full bg-[#f8f9fa] dark:bg-black/20 border-none rounded-lg px-3 py-2 text-[10px] font-black text-gray-900 dark:text-white uppercase"
                          placeholder={t('direct_entry')}
                        />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(item.id, 'quantity', Number(e.target.value))}
                          className="w-16 bg-primary/10 border-none rounded-lg px-2 py-2 text-center text-xs font-black text-primary dark:text-emerald-400"
                        />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <input
                          type="number"
                          value={item.costPrice}
                          onChange={(e) => updateItem(item.id, 'costPrice', Number(e.target.value))}
                          className="w-20 bg-[#f8f9fa] dark:bg-black/20 border-none rounded-lg px-2 py-2 text-right text-xs font-black text-gray-900 dark:text-white"
                        />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <input
                          type="number"
                          value={item.retailPrice}
                          onChange={(e) => updateItem(item.id, 'retailPrice', Number(e.target.value))}
                          className="w-20 bg-[#f8f9fa] dark:bg-black/20 border-none rounded-lg px-2 py-2 text-right text-xs font-black text-gray-900 dark:text-white"
                        />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button onClick={() => removeItem(item.id)} className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"><Trash2 className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
