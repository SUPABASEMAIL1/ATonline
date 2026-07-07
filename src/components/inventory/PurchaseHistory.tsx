import React, { useState, useMemo } from 'react';
import {
  Search, Calendar, Download, Plus, ArrowUpRight, ArrowDownRight,
  Trash2, Save, X, Package, Truck, Hash, Tag, Info, AlertCircle, ShoppingCart,
  User as UserIcon, RefreshCw, ChevronLeft, ChevronRight, CheckCircle2
} from 'lucide-react';
import { useApp } from '../../context/SupabaseAppContext';
import { PurchaseRecord, Product } from '../../types';
import { purchaseRecordsService, productsService } from '../../lib/services';
import { SearchableSelect } from '../common/SearchableSelect';
import { sonner } from '../../lib/sonner';
import { subDays, startOfDay, endOfDay, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { formatAppDate, getTimezone, getStartOfDayInTimezone, getEndOfDayInTimezone, getStartOfInputDayInTimezone, getEndOfInputDayInTimezone } from '../../lib/dateUtils';
import { BatchStockInSystem } from './BatchStockInSystem';
import { formatCurrency, formatNumberWithPrecision } from '../../lib/currencies';
import { useTranslation } from '../../hooks/useTranslation';

export function PurchaseHistory() {
  const { state, dispatch } = useApp();
  const { t } = useTranslation();

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search to prevent lag on every keystroke
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const [supplierFilter, setSupplierFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [userFilter, setUserFilter] = useState('All');
  const [dateRange, setDateRange] = useState('last30');
  const [startDateInput, setStartDateInput] = useState('');
  const [endDateInput, setEndDateInput] = useState('');
  const [view, setView] = useState<'list' | 'entry'>('list');
  const [formData, setFormData] = useState<any>({
    productId: '',
    productName: '',
    sku: '',
    quantity: 0,
    costPrice: 0,
    retailPrice: 0,
    supplier: '',
    date: new Date().toLocaleDateString('en-CA'),
    notes: ''
  });

  const currentPage = state.inventoryPurchasesPage;
  const setCurrentPage = (val: number | ((prev: number) => number)) => {
    const newVal = typeof val === 'function' ? val(currentPage) : val;
    dispatch({ type: 'SET_INVENTORY_PURCHASES_PAGE', payload: Math.max(1, newVal) });
  };
  const itemsPerPage = 10;

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-complete products
  const [suggestions, setSuggestions] = useState<any[]>([]);

  const handleProductSearch = (query: string) => {
    setFormData((prev: any) => ({ ...prev, productName: query }));
    if (query.length > 1) {
      const matches = state.products.filter(p =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.sku?.toLowerCase().includes(query.toLowerCase()) ||
        p.barcode?.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 5);
      setSuggestions(matches);
    } else {
      setSuggestions([]);
    }
  };

  const selectProduct = (p: Product) => {
    setFormData((prev: any) => ({
      ...prev,
      productId: p.id,
      productName: p.name,
      sku: p.sku || '',
      costPrice: p.cost || 0,
      retailPrice: p.price || 0,
      supplier: p.supplier || prev.supplier || ''
    }));
    setSearchTerm(''); // Clear internal search term for results
    setSuggestions([]);
    sonner.success(`${p.name} selected`, 1000);
  };

  const handleSaveRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    const productName = String(formData.productName || '').trim();
    const supplierName = String(formData.supplier || '').trim();
    const quantity = Number(formData.quantity);
    const costPrice = Number(formData.costPrice);
    const retailPrice = Number(formData.retailPrice);
    const selectedProduct = state.products.find((p) => p.id === formData.productId);
    const matchedProduct = state.products.find(
      (p) =>
        p.name.toLowerCase() === productName.toLowerCase() &&
        (!formData.sku || p.sku === formData.sku)
    );
    const resolvedProductId = formData.productId || selectedProduct?.id || matchedProduct?.id;

    if (!productName || !resolvedProductId) {
      sonner.error('Select a valid product before saving');
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      sonner.error('Quantity must be greater than 0');
      return;
    }

    if (!Number.isFinite(costPrice) || costPrice <= 0) {
      sonner.error('Enter a valid cost price');
      return;
    }

    if (!Number.isFinite(retailPrice) || retailPrice <= 0) {
      sonner.error('Enter a valid retail price');
      return;
    }

    setIsSubmitting(true);
    sonner.loading('Saving record...');

    try {
      const recordData = {
        ...formData,
        productId: resolvedProductId,
        productName,
        supplier: supplierName,
        quantity,
        costPrice,
        retailPrice,
        totalAmount: quantity * costPrice,
        addedBy: state.currentUser?.name || state.currentUser?.username || 'System',
        date: new Date(formData.date!).toISOString()
      } as PurchaseRecord;

      const newRecord = await purchaseRecordsService.create(recordData);

      // purchaseRecordsService.create now handles stock update, batch creation,
      // and stock_history logging internally. We only need to dispatch state updates.
      const product = state.products.find(p => p.id === recordData.productId);
      if (product) {
        // Re-read from localDb to get the updated stock and batches
        const freshProduct = await (await import('../../lib/localDb')).localDb.products.get(product.id);
        if (freshProduct) {
          dispatch({ type: 'UPDATE_PRODUCT', payload: freshProduct });
        }
      }

      dispatch({ type: 'ADD_PURCHASE_RECORD', payload: newRecord });
      sonner.success('Stock updated successfully');

      setView('list');
    } catch (error) {
      console.error('Error saving record:', error);
      sonner.error('Failed to save record');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRecord = async (record: PurchaseRecord) => {
    const result = await sonner.deleteConfirm('this record');
    if (result.isConfirmed) {
      try {
        await purchaseRecordsService.delete(record.id);

        // Revert stock
        const product = state.products.find(p => p.id === record.productId);
        if (product) {
          const updatedProduct = {
            ...product,
            stock: product.stock - record.quantity
          };
          await productsService.update(product.id, updatedProduct);
          dispatch({ type: 'UPDATE_PRODUCT', payload: updatedProduct });
        }

        dispatch({ type: 'DELETE_PURCHASE_RECORD', payload: record.id });
        sonner.success('Record deleted and stock reverted');
      } catch (error) {
        sonner.error('Failed to delete record');
      }
    }
  };

  const dateBoundaries = useMemo(() => {
    const timezone = getTimezone(state.settings.country);
    const now = new Date();
    let start: Date;
    let end: Date;

    try {
      if (dateRange === 'custom' && startDateInput && endDateInput) {
        start = new Date(getStartOfInputDayInTimezone(startDateInput, timezone).getTime());
        end = new Date(getEndOfInputDayInTimezone(endDateInput, timezone).getTime());
      } else if (dateRange === 'today') {
        start = getStartOfDayInTimezone(now, timezone);
        end = getEndOfDayInTimezone(now, timezone);
      } else if (dateRange === 'yesterday') {
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        start = getStartOfDayInTimezone(yesterday, timezone);
        end = getEndOfDayInTimezone(yesterday, timezone);
      } else if (dateRange === 'last7') {
        const last7 = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
        start = getStartOfDayInTimezone(last7, timezone);
        end = getEndOfDayInTimezone(now, timezone);
      } else if (dateRange === 'thisMonth') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        start = getStartOfDayInTimezone(startOfMonth, timezone);
        end = getEndOfDayInTimezone(now, timezone);
      } else if (dateRange === 'lastMonth') {
        const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        start = getStartOfDayInTimezone(lm, timezone);
        end = getEndOfDayInTimezone(lmEnd, timezone);
      } else if (dateRange === 'last30') {
        const last30 = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
        start = getStartOfDayInTimezone(last30, timezone);
        end = getEndOfDayInTimezone(now, timezone);
      } else if (dateRange === 'all') {
        start = new Date(Date.UTC(2000, 0, 1));
        end = getEndOfDayInTimezone(now, timezone);
      } else {
         const last30 = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
         start = getStartOfDayInTimezone(last30, timezone);
         end = getEndOfDayInTimezone(now, timezone);
      }
    } catch (e) {
      // Fallback safely if inputs are completely malformed
      const last30 = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
      start = getStartOfDayInTimezone(last30, timezone);
      end = getEndOfDayInTimezone(now, timezone);
    }

    return { start, end };
  }, [dateRange, startDateInput, endDateInput, state.settings.country]);

  const filteredRecords = useMemo(() => {
    const records = state.purchaseRecords || [];
    return records.filter(r => {
      const matchesSearch = (r.productName?.toLowerCase() || '').includes(debouncedSearch.toLowerCase()) ||
        (r.sku?.toLowerCase() || '').includes(debouncedSearch.toLowerCase()) ||
        (r.supplier?.toLowerCase() || '').includes(debouncedSearch.toLowerCase());
      const matchesSupplier = supplierFilter === 'All' || r.supplier === supplierFilter;

      const product = state.products.find(p => p.id === r.productId);
      const matchesCategory = categoryFilter === 'All' || (product && product.category === categoryFilter);

      const rDate = new Date(r.date || Date.now());
      const matchesDate = !isNaN(rDate.getTime()) && rDate >= dateBoundaries.start && rDate <= dateBoundaries.end;
      const matchesUser = userFilter === 'All' || r.addedBy === userFilter;

      return matchesSearch && matchesSupplier && matchesCategory && matchesDate && matchesUser;
    })
      .sort((a, b) => new Date(b.date || Date.now()).getTime() - new Date(a.date || Date.now()).getTime())
      .slice(0, 300); // Cap history at 300 entries as requested
  }, [state.purchaseRecords, state.products, debouncedSearch, supplierFilter, categoryFilter, userFilter, dateBoundaries]);

  const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);
  const paginatedRecords = useMemo(() => {
    return filteredRecords.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage
    );
  }, [filteredRecords, currentPage, itemsPerPage]);

  const suppliers = ['All', ...Array.from(new Set([
    ...state.suppliers.map(s => s.name).filter(Boolean),
    ...(state.purchaseRecords || []).map(r => r.supplier).filter(Boolean)
  ]))];
  const categoriesList = ['All', ...Array.from(new Set(state.products.map(p => p.category).filter(Boolean)))];
  const usersList = ['All', ...Array.from(new Set([
    ...state.users.map(u => u.name).filter(Boolean),
    ...(state.purchaseRecords || []).map(r => r.addedBy).filter(Boolean)
  ]))];

  // Internal memoized components to prevent re-renders when unrelated state changes
  const SummaryCards = useMemo(() => {
    // Only count ACTUAL stock-in for procurement totals (exclude returns/sales)
    const procurementOnly = filteredRecords.filter(r =>
      r.quantity > 0 &&
      !['Sale', 'Return'].includes(r.type) &&
      !(r.supplier?.toUpperCase() || '').includes('RETURN') &&
      !(r.supplier?.toUpperCase() || '').includes('SALE')
    );

    const totalPurchaseValue = procurementOnly.reduce((sum, r) => sum + ((r.quantity || 0) * (r.costPrice || 0)), 0);
    const totalItemsCount = procurementOnly.reduce((sum, r) => sum + r.quantity, 0);

    // Find the real main supplier (excluding system labels)
    const supplierCounts = procurementOnly.reduce((acc: any, r) => {
      if (!r.supplier) return acc;
      acc[r.supplier] = (acc[r.supplier] || 0) + 1;
      return acc;
    }, {});

    const sortedSuppliers = Object.entries(supplierCounts).sort((a: any, b: any) => b[1] - a[1]);
    const mainSupplierName = supplierFilter !== 'All'
      ? supplierFilter
      : (sortedSuppliers[0]?.[0] || 'Direct Entry');

    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        <div className="stat-card bg-gradient-to-br from-emerald-500 to-teal-600 group">
          <div className="stat-card-inner">
            <p className="stat-card-label">{t("total_procurement", "Total Procurement")}</p>
            <h3 className="stat-card-value">{formatCurrency(totalPurchaseValue, state.settings.currency)}</h3>
            <p className="text-[7px] font-black text-white/40 uppercase tracking-[0.2em] mt-1">{t("active_period", "Active Period")}</p>
          </div>
          <ShoppingCart className="stat-card-icon" />
        </div>

        <div className="stat-card bg-gradient-to-br from-blue-600 to-indigo-700 group">
          <div className="stat-card-inner">
            <p className="stat-card-label">{t("total_stock_in", "Total Stock In")}</p>
            <h3 className="stat-card-value">{totalItemsCount.toLocaleString()}</h3>
            <p className="text-[7px] font-black text-white/40 uppercase tracking-[0.2em] mt-1">{filteredRecords.length} {t("entries", "Entries")}</p>
          </div>
          <Truck className="stat-card-icon" />
        </div>

        <div className="stat-card bg-gradient-to-br from-orange-500 to-amber-600 group col-span-2 md:col-span-1">
          <div className="stat-card-inner">
            <p className="stat-card-label">{t("main_supplier", "Main Supplier")}</p>
            <h3 className="stat-card-value">{mainSupplierName}</h3>
            <p className="text-[7px] font-black text-white/40 uppercase tracking-[0.2em] mt-1">{Object.keys(supplierCounts).length} {t("partners", "Partners")}</p>
          </div>
          <UserIcon className="stat-card-icon" />
        </div>
      </div>
    );
  }, [filteredRecords, supplierFilter, state.settings.currency]);
  const selectedProductForForm = useMemo(() => {
    if (formData.productId) {
      const byId = state.products.find((p) => p.id === formData.productId);
      if (byId) return byId;
    }

    const name = String(formData.productName || '').trim().toLowerCase();
    if (!name) return undefined;

    return state.products.find((p) => p.name.toLowerCase() === name);
  }, [formData.productId, formData.productName, state.products]);

  const exportToCSV = () => {
    const currency = state.settings.currency;
    const headerSuffix = ` (${currency})`;
    const headers = ['Date', 'Product', 'SKU', 'Supplier', 'Quantity', `Cost Price${headerSuffix}`, `Retail Price${headerSuffix}`, `Total Cost${headerSuffix}`, 'Notes'];
    const data = filteredRecords.map(r => [
      new Date(r.date || Date.now()).toLocaleDateString(),
      r.productName,
      r.sku,
      r.supplier,
      r.quantity,
      formatNumberWithPrecision(r.costPrice || 0),
      formatNumberWithPrecision(r.retailPrice || 0),
      formatNumberWithPrecision((r.quantity || 0) * (r.costPrice || 0)),
      r.notes
    ]);

    const csvContent = [headers, ...data].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `purchase_history_${new Date().toLocaleDateString('en-CA')}.csv`;
    link.click();
  };

  if (view === 'entry') {
    return <BatchStockInSystem onClose={() => setView('list')} />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Dynamic Summary Cards - Memoized */}
      {SummaryCards}

      {/* Modern Control Bar */}
      <div className="bg-white/50 dark:bg-black/20 p-4 rounded-[1.75rem] border border-gray-200/50 dark:border-white/5 shadow-xl">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[300px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 h-4 w-4" />
            <input
              type="text"
              placeholder="Search by Product Name, SKU, or Supplier..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-full bg-white dark:bg-black/30 border-none pl-11 pr-4 py-3 rounded-2xl text-[13px] font-bold focus:ring-2 focus:ring-emerald-500 transition-all placeholder:text-gray-600 shadow-inner"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <div className="w-full sm:w-48 shrink-0">
              <SearchableSelect
                label={t("supplier", "SUPPLIER")}
                options={suppliers.map(s => ({ id: s, label: s === 'All' ? t("all_suppliers_caps", "ALL SUPPLIERS") : s }))}
                value={supplierFilter}
                onChange={(val) => { setSupplierFilter(val); setCurrentPage(1); }}
              />
            </div>

            <div className="w-full sm:w-48 shrink-0">
              <SearchableSelect
                label={t("category", "CATEGORY")}
                options={categoriesList.map(c => ({ id: c, label: c === 'All' ? t("all_categories_caps", "ALL CATEGORIES") : c }))}
                value={categoryFilter}
                onChange={(val) => { setCategoryFilter(val); setCurrentPage(1); }}
              />
            </div>

            <div className="w-full sm:w-48 shrink-0">
              <SearchableSelect
                label={t("users", "USER")}
                options={usersList.map(u => ({ id: u, label: u === 'All' ? t("all_users_caps", "ALL USERS") : u.toUpperCase() }))}
                value={userFilter}
                onChange={(val) => { setUserFilter(val); setCurrentPage(1); }}
              />
            </div>

            <div className="w-full sm:w-48 shrink-0">
              <SearchableSelect
                label={t("range", "RANGE")}
                options={[
                  { id: 'today', label: t("today_caps", "TODAY") },
                  { id: 'yesterday', label: t("yesterday_caps", "YESTERDAY") },
                  { id: 'last7', label: t("last7_caps", "LAST 7 DAYS") },
                  { id: 'last30', label: t("last_30_days", "LAST 30 DAYS") },
                  { id: 'thisMonth', label: t("this_month_caps", "THIS MONTH") },
                  { id: 'lastMonth', label: t("last_month_caps", "PREVIOUS MONTH") },
                  { id: 'custom', label: t("custom_range_caps", "CUSTOM RANGE") },
                  { id: 'all', label: t("all_time_caps", "ALL TIME") }
                ]}
                value={dateRange}
                onChange={(val) => { setDateRange(val); setCurrentPage(1); }}
              />
            </div>

            {dateRange === 'custom' && (
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center w-full sm:w-auto p-2 bg-white/50 dark:bg-black/20 rounded-xl animate-in slide-in-from-top-2 sm:slide-in-from-left-4 duration-300">
                <input type="date" value={startDateInput} onChange={(e) => setStartDateInput(e.target.value)} className="w-full sm:flex-1 px-3 py-2 text-[10px] font-black bg-white dark:bg-zinc-800 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white uppercase shadow-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                <span className="hidden sm:block text-gray-600 font-black text-[10px] uppercase tracking-tighter">{t("to", "TO")}</span>
                <input type="date" value={endDateInput} onChange={(e) => setEndDateInput(e.target.value)} className="w-full sm:flex-1 px-3 py-2 text-[10px] font-black bg-white dark:bg-zinc-800 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white uppercase shadow-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>
            )}

            <div className="flex items-center gap-2 h-full">
              <button
                onClick={() => setView('entry')}
                className="flex items-center gap-3 bg-primary hover:bg-primary text-white px-8 py-4 rounded-[1.5rem] font-black text-xs shadow-xl shadow-emerald-500/20 active:scale-95 transition-all"
              >
                <Plus className="h-4 w-4" /> <span>{t("new_stock_in", "NEW STOCK IN")}</span>
              </button>

              <button
                onClick={exportToCSV}
                className="p-4 bg-white dark:bg-black/30 text-gray-700 dark:text-gray-300 rounded-[1.5rem] border border-gray-200 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/10 transition-all active:scale-95"
              >
                <Download className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* Top Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-surface rounded-[2rem] border border-gray-200 dark:border-white/5 shadow-sm">
          <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest">
            Page <span className="text-primary">{currentPage}</span> of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-2 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/5 text-gray-600 dark:text-gray-400 disabled:opacity-30 hover:bg-primary hover:text-white transition-all shadow-sm"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-1">
              {[...Array(Math.min(5, totalPages))].map((_, i) => {
                let pageNum;
                if (totalPages <= 5) pageNum = i + 1;
                else if (currentPage <= 3) pageNum = i + 1;
                else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                else pageNum = currentPage - 2 + i;

                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${currentPage === pageNum
                      ? 'bg-primary text-white shadow-lg'
                      : 'text-gray-600 hover:bg-gray-100 dark:hover:bg-white/5'
                      }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="p-2 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/5 text-gray-600 dark:text-gray-400 disabled:opacity-30 hover:bg-primary hover:text-white transition-all shadow-sm"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Enhanced Records Table - Logic moved to inline for simplicity but with memoized list rendering inside if needed */}
      <div className="bg-white dark:bg-surface rounded-[2.5rem] border border-gray-200 dark:border-white/5 overflow-hidden shadow-2xl">
        {/* Desktop Table View */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 dark:bg-white/[0.02]">
                <th className="p-6 text-[10px] font-black text-gray-600 uppercase tracking-widest">{t("date_identity", "Date & Identity")}</th>
                <th className="p-6 text-[10px] font-black text-gray-600 uppercase tracking-widest text-center">{t("procurement_details", "Procurement Details")}</th>
                <th className="p-6 text-[10px] font-black text-gray-600 uppercase tracking-widest text-center">{t("financial_impact", "Financial Impact")}</th>
                <th className="p-6 text-[10px] font-black text-gray-600 uppercase tracking-widest text-right">{t("admin_control", "Admin Control")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-white/5">
              {paginatedRecords.length > 0 ? paginatedRecords.map((record) => (
                <tr
                  key={record.id}
                  onClick={() => {
                    const isRetail = record.type === 'Sale' || record.type === 'Return' || record.notes?.includes('Invoice #');
                    if (isRetail) {
                      const ref = record.notes?.match(/#([A-Z0-9-]+)/)?.[1] || record.id.slice(-6).toUpperCase();
                      dispatch({ type: 'SET_PENDING_RETURN_TAB', payload: 'purchases' });
                      dispatch({ type: 'SET_PENDING_SEARCH', payload: ref });
                      const event = new CustomEvent('navigate', { detail: 'transactions' });
                      window.dispatchEvent(event);
                    } else if (record.productId) {
                      const p = state.products.find(prod => prod.id === record.productId);
                      if (p) {
                        dispatch({ type: 'SET_PENDING_RETURN_TAB', payload: 'purchases' });
                        window.dispatchEvent(new CustomEvent('open-product-hub', { detail: p.id }));
                      }
                    }
                  }}
                  className="group hover:bg-gray-50 dark:hover:bg-white/[0.01] transition-colors cursor-pointer"
                >
                  <td className="p-6">
                    <div className="flex items-center gap-4">
                      <div className={`h-12 w-12 rounded-2xl flex flex-col items-center justify-center border ${record.type === 'Return' ? 'bg-amber-500/10 border-amber-500/20' :
                        record.type?.includes('Reversal') || record.type?.includes('Deletion') ? 'bg-rose-500/10 border-rose-500/20' :
                          'bg-gray-100 dark:bg-white/5 border-white/5'
                        }`}>
                        <p className={`text-[10px] font-black opacity-80 ${record.type === 'Return' ? 'text-amber-500' :
                          record.type?.includes('Reversal') || record.type?.includes('Deletion') ? 'text-rose-500' :
                            'text-primary'
                          }`}>{new Date(record.date || Date.now()).toLocaleDateString('en-US', { month: 'short' })}</p>
                        <p className="text-sm font-black text-gray-900 dark:text-white leading-none">{new Date(record.date || Date.now()).getDate()}</p>
                      </div>
                      <div className="min-w-0">
                        {(() => {
                          const product = state.products.find(p => p.id === record.productId);
                          const displayName = record.productName && record.productName !== 'Unknown Product'
                            ? record.productName
                            : (product?.name || 'Unknown Product');
                          const displaySku = record.sku && record.sku !== 'N/A'
                            ? record.sku
                            : (product?.sku || 'N/A');

                          return (
                            <>
                              <div className="flex items-center gap-2 mb-0.5">
                                <p className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-tight truncate max-w-[200px]">
                                  {displayName}
                                </p>
                                {record.type === 'Return' && (
                                  <span className="text-[7px] font-black bg-amber-500 text-white px-1.5 py-0.5 rounded uppercase tracking-widest animate-pulse">{t("return", "RETURN")}</span>
                                )}
                                {(record.type?.includes('Reversal') || record.type?.includes('Deletion')) && (
                                  <span className="text-[7px] font-black bg-rose-500 text-white px-1.5 py-0.5 rounded uppercase tracking-widest">{t("deleted", "DELETED")}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] font-bold text-gray-600 flex items-center gap-1 uppercase">
                                  <Hash className="h-2.5 w-2.5" /> {displaySku}
                                </span>
                                <span className="w-1 h-1 bg-gray-300 dark:bg-white/10 rounded-full" />
                                <span className={`text-[9px] font-black uppercase tracking-tighter ${record.supplier === 'SALE RETURN' ? 'text-amber-500' :
                                  record.supplier === 'SYSTEM REVERSAL' ? 'text-rose-500' :
                                    'text-primary dark:text-primary'
                                  }`}>
                                  {record.supplier || t("direct_entry", "DIRECT ENTRY")}
                                </span>
                                {record.addedBy && (
                                  <>
                                    <span className="w-1 h-1 bg-gray-300 dark:bg-white/10 rounded-full" />
                                    <span className="text-[9px] font-medium text-gray-500 uppercase tracking-tighter">
                                      {t("by_cashier_upper", "BY")} {record.addedBy}
                                    </span>
                                  </>
                                )}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </td>
                  <td className="p-6 text-center">
                    <div className="inline-flex flex-col items-center">
                      <span className={`text-xs font-black mb-1 ${record.type === 'Return' ? 'text-amber-500' :
                        record.type?.includes('Reversal') || record.type?.includes('Deletion') ? 'text-rose-500' :
                          'text-gray-900 dark:text-white'
                        }`}>
                        {record.quantity > 0 ? '+' : ''}{record.quantity} <span className="text-[10px] text-gray-600">{t("pcs", "PCS")}</span>
                      </span>
                      <div className="flex items-center gap-2 p-1 px-2 rounded-lg bg-gray-100/50 dark:bg-white/5">
                        <Tag className={`h-2.5 w-2.5 ${record.type === 'Return' ? 'text-amber-500' :
                          record.type?.includes('Reversal') || record.type?.includes('Deletion') ? 'text-rose-500' :
                            'text-orange-500'
                          }`} />
                        <span className="text-[9px] font-black text-gray-600 uppercase tracking-tighter">{t("cost", "Cost")}: {formatCurrency(record.costPrice || 0, state.settings.currency)}</span>
                      </div>
                    </div>
                  </td>
                  <td className="p-6 text-center">
                    <div className="inline-flex flex-col items-center gap-1">
                      <p className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-tighter italic">{t("total_impact", "Total Impact")}</p>
                      <p className={`text-sm font-black ${record.type === 'Return' ? 'text-amber-500' :
                        record.type?.includes('Reversal') || record.type?.includes('Deletion') ? 'text-rose-500' :
                          'text-primary dark:text-emerald-400'
                        }`}>{formatCurrency((record.quantity || 0) * (record.costPrice || 0), state.settings.currency)}</p>
                      <p className="text-[9px] font-bold text-gray-600 uppercase opacity-50">{t("srp", "SRP: ")}{formatCurrency(record.retailPrice || 0, state.settings.currency)}</p>
                    </div>
                  </td>
                  <td className="p-6 text-right">
                    <div className="flex justify-end lg:opacity-0 group-hover:opacity-100 transition-opacity">
                      {record.type !== 'Return' && !record.type?.includes('Reversal') && (
                        <button
                          onClick={() => handleDeleteRecord(record)}
                          className="p-2.5 bg-red-50 dark:bg-red-500/10 text-red-600 rounded-xl hover:scale-110 transition-transform"
                          title="Delete Record"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4} className="p-20 text-center">
                    <div className="flex flex-col items-center opacity-30">
                      <Package className="h-16 w-16 text-gray-600 mb-4" />
                      <p className="text-sm font-black text-gray-600 uppercase tracking-[0.2em]">{t("no_procurement_records_found", "No Procurement Records Found")}</p>
                      <p className="text-xs font-bold text-gray-600 uppercase mt-2">{t("adjust_filters", "Adjust your filters or perform system actions")}</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View for History */}
        <div className="lg:hidden p-4 space-y-3">
          {paginatedRecords.length > 0 ? paginatedRecords.map((record) => (
            <div
              key={record.id}
              className="p-4 bg-gray-50 dark:bg-black/20 rounded-[2rem] border border-gray-200 dark:border-white/5 active:scale-95 transition-all"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-xl flex flex-col items-center justify-center border ${record.type === 'Return' ? 'bg-amber-500/10 border-amber-500/20' : 'bg-white dark:bg-white/5 border-white/5'
                    }`}>
                    <p className="text-[8px] font-black text-gray-600 uppercase">{new Date(record.date || Date.now()).toLocaleDateString('en-US', { month: 'short' })}</p>
                    <p className="text-xs font-black text-gray-900 dark:text-white leading-none">{new Date(record.date || Date.now()).getDate()}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-black text-gray-900 dark:text-white uppercase truncate max-w-[150px]">{record.productName}</p>
                    <p className="text-[9px] font-bold text-gray-600 uppercase">@{record.sku}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-black ${record.quantity > 0 ? 'text-primary' : 'text-amber-500'}`}>{record.quantity > 0 ? '+' : ''}{record.quantity} PCS</p>
                  <p className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">{record.supplier || 'Direct'} {record.addedBy ? `| By ${record.addedBy}` : ''}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 py-3 border-t border-gray-200 dark:border-white/5">
                <div>
                  <p className="text-[8px] font-black text-gray-600 uppercase mb-0.5">Financial Impact</p>
                  <p className="text-xs font-black text-primary dark:text-emerald-400">{formatCurrency((record.quantity || 0) * (record.costPrice || 0), state.settings.currency)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[8px] font-black text-gray-600 uppercase mb-0.5">Unit Cost</p>
                  <p className="text-xs font-black text-gray-900 dark:text-white">{formatCurrency(record.costPrice || 0, state.settings.currency)}</p>
                </div>
              </div>
            </div>
          )) : (
            <div className="py-10 text-center opacity-30">
              <Package className="h-10 w-10 mx-auto mb-2" />
              <p className="text-[10px] font-black uppercase tracking-widest">No Records</p>
            </div>
          )}
        </div>

        {/* Modern Pagination */}
        {totalPages > 1 && (
          <div className="p-6 bg-gray-50/50 dark:bg-white/[0.02] border-t border-gray-200 dark:border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest italic">Page {currentPage} of {totalPages}</p>
            </div>
            <div className="flex gap-3">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => prev - 1)}
                className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white rounded-2xl text-[10px] font-black uppercase tracking-widest disabled:opacity-30 hover:scale-105 transition-all shadow-sm"
              >
                Previous
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => prev + 1)}
                className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white rounded-2xl text-[10px] font-black uppercase tracking-widest disabled:opacity-30 hover:scale-105 transition-all shadow-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>


      {/* Single Edit Modal has been converted to full page view above */}
    </div>
  );
}
