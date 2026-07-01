import { localDb } from './localDb';

// Simple fallback ID generator for backups
const generateId = () => Math.random().toString(36).substr(2, 9) + Date.now().toString(36);

// --- Simple IDB Wrapper for Local Backups & Config ---
const initBackupDb = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('Zaynahs_Local_Backups_DB', 2); // Upgraded version for config store
        req.onupgradeneeded = (e) => {
            const db = req.result;
            if (!db.objectStoreNames.contains('backups')) {
                db.createObjectStore('backups', { keyPath: 'filename' });
            }
            if (!db.objectStoreNames.contains('config')) {
                db.createObjectStore('config');
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
};

// Global auto-init trigger
let isFirstRun = true;
let isBackupRunning = false;

export function initAutoBackup() {
    if (!isFirstRun) return;
    isFirstRun = false;
    
    // Check for backup 5 seconds after app start
    setTimeout(() => {
        console.log('[BACKUP] Running scheduled daily check...');
        backupService.checkAndTriggerBackup();
    }, 5000);

    // Initialize live DB mirroring listener
    window.addEventListener('localdb-write', () => {
        backupService.syncLiveDatabase();
    });

    // Also check every 12 hours if the app is left open
    setInterval(() => {
        backupService.checkAndTriggerBackup();
    }, 12 * 60 * 60 * 1000);
}

export const backupService = {
    // ─── PC Folder Management (File System Access API) ───
    
    async selectBackupFolder() {
        if (!('showDirectoryPicker' in window)) {
            throw new Error('Your browser does not support PC folder access. Please use Chrome or Edge.');
        }
        try {
            const handle = await (window as any).showDirectoryPicker({
                mode: 'readwrite'
            });
            
            // Store handle in IDB for persistence
            const db = await initBackupDb();
            const tx = db.transaction('config', 'readwrite');
            await new Promise((resolve, reject) => {
                const req = tx.objectStore('config').put(handle, 'pc_folder_handle');
                req.onsuccess = resolve;
                req.onerror = reject;
            });
            
            return handle;
        } catch (e: any) {
            console.error('[BACKUP] Folder selection failed', e);
            throw e;
        }
    },

    async getStoredFolderHandle() {
        try {
            const db = await initBackupDb();
            const tx = db.transaction('config', 'readonly');
            const handle = await new Promise<any>((resolve, reject) => {
                const req = tx.objectStore('config').get('pc_folder_handle');
                req.onsuccess = () => resolve(req.result);
                req.onerror = reject;
            });

            if (!handle) return null;

            // Verify permission (browser might have revoked it)
            const options = { mode: 'readwrite' };
            if (await (handle as any).queryPermission(options) === 'granted') {
                return handle;
            }
            
            return handle; // Return even if not granted, so UI can trigger re-auth
        } catch (e) {
            return null;
        }
    },

    async requestFolderPermission(handle: any) {
        try {
            const options = { mode: 'readwrite' };
            if (await handle.queryPermission(options) === 'granted') return true;
            return (await handle.requestPermission(options)) === 'granted';
        } catch (e) {
            return false;
        }
    },

    async disconnectFolder() {
        const db = await initBackupDb();
        const tx = db.transaction('config', 'readwrite');
        await new Promise((resolve) => {
            const req = tx.objectStore('config').delete('pc_folder_handle');
            req.onsuccess = resolve;
        });
    },

    async writeToPCFolder(handle: any, filename: string, content: string) {
        try {
            const fileHandle = await handle.getFileHandle(filename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(content);
            await writable.close();
            return true;
        } catch (e) {
            console.error('[BACKUP] Failed to write to PC folder', e);
            return false;
        }
    },

    async listPCFolderFiles(handle: any) {
        try {
            const files = [];
            for await (const entry of handle.values()) {
                if (entry.kind === 'file' && entry.name.endsWith('.json')) {
                    const file = await entry.getFile();
                    files.push({
                        filename: entry.name,
                        size: file.size,
                        created_at: new Date(file.lastModified).toISOString(),
                        isPCFile: true
                    });
                }
            }
            return files;
        } catch (e) {
            console.error('[BACKUP] Failed to list PC folder', e);
            return [];
        }
    },

    async deleteFromPCFolder(handle: any, filename: string) {
        try {
            await handle.removeEntry(filename);
            return true;
        } catch (e) {
            console.error('[BACKUP] Failed to delete from PC folder', e);
            return false;
        }
    },

    // ─── Live SQLite Mirroring ───
    _syncDebounce: null as any,
    async syncLiveDatabase() {
        if (this._syncDebounce) clearTimeout(this._syncDebounce);
        
        this._syncDebounce = setTimeout(async () => {
            try {
                const handle = await this.getStoredFolderHandle();
                if (!handle) return;

                const hasPermission = await this.requestFolderPermission(handle);
                if (!hasPermission) return;

                // Import dynamically to avoid circular dependency
                const { exportDbRaw } = await import('./localDb');
                const bytes = await exportDbRaw();
                
                if (!bytes) return;

                const filename = 'zaynah-pos-live.db';
                const fileHandle = await handle.getFileHandle(filename, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(bytes);
                await writable.close();
                
                console.log(`[BACKUP] 🔄 Live DB Mirrored to PC folder: ${filename}`);
            } catch (e) {
                console.warn('[BACKUP] Live mirror failed:', e);
            }
        }, 2000); // 2 second debounce to allow multiple quick writes
    },

    // ─── Automated Backup Logic ───

    async checkAndTriggerBackup() {
        if (isBackupRunning) return;
        isBackupRunning = true;

        try {
            const now = new Date();
            const todayStr = now.toLocaleDateString('en-CA');
            
            const appSettingsArr = await localDb.appSettings.toArray();
            const lastBackupDate = appSettingsArr[0]?.lastBackupDate || appSettingsArr[0]?.last_backup_date;
            
            if (lastBackupDate === todayStr) {
                isBackupRunning = false;
                return;
            }

            const lastActivityTs = localStorage.getItem('pos_last_activity') || '0';
            const lastBackupTs = localStorage.getItem('pos_last_backup_ts') || '0';
            
            if (parseInt(lastActivityTs) <= parseInt(lastBackupTs)) {
                await this.updateBackupSettings(todayStr);
                isBackupRunning = false;
                return;
            }

            await this.runBackup(todayStr);
            await this.cleanupOldBackups();

        } catch (error) {
            console.error('[BACKUP] Automated trigger failed:', error);
        } finally {
            isBackupRunning = false;
        }
    },

    async cleanupOldBackups() {
        try {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const threshold = thirtyDaysAgo.toISOString();

            const all = await this.getAllBackups();
            // Only cleanup IDB backups, leave PC folder files alone (user's responsibility)
            const oldLocal = all.filter((b: any) => !b.isPCFile && b.created_at < threshold);
            for (const b of oldLocal) {
                await this.deleteBackup(b.filename);
            }
        } catch (e) {
            console.warn('[BACKUP] Cleanup failed:', e);
        }
    },

    async runBackup(dateLabel: string) {
        try {
            const tableConfigs = [
                { key: 'products', dbKey: 'products' },
                { key: 'customers', dbKey: 'customers' },
                { key: 'sales', dbKey: 'sales' },
                { key: 'expenses', dbKey: 'expenses' },
                { key: 'discounts', dbKey: 'discounts' },
                { key: 'users', dbKey: 'users' },
                { key: 'salesTabs', dbKey: 'salesTabs' },
                { key: 'settings', dbKey: 'appSettings' },
                { key: 'categories', dbKey: 'categories' },
                { key: 'suppliers', dbKey: 'suppliers' },
                { key: 'productBatches', dbKey: 'productBatches' },
                { key: 'purchaseRecords', dbKey: 'purchaseRecords' },
                { key: 'purchase_orders', dbKey: 'purchaseOrders' },
                { key: 'purchase_order_items', dbKey: 'purchaseOrderItems' },
                { key: 'supplier_transactions', dbKey: 'supplierTransactions' },
                { key: 'payments', dbKey: 'payments' },
                { key: 'stock_history', dbKey: 'stockHistory' }
            ];
            
            const backup: any = {
                version: '3.0',
                platform: 'Zaynahs POS',
                timestamp: new Date().toISOString(),
                type: 'auto_snapshot',
                tables: {}
            };

            for (const config of tableConfigs) {
                try {
                    backup.tables[config.key] = await (localDb as any)[config.dbKey].toArray();
                } catch (e) {
                    console.warn(`[BACKUP] Failed to export table ${config.dbKey}:`, e);
                }
            }

            const payload = JSON.stringify(backup);
            const filename = `zaynah_snapshot_${dateLabel}_${Date.now()}.json`;
            
            // 1. Save to IDB (Internal Browser Cache)
            await this.saveLocalBackup(filename, payload);
            
            // 2. Save to PC Folder (if connected and permitted)
            const handle = await this.getStoredFolderHandle();
            if (handle) {
                const hasPermission = await this.requestFolderPermission(handle);
                if (hasPermission) {
                    await this.writeToPCFolder(handle, filename, payload);
                    console.log(`[BACKUP] ✅ Also saved to PC folder: ${filename}`);
                }
            }
            
            await this.updateBackupSettings(dateLabel);
            localStorage.setItem('pos_last_backup_ts', Date.now().toString());

        } catch (error) {
            console.error('[BACKUP] Backup execution failed:', error);
        }
    },

    async updateBackupSettings(dateStr: string) {
        const settingsArr = await localDb.appSettings.toArray();
        if (settingsArr[0]) {
            await localDb.appSettings.put({ ...settingsArr[0], lastBackupDate: dateStr, last_backup_date: dateStr });
        }
    },

    // ─── Local Snapshot Management ───
    async saveLocalBackup(filename: string, payload: string) {
        const db = await initBackupDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('backups', 'readwrite');
            const store = tx.objectStore('backups');
            const req = store.put({ 
                filename, 
                payload, 
                size: payload.length, 
                created_at: new Date().toISOString() 
            });
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    },

    async getAllBackups() {
        const list: any[] = [];
        try {
            // 1. Fetch from IDB
            const db = await initBackupDb();
            const idbBackups = await new Promise<any[]>((resolve, reject) => {
                const tx = db.transaction('backups', 'readonly');
                const store = tx.objectStore('backups');
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => reject(req.error);
            });
            
            list.push(...idbBackups.map(b => ({
                filename: b.filename,
                size: b.size,
                created_at: b.created_at,
                isPCFile: false
            })));

            // 2. Fetch from PC Folder (if permitted)
            const handle = await this.getStoredFolderHandle();
            if (handle) {
                const hasPermission = await this.requestFolderPermission(handle);
                if (hasPermission) {
                    const pcFiles = await this.listPCFolderFiles(handle);
                    // Filter out duplicates if already in IDB, or just merge
                    pcFiles.forEach(pc => {
                        if (!list.find(l => l.filename === pc.filename)) {
                            list.push(pc);
                        } else {
                            // If it exists in both, mark the existing one as being in both
                            const existing = list.find(l => l.filename === pc.filename);
                            if (existing) existing.inPC = true;
                        }
                    });
                }
            }

            return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        } catch (e) {
            return list;
        }
    },

    async deleteBackup(filename: string) {
        // 1. Delete from IDB
        const db = await initBackupDb();
        await new Promise((resolve) => {
            const tx = db.transaction('backups', 'readwrite');
            const req = tx.objectStore('backups').delete(filename);
            req.onsuccess = () => resolve(true);
        });

        // 2. Delete from PC Folder
        const handle = await this.getStoredFolderHandle();
        if (handle) {
            const hasPermission = await this.requestFolderPermission(handle);
            if (hasPermission) {
                await this.deleteFromPCFolder(handle, filename);
            }
        }
        return true;
    },

    async downloadBackup(filename: string) {
        try {
            const db = await initBackupDb();
            const payload: string | null = await new Promise((resolve, reject) => {
                const tx = db.transaction('backups', 'readonly');
                const store = tx.objectStore('backups');
                const req = store.get(filename);
                req.onsuccess = () => resolve(req.result ? req.result.payload : null);
                req.onerror = () => reject(req.error);
            });

            if (!payload) {
                // Try reading from PC folder if not in IDB
                const handle = await this.getStoredFolderHandle();
                if (handle) {
                    const fileHandle = await handle.getFileHandle(filename);
                    const file = await fileHandle.getFile();
                    const text = await file.text();
                    const blob = new Blob([text], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    a.click();
                    return true;
                }
                throw new Error('Backup payload not found');
            }

            const blob = new Blob([payload], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            return true;
        } catch (e) {
            console.error('[BACKUP] Download failed', e);
            return false;
        }
    }
};
