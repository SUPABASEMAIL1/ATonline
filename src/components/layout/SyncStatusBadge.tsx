import { useSync } from '../../hooks/useSync';
import { WifiOff, RefreshCw, CheckCircle, Cloud, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { SyncQueueManager } from './SyncQueueManager';
import { useApp } from '../../context/SupabaseAppContext';
import { formatAppTime, formatAppDateTime } from '../../lib/dateUtils';

export function SyncStatusBadge() {
    const { isOnline, isSyncing, pendingCount, lastSyncTime, hasError, isRetrying } = useSync();
    const [showManager, setShowManager] = useState(false);
    const { state } = useApp();

    const isStale = isOnline && !isSyncing && pendingCount === 0 && !hasError && lastSyncTime &&
        (Date.now() - lastSyncTime.getTime()) > 5 * 60 * 1000;

    // 1. Syncing State (Yellow/Amber)
    if (isSyncing) {
        return (
            <>
                <button
                    onClick={() => setShowManager(true)}
                    style={{ minHeight: 'unset' }}
                    className="flex items-center justify-center gap-1.5 flex-shrink-0 w-8 h-8 sm:w-auto sm:h-9 px-2.5 sm:px-3 rounded-full bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-transparent shadow-sm transition-all animate-pulse"
                    title="Syncing changes to Zaynahs DB... Click to view queue."
                >
                    <RefreshCw className="h-5 w-5 sm:h-3 sm:w-3 animate-spin" />
                    <span className="text-[9px] font-bold uppercase tracking-tight hidden sm:block">Syncing...</span>
                </button>
                {showManager && <SyncQueueManager onClose={() => setShowManager(false)} />}
            </>
        );
    }

    // 1.5. Error State (Red Alert) - Priority over other states when online
    if (hasError && isOnline) {
        return (
            <>
                <button
                    onClick={() => setShowManager(true)}
                    style={{ minHeight: 'unset' }}
                    className="flex items-center justify-center gap-1.5 flex-shrink-0 w-8 h-8 sm:w-auto sm:h-9 px-2.5 sm:px-3 rounded-full bg-red-500/20 dark:bg-red-500/30 text-red-600 dark:text-red-400 border border-transparent shadow-md hover:scale-105 active:scale-95 transition-all group animate-bounce"
                    title="Critical Sync Error: Some items are failing to sync. Click to view and retry."
                >
                    <AlertCircle className="h-5 w-5 sm:h-3.5 sm:w-3.5" />
                    <span className="text-[9px] font-black uppercase tracking-tight hidden sm:block">Sync Error</span>
                </button>
                {showManager && <SyncQueueManager onClose={() => setShowManager(false)} />}
            </>
        );
    }

    // 2. Offline State (Red)
    if (!isOnline) {
        return (
            <>
                <button
                    onClick={() => setShowManager(true)}
                    style={{ minHeight: 'unset' }}
                    className="flex items-center justify-center gap-1.5 flex-shrink-0 w-8 h-8 sm:w-auto sm:h-9 px-2.5 sm:px-3 rounded-full bg-red-500/10 dark:bg-red-500/20 text-red-500 dark:text-red-400 border border-transparent shadow-sm relative active:scale-95 transition-all"
                    title="Offline — Changes saved locally. Click to view pending queue."
                >
                    <WifiOff className="h-5 w-5 sm:h-3 sm:w-3" />
                    {pendingCount > 0 && (
                        <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 flex sm:hidden items-center justify-center bg-red-600 text-white rounded-full text-[9px] font-black shadow-sm">
                            {pendingCount}
                        </span>
                    )}
                    <div className="hidden sm:flex items-center gap-1 leading-none">
                        <span className="text-[9px] font-bold uppercase tracking-tight">Offline</span>
                        {pendingCount > 0 && (
                            <span className="h-3.5 min-w-[14px] px-1 flex items-center justify-center bg-red-600 text-white rounded-full text-[8px] font-black">
                                {pendingCount}
                            </span>
                        )}
                    </div>
                </button>
                {showManager && <SyncQueueManager onClose={() => setShowManager(false)} />}
            </>
        );
    }

    // 3. Pending Sync Changes (Amber/Orange)
    if (pendingCount > 0) {
        if (isRetrying) {
            return (
                <>
                    <button
                        onClick={() => setShowManager(true)}
                        style={{ minHeight: 'unset' }}
                        className="flex items-center justify-center gap-1.5 flex-shrink-0 w-8 h-8 sm:w-auto sm:h-9 px-2.5 sm:px-3 rounded-full bg-amber-500/20 dark:bg-amber-500/30 text-amber-600 dark:text-amber-400 border border-transparent shadow-sm transition-all relative active:scale-95"
                        title={`${pendingCount} changes struggling to sync — last sync: ${lastSyncTime ? formatAppDateTime(lastSyncTime, state.settings.country) : 'never'}. Click to view queue.`}
                    >
                        <RefreshCw className="h-5 w-5 sm:h-3 sm:w-3 animate-spin" />
                        <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 flex sm:hidden items-center justify-center bg-amber-500 text-white rounded-full text-[9px] font-black shadow-sm">
                            {pendingCount}
                        </span>
                        <span className="text-[9px] font-bold uppercase tracking-tight hidden sm:block">Retrying...</span>
                    </button>
                    {showManager && <SyncQueueManager onClose={() => setShowManager(false)} />}
                </>
            );
        }

        return (
            <>
                <button
                    onClick={() => setShowManager(true)}
                    style={{ minHeight: 'unset' }}
                    className="flex items-center justify-center gap-1.5 flex-shrink-0 w-8 h-8 sm:w-auto sm:h-9 px-2.5 sm:px-3 rounded-full bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-transparent shadow-sm hover:scale-105 active:scale-95 transition-all group relative"
                    title={`${pendingCount} changes waiting to sync — last sync: ${lastSyncTime ? formatAppDateTime(lastSyncTime, state.settings.country) : 'never'}. Click to view queue.`}
                >
                    <Cloud className="h-5 w-5 sm:h-3 sm:w-3 animate-bounce" />
                    <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 flex sm:hidden items-center justify-center bg-amber-500 text-white rounded-full text-[9px] font-black shadow-sm">
                        {pendingCount}
                    </span>
                    <div className="hidden sm:flex items-center gap-1 leading-none">
                        <span className="text-[9px] font-bold uppercase tracking-tight">
                            Pending
                        </span>
                        <span className="h-3.5 min-w-[14px] px-1 flex items-center justify-center bg-amber-500 text-white rounded-full text-[8px] font-black">
                            {pendingCount}
                        </span>
                        {lastSyncTime && (
                            <span className="text-[8px] font-mono opacity-60 bg-primary/10 px-1 rounded-sm border border-primary/20">
                                {formatAppTime(lastSyncTime, state.settings.country, false)}
                            </span>
                        )}
                    </div>
                </button>
                {showManager && <SyncQueueManager onClose={() => setShowManager(false)} />}
            </>
        );
    }

    // 4. Stale Data Warning (Amber) — online but no server contact in 5+ min
    if (isStale) {
        return (
            <>
                <button
                    onClick={() => setShowManager(true)}
                    style={{ minHeight: 'unset' }}
                    className="flex items-center justify-center gap-1.5 flex-shrink-0 w-8 h-8 sm:w-auto sm:h-9 px-2.5 sm:px-3 rounded-full bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-transparent shadow-sm animate-pulse"
                    title={`Data may be stale — last sync: ${lastSyncTime ? formatAppDateTime(lastSyncTime, state.settings.country) : 'never'}. Click to check.`}
                >
                    <Cloud className="h-5 w-5 sm:h-3 sm:w-3" />
                    <div className="hidden sm:flex items-center gap-1 leading-none">
                        <span className="text-[9px] font-bold uppercase tracking-tight">Stale</span>
                        {lastSyncTime && (
                            <span className="text-[8px] font-mono opacity-60 bg-primary/10 px-1 rounded-sm border border-primary/20">
                                {formatAppTime(lastSyncTime, state.settings.country, false)}
                            </span>
                        )}
                    </div>
                </button>
                {showManager && <SyncQueueManager onClose={() => setShowManager(false)} />}
            </>
        );
    }

    // 5. Fully Synced State (Green)
    return (
        <>
            <button
                onClick={() => setShowManager(true)}
                style={{ minHeight: 'unset' }}
                className="flex items-center justify-center gap-1.5 flex-shrink-0 w-8 h-8 sm:w-auto sm:h-9 px-2.5 sm:px-3 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 text-primary dark:text-emerald-400 border border-transparent group cursor-pointer transition-all hover:bg-emerald-500/20 dark:hover:bg-emerald-800/30"
                title={lastSyncTime ? `Verified Cloud Handshake: ${formatAppDateTime(lastSyncTime, state.settings.country)} - Click to view history.` : 'Everything in sync - Click to view history.'}
            >
                <CheckCircle className="h-5 w-5 sm:h-3 sm:w-3 opacity-80" />
                <div className="hidden sm:flex items-center leading-none gap-1 sm:gap-1.5 text-left">
                    <span className="text-[9px] font-black uppercase tracking-tight opacity-90">Sync OK</span>
                    {lastSyncTime && (
                        <span className="text-[8px] font-mono opacity-60 bg-primary/10 px-1 rounded-sm border border-primary/20">
                            {formatAppTime(lastSyncTime, state.settings.country, false)}
                        </span>
                    )}
                </div>
            </button>
            {showManager && <SyncQueueManager onClose={() => setShowManager(false)} />}
        </>
    );
}
