import React, { useState, useMemo, useEffect } from 'react';
import { 
  History, ShoppingCart, ArrowDownLeft, ArrowUpRight, 
  Settings, User, Clock, Package, Eye, Receipt,
  ChevronLeft, ChevronRight, Search, Filter,
  ArrowRightLeft, Database
} from 'lucide-react';
import { useApp } from '../../context/SupabaseAppContext';
import { formatAppDate, formatAppTime } from '../../lib/dateUtils';
import { localDb } from '../../lib/localDb';

interface AuditTimelineProps {
  onViewProduct: (productId: string) => void;
  onViewBill: (saleId: string) => void;
}

type TabType = 'all' | 'in' | 'out' | 'return';

export function AuditTimeline({ onViewProduct, onViewBill }: AuditTimelineProps) {
  const { state } = useApp();
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const stockHist = await localDb.stockHistory.toArray();
      const purchaseRecs = await localDb.purchaseRecords.toArray();

      const unified = [
        ...stockHist.map(h => ({
          id: h.id,
          date: new Date(h.createdAt || h.created_at || h.timestamp),
          type: h.type,
          productId: h.productId || h.product_id,
          productName: h.productName || h.product_name || 'Unknown Product',
          qty: Number(h.changeQty || h.change_qty) || 0,
          user: h.cashierName || h.cashier_name || h.addedBy || h.added_by || 'System',
          reference: h.referenceId || h.reference_id,
          note: h.note || h.notes
        })),
        ...purchaseRecs.filter(p => !stockHist.some(h => h.reference_id === p.id)).map(p => ({
            id: p.id,
            date: new Date(p.date),
            type: p.type?.toLowerCase() || 'purchase',
            productId: p.productId,
            productName: p.productName || 'Unknown Product',
            qty: Number(p.quantity) || 0,
            user: p.addedBy || 'System',
            reference: p.id,
            note: p.notes
        }))
      ].sort((a, b) => b.date.getTime() - a.date.getTime());

      setHistory(unified);
    } catch (error) {
      console.error('Failed to load audit history:', error);
    } finally {
      setLoading(false);
    }
  };

  const categorizedData = useMemo(() => {
    const inTypes = ['purchase', 'initial'];
    const ins = history.filter(h => inTypes.includes(h.type) || (h.type === 'adjustment' && h.qty > 0));
    const outs = history.filter(h => h.type === 'sale' || (h.type === 'adjustment' && h.qty < 0));
    const rets = history.filter(h => h.type === 'return');
    
    return {
      all: history,
      in: ins,
      out: outs,
      return: rets,
      counts: {
        all: history.length,
        in: ins.length,
        out: outs.length,
        return: rets.length
      }
    };
  }, [history]);

  const filteredHistory = useMemo(() => {
    let base = categorizedData[activeTab] || [];
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      base = base.filter(h => 
        h.productName.toLowerCase().includes(search) ||
        h.user.toLowerCase().includes(search) ||
        (h.reference && h.reference.toLowerCase().includes(search))
      );
    }
    return base;
  }, [categorizedData, activeTab, searchTerm]);

  const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);
  const paginatedHistory = useMemo(() => {
    return filteredHistory.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filteredHistory, currentPage]);

  const resolveProductName = (productId: string, fallback: string) => {
    // Priority 1: Find by ID in current active product list
    const p = state.products.find(item => item.id === productId);
    if (p) return p.name;

    // Priority 2: If fallback is generic 'Unknown Product', and we can't find it, mark as Deleted
    if (fallback === 'Unknown Product' || !fallback) return 'Deleted/Legacy Product';
    
    // Priority 3: Use the recorded name if it was accurately saved
    return fallback;
  };

  const getEventConfig = (type: string, qty: number) => {
    switch (type) {
      case 'sale':
        return { icon: ShoppingCart, color: 'text-amber-500', bg: 'bg-amber-500/10', label: 'Item Sold', qtyPrefix: '-' };
      case 'return':
        return { icon: ArrowDownLeft, color: 'text-primary', bg: 'bg-primary/10', label: 'Returned', qtyPrefix: '+' };
      case 'purchase':
        return { icon: ArrowUpRight, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Stock In', qtyPrefix: '+' };
      case 'adjustment':
        return { icon: Settings, color: 'text-violet-500', bg: 'bg-violet-500/10', label: 'Adjusted', qtyPrefix: qty > 0 ? '+' : '' };
      case 'initial':
        return { icon: Package, color: 'text-gray-600', bg: 'bg-gray-500/10', label: 'Opening', qtyPrefix: '+' };
      default:
        return { icon: History, color: 'text-gray-600', bg: 'bg-gray-400/10', label: 'Log', qtyPrefix: '' };
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 opacity-50">
        <History className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-[10px] font-black uppercase tracking-[0.2em] animate-pulse">Syncing History...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Header Tabs */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white/5 dark:bg-black/20 p-2 rounded-2xl border border-gray-200 dark:border-white/5 shadow-sm">
        <div className="relative flex-1 min-w-0">
          <div className="flex bg-gray-100/50 dark:bg-white/5 p-1 rounded-xl w-full sm:w-auto overflow-x-auto no-scrollbar">
            {(['all', 'in', 'out', 'return'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setCurrentPage(1); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                  activeTab === tab 
                    ? 'bg-white dark:bg-white/10 text-primary dark:text-emerald-400 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-700 dark:hover:text-gray-600'
                }`}
              >
                {tab === 'all' && <Database className="h-3 w-3" />}
                {tab === 'in' && <ArrowUpRight className="h-3 w-3" />}
                {tab === 'out' && <ShoppingCart className="h-3 w-3" />}
                {tab === 'return' && <ArrowDownLeft className="h-3 w-3" />}
                {tab.replace('in', 'Stock In').replace('out', 'Sales')}
                <span className="opacity-40 text-[9px] font-bold">({categorizedData.counts[tab]})</span>
              </button>
            ))}
          </div>
          {/* Scroll Indicator Shadow */}
          <div className="absolute right-0 top-0 w-8 h-full bg-gradient-to-l from-gray-100 dark:from-black/20 to-transparent pointer-events-none sm:hidden rounded-r-xl" />
        </div>

        <div className="relative w-full sm:w-64 px-2">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-600" />
          <input 
            type="text" 
            placeholder="Search within tab..." 
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="w-full bg-gray-100/50 dark:bg-white/5 border-none pl-9 pr-4 py-2 text-[10px] font-bold focus:ring-1 focus:ring-emerald-500 rounded-lg placeholder:text-gray-600 dark:text-white"
          />
        </div>
      </div>

      {/* Top Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border border-gray-200 dark:border-white/5 bg-white/50 dark:bg-black/20 rounded-2xl shadow-sm">
          <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest">
            Page <span className="text-primary">{currentPage}</span> of {totalPages}
          </p>
          <div className="flex gap-1.5">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-600 hover:text-primary disabled:opacity-30 transition-all shadow-sm"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-600 hover:text-primary disabled:opacity-30 transition-all shadow-sm"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="bg-white/50 dark:bg-black/20 rounded-2xl border border-gray-200 dark:border-white/5 overflow-hidden shadow-sm">
        <div className="divide-y divide-gray-100 dark:divide-white/5">
          {paginatedHistory.length > 0 ? paginatedHistory.map((entry, idx) => {
            const config = getEventConfig(entry.type, entry.qty);
            const isSale = entry.type === 'sale' || entry.type === 'return';
            const realName = resolveProductName(entry.productId, entry.productName);

            return (
              <div key={entry.id || idx} className="group flex items-center gap-3 p-2.5 hover:bg-white dark:hover:bg-white/[0.04] transition-all duration-200">
                <div className={`h-8 w-8 rounded-lg ${config.bg} flex items-center justify-center shrink-0 border border-white/5`}>
                  <config.icon className={`h-3.5 w-3.5 ${config.color}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-black text-gray-900 dark:text-white truncate uppercase tracking-tight">
                        {realName}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[8px] font-black uppercase px-1.5 py-px rounded bg-opacity-10 ${config.bg} ${config.color}`}>
                          {config.label}
                        </span>
                        <span className="text-[9px] font-bold text-gray-600 flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {formatAppTime(entry.date)}
                        </span>
                        <span className="text-[9px] font-bold text-gray-600 flex items-center gap-1">
                          <User className="h-2.5 w-2.5" />
                          {entry.user.split('@')[0]}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-[11px] font-black uppercase tracking-tighter ${entry.qty < 0 ? 'text-amber-500' : 'text-primary'}`}>
                        {config.qtyPrefix}{Math.abs(entry.qty) >= 990000 ? '∞' : Math.abs(entry.qty)} Units
                      </span>
                      
                      <div className="flex items-center gap-1 lg:sm:opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => onViewProduct(entry.productId)}
                          className="p-1.5 hover:bg-blue-500 hover:text-white text-gray-600 rounded-lg transition-all"
                        >
                          <Eye className="h-3 w-3" />
                        </button>
                        {isSale && entry.reference && (
                          <button 
                            onClick={() => onViewBill(entry.reference)}
                            className="p-1.5 hover:bg-primary hover:text-white text-gray-600 rounded-lg transition-all"
                          >
                            <Receipt className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          }) : (
            <div className="py-20 text-center opacity-30">
               <History className="h-10 w-10 mx-auto mb-3" />
               <p className="text-[10px] font-black uppercase tracking-[0.2em]">No Activity in {activeTab}</p>
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between p-2">
          <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest italic">
            Page {currentPage} / {totalPages}
          </p>
          <div className="flex gap-2">
            <button 
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => p - 1)}
              className="p-2 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl disabled:opacity-20 hover:scale-105 active:scale-95 transition-all"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button 
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
              className="p-2 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl disabled:opacity-20 hover:scale-105 active:scale-95 transition-all"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
