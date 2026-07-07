import React, { useState, useMemo } from 'react';
import { getItemCOGS, getItemRevenue } from '../reports/ReportsManager';
import {
  Package, AlertTriangle, XCircle, CheckCircle2, TrendingUp, TrendingDown,
  Search, Download, ArrowUpDown, Tag, DollarSign, BarChart3,
  ChevronRight, ChevronDown, Calendar, Database, Clock, Wrench
} from 'lucide-react';
import { useApp } from '../../context/SupabaseAppContext';
import { formatCurrency, formatNumberWithPrecision } from '../../lib/currencies';
import { formatAppDate } from '../../lib/dateUtils';
import { useTranslation } from '../../hooks/useTranslation';
import { auditStockIntegrity } from '../../lib/services';
import { localDb } from '../../lib/localDb';
import { sonner } from '../../lib/sonner';

type SortField = 'name' | 'stock' | 'stockValue' | 'profitMargin' | 'status' | 'soldQty' | 'revenue' | 'cogs' | 'grossProfit';
type SortDir = 'asc' | 'desc';

interface InventoryReportManagerProps {
  startDate: Date;
  endDate: Date;
  globalSupplier?: string;
  globalCategory?: string;
  globalStore?: string;
  sales?: any[]; // Allow passing filtered sales from parent
}

