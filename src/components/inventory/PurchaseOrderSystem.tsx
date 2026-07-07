import React, { useState, useMemo, useRef } from 'react';
import { PackageOpen, Download, Printer, TrendingDown, Building2, ChevronLeft, ChevronRight, Trash2, Filter, Settings2, Plus, User as UserIcon, X, Info, CheckCircle2, Search, Camera } from 'lucide-react';
import { CameraScanner } from '../common/CameraScanner';
import { useApp } from '../../context/SupabaseAppContext';
import { useAuth } from '../../context/AuthContext';
import { productsService, purchaseRecordsService, generateId } from '../../lib/services';
import { sonner } from '../../lib/sonner';
import { formatCurrency, getCurrencySymbol, formatNumberWithPrecision } from '../../lib/currencies';
import { SearchableSelect } from '../common/SearchableSelect';
import { useTranslation } from '../../hooks/useTranslation';

const ITEMS_PER_PAGE = 25;

export function PurchaseOrderSystem() {
  const { state, dispatch } = useApp();
  const { profile } = useAuth();
  const { t } = useTranslation();
  const isAdmin = profile?.role === 'admin';

  const [selectedSupplier, setSelectedSupplier] = useState<string>('All');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [isGenerated, setIsGenerated] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // Manual PO States
  const [poMode, setPoMode] = useState<'auto' | 'manual'>('auto');
  const [manualList, setManualList] = useState<any[]>([]);
  const [autoOverrides, setAutoOverrides] = useState<Record<string, any>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [batchSupplier, setBatchSupplier] = useState('');
  const [batchCategory, setBatchCategory] = useState('');
  const [showScanner, setShowScanner] = useState(false);

  // Filter options
  const suppliers = useMemo(() => {
    const sups = state.products.map(p => p.supplier).filter(Boolean);
    return ['All', ...Array.from(new Set(sups)).sort()];
  }, [state.products]);

  const categories = useMemo(() => {
    const cats = state.products.map(p => p.category).filter(Boolean);
    return ['All', ...Array.from(new Set(cats)).sort()];
  }, [state.products]);

  // Identify products below minStock or targetStock
  const deficiencyList = useMemo(() => {
    return state.products.filter(p => {
      if (p.trackInventory === false) return false;
      const minStock = p.minStock || 5;
      return p.stock <= minStock || (p.targetStock != null && p.stock < p.targetStock);
    }).map(p => {
      // Logic for needed quantity: prioritize targetStock if set, else fulfill up to a reasonable buffer
      const target = p.targetStock || (p.minStock != null ? p.minStock + 10 : 15);
      return {
        ...p,
        neededQty: Math.max(0, target - p.stock)
      };
    });
  }, [state.products]);

  // Filtered list based on exact form selection
  const filteredList = useMemo(() => {
    let list = deficiencyList;
    if (selectedSupplier !== 'All') {
      if (selectedSupplier === 'Unassigned') {
        list = list.filter(p => !p.supplier);
      } else {
        list = list.filter(p => p.supplier === selectedSupplier);
      }
    }
    if (selectedCategory !== 'All') {
      list = list.filter(p => p.category === selectedCategory);
    }
    return list;
  }, [deficiencyList, selectedSupplier, selectedCategory]);

  // Active list with overrides applied
  const activeList = useMemo(() => {
    const base = poMode === 'auto' ? filteredList : manualList;
    return base.map(item => ({
      ...item,
      ...(autoOverrides[item.id] || {})
    }));
  }, [poMode, filteredList, manualList, autoOverrides]);

  const totalPages = Math.ceil(activeList.length / ITEMS_PER_PAGE);
  const paginatedList = activeList.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const totalItemsNeeded = activeList.reduce((sum, item) => sum + Number(item.neededQty || 0), 0);
  const estimatedCost = activeList.reduce((sum, item) => sum + (Number(item.neededQty || 0) * Number(item.cost || 0)), 0);

  // Any changes reset the generated view
  const handleFilterChange = (setter: React.Dispatch<React.SetStateAction<string>>, value: string) => {
    setter(value);
    setIsGenerated(false);
    setCurrentPage(1);
  };

  const handleGenerate = () => {
    setIsGenerated(true);
    if (filteredList.length === 0) {
      sonner.info('No products require restocking based on your filters.');
    } else {
      sonner.success(`Generated PO Draft with ${filteredList.length} items.`);
    }
  };

  const handleBulkAdmit = async () => {
    if (activeList.length === 0) return;

    const result = await sonner.confirm(
      'Convert PO to Stock?',
      `This will add total <strong>${totalItemsNeeded} items</strong> across ${activeList.length} products to your active inventory. Proceed?`,
      'Yes, Admit Stock'
    );

    if (!result.isConfirmed) return;

    sonner.loading('Processing bulk stock entry...');

    try {
      const now = new Date();
      const batchId = generateId(); // Use a shared batch marker if needed

      for (const item of activeList) {
        if (!item.neededQty || item.neededQty <= 0) continue;

        const qty = Number(item.neededQty);
        const cost = Number(item.cost);
        const retail = Number(item.price);

        // 1. Create Purchase Record (handles stock update, batch creation + history internally)
        const newRecord = await purchaseRecordsService.create({
          id: generateId(),
          productId: item.id,
          productName: item.name,
          sku: item.sku || '',
          quantity: qty,
          costPrice: cost,
          totalAmount: qty * cost,
          type: 'Stock IN',
          supplier: item.supplier || 'PO TRANSIT',
          date: now,
          addedBy: profile?.email || 'System',
          notes: `Bulk PO Restock | ${now.toLocaleDateString()}`
        });

        dispatch({ type: 'ADD_PURCHASE_RECORD', payload: newRecord });

        // Record supplier ledger transaction if a supplier is associated
        const supplierName = item.supplier;
        if (supplierName && supplierName !== 'PO TRANSIT' && supplierName !== 'DIRECT ENTRY') {
          const matchedSupplier = state.suppliers.find(
            s => s.name.toLowerCase() === supplierName.toLowerCase()
          );
          if (matchedSupplier) {
            try {
              const { suppliersService } = await import('../../lib/services');
              await suppliersService.recordBill({
                supplierId: matchedSupplier.id,
                amount: qty * cost,
                note: `PO Stock In: ${item.name} x${qty}`,
                referenceId: newRecord.id,
              });
            } catch (ledgerErr) {
              console.warn('[PO] Failed to record supplier ledger entry:', ledgerErr);
            }
          }
        }

        // Read fresh product from localDb so we get the updated stock from within the service
        const { localDb: ldb } = await import('../../lib/localDb');
        const freshProduct = await ldb.products.get(item.id);
        if (freshProduct) {
          dispatch({ type: 'UPDATE_PRODUCT', payload: freshProduct });
        }
      }

      sonner.success('Bulk reorder successfully added to inventory!');
      setIsGenerated(false);
      setManualList([]);
      setAutoOverrides({});
    } catch (error) {
      console.error('Bulk Admit Failed:', error);
      sonner.error('Failed to process bulk stock entry.');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    if (activeList.length === 0) {
      sonner.error('No items to export.');
      return;
    }

    const currency = state.settings.currency;
    const headerSuffix = ` (${currency})`;
    const headers = ['SKU', 'Product Name', 'Category', 'Supplier', 'Current Stock', 'Target Stock', 'Order Quantity', `Unit Cost${headerSuffix}`, `Subtotal${headerSuffix}`];
    const csvContent = [
      headers.join(','),
      ...activeList.map(p => [
        p.sku || '',
        `"${p.name.replace(/"/g, '""')}"`,
        `"${p.category || ''}"`,
        `"${p.supplier || 'Unassigned'}"`,
        p.stock,
        p.targetStock || '-',
        p.neededQty,
        formatNumberWithPrecision(p.cost || 0),
        formatNumberWithPrecision((p.neededQty || 0) * (p.cost || 0))
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const dateLabel = new Date().toLocaleDateString('en-CA');
    const supLabel = (poMode === 'auto' ? selectedSupplier : 'Manual_Selection').replace(/\s+/g, '_');
    link.download = `Purchase_Order_${supLabel}_${dateLabel}.csv`;
    link.click();
    sonner.success('Exported to CSV successfully.');
  };

  const updateItem = (id: string, field: string, value: any) => {
    if (poMode === 'manual') {
      setManualList(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
    } else {
      setAutoOverrides(prev => ({
        ...prev,
        [id]: { ...(prev[id] || {}), [field]: value }
      }));
    }
  };

  const applyBatchDetails = () => {
    if (!batchSupplier && !batchCategory) return;
    setManualList(prev => prev.map(p => ({
      ...p,
      supplier: batchSupplier || p.supplier,
      category: batchCategory || p.category
    })));
    if (batchSupplier) sonner.success(`Applied supplier "${batchSupplier}" to all items`);
  };

  const addAllToManual = (products: any[]) => {
    const toAdd = products.filter(p => !manualList.find(m => m.id === p.id));
    if (toAdd.length === 0) {
      sonner.info('All items are already in the list');
      return;
    }
    setManualList(prev => [...prev, ...toAdd.map(p => ({ ...p, neededQty: 1 }))]);
    setIsGenerated(true);
    sonner.success(`Added ${toAdd.length} items to manual PO list`);
  };

  const addToManualList = (product: any) => {
    if (manualList.find(p => p.id === product.id)) {
      // If already in list, maybe increment quantity or just notify
      sonner.warning('Product already in manual list');
      return;
    }
    setManualList(prev => [...prev, { ...product, neededQty: 1 }]);
    setIsGenerated(true);
    // REMOVED: setSearchQuery('') - Keeping search results open as per user request
  };

  const removeFromManualList = (id: string) => {
    setManualList(prev => prev.filter(p => p.id !== id));
  };

  const handleReset = async () => {
    const isManual = poMode === 'manual';
    const message = isManual
      ? 'This will instantly wipe all items added to the current list. Proceed?'
      : 'This will reset all manual overrides and filters for the reorder list. Proceed?';

    const res = await sonner.confirm(
      isManual ? 'Clear Manual PO List?' : 'Reset Auto PO Settings?',
      message,
      isManual ? 'Clear Everything' : 'Reset All'
    );

    if (res.isConfirmed) {
      if (isManual) {
        setManualList([]);
      } else {
        setAutoOverrides({});
        setSelectedSupplier('All');
        setSelectedCategory('All');
      }
      setIsGenerated(false);
      sonner.success(isManual ? 'Manual PO list cleared' : 'Auto PO settings reset');
    }
  };

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];

    let base = state.products.filter(p => p.active);

    // Contextual Filtering based on existing global filters
    if (selectedSupplier !== 'All') {
      if (selectedSupplier === 'Unassigned') {
        base = base.filter(p => !p.supplier);
      } else {
        base = base.filter(p => p.supplier === selectedSupplier);
      }
    }
    if (selectedCategory !== 'All') {
      base = base.filter(p => p.category === selectedCategory);
    }

    return base
      .filter(p => (
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.barcode && p.barcode.toLowerCase().includes(searchQuery.toLowerCase()))
      ))
      .slice(0, 15);
  }, [state.products, searchQuery, selectedSupplier, selectedCategory]);

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">

      {/* Mode / Settings Row */}
      {/* Mode / Settings Row - Smart Atomic Header */}
      <div className="print-hide bg-white dark:bg-surface p-6 lg:p-8 rounded-[2.5rem] border border-gray-200 dark:border-white/5 shadow-2xl relative">
        <div className="absolute inset-0 overflow-hidden rounded-[2.5rem] pointer-events-none">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <PackageOpen className="w-48 h-48 -mr-12 -mt-12" />
          </div>
        </div>

        <div className="relative z-10 flex flex-col gap-8">
          {/* Top Row: Title & Mode Selector */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-gray-50 dark:border-white/5 pb-6">
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center shadow-inner border border-primary/10 shrink-0">
                <PackageOpen className="h-7 w-7 text-primary" />
              </div>
              <div className="flex flex-col">
                <h2 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tighter leading-none">
                  {t('po_generation', 'PO Generation')}
                </h2>
                <div className="flex gap-2 mt-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#10B981] bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20">{t('system_center', 'System Center')}</span>
                </div>
              </div>
            </div>

            <div className="flex bg-gray-100/80 dark:bg-black/75 p-1.5 rounded-2xl border border-gray-200/50 dark:border-white/5 shadow-inner w-full sm:w-fit">
              {[
                { id: 'auto', label: t('auto_reorder', 'Auto (Reorder)') },
                { id: 'manual', label: t('manual_custom', 'Manual (Custom)') }
              ].map(mode => {
                const isActive = poMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    onClick={() => { setPoMode(mode.id as any); setIsGenerated(false); }}
                    className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-[10px] font-black tracking-widest uppercase transition-all duration-300 relative overflow-hidden z-10 active:scale-95 ${isActive
                      ? 'text-primary'
                      : 'text-gray-600 hover:text-gray-900 dark:hover:text-white'
                      }`}
                  >
                    {isActive && (
                      <div className="absolute inset-0 bg-white dark:bg-[#1f1f1f] border border-gray-200/50 dark:border-white/10 rounded-xl shadow-lg -z-10 animate-in zoom-in-95 duration-200" />
                    )}
                    <span className="relative z-10">{mode.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Middle Row: Global Filters & Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            {/* Supplier Filter (Atomic) */}
            <div className="flex items-center gap-3 bg-white dark:bg-black/20 px-5 py-2.5 rounded-2xl border border-gray-200 dark:border-white/5 shadow-sm transition-all h-[54px]">
              <Building2 className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-[140px]">
                <SearchableSelect
                  label={t('supplier_name', 'SUPPLIER')}
                  options={[{ id: 'All', label: t('all_suppliers', 'All Suppliers') }, ...state.suppliers.map(s => ({ id: s.name, label: s.name }))]}
                  value={selectedSupplier}
                  onChange={setSelectedSupplier}
                />
              </div>
            </div>

            {/* Category Filter (Atomic) */}
            <div className="flex items-center gap-3 bg-white dark:bg-black/20 px-5 py-2.5 rounded-2xl border border-gray-200 dark:border-white/5 shadow-sm transition-all h-[54px]">
              <Filter className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-[140px]">
                <SearchableSelect
                  label={t('category', 'CATEGORY')}
                  options={[{ id: 'All', label: t('all_categories', 'All Categories') }, ...state.categories.map(c => ({ id: c.name, label: c.name }))]}
                  value={selectedCategory}
                  onChange={setSelectedCategory}
                />
              </div>
            </div>

            {/* Reset PO Tool (Atomic) */}
            <div className="flex items-center gap-2 h-[54px]">
              <button
                onClick={handleReset}
                className="flex-1 h-full flex items-center justify-center gap-2 bg-gray-50 dark:bg-black/20 text-gray-600 hover:text-rose-500 border border-gray-200 dark:border-white/5 rounded-2xl px-4 text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t('reset', 'RESET')}
              </button>
            </div>

            <button
              onClick={handleGenerate}
              className="btn btn-md btn-primary h-[54px]"
            >
              <TrendingDown className="h-4 w-4" />
              {t('preview_po', 'PREVIEW PO')}
            </button>
          </div>

          {/* Quick Actions for Active PO */}
          {isGenerated && activeList.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-gray-200 dark:border-white/5 animate-in slide-in-from-top-2 duration-300">
              <button
                onClick={handleBulkAdmit}
                className="flex items-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-blue-500/20 active:scale-95 transition-all"
              >
                <CheckCircle2 className="h-4 w-4" />
                {t('admit_all_to_stock', 'ADMIT ALL TO STOCK')}
              </button>

              <button onClick={handleExportCSV} className="p-3.5 bg-gray-100 dark:bg-white/5 text-gray-600 rounded-2xl hover:text-primary transition-all border border-transparent hover:border-primary/30">
                <Download className="h-4 w-4" />
              </button>
              <button onClick={handlePrint} className="p-3.5 bg-gray-100 dark:bg-white/5 text-gray-600 rounded-2xl hover:text-primary transition-all border border-transparent hover:border-primary/30">
                <Printer className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Bottom-Anchored Smart Hub (STAYING VISIBLE) */}
          <div className={`transition-all duration-500 ${poMode === 'auto' ? 'hidden' : 'block'}`}>
            <div className="flex flex-col gap-4">
              {/* SEARCH RESULTS (Now Relative Flow - Will NOT hide header) */}
              {searchResults.length > 0 && (
                <div className="bg-white dark:bg-[#1f1f1f] rounded-[2rem] shadow-xl border border-gray-200 dark:border-white/10 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="p-3 bg-gray-50 dark:bg-white/[0.02] border-b border-gray-200 dark:border-white/5 flex items-center justify-between">
                    <span className="text-[9px] font-black text-gray-600 uppercase tracking-[0.2em] px-2">{t('smart_match_results', 'Smart Match Results')} ({searchResults.length})</span>
                    <button onClick={() => setSearchQuery('')} className="p-1 px-3 bg-rose-500/10 text-rose-500 text-[8px] font-black uppercase rounded-lg hover:bg-rose-500/20 transition-colors">
                      {t('close', 'CLOSE')}
                    </button>
                  </div>
                  <div className="max-h-[350px] overflow-y-auto custom-scrollbar p-2">
                    {searchResults.map(product => (
                      <button
                        key={product.id}
                        onClick={() => addToManualList(product)}
                        className={`w-full text-left p-2 hover:bg-emerald-50 dark:hover:bg-primary/5 rounded-xl group flex items-center justify-between transition-all hover:scale-[1.01] ${manualList.some(m => m.id === product.id) ? 'opacity-60 bg-emerald-50/50 dark:bg-primary/5' : ''}`}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <div className="w-9 h-9 bg-gray-100 dark:bg-white/5 rounded-xl flex items-center justify-center border border-gray-200 dark:border-white/5 shrink-0 overflow-hidden group-hover:border-primary/20">
                            {product.image ? (
                              <img src={product.image} className="w-full h-full object-cover" />
                            ) : (
                              <PackageOpen className="h-4 w-4 text-gray-600 group-hover:text-primary transition-colors" />
                            )}
                          </div>
                          <div className="flex flex-col gap-0.5 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[7px] font-black px-1.5 py-0.5 bg-primary/10 text-primary rounded uppercase tracking-widest border border-primary/10">
                                {product.category || 'GENERAL'}
                              </span>
                              <span className="text-[7px] font-black text-gray-600 uppercase tracking-tighter">
                                {product.sku || 'N/A'}
                              </span>
                              {manualList.some(m => m.id === product.id) && (
                                <span className="text-[7px] font-black px-1.5 py-0.5 bg-primary text-white rounded uppercase tracking-widest animate-in fade-in zoom-in duration-300">
                                  ADDED
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] font-black uppercase text-gray-900 dark:text-white group-hover:text-primary transition-colors leading-tight">
                              {product.name}
                            </p>
                            <div className="flex items-center gap-2">
                              <span className={`text-[7px] font-black px-1 py-0.5 rounded uppercase border ${product.stock <= (product.targetStock || 5) ? 'bg-rose-500 text-white border-rose-500' : 'bg-primary/10 text-primary border-primary/10'}`}>
                                STOCK: {product.stock}
                              </span>
                              <span className="text-[7px] font-bold text-gray-600 uppercase tracking-widest truncate">
                                {product.supplier || 'DIRECT'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 shrink-0 ${manualList.some(m => m.id === product.id) ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-white/5 group-hover:bg-primary group-hover:text-white group-hover:rotate-90'}`}>
                          {manualList.some(m => m.id === product.id) ? <CheckCircle2 className="h-4 w-4" /> : <Plus className="h-3.5 w-3.5" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* SEARCH INPUT */}
              <div className="flex items-center gap-4 bg-gray-100 dark:bg-black/75 p-4 rounded-[1.5rem] border border-gray-200 dark:border-white/5 focus-within:border-primary/50 transition-all shadow-inner group">
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center group-focus-within:rotate-90 transition-transform">
                  <Search className="h-5 w-5 text-primary" />
                </div>
                <input
                  type="text"
                  placeholder={t('type_to_search_add', 'Type to search & add...')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none text-sm font-black uppercase tracking-widest p-0 focus:ring-0 w-full placeholder:text-gray-600 text-gray-900 dark:text-white"
                />

                <button
                  onClick={() => setShowScanner(true)}
                  className="p-2.5 bg-primary/10 text-primary rounded-xl hover:bg-primary hover:text-white transition-all shadow-sm shrink-0"
                >
                  <Camera className="h-5 w-5" />
                </button>

                {searchQuery && (
                  <button
                    onClick={() => addAllToManual(searchResults)}
                    className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-[0.2em] shadow-lg shadow-emerald-500/20 hover:scale-105 active:scale-95 transition-all whitespace-nowrap"
                  >
                    {t('add_all_items', 'ADD ALL ITEMS')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>


      {(isGenerated || (poMode === 'manual')) && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
          {/* Stats Summary (Hidden during print) */}
          {activeList.length > 0 && (
            <div className="print-hide grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-primary p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group">
                <div className="absolute right-[-20px] top-[-20px] opacity-10 group-hover:scale-110 transition-transform duration-700">
                  <PackageOpen className="h-40 w-40" />
                </div>
                <div className="z-10">
                  <p className="text-[11px] font-black uppercase tracking-widest text-white/70 mb-2">{t('total_items_to_order', 'Total Items to Order')}</p>
                  <p className="text-4xl font-black">{totalItemsNeeded.toLocaleString()}</p>
                </div>
              </div>
              <div className="bg-rose-500 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group">
                <div className="absolute right-[-20px] top-[-20px] opacity-10 group-hover:scale-110 transition-transform duration-700">
                  <TrendingDown className="h-40 w-40" />
                </div>
                <div className="z-10">
                  <p className="text-[11px] font-black uppercase tracking-widest text-white/70 mb-2">{t('estimated_restock_cost', 'Estimated Restock Cost')}</p>
                  <p className="text-4xl font-black">{formatCurrency(estimatedCost, state.settings.currency)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Printable Area - The actual PO Document */}
          <div
            ref={printRef}
            className="bg-white dark:bg-surface rounded-[3rem] border border-gray-200 dark:border-white/5 overflow-hidden shadow-2xl print:shadow-none print:border-none print:rounded-none"
          >
            {/* Print Header (Only visible when printing) */}
            <div className="hidden print:block p-8 border-b border-black/20">
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="text-3xl font-black uppercase mb-1">{t('printable_po', 'PURCHASE ORDER')}</h1>
                  <p className="text-sm text-gray-600">{t('supplier_name', 'Supplier')}: <span className="font-bold text-gray-900">{selectedSupplier}</span></p>
                  <p className="text-sm text-gray-600">{t('category', 'Category')}: <span className="font-bold text-gray-900">{selectedCategory}</span></p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">{t('date', 'Date')}: {new Date().toLocaleDateString()}</p>
                  <p className="text-xs text-gray-600 mt-1">Generated by Zaynahs POS</p>
                </div>
              </div>
              <div className="mt-8 flex justify-between w-2/3 border-t border-black/10 pt-4">
                <div>
                  <p className="text-xs text-gray-600 uppercase">{t('total_items_to_order', 'Total Items Required')}</p>
                  <p className="text-lg font-black">{totalItemsNeeded.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 uppercase">{t('est_financial_need', 'Est. Financial Need')}</p>
                  <p className="text-lg font-black">{formatCurrency(estimatedCost, state.settings.currency)}</p>
                </div>
              </div>
            </div>

            {/* The List */}
            <div className="overflow-x-auto">
              {activeList.length === 0 ? (
                <div className="p-20 text-center text-gray-600">
                  <PackageOpen className="h-16 w-16 mx-auto opacity-20 mb-4 text-primary" />
                  <p className="text-lg font-black uppercase tracking-wider text-gray-600">
                    {poMode === 'manual' ? t('no_items_selected', 'NO ITEMS SELECTED YET') : t('inventory_healthy', 'INVENTORY IS HEALTHY')}
                  </p>
                  <p className="text-[10px] font-bold mt-2 uppercase tracking-[0.2em] text-gray-600">
                    {poMode === 'manual'
                      ? t('search_products_and_add', 'SEARCH PRODUCTS ABOVE AND CLICK THE PLUS ICON TO ADD THEM TO YOUR ORDER')
                      : t('all_items_above_reorder', 'ALL ITEMS ARE CURRENTLY ABOVE THEIR DEFINED REORDER LEVELS')}
                  </p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse print:text-[10px]">
                  <thead>
                    <tr className="bg-gray-50/50 dark:bg-white/[0.02] print:bg-transparent">
                      <th className="p-8 print:p-2 text-[11px] print:text-[10px] font-black uppercase text-gray-600 tracking-[0.2em] border-b border-gray-200 dark:border-white/5 print:border-black/20">{t('item_sku', 'Item / SKU')}</th>
                      <th className="p-8 print:p-2 text-[11px] print:text-[10px] font-black uppercase text-gray-600 tracking-[0.2em] text-center border-b border-gray-200 dark:border-white/5 print:border-black/20">{t('supplier_name', 'Supplier')}</th>
                      <th className="p-8 print:p-2 text-[11px] print:text-[10px] font-black uppercase text-gray-600 tracking-[0.2em] text-center border-b border-gray-200 dark:border-white/5 print:border-black/20">{t('current', 'Current')}</th>
                      <th className="p-8 print:p-2 text-[11px] print:text-[10px] font-black uppercase text-primary dark:text-emerald-400 tracking-[0.2em] text-center bg-emerald-50/50 dark:bg-primary/5 print:bg-transparent border-b border-gray-200 dark:border-white/5 print:border-black/20">{t('qty', 'Qty')}</th>
                      <th className="p-8 print:p-2 text-[11px] print:text-[10px] font-black uppercase text-gray-600 tracking-[0.2em] text-right border-b border-gray-200 dark:border-white/5 print:border-black/20">{t('cost', 'Cost')} ({getCurrencySymbol(state.settings.currency)})</th>
                      <th className="p-8 print:p-2 text-[11px] print:text-[10px] font-black uppercase text-emerald-400 tracking-[0.2em] text-right border-b border-gray-200 dark:border-white/5 print:border-black/20">{t('retail_price', 'Retail')} ({getCurrencySymbol(state.settings.currency)})</th>
                      <th className="p-8 print:p-2 text-[11px] print:text-[10px] font-black uppercase text-gray-600 tracking-[0.2em] text-right border-b border-gray-200 dark:border-white/5 print:border-black/20">{t('total', 'Total')} ({getCurrencySymbol(state.settings.currency)})</th>
                      {isAdmin && <th className="p-8 print:p-2 text-[11px] print:text-[10px] font-black uppercase text-gray-600 tracking-[0.2em] text-right border-b print:border-black/20 print:hidden">{t('ops', 'Ops')}</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-white/5 print:divide-black/10">
                    {paginatedList.map(item => (
                      <tr key={item.id} className="group hover:bg-gray-50/50 dark:hover:bg-white/[0.01] transition-all duration-300 print:break-inside-avoid">
                        <td className="p-8 print:p-2">
                          <p className="font-black text-gray-900 dark:text-white text-[13px] uppercase tracking-tight">{item.name}</p>
                          <p className="text-[10px] font-bold text-gray-600 tracking-widest mt-1">{item.sku || 'No SKU'}</p>
                        </td>
                        <td className="p-8 print:p-2 text-center">
                          <input
                            type="text"
                            disabled={isGenerated}
                            value={item.supplier || ''}
                            onChange={(e) => updateItem(item.id, 'supplier', e.target.value)}
                            placeholder="Supplier"
                            className={`w-full max-w-[120px] bg-gray-50 dark:bg-white/5 border-none text-center rounded-xl font-bold text-[10px] uppercase p-2 focus:ring-1 focus:ring-emerald-500 placeholder:opacity-30 ${isGenerated ? 'opacity-50 cursor-not-allowed' : ''}`}
                          />
                        </td>
                        <td className="p-8 print:p-2 text-center">
                          <span className={`px-3 py-1 rounded-lg text-xs font-black  ${item.stock <= 0 ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400' : 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300'}`}>
                            {item.stock}
                          </span>
                        </td>
                        <td className="p-8 print:p-2 text-center">
                          <input
                            type="number"
                            value={item.neededQty}
                            onChange={(e) => updateItem(item.id, 'neededQty', Number(e.target.value))}
                            className="w-20 bg-emerald-50 dark:bg-primary/10 border-none text-center rounded-xl font-black text-primary p-2 focus:ring-1 focus:ring-emerald-500"
                          />
                        </td>
                        <td className="p-8 print:p-2 text-right">
                          <input
                            type="number"
                            value={item.cost}
                            onChange={(e) => updateItem(item.id, 'cost', Number(e.target.value))}
                            className="w-24 bg-gray-50 dark:bg-white/5 border-none text-right rounded-xl font-black text-gray-700 dark:text-gray-300 p-2 focus:ring-1 focus:ring-emerald-500"
                          />
                        </td>
                        <td className="p-8 print:p-2 text-right">
                          <input
                            type="number"
                            value={item.price}
                            onChange={(e) => updateItem(item.id, 'price', Number(e.target.value))}
                            className="w-24 bg-emerald-50 dark:bg-primary/5 border-none text-right rounded-xl font-black text-primary dark:text-emerald-400 p-2 focus:ring-1 focus:ring-emerald-500"
                          />
                        </td>
                        <td className="p-8 print:p-2 text-right text-sm font-black text-gray-900 dark:text-white tracking-tight">
                          {formatCurrency(Number(item.neededQty || 0) * Number(item.cost || 0), state.settings.currency)}
                        </td>
                        {isAdmin && (
                          <td className="p-8 print:p-2 text-right print:hidden">
                            <button
                              onClick={() => poMode === 'manual' ? removeFromManualList(item.id) : handleRemoveFromPO(item.id, item.name)}
                              className="p-3 bg-rose-50 dark:bg-rose-500/10 text-rose-500 rounded-[1.2rem] transition-all lg:opacity-0 group-hover:opacity-100 hover:bg-rose-100 dark:hover:bg-rose-500/20 hover:scale-110 shadow-sm"
                              title={poMode === 'manual' ? 'Remove from Selection' : 'Clear Target Level'}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}

                    {/* Invoice Total Footer */}
                    <tr className="font-black text-sm bg-gray-50/30 dark:bg-white/[0.01]">
                      <td colSpan={6} className="text-right p-8 uppercase tracking-widest text-[11px] text-gray-600 border-t border-gray-200 dark:border-white/5">{t('order_estimated_total', 'Order Estimated Total:')}</td>
                      <td className="text-right p-8 text-xl tracking-tight text-primary dark:text-emerald-400 border-t border-gray-200 dark:border-white/5">{formatCurrency(estimatedCost, state.settings.currency)}</td>
                      <td className="print:hidden border-t border-gray-200 dark:border-white/5"></td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination Footer */}
            {totalPages > 1 && (
              <div className="print-hide p-6 bg-gray-50/30 dark:bg-white/[0.01] border-t border-gray-200 dark:border-white/5 flex items-center justify-between">
                <p className="text-[11px] font-black text-gray-600 uppercase tracking-[0.2em]">
                  {t('showing', 'Showing')} <span className="text-primary">{((currentPage - 1) * ITEMS_PER_PAGE) + 1}</span> - <span className="text-primary">{Math.min(currentPage * ITEMS_PER_PAGE, activeList.length)}</span> {t('of', 'of')} <span className="text-primary">{activeList.length}</span> {t('items', 'items')}
                </p>
                <div className="flex gap-3">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => prev - 1)}
                    className="p-3 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-[1.2rem] disabled:opacity-30 disabled:hover:scale-100 hover:scale-105 active:scale-95 transition-all shadow-sm"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => prev + 1)}
                    className="p-3 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-[1.2rem] disabled:opacity-30 disabled:hover:scale-100 hover:scale-105 active:scale-95 transition-all shadow-sm"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Global CSS Override for Printing */}
      <style>{`
        @media print {
          body, html {
            background: white !important;
            color: black !important;
          }
          .print-hide { display: none !important; }
          #root { height: auto !important; overflow: auto !important; }
          @page { margin: 1cm; }
        }
      `}</style>

      {showScanner && (
        <CameraScanner
          onScan={(code) => {
            const term = code.trim();
            const normalizedTerm = term.toUpperCase().replace(/O/g, '0');

            // 1. Exact match
            let found = state.products.find(
              (p: any) => p.barcode === term || p.sku === term
            );

            // 2. Normalized match (handles OCR confusion)
            if (!found) {
              found = state.products.find((p: any) => {
                const pBarcode = (p.barcode || '').toUpperCase().replace(/O/g, '0');
                const pSku = (p.sku || '').toUpperCase().replace(/O/g, '0');
                return pBarcode === normalizedTerm || pSku === normalizedTerm;
              });
            }

            if (found) {
              addToManualList(found);
              setShowScanner(false);
              sonner.success(`Added: ${found.name}`);
            } else {
              sonner.error(`Product not found: ${term}`);
            }
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
