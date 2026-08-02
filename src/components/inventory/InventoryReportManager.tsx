import React, { useState, useMemo } from 'react';
import { getItemCOGS, getItemRevenue } from '../reports/ReportsManager';
import {
  Package, AlertTriangle, XCircle, CheckCircle2, TrendingUp, TrendingDown,
  ArrowUpDown, Tag, DollarSign, BarChart3,
  ChevronRight, ChevronDown, Calendar, Database, Clock, Wrench
} from 'lucide-react';
import { useApp } from '../../context/SupabaseAppContext';
import { formatCurrency, formatNumberWithPrecision, getCurrencySymbol } from '../../lib/currencies';
import { formatAppDate } from '../../lib/dateUtils';
import { useTranslation } from '../../hooks/useTranslation';
import { productsService } from '../../lib/services';
import { SharedSearchBar } from '../../shared/modules/search-and-list';
import { Badge, Pagination, usePagination, Button } from '../../shared/ui';
import { ExportButton } from '../../shared/export';
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
  const { state, dispatch } = useApp();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in' | 'low' | 'out'>('all');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [supplierFilter, setSupplierFilter] = useState('All');
  const [sortField, setSortField] = useState<SortField>('status');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Integrity checks removed as batch system is deprecated

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

      const stockValue = isInfinite ? 0 : (product.stock * (product.cost || 0));

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

  const { page, totalPages, pageItems: displayedData, goToPage, pageSize, setPageSize } = usePagination(inventoryData, 25);

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

  const exportColumns = [
    { key: 'name', label: t('product', 'Product') },
    { key: 'sku', label: t('sku', 'SKU') },
    { key: 'category', label: t('category', 'Category') },
    { key: 'supplier', label: t('supplier', 'Supplier') },
    { key: 'stock', label: t('stock', 'Stock'), format: 'number' as const },
    { key: 'stockStatus', label: t('status', 'Status') },
    { key: 'stockValue', label: `Stock Value (${state.settings.currency})`, format: 'currency' as const },
    { key: 'soldQty', label: t('sold_qty', 'Sold Qty'), format: 'number' as const },
    { key: 'revenue', label: `Revenue (${state.settings.currency})`, format: 'currency' as const },
    { key: 'grossProfit', label: `Gross Profit (${state.settings.currency})`, format: 'currency' as const },
  ];

  const exportRows = useMemo(() => inventoryData.map(p => ({
    name: p.name,
    sku: p.sku || '',
    category: p.category || '',
    supplier: p.supplier || '',
    stock: p.stock,
    stockStatus: p.stockStatus,
    stockValue: p.stockValue,
    soldQty: p.soldQty,
    revenue: p.revenue,
    grossProfit: p.grossProfit,
  })), [inventoryData]);

  const StatusBadge = ({ status }: { status: string }) => {
    if (status === 'Infinity Mode') return <Badge tone="info" size="sm" className="!rounded !text-[8px] !bg-violet-500/10 !text-violet-500 dark:!text-violet-500" icon={<span>∞</span>}>{t('infinity_mode', 'INFINITY')}</Badge>;
    if (status === 'Out of Stock') return <Badge tone="danger" size="sm" className="!rounded !text-[8px] !bg-red-500/10 !text-red-500 dark:!text-red-500" icon={<XCircle className="w-2.5 h-2.5" />}>{t('out_of_stock', 'OUT')}</Badge>;
    if (status === 'Low Stock') return <Badge tone="warning" size="sm" className="!rounded !text-[8px] !bg-amber-500/10 !text-amber-500 dark:!text-amber-500" icon={<AlertTriangle className="w-2.5 h-2.5" />}>{t('low_stock', 'LOW')}</Badge>;
    return <Badge tone="success" size="sm" className="!rounded !text-[8px] !bg-primary/10 !text-primary dark:!text-primary" icon={<CheckCircle2 className="w-2.5 h-2.5" />}>{t('in_stock', 'OK')}</Badge>;
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
        <div className="flex-1 w-full sm:min-w-[200px]">
          <SharedSearchBar
            value={search}
            onChange={setSearch}
            placeholder={t('search_report_placeholder', 'Search name, SKU...')}
          />
        </div>
        <ExportButton
          data={exportRows}
          columns={exportColumns}
          title="Inventory Report"
          filtersSummary={`${formatAppDate(startDate)} — ${formatAppDate(endDate)}${globalStore && globalStore !== 'all' ? ` • Store: ${globalStore}` : ''}`}
          currencySymbol={getCurrencySymbol(state.settings.currency)}
          className="w-full sm:w-auto hover:scale-105"
        />
      </div>

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
                                    {batch.qtyRemaining > 0
                                      ? <Badge size="sm" tone="success" className="!text-[8px] !px-1.5 !py-0.5 !rounded !bg-primary/10 !text-primary dark:!text-primary">{t('active', 'Active')}</Badge>
                                      : <Badge size="sm" tone="danger" className="!text-[8px] !px-1.5 !py-0.5 !rounded !bg-rose-500/10 !text-rose-500 dark:!text-rose-500">{t('closed', 'Closed')}</Badge>}
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
                                    <Badge size="sm" tone="info" className="!text-[8px] !px-1.5 !py-0.5 !rounded !bg-blue-500/10 !text-blue-500 dark:!text-blue-500">{formatAppDate(new Date(sale.timestamp))}</Badge>
                                  </div>
                                  <div className="space-y-1">
                                    <div className="flex justify-between text-[10px]"><span className="text-gray-600 font-bold uppercase tracking-tight">{t('customer', 'Customer')}</span><span className="text-gray-900 dark:text-white font-black truncate max-w-[100px] text-right">{sale.customerName || t('walk_in', 'Walk-in')}</span></div>
                                    <div className="flex justify-between text-[10px]"><span className="text-gray-600 font-bold uppercase tracking-tight">{t('qty', 'Quantity')}</span><span className="text-gray-900 dark:text-white font-black">{sale.quantity}</span></div>
                                    <div className="flex justify-between text-[10px] pt-1 border-t border-gray-200 dark:border-white/5"><span className="text-gray-600 font-bold uppercase tracking-tight">{t('revenue', 'Revenue')}</span><span className="text-primary dark:text-emerald-400 font-black">{formatCurrency(sale.revenue, state.settings.currency)}</span></div>
                                    {(sale.selectedVariant || sale.serialNumber || (sale.selectedModifiers && sale.selectedModifiers.length > 0) || (sale.addonItems && sale.addonItems.length > 0) || (sale.toppings && sale.toppings.length > 0)) && (
                                      <div className="pt-1 border-t border-gray-200 dark:border-white/5 text-[9px] font-bold text-gray-500 text-right flex flex-col gap-0.5 mt-0.5 normal-case tracking-normal">
                                        {sale.selectedVariant && <span>{sale.selectedVariant}</span>}
                                        {sale.serialNumber && <span className="text-amber-500">SN: {sale.serialNumber}</span>}
                                        {sale.selectedModifiers?.length > 0 && <span className="text-primary">+ {sale.selectedModifiers.map((m: any) => `${m.name} (${formatCurrency(m.price, state.settings.currency)})`).join(', ')}</span>}
                                        {sale.addonItems?.length > 0 && <span className="text-violet-500">+ Add-ons: {sale.addonItems.map((a: any) => `${a.addon?.name || a.name} ${a.quantity}x (${formatCurrency(a.subtotal, state.settings.currency)})`).join(', ')}</span>}
                                        {sale.toppings?.length > 0 && <span className="text-gray-500">+ {sale.toppings.map((t: any) => `${t.name} (${formatCurrency(t.price, state.settings.currency)})`).join(', ')}</span>}
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

      {/* Pagination Desktop */}
      
        <div className="hidden lg:flex justify-center pt-4">
          <Pagination
              page={page}
            totalPages={totalPages}
            onPageChange={goToPage}
            totalItems={inventoryData.length}
            mode="numbered"
          
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
            />
        </div>
      

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
                        {(sale.selectedVariant || sale.serialNumber || (sale.selectedModifiers && sale.selectedModifiers.length > 0) || (sale.addonItems && sale.addonItems.length > 0) || (sale.toppings && sale.toppings.length > 0)) && (
                          <div className="text-[9px] font-bold text-gray-500 pt-1 flex flex-col gap-0.5 normal-case tracking-normal">
                            {sale.selectedVariant && <span>{sale.selectedVariant}</span>}
                            {sale.serialNumber && <span className="text-amber-500">SN: {sale.serialNumber}</span>}
                            {sale.selectedModifiers?.length > 0 && <span className="text-primary">+ {sale.selectedModifiers.map((m: any) => `${m.name} (${formatCurrency(m.price, state.settings.currency)})`).join(', ')}</span>}
                            {sale.addonItems?.length > 0 && <span className="text-violet-500">+ Add-ons: {sale.addonItems.map((a: any) => `${a.addon?.name || a.name} ${a.quantity}x (${formatCurrency(a.subtotal, state.settings.currency)})`).join(', ')}</span>}
                            {sale.toppings?.length > 0 && <span className="text-gray-500">+ {sale.toppings.map((t: any) => `${t.name} (${formatCurrency(t.price, state.settings.currency)})`).join(', ')}</span>}
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

        {/* Pagination Mobile */}
        
          <div className="flex justify-center pt-4">
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={goToPage}
              totalItems={inventoryData.length}
              mode="numbered"
            
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
            />
          </div>
        
      </div>
    </div>
  );
}
