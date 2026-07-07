import { useState, useEffect } from 'react';
import { X, RefreshCw, Trash2, AlertCircle, Database, Clock, CloudOff, CheckCircle2 } from 'lucide-react';
import { localDb } from '../../lib/localDb';
import { syncNow } from '../../lib/syncEngine';
import { useApp } from '../../context/SupabaseAppContext';
import { formatAppDate, formatAppTime, formatAppDateTime } from '../../lib/dateUtils';
import { Modal } from '../common/Modal';
import { useTranslation } from '../../hooks/useTranslation';

interface SyncQueueModalProps {
    onClose: () => void;
}

export function SyncQueueModal({ onClose }: SyncQueueModalProps) {
    const { state, dispatch } = useApp();
    const { t } = useTranslation();
    const [queue, setQueue] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);

    const loadQueue = async () => {
        try {
            const items = await localDb.pendingOps.toArray();
            setQueue(items);
        } catch (error) {
            console.error('Failed to load sync queue:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadQueue();
        // Set up an interval or listener for sync changes
        const handleSyncChange = () => loadQueue();
        window.addEventListener('pendingops-changed', handleSyncChange);
        return () => window.removeEventListener('pendingops-changed', handleSyncChange);
    }, []);

    const handleRetryAll = async () => {
        setIsSyncing(true);
        try {
            await syncNow();
            await loadQueue();
        } finally {
            setIsSyncing(false);
        }
    };

    const handleDeleteItem = async (item: any) => {
        if (!confirm(`Are you sure you want to cancel this ${item.entity} sync?`)) return;
        try {
            await localDb.pendingOps.delete(item.id);
            await loadQueue();
        } catch (error) {
            console.error('Failed to delete sync item:', error);
        }
    };

    const getEntityIcon = (entity: string) => {
        switch (entity) {
            case 'sales': return <Database className="h-4 w-4 text-primary" />;
            case 'products': return <Database className="h-4 w-4 text-blue-500" />;
            case 'customers': return <Database className="h-4 w-4 text-purple-500" />;
            case 'salesTabs': return <Database className="h-4 w-4 text-amber-500" />;
            default: return <Database className="h-4 w-4 text-gray-600" />;
        }
    };

    const getStatusBadge = (item: any) => {
        if (item.retries >= 5) {
            return (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[9px] font-black uppercase tracking-wider">
                    <CloudOff className="h-3 w-3" /> {t('stuck', 'STUCK')}
                </span>
            );
        }
        if (item.retries > 0) {
            return (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-[9px] font-black uppercase tracking-wider">
                    <RefreshCw className="h-3 w-3 animate-spin" /> {t('retrying', 'RETRYING')} ({item.retries})
                </span>
            );
        }
        return (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[9px] font-black uppercase tracking-wider">
                <Clock className="h-3 w-3" /> {t('pending', 'PENDING')}
            </span>
        );
    };

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title={t('sync_queue_manager', 'SYNC QUEUE MANAGER')}
            subtitle={t('items_waiting_to_sync', '{count} ITEMS WAITING TO SYNC').replace('{count}', queue.length.toString())}
            maxWidth="sm"
            footer={
                <div className="flex items-center justify-between w-full">
                    <p className="text-[9px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest leading-tight hidden sm:block max-w-[180px]">
                        {t('sync_stuck_info', "ITEMS ARE AUTOMATICALLY RETRIED 5 TIMES BEFORE BEING MARKED AS 'STUCK'.")}
                    </p>
                    <div className="flex items-center justify-end gap-2 sm:gap-3 flex-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 sm:flex-none px-4 sm:px-6 py-2.5 sm:py-3.5 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-white hover:bg-gray-50 dark:hover:bg-white/5 text-[9px] sm:text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all active:scale-95 shrink-0"
                        >
                            {t('close', 'CLOSE')}
                        </button>
                        <button
                            type="button"
                            onClick={handleRetryAll}
                            disabled={isSyncing || queue.length === 0}
                            className="btn btn-md btn-primary flex-1 sm:flex-none sm:min-w-[200px] !py-2.5 sm:!py-3.5 !text-[9px] sm:!text-[11px]"
                        >
                            <RefreshCw className={`h-4 w-4 sm:h-5 sm:w-5 ${isSyncing ? 'animate-spin' : ''} shrink-0`} />
                            <span>{isSyncing ? t('syncing', 'SYNCING...') : t('force_resync', 'RETRY ALL')}</span>
                        </button>
                    </div>
                </div>
            }
        >
            <div className="min-h-[300px]">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
                        <RefreshCw className="h-10 w-10 animate-spin text-primary" />
                        <p className="font-black uppercase tracking-[0.2em] text-[10px] text-primary">{t('initializing_audit', 'Initializing Audit...')}</p>
                    </div>
                ) : queue.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center gap-6">
                        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center border-2 border-primary/20">
                            <CheckCircle2 className="h-10 w-10 text-primary" />
                        </div>
                        <div>
                            <h3 className="text-[20px] font-black text-gray-900 dark:text-white tracking-tight uppercase">{t('queue_clear', 'Queue Clear!')}</h3>
                            <p className="text-[12px] text-gray-600 font-bold uppercase tracking-widest mt-2 leading-relaxed">
                                {t('all_mirrored', 'All local changes are mirrored to cloud.')}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3 animate-in slide-in-from-bottom-4 duration-300">
                        {queue.map((item) => (
                            <div key={item.id} className={`group relative p-4 rounded-[20px] border transition-all active:scale-[0.98] ${
                                item.retries >= 5
                                ? 'bg-rose-500/5 border-rose-500/20 dark:bg-rose-500/10'
                                : 'bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 hover:border-primary/30 hover:bg-primary/5 dark:hover:bg-primary/10'
                            }`}>
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className={`p-3 rounded-2xl ${item.retries >= 5 ? 'bg-rose-500/20' : 'bg-white dark:bg-white/10 shadow-sm border border-gray-200 dark:border-transparent'}`}>
                                            {getEntityIcon(item.entity)}
                                        </div>
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-900 dark:text-white">
                                                    {item.opType} {item.entity}
                                                </span>
                                                {getStatusBadge(item)}
                                            </div>
                                            <p className="text-[9px] text-gray-600 dark:text-gray-500 font-bold uppercase tracking-widest line-clamp-1">
                                                ID: {(item.entityId || item.entity_id || 'UNKNOWN').slice(0, 8)} • {formatAppTime(item.createdAt || item.created_at, state.settings.country)}
                                            </p>
                                        </div>
                                    </div>
                                    <button onClick={() => handleDeleteItem(item)} className="p-2 text-gray-600 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all shrink-0">
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                                {item.lastError && (
                                    <div className="mt-4 p-3 rounded-xl bg-white/50 dark:bg-black/20 border border-rose-500/10">
                                        <p className="text-[9px] font-black text-rose-500 break-words leading-tight uppercase tracking-tight">
                                            {t('rejected', 'REJECTED')}: {item.lastError}
                                        </p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Modal>
    );
}
