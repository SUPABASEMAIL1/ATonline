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
        const ping = async () => {
            try {
                const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/`, {
                    method: 'HEAD',
                    signal: AbortSignal.timeout(5000)
                });
                setIsOnline(res.ok);
            } catch {
                setIsOnline(false);
            }
        };
        if (navigator.onLine) ping();
        const timer = setInterval(() => {
            if (navigator.onLine) ping();
        }, 30_000);
        return () => clearInterval(timer);
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
