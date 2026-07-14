import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Download, Eye, RefreshCw, CreditCard, Banknote, Smartphone, Receipt, FileText, X, ShoppingCart, Edit, Trash2, Printer, Share2, Store, Globe, ChevronLeft, ChevronRight, LayoutGrid, Wallet, TrendingUp, Package, History, MessageCircle, RotateCcw, Hash, Layers, User, Gift, Building2, ShoppingBag, MapPin } from 'lucide-react';
import { useApp } from '../../context/SupabaseAppContext';
import { useAuth } from '../../context/AuthContext';
import { formatAppDate, formatAppTime, formatAppDateTime, getTimezone, getStartOfDayInTimezone, getEndOfDayInTimezone, getStartOfInputDayInTimezone, getEndOfInputDayInTimezone } from '../../lib/dateUtils';
import { formatCurrency, formatNumberWithPrecision } from '../../lib/currencies';
import { Sale } from '../../types';
import { CheckoutModal } from '../pos/CheckoutModal';
import { ReceiptPrint } from '../pos/ReceiptPrint';
import { salesService, productsService, customersService, getAmountByMethod } from '../../lib/services';
import { sonner } from '../../lib/sonner';
import { useTranslation } from '../../hooks/useTranslation';
import { getDealCountBreakdown } from '../../lib/utils';
import { SearchableSelect } from '../common/SearchableSelect';
import { Modal } from '../common/Modal';
import RefundSaleModal from './RefundSaleModal';
import { RefundRequest } from '../../types';


const isDraftSale = (sale: Sale) =>
  sale.invoiceNumber.startsWith('DRAFT-') ||
  sale.notes?.includes('Draft sale') ||
  sale.notes?.includes('DRAFT_SALE');

