import { useState, useMemo, useRef } from 'react';
import { 
  Plus, Search, TrendingDown, 
  Tag, CreditCard, Edit2, Trash2, 
  Download, Wallet, LayoutGrid, Zap, 
  Utensils, Fuel, Home, Users, 
  Package, Megaphone, Wrench, ShieldCheck, 
  Receipt, MoreHorizontal, ShoppingBag,
  ChevronLeft, ChevronRight, Building2, User
} from 'lucide-react';
import { format, subDays, startOfDay, endOfDay, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { useApp } from '../../context/SupabaseAppContext';
import { formatAppDate, formatAppTime, formatAppDateTime, getTimezone, getStartOfDayInTimezone, getEndOfDayInTimezone, getStartOfInputDayInTimezone, getEndOfInputDayInTimezone } from '../../lib/dateUtils';
import { expensesService } from '../../lib/services';
import { Expense, EXPENSE_CATEGORIES } from '../../types';
import { ExpenseModal } from './ExpenseModal';
import { SearchableSelect } from '../common/SearchableSelect';
import { sonner } from '../../lib/sonner';
import { formatCurrency } from '../../lib/currencies';
import { useTranslation } from '../../hooks/useTranslation';

export function ExpenseManager() {
  const { state, dispatch } = useApp();
  const { t } = useTranslation();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'all' | 'cash' | 'card' | 'digital'>('all');
  const [selectedCashier, setSelectedCashier] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [dateRange, setDateRange] = useState('today');
  const [startDateInput, setStartDateInput] = useState('');
  const [endDateInput, setEndDateInput] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  const paymentMethodScrollRef = useRef<HTMLDivElement>(null);
  const categoryScrollRef = useRef<HTMLDivElement>(null);

  const scroll = (ref: React.RefObject<HTMLDivElement>, direction: 'left' | 'right') => {
    if (ref.current) {
      const scrollAmount = 200;
      ref.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };
  
  const CATEGORY_ICONS: Record<string, any> = {
    'all': LayoutGrid,
    'Utilities': Zap,
    'Food': Utensils,
    'Fuel': Fuel,
    'Rent': Home,
    'Salaries': Users,
    'Supplies': Package,
    'Marketing': Megaphone,
    'Maintenance': Wrench,
    'Insurance': ShieldCheck,
    'Taxes': Receipt,
    'Other': MoreHorizontal
  };

  const { validStartDate, validEndDate } = useMemo(() => {
    const timezone = getTimezone(state.settings.country);
    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    if (dateRange === 'custom') {
      startDate = startDateInput
        ? new Date(getStartOfInputDayInTimezone(startDateInput, timezone).getTime())
        : new Date(getStartOfDayInTimezone(now, timezone).getTime());
      endDate = endDateInput
        ? new Date(getEndOfInputDayInTimezone(endDateInput, timezone).getTime())
        : new Date(getEndOfDayInTimezone(now, timezone).getTime());
    } else if (dateRange === 'today') {
      startDate = getStartOfDayInTimezone(now, timezone);
      endDate = getEndOfDayInTimezone(now, timezone);
    } else if (dateRange === 'yesterday') {
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      startDate = getStartOfDayInTimezone(yesterday, timezone);
      endDate = getEndOfDayInTimezone(yesterday, timezone);
    } else if (dateRange === 'last7') {
      const last7 = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      startDate = getStartOfDayInTimezone(last7, timezone);
      endDate = getEndOfDayInTimezone(now, timezone);
    } else if (dateRange === 'thisMonth') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      startDate = getStartOfDayInTimezone(startOfMonth, timezone);
      endDate = getEndOfDayInTimezone(now, timezone);
    } else if (dateRange === 'lastMonth') {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      startDate = getStartOfDayInTimezone(lm, timezone);
      endDate = getEndOfDayInTimezone(lmEnd, timezone);
    } else if (dateRange === 'all') {
      startDate = new Date(Date.UTC(2000, 0, 1));
      endDate = getEndOfDayInTimezone(now, timezone);
    } else {
      // Fallback
      startDate = getStartOfDayInTimezone(now, timezone);
      endDate = getEndOfDayInTimezone(now, timezone);
    }

    return { validStartDate: startDate, validEndDate: endDate };
  }, [dateRange, startDateInput, endDateInput, state.settings.country]);

  const cashiersList = useMemo(() => {
    const userNames = state.users.map(u => u.name).filter(Boolean);
    const expenseUsers = state.expenses.map(e => e.addedBy).filter(Boolean);
    return ['all', ...Array.from(new Set([...userNames, ...expenseUsers]))];
  }, [state.expenses, state.users]);

  const filteredExpenses = useMemo(() => {
    const timezone = getTimezone(state.settings.country);
    const effectiveStart = getStartOfDayInTimezone(validStartDate, timezone).getTime();
    const effectiveEnd = getEndOfDayInTimezone(validEndDate, timezone).getTime();

    return state.expenses.filter(expense => {
      const expenseDate = new Date(expense.date).getTime();

      const matchesSearch = (expense.description || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || expense.category === selectedCategory;
      const matchesPayment = selectedPaymentMethod === 'all' || expense.paymentMethod === selectedPaymentMethod;
      const matchesDate = dateRange === 'all' || (expenseDate >= effectiveStart && expenseDate <= effectiveEnd);
      const matchesCashier = selectedCashier === 'all' || expense.addedBy === selectedCashier;
      return matchesSearch && matchesCategory && matchesPayment && matchesDate && matchesCashier;
    });
  }, [state.expenses, searchTerm, selectedCategory, selectedPaymentMethod, selectedCashier, validStartDate, validEndDate, dateRange, state.settings.country]);

  const totalPages = Math.ceil(filteredExpenses.length / ITEMS_PER_PAGE);
  const paginatedExpenses = filteredExpenses.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const stats = useMemo(() => {
    const timezone = getTimezone(state.settings.country);
    const now = new Date();
    const monthStart = getStartOfDayInTimezone(new Date(now.getFullYear(), now.getMonth(), 1), timezone).getTime();
    const monthEnd = getEndOfDayInTimezone(new Date(now.getFullYear(), now.getMonth() + 1, 0), timezone).getTime();

    const thisMonthTotal = filteredExpenses
      .filter(e => {
        const d = new Date(e.date).getTime();
        return d >= monthStart && d <= monthEnd;
      })
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const filteredTotal = filteredExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

    return { filteredTotal, thisMonthTotal };
  }, [state.settings.country, filteredExpenses]);

  const isAdmin = state.currentUser?.role === 'admin';

  const handleSave = async (expenseData: Omit<Expense, 'id' | 'createdAt'>) => {
    // Only allow editing for admins, but anyone (manager/admin) can add
    if (editingExpense && !isAdmin) {
      sonner.error('Only administrators can edit expenses.');
      return;
    }

    const fullExpenseData = {
      ...expenseData,
      addedBy: state.currentUser?.name || state.currentUser?.username || 'Operator',
    };

    try {
      if (editingExpense) {
        const updated = await expensesService.update(editingExpense.id, fullExpenseData);
        dispatch({ type: 'UPDATE_EXPENSE', payload: updated });
        sonner.success('Expense updated successfully.');
      } else {
        const created = await expensesService.create(fullExpenseData);
        dispatch({ type: 'ADD_EXPENSE', payload: created });
        sonner.success('Expense added successfully.');
      }
      setIsModalOpen(false);
      setEditingExpense(null);
    } catch (error) {
      console.error('Error saving expense:', error);
      sonner.error('Failed to save expense.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) {
      sonner.error('Only administrators can delete expenses.');
      return;
    }

    const result = await sonner.deleteConfirm('expense record');
    if (!result.isConfirmed) return;

    try {
      sonner.loading('Deleting expense...');
      await expensesService.delete(id);
      dispatch({ type: 'DELETE_EXPENSE', payload: id });
      sonner.success('Expense deleted successfully.');
    } catch (error) {
      console.error('Error deleting expense:', error);
      sonner.error('Failed to delete expense.');
    } finally {
      sonner.close();
    }
  };


  // Top spending category
  const topCategory = useMemo(() => {
    const catMap: Record<string, number> = {};
    filteredExpenses.forEach(e => {
      catMap[e.category] = (catMap[e.category] || 0) + Number(e.amount);
    });
    const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    return sorted[0] ? { name: sorted[0][0], amount: sorted[0][1] } : null;
  }, [filteredExpenses]);

  return (
    <div className="main-content-scroll p-1 sm:p-4 lg:p-6 bg-gray-50/50 dark:bg-app space-y-3 lg:space-y-6 max-w-[1400px] mx-auto">
      {/* Layer 1: Identity & Tab Navigation */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6 pb-2">
        <div className="flex flex-col md:flex-row md:items-center gap-4 sm:gap-6 xl:gap-10">
          <div className="flex items-center gap-4 shrink-0">
            <div className="h-10 w-10 sm:h-12 sm:w-12 bg-primary/10 rounded-xl flex items-center justify-center shadow-inner border border-primary/10">
              <TrendingDown className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            </div>
            <div className="shrink-0 flex flex-col">
              <h1 className="text-lg sm:text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tighter leading-none">{t("expenses", "Expenses")}</h1>
              <p className="hidden sm:block text-gray-600 dark:text-gray-400 text-[9px] font-black uppercase tracking-[0.2em] mt-1 opacity-60">{t("management_tools", "Management Hub")} • {state.expenses.length} {t("records", "Records")}</p>
            </div>
          </div>

          {/* Redundant Switcher Removed to Fix Double Tabs */}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditingExpense(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl font-black text-[10px] shadow-lg shadow-emerald-500/20 hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-widest"
          >
            <Plus className="h-3.5 w-3.5" /> <span>{t("add_expense", "Add Expense")}</span>
          </button>
        </div>
      </div>

      {/* Layer 2: Filter Toolbar (Smart Context) */}
      <div className="relative z-30 bg-white/50 dark:bg-black/20 p-3 lg:p-4 rounded-[1.75rem] border border-gray-200/50 dark:border-white/5 shadow-xl ring-1 ring-black/5 dark:ring-white/5">
        <div className="flex flex-col xl:flex-row gap-4">
          {/* Search Box */}
          <div className="relative flex-1 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-600 group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              placeholder={t("search_expenses_placeholder", "Search expenses...")}
              className="w-full bg-gray-50 dark:bg-black/30 border-none pl-11 pr-4 py-2.5 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500 transition-all placeholder:text-gray-600 focus:bg-white dark:focus:bg-black/75 shadow-inner"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Filters Grid */}
          <div className="grid grid-cols-2 sm:flex items-center gap-2">
            <SearchableSelect
              options={[
                { id: 'all', label: t("all_categories", "All Categories") },
                ...EXPENSE_CATEGORIES.map(c => ({ id: c, label: c }))
              ]}
              value={selectedCategory}
              onChange={setSelectedCategory}
              placeholder={t("category", "Category")}
              icon={Tag}
            />
            <SearchableSelect
              options={[
                { id: 'all', label: t("all_methods", "All Methods") },
                { id: 'cash', label: t("cash", "Cash") },
                { id: 'card', label: t("card", "Card") },
                { id: 'digital', label: t("digital", "Digital") }
              ]}
              value={selectedPaymentMethod}
              onChange={(val: any) => setSelectedPaymentMethod(val)}
              placeholder={t("payment_method", "Payment")}
              icon={CreditCard}
            />
            <SearchableSelect
              options={cashiersList.map(u => ({ id: u, label: u === 'all' ? t("all_users", "All Users") : u.toUpperCase() }))}
              value={selectedCashier}
              onChange={setSelectedCashier}
              placeholder={t("users", "User")}
              icon={User}
            />
            <SearchableSelect
              label={t("range", "RANGE")}
              options={[
                { id: 'today', label: t("today", "TODAY") },
                { id: 'yesterday', label: t("yesterday", "YESTERDAY") },
                { id: 'last7', label: t("last7", "LAST 7 DAYS") },
                { id: 'thisMonth', label: t("this_month", "THIS MONTH") },
                { id: 'lastMonth', label: t("last_month", "PREVIOUS MONTH") },
                { id: 'custom', label: t("custom", "CUSTOM RANGE") },
                { id: 'all', label: t("all", "ALL TIME") }
              ]}
              value={dateRange}
              onChange={setDateRange}
              placeholder={t("range", "Time Range")}
              icon={Receipt}
              align="right"
            />
          </div>
        </div>

        {dateRange === 'custom' && (
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
      <div className="relative z-20 grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4 mt-2">
        <div className="stat-card bg-gradient-to-br from-rose-500 to-red-700 group">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t("filtered_total", "Filtered Total")}</span>
            <span className="stat-card-value">{formatCurrency(stats.filteredTotal, state.settings.currency)}</span>
            <p className="text-[7px] font-black text-rose-100/40 uppercase tracking-[0.2em] mt-1">{filteredExpenses.length} {t("records", "Records")}</p>
          </div>
          <TrendingDown className="stat-card-icon" />
        </div>

        <div className="stat-card bg-gradient-to-br from-amber-500 to-orange-700 group">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t("this_month", "This Month")}</span>
            <span className="stat-card-value">{formatCurrency(stats.thisMonthTotal, state.settings.currency)}</span>
            <p className="text-[7px] font-black text-amber-100/40 uppercase tracking-[0.2em] mt-1">{t("current_month", "Current Month")}</p>
          </div>
          <Wallet className="stat-card-icon" />
        </div>

        <div className="stat-card bg-gradient-to-br from-blue-500 to-indigo-700 col-span-2 lg:col-span-1 group">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t("top_category", "Top Category")}</span>
            <span className="stat-card-value">{topCategory?.name || t("none", "None")}</span>
            <p className="text-[7px] font-black text-blue-100/40 uppercase tracking-[0.2em] mt-1">{topCategory ? formatCurrency(topCategory.amount, state.settings.currency) : '—'}</p>
          </div>
          <Tag className="stat-card-icon" />
        </div>
      </div>

      {/* Main View Container */}
      <div className="bg-white dark:bg-surface rounded-3xl border border-gray-200 dark:border-white/5 overflow-hidden shadow-xl">
        {/* Desktop Table View */}
        <div className="hidden lg:block overflow-x-auto scrollbar-hide">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 dark:bg-white/[0.02]">
                <th className="p-4 text-[10px] font-black uppercase text-gray-700 dark:text-gray-400 tracking-widest">{t("date_time", "Date & Time")}</th>
                <th className="p-4 text-[10px] font-black uppercase text-gray-700 dark:text-gray-400 tracking-widest">{t("description", "Description")}</th>
                <th className="p-4 text-[10px] font-black uppercase text-gray-700 dark:text-gray-400 tracking-widest text-center">{t("category", "Category")}</th>
                <th className="p-4 text-[10px] font-black uppercase text-gray-700 dark:text-gray-400 tracking-widest text-center">{t("method", "Method")}</th>
                <th className="p-4 text-[10px] font-black uppercase text-gray-700 dark:text-gray-400 tracking-widest text-right">{t("amount", "Amount")}</th>
                <th className="p-4 text-[10px] font-black uppercase text-gray-700 dark:text-gray-400 tracking-widest text-right">{t("actions", "Actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-white/5">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-20 text-center">
                    <div className="flex flex-col items-center gap-3 opacity-20">
                      <ShoppingBag className="h-12 w-12 text-gray-600" />
                      <p className="text-xs font-black uppercase tracking-widest">{t("no_expenses_found", "No expenses found")}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedExpenses.map((expense) => (
                  <tr key={expense.id} className="group hover:bg-gray-50 dark:hover:bg-white/[0.01] transition-colors">
                    <td className="p-4">
                      <p className="text-[11px] font-black text-gray-900 dark:text-white uppercase leading-none">{formatAppDate(expense.date, state.settings.country)}</p>
                      <p className="text-[9px] text-gray-600 font-bold mt-1">{formatAppTime(expense.date, state.settings.country)}</p>
                    </td>
                    <td className="p-4">
                      <p className="text-xs font-black text-gray-900 dark:text-white uppercase truncate max-w-[200px]">{expense.description}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {expense.notes && <span className="text-[9px] text-gray-500 font-medium truncate max-w-[150px]">{expense.notes}</span>}
                        {expense.notes && expense.addedBy && <span className="text-gray-300 dark:text-white/10 text-[9px]">•</span>}
                        {expense.addedBy && <span className="text-[9px] text-primary font-bold uppercase tracking-tight">By {expense.addedBy}</span>}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                       <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-orange-500/10 text-orange-500 border border-orange-500/20">
                        {expense.category}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-primary/10 text-primary border border-primary/20">
                        {expense.paymentMethod}
                      </span>
                    </td>
                    <td className="p-4 text-right font-black text-rose-500 text-sm">
                      -{formatCurrency(expense.amount, state.settings.currency)}
                    </td>
                    <td className="p-4 text-right">
                       <div className="flex justify-end items-center gap-2 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setEditingExpense(expense); setIsModalOpen(true); }}
                          className="p-2 bg-emerald-50 dark:bg-primary/10 text-primary rounded-xl hover:scale-110 active:scale-95 transition-transform"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(expense.id)}
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
          {filteredExpenses.length === 0 ? (
            <div className="text-center py-10">
              <ShoppingBag className="h-10 w-10 mx-auto mb-3 opacity-10" />
              <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest">{t("no_expenses_found", "No expenses recorded")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-4">
              {paginatedExpenses.map(expense => (
                <div
                  key={expense.id}
                  onClick={() => { setEditingExpense(expense); setIsModalOpen(true); }}
                  className="relative flex flex-col p-3 sm:p-4 rounded-[1.5rem] bg-white dark:bg-surface border border-gray-200 dark:border-white/5 shadow-sm active:scale-[0.98] transition-all"
                >
                  <div className="flex flex-col h-full">
                    <div className="flex justify-between items-start mb-2">
                      <div className="h-8 w-8 bg-rose-500/10 rounded-lg flex items-center justify-center">
                        <TrendingDown className="h-4 w-4 text-rose-500" />
                      </div>
                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md bg-orange-500/10 text-orange-500 border border-orange-500/20 uppercase tracking-tight">
                        {expense.category.substring(0, 8)}
                      </span>
                    </div>

                    <h3 className="font-black text-gray-900 dark:text-white uppercase text-[10px] leading-tight truncate mb-1">
                      {expense.description}
                    </h3>
                    <p className="text-[8px] text-gray-600 font-bold uppercase tracking-tight mb-3">
                      {formatAppDate(expense.date, state.settings.country)} {expense.addedBy ? `| By ${expense.addedBy}` : ''}
                    </p>

                    <div className="mt-auto pt-2 border-t border-gray-200 dark:border-white/5 flex items-center justify-between">
                      <p className="text-[11px] font-black text-rose-500">
                        -{formatCurrency(expense.amount, state.settings.currency)}
                      </p>
                      <span className="text-[8px] font-black text-gray-600 uppercase">
                        {expense.paymentMethod}
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
            <p className="hidden sm:block text-[10px] font-black text-gray-600 uppercase tracking-widest italic truncate">{t("records", "Records")} {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredExpenses.length)} {t("of", "of")} {filteredExpenses.length}</p>
            <div className="flex items-center gap-1.5 mx-auto sm:mx-0">
              <button disabled={currentPage === 1} onClick={() => { setCurrentPage(prev => Math.max(1, prev - 1)); }} className="p-2 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl disabled:opacity-30 hover:bg-primary hover:text-white transition-all shadow-sm"><ChevronLeft className="h-4 w-4" /></button>
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-[150px] sm:max-w-none">
                {[...Array(totalPages)].map((_, i) => (
                  <button key={i+1} onClick={() => setCurrentPage(i+1)} className={`min-w-[32px] h-8 rounded-lg text-[10px] font-black transition-all ${currentPage === i+1 ? 'bg-primary text-white shadow-lg' : 'text-gray-600 hover:bg-gray-100 dark:hover:bg-white/5'}`}>{i+1}</button>
                ))}
              </div>
              <button disabled={currentPage === totalPages} onClick={() => { setCurrentPage(prev => Math.min(totalPages, prev + 1)); }} className="p-2 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl disabled:opacity-30 hover:bg-primary hover:text-white transition-all shadow-sm"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>

      <ExpenseModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingExpense(null);
        }}
        onSave={handleSave}
        expense={editingExpense}
      />
    </div>
  );
}
