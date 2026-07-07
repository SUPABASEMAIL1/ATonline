import { useState, useMemo } from 'react';
import { Plus, Search, Edit, Trash2, User, Mail, Phone, CreditCard, Eye, MessageCircle, Building2, Users, ChevronLeft, ChevronRight, Receipt, AlertTriangle } from 'lucide-react';
import { subDays, startOfDay, endOfDay, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { Customer } from '../../types';
import { useApp } from '../../context/SupabaseAppContext';
import { CustomerModal } from './CustomerModal';
import { CustomerDetailModal } from './CustomerDetailModal';
import { formatAppDate, getTimezone, getStartOfDayInTimezone, getEndOfDayInTimezone, getStartOfInputDayInTimezone, getEndOfInputDayInTimezone } from '../../lib/dateUtils';
import { sonner } from '../../lib/sonner';
import { formatCurrency } from '../../lib/currencies';
import { SearchableSelect } from '../common/SearchableSelect';
import { useTranslation } from '../../hooks/useTranslation';

export function CustomerManager() {
  const { state, dispatch } = useApp();
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [startDateInput, setStartDateInput] = useState('');
  const [endDateInput, setEndDateInput] = useState('');
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  // validStartDate/validEndDate MUST be computed before filteredCustomers uses them
  const { validStartDate, validEndDate } = useMemo(() => {
    const timezone = getTimezone(state.settings.country);
    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    if (dateFilter === 'custom') {
      startDate = startDateInput
        ? new Date(getStartOfInputDayInTimezone(startDateInput, timezone).getTime())
        : new Date(getStartOfDayInTimezone(now, timezone).getTime());
      endDate = endDateInput
        ? new Date(getEndOfInputDayInTimezone(endDateInput, timezone).getTime())
        : new Date(getEndOfDayInTimezone(now, timezone).getTime());
    } else if (dateFilter === 'today') {
      startDate = getStartOfDayInTimezone(now, timezone);
      endDate = getEndOfDayInTimezone(now, timezone);
    } else if (dateFilter === 'yesterday') {
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      startDate = getStartOfDayInTimezone(yesterday, timezone);
      endDate = getEndOfDayInTimezone(yesterday, timezone);
    } else if (dateFilter === 'last7') {
      const last7 = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      startDate = getStartOfDayInTimezone(last7, timezone);
      endDate = getEndOfDayInTimezone(now, timezone);
    } else if (dateFilter === 'thisMonth') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      startDate = getStartOfDayInTimezone(startOfMonth, timezone);
      endDate = getEndOfDayInTimezone(now, timezone);
    } else if (dateFilter === 'lastMonth') {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      startDate = getStartOfDayInTimezone(lm, timezone);
      endDate = getEndOfDayInTimezone(lmEnd, timezone);
    } else if (dateFilter === 'all') {
      startDate = new Date(Date.UTC(2000, 0, 1));
      endDate = getEndOfDayInTimezone(now, timezone);
    } else {
      // Fallback
      startDate = new Date(Date.UTC(2000, 0, 1));
      endDate = getEndOfDayInTimezone(now, timezone);
    }

    return { validStartDate: startDate, validEndDate: endDate };
  }, [dateFilter, startDateInput, endDateInput, state.settings.country]);

  const filteredCustomers = useMemo(() => {
    const timezone = getTimezone(state.settings.country);
    const effectiveStart = getStartOfDayInTimezone(validStartDate, timezone).getTime();
    const effectiveEnd = getEndOfDayInTimezone(validEndDate, timezone).getTime();

    return state.customers.filter((customer: Customer) => {
      const matchesSearch = (
        (customer.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (customer.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (customer.phone || '').includes(searchTerm)
      );
      if (!matchesSearch) return false;

      if (dateFilter === 'all') return true;

      const lastPurchaseTs = customer.lastPurchase ? new Date(customer.lastPurchase).getTime() : 0;
      if (lastPurchaseTs >= effectiveStart && lastPurchaseTs <= effectiveEnd) return true;
      if (!customer.lastPurchase) return false;

      const hasSaleInRange = state.sales.some(s =>
        (s.customerId === customer.id || s.customerName?.toLowerCase() === customer.name?.toLowerCase()) &&
        new Date(s.timestamp || s.createdAt || 0).getTime() >= effectiveStart &&
        new Date(s.timestamp || s.createdAt || 0).getTime() <= effectiveEnd
      );
      return hasSaleInRange;
    });
  }, [state.customers, state.sales, searchTerm, dateFilter, validStartDate, validEndDate, state.settings.country]);

  const totalPages = Math.ceil(filteredCustomers.length / ITEMS_PER_PAGE);
  const paginatedCustomers = filteredCustomers.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    setShowCustomerModal(true);
  };

  const handleViewCustomer = (customer: Customer) => {
    setViewingCustomer(customer);
  };

  const handleDeleteCustomer = async (customerId: string) => {
    const result = await sonner.deleteConfirm('customer');
    if (result.isConfirmed) {
      try {
        sonner.loading('Deleting customer...');
        const { customersService } = await import('../../lib/services');
        await customersService.delete(customerId);
        dispatch({ type: 'DELETE_CUSTOMER', payload: customerId });
        sonner.success('Customer deleted successfully!');
      } catch (error) {
        console.error('Error deleting customer:', error);
        sonner.error('Failed to delete customer. Please try again.');
      } finally {
        sonner.close();
      }
    }
  };

  const handleAddCustomer = () => {
    setEditingCustomer(null);
    setShowCustomerModal(true);
  };

  // Map currency code → country dial code
  const CURRENCY_DIAL_CODE: Record<string, string> = {
    PKR: '92',   // Pakistan
    INR: '91',   // India
    BDT: '880',  // Bangladesh
    AFN: '93',   // Afghanistan
    AED: '971',  // UAE
    SAR: '966',  // Saudi Arabia
    QAR: '974',  // Qatar
    KWD: '965',  // Kuwait
    BHD: '973',  // Bahrain
    OMR: '968',  // Oman
    USD: '1',    // United States
    EUR: '44',   // Default to UK for Euro (no single code)
    GBP: '44',   // United Kingdom
    CNY: '86',   // China
    JPY: '81',   // Japan
    CAD: '1',    // Canada (same as US +1)
    AUD: '61',   // Australia
    CHF: '41',   // Switzerland
    TRY: '90',   // Turkey
    MYR: '60',   // Malaysia
    SGD: '65',   // Singapore
    IDR: '62',   // Indonesia
    THB: '66',   // Thailand
    NGN: '234',  // Nigeria
    EGP: '20',   // Egypt
    ZAR: '27',   // South Africa
  };

  const handleWhatsAppRedirect = (phone: string) => {
    if (!phone) return;
    let digits = phone.replace(/\D/g, '');

    const dialCode = CURRENCY_DIAL_CODE[state.settings.currency] || '92';

    // If number already starts with the dial code, use as-is
    if (!digits.startsWith(dialCode)) {
      // Strip leading 0 (local format like 0321...) then prepend dial code
      if (digits.startsWith('0')) {
        digits = digits.substring(1);
      }
      digits = dialCode + digits;
    }

    window.open(`https://wa.me/${digits}`, '_blank');
  };

  const filteredSalesByDate = useMemo(() => {
    if (dateFilter === 'all') return state.sales;
    const timezone = getTimezone(state.settings.country);
    const effectiveStart = getStartOfDayInTimezone(validStartDate, timezone).getTime();
    const effectiveEnd = getEndOfDayInTimezone(validEndDate, timezone).getTime();
    return state.sales.filter(sale => {
      const saleDate = new Date(sale.timestamp || sale.createdAt || 0).getTime();
      return saleDate >= effectiveStart && saleDate <= effectiveEnd;
    });
  }, [state.sales, dateFilter, validStartDate, validEndDate, state.settings.country]);

  const totalCustomers = state.customers.length;
  const totalPurchases = useMemo(() => {
    if (dateFilter === 'all') return state.customers.reduce((sum: number, c: Customer) => sum + (c.totalPurchases || 0), 0);
    return filteredSalesByDate.reduce((sum, s) => sum + s.total, 0);
  }, [state.customers, dateFilter, filteredSalesByDate]);

  const getCustomerTotalPurchases = (customerId: string, defaultTotal: number) => {
    if (dateFilter === 'all') return defaultTotal || 0;
    return filteredSalesByDate
      .filter(s => s.customerId === customerId || s.customerName?.toLowerCase() === customerId.toLowerCase())
      .reduce((sum, s) => sum + s.total, 0);
  };

  const averagePurchase = totalCustomers > 0 ? totalPurchases / totalCustomers : 0;
  const activeCustomers = useMemo(() => {
    const timezone = getTimezone(state.settings.country);
    const now = new Date();
    const thirtyDaysAgo = getStartOfDayInTimezone(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), timezone).getTime();
    return state.customers.filter((c: Customer) => c.lastPurchase &&
      new Date(c.lastPurchase).getTime() >= thirtyDaysAgo
    ).length;
  }, [state.customers, state.settings.country]);

  const totalCreditOutstanding = useMemo(() =>
    state.customers.reduce((sum: number, c: Customer) => sum + (c.creditUsed || 0), 0),
    [state.customers]
  );
  const customersWithCredit = useMemo(() =>
    state.customers.filter((c: Customer) => (c.creditUsed || 0) > 0).length,
    [state.customers]
  );

  return (
    <div className="main-content-scroll p-1 sm:p-4 lg:p-6 bg-gray-50/50 dark:bg-app space-y-3 lg:space-y-6 max-w-[1400px] mx-auto">
      {/* Layer 1: Identity & Tab Navigation */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6 pb-2">
        <div className="flex flex-col md:flex-row md:items-center gap-4 sm:gap-6 xl:gap-10">
          <div className="flex items-center gap-4 shrink-0">
            <div className="h-10 w-10 sm:h-12 sm:w-12 bg-primary/10 rounded-xl flex items-center justify-center shadow-inner border border-primary/10">
              <User className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            </div>
            <div className="shrink-0 flex flex-col">
              <h1 className="text-lg sm:text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tighter leading-none">{t("customers", "Customers")}</h1>
              <p className="hidden sm:block text-gray-600 dark:text-gray-400 text-[9px] font-black uppercase tracking-[0.2em] mt-1 opacity-60">{t("crm_hub", "CRM Hub")} • {state.customers.length} {t("records", "Records")}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleAddCustomer}
            className="btn btn-md btn-primary"
          >
            <Plus className="h-3.5 w-3.5" /> <span>{t("add_customer", "Add Customer")}</span>
          </button>
        </div>
      </div>

      {/* Layer 2: Filter Toolbar */}
      <div className="relative z-30 bg-white/50 dark:bg-black/20 p-3 lg:p-4 rounded-[1.75rem] border border-gray-200/50 dark:border-white/5 shadow-xl ring-1 ring-black/5 dark:ring-white/5">
        <div className="flex flex-col xl:flex-row gap-4">
          <div className="relative flex-1 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-600 group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              placeholder={t("search_customers_placeholder", "Search customers...")}
              className="w-full bg-gray-50 dark:bg-black/30 border-none pl-11 pr-4 py-2.5 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500 transition-all placeholder:text-gray-600 focus:bg-white dark:focus:bg-black/75 shadow-inner"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            />
          </div>

          <div className="grid grid-cols-2 sm:flex items-center gap-2">
            <SearchableSelect
              label={t("range", "RANGE")}
              options={[
                { id: 'all', label: t("all", "ALL TIME") },
                { id: 'today', label: t("today", "TODAY") },
                { id: 'yesterday', label: t("yesterday", "YESTERDAY") },
                { id: 'last7', label: t("last7", "LAST 7 DAYS") },
                { id: 'thisMonth', label: t("this_month", "THIS MONTH") },
                { id: 'lastMonth', label: t("last_month", "PREVIOUS MONTH") },
                { id: 'custom', label: t("custom", "CUSTOM RANGE") }
              ]}
              value={dateFilter}
              onChange={setDateFilter}
              icon={Receipt}
            />
          </div>
        </div>

        {dateFilter === 'custom' && (
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center mt-3 p-2 bg-white/50 dark:bg-black/20 rounded-xl animate-in slide-in-from-top-2 w-full">
            <input
              type="date"
              value={startDateInput}
              onChange={(e) => setStartDateInput(e.target.value)}
              className="w-full sm:flex-1 px-3 py-2 text-[10px] font-black bg-white dark:bg-zinc-800 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white uppercase shadow-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
            <span className="hidden sm:block text-[10px] font-black text-gray-600 uppercase tracking-tighter">to</span>
            <input
              type="date"
              value={endDateInput}
              onChange={(e) => setEndDateInput(e.target.value)}
              className="w-full sm:flex-1 px-3 py-2 text-[10px] font-black bg-white dark:bg-zinc-800 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white uppercase shadow-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
        )}
      </div>

      {/* Layer 3: Vibrant Stats section */}
      <div className="relative z-20 grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 mt-2">
        <div className="stat-card bg-gradient-to-br from-emerald-500 to-teal-600 group">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t("total_customers", "Total Customers")}</span>
            <span className="stat-card-value">{totalCustomers}</span>
          </div>
          <User className="stat-card-icon" />
        </div>

        <div className="stat-card bg-gradient-to-br from-blue-600 to-indigo-700 group">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t("total_sales", "Total Sales")}</span>
            <span className="stat-card-value">{formatCurrency(totalPurchases, state.settings.currency)}</span>
          </div>
          <CreditCard className="stat-card-icon" />
        </div>

        <div className="stat-card bg-gradient-to-br from-orange-500 to-amber-600 group">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t("average_sale", "Average Sale")}</span>
            <span className="stat-card-value">{formatCurrency(averagePurchase, state.settings.currency)}</span>
          </div>
          <Mail className="stat-card-icon" />
        </div>

        <div className="stat-card bg-gradient-to-br from-cyan-500 to-blue-500 group">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t("active_30d", "Active (30d)")}</span>
            <span className="stat-card-value">{activeCustomers}</span>
          </div>
          <Users className="stat-card-icon" />
        </div>

        {totalCreditOutstanding > 0 && (
          <div className="stat-card bg-gradient-to-br from-rose-500 to-red-700 group col-span-2 md:col-span-4">
            <div className="stat-card-inner">
              <span className="stat-card-label">Credit Outstanding ({customersWithCredit} Customers)</span>
              <span className="stat-card-value">{formatCurrency(totalCreditOutstanding, state.settings.currency)}</span>
            </div>
            <AlertTriangle className="stat-card-icon" />
          </div>
        )}
      </div>

      {/* Main View Container */}
      <div className="bg-white dark:bg-surface rounded-3xl border border-gray-200 dark:border-white/5 overflow-hidden shadow-xl">
        {/* Desktop Table View */}
        <div className="hidden lg:block overflow-x-auto scrollbar-hide">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 dark:bg-white/[0.02]">
                <th className="p-4 text-[10px] font-black uppercase text-gray-600 tracking-widest">{t("customer_info", "Customer Info")}</th>
                <th className="p-4 text-[10px] font-black uppercase text-gray-600 tracking-widest">{t("contact", "Contact")}</th>
                <th className="p-4 text-[10px] font-black uppercase text-gray-600 tracking-widest text-right">{t("total_purchases", "Total Purchases")}</th>
                <th className="p-4 text-[10px] font-black uppercase text-gray-600 tracking-widest text-center">{t("last_purchase", "Last Purchase")}</th>
                <th className="p-4 text-[10px] font-black uppercase text-gray-600 tracking-widest text-right">{t("actions", "Actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-white/5">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-20 text-center">
                    <div className="flex flex-col items-center gap-3 opacity-20">
                      <User className="h-12 w-12 text-gray-600" />
                      <p className="text-xs font-black uppercase tracking-widest">{t("no_customers_found", "No customers found")}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedCustomers.map((customer: Customer) => (
                  <tr key={customer.id} className="group hover:bg-gray-50 dark:hover:bg-white/[0.01] transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/10">
                          <User className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-[11px] font-black text-gray-900 dark:text-white uppercase leading-none">{customer.name}</p>
                            {(customer.creditUsed || 0) > 0 && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[8px] font-black uppercase rounded-full border border-rose-200 dark:border-rose-500/20">
                                <AlertTriangle className="h-2.5 w-2.5" />
                                {formatCurrency(customer.creditUsed, state.settings.currency)}
                              </span>
                            )}
                          </div>
                          <p className="text-[9px] text-gray-600 dark:text-gray-400 font-bold mt-1 uppercase tracking-widest">ID: {customer.id.substring(0, 8)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <p className="text-xs font-black text-gray-900 dark:text-white truncate max-w-[200px]">{customer.phone || 'NO PHONE'}</p>
                      <p className="text-[9px] text-gray-600 dark:text-gray-400 font-medium truncate max-w-[200px] mt-0.5 uppercase tracking-tighter">{customer.email || 'no-email@store.com'}</p>
                    </td>
                    <td className="p-4 text-right font-black text-primary dark:text-emerald-400 text-sm">
                      {formatCurrency(getCustomerTotalPurchases(customer.id, customer.totalPurchases), state.settings.currency)}
                    </td>
                    <td className="p-4 text-center">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-gray-500/10 dark:bg-gray-400/10 text-gray-600 dark:text-gray-400 border border-gray-500/20">
                        {customer.lastPurchase ? formatAppDate(customer.lastPurchase, state.settings.country) : t("never", "NEVER")}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end items-center gap-2 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleViewCustomer(customer)}
                          className="p-2 bg-blue-50 dark:bg-blue-500/10 text-blue-600 rounded-xl hover:scale-110 active:scale-95 transition-transform"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => customer.phone && handleWhatsAppRedirect(customer.phone)}
                          disabled={!customer.phone}
                          className="p-2 bg-emerald-50 dark:bg-primary/10 text-primary rounded-xl hover:scale-110 active:scale-95 transition-transform disabled:opacity-30"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleEditCustomer(customer)}
                          className="p-2 bg-amber-50 dark:bg-amber-500/10 text-amber-600 rounded-xl hover:scale-110 active:scale-95 transition-transform"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteCustomer(customer.id)}
                          className="p-2 bg-red-50 dark:bg-red-500/10 text-red-600 rounded-xl hover:scale-110 active:scale-95 transition-transform"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View (Expert Density) */}
        <div className="lg:hidden p-3 sm:p-4">
          {filteredCustomers.length === 0 ? (
            <div className="text-center py-10">
              <User className="h-10 w-10 mx-auto mb-3 opacity-10" />
              <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest">{t("no_customers_found", "No customers found")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-4">
              {paginatedCustomers.map((customer: Customer) => (
                <div
                  key={customer.id}
                  onClick={() => handleViewCustomer(customer)}
                  className="relative flex flex-col p-3 sm:p-4 rounded-[1.5rem] bg-white dark:bg-surface border border-gray-200 dark:border-white/5 shadow-sm active:scale-[0.98] transition-all"
                >
                  <div className="flex flex-col h-full">
                    <div className="flex justify-between items-start mb-2">
                      <div className="h-8 w-8 bg-primary/10 rounded-lg flex items-center justify-center">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); customer.phone && handleWhatsAppRedirect(customer.phone); }}
                          className="p-1.5 bg-emerald-50 dark:bg-primary/10 text-primary rounded-lg"
                        >
                          <MessageCircle className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEditCustomer(customer); }}
                          className="p-1.5 bg-amber-50 dark:bg-amber-500/10 text-amber-600 rounded-lg"
                        >
                          <Edit className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <h3 className="font-black text-gray-900 dark:text-white uppercase text-[10px] leading-tight truncate mb-1">
                      {customer.name}
                    </h3>
                    {(customer.creditUsed || 0) > 0 && (
                      <span className="inline-flex items-center gap-1 mb-1 px-1.5 py-0.5 bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[7px] font-black uppercase rounded-full">
                        <AlertTriangle className="h-2 w-2" />
                        {formatCurrency(customer.creditUsed, state.settings.currency)}
                      </span>
                    )}
                    <p className="text-[8px] text-gray-600 dark:text-gray-400 font-bold uppercase tracking-tight mb-3 truncate">
                      {customer.phone || 'NO PHONE'}
                    </p>

                    <div className="mt-auto pt-2 border-t border-gray-200 dark:border-white/5 flex items-center justify-between">
                      <p className="text-[11px] font-black text-primary dark:text-emerald-400">
                        {formatCurrency(getCustomerTotalPurchases(customer.id, customer.totalPurchases), state.settings.currency)}
                      </p>
                      <span className="text-[7px] font-black text-gray-600 dark:text-gray-400 uppercase">
                        {customer.lastPurchase ? formatAppDate(customer.lastPurchase, state.settings.country).substring(0, 6) : 'NEVER'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Premium Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-4 bg-gray-50/50 dark:bg-white/[0.02] border-t border-gray-200 dark:border-white/5 flex items-center justify-between gap-4">
            <p className="hidden sm:block text-[10px] font-black text-gray-600 uppercase tracking-widest italic truncate">{t("records", "Records")} {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredCustomers.length)} {t("of", "of")} {filteredCustomers.length}</p>
            <div className="flex items-center gap-1.5 mx-auto sm:mx-0">
              <button disabled={currentPage === 1} onClick={() => { setCurrentPage(prev => Math.max(1, prev - 1)); }} className="p-2 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl disabled:opacity-30 hover:bg-primary hover:text-white transition-all shadow-sm"><ChevronLeft className="h-4 w-4" /></button>
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-[150px] sm:max-w-none">
                {[...Array(totalPages)].map((_, i) => (
                  <button key={i + 1} onClick={() => setCurrentPage(i + 1)} className={`min-w-[32px] h-8 rounded-lg text-[10px] font-black transition-all ${currentPage === i + 1 ? 'bg-primary text-white shadow-lg' : 'text-gray-600 hover:bg-gray-100 dark:hover:bg-white/5'}`}>{i + 1}</button>
                ))}
              </div>
              <button disabled={currentPage === totalPages} onClick={() => { setCurrentPage(prev => Math.min(totalPages, prev + 1)); }} className="p-2 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl disabled:opacity-30 hover:bg-primary hover:text-white transition-all shadow-sm"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>

      <CustomerModal
        isOpen={showCustomerModal}
        onClose={() => setShowCustomerModal(false)}
        customer={editingCustomer}
      />

      {viewingCustomer && (
        <CustomerDetailModal
          customer={viewingCustomer}
          onClose={() => setViewingCustomer(null)}
        />
      )}
    </div>
  );
}