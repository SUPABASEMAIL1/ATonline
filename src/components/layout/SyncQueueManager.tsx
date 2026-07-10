import { X, RefreshCw, Trash2, AlertCircle, CheckCircle2, Database, Package, Users, Receipt, Wallet, Layers, Building2, Clock, ShieldAlert, ChevronDown } from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';
import { localDb } from '../../lib/localDb';
import { retrySyncAll, clearStuckOps, syncNow } from '../../lib/syncEngine';
import { useApp } from '../../context/SupabaseAppContext';
import { Modal } from '../common/Modal';
import { cn } from '../../lib/utils';
import { useTranslation } from '../../hooks/useTranslation';

interface SyncQueueManagerProps {
    onClose: () => void;
}

export function SyncQueueManager({ onClose }: SyncQueueManagerProps) {
    const { t } = useTranslation();
    const [ops, setOps] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

    const [authError, setAuthError] = useState(false);

    const refresh = async () => {
        const all = await localDb.pendingOps.toArray();
        setOps(all.sort((a, b) => b.createdAt - a.createdAt));
        // Check if ops are stuck due to auth errors
        const hasAuthErrors = all.some(op =>
            op.lastError && (
                op.lastError.toLowerCase().includes('401') ||
                op.lastError.toLowerCase().includes('jwt') ||
                op.lastError.toLowerCase().includes('unauthorized') ||
                op.lastError.toLowerCase().includes('token expired') ||
                op.lastError.toLowerCase().includes('permission denied')
            )
        );
        setAuthError(hasAuthErrors);
    };

    useEffect(() => {
        refresh();
        const interval = setInterval(refresh, 2000);
        window.addEventListener('pendingops-changed', refresh);
        window.addEventListener('sync-status-changed', refresh);
        const onVisible = () => { if (!document.hidden) refresh(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            clearInterval(interval);
            window.removeEventListener('pendingops-changed', refresh);
            window.removeEventListener('sync-status-changed', refresh);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, []);

    const { groups, ungrouped } = useMemo(() => {
        const map = new Map<string, any[]>();
        const single: any[] = [];
        for (const op of ops) {
            if (op.batchId) {
                const list = map.get(op.batchId);
                if (list) list.push(op);
                else map.set(op.batchId, [op]);
            } else {
                single.push(op);
            }
        }
        return { groups: Array.from(map.entries()), ungrouped: single };
    }, [ops]);

    const totalCount = ops.length;
    const groupCount = groups.length;

    const toggleCollapse = (batchId: string) => {
        setCollapsed(prev => {
            const next = new Set(prev);
            if (next.has(batchId)) next.delete(batchId);
            else next.add(batchId);
            return next;
        });
    };

    const handleRetry = async () => {
        setLoading(true);
        // Fix poisoned payloads before retrying
        await localDb.pendingOps
            .filter(q => q.entity === 'products' && q.operation === 'create')
            .modify(q => {
                if (!q.payload.sku) q.payload.sku = q.payload.id || q.payload.barcode_value || `SKU-${Date.now()}`;
                if (q.payload.variantData) {
                    q.payload.variant_data = q.payload.variantData;
                    delete q.payload.variantData;
                }
            });
            
        // Force unstick all items
        await localDb.pendingOps.toCollection().modify({ retries: 0, status: 'pending' });
        
        await retrySyncAll();
        await syncNow();
        setLoading(false);
    };

    const handleClear = async () => {
        if (!confirm('This will delete all items that have failed 5+ times. Are you sure?')) return;
        await clearStuckOps();
        window.dispatchEvent(new Event('pendingops-changed'));
        refresh();
    };

    const handleDeleteOp = async (id: string) => {
        await localDb.pendingOps.delete(id);
        window.dispatchEvent(new Event('pendingops-changed'));
        refresh();
    };

    const getEntityIcon = (entity: string) => {
        const e = entity.toLowerCase();
        if (e.includes('sale')) return <Receipt className="w-4 h-4 text-primary" />;
        if (e.includes('product')) return <Package className="w-4 h-4 text-blue-500" />;
        if (e.includes('customer')) return <Users className="w-4 h-4 text-purple-500" />;
        if (e.includes('expense')) return <Wallet className="w-4 h-4 text-rose-500" />;
        if (e.includes('category')) return <Layers className="w-4 h-4 text-amber-500" />;
        if (e.includes('supplier')) return <Building2 className="w-4 h-4 text-teal-500" />;
        return <Database className="w-4 h-4 text-gray-600" />;
    };

    const getStatusBadge = (op: any) => {
        const retries = op.retries || 0;
        const isFailed = op.status === 'failed';

        if (isFailed) return (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[8px] font-black uppercase tracking-widest">
                <ShieldAlert className="w-2.5 h-2.5" /> {t('stuck', 'STUCK')}
            </span>
        );

        if (retries > 0) return (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[8px] font-black uppercase tracking-widest">
                <RefreshCw className="w-2.5 h-2.5 animate-spin" /> {retries}
            </span>
        );

        return (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-500 text-[8px] font-black uppercase tracking-widest">
                <Clock className="w-2.5 h-2.5" /> {t('pending', 'WAIT')}
            </span>
        );
    };

    const getGroupStatusBadge = (children: any[]) => {
        const hasFailed = children.some(c => c.status === 'failed');
        const maxRetries = Math.max(...children.map(c => c.retries || 0));
        const allPending = children.every(c => c.status === 'pending' && !c.retries);

        if (hasFailed) return (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[8px] font-black uppercase tracking-widest">
                <ShieldAlert className="w-2.5 h-2.5" /> {t('stuck', 'STUCK')}
            </span>
        );
        if (maxRetries > 0) return (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[8px] font-black uppercase tracking-widest">
                <RefreshCw className="w-2.5 h-2.5 animate-spin" /> {maxRetries}
            </span>
        );
        return (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-500 text-[8px] font-black uppercase tracking-widest">
                <Clock className="w-2.5 h-2.5" /> {t('pending', 'WAIT')}
            </span>
        );
    };

    const getGroupLabel = (children: any[]) => {
        const saleOp = children.find(c => c.entity === 'sales');
        if (saleOp) return `Sale ${saleOp.opType}`;
        const entities = [...new Set(children.map(c => c.entity))];
        return entities.join(', ');
    };

    const footer = (
        <div className="flex items-center gap-2 sm:gap-3 w-full">
            <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3.5 border border-rose-200 dark:border-rose-900/30 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-[9px] sm:text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all active:scale-95 bg-white dark:bg-transparent shrink-0"
            >
                {t('close', 'CLOSE')}
            </button>
            <button
                type="button"
                onClick={handleRetry}
                disabled={loading || ops.length === 0}
                className="btn btn-md btn-primary flex-[2] !py-2.5 sm:!py-3.5 !text-[9px] sm:!text-[11px]"
            >
                <RefreshCw className={cn("h-4 w-4 sm:h-5 sm:w-5 shrink-0", loading && "animate-spin")} />
                <span>{loading ? t('syncing', 'SYNCING...') : t('force_resync', 'FORCE RE-SYNC')}</span>
            </button>
        </div>
    );

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title={t('sync_queue_manager', 'Cloud Handshake')}
            maxWidth="sm"
            footer={footer}
        >
            <div className="flex flex-col gap-6">
                {totalCount === 0 ? (
                    <div className="py-12 flex flex-col items-center justify-center text-center">
                        <div className="w-20 h-20 rounded-[2rem] bg-primary/10 flex items-center justify-center border border-primary/20 shadow-xl shadow-emerald-500/10 animate-in zoom-in-95 duration-500">
                            <CheckCircle2 className="h-10 w-10 text-primary" />
                        </div>
                        <h3 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight mt-6">{t('queue_clear', 'Matrix Sync Complete')}</h3>
                        <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mt-2 max-w-[200px] leading-relaxed">{t('all_mirrored', 'All local mutations are mirrored in global matrix.')}</p>
                    </div>
                ) : (
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1.5 custom-scrollbar min-h-[120px]">
                        {authError && (
                            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                                <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                                <div className="text-[9px] font-bold text-rose-600 dark:text-rose-400 leading-relaxed">
                                    Auth session issue detected — tokens may be expired. Click <strong>FORCE RE-SYNC</strong> to refresh session and retry.
                                </div>
                            </div>
                        )}
                        <div className="flex items-center justify-between mb-2 sticky top-0 bg-white dark:bg-surface z-10 py-1">
                            <p className="text-[9px] font-black text-gray-600 uppercase tracking-[0.2em]">
                                {groupCount > 0
                                    ? `${totalCount} TRANSMISSIONS (${groupCount} GROUPS)`
                                    : `${totalCount} TRANSMISSIONS PENDING`}
                            </p>
                            {ops.some(o => o.status === 'failed') && (
                                <button onClick={handleClear} className="text-[8px] font-black text-rose-500 uppercase tracking-widest hover:underline px-2 py-1 bg-rose-500/5 rounded-lg">{t('flush_stuck', 'Flush Stuck')}</button>
                            )}
                        </div>

                        {groups.map(([batchId, children]) => {
                            const isCollapsed = collapsed.has(batchId);
                            return (
                                <div key={batchId} className="rounded-xl border border-gray-200 dark:border-white/5 bg-[#f8f9fa] dark:bg-white/[0.02] overflow-hidden">
                                    <button
                                        onClick={() => toggleCollapse(batchId)}
                                        className="w-full flex items-center justify-between gap-3 p-2.5 hover:bg-white dark:hover:bg-white/5 transition-all"
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className="p-2 rounded-lg bg-white dark:bg-black/20 border border-gray-200 dark:border-white/5 shrink-0 shadow-sm">
                                                <Receipt className="w-4 h-4 text-primary" />
                                            </div>
                                            <div className="min-w-0 text-left">
                                                <p className="text-[9px] font-black uppercase text-gray-900 dark:text-white truncate tracking-tight leading-none mb-1">
                                                    {getGroupLabel(children)}
                                                </p>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[7px] font-bold text-gray-600 uppercase tracking-widest">{children.length} UPDATES</span>
                                                    {getGroupStatusBadge(children)}
                                                </div>
                                            </div>
                                        </div>
                                        <ChevronDown className={cn("w-3.5 h-3.5 text-gray-400 transition-transform shrink-0", !isCollapsed && "rotate-180")} />
                                    </button>
                                    {!isCollapsed && (
                                        <div className="border-t border-gray-200 dark:border-white/5">
                                            {children.map((op) => (
                                                <div key={op.id} className="group flex items-center justify-between gap-3 px-3 py-2 hover:bg-white dark:hover:bg-white/5 transition-all border-b border-gray-100 dark:border-white/[0.02] last:border-b-0">
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <div className="p-1.5 rounded-lg bg-white dark:bg-black/20 border border-gray-200 dark:border-white/5 shrink-0 shadow-sm">
                                                            {getEntityIcon(op.entity)}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-[8px] font-black uppercase text-gray-900 dark:text-white truncate tracking-tight leading-none mb-0.5">
                                                                {op.opType} {op.entity}
                                                            </p>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[6px] font-bold text-gray-600 uppercase tracking-widest">ID:{op.entityId?.slice(0, 6)}</span>
                                                                {getStatusBadge(op)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <button onClick={() => handleDeleteOp(op.id)} className="p-1.5 text-gray-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all active:scale-90 opacity-0 group-hover:opacity-100">
                                                        <Trash2 className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {ungrouped.map((op) => (
                            <div key={op.id} className="group p-2.5 rounded-xl border border-gray-200 dark:border-white/5 bg-[#f8f9fa] dark:bg-white/[0.02] flex items-center justify-between gap-3 transition-all hover:bg-white dark:hover:bg-white/5">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="p-2 rounded-lg bg-white dark:bg-black/20 border border-gray-200 dark:border-white/5 shrink-0 shadow-sm">
                                        {getEntityIcon(op.entity)}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[9px] font-black uppercase text-gray-900 dark:text-white truncate tracking-tight leading-none mb-1">
                                            {op.opType} {op.entity}
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[7px] font-bold text-gray-600 uppercase tracking-widest">ID:{op.entityId?.slice(0, 6)}</span>
                                            {getStatusBadge(op)}
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => handleDeleteOp(op.id)} className="p-2 text-gray-600 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all active:scale-90">
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="p-4 bg-gray-50 dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-white/5">
                    <p className="text-[9px] font-bold text-gray-600 dark:text-gray-500 uppercase tracking-[0.15em] leading-relaxed text-center">
                        {t('sync_stuck_info', 'PENDING CHANGES SYNC IN BACKGROUND. IF A CHANGE FAILS 5 TIMES, IT IS MARKED STUCK AND NEEDS MANUAL ATTENTION.')}
                    </p>
                </div>
            </div>
        </Modal>
    );
}
