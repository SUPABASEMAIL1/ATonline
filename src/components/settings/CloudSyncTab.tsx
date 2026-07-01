import { useState, useEffect } from 'react';
import { Cloud, RefreshCw, HardDrive, Wifi, WifiOff, AlertTriangle, ShieldCheck, Activity, Zap, Lock, Database } from 'lucide-react';
import { useApp } from '../../context/SupabaseAppContext';
import { syncNow, retrySyncAll } from '../../lib/syncEngine';
import { localDb } from '../../lib/localDb';
import { sonner } from '../../lib/sonner';
import { SyncQueueManager } from '../layout/SyncQueueManager';

export function CloudSyncTab() {
  const { state, dispatch } = useApp();
  const [pendingCount, setPendingCount] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [showManager, setShowManager] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const updateStats = async () => {
      const ops = await localDb.pendingOps.toArray();
      setPendingCount(ops.length);
      setHasError(ops.some(op => op.status === 'error' || (op.retries || 0) >= 5));
    };

    updateStats();
    const interval = setInterval(updateStats, 3000);
    
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleToggle = (key: string, value: boolean) => {
    dispatch({
      type: 'SET_SETTINGS',
      payload: { [key]: value }
    });
    sonner.toast(`Applied change: ${key}`, 'success');
  };

  const handleForceRetry = async () => {
    setIsSyncing(true);
    await retrySyncAll();
    await syncNow();
    setIsSyncing(false);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
      
      {/* Header Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Connection Card */}
        <div className="p-6 bg-white dark:bg-white/[0.02] rounded-[2rem] border border-gray-200 dark:border-white/5 shadow-sm group hover:border-[#10B981]/30 transition-all">
          <div className="flex items-center gap-4">
            <div className={`p-4 rounded-2xl ${isOnline ? 'bg-primary/10' : 'bg-rose-500/10'}`}>
              {isOnline ? <Wifi className="w-6 h-6 text-primary" /> : <WifiOff className="w-6 h-6 text-rose-500" />}
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-600">Connection</p>
              <h4 className={`text-sm font-black ${isOnline ? 'text-primary' : 'text-rose-500'}`}>
                {isOnline ? 'Cloud Linked' : 'Offline Mode'}
              </h4>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-white/5 flex items-center gap-2">
             <Activity className="w-3 h-3 text-gray-600" />
             <div className="flex-1 h-1 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                <div className={`h-full ${isOnline ? 'bg-primary w-full animate-pulse' : 'bg-rose-500 w-1/4'}`} />
             </div>
          </div>
        </div>

        {/* Pending Sync Card */}
        <div 
          onClick={() => setShowManager(true)}
          className="p-6 bg-white dark:bg-white/[0.02] rounded-[2rem] border border-gray-200 dark:border-white/5 shadow-sm group hover:border-amber-500/30 transition-all cursor-pointer"
        >
          <div className="flex items-center gap-4">
            <div className="p-4 bg-amber-500/10 rounded-2xl">
              <Database className="w-6 h-6 text-amber-500" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-600">Pending Sync</p>
              <h4 className="text-sm font-black text-white">{pendingCount} OPS</h4>
            </div>
            <RefreshCw className={`w-5 h-5 text-gray-600 ${isSyncing ? 'animate-spin' : ''}`} />
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-white/5">
             <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-gray-600 uppercase">Status</span>
                <span className={`text-[10px] font-black uppercase ${pendingCount > 0 ? 'text-amber-500' : 'text-primary'}`}>
                    {pendingCount > 0 ? 'Processing' : 'Clean'}
                </span>
             </div>
          </div>
        </div>

        {/* Local Snapshot Card */}
        <div className="p-6 bg-white dark:bg-white/[0.02] rounded-[2rem] border border-gray-200 dark:border-white/5 shadow-sm group hover:border-blue-500/30 transition-all">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-blue-500/10 rounded-2xl">
              <HardDrive className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-600">Snapshot</p>
              <h4 className="text-sm font-black text-rose-500">Invalid Date</h4>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-white/5">
             <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Backup Active</span>
                <div className="w-2 h-2 rounded-full bg-primary shadow-lg shadow-emerald-500/50" />
             </div>
          </div>
        </div>
      </div>

      {/* Conflict Banner */}
      {hasError && (
        <div className="p-6 bg-rose-500/10 border border-rose-500/20 rounded-3xl flex items-center justify-between gap-6 animate-pulse">
           <div className="flex items-center gap-4">
              <div className="p-2.5 bg-rose-500 rounded-xl">
                 <AlertTriangle className="w-5 h-5 text-white" />
              </div>
              <div>
                 <h4 className="text-sm font-black text-rose-500 uppercase tracking-widest">Sync Conflict Detected</h4>
                 <p className="text-xs text-rose-400/80 font-bold">Some transactions failed after multiple attempts. Manual resolution suggested.</p>
              </div>
           </div>
           <button 
            onClick={handleForceRetry}
            className="px-6 py-3 bg-rose-500 text-white font-black text-[10px] uppercase tracking-widest rounded-xl shadow-lg shadow-rose-500/20 active:scale-95 transition-all"
           >
             Force Retry
           </button>
        </div>
      )}

      {/* Settings Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Offline Toggle */}
        <div className="p-8 bg-white dark:bg-white/[0.02] border border-gray-200 dark:border-white/5 rounded-[2.5rem] flex items-center justify-between group transition-all hover:bg-primary/[0.02]">
           <div className="flex items-center gap-6">
              <div className="p-4 bg-white dark:bg-white/10 rounded-2xl border border-gray-200 dark:border-white/5 group-hover:scale-110 transition-transform">
                 <WifiOff className="w-6 h-6 text-primary" />
              </div>
              <div>
                 <h3 className="font-black text-gray-900 dark:text-white mb-1">Relentless Offline Cache</h3>
                 <p className="text-xs text-gray-600 font-bold opacity-60">Guarantee 100% uptime by caching products & sales locally.</p>
              </div>
           </div>
           <SettingSwitch 
            checked={state.settings.offlineMode !== false} 
            onChange={(v) => handleToggle('offlineMode', v)} 
           />
        </div>

        {/* Heartbeat Toggle */}
        <div className="p-8 bg-white dark:bg-white/[0.02] border border-gray-200 dark:border-white/5 rounded-[2.5rem] flex items-center justify-between group transition-all hover:bg-primary/[0.02]">
           <div className="flex items-center gap-6">
              <div className="p-4 bg-white dark:bg-white/10 rounded-2xl border border-gray-200 dark:border-white/5 group-hover:scale-110 transition-transform">
                 <Cloud className="w-6 h-6 text-primary" />
              </div>
              <div>
                 <h3 className="font-black text-gray-900 dark:text-white mb-1">Auto Cloud Heartbeat</h3>
                 <p className="text-xs text-gray-600 font-bold opacity-60">Automatic sync every 30 seconds & on reconnect.</p>
              </div>
           </div>
           <SettingSwitch 
            checked={state.settings.autoSync !== false} 
            onChange={(v) => handleToggle('autoSync', v)} 
           />
        </div>

        {/* AI Toggle */}
        <div className="p-8 bg-white dark:bg-white/[0.02] border border-gray-200 dark:border-white/5 rounded-[2.5rem] flex items-center justify-between group transition-all hover:bg-primary/[0.02]">
           <div className="flex items-center gap-6">
              <div className="p-4 bg-white dark:bg-white/10 rounded-2xl border border-gray-200 dark:border-white/5 group-hover:scale-110 transition-transform">
                 <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                 <h3 className="font-black text-gray-900 dark:text-white mb-1">Zaynahs AI V2</h3>
                 <p className="text-xs text-gray-600 font-bold opacity-60">Enable advanced prediction & inventory insights.</p>
              </div>
           </div>
           <SettingSwitch 
            checked={(state.settings as any).ai_v2_enabled} 
            onChange={(v) => handleToggle('ai_v2_enabled', v)} 
           />
        </div>

        {/* Lock Toggle */}
        <div className="p-8 bg-white dark:bg-white/[0.02] border border-gray-200 dark:border-white/5 rounded-[2.5rem] flex items-center justify-between group transition-all hover:bg-primary/[0.02]">
           <div className="flex items-center gap-6">
              <div className="p-4 bg-white dark:bg-white/10 rounded-2xl border border-gray-200 dark:border-white/5 group-hover:scale-110 transition-transform">
                 <Lock className="w-6 h-6 text-gray-600" />
              </div>
              <div>
                 <h3 className="font-black text-gray-900 dark:text-white mb-1">System Lock</h3>
                 <p className="text-xs text-gray-600 font-bold opacity-60">Freeze critical modifications across all terminals.</p>
              </div>
           </div>
           <SettingSwitch 
            checked={(state.settings as any).isLocked} 
            onChange={(v) => handleToggle('isLocked', v)} 
           />
        </div>

        <div className="md:col-span-2 p-8 bg-white dark:bg-white/[0.02] border border-gray-200 dark:border-white/5 rounded-[2.5rem] flex items-center justify-between group transition-all hover:bg-primary/[0.02]">
           <div className="flex items-center gap-6">
              <div className="p-4 bg-white dark:bg-white/10 rounded-2xl border border-gray-200 dark:border-white/5 group-hover:scale-110 transition-transform">
                 <HardDrive className="w-6 h-6 text-white" />
              </div>
              <div>
                 <h3 className="font-black text-gray-900 dark:text-white mb-1">Automatic Local Backup</h3>
                 <p className="text-xs text-gray-600 font-bold opacity-60 uppercase tracking-widest">Shadow Copy Data Daily</p>
              </div>
           </div>
           <SettingSwitch 
            checked={state.settings.autoBackup !== false} 
            onChange={(v) => handleToggle('autoBackup', v)} 
           />
        </div>
      </div>

      {showManager && <SyncQueueManager onClose={() => setShowManager(false)} />}
    </div>
  );
}

function SettingSwitch({ checked, onChange }: { checked: boolean, onChange: (v: boolean) => void }) {
    return (
        <button
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-8 w-14 items-center rounded-full transition-all duration-300 focus:outline-none ${
                checked ? 'bg-[#10B981]' : 'bg-gray-200 dark:bg-white/10'
            }`}
        >
            <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-300 ${
                    checked ? 'translate-x-7' : 'translate-x-1'
                } shadow-md`}
            />
        </button>
    );
}

