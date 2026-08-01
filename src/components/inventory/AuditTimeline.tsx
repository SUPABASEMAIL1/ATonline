import React, { useState, useMemo, useEffect } from 'react';
import { 
  History, ShoppingCart, ArrowDownLeft, ArrowUpRight, 
  Settings, User, Clock, Package, Eye, Receipt,
  Filter,
  ArrowRightLeft, Database
} from 'lucide-react';
import { useApp } from '../../context/SupabaseAppContext';
import { formatAppDate, formatAppTime } from '../../lib/dateUtils';
import { localDb } from '../../lib/localDb';
import { SharedSearchBar } from '../../shared/modules/search-and-list';
import { Badge, Button, EmptyState, Pagination } from '../../shared/ui';
import { ExportButton } from '../../shared/export';

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

  const exportColumns = [
    { key: 'date', label: 'Date' },
    { key: 'product', label: 'Product' },
    { key: 'type', label: 'Type' },
    { key: 'qty', label: 'Qty', format: 'number' as const },
    { key: 'user', label: 'User' },
    { key: 'reference', label: 'Reference' },
    { key: 'note', label: 'Notes' },
  ];

  const exportRows = useMemo(() => filteredHistory.map(entry => ({
    date: entry.date.toLocaleString(),
    product: resolveProductName(entry.productId, entry.productName),
    type: entry.type,
    qty: entry.qty,
    user: entry.user,
    reference: entry.reference || '',
    note: entry.note || '',
  })), [filteredHistory, state.products]);

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

        <div className="w-full sm:w-64 px-2">
          <SharedSearchBar
            value={searchTerm}
            onChange={(val) => { setSearchTerm(val); setCurrentPage(1); }}
            placeholder="Search within tab..."
          />
        </div>

        <div className="px-2">
          <ExportButton
            data={exportRows}
            columns={exportColumns}
            title="Audit Timeline"
            compact
          />
        </div>
      </div>

      {/* Top Pagination — shared Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border border-gray-200 dark:border-white/5 bg-white/50 dark:bg-black/20 rounded-2xl shadow-sm">
          <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest">
            Page <span className="text-primary">{currentPage}</span> of {totalPages}
          </p>
          <Pagination mode="prevNext" page={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
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
                        <Badge size="sm" tone="neutral" className={`!text-[8px] !px-1.5 !py-px !rounded !${config.bg} !${config.color}`}>
                          {config.label}
                        </Badge>
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
                        <Button
                          onClick={() => onViewProduct(entry.productId)}
                          variant="ghost"
                          className="!min-h-0 !p-1.5 !rounded-lg !text-gray-600 hover:!bg-blue-500 hover:!text-white"
                          icon={<Eye className="h-3 w-3" />}
                        />
                        {isSale && entry.reference && (
                          <Button
                            onClick={() => onViewBill(entry.reference)}
                            variant="ghost"
                            className="!min-h-0 !p-1.5 !rounded-lg !text-gray-600 hover:!bg-primary hover:!text-white"
                            icon={<Receipt className="h-3 w-3" />}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          }) : (
            <EmptyState compact className="!py-20 opacity-30" icon={<History className="h-full w-full" />} title={`No Activity in ${activeTab}`} />
          )}
        </div>
      </div>

      {/* Pagination — shared Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between p-2">
          <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest italic">
            Page {currentPage} / {totalPages}
          </p>
          <Pagination mode="prevNext" page={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
        </div>
      )}
    </div>
  );
}
