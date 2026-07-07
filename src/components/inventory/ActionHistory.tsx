import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowUpRight, ArrowDownLeft, Search, Filter, Hash, Clock, User as UserIcon,
  Eye, Package, AlertCircle, ShoppingCart, ArrowLeftRight
} from 'lucide-react';
import { useApp } from '../../context/SupabaseAppContext';
import { stockHistoryService } from '../../lib/services';
import { formatAppTime, formatAppDate } from '../../lib/dateUtils';
import { SearchableSelect } from '../common/SearchableSelect';
import { useTranslation } from '../../hooks/useTranslation';

/**
 * @deprecated Use AuditTimeline instead. AuditTimeline unifies stockHistory + purchaseRecords
 * from localDb into a single chronological view with search, pagination, and bill links.
 * ActionHistory fetches server-side only and doesn't show purchase records or returns.
 */
interface ActionHistoryProps {
  onViewProduct: (productId: string) => void;
}

export function ActionHistory({ onViewProduct }: ActionHistoryProps) {
  const { state } = useApp();
  const { t } = useTranslation();
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'in' | 'out' | 'return'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('today');
  const [selectedUser, setSelectedUser] = useState('all');
  const [startDateInput, setStartDateInput] = useState('');
  const [endDateInput, setEndDateInput] = useState('');

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setIsLoading(true);
        const data = await stockHistoryService.getAll();
        setHistory(data);
      } catch (error) {
        console.error("Failed to fetch history:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchHistory();
  }, []);

  const usersList = useMemo(() => {
    const list = history.map(entry => entry.cashierName || entry.cashier_name || entry.user).filter(Boolean);
    const userNames = state.users.map(u => u.name).filter(Boolean);
    return ['all', ...Array.from(new Set([...userNames, ...list]))];
  }, [history, state.users]);

  const filteredHistory = useMemo(() => {
    return history.filter(entry => {
      const entryNote = entry.note || entry.notes || '';
      const entryProductName = entry.productName || entry.product_name || (entry.productId && state.products.find(p => p.id === entry.productId)?.name) || '';
      const matchesSearch = entryProductName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entryNote.toLowerCase().includes(searchTerm.toLowerCase());

      const changeQty = entry.changeQty !== undefined ? entry.changeQty : (entry.change_qty || 0);
      const entryType = entry.type || '';

      let matchesTab = true;
      if (activeTab === 'in') {
        matchesTab = entryType === 'purchase' || entryType === 'initial' || entryType === 'stock_in' || (entryType === 'adjustment' && changeQty > 0);
      } else if (activeTab === 'out') {
        matchesTab = entryType === 'adjustment_out' || (entryType === 'adjustment' && changeQty < 0) || entryType === 'sale';
      } else if (activeTab === 'return') {
        matchesTab = entryType === 'return';
      } else if (activeTab === 'all') {
        matchesTab = true;
      }

      // Date Filter
      const dateVal = entry.createdAt || entry.created_at;
      const entryDate = new Date(dateVal);
      let matchesDate = true;

      if (dateFilter === 'custom') {
        let start: Date | null = null;
        let end: Date | null = null;
        
        if (startDateInput) {
          const [y, m, d] = startDateInput.split('-').map(Number);
          start = new Date(y, m - 1, d, 0, 0, 0, 0);
        }
        if (endDateInput) {
          const [y, m, d] = endDateInput.split('-').map(Number);
          end = new Date(y, m - 1, d, 23, 59, 59, 999);
        }

        if (start && entryDate < start) matchesDate = false;
        if (end && entryDate > end) matchesDate = false;
      } else {
        const now = new Date();
        if (dateFilter === 'today') {
          matchesDate = entryDate.toDateString() === now.toDateString();
        } else if (dateFilter === 'week') {
          const diffTime = now.getTime() - entryDate.getTime();
          const daysDiff = Math.floor(diffTime / (1000 * 60 * 60 * 24));
          matchesDate = daysDiff <= 7;
        } else if (dateFilter === 'month') {
          const diffTime = now.getTime() - entryDate.getTime();
          const daysDiff = Math.floor(diffTime / (1000 * 60 * 60 * 24));
          matchesDate = daysDiff <= 30;
        }
      }

      const cashierVal = entry.cashierName || entry.cashier_name || entry.user || 'System';
      const matchesUser = selectedUser === 'all' || cashierVal === selectedUser;

      return matchesSearch && matchesTab && matchesDate && matchesUser;
    }).sort((a, b) => new Date(b.createdAt || b.created_at).getTime() - new Date(a.createdAt || a.created_at).getTime());
  }, [history, activeTab, searchTerm, dateFilter, selectedUser, startDateInput, endDateInput, state.products]);

  const getEventConfig = (type: string, qty: number) => {
    if (type === 'purchase' || type === 'initial' || type === 'stock_in' || (type === 'adjustment' && qty > 0) || type === 'return') {
      return {
        label: type === 'return' ? 'Return' : (qty >= 0 ? 'Stock In' : 'Stock Out'),
        color: 'text-primary',
        bg: 'bg-primary/10',
        icon: type === 'return' ? ArrowDownLeft : ArrowUpRight
      };
    }
    return { label: 'Stock Out', color: 'text-amber-500', bg: 'bg-amber-500/10', icon: ArrowLeftRight };
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 opacity-50">
        <ArrowLeftRight className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-[10px] font-black uppercase tracking-[0.2em] animate-pulse">{t("syncing_actions", "Syncing Actions...")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Retention Alert */}
      <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl flex items-center gap-3">
        <AlertCircle className="h-5 w-5 text-amber-500" />
        <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest">
          {t("retention_policy", "Retention Policy Active: Only the last 300 recent actions are kept for maximum performance.")}
        </p>
      </div>

      {/* Control Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white/50 dark:bg-black/20 p-3 rounded-2xl border border-gray-200 dark:border-white/5 shadow-xl">
        <div className="flex bg-gray-100/80 dark:bg-white/5 p-1 rounded-xl overflow-x-auto no-scrollbar w-full md:w-auto">
          {(['all', 'in', 'out', 'return'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === tab ? 'bg-white dark:bg-[#1f1f1f] text-primary shadow-sm' : 'text-gray-600 hover:text-gray-900 dark:hover:text-white'}`}
            >
              {tab === 'all' && t("all_actions", "All Actions")}
              {tab === 'in' && t("stock_in", "Stock In")}
              {tab === 'out' && t("stock_out", "Stock Out")}
              {tab === 'return' && t("returns", "Returns")}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-600" />
            <input
              type="text"
              placeholder={t("filter_by_product", "Filter by product...")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white dark:bg-black/75 border-none pl-9 pr-4 py-2.5 rounded-xl text-[11px] font-bold focus:ring-2 focus:ring-emerald-500 shadow-sm"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <SearchableSelect
              options={usersList.map(u => ({ id: u, label: u === 'all' ? t("all_users", "All Users") : u.toUpperCase() }))}
              value={selectedUser}
              onChange={(val) => setSelectedUser(val)}
              placeholder={t("user_info", "User")}
              icon={UserIcon}
            />

            <SearchableSelect
              options={[
                { id: 'today', label: t("today", "TODAY") },
                { id: 'week', label: t("this_week", "THIS WEEK") },
                { id: 'month', label: t("this_month", "THIS MONTH") },
                { id: 'custom', label: t("date_range", "DATE RANGE") }
              ]}
              value={dateFilter}
              onChange={(val) => setDateFilter(val)}
              placeholder={t("select_date", "Select Date")}
              icon={Filter}
            />

            {dateFilter === 'custom' && (
              <div className="flex items-center gap-2 p-1.5 bg-white/50 dark:bg-black/20 rounded-xl border border-white/10 animate-in slide-in-from-top-1">
                <input
                  type="date"
                  value={startDateInput}
                  onChange={(e) => setStartDateInput(e.target.value)}
                  className="bg-transparent border-none text-[10px] font-black text-gray-900 dark:text-white uppercase focus:ring-0 w-28"
                />
                <span className="text-[10px] font-black text-gray-600 uppercase tracking-tighter">{t("to", "to")}</span>
                <input
                  type="date"
                  value={endDateInput}
                  onChange={(e) => setEndDateInput(e.target.value)}
                  className="bg-transparent border-none text-[10px] font-black text-gray-900 dark:text-white uppercase focus:ring-0 w-28"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action Table */}
      <div className="bg-white dark:bg-surface rounded-[2.5rem] border border-gray-200 dark:border-white/5 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 dark:bg-white/[0.02] border-b border-gray-200 dark:border-white/5">
                <th className="p-6 text-[10px] font-black text-gray-700 dark:text-gray-400 uppercase tracking-widest">{t("action_identity", "Action Identity")}</th>
                <th className="p-6 text-[10px] font-black text-gray-700 dark:text-gray-400 uppercase tracking-widest text-center">{t("movement", "Movement")}</th>
                <th className="p-6 text-[10px] font-black text-gray-700 dark:text-gray-400 uppercase tracking-widest text-center">{t("reference", "Reference")}</th>
                <th className="p-6 text-[10px] font-black text-gray-700 dark:text-gray-400 uppercase tracking-widest text-right">{t("user_info", "User Info")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-white/5">
              {filteredHistory.length > 0 ? filteredHistory.map((entry, idx) => {
                const changeQty = entry.changeQty !== undefined ? entry.changeQty : (entry.change_qty || 0);
                const balanceAfter = entry.balanceAfter !== undefined ? entry.balanceAfter : (entry.balance_after || 0);
                const createdAt = entry.createdAt || entry.created_at;
                const cashierVal = entry.cashierName || entry.cashier_name || entry.user || 'System';
                const noteVal = entry.note || entry.notes || 'No Additional Notes';
                const productNameVal = entry.productName || entry.product_name || (entry.productId && state.products.find(p => p.id === entry.productId)?.name) || 'System Action';

                const config = getEventConfig(entry.type, changeQty);
                const isReturned = entry.type === 'return';
                const displayQty = isReturned ? Math.abs(changeQty) : changeQty;
                const isPositive = displayQty >= 0;

                return (
                  <tr key={entry.id || idx} className="group hover:bg-gray-50 dark:hover:bg-white/[0.01] transition-colors">
                    <td className="p-6">
                      <div className="flex items-center gap-4 cursor-pointer" onClick={() => onViewProduct(entry.productId || entry.product_id)}>
                        <div className={`h-11 w-11 rounded-2xl ${config.bg} flex items-center justify-center border border-white/5 group-hover:scale-110 transition-transform`}>
                          <config.icon className={`h-5 w-5 ${config.color}`} />
                        </div>
                        <div>
                          <p className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-tight group-hover:text-primary transition-colors">{productNameVal}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${config.bg} ${config.color}`}>
                              {config.label}
                            </span>
                            <span className="text-[9px] font-bold text-gray-600 inline-flex items-center gap-1">
                              <Clock className="h-2.5 w-2.5" /> {formatAppTime(createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-6 text-center">
                      <p className={`text-sm font-black italic tracking-tighter ${isPositive ? 'text-primary' : 'text-amber-500'}`}>
                        {isPositive ? '+' : ''}{displayQty} <span className="text-[10px] opacity-60">{t("units", "UNITS").toUpperCase()}</span>
                      </p>
                      <p className="text-[9px] font-bold text-gray-600 uppercase opacity-40">{t("stock", "Snapshot")}: {balanceAfter} {t("balance", "Bal")}</p>
                    </td>
                    <td className="p-6 text-center">
                      <p className="text-[10px] font-bold text-gray-600 uppercase max-w-[150px] truncate mx-auto">{noteVal}</p>
                      <span className="text-[8px] font-mono text-gray-600 opacity-50 block mt-1">ID: {(entry.id || '').slice(0, 8).toUpperCase()}</span>
                    </td>
                    <td className="p-6 text-right">
                      <div className="inline-flex items-center gap-2 bg-gray-100 dark:bg-white/5 px-3 py-1.5 rounded-xl border border-white/5">
                        <UserIcon className={`h-3 w-3 ${isPositive ? 'text-primary' : 'text-amber-500'}`} />
                        <span className="text-[10px] font-black text-gray-600 dark:text-gray-300 uppercase">{cashierVal.split('@')[0]}</span>
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={4} className="p-20 text-center">
                    <div className="flex flex-col items-center opacity-30">
                      <Package className="h-16 w-16 text-gray-600 mb-4" />
                      <p className="text-sm font-black text-gray-600 uppercase tracking-[0.2em]">{t("no_actions_registered", "No Actions Registered")}</p>
                      <p className="text-xs font-bold text-gray-600 uppercase mt-2">{t("adjust_filters", "Adjust your filters or perform system actions")}</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
