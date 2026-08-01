import { useState, useEffect } from 'react';
import { Database, HardDrive, Download, Trash2, RotateCcw, PlayCircle, ShieldCheck, FolderSync, XCircle, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../context/SupabaseAppContext';
import { backupService } from '../../lib/backupService';
import { sonner } from '../../lib/sonner';
import { formatAppDateTime } from '../../lib/dateUtils';
import { Button, EmptyState } from '../../shared/ui';

/**
 * BackupTab - Manages both Browser Cache and Physical PC Folder backups.
 */
export function BackupTab() {
  const { state } = useApp();
  const [backups, setBackups] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [folderHandle, setFolderHandle] = useState<any>(null);
  const [hasFolderPermission, setHasFolderPermission] = useState(true);
  const ITEMS_PER_PAGE = 5;

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    setIsLoading(true);
    try {
      const handle = await backupService.getStoredFolderHandle();
      setFolderHandle(handle);
      
      if (handle) {
         const granted = await backupService.requestFolderPermission(handle);
         setHasFolderPermission(granted);
      }

      const all = await backupService.getAllBackups();
      setBackups(all || []);
    } catch (err: any) {
      console.warn('Init failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGrantPermission = async () => {
    if (!folderHandle) return;
    const granted = await backupService.requestFolderPermission(folderHandle);
    setHasFolderPermission(granted);
    if (granted) {
      sonner.success('Permission granted!');
      loadBackups();
    }
  };

  const handleConnectFolder = async () => {
    try {
      const handle = await backupService.selectBackupFolder();
      setFolderHandle(handle);
      sonner.success('PC Folder connected! Future backups will be saved here automatically.');
      loadBackups();
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        sonner.error(`Connection failed: ${err.message}`);
      }
    }
  };

  const handleDisconnectFolder = async () => {
    const result = await sonner.confirm(
      'Disconnect PC Folder?',
      'Automated backups will stop saving to your computer and only use the browser cache.',
      'Yes, Disconnect'
    );
    if (result.isConfirmed) {
      await backupService.disconnectFolder();
      setFolderHandle(null);
      sonner.success('Folder disconnected.');
      loadBackups();
    }
  };

  const loadBackups = async () => {
    setIsLoading(true);
    try {
      const all = await backupService.getAllBackups();
      setBackups(all || []);
    } catch (err: any) {
      sonner.error(`Failed to load backups: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateSnapshot = async () => {
    sonner.loading('Creating system snapshot...');
    try {
      const dateLabel = new Date().toLocaleDateString('en-CA');
      await backupService.runBackup(dateLabel);
      sonner.success('Snapshot created successfully!');
      loadBackups();
    } catch (err: any) {
      sonner.error(`Snapshot failed: ${err.message}`);
    } finally {
      sonner.close();
    }
  };

  const handleDelete = async (filename: string) => {
    const result = await sonner.deleteConfirm('snapshot');
    if (!result.isConfirmed) return;

    sonner.loading('Deleting snapshot...');
    try {
      await backupService.deleteBackup(filename);
      sonner.success('Snapshot removed from both Browser and PC Folder.');
      loadBackups();
    } catch (err: any) {
      sonner.error(`Deletion failed: ${err.message}`);
    } finally {
      sonner.close();
    }
  };

  const handleDownload = async (filename: string) => {
    sonner.loading('Preparing file...');
    try {
      const success = await backupService.downloadBackup(filename);
      if (success) sonner.success('Ready!');
      else throw new Error('Could not retrieve file');
    } catch (err: any) {
      sonner.error(`Action failed: ${err.message}`);
    } finally {
      sonner.close();
    }
  };

  const handleRestoreGuidance = async (filename: string) => {
    const result = await sonner.confirm(
      'Prepare for Recovery?',
      'This will prepare the chosen backup file. You must then manually upload it using the "Import Data" screen in the "Database Tools" section.',
      'Continue'
    );

    if (result.isConfirmed) {
      await handleDownload(filename);
      sonner.toast('Please go to "Database Tools" to import this file.', 'info');
    }
  };

  const sorted = [...backups];
  const totalPages = Math.ceil(sorted.length / ITEMS_PER_PAGE);
  const paginated = sorted.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      
      {/* Premium Header Panel */}
      <div className="p-8 bg-gradient-to-br from-emerald-600 to-teal-700 rounded-[2.5rem] text-white shadow-xl shadow-emerald-500/20 relative overflow-hidden group border border-white/10">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20">
              <ShieldCheck className="w-4 h-4 text-emerald-300" />
              <span className="text-[10px] font-black uppercase tracking-widest">Enterprise Redundancy</span>
            </div>
            <div>
              <h2 className="text-3xl md:text-4xl font-black tracking-tight mb-2">Automated Backups</h2>
              <p className="text-emerald-50 font-medium text-sm md:text-base max-w-xl opacity-90">
                Connect a folder on your computer to save daily snapshots automatically. 
                This ensures your data is always safe on your physical hard drive.
              </p>
            </div>
            
            <div className="flex flex-wrap gap-3">
               {folderHandle ? (
                 <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3 bg-black/20 px-4 py-2 rounded-xl border border-white/10">
                       <CheckCircle2 className={`w-4 h-4 ${hasFolderPermission ? 'text-emerald-400' : 'text-amber-400 animte-pulse'}`} />
                       <span className="text-xs font-bold text-emerald-50 truncate max-w-[150px]">PC Folder: {folderHandle.name}</span>
                       <Button onClick={handleDisconnectFolder} icon={<XCircle className="w-4 h-4 text-red-100/50 hover:text-red-400" />} className="!min-h-0 !p-1 !rounded-lg !hover:bg-white/10" title="Disconnect" />
                    </div>
                    {!hasFolderPermission && (
                       <Button
                        onClick={handleGrantPermission}
                        className="!min-h-0 !px-4 !py-2 !rounded-xl !text-[10px] !font-black !bg-amber-500 hover:!bg-amber-600 !text-white shadow-lg animate-bounce"
                       >
                         GRANT ACCESS TO SAVE
                       </Button>
                    )}
                 </div>
               ) : (
                 <Button
                  onClick={handleConnectFolder}
                  icon={<FolderSync className="w-4 h-4 text-emerald-400" />}
                  className="!min-h-0 !px-6 !py-2.5 !rounded-xl !text-[10px] !font-black !tracking-[0.2em] !gap-2 !bg-white/10 !hover:bg-white/20 !text-white !border !border-white/10"
                  title="Select a folder on your computer to save automatic backups"
                 >
                   SELECT SHOP FOLDER
                 </Button>
               )}
            </div>
            {folderHandle && (
              <p className="text-[10px] text-gray-600 font-bold mt-2 uppercase tracking-widest flex items-center gap-1.5 leading-relaxed">
                <ShieldCheck className="w-3 h-3 text-primary/50" />
                Live Sync Active • Files mirrored directly to local drive
              </p>
            )}
          </div>
          
          <Button
            onClick={handleCreateSnapshot}
            disabled={isLoading}
            className="flex-shrink-0 !min-h-0 !gap-3 !bg-white !text-emerald-700 !px-8 !py-5 !rounded-2xl !font-black !shadow-2xl hover:scale-105 group-hover:shadow-white/20 !text-sm disabled:!opacity-50 hover:!bg-white"
          >
            {isLoading ? <PlayCircle className="w-5 h-5 animate-spin" /> : <Database className="w-5 h-5" />}
            <span>CREATE SNAPSHOT NOW</span>
          </Button>
        </div>
        <Database className="absolute -bottom-10 -right-10 w-64 h-64 text-white p-0 opacity-[0.05] group-hover:scale-110 transition-transform duration-700" />
      </div>

      {/* Snapshots List */}
      <div className="bg-white dark:bg-surface rounded-[2rem] border border-gray-200 dark:border-white/5 overflow-hidden shadow-sm">
        <div className="p-6 border-b border-gray-200 dark:border-white/5 flex items-center justify-between bg-gray-50/30 dark:bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-50 dark:bg-primary/10 text-primary dark:text-emerald-400 rounded-xl">
              <HardDrive className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-black text-gray-900 dark:text-white">Snapshot History</h3>
              <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold">Synchronized across Browser & PC</p>
            </div>
          </div>
          <Button onClick={loadBackups} className="!min-h-0 !p-0 !text-xs !text-primary dark:!text-emerald-400 hover:!underline !hover:bg-transparent !normal-case !tracking-normal">Refresh List</Button>
        </div>

        {backups.length === 0 ? (
          <EmptyState
            icon={<Database className="h-10 w-10" />}
            title="No snapshots found yet."
            className="!p-20"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="bg-gray-50/50 dark:bg-black/20 text-gray-600 dark:text-gray-400 font-black uppercase text-[10px] tracking-widest">
                  <th className="p-6">Filename</th>
                  <th className="p-6 text-center">Location</th>
                  <th className="p-6 text-right">Size</th>
                  <th className="p-6 text-right">Created Date</th>
                  <th className="p-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {paginated.map((b, i) => (
                  <tr key={i} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.01] transition-colors group">
                    <td className="p-6 font-mono text-[11px] text-gray-600 dark:text-gray-300 max-w-[240px] truncate" title={b.filename}>
                      {b.filename}
                    </td>
                    <td className="p-6 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase border flex items-center gap-1 ${b.isPCFile ? 'bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-500/10 dark:border-indigo-500/20' : 'bg-emerald-50 text-primary border-emerald-100 dark:bg-primary/10 dark:border-primary/20'}`}>
                          {b.isPCFile ? <HardDrive className="w-3 h-3" /> : <Database className="w-3 h-3" />}
                          {b.isPCFile ? 'PC Folder' : 'Browser'}
                        </span>
                        {b.inPC && (
                          <span className="px-2 py-1 rounded-lg text-[9px] font-black uppercase border bg-emerald-50 text-primary border-emerald-100 dark:bg-primary/10 dark:border-primary/20 flex items-center gap-1" title="Also in PC Folder">
                             <CheckCircle2 className="w-3 h-3" /> Sync
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-6 text-right font-mono text-[11px] text-gray-600">
                      {(b.size / 1024).toFixed(0)} KB
                    </td>
                    <td className="p-6 text-right text-gray-600 text-xs">
                      {formatAppDateTime(b.created_at, state.settings.country)}
                    </td>
                    <td className="p-6 text-right space-x-3">
                      <Button
                        onClick={() => handleDownload(b.filename)}
                        icon={<Download className="h-4 w-4" />}
                        className="!min-h-0 !p-2.5 !rounded-xl !bg-gray-100 dark:!bg-white/5 !text-gray-700 dark:!text-white !hover:bg-primary hover:!text-white !shadow-sm"
                        title={b.isPCFile ? "Prepare File" : "Download to PC"}
                      />
                      <Button
                        onClick={() => handleRestoreGuidance(b.filename)}
                        icon={<RotateCcw className="h-4 w-4" />}
                        className="!min-h-0 !p-2.5 !rounded-xl !bg-amber-50 dark:!bg-amber-500/10 !text-amber-600 !hover:bg-amber-500 hover:!text-white !shadow-sm"
                        title="Restore Snapshot"
                      />
                      <Button
                        onClick={() => handleDelete(b.filename)}
                        icon={<Trash2 className="h-4 w-4" />}
                        className="!min-h-0 !p-2.5 !rounded-xl !bg-red-50 dark:!bg-red-500/10 !text-red-600 !hover:bg-red-500 hover:!text-white !shadow-sm"
                        title="Delete from Everywhere"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="p-6 flex items-center justify-between border-t border-gray-200 dark:border-white/5 bg-gray-50/30 dark:bg-black/10">
            <span className="text-xs text-gray-600 font-bold uppercase tracking-widest">Page {currentPage} of {totalPages}</span>
            <div className="flex space-x-2">
              <Button variant="secondary" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="!min-h-0 !px-4 !py-2 !rounded-xl !text-xs !font-black !bg-white dark:!bg-white/5 !border-gray-200 dark:!border-white/10 disabled:!opacity-30 !hover:bg-white dark:!hover:bg-white/5">PREV</Button>
              <Button variant="secondary" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="!min-h-0 !px-4 !py-2 !rounded-xl !text-xs !font-black !bg-white dark:!bg-white/5 !border-gray-200 dark:!border-white/10 disabled:!opacity-30 !hover:bg-white dark:!hover:bg-white/5">NEXT</Button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