export function TransactionsManager() {
  const navigate = useNavigate();
  const { state, dispatch, loadMoreSales, searchSales } = useApp();
  const { t } = useTranslation();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const timezone = getTimezone(state.settings.country);

  const { retailEnabled, wholesaleEnabled, estoreEnabled } = state.settings;
  const showRetail = retailEnabled !== false;
  const showWholesale = !!wholesaleEnabled;
  const showEstore = !!estoreEnabled;
  const activeCardsCount = 2 + (showRetail ? 1 : 0) + (showWholesale ? 1 : 0) + (showEstore ? 1 : 0);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('today');
  const [startDateInput, setStartDateInput] = useState('');
  const [endDateInput, setEndDateInput] = useState('');
  const [saleTypeFilter, setSaleTypeFilter] = useState<'all' | 'retail' | 'wholesale' | 'estore'>('all');
  const [selectedCashier, setSelectedCashier] = useState('all');
  const [isSearchingRemote, setIsSearchingRemote] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [cloudResults, setCloudResults] = useState<Sale[]>([]);
  const [isCloudSearch, setIsCloudSearch] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Listen for sync/ops events to refresh sales list and stats
  useEffect(() => {
    const handleRefresh = async () => {
      setRefreshKey(k => k + 1);
      // Reload from localDb to pick up any newly synced items
      await loadMoreSales(0, 1000);
    };
    window.addEventListener('pendingops-changed', handleRefresh);
    return () => window.removeEventListener('pendingops-changed', handleRefresh);
  }, [loadMoreSales]);

  // Trigger remote search when ANY filter is active
  React.useEffect(() => {
    // Check if any non-default filter is active
    const isActive =
      searchTerm.trim().length > 0 ||
      paymentFilter !== 'all' ||
      saleTypeFilter !== 'all' ||
      dateFilter !== 'today' ||
      selectedCashier !== 'all';

    setIsCloudSearch(isActive);

    if (!isActive) {
      setCloudResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingRemote(true);
      try {
        let startDate: Date | undefined;
        let endDate: Date | undefined;
        const now = new Date();
        if (dateFilter === 'today') {
          startDate = getStartOfDayInTimezone(now, timezone);
          endDate = getEndOfDayInTimezone(now, timezone);
        } else if (dateFilter === 'yesterday') {
          const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          startDate = getStartOfDayInTimezone(yesterday, timezone);
          endDate = getEndOfDayInTimezone(yesterday, timezone);
        } else if (dateFilter === 'last7') {
          startDate = getStartOfDayInTimezone(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000), timezone);
          endDate = getEndOfDayInTimezone(now, timezone);
        } else if (dateFilter === 'thisMonth') {
          startDate = getStartOfDayInTimezone(new Date(now.getFullYear(), now.getMonth(), 1), timezone);
          endDate = getEndOfDayInTimezone(now, timezone);
        } else if (dateFilter === 'lastMonth') {
          startDate = getStartOfDayInTimezone(new Date(now.getFullYear(), now.getMonth() - 1, 1), timezone);
          endDate = getEndOfDayInTimezone(new Date(now.getFullYear(), now.getMonth(), 0), timezone);
        } else if (dateFilter === 'all') {
          startDate = new Date(Date.UTC(2000, 0, 1));
          endDate = getEndOfDayInTimezone(now, timezone);
        } else if (dateFilter === 'custom') {
          if (startDateInput) {
            startDate = getStartOfInputDayInTimezone(startDateInput, timezone);
          }
          if (endDateInput) {
            endDate = getEndOfInputDayInTimezone(endDateInput, timezone);
          }
        }

        const results = await salesService.searchSales({
          startDate,
          endDate,
          invoiceNumber: searchTerm.trim() || undefined,
          paymentMethod: paymentFilter !== 'all' ? paymentFilter : undefined,
          cashier: selectedCashier !== 'all' ? selectedCashier : undefined,
          saleType: saleTypeFilter !== 'all' ? saleTypeFilter : undefined,
        });

        setCloudResults(results);
      } catch (e) {
        console.error("Cloud search failed", e);
        sonner.error('Search failed');
      } finally {
        setIsSearchingRemote(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm, paymentFilter, saleTypeFilter, selectedCashier, dateFilter, startDateInput, endDateInput, refreshKey]);

  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    await loadMoreSales(state.sales.length, 100);
    setIsLoadingMore(false);
  };

  // UI state
  const [selectedTransaction, setSelectedTransaction] = useState<Sale | null>(null);
  const [reprintSale, setReprintSale] = useState<Sale | null>(null);

  // Auto-open sale if returning from ProductDetailHub
  React.useEffect(() => {
    if (state.pendingReturnSaleId) {
      const saleToOpen = state.sales.find(s => s.id === state.pendingReturnSaleId);
      if (saleToOpen) {
        setSelectedTransaction(saleToOpen);
      }
      dispatch({ type: 'SET_PENDING_RETURN_SALE_ID', payload: null });
    }
  }, [state.pendingReturnSaleId, state.sales, dispatch]);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 15;

  // Listen for cross-component navigation search
  React.useEffect(() => {
    if (state.pendingSearch) {
      setSearchTerm(state.pendingSearch);
      setCurrentPage(1);
      dispatch({ type: 'SET_PENDING_SEARCH', payload: null });
    }
  }, [state.pendingSearch, dispatch]);



  // Base filtering (date) — timezone-aware using configured country timezone
  const dateFiltered = useMemo(() => {
    const now = new Date();
    let startTs: number;
    let endTs: number;

    if (dateFilter === 'custom') {
      startTs = startDateInput ? getStartOfInputDayInTimezone(startDateInput, timezone).getTime() : 0;
      endTs = endDateInput ? getEndOfInputDayInTimezone(endDateInput, timezone).getTime() : Infinity;
    } else if (dateFilter === 'all') {
      startTs = new Date(Date.UTC(2000, 0, 1)).getTime();
      endTs = Infinity;
    } else {
      const dateMap: Record<string, () => { start: Date; end: Date }> = {
        'today': () => ({ start: getStartOfDayInTimezone(now, timezone), end: getEndOfDayInTimezone(now, timezone) }),
        'yesterday': () => {
          const y = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          return { start: getStartOfDayInTimezone(y, timezone), end: getEndOfDayInTimezone(y, timezone) };
        },
        'last7': () => ({
          start: getStartOfDayInTimezone(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000), timezone),
          end: getEndOfDayInTimezone(now, timezone),
        }),
        'thisMonth': () => ({
          start: getStartOfDayInTimezone(new Date(now.getFullYear(), now.getMonth(), 1), timezone),
          end: getEndOfDayInTimezone(now, timezone),
        }),
        'lastMonth': () => {
          const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          return {
            start: getStartOfDayInTimezone(lm, timezone),
            end: getEndOfDayInTimezone(new Date(now.getFullYear(), now.getMonth(), 0), timezone),
          };
        },
      };
      const range = dateMap[dateFilter]?.() || dateMap['today']();
      startTs = range.start.getTime();
      endTs = range.end.getTime();
    }

    return state.sales.filter(sale => {
      if (isDraftSale(sale)) return false;
      const saleTs = new Date(sale.timestamp).getTime();
      return saleTs >= startTs && saleTs <= endTs;
    });
  }, [state.sales, dateFilter, startDateInput, endDateInput, timezone]);

  const cashiersList = useMemo(() => {
    const userNames = state.users.map(u => u.name).filter(Boolean);
    const saleCashiers = state.sales.map(s => s.cashier).filter(Boolean);
    return ['all', ...Array.from(new Set([...userNames, ...saleCashiers]))];
  }, [state.sales, state.users]);

  const filteredTransactions = useMemo(() => {
    // Use local data as fallback while cloud search is loading to prevent stats flash to 0
    let list = isCloudSearch ? (cloudResults.length > 0 ? cloudResults : dateFiltered) : dateFiltered;

    return list.filter(sale => {
      if (isDraftSale(sale)) return false;
      if (sale.status === 'pending') return false;
      const matchesSearch = isCloudSearch || (
        (sale.receiptNumber ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (sale.invoiceNumber ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (sale.customerName ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (sale.cashier ?? '').toLowerCase().includes(searchTerm.toLowerCase())
      );
      const matchesPayment = paymentFilter === 'all' || sale.paymentMethod === paymentFilter;
      const matchesSaleType = saleTypeFilter === 'all' || sale.saleType === saleTypeFilter || (!sale.saleType && saleTypeFilter === 'retail');
      const matchesCashier = selectedCashier === 'all' || sale.cashier === selectedCashier;
      return matchesSearch && matchesPayment && matchesSaleType && matchesCashier;
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [isCloudSearch, cloudResults, dateFiltered, searchTerm, paymentFilter, saleTypeFilter, selectedCashier]);

  const totalRevenue = filteredTransactions.reduce((s, x) => s + (x.total - (x.refundedAmount || 0)), 0);
  const totalTransactions = filteredTransactions.length;
  const totalItemsSold = filteredTransactions.reduce((s, x) => s + (x.items || []).reduce((i, item) => i + item.quantity, 0), 0);

  const retailSalesTotal = useMemo(() => {
    return filteredTransactions
      .filter(t => t.saleType === 'retail' || !t.saleType)
      .reduce((sum, t) => sum + (t.total - (t.refundedAmount || 0)), 0);
  }, [filteredTransactions]);

  const wholesaleSalesTotal = useMemo(() => {
    return filteredTransactions
      .filter(t => t.saleType === 'wholesale')
      .reduce((sum, t) => sum + (t.total - (t.refundedAmount || 0)), 0);
  }, [filteredTransactions]);

  const estoreSalesTotal = useMemo(() => {
    return filteredTransactions
      .filter(t => t.saleType === 'estore')
      .reduce((sum, t) => sum + (t.total - (t.refundedAmount || 0)), 0);
  }, [filteredTransactions]);

  const walletTotals = useMemo(() => {
    const totals = {
      cash: 0,
      card: 0,
      digital: 0,
      credit: 0,
    };
    
    filteredTransactions.forEach(t => {
      totals.cash += getAmountByMethod(t, 'cash');
      totals.card += getAmountByMethod(t, 'card');
      totals.digital += getAmountByMethod(t, 'digital');
      totals.credit += getAmountByMethod(t, 'credit');
    });
    
    return totals;
  }, [filteredTransactions]);

  const totalPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE);
  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const canEditSale = isAdmin || (profile?.role === 'manager' && profile?.canEditSale);
  const canDeleteSale = isAdmin || (profile?.role === 'manager' && profile?.canDeleteSale);

  const handleDeleteSale = async (tx: Sale) => {
    if (!canDeleteSale) return;
    const result = await sonner.confirm('Delete Sale?', 'This will permanently delete this record and revert stock.', 'Yes, delete it!');
    if (!result.isConfirmed) return;
    try {
      sonner.loading('Deleting...');
      if (tx.id) {
        const affectedProducts = await salesService.delete(tx.id);
        dispatch({ type: 'DELETE_SALE', payload: tx.id });

        affectedProducts.forEach(p => {
          dispatch({ type: 'UPDATE_PRODUCT', payload: p });
        });
      }
      sonner.success('Sale deleted and stock reverted.');
    } catch {
      sonner.error('Failed to delete sale.');
    } finally {
      sonner.close();
    }
  };

  const getPaymentIcon = (method: string) => {
    switch (method) {
      case 'cash': return <Banknote className="h-4 w-4 text-primary dark:text-emerald-400" />;
      case 'card': return <CreditCard className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
      case 'digital': return <Smartphone className="h-4 w-4 text-primary dark:text-emerald-400" />;
      case 'credit': return <Receipt className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
      default: return <CreditCard className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-emerald-100/80 text-emerald-700 dark:bg-primary/10 dark:text-emerald-400 border border-emerald-200/50 dark:border-primary/20';
      case 'pending': return 'bg-amber-100/80 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200/50 dark:border-amber-500/20';
      case 'refunded': return 'bg-rose-100/80 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 border border-rose-200/50 dark:border-rose-500/20';
      case 'partially_refunded': return 'bg-orange-100/80 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400 border border-orange-200/50 dark:border-orange-500/20';
      case 'credit': return 'bg-blue-100/80 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border border-blue-200/50 dark:border-blue-500/20';
      case 'draft': return 'bg-emerald-100/80 text-emerald-700 dark:bg-primary/10 dark:text-emerald-400 border border-emerald-200/50 dark:border-primary/20';
      default: return 'bg-gray-100 text-gray-700 border border-gray-200';
    }
  };

  const getSaleTypeLabel = (type?: string) => {
    switch (type) {
      case 'wholesale': return 'Wholesale';
      case 'estore': return 'E-Store';
      default: return 'Retail';
    }
  };

  const exportTransactions = () => {
    const currency = state.settings.currency;
    const isAdminRole = profile?.role === 'admin';

    const clean = (val: any) => {
      if (val === undefined || val === null) return '';
      return String(val).replace(/"/g, '""');
    };

    let csvHeader = 'Date,Time,Invoice Number,Receipt Number,Customer Name,Customer Phone,Cashier,Cashier @Username,Items List,Total Items Qty,Sale Type,Payment Method,Subtotal,Discount,Tax,Total Revenue';
    if (isAdminRole) csvHeader += `,Cost of Goods,Gross Profit`;
    csvHeader += '\n';

    const csvData = filteredTransactions.map(sale => {
      const customer = sale.customerId ? state.customers.find(c => c.id === sale.customerId) : null;
      const customerName = clean(customer?.name || sale.customerName || 'Walk-in');
      const customerPhone = clean(customer?.phone || '');
      const cashierUser = state.users.find(u => u.name === sale.cashier || u.email === sale.cashier);
      const cashierName = clean(sale.cashier || 'System');
      const cashierAt = cashierUser?.username ? `@${cashierUser.username}` : '';

      const itemsList = sale.items.map(item => {
        const sku = item.product?.sku ? ` [${item.product.sku}]` : '';
        return `${item.product?.name || 'Item'}${sku} x ${item.quantity} @ ${formatNumberWithPrecision(item.price || 0)}`;
      }).join('; ');

      const totalItemsQty = sale.items.reduce((sum, item) => sum + item.quantity, 0);
      const dateObj = new Date(sale.timestamp);
      const formattedDate = formatAppDate(dateObj, state.settings.country);
      const formattedTime = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const totalCostLocal = sale.items.reduce((sum, item) => {
        return sum + (item.purchaseCost ?? (item.product?.cost || 0) * item.quantity);
      }, 0);

      let row = `"${formattedDate}","${formattedTime}","${clean(sale.invoiceNumber)}","${clean(sale.receiptNumber)}","${customerName}","${customerPhone}","${cashierName}","${cashierAt}","${clean(itemsList)}",${totalItemsQty},"${clean(getSaleTypeLabel(sale.saleType))}","${clean(sale.paymentMethod)}",${formatNumberWithPrecision(sale.subtotal)},${formatNumberWithPrecision(sale.discountAmount)},${formatNumberWithPrecision(sale.taxAmount)},${formatNumberWithPrecision(sale.total)}`;

      if (isAdminRole) {
        row += `,${formatNumberWithPrecision(totalCostLocal)},${formatNumberWithPrecision(sale.total - totalCostLocal)}`;
      }
      return row;
    }).join('\n');

    const fullCsv = csvHeader + csvData;
    const blob = new Blob(['\ufeff', fullCsv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sales-detailed-${formatAppDate(new Date(), state.settings.country)}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const saleTypeToggles = [
    { key: 'all', label: t("all_sales", "All Sales"), icon: <LayoutGrid className="h-4 w-4" /> },
    { key: 'retail', label: t("retail", "Retail"), icon: <Store className="h-4 w-4" />, enabled: retailEnabled },
    { key: 'wholesale', label: t("wholesale", "Wholesale"), icon: <Package className="h-4 w-4" />, enabled: wholesaleEnabled },
    { key: 'estore', label: t("estore", "E-Store"), icon: <Globe className="h-4 w-4" />, enabled: estoreEnabled },
  ].filter(t => t.key === 'all' || (t as any).enabled);

  return (
    <div className="main-content-scroll p-4 md:p-6 space-y-3">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2">
        <div className="flex items-center gap-4 shrink-0">
          <button
            type="button"
            onClick={() => navigate('/pos')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl text-gray-600 dark:text-gray-400 active:scale-95 transition-all flex items-center gap-1 mr-1"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="hidden sm:inline text-[10px] font-black uppercase tracking-widest">{t("back", "Back")}</span>
          </button>
          <div className="h-10 w-px bg-gray-200 dark:bg-white/10 mx-1 hidden sm:block" />
          <div className="h-14 w-14 bg-primary/10 rounded-2xl flex items-center justify-center shadow-inner border border-primary/10">
            <History className="h-7 w-7 text-primary" />
          </div>
          <div className="shrink-0 flex flex-col">
            <h1 className="text-2xl xl:text-3xl font-black text-gray-900 dark:text-white uppercase tracking-tighter leading-none">{t("sales", "Sales")}</h1>
            <p className="text-gray-600 dark:text-gray-400 text-[9px] font-black uppercase tracking-[0.2em] mt-2 opacity-60">
              {isSearchingRemote ? t("searching_all_records", "Searching all records...") : isCloudSearch ? `Showing ${state.sales.length} results` : `Management Hub • ${state.sales.length} Records`}
            </p>
          </div>
        </div>

        <button onClick={exportTransactions} className="btn btn-primary btn-md px-8 shadow-emerald-500/20">
          <Download className="h-4 w-4 mr-2" />
          <span>{t("export_csv", "Export CSV")}</span>
        </button>
      </div>

      {/* Dynamic Main Stats Grid */}
      <div className={`grid grid-cols-2 gap-4 ${
        activeCardsCount === 5 
          ? "sm:grid-cols-3 lg:grid-cols-5" 
          : activeCardsCount === 4 
            ? "sm:grid-cols-2 lg:grid-cols-4" 
            : "sm:grid-cols-3"
      }`}>
        {/* Total Revenue Card */}
        <div className="stat-card bg-gradient-to-br from-[#0EA5E9] to-[#0284C7]">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t("total_revenue", "Total Revenue")}</span>
            <span className="stat-card-value">{formatCurrency(totalRevenue, state.settings.currency)}</span>
          </div>
          <TrendingUp className="stat-card-icon h-12 w-12 text-white" />
        </div>

        {/* Retail Sales Card */}
        {showRetail && (
          <div className="stat-card bg-gradient-to-br from-[#10B981] to-[#059669]">
            <div className="stat-card-inner">
              <span className="stat-card-label">{t("retail_sales_title", "Retail Sales")}</span>
              <span className="stat-card-value">{formatCurrency(retailSalesTotal, state.settings.currency)}</span>
            </div>
            <Store className="stat-card-icon h-12 w-12 text-white" />
          </div>
        )}

        {/* Wholesale Sales Card */}
        {showWholesale && (
          <div className="stat-card bg-gradient-to-br from-[#3B82F6] to-[#1D4ED8]">
            <div className="stat-card-inner">
              <span className="stat-card-label">{t("wholesale_sales_title", "Wholesale Sales")}</span>
              <span className="stat-card-value">{formatCurrency(wholesaleSalesTotal, state.settings.currency)}</span>
            </div>
            <Package className="stat-card-icon h-12 w-12 text-white" />
          </div>
        )}

        {/* E-Store Sales Card */}
        {showEstore && (
          <div className="stat-card bg-gradient-to-br from-[#8B5CF6] to-[#5B21B6]">
            <div className="stat-card-inner">
              <span className="stat-card-label">{t("estore_sales_title", "E-Store Sales")}</span>
              <span className="stat-card-value">{formatCurrency(estoreSalesTotal, state.settings.currency)}</span>
            </div>
            <Globe className="stat-card-icon h-12 w-12 text-white" />
          </div>
        )}

        {/* Items Sold Card */}
        <div className="stat-card bg-gradient-to-br from-[#F97316] to-[#C2410C]">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t("items_sold", "Items Sold")}</span>
            <span className="stat-card-value">{totalItemsSold}</span>
          </div>
          <Package className="stat-card-icon h-12 w-12 text-white" />
        </div>
      </div>

      {/* Wallet Breakdown Section */}
      <div className="bg-white/50 dark:bg-black/20 p-4 rounded-[1.75rem] border border-gray-200/50 dark:border-white/5 shadow-xl space-y-3">
        <h3 className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
          <Wallet className="h-3.5 w-3.5 text-[#10B981]" />
          <span>{t("wallets_summary", "WALLETS & CASH FLOW BREAKDOWN")}</span>
        </h3>
        
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3">
          {/* Cash Wallet Card */}
          <div className="relative overflow-hidden bg-white dark:bg-[#1C1C1C] border border-gray-200 dark:border-white/5 rounded-2xl p-4 flex items-center justify-between transition-all hover:scale-[1.02] hover:border-primary/30 dark:hover:border-primary/30 shadow-sm">
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest leading-none">{t("cash", "Cash Wallet")}</span>
              <span className="text-base font-black text-primary dark:text-primary tabular-nums mt-1.5 leading-none">
                {formatCurrency(walletTotals.cash, state.settings.currency)}
              </span>
            </div>
            <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/10">
              <Banknote className="h-4 w-4 text-primary" />
            </div>
          </div>

          {/* Card Wallet Card */}
          <div className="relative overflow-hidden bg-white dark:bg-[#1C1C1C] border border-gray-200 dark:border-white/5 rounded-2xl p-4 flex items-center justify-between transition-all hover:scale-[1.02] hover:border-blue-500/30 dark:hover:border-blue-500/30 shadow-sm">
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest leading-none">{t("card", "Card Wallet")}</span>
              <span className="text-base font-black text-blue-600 dark:text-blue-500 tabular-nums mt-1.5 leading-none">
                {formatCurrency(walletTotals.card, state.settings.currency)}
              </span>
            </div>
            <div className="w-8 h-8 bg-blue-500/10 rounded-xl flex items-center justify-center border border-blue-500/10">
              <CreditCard className="h-4 w-4 text-blue-500" />
            </div>
          </div>

          {/* Digital / Bank Card */}
          <div className="relative overflow-hidden bg-white dark:bg-[#1C1C1C] border border-gray-200 dark:border-white/5 rounded-2xl p-4 flex items-center justify-between transition-all hover:scale-[1.02] hover:border-cyan-500/30 dark:hover:border-cyan-500/30 shadow-sm">
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest leading-none">{t("digital", "Bank Transfer")}</span>
              <span className="text-base font-black text-cyan-600 dark:text-cyan-500 tabular-nums mt-1.5 leading-none">
                {formatCurrency(walletTotals.digital, state.settings.currency)}
              </span>
            </div>
            <div className="w-8 h-8 bg-cyan-500/10 rounded-xl flex items-center justify-center border border-cyan-500/10">
              <Building2 className="h-4 w-4 text-cyan-500" />
            </div>
          </div>

          {/* Credit Ledger Card */}
          <div className="relative overflow-hidden bg-white dark:bg-[#1C1C1C] border border-gray-200 dark:border-white/5 rounded-2xl p-4 flex items-center justify-between transition-all hover:scale-[1.02] hover:border-rose-500/30 dark:hover:border-rose-500/30 shadow-sm">
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest leading-none">{t("credit", "Credit Ledger")}</span>
              <span className="text-base font-black text-rose-600 dark:text-rose-500 tabular-nums mt-1.5 leading-none">
                {formatCurrency(walletTotals.credit, state.settings.currency)}
              </span>
            </div>
            <div className="w-8 h-8 bg-rose-500/10 rounded-xl flex items-center justify-center border border-rose-500/10">
              <FileText className="h-4 w-4 text-rose-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white/50 dark:bg-black/20 p-3 lg:p-4 rounded-[1.75rem] border border-gray-200/50 dark:border-white/5 shadow-xl">
        <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 h-4 w-4" />
            <input
              type="text"
              placeholder={t("search_sales_placeholder", "Search sales...")}
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-full bg-gray-50 dark:bg-black/30 border-none pl-11 pr-4 py-3 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-emerald-500 transition-all shadow-inner"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="grid grid-cols-2 lg:flex items-center gap-2 w-full lg:w-auto">
              <SearchableSelect
                label={t("sale_type", "SALE TYPE")}
                options={saleTypeToggles.map(t => ({ id: t.key, label: t.label }))}
                value={saleTypeFilter}
                onChange={(val: any) => { setSaleTypeFilter(val); setCurrentPage(1); }}
                icon={LayoutGrid}
              />
            </div>
            <div className="grid grid-cols-2 lg:flex items-center gap-2 w-full lg:w-auto">
              <SearchableSelect
                options={[
                  { id: 'all', label: t("payment_all", "Payment: All") },
                  { id: 'cash', label: t("cash", "Cash") },
                  { id: 'card', label: t("card", "Card") },
                  { id: 'digital', label: t("digital", "Bank Transfer") },
                  { id: 'credit', label: t("credit", "Credit Debt") }
                ]}
                value={paymentFilter}
                onChange={val => { setPaymentFilter(val); setCurrentPage(1); }}
                placeholder={t("payment", "Payment")}
              />
              <SearchableSelect
                options={cashiersList.map(c => ({ id: c, label: c === 'all' ? t("cashier_all", "Cashier: All") : c.toUpperCase() }))}
                value={selectedCashier}
                onChange={val => { setSelectedCashier(val); setCurrentPage(1); }}
                placeholder={t("cashier", "Cashier")}
                icon={User}
                align="right"
              />
              <SearchableSelect
                options={[
                  { id: 'today', label: t("today_caps", "TODAY") },
                  { id: 'yesterday', label: t("yesterday_caps", "YESTERDAY") },
                  { id: 'last7', label: t("last7_caps", "LAST 7 DAYS") },
                  { id: 'thisMonth', label: t("this_month_caps", "THIS MONTH") },
                  { id: 'lastMonth', label: t("last_month_caps", "PREVIOUS MONTH") },
                  { id: 'custom', label: t("custom_range_caps", "CUSTOM RANGE") },
                  { id: 'all', label: t("all_time_caps", "ALL TIME") }
                ]}
                value={dateFilter}
                onChange={val => { setDateFilter(val); setCurrentPage(1); }}
                placeholder={t("select_date", "Select Date")}
                align="right"
              />
              {dateFilter === 'custom' && (
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center p-2 bg-white/50 dark:bg-black/20 rounded-xl animate-in slide-in-from-top-2 w-full lg:w-auto">
                  <input
                    type="date"
                    value={startDateInput}
                    onChange={(e) => { setStartDateInput(e.target.value); setCurrentPage(1); }}
                    className="w-full sm:w-32 px-3 py-2 text-[10px] font-black bg-white dark:bg-zinc-800 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white uppercase shadow-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                  <span className="hidden sm:block text-[10px] font-black text-gray-600 uppercase tracking-tighter">{t("to", "to")}</span>
                  <input
                    type="date"
                    value={endDateInput}
                    onChange={(e) => { setEndDateInput(e.target.value); setCurrentPage(1); }}
                    className="w-full sm:w-32 px-3 py-2 text-[10px] font-black bg-white dark:bg-zinc-800 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white uppercase shadow-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              )}

            </div>
          </div>
        </div>
      </div>

      {/* Transactions List */}
      <div className="bg-white dark:bg-surface rounded-2xl border border-gray-200 dark:border-white/5 shadow-sm overflow-hidden">
        {/* Desktop View */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="table w-full">
            <thead className="bg-gray-50 dark:bg-white/5">
              <tr>
                <th className="px-4 py-3 text-left text-[10px] font-black text-gray-700 dark:text-gray-400 uppercase tracking-widest">{t("receipt", "Receipt")}</th>
                <th className="px-4 py-3 text-left text-[10px] font-black text-gray-700 dark:text-gray-400 uppercase tracking-widest">{t("date", "Date")}</th>
                <th className="px-4 py-3 text-left text-[10px] font-black text-gray-700 dark:text-gray-400 uppercase tracking-widest">{t("customer", "Customer")}</th>
                <th className="px-4 py-3 text-left text-[10px] font-black text-gray-700 dark:text-gray-400 uppercase tracking-widest">{t("total", "Total")}</th>
                <th className="px-4 py-3 text-left text-[10px] font-black text-gray-700 dark:text-gray-400 uppercase tracking-widest">{t("status", "Status")}</th>
                <th className="px-4 py-3 text-right text-[10px] font-black text-gray-700 dark:text-gray-400 uppercase tracking-widest">{t("actions", "Action")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
              {paginatedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400 text-[10px] font-black uppercase tracking-widest">
                    {isSearchingRemote ? t("searching_all_records", "Searching all records...") : t("no_sales_found", "No sales found for this filter.")}
                  </td>
                </tr>
              ) : paginatedTransactions.map(tx => (
                <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors border-b border-gray-200 dark:border-white/5">
                  <td className="px-4 py-3">
                    <div className="text-sm font-black text-gray-900 dark:text-white">#{tx.invoiceNumber || tx.receiptNumber}</div>
                    {tx.dcNumber && (
                      <div className="flex items-center gap-1 mt-1 text-[8px] font-black text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded-full w-fit uppercase tracking-tighter">
                        <Hash className="w-2 h-2" /> DC: {tx.dcNumber}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-bold text-gray-800 dark:text-gray-200">{formatAppDate(tx.timestamp, state.settings.country)}</div>
                    <div className="text-[10px] text-gray-600 dark:text-gray-400 font-bold">{formatAppTime(tx.timestamp, state.settings.country, false)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-gray-700 dark:text-gray-300">
                    <div>{tx.customerName || t("walk_in", "Walk-in")}</div>
                    {tx.cashier && <div className="text-[9px] font-bold text-primary uppercase mt-0.5">{t("by", "By")} {tx.cashier}</div>}
                  </td>
                  <td className="px-4 py-3 text-sm font-black text-primary dark:text-emerald-400">
                    <div>{formatCurrency(tx.total, state.settings.currency)}</div>
                    {tx.refundedAmount > 0 && (
                      <div className="text-[9px] font-bold text-rose-500 mt-0.5">
                        -{formatCurrency(tx.refundedAmount, state.settings.currency)} {tx.status === 'partially_refunded' ? 'Refunded' : ''}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full ${getStatusColor(tx.status)}`}>
                      {tx.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right flex items-center justify-end gap-2">
                    <button onClick={() => setSelectedTransaction(tx)} className="p-1.5 text-primary hover:bg-emerald-50 dark:hover:bg-primary/10 rounded-lg transition-colors" title="View Detail"><Eye className="h-4 w-4" /></button>
                    <button onClick={() => setReprintSale(tx)} className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-colors" title="Quick Print"><Printer className="h-4 w-4" /></button>
                    {canEditSale && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          const res = await sonner.confirm('Edit Sale?', 'Load items and notes to cart for editing?', 'Yes');
                          if (res.isConfirmed) {
                            try {
                              dispatch({ type: 'CLEAR_CART' });
                              tx.items.forEach(item => dispatch({ type: 'ADD_TO_CART', payload: item }));
                              dispatch({ type: 'SET_NOTES', payload: tx.notes || '' });
                              dispatch({ type: 'SET_EDITING_SALE_ID', payload: tx.id });

                              if (tx.customerId) {
                                const customer = state.customers.find(c => c.id === tx.customerId);
                                if (customer) dispatch({ type: 'SET_SELECTED_CUSTOMER', payload: customer });
                              }

                              sonner.success('Loaded to POS for editing.');
                              navigate('/pos');
                            } catch { sonner.error('Error.'); }
                          }
                        }}
                        className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                        title="Edit Sale"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                    )}
                    {canDeleteSale && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          const res = await sonner.confirm('Delete Sale?', 'Revert all records?', 'Delete');
                          if (res.isConfirmed) {
                            try {
                              await salesService.delete(tx.id, profile?.name || 'Admin');
                              dispatch({ type: 'DELETE_SALE', payload: tx.id });
                              sonner.success('Deleted.');
                            } catch { sonner.error('Error.'); }
                          }
                        }}
                        className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Delete Permanently"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="lg:hidden p-3 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {paginatedTransactions.length === 0 ? (
            <div className="col-span-full py-8 text-center text-gray-500 dark:text-gray-400 text-[10px] font-black uppercase tracking-widest">
              {isSearchingRemote ? "Searching all records..." : "No sales found for this filter."}
            </div>
          ) : paginatedTransactions.map(tx => (
            <div key={tx.id} onClick={() => setSelectedTransaction(tx)} className="p-3 rounded-[1.5rem] bg-white dark:bg-surface border border-gray-200 dark:border-white/5 shadow-sm active:scale-[0.98] transition-all">
              <div className="flex justify-between items-start gap-1">
                <p className="text-[8px] font-black text-gray-600 dark:text-gray-400 uppercase mb-1">#{tx.invoiceNumber || tx.receiptNumber}</p>
                {tx.status !== 'completed' && tx.status !== 'credit' && (
                  <span className={`text-[7px] font-bold px-1 py-0.5 rounded-md uppercase ${getStatusColor(tx.status)}`}>
                    {tx.status}
                  </span>
                )}
              </div>
              <h3 className="text-[10px] font-black text-gray-900 dark:text-white uppercase truncate mb-2">{tx.customerName || t("walk_in", "Walk-in")}</h3>
              <div className="flex flex-col">
                <span className={`text-[11px] font-black text-primary dark:text-primary ${tx.refundedAmount > 0 ? 'line-through text-gray-400 text-[10px]' : ''}`}>
                  {formatCurrency(tx.total, state.settings.currency)}
                </span>
                {tx.refundedAmount > 0 && (
                  <span className="text-[11px] font-black text-rose-500 leading-none mt-0.5">
                    {formatCurrency(tx.total - tx.refundedAmount, state.settings.currency)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        <div className="px-4 py-3 bg-gray-50/50 dark:bg-white/[0.02] border-t border-gray-200 dark:border-white/5 flex items-center justify-between">
          <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-40 transition-colors">{t("prev", "Prev")}</button>
          <span className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase">{t("page", "Page")} {currentPage} {t("of", "of")} {totalPages}</span>
          <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-40 transition-colors">{t("next", "Next")}</button>
        </div>
      </div>

      {/* Modals */}
      {selectedTransaction && (
        <TransactionDetailModal
          transaction={selectedTransaction}
          allTransactions={filteredTransactions}
          onNavigate={setSelectedTransaction}
          onClose={() => setSelectedTransaction(null)}
          onReprint={sale => setReprintSale(sale)}
        />
      )}
      {reprintSale && <ReceiptPrint sale={reprintSale} onClose={() => setReprintSale(null)} />}
    </div>
  );
}

// ── Transaction Detail Modal ──────────────────────

interface TransactionDetailModalProps {
  transaction: Sale;
  allTransactions: Sale[];
  onNavigate: (sale: Sale) => void;
  onClose: () => void;
  onReprint: (sale: Sale) => void;
}

function TransactionDetailModal({ transaction, allTransactions, onNavigate, onClose, onReprint }: TransactionDetailModalProps) {
  const detailNavigate = useNavigate();
  const { state, dispatch } = useApp();
  const { t } = useTranslation();
  const { profile } = useAuth();
  const showDiscount = state.settings.receiptShowDiscount !== false && 
    !(transaction.items || []).some((item: any) => item.bundleHideItemPrices === true || item.bundle_hide_item_prices === true);
  const [showCheckout, setShowCheckout] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const isAdmin = profile?.role === 'admin';

  const currentIndex = allTransactions.findIndex(tx => tx.id === transaction.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < allTransactions.length - 1;

  const handlePrev = () => hasPrev && onNavigate(allTransactions[currentIndex - 1]);
  const handleNext = () => hasNext && onNavigate(allTransactions[currentIndex + 1]);

  const canEditSale = isAdmin || (profile?.role === 'manager' && profile?.canEditSale);
  const canDeleteSale = isAdmin || (profile?.role === 'manager' && profile?.canDeleteSale);
  const canRefundSale = isAdmin || (profile?.role === 'manager' && profile?.canEditSale); // Assuming Refund follows Edit permission

  const handleEditSale = async () => {
    if (!canEditSale) return;
    const result = await sonner.confirm('Edit Sale?', 'Load items and notes to cart for editing?', 'Yes');
    if (!result.isConfirmed) return;
    setIsReconciling(true);
    try {
      dispatch({ type: 'CLEAR_CART' });
      transaction.items.forEach(item => dispatch({ type: 'ADD_TO_CART', payload: item }));
      dispatch({ type: 'SET_NOTES', payload: transaction.notes || '' });
      dispatch({ type: 'SET_EDITING_SALE_ID', payload: transaction.id });

      if (transaction.customerId) {
        const customer = state.customers.find(c => c.id === transaction.customerId);
        if (customer) dispatch({ type: 'SET_SELECTED_CUSTOMER', payload: customer });
      }

      sonner.success('Loaded to POS for editing.');
      onClose();
      detailNavigate('/pos');
    } catch {
      sonner.error('Error editing sale.');
    } finally {
      setIsReconciling(false);
    }
  };

  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);

  const handleRefundSale = () => {
    if (!canRefundSale) return;
    if (transaction.status === 'refunded') {
      sonner.error('Sale is already fully refunded.');
      return;
    }
    setIsRefundModalOpen(true);
  };

  const executeRefund = async (request: RefundRequest) => {
    setIsReconciling(true);
    try {
      // 1. Process refund in service (handles stock reversal)
      await salesService.returnSale(transaction.id, request, profile?.name || 'Cashier');

      // 2. Update local state
      const updatedTx: Sale = {
        ...transaction,
        status: request.type === 'full' ? 'refunded' : 'partially_refunded',
        refundedAmount: (transaction.refundedAmount || 0) + request.totalRefundAmount,
        items: transaction.items.map((item: any, idx: number) => {
          if (request.type === 'full') {
            return {
              ...item,
              refundedQuantity: item.quantity
            };
          } else {
            const reqItem = request.items.find((ri: any) => ri.index === idx);
            if (reqItem) {
              return {
                ...item,
                refundedQuantity: (item.refundedQuantity || 0) + reqItem.qty
              };
            }
          }
          return item;
        })
      };

      dispatch({
        type: 'UPDATE_SALE',
        payload: updatedTx
      });

      // Update parent component selectedTransaction state to trigger dynamic re-render inside this modal!
      onNavigate(updatedTx);

      sonner.success('Sale successfully refunded.');
      setIsRefundModalOpen(false);
    } catch (error) {
      console.error('[RefundError]', error);
      sonner.error('Error refunding sale.');
    } finally {
      setIsReconciling(false);
    }
  };

  const handleWhatsAppShare = () => {
    const customer = state.customers.find(c => c.id === transaction.customerId);
    const phone = customer?.phone || '';
    if (!phone) { sonner.error('No phone number.'); return; }
    let fp = phone.replace(/\D/g, '');
    if (fp.startsWith('0')) fp = '92' + fp.substring(1);
    const msg = `🧾 *Invoice*\nTotal: ${formatCurrency(transaction.total, state.settings.currency)}`;
    window.open(`https://wa.me/${fp}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const handleDeleteSale = async () => {
    if (!canDeleteSale) return;
    const result = await sonner.confirm(
      'PERMANENT DELETE?',
      'All records (Stock, Reports, Inventory) will be REVERTED. This cannot be undone!',
      'Yes, Delete'
    );
    if (!result.isConfirmed) return;

    setIsReconciling(true);
    try {
      await salesService.delete(transaction.id, profile?.name || 'Admin');
      dispatch({ type: 'DELETE_SALE', payload: transaction.id });
      sonner.success('Sale permanently deleted and records reverted.');
      onClose();
    } catch (err) {
      console.error('[DeleteError]', err);
      sonner.error('Error deleting sale.');
    } finally {
      setIsReconciling(false);
    }
  };


  const groupItems = (items: any[]) => {
    const bundlesMap = new Map<string, any>();
    const standaloneItems: any[] = [];

    items.forEach(item => {
      const bundleId = item.bundleId || item.bundle_id;
      const bundleName = item.bundleName || item.bundle_name;

      if (bundleId) {
        if (!bundlesMap.has(bundleId)) {
          bundlesMap.set(bundleId, {
            bundleId,
            bundleName,
            items: [],
            totalOriginal: 0,
            totalDiscount: 0,
            totalSubtotal: 0
          });
        }
        const b = bundlesMap.get(bundleId)!;
        b.items.push(item);
        const itemPrice = item.product?.price || ((item.subtotal + item.discount) / (item.quantity || 1));
        const original = itemPrice * item.quantity;
        b.totalOriginal += original;
        b.totalDiscount += (item.discount || 0);
        b.totalSubtotal += (item.subtotal || 0);
      } else {
        standaloneItems.push(item);
      }
    });

    return {
      bundles: Array.from(bundlesMap.values()),
      standaloneItems
    };
  };

  return (
    <>
      <Modal
        isOpen={true}
        onClose={onClose}
        title={t("sale_breakdown", "Sale Breakdown")}
        showClose={true}
        maxWidth="lg"
        footer={
          <div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button onClick={handlePrev} disabled={!hasPrev} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-3 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-white/10 rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest disabled:opacity-30 active:scale-95 transition-all">
                <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span>{t("prev", "Prev")}</span>
              </button>
              <button onClick={handleNext} disabled={!hasNext} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-3 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-white/10 rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest disabled:opacity-30 active:scale-95 transition-all">
                <span>{t("next_sale", "Next Sale")}</span> <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full mt-1.5 sm:mt-2">
              <button onClick={() => onReprint(transaction)} className="flex-1 min-w-[calc(50%-4px)] sm:min-w-0 sm:flex-1 flex items-center justify-center gap-1.5 px-2.5 sm:px-3 md:px-5 py-2.5 sm:py-3 bg-primary text-white rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-wider md:tracking-widest active:scale-95 transition-all">
                <Printer className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" /> <span className="truncate">{t("print_receipt", "Print")}</span>
              </button>
              <button onClick={handleWhatsAppShare} className="flex-1 min-w-[calc(50%-4px)] sm:min-w-0 sm:flex-1 flex items-center justify-center gap-1.5 px-2.5 sm:px-3 md:px-5 py-2.5 sm:py-3 bg-emerald-50 dark:bg-emerald-900/10 text-primary rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-wider md:tracking-widest active:scale-95 transition-all">
                <MessageCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" /> <span className="truncate">{t("whatsapp", "WhatsApp")}</span>
              </button>
              <button
                onClick={handleRefundSale}
                disabled={isReconciling || transaction.status === 'refunded'}
                className="flex-1 min-w-[calc(50%-4px)] sm:min-w-0 sm:flex-1 flex items-center justify-center gap-1.5 px-2.5 sm:px-3 md:px-5 py-2.5 sm:py-3 bg-rose-50 dark:bg-rose-900/10 text-rose-600 rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-wider md:tracking-widest active:scale-95 transition-all disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" /> <span className="truncate">{t("refund", "Refund")}</span>
              </button>
              {(isAdmin || profile?.canEditSale) && (
                <button onClick={handleEditSale} disabled={isReconciling} className="flex-1 min-w-[calc(50%-4px)] sm:min-w-0 sm:flex-1 flex items-center justify-center gap-1.5 px-2.5 sm:px-3 md:px-5 py-2.5 sm:py-3 bg-amber-50 dark:bg-amber-900/10 text-amber-600 rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-wider md:tracking-widest active:scale-95 transition-all disabled:opacity-50">
                  <Edit className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" /> <span className="truncate">{t("edit", "Edit")}</span>
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={handleDeleteSale}
                  disabled={isReconciling}
                  className="flex-1 min-w-full sm:min-w-0 sm:flex-1 flex items-center justify-center gap-1.5 px-2.5 sm:px-3 md:px-5 py-2.5 sm:py-3 bg-rose-500 text-white rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-wider md:tracking-widest active:scale-95 transition-all disabled:opacity-50 shadow-lg shadow-rose-500/20"
                >
                  <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" /> <span className="truncate">{t("delete", "Delete")}</span>
                </button>
              )}
            </div>
          </div>
        }
      >
        {/* Modal body... */}
        <div className="space-y-4">
          {transaction.status === 'refunded' && (
            <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 p-3 rounded-2xl text-xs font-black text-center uppercase tracking-widest flex items-center justify-center gap-2">
              <RotateCcw className="h-4 w-4 shrink-0" />
              <span>This sale is fully refunded</span>
            </div>
          )}
          {transaction.status === 'partially_refunded' && (
            <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-400 p-3 rounded-2xl text-xs font-black text-center uppercase tracking-widest flex items-center justify-center gap-2">
              <RotateCcw className="h-4 w-4 shrink-0" />
              <span>This sale is partially refunded</span>
            </div>
          )}
          <div className="flex items-center justify-center mb-0">
            <span className="text-[9px] font-black bg-primary/10 text-primary dark:text-emerald-400 px-2 py-0.5 rounded-full uppercase tracking-widest">
              {getDealCountBreakdown(transaction.items, state.bundles).label}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 dark:bg-white/[0.02] rounded-2xl border border-gray-200 dark:border-white/5">
            <div><p className="text-[8px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest">{t("receipt", "Receipt")}</p><p className="text-[11px] font-black text-gray-900 dark:text-white uppercase">#{transaction.invoiceNumber || transaction.receiptNumber}</p></div>
            <div><p className="text-[8px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest">{t("date", "Date")}</p><p className="text-[11px] font-black text-gray-900 dark:text-white uppercase">{formatAppDate(transaction.timestamp, state.settings.country)}</p></div>
            <div><p className="text-[8px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest">{t("customer", "Customer")}</p><p className="text-[11px] font-black text-gray-900 dark:text-white uppercase">{transaction.customerName || t("walk_in", "Walk-in")}</p></div>
            <div><p className="text-[8px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest">{t("cashier", "Cashier")}</p><p className="text-[11px] font-black text-gray-900 dark:text-white uppercase">{transaction.cashier || 'System'}</p></div>
            {transaction.dcNumber && (
              <div className="col-span-2"><p className="text-[8px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">{t("dc_number", "DC Number")}</p><p className="text-[11px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-tight tabular-nums">#{transaction.dcNumber}</p></div>
            )}
            {transaction.deliveryLocationLat && transaction.deliveryLocationLng && (
              <div className="col-span-2 mt-1">
                <a 
                  href={`https://maps.google.com/?q=${transaction.deliveryLocationLat},${transaction.deliveryLocationLng}`}
                  target="_blank"
                  rel="noopener noreferrer" 
                  className="flex items-center justify-center gap-2 w-full py-2.5 bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-emerald-100 dark:border-emerald-900/30"
                >
                  <MapPin className="w-3.5 h-3.5 shrink-0" /> {t("view_location", "View Delivery Location")}
                </a>
              </div>
            )}
          </div>

          <div className="border border-gray-200 dark:border-white/5 rounded-[2rem] overflow-x-auto custom-scrollbar">
            <table className="min-w-full divide-y divide-gray-100 dark:divide-white/5">
              <thead className="bg-gray-50 dark:bg-white/[0.02]">
                <tr>
                  <th className="px-2.5 sm:px-4 py-2.5 sm:py-3 text-[10px] font-black text-gray-600 uppercase text-left whitespace-nowrap">{t("item", "Item")}</th>
                  <th className="px-2.5 sm:px-4 py-2.5 sm:py-3 text-[10px] font-black text-gray-600 uppercase text-right whitespace-nowrap">{t("qty", "Qty")}</th>
                  <th className="px-2.5 sm:px-4 py-2.5 sm:py-3 text-[10px] font-black text-gray-600 uppercase text-right whitespace-nowrap">{t("total", "Total")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {(() => {
                  const { bundles, standaloneItems } = groupItems(transaction.items);
                  const rows: React.ReactNode[] = [];
                  const canEditProducts = isAdmin || profile?.role === 'manager' || profile?.canManagePO;

                  if (bundles.length > 0) {
                    rows.push(
                      <tr key="section-bundles" className="bg-violet-500/[0.03]">
                        <td colSpan={3} className="px-2.5 sm:px-4 py-2">
                          <div className="flex items-center gap-1.5">
                            <Gift className="h-3 w-3 text-violet-500 shrink-0" />
                            <span className="text-[8px] font-black text-violet-600 dark:text-violet-400 uppercase tracking-widest">
                              {t('combo_deals_sec', 'Bundle / Deal Items')} ({bundles.length})
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  bundles.forEach((b, bIdx) => {
                    const hideItemPrices = b.items.some((item: any) => item.bundleHideItemPrices === true || item.bundle_hide_item_prices === true);
                    const bundleImage = b.items[0]?.product?.image || null;
                    const discountStr = showDiscount && b.totalDiscount > 0 ? `-${formatCurrency(b.totalDiscount, state.settings.currency)}` : undefined;
                    let bundleQty = 1;
                    const bundleDef = state.bundles?.find((x: any) => x.id === b.bundleId);
                    if (bundleDef && bundleDef.items && bundleDef.items.length > 0) {
                      const firstBi = bundleDef.items[0];
                      const cartItem = b.items.find((x: any) => x.product?.id === firstBi.productId);
                      if (cartItem) {
                        bundleQty = Math.round(cartItem.quantity / firstBi.quantity);
                      }
                    } else if (b.items.length > 0) {
                      bundleQty = b.items[0].quantity;
                    }

                    rows.push(
                      <tr key={`bundle-${b.bundleId}`} className="bg-violet-500/[0.02] border-t border-gray-100 dark:border-white/5">
                        <td className="px-2.5 sm:px-4 py-2">
                          <div className="flex items-center gap-1.5">
                            <div className="w-7 h-7 rounded-md overflow-hidden bg-violet-100 dark:bg-violet-900/20 shrink-0 flex items-center justify-center">
                              {bundleImage ? (
                                <img src={bundleImage} alt={b.bundleName} className="w-full h-full object-cover" />
                              ) : (
                                <Package className="h-3 w-3 text-violet-400" />
                              )}
                            </div>
                            <span className="text-[9px] font-black text-violet-700 dark:text-violet-300 uppercase truncate">{b.bundleName}</span>
                          </div>
                        </td>
                        <td className="px-2.5 sm:px-4 py-2 text-right text-[9px] font-bold text-gray-500">{bundleQty}</td>
                        <td className="px-2.5 sm:px-4 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-[10px] font-black text-primary">{formatCurrency(b.totalSubtotal, state.settings.currency)}</span>
                            {discountStr && <span className="text-[7px] font-black text-rose-500">{discountStr}</span>}
                          </div>
                        </td>
                      </tr>
                    );

                    b.items.forEach((item: any, itemIdx: number) => {
                      rows.push(
                        <tr
                          key={`bundle-${b.bundleId}-item-${itemIdx}`}
                          onClick={() => {
                            if (item.product?.id) {
                              detailNavigate('/inventory/products', { state: { productId: item.product.id, fromSale: transaction.id } });
                              onClose();
                            }
                          }}
                          className={`${item.product?.id ? 'cursor-pointer hover:bg-violet-500/[0.03] dark:hover:bg-violet-500/[0.03] transition-colors group' : ''} bg-violet-500/[0.005] border-t border-gray-100/50 dark:border-white/5`}
                        >
                          <td className={`pl-10 pr-4 py-1.5 text-[9px] text-gray-600 dark:text-gray-400 uppercase ${item.product?.id ? 'group-hover:text-primary' : ''}`}>
                            <span className="font-bold">- {item.product?.name || 'Item'}</span>
                            {item.selectedVariant && <span className="text-[8px] text-gray-400"> ({item.selectedVariant})</span>}
                          </td>
                          <td className="px-2.5 sm:px-4 py-1.5 text-right text-[9px] font-bold text-gray-500">
                            <div>{item.quantity}</div>
                            {item.refundedQuantity > 0 && (
                              <div className="text-[7px] font-black text-rose-500 uppercase tracking-tight mt-0.5 leading-none">
                                {item.refundedQuantity} {t("returned_caps", "Returned")}
                              </div>
                            )}
                          </td>
                          <td className="px-2.5 sm:px-4 py-1.5 text-right text-[9px] text-gray-400">
                            {!hideItemPrices && formatCurrency(item.product?.price * item.quantity, state.settings.currency)}
                          </td>
                        </tr>
                      );
                    });
                  });

                  if (bundles.length > 0 && standaloneItems.length > 0) {
                    rows.push(
                      <tr key="section-standalone" className="bg-gray-50/50 dark:bg-white/[0.02]">
                        <td colSpan={3} className="px-2.5 sm:px-4 py-2 border-t border-gray-100 dark:border-white/5">
                          <div className="flex items-center gap-1.5">
                            <ShoppingBag className="h-3 w-3 text-gray-400 shrink-0" />
                            <span className="text-[8px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                              {t('standalone_items_sec', 'Other / Standalone Items')} ({standaloneItems.length})
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  standaloneItems.forEach((item, index) => {
                    rows.push(
                        <tr
                          key={`standalone-${index}`}
                          onClick={() => {
                            if (item.product?.id) {
                              detailNavigate('/inventory/products', { state: { productId: item.product.id, fromSale: transaction.id } });
                              onClose();
                            }
                          }}
                          className={item.product?.id ? "cursor-pointer hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors group" : ""}
                      >
                        <td className={`px-2.5 sm:px-4 py-3 sm:py-4 text-[11px] font-black text-gray-900 dark:text-white uppercase transition-colors ${item.product?.id ? 'group-hover:text-primary' : ''}`}>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-md overflow-hidden bg-gray-100 dark:bg-white/5 shrink-0 flex items-center justify-center">
                              {item.product?.image ? (
                                <img src={item.product.image} alt={item.product.name} className="w-full h-full object-cover" />
                              ) : (
                                <Package className="h-3 w-3 text-gray-400" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <span className="truncate block">{item.product?.name || t("item", "Item")}</span>
                              {(item.selectedVariant || (item.selectedModifiers && item.selectedModifiers.length > 0) || item.serialNumber) && (
                                <div className="flex flex-col gap-0.5 mt-0.5 normal-case tracking-normal">
                                  {item.selectedVariant && <span className="text-[8px] font-bold text-gray-500">{item.selectedVariant}</span>}
                                  {item.selectedModifiers && item.selectedModifiers.length > 0 && <span className="text-[8px] font-bold text-primary">+ {item.selectedModifiers.map((m: any) => m.name).join(', ')}</span>}
                                  {item.serialNumber && <span className="text-[8px] font-bold text-amber-500">SN: {item.serialNumber}</span>}
                                </div>
                              )}
                              {showDiscount && item.discount > 0 && (
                                <div className="flex items-center gap-1 text-[7px] text-rose-500 font-black mt-1 uppercase tracking-widest bg-rose-50 dark:bg-rose-500/10 px-1.5 py-0.5 rounded-md border border-rose-100 dark:border-rose-500/20">
                                  <Gift className="w-2 h-2" />
                                  <span>Discount</span>
                                  <span>{item.discountType === 'percentage' && item.discountValue ? `(${item.discountValue}%)` : ''}</span>
                                  <span>-{formatCurrency(item.discount, state.settings.currency)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-2.5 sm:px-4 py-3 sm:py-4 text-right text-[11px] font-bold text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          <div>{item.quantity}</div>
                          {item.refundedQuantity > 0 && (
                            <div className="text-[8px] font-black text-rose-500 uppercase tracking-tight mt-0.5 leading-none">
                              {item.refundedQuantity} {t("returned_caps", "Returned")}
                            </div>
                          )}
                        </td>
                        <td className="px-2.5 sm:px-4 py-3 sm:py-4 text-right text-[11px] font-black text-gray-900 dark:text-white whitespace-nowrap">{formatCurrency(item.subtotal, state.settings.currency)}</td>
                      </tr>
                    );
                  });

                  return rows;
                })()}
              </tbody>
            </table>
          </div>

          <div className="p-4 bg-gray-50 dark:bg-white/[0.03] rounded-2xl space-y-2">
            {transaction.notes && (
              <div className="pb-2 mb-2 border-b border-gray-200 dark:border-white/10">
                <p className="text-[8px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest mb-1">{t("memo", "Internal Memo")}</p>
                <p className="text-[10px] font-bold text-gray-700 dark:text-gray-300 italic">"{transaction.notes}"</p>
              </div>
            )}

            {transaction.splitPayments && transaction.splitPayments.length > 0 && (
              <div className="pb-2 mb-2 border-b border-gray-200 dark:border-white/10">
                <p className="text-[8px] font-black text-primary uppercase tracking-widest mb-1.5 flex items-center gap-1"><Layers className="w-2.5 h-2.5" /> {t("split_payment_breakdown", "Split Payment Breakdown")}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {transaction.splitPayments.map((p: any, i: number) => (
                    <div key={i} className="flex justify-between items-center text-[9px] font-black uppercase">
                      <span className="text-gray-500">{t(p.method, p.method)}</span>
                      <span className="text-gray-700 dark:text-gray-300">{formatCurrency(p.amount, state.settings.currency)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {showDiscount && (
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-gray-600">
                <span>{t("subtotal", "Subtotal")}</span>
                <span className="text-gray-900 dark:text-white tabular-nums">{formatCurrency(transaction.subtotal, state.settings.currency)}</span>
              </div>
            )}

            {showDiscount && transaction.discountAmount > 0 && (
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-rose-500">
                <span className="flex items-center gap-1"><Gift className="w-3 h-3" /> {t("discount", "Discount")}</span>
                <span className="tabular-nums">-{formatCurrency(transaction.discountAmount, state.settings.currency)}</span>
              </div>
            )}
            {transaction.taxAmount > 0 && (
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-gray-600">
                <span>{t("tax", "Tax")}</span>
                <span className="text-gray-900 dark:text-white tabular-nums">+{formatCurrency(transaction.taxAmount, state.settings.currency)}</span>
              </div>
            )}

            {transaction.extraCharges && transaction.extraCharges.length > 0 && transaction.extraCharges.map((charge: any, idx: number) => (
              <div key={idx} className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-blue-600">
                <span>{charge.name || t("other_amount", "Extra Charge")}</span>
                <span className="tabular-nums">+{formatCurrency(charge.amount, state.settings.currency)}</span>
              </div>
            ))}

            {transaction.refundedAmount > 0 && (
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-rose-500">
                <span>Refunded Amount</span>
                <span className="tabular-nums">-{formatCurrency(transaction.refundedAmount, state.settings.currency)}</span>
              </div>
            )}

            <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-white/10">
              <span className="text-xs font-black uppercase tracking-widest text-gray-900 dark:text-white">{t("net_total", "Net Total")}</span>
              <div className="flex flex-col items-end">
                <span className={`text-xs tabular-nums ${transaction.refundedAmount > 0 ? 'line-through text-gray-400 font-bold' : 'text-lg font-black text-primary'}`}>
                  {formatCurrency(transaction.total, state.settings.currency)}
                </span>
                {transaction.refundedAmount > 0 && (
                  <span className="text-lg font-black text-primary tabular-nums leading-none mt-0.5">
                    {formatCurrency(transaction.total - transaction.refundedAmount, state.settings.currency)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {showCheckout && (
        <CheckoutModal
          onClose={() => setShowCheckout(false)}
          onComplete={async () => {
            if (transaction.id) {
              await salesService.delete(transaction.id);
              dispatch({ type: 'DELETE_SALE', payload: transaction.id });
            }
            // Note: setShowCheckout(false) and onClose() are now handled by the modal's 
            // internal onClose lifecycle after the receipt is processed.
          }}
        />
      )}

      {isRefundModalOpen && (
        <RefundSaleModal
          isOpen={isRefundModalOpen}
          onClose={() => setIsRefundModalOpen(false)}
          sale={transaction}
          onConfirmRefund={executeRefund}
          isProcessing={isReconciling}
        />
      )}
    </>
  );
}