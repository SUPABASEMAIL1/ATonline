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
import { TransactionDetailModal } from './TransactionDetailModal';
import RefundSaleModal from './RefundSaleModal';
import { RefundRequest } from '../../types';


const isDraftSale = (sale: Sale) =>
  (sale.invoiceNumber && sale.invoiceNumber.startsWith('DRAFT-')) ||
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