export default function InventoryReportManager({
  startDate,
  endDate,
  globalSupplier = 'All',
  globalCategory = 'All',
  globalStore = 'All',
  sales // Destructure sales prop
}: InventoryReportManagerProps) {
  const { state } = useApp();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in' | 'low' | 'out'>('all');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [supplierFilter, setSupplierFilter] = useState('All');
  const [sortField, setSortField] = useState<SortField>('status');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [displayLimit, setDisplayLimit] = useState(25);
  const [integrityResults, setIntegrityResults] = useState<Array<{productId: string; name: string; type: 'batch_drift' | 'history_drift'; productStock: number; expectedStock: number; diff: number}>>([]);
  const [showIntegrity, setShowIntegrity] = useState(false);
  const [isCheckingIntegrity, setIsCheckingIntegrity] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);

  const runIntegrityCheck = async () => {
    setIsCheckingIntegrity(true);
    setShowIntegrity(true);
    const results: Array<{productId: string; name: string; type: 'batch_drift' | 'history_drift'; productStock: number; expectedStock: number; diff: number}> = [];

    try {
      // 1. Server-side: audit products.stock vs product_batches.qty_remaining
      const serverIssues = await auditStockIntegrity();
      for (const issue of serverIssues) {
        results.push({
          productId: issue.product_id,
          name: issue.name,
          type: 'batch_drift',
          productStock: issue.stock,
          expectedStock: issue.batch_sum,
          diff: issue.diff,
        });
      }

      // 2. Client-side: audit products.stock vs SUM(stock_history.change_qty)
      const allProducts = state.products.filter(p => p.trackInventory !== false && p.active !== false);
      const allStockHistory = await localDb.stockHistory.toArray();

      for (const product of allProducts) {
        const historySum = allStockHistory
          .filter(h => h.productId === product.id)
          .reduce((sum, h) => sum + (h.changeQty || 0), 0);
        const productStock = product.stock || 0;
        if (productStock !== historySum) {
          results.push({
            productId: product.id,
            name: product.name,
            type: 'history_drift',
            productStock: productStock,
            expectedStock: historySum,
            diff: productStock - historySum,
          });
        }
      }
    } catch (e) {
      console.error('[IntegrityCheck] Error:', e);
    }

    setIntegrityResults(results);
    setIsCheckingIntegrity(false);
  };

  const repairIntegrity = async () => {
    setIsRepairing(true);
    try {
      const fixed: string[] = [];
      for (const issue of integrityResults) {
        const product = state.products.find(p => p.id === issue.productId);
        if (!product) continue;

        const correctStock = issue.expectedStock;
        await localDb.products.update(issue.productId, { stock: correctStock });
        dispatch({ type: 'UPDATE_PRODUCT', payload: { ...product, stock: correctStock } });
        fixed.push(issue.name);
      }
      setIntegrityResults([]);
      sonner.success(`Repaired ${fixed.length} product(s). Stock values corrected to match batch/history sums.`);
    } catch (e) {
      console.error('[RepairIntegrity] Error:', e);
      sonner.error('Repair failed — see console.');
    }
    setIsRepairing(false);
  };

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) newExpanded.delete(id);
    else newExpanded.add(id);
    setExpandedRows(newExpanded);
  };

  // Sync internal filters with global ones when they change
  React.useEffect(() => {
    if (globalCategory) setCategoryFilter(globalCategory);
    if (globalSupplier) setSupplierFilter(globalSupplier);
  }, [globalCategory, globalSupplier]);

  const categories = useMemo(() =>
    ['All', ...Array.from(new Set(state.products.map(p => p.category).filter(Boolean)))],
    [state.products]
  );

  const suppliers = useMemo(() => {
    const registeredSuppliers = state.suppliers.map(s => s.name).filter(Boolean);
    const productSuppliers = state.products.map(p => p.supplier).filter(Boolean);
    return ['All', ...Array.from(new Set([...registeredSuppliers, ...productSuppliers])).sort()];
  }, [state.suppliers, state.products]);

  const inventoryData = useMemo(() => {
    let productsToProcess = state.products.filter(p => p.active !== false);

    // Apply primary filters (Category/Supplier)
    const effectiveCategory = categoryFilter || globalCategory || 'All';
    const effectiveSupplier = supplierFilter || globalSupplier || 'All';

    if (effectiveCategory.toLowerCase() !== 'all') {
      productsToProcess = productsToProcess.filter(p => p.category === effectiveCategory);
    }

    if (effectiveSupplier.toLowerCase() !== 'all') {
      productsToProcess = productsToProcess.filter(p =>
        (p.supplier || '').toLowerCase().trim() === effectiveSupplier.toLowerCase().trim()
      );
    }

    // Apply Search filter
    if (search) {
      const q = search.toLowerCase();
      productsToProcess = productsToProcess.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.supplier && p.supplier.toLowerCase().includes(q))
      );
    }

    const stats = productsToProcess.map(product => {
      const isInfinite = product.trackInventory === false || product.stock >= 990000;

      const batchQtySum = (product.batches || []).reduce((sum, b) => sum + (b.qtyRemaining || 0), 0);
      const isBatchSyncOk = batchQtySum === product.stock;

      const batchValue = (product.batches && product.batches.length > 0 && isBatchSyncOk)
        ? product.batches.reduce((sum, b) => sum + ((b.qtyRemaining || 0) * (b.costPrice || 0)), 0)
        : 0;

      // Fallback: If individual batch costs aren't available, use product-level cost
      // Only calculate value if NOT infinite
      const stockValue = isInfinite ? 0 : (batchValue > 0 ? batchValue : (product.stock * (product.cost || 0)));

      const sellingPrice = product.isWeightBased ? (product.pricePerUnit || 0) : product.price;
      const potentialRevenue = isInfinite ? 0 : (product.stock * sellingPrice);
      const profitMargin = (product.cost && product.cost > 0 && sellingPrice > 0)
        ? ((sellingPrice - product.cost) / sellingPrice * 100)
        : 0;
      const stockStatus: 'Out of Stock' | 'Low Stock' | 'In Stock' | 'Infinity Mode' =
        isInfinite ? 'Infinity Mode' : (product.stock <= 0 ? 'Out of Stock' :
          product.stock <= (product.minStock || 5) ? 'Low Stock' : 'In Stock');

      // Robust Sale Data Integration
      const salesSource = sales || state.sales; // Use provided sales or fallback to state
      const filteredSales = salesSource.filter(s => {
        const sStatus = (s.status || 'completed').toLowerCase();
        // Count all official transactions
        const isOfficial = !['draft', 'pending', 'refunded', 'cancelled'].includes(sStatus);

        const saleDate = new Date(s.timestamp);
        const effectiveEndDate = new Date(endDate);
        // Ensure "Today" covers the whole day
        if (effectiveEndDate.getHours() === 0 && effectiveEndDate.getMinutes() === 0) {
          effectiveEndDate.setHours(23, 59, 59, 999);
        }

        const inDateRange = saleDate >= startDate && saleDate <= effectiveEndDate;

        // FIX: Case-insensitive "all" check for globalStore
        const effectiveStore = (globalStore || 'all').toLowerCase();
        const saleTypeVal = (s.saleType || 'retail').toLowerCase();
        const storeMatch = effectiveStore === 'all' || saleTypeVal === effectiveStore;

        return isOfficial && inDateRange && storeMatch;
      });

      const soldQty = filteredSales.reduce((sum, sale) => {
        return sum + (sale.items || [])
          .filter(item => {
            const itemProdId = item.product?.id || (item as any).productId;
            return itemProdId === product.id;
          })
          .reduce((s, item) => s + (item.weight || item.quantity || 0), 0);
      }, 0);

      const revenue = filteredSales.reduce((sum, sale) => {
        return sum + (sale.items || [])
          .filter(item => {
            const itemProdId = item.product?.id || (item as any).productId;
            return itemProdId === product.id;
          })
          .reduce((s, item) => s + getItemRevenue(item, sale), 0);
      }, 0);

      const cogs = filteredSales.reduce((sum, sale) => {
        return sum + (sale.items || [])
          .filter(item => {
            const itemProdId = item.product?.id || (item as any).productId;
            return itemProdId === product.id;
          })
          .reduce((s, item) => s + getItemCOGS(item).cost, 0);
      }, 0);

      const grossProfit = revenue - cogs;

      const recentSales = filteredSales.flatMap(sale => {
        const productItems = (sale.items || []).filter(item => {
          const itemProdId = item.product?.id || (item as any).productId;
          return itemProdId === product.id;
        });
        
        return productItems.map(item => ({
          saleId: sale.id,
          invoiceNumber: sale.invoiceNumber,
          timestamp: sale.timestamp,
          quantity: item.weight || item.quantity || 0,
          revenue: getItemRevenue(item, sale),
          cogs: getItemCOGS(item).cost,
          customerName: sale.customerName,
          selectedVariant: item.selectedVariant,
          selectedModifiers: item.selectedModifiers,
          serialNumber: item.serialNumber
        }));
      }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return {
        id: product.id,
        name: product.name,
        sku: product.sku || '—',
        category: product.category,
        supplier: product.supplier || '—',
        stock: product.stock,
        minStock: product.minStock,
        costPrice: product.cost || 0,
        sellingPrice,
        stockValue,
        potentialRevenue,
        profitMargin,
        stockStatus,
        soldQty,
        revenue,
        cogs,
        grossProfit,
        batches: product.batches || [],
        isInfinite,
        recentSales
      };
    });

    // Final status filter
    let filtered = stats;
    if (statusFilter === 'in') filtered = filtered.filter(p => p.stockStatus === 'In Stock');
    if (statusFilter === 'low') filtered = filtered.filter(p => p.stockStatus === 'Low Stock');
    if (statusFilter === 'out') filtered = filtered.filter(p => p.stockStatus === 'Out of Stock');

    // Sort
    const statusOrder = { 'Out of Stock': 0, 'Low Stock': 1, 'In Stock': 2, 'Infinity Mode': 3 };
    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'stock': cmp = a.stock - b.stock; break;
        case 'stockValue': cmp = a.stockValue - b.stockValue; break;
        case 'profitMargin': cmp = a.profitMargin - b.profitMargin; break;
        case 'status': cmp = statusOrder[a.stockStatus] - statusOrder[b.stockStatus]; break;
        case 'soldQty': cmp = a.soldQty - b.soldQty; break;
        case 'revenue': cmp = a.revenue - b.revenue; break;
        case 'cogs': cmp = a.cogs - b.cogs; break;
        case 'grossProfit': cmp = a.grossProfit - b.grossProfit; break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return filtered;
  }, [state.products, state.sales, sales, search, statusFilter, categoryFilter, supplierFilter, globalCategory, globalSupplier, globalStore, startDate, endDate, sortField, sortDir]);

  const displayedData = useMemo(() => inventoryData.slice(0, displayLimit), [inventoryData, displayLimit]);

  // Summary Metrics
  const totalStockValue = inventoryData.reduce((s, p) => s + p.stockValue, 0);
  const totalPotentialRevenue = inventoryData.reduce((s, p) => s + p.potentialRevenue, 0);
  const totalActualRevenue = inventoryData.reduce((s, p) => s + p.revenue, 0);
  const totalCOGS = inventoryData.reduce((s, p) => s + p.cogs, 0);
  const totalGrossProfit = inventoryData.reduce((s, p) => s + p.grossProfit, 0);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const exportCSV = () => {
    const currency = state.settings.currency;
    const header = `Product,SKU,Category,Supplier,Stock,Status,Stock Value (${currency}),Sold Qty,Revenue (${currency}),Gross Profit (${currency})\n`;
    const rows = inventoryData.map(p =>
      `"${p.name}","${p.sku}","${p.category}","${p.supplier}",${p.stock},"${p.stockStatus}",${p.stockValue},${p.soldQty},${p.revenue},${p.grossProfit}`
    ).join('\n');
    const blob = new Blob(['\ufeff', header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const StatusBadge = ({ status }: { status: string }) => {
    if (status === 'Infinity Mode') return <span className="px-2 py-0.5 rounded bg-violet-500/10 text-violet-500 text-[8px] font-black uppercase tracking-widest flex items-center gap-1 w-fit">∞ {t('infinity_mode', 'INFINITY')}</span>;
    if (status === 'Out of Stock') return <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-500 text-[8px] font-black uppercase tracking-widest flex items-center gap-1 w-fit"><XCircle className="w-2.5 h-2.5" /> {t('out_of_stock', 'OUT')}</span>;
    if (status === 'Low Stock') return <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 text-[8px] font-black uppercase tracking-widest flex items-center gap-1 w-fit"><AlertTriangle className="w-2.5 h-2.5" /> {t('low_stock', 'LOW')}</span>;
    return <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-[8px] font-black uppercase tracking-widest flex items-center gap-1 w-fit"><CheckCircle2 className="w-2.5 h-2.5" /> {t('in_stock', 'OK')}</span>;
  };

  const SortTh = ({ field, label }: { field: SortField; label: string }) => (
    <th onClick={() => toggleSort(field)} className="px-3 py-3 text-[9px] font-black text-gray-700 dark:text-gray-400 uppercase tracking-widest cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors">
      <div className="flex items-center gap-1">
        {label}
        {sortField === field && <ArrowUpDown className="w-3 h-3 text-primary" />}
      </div>
    </th>
  );

  return (
    <div className="p-4 lg:p-6 space-y-5">

      {/* Filter Info Header */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 px-6 py-4 bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-3xl mb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-xl"><Calendar className="w-4 h-4 text-primary" /></div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-primary dark:text-emerald-400 leading-none mb-1">{t('period', 'Period')}</p>
            <p className="text-[11px] font-black text-gray-900 dark:text-white">{formatAppDate(startDate)} — {formatAppDate(endDate)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-xl"><Tag className="w-4 h-4 text-primary" /></div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-primary dark:text-emerald-400 leading-none mb-1">{t('active_store', 'Active Store')}</p>
            <p className="text-[11px] font-black text-gray-900 dark:text-white capitalize">{globalStore === 'all' ? t('all_channels', 'All Channels') : globalStore}</p>
          </div>
        </div>
        <div className="ml-auto px-4 py-2 rounded-2xl bg-white/50 dark:bg-black/20 border border-gray-200/50 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <p className="text-[9px] font-black text-primary uppercase tracking-widest">{t('live_analytics_active', 'Live Analytics Active')}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <div className="stat-card bg-gradient-to-br from-blue-600 to-indigo-700">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t('stock_value_cost', 'Stock Value (Cost)')}</span>
            <span className="stat-card-value">{formatCurrency(totalStockValue, state.settings.currency)}</span>
          </div>
          <DollarSign className="stat-card-icon" />
        </div>
        <div className="stat-card bg-gradient-to-br from-indigo-500 to-violet-700">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t('stock_value_sale', 'Stock Value (Sale)')}</span>
            <span className="stat-card-value">{formatCurrency(totalPotentialRevenue, state.settings.currency)}</span>
          </div>
          <Tag className="stat-card-icon" />
        </div>
        <div className="stat-card bg-gradient-to-br from-emerald-500 to-teal-600">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t('actual_revenue', 'Actual Revenue')}</span>
            <span className="stat-card-value">{formatCurrency(totalActualRevenue, state.settings.currency)}</span>
          </div>
          <TrendingUp className="stat-card-icon" />
        </div>
        <div className="stat-card bg-gradient-to-br from-rose-500 to-red-600">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t('cogs_stock_cost', 'COGS (Stock Cost)')}</span>
            <span className="stat-card-value">{formatCurrency(totalCOGS, state.settings.currency)}</span>
          </div>
          <TrendingDown className="stat-card-icon" />
        </div>
        <div className="stat-card bg-gradient-to-br from-orange-500 to-amber-600">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t('gross_profit', 'Gross Profit')}</span>
            <span className="stat-card-value">{formatCurrency(totalGrossProfit, state.settings.currency)}</span>
          </div>
          <BarChart3 className="stat-card-icon" />
        </div>
        <div className="stat-card bg-gradient-to-br from-cyan-500 to-blue-500">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t('total_products', 'Total Products')}</span>
            <span className="stat-card-value">{inventoryData.length}</span>
          </div>
          <Package className="stat-card-icon" />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-3 bg-white dark:bg-zinc-900/60 p-2 rounded-2xl border border-gray-200/50">
        <div className="relative flex-1 w-full sm:min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('search_report_placeholder', 'Search jeans, shirt, SKU...')} className="w-full bg-gray-50 dark:bg-white/5 rounded-xl py-2 pl-10 pr-4 text-xs font-bold focus:ring-2 focus:ring-emerald-500 outline-none" />
        </div>
        <button onClick={exportCSV} className="btn btn-md btn-primary w-full sm:w-auto hover:scale-105"><Download className="w-3.5 h-3.5" /> {t('export_report', 'Export Report')}</button>
        <button onClick={runIntegrityCheck} disabled={isCheckingIntegrity} className="btn btn-md btn-secondary w-full sm:w-auto hover:scale-105">
          <Database className="w-3.5 h-3.5" />
          {isCheckingIntegrity ? t('checking', 'Checking...') : t('integrity_check', 'Integrity Check')}
        </button>
      </div>

      {showIntegrity && (
        <div className="bg-white dark:bg-zinc-900/60 rounded-3xl border border-gray-200/50 dark:border-white/5 overflow-hidden shadow-xl shadow-black/5 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[10px] font-black uppercase tracking-widest">{t('integrity_results', 'Inventory Integrity Results')}</h3>
            <button onClick={() => setShowIntegrity(false)} className="text-[10px] font-bold text-gray-600 hover:text-gray-900">&times;</button>
          </div>
          {integrityResults.length === 0 ? (
            <div className="flex items-center gap-2 text-primary text-xs font-bold">
              <CheckCircle2 className="w-4 h-4" />
              {t('integrity_clean', 'All checks passed — stock, batches, and history agree.')}
            </div>
          ) : (
            <div>
              <div className="space-y-2 max-h-60 overflow-y-auto mb-3">
                {integrityResults.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 bg-rose-500/10 rounded-xl text-[10px] font-bold">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    <span className="text-gray-900 dark:text-white truncate">{r.name}</span>
                    <span className="text-rose-500 shrink-0 ml-auto">
                      {r.type === 'batch_drift' ? 'Batch' : 'History'}: stock={r.productStock}, expected={r.expectedStock}, diff={r.diff > 0 ? '+':''}{r.diff}
                    </span>
                  </div>
                ))}
              </div>
              <button
                onClick={repairIntegrity}
                disabled={isRepairing}
                className="btn btn-md btn-ghost w-full hover:scale-105"
              >
                <Wrench className="w-3.5 h-3.5" />
                {isRepairing ? 'Repairing...' : `Repair All (${integrityResults.length} issues)`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Desktop Table View */}
      <div className="hidden lg:block bg-white dark:bg-zinc-900/60 rounded-3xl border border-gray-200/50 dark:border-white/5 overflow-hidden shadow-xl shadow-black/5">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50/50 dark:bg-white/[0.02] border-b border-gray-200 dark:border-white/5">
                <SortTh field="name" label={t('product_details', 'Product Details')} />
                <SortTh field="stock" label={t('stock', 'Stock')} />
                <SortTh field="status" label={t('status', 'Status')} />
                <th className="px-3 py-3 text-[9px] font-black text-gray-700 dark:text-gray-400 uppercase tracking-widest">{t('stock_value_cost_sale', 'Stock Value (Cost/Sale)')}</th>
                <SortTh field="soldQty" label={t('sold_qty', 'Sold Qty')} />
                <SortTh field="revenue" label={t('revenue', 'Revenue')} />
                <SortTh field="cogs" label={t('cogs_cost', 'COGS (Cost)')} />
                <SortTh field="grossProfit" label={t('profit', 'Profit')} />
                <SortTh field="profitMargin" label={t('profit_margin', 'Margin')} />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
              {displayedData.map(item => (
                <React.Fragment key={item.id}>
                  <tr onClick={() => toggleRow(item.id)} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors cursor-pointer group">
                    <td className="px-3 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-1 rounded-lg transition-all ${expandedRows.has(item.id) ? 'bg-primary text-white' : 'text-gray-600 group-hover:text-primary'}`}>
                          {item.batches && item.batches.length > 0 ? (expandedRows.has(item.id) ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />) : <Database className="w-3.5 h-3.5 opacity-20" />}
                        </div>
                        <div>
                          <p className="text-xs font-black text-gray-900 dark:text-white leading-tight">{item.name}</p>
                          <p className="text-[9px] font-bold text-gray-600 mt-1 uppercase tracking-tighter">{item.sku} • {item.category}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4">
                      <p className="text-xs font-black text-gray-900 dark:text-white">{item.isInfinite ? '∞' : item.stock}</p>
                      <p className="text-[8px] font-bold text-gray-600 opacity-50 uppercase">{item.isInfinite ? t('non_tracked', 'Non-Tracked') : `${t('min', 'min')}: ${item.minStock}`}</p>
                    </td>
                    <td className="px-3 py-4 text-center"><StatusBadge status={item.stockStatus} /></td>
                    <td className="px-3 py-4">
                      <div className="flex flex-col">
                        <p className="text-xs font-black text-gray-900 dark:text-white">
                          <span className="text-gray-600 mr-1 text-[10px]">C:</span>
                          {formatCurrency(item.stockValue, state.settings.currency)}
                        </p>
                        <p className="text-[11px] font-black text-primary dark:text-emerald-400 mt-0.5">
                          <span className="text-gray-600 mr-1 text-[10px]">S:</span>
                          {formatCurrency(item.potentialRevenue, state.settings.currency)}
                        </p>
                      </div>
                    </td>
                    <td className="px-3 py-4 text-center"><p className="text-xs font-black text-gray-900 dark:text-white">{item.soldQty > 0 ? item.soldQty.toFixed(1) : '—'}</p></td>
                    <td className="px-3 py-4"><p className="text-xs font-black text-primary dark:text-emerald-400">{item.revenue > 0 ? formatCurrency(item.revenue, state.settings.currency) : '—'}</p></td>
                    <td className="px-3 py-4"><p className="text-xs font-bold text-rose-500">{item.cogs > 0 ? formatCurrency(item.cogs, state.settings.currency) : '—'}</p></td>
                    <td className="px-3 py-4"><p className={`text-xs font-black ${item.grossProfit > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600'}`}>{item.grossProfit !== 0 ? formatCurrency(item.grossProfit, state.settings.currency) : '—'}</p></td>
                    <td className="px-3 py-4">
                      <span className={`text-[10px] font-black flex items-center gap-1 ${item.profitMargin > 30 ? 'text-primary' : 'text-gray-600'}`}>
                        {item.profitMargin > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {item.profitMargin.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                  {expandedRows.has(item.id) && (item.batches.length > 0 || (item.recentSales && item.recentSales.length > 0)) && (
                    <tr className="bg-gray-50/50 dark:bg-white/[0.01]">
                      <td colSpan={9} className="px-12 py-4 space-y-6">
                        {item.batches.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-4">
                              <Clock className="w-3.5 h-3.5 text-primary" />
                              <h4 className="text-[9px] font-black text-gray-600 uppercase tracking-[0.2em]">{t('batch_purchase_history', 'Batch Purchase History')}</h4>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                              {item.batches.map((batch: any, bIdx: number) => (
                                <div key={batch.id || bIdx} className="p-3 bg-white dark:bg-zinc-800/80 rounded-2xl border border-gray-200 dark:border-white/5 shadow-sm">
                                  <div className="flex justify-between items-center mb-2">
                                    <span className="text-[9px] font-black text-primary uppercase">Batch #{batch.batchNumber || bIdx + 1}</span>
                                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${batch.qtyRemaining > 0 ? 'bg-primary/10 text-primary' : 'bg-rose-500/10 text-rose-500'}`}>{batch.qtyRemaining > 0 ? t('active', 'Active') : t('closed', 'Closed')}</span>
                                  </div>
                                  <div className="space-y-1">
                                    <div className="flex justify-between text-[10px]"><span className="text-gray-600 font-bold uppercase tracking-tight">{t('acquisition', 'Acquisition')}</span><span className="text-gray-900 dark:text-white font-black">{batch.manufacturingDate ? formatAppDate(new Date(batch.manufacturingDate)) : '—'}</span></div>
                                    <div className="flex justify-between text-[10px]"><span className="text-gray-600 font-bold uppercase tracking-tight">{t('pur_price', 'Pur. Price')}</span><span className="text-gray-900 dark:text-white font-black">{formatCurrency(batch.costPrice, state.settings.currency)}</span></div>
                                    <div className="flex justify-between text-[10px] pt-1 border-t border-gray-200 dark:border-white/5"><span className="text-gray-600 font-bold uppercase tracking-tight">{t('remaining', 'Remaining')}</span><span className="text-gray-900 dark:text-white font-black">{batch.qtyRemaining} / {batch.quantity}</span></div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {item.recentSales && item.recentSales.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-4">
                              <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
                              <h4 className="text-[9px] font-black text-gray-600 uppercase tracking-[0.2em]">{t('sales_history_selected_period', 'Sales History (Selected Period)')}</h4>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                              {item.recentSales.map((sale: any, sIdx: number) => (
                                <div key={sIdx} className="p-3 bg-white dark:bg-zinc-800/80 rounded-2xl border border-gray-200 dark:border-white/5 shadow-sm">
                                  <div className="flex justify-between items-center mb-2">
                                    <span className="text-[9px] font-black text-blue-500 uppercase">INV #{sale.invoiceNumber || '—'}</span>
                                    <span className="text-[8px] font-black px-1.5 py-0.5 rounded uppercase bg-blue-500/10 text-blue-500">{formatAppDate(new Date(sale.timestamp))}</span>
                                  </div>
                                  <div className="space-y-1">
                                    <div className="flex justify-between text-[10px]"><span className="text-gray-600 font-bold uppercase tracking-tight">{t('customer', 'Customer')}</span><span className="text-gray-900 dark:text-white font-black truncate max-w-[100px] text-right">{sale.customerName || t('walk_in', 'Walk-in')}</span></div>
                                    <div className="flex justify-between text-[10px]"><span className="text-gray-600 font-bold uppercase tracking-tight">{t('qty', 'Quantity')}</span><span className="text-gray-900 dark:text-white font-black">{sale.quantity}</span></div>
                                    <div className="flex justify-between text-[10px] pt-1 border-t border-gray-200 dark:border-white/5"><span className="text-gray-600 font-bold uppercase tracking-tight">{t('revenue', 'Revenue')}</span><span className="text-primary dark:text-emerald-400 font-black">{formatCurrency(sale.revenue, state.settings.currency)}</span></div>
                                    {(sale.selectedVariant || sale.serialNumber || (sale.selectedModifiers && sale.selectedModifiers.length > 0)) && (
                                      <div className="pt-1 border-t border-gray-200 dark:border-white/5 text-[9px] font-bold text-gray-500 truncate text-right">
                                        {sale.selectedVariant && <span>{sale.selectedVariant}</span>}
                                        {sale.selectedVariant && (sale.serialNumber || sale.selectedModifiers?.length > 0) && <span> | </span>}
                                        {sale.serialNumber && <span>SN: {sale.serialNumber}</span>}
                                        {sale.serialNumber && sale.selectedModifiers?.length > 0 && <span> | </span>}
                                        {sale.selectedModifiers?.length > 0 && <span>+ {sale.selectedModifiers.map((m: any) => m.name).join(', ')}</span>}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
            {inventoryData.length > 0 && (
              <tfoot>
                <tr className="bg-gray-900 text-white font-black">
                  <td className="px-3 py-4 text-[10px] uppercase tracking-widest opacity-50">{t('grand_totals', 'Grand Totals')}</td>
                  <td className="px-3 py-4 text-xs">{inventoryData.reduce((s, p) => s + (p.isInfinite ? 0 : p.stock), 0)}</td>
                  <td className="px-3 py-4"></td>
                  <td className="px-3 py-4 text-xs">{formatCurrency(totalStockValue, state.settings.currency)}</td>
                  <td className="px-3 py-4 text-xs text-center">{inventoryData.reduce((s, p) => s + p.soldQty, 0).toFixed(1)}</td>
                  <td className="px-3 py-4 text-xs">{formatCurrency(totalActualRevenue, state.settings.currency)}</td>
                  <td className="px-3 py-4 text-xs text-rose-400">{formatCurrency(totalCOGS, state.settings.currency)}</td>
                  <td className="px-3 py-4 text-xs text-blue-400">{formatCurrency(totalGrossProfit, state.settings.currency)}</td>
                  <td className="px-3 py-4 text-xs">{(totalActualRevenue > 0 ? totalGrossProfit / totalActualRevenue * 100 : 0).toFixed(1)}%</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Load More Desktop */}
      {inventoryData.length > displayLimit && (
        <div className="hidden lg:flex justify-center pt-4">
          <button
            onClick={() => setDisplayLimit(prev => prev + 25)}
            className="flex items-center gap-2 px-8 py-3 bg-white dark:bg-zinc-900/60 border border-gray-200 dark:border-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-600 hover:text-primary hover:border-primary/50 transition-all shadow-sm active:scale-95"
          >
            <ChevronDown className="w-4 h-4" />
            {t('load_more_products_count', 'Load More Products ({count} remaining)').replace('{count}', (inventoryData.length - displayLimit).toString())}
          </button>
        </div>
      )}

      {/* Mobile Card View */}
      <div className="lg:hidden space-y-4">
        {displayedData.map(item => (
          <div key={item.id} onClick={() => toggleRow(item.id)} className="bg-white dark:bg-zinc-900/60 p-4 rounded-3xl border border-gray-200/50 dark:border-white/5 shadow-sm active:scale-[0.98] transition-all">
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-gray-900 dark:text-white leading-tight">{item.name}</h4>
                  <p className="text-[10px] font-bold text-gray-600 uppercase tracking-tighter">{item.sku} • {item.category}</p>
                </div>
              </div>
              <StatusBadge status={item.stockStatus} />
            </div>

            <div className="grid grid-cols-2 gap-4 py-3 border-y border-gray-200 dark:border-white/5">
              <div>
                <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-1">{t('stock_position', 'Stock Position')}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-base font-black text-gray-900 dark:text-white">{item.isInfinite ? '∞' : item.stock}</span>
                  {!item.isInfinite && <span className="text-[10px] text-gray-600">/ {t('min', 'min')} {item.minStock}</span>}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div>
                  <p className="text-[8px] font-black text-gray-600 uppercase tracking-widest mb-0.5">{t('stock_value_cost', 'Value (Cost)')}</p>
                  <p className="text-sm font-black text-gray-900 dark:text-white">{formatCurrency(item.stockValue, state.settings.currency)}</p>
                </div>
                <div>
                  <p className="text-[8px] font-black text-primary uppercase tracking-widest mb-0.5">{t('stock_value_sale', 'Value (Sale)')}</p>
                  <p className="text-sm font-black text-primary dark:text-emerald-400">{formatCurrency(item.potentialRevenue, state.settings.currency)}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="bg-gray-50 dark:bg-white/5 p-2 rounded-2xl">
                <p className="text-[8px] font-black text-gray-600 uppercase mb-0.5">{t('sold_caps', 'Sold')}</p>
                <p className="text-xs font-black text-gray-900 dark:text-white">{item.soldQty.toFixed(1)}</p>
              </div>
              <div className="bg-primary/5 dark:bg-primary/10 p-2 rounded-2xl">
                <p className="text-[8px] font-black text-primary uppercase mb-0.5">{t('revenue_caps', 'Revenue')}</p>
                <p className="text-xs font-black text-primary dark:text-emerald-400">{formatCurrency(item.revenue, state.settings.currency)}</p>
              </div>
              <div className="bg-blue-500/5 dark:bg-blue-500/10 p-2 rounded-2xl">
                <p className="text-[8px] font-black text-blue-500 uppercase mb-0.5">{t('profit_caps', 'Profit')}</p>
                <p className="text-xs font-black text-blue-600 dark:text-blue-400">{formatCurrency(item.grossProfit, state.settings.currency)}</p>
              </div>
            </div>

            {expandedRows.has(item.id) && (item.batches.length > 0 || (item.recentSales && item.recentSales.length > 0)) && (
              <div className="mt-4 pt-4 border-t border-dashed border-gray-200 dark:border-white/10 space-y-4">
                {item.batches.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3 h-3 text-primary" />
                      <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest">{t('batch_history', 'Batch History')}</p>
                    </div>
                    {item.batches.map((batch: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center bg-gray-50 dark:bg-black/20 p-2 rounded-xl text-[10px]">
                        <span className="font-bold text-gray-600">Batch #{idx + 1}</span>
                        <span className="font-black text-gray-900 dark:text-white">{batch.qtyRemaining} {t('remaining', 'left')} @ {formatCurrency(batch.costPrice, state.settings.currency)}</span>
                      </div>
                    ))}
                  </div>
                )}
                
                {item.recentSales && item.recentSales.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-3 h-3 text-blue-500" />
                      <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest">{t('sales_ledger', 'Sales Ledger')}</p>
                    </div>
                    {item.recentSales.map((sale: any, sIdx: number) => (
                      <div key={sIdx} className="bg-gray-50 dark:bg-black/20 p-3 rounded-xl space-y-1 text-[10px]">
                        <div className="flex justify-between items-center mb-1 border-b border-gray-200 dark:border-white/5 pb-1">
                          <span className="font-bold text-gray-600">{formatAppDate(new Date(sale.timestamp))}</span>
                          <span className="font-black text-primary dark:text-emerald-400">{formatCurrency(sale.revenue, state.settings.currency)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-bold text-gray-500">INV #{sale.invoiceNumber}</span>
                          <span className="font-black text-gray-900 dark:text-white">{t('qty', 'Qty')}: {sale.quantity}</span>
                        </div>
                        {(sale.selectedVariant || sale.serialNumber || (sale.selectedModifiers && sale.selectedModifiers.length > 0)) && (
                          <div className="text-[9px] font-bold text-gray-500 truncate pt-1">
                            {sale.selectedVariant && <span>{sale.selectedVariant}</span>}
                            {sale.selectedVariant && (sale.serialNumber || sale.selectedModifiers?.length > 0) && <span> | </span>}
                            {sale.serialNumber && <span>SN: {sale.serialNumber}</span>}
                            {sale.serialNumber && sale.selectedModifiers?.length > 0 && <span> | </span>}
                            {sale.selectedModifiers?.length > 0 && <span>+ {sale.selectedModifiers.map((m: any) => m.name).join(', ')}</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {/* Mobile Grand Total */}
        <div className="bg-gray-900 text-white p-5 rounded-3xl shadow-xl">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50 mb-4">{t('inventory_grand_summary', 'Inventory Grand Summary')}</p>
          <div className="grid grid-cols-2 gap-y-4 gap-x-8">
            <div>
              <p className="text-[8px] font-bold text-emerald-400 uppercase mb-1">{t('total_stock', 'Total Stock')}</p>
              <p className="text-lg font-black">{inventoryData.reduce((s, p) => s + (p.isInfinite ? 0 : p.stock), 0)}</p>
            </div>
            <div>
              <p className="text-[8px] font-bold text-emerald-400 uppercase mb-1">{t('stock_value_cost', 'Stock (Cost)')}</p>
              <p className="text-lg font-black">{formatCurrency(totalStockValue, state.settings.currency)}</p>
            </div>
            <div>
              <p className="text-[8px] font-bold text-emerald-400 uppercase mb-1">{t('stock_value_sale', 'Stock (Sale)')}</p>
              <p className="text-lg font-black">{formatCurrency(totalPotentialRevenue, state.settings.currency)}</p>
            </div>
            <div>
              <p className="text-[8px] font-bold text-blue-400 uppercase mb-1">{t('total_profit', 'Total Profit')}</p>
              <p className="text-lg font-black text-blue-400">{formatCurrency(totalGrossProfit, state.settings.currency)}</p>
            </div>
          </div>
        </div>

        {/* Load More Mobile */}
        {inventoryData.length > displayLimit && (
          <div className="flex justify-center pt-2">
            <button
              onClick={() => setDisplayLimit(prev => prev + 25)}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-white dark:bg-zinc-900/60 border border-gray-200 dark:border-white/5 rounded-[2rem] text-[10px] font-black uppercase tracking-widest text-gray-600 active:scale-95 transition-all shadow-sm"
            >
              <ChevronDown className="w-4 h-4" />
              {t('load_more', 'Load More')} ({inventoryData.length - displayLimit})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
