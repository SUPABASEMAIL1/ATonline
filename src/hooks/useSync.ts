import { useState, useEffect, useCallback } from 'react';
import { localDb } from '../lib/localDb';
import { syncNow as triggerSyncNow, getSyncTime } from '../lib/syncEngine';

export function useSync() {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [isSyncing, setIsSyncing] = useState(false);
    const [pendingCount, setPendingCount] = useState(0);
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
    const [hasError, setHasError] = useState(false);
    const [isRetrying, setIsRetrying] = useState(false);

    // Connectivity ping: verify server reachability every 30s
    // (navigator.onLine is unreliable on mobile — returns true in Airplane Mode)
    useEffect(() => {
        let consecutiveFailures = 0;
        let pingTimer: ReturnType<typeof setInterval>;

        const ping = async () => {
            try {
                await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/`, {
                    method: 'HEAD',
                    signal: AbortSignal.timeout(5000)
                });
                // Any HTTP response (401/403/404) = server is reachable
                consecutiveFailures = 0;
                setIsOnline(true);
            } catch {
                consecutiveFailures++;
                if (consecutiveFailures >= 2) {
                    setIsOnline(false);
                }
            }
        };

        if (navigator.onLine) ping();
        pingTimer = setInterval(() => {
            if (navigator.onLine) ping();
        }, 30_000);

        // Re-check when app comes to foreground (mobile browsers
        // often suspend timers in background)
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                consecutiveFailures = 0;
                ping();
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            clearInterval(pingTimer);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, []);

    const refresh = useCallback(async () => {
        const count = await localDb.pendingOps.count();
        setPendingCount(count);
        
        // Check for errored items
        const all = await localDb.pendingOps.toArray();
        setHasError(all.some((op: any) => op.status === 'error' || (op.retries || 0) >= 10));
        setIsRetrying(all.some((op: any) => (op.retries || 0) > 0 && (op.retries || 0) < 10 && op.status !== 'error'));

        // Fetch source-of-truth time from Supabase (as requested)
        const remoteTime = await getSyncTime();
        if (remoteTime) setLastSyncTime(remoteTime);
    }, []);

    const syncNow = useCallback(async () => {
        setIsSyncing(true);
        try {
            await triggerSyncNow();
            await refresh();
        } finally {
            setIsSyncing(false);
        }
    }, [refresh]);

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            triggerSyncNow({ resetRetries: true }).then(refresh).catch(() => {});
        };
        const handleOffline = () => setIsOnline(false);

        const handlePendingChanged = () => {
            refresh();
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        window.addEventListener('pendingops-changed', handlePendingChanged);
        
        // BroadcastChannel listener
        const channel = new BroadcastChannel('pos-sync-channel');
        channel.onmessage = () => refresh();

        refresh();

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('pendingops-changed', handlePendingChanged);
            channel.close();
        };
    }, [refresh, syncNow]);

    return {
        isOnline,
        isSyncing,
        pendingCount,
        lastSyncTime,
        hasError,
        isRetrying,
        syncNow
    };
}
