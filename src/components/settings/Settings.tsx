// Standardized Settings Layout - Fixed Imports
import { useState, useEffect, useCallback } from 'react';
import {
  Save,
  PlusCircle,
  Layers,
  Store,
  Printer,
  Users,
  Globe,
  Lock,
  WifiOff,
  RefreshCw,
  Database,
  ChevronRight,
  Shield,
  Cloud,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  ChevronLeft,
  Sliders,
  ClipboardList,
  Layout,
  Activity,
  Wifi,
  AlertTriangle,
  PackageOpen,
  Clock,
  Keyboard,
  ShoppingBag,
  Volume2,
  VolumeX,
  Languages,
  LayoutGrid,
  HardDrive,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { formatRelativeTime } from '../../lib/timeUtils';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/SupabaseAppContext';
import { useAuth } from '../../context/AuthContext';
import { LogoUpload } from './LogoUpload';
import { PasswordChange } from './PasswordChange';
import { sonner } from '../../lib/sonner';
import { ReceiptPreview } from './ReceiptPreview';
import { ReceiptPrint } from '../pos/ReceiptPrint';
import { AppSettings } from '../../types';
import { useSync } from '../../hooks/useSync';
import { DatabaseTools } from './DatabaseTools';
import { HelpTooltip } from '../common/HelpTooltip';
import { CloudSyncTab } from './CloudSyncTab';

import { SearchableSelect } from '../common/SearchableSelect';
import { StickyFormFooter } from '../common/StickyFormFooter';
import { CURRENCIES } from '../../lib/currencies';
import { localDb } from '../../lib/localDb';
import { useSoundFeedback } from '../../hooks/useSoundFeedback';
import { useTranslation } from '../../hooks/useTranslation';

type TabType = 'general' | 'receipt' | 'backup' | 'security' | 'database' | 'estore';

export function Settings() {
  const navigate = useNavigate();
  const { subTab } = useParams();
  const { state, dispatch, loadData } = useApp();
  const { profile } = useAuth();
  const { t } = useTranslation();

  const tabKeys: Record<string, string> = {
    general: 'general_settings',
    receipt: 'receipt_design',
    security: 'security_account',
    database: 'db_tools',
    estore: 'estore_settings'
  };
  const { isOnline, isSyncing, pendingCount, lastSyncTime, hasError, syncNow } = useSync();
  const { play } = useSoundFeedback();

  const activeTab = (subTab as TabType) || 'general';
  const [isSaving, setIsSaving] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [completedSale, setCompletedSale] = useState<any>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'syncing' | 'success' | 'local'>('idle');
  const [offlineDataSize, setOfflineDataSize] = useState<string | null>(null);
  const [dataBreakdown, setDataBreakdown] = useState<Record<string, number>>({});
  const [lastDownloadTime, setLastDownloadTime] = useState<string | null>(null);

  const formatSyncedTime = (isoString: string | null) => {
    if (!isoString) return null;
    try {
      const date = new Date(isoString);
      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();
      const isYesterday = new Date(now.setDate(now.getDate() - 1)).toDateString() === date.toDateString();

      const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });

      if (isToday) return `Today ${timeStr}`;
      if (isYesterday) return `Yesterday ${timeStr}`;
      return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${timeStr}`;
    } catch { return null; }
  };

  const calculateOfflineSize = useCallback(async () => {
    try {
      // 1. localStorage size
      let lsSize = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i) || '';
        const val = localStorage.getItem(key) || '';
        lsSize += (key.length + val.length) * 2;
      }

      // 2. Comprehensive IndexedDB audit (ALL tables)
      const [
        pArr, cArr, sArr, prArr, eArr, dArr, pbArr, catArr, supArr
      ] = await Promise.all([
        localDb.products.toArray().catch(() => []),
        localDb.customers.toArray().catch(() => []),
        localDb.sales.toArray().catch(() => []),
        localDb.purchaseRecords.toArray().catch(() => []),
        localDb.expenses.toArray().catch(() => []),
        localDb.discounts.toArray().catch(() => []),
        localDb.productBatches.toArray().catch(() => []),
        localDb.categories.toArray().catch(() => []),
        localDb.suppliers.toArray().catch(() => []),
      ]);

      const counts = {
        products: pArr.length,
        customers: cArr.length,
        sales: sArr.length,
        purchases: prArr.length,
        expenses: eArr.length,
        discounts: dArr.length,
        batches: pbArr.length,
        categories: catArr.length,
        suppliers: supArr.length
      };

      setDataBreakdown(counts);

      // Heuristic: sum of counts * 500 bytes + actual JSON size would be better but this is for UI feedback
      const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);
      const idbEstimate = totalCount * 500;
      const totalBytes = lsSize + idbEstimate;

      if (totalBytes === 0) {
        setOfflineDataSize(null);
      } else if (totalBytes < 1024) {
        setOfflineDataSize(`${totalBytes} B`);
      } else if (totalBytes < 1024 * 1024) {
        setOfflineDataSize(`${(totalBytes / 1024).toFixed(1)} KB`);
      } else {
        setOfflineDataSize(`${(totalBytes / (1024 * 1024)).toFixed(1)} MB`);
      }

      const ts = localStorage.getItem('pos_last_download');
      setLastDownloadTime(ts);
    } catch (err) {
      console.warn('Offline audit error:', err);
      setOfflineDataSize(null);
    }
  }, []);

  useEffect(() => {
    calculateOfflineSize();
  }, [calculateOfflineSize]);

  const [formData, setFormData] = useState({
    storeName: state.settings?.storeName || '',
    storeAddress: state.settings?.storeAddress || '',
    storePhone: state.settings?.storePhone || '',
    storeEmail: state.settings?.storeEmail || '',
    storeWebsite: state.settings?.storeWebsite || '',
    storeLogo: state.settings?.storeLogo,
    taxRate: (state.settings?.taxRate || 0).toString(),
    currency: state.settings?.currency || 'PKR',
    receiptPrinter: state.settings?.receiptPrinter || false,
    autoBackup: state.settings?.autoBackup || false,
    invoicePrefix: state.settings?.invoicePrefix || 'INV',
    invoiceCounter: (state.settings?.invoiceCounter || 1000).toString(),
    receiptPaperSize: state.settings?.receiptPaperSize || '80mm',
    receiptDensity: state.settings?.receiptDensity || 'normal',
    receiptHeader: state.settings?.receiptHeader || '',
    receiptFooter: state.settings?.receiptFooter || '',
    receiptShowFooter: state.settings?.receiptShowFooter ?? true,
    receiptShowLogo: state.settings?.receiptShowLogo ?? true,
    receiptShowTax: state.settings?.receiptShowTax ?? true,
    receiptShowDiscount: state.settings?.receiptShowDiscount ?? true,
    receiptTemplate: state.settings.receiptTemplate || 'modern',
    receiptFontScale: state.settings.receiptFontScale?.toString() || '1',
    receiptFontBold: state.settings.receiptFontBold ?? false,
    receiptShowStoreName: state.settings.receiptShowStoreName ?? true,
    receiptShowStoreAddress: state.settings.receiptShowStoreAddress ?? true,
    receiptShowStorePhone: state.settings.receiptShowStorePhone ?? true,
    receiptShowStoreEmail: state.settings.receiptShowStoreEmail ?? true,
    receiptShowCustomerName: state.settings.receiptShowCustomerName ?? true,
    receiptShowCustomerPhone: state.settings.receiptShowCustomerPhone ?? true,
    receiptShowNotes: state.settings.receiptShowNotes ?? true,
    receiptShowBarcode: state.settings?.receiptShowBarcode ?? true,
    receiptPaddingTop: state.settings.receiptPaddingTop ?? 0,
    receiptPaddingBottom: state.settings.receiptPaddingBottom ?? 0,
    receiptPaddingLeft: state.settings.receiptPaddingLeft ?? 0,
    receiptPaddingRight: state.settings.receiptPaddingRight ?? 0,
    receiptOffsetX: state.settings.receiptOffsetX ?? 0,
    receiptHeaderOffsetX: state.settings.receiptHeaderOffsetX ?? 0,
    receiptFooterOffsetX: state.settings.receiptFooterOffsetX ?? 0,
    offlineMode: state.settings.offlineMode ?? true,
    autoSync: state.settings.autoSync ?? true,
    ai_v2_enabled: (state.settings as any).ai_v2_enabled ?? false,
    isLocked: (state.settings as any).isLocked ?? false,
    retailEnabled: state.settings.retailEnabled ?? true,
    wholesaleEnabled: state.settings.wholesaleEnabled ?? false,
    estoreEnabled: state.settings.estoreEnabled ?? false,
    touchKeyboardEnabled: state.settings.touchKeyboardEnabled ?? false,
    soundEnabled: state.settings.soundEnabled ?? true,
    enableKotPrinter: state.settings?.enableKotPrinter ?? false,
    taxId: state.settings?.taxId || '',
    country: state.settings?.country || 'PK',
    language: (state.settings as any)?.language || 'en',
    theme: (state.settings as any)?.theme || 'dark',
    interfaceMode: (state.settings as any)?.interfaceMode || 'touch',
    allowCreditOverLimit: state.settings?.allowCreditOverLimit ?? true,
    enableSplitPayment: state.settings?.enableSplitPayment ?? false,
    enableExtraCharges: state.settings?.enableExtraCharges ?? false,
    defaultSaleType: state.settings?.defaultSaleType || 'retail',
    barcodeBarWidth: state.settings?.barcodeBarWidth ?? 0.8
  });

  // Feature Parity: Auto-load Electron config on mount
  useEffect(() => {
    if ((window as any).electronAPI) {
      (window as any).electronAPI.getConfig().then((config: any) => {
        if (config.supabaseUrl) {
          const urlInput = document.getElementById('electron-supabase-url') as HTMLInputElement;
          if (urlInput) urlInput.value = config.supabaseUrl;
        }
        if (config.supabaseAnonKey) {
          const anonInput = document.getElementById('electron-supabase-anon') as HTMLInputElement;
          if (anonInput) anonInput.value = config.supabaseAnonKey;
        }
        if (config.supabaseServiceRoleKey) {
          const serviceInput = document.getElementById('electron-supabase-service') as HTMLInputElement;
          if (serviceInput) serviceInput.value = config.supabaseServiceRoleKey;
        }
      });
    }
  }, []);

  // Feature Parity: Ensure all settings types are consistent
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      storeName: state.settings?.storeName || '',
      storeAddress: state.settings?.storeAddress || '',
      storePhone: state.settings?.storePhone || '',
      storeEmail: state.settings?.storeEmail || '',
      storeWebsite: state.settings?.storeWebsite || '',
      storeLogo: state.settings?.storeLogo,
      taxRate: (state.settings?.taxRate || 0).toString(),
      currency: state.settings?.currency || 'PKR',
      receiptPrinter: !!state.settings?.receiptPrinter,
      autoBackup: !!state.settings?.autoBackup,
      invoicePrefix: state.settings?.invoicePrefix || 'INV',
      invoiceCounter: state.settings?.invoiceCounter?.toString() || '1000',
      receiptPaperSize: state.settings?.receiptPaperSize || '80mm',
      receiptDensity: state.settings?.receiptDensity || 'normal',
      receiptHeader: state.settings?.receiptHeader || '',
      receiptFooter: state.settings?.receiptFooter || '',
      receiptShowFooter: !!state.settings?.receiptShowFooter,
      receiptShowLogo: state.settings?.receiptShowLogo ?? true,
      receiptShowTax: state.settings?.receiptShowTax ?? true,
      receiptShowDiscount: state.settings?.receiptShowDiscount ?? true,
      receiptTemplate: state.settings?.receiptTemplate || 'modern',
      receiptFontScale: state.settings?.receiptFontScale?.toString() || '1',
      receiptFontBold: !!state.settings?.receiptFontBold,
      receiptShowStoreName: state.settings?.receiptShowStoreName ?? true,
      receiptShowStoreAddress: state.settings?.receiptShowStoreAddress ?? true,
      receiptShowStorePhone: state.settings?.receiptShowStorePhone ?? true,
      receiptShowStoreEmail: state.settings?.receiptShowStoreEmail ?? true,
      receiptShowCustomerName: state.settings?.receiptShowCustomerName ?? true,
      receiptShowCustomerPhone: state.settings?.receiptShowCustomerPhone ?? true,
      receiptShowNotes: state.settings?.receiptShowNotes ?? true,
      receiptShowBarcode: state.settings?.receiptShowBarcode ?? true,
      receiptPaddingTop: state.settings?.receiptPaddingTop ?? 0,
      receiptPaddingBottom: state.settings?.receiptPaddingBottom ?? 0,
      receiptPaddingLeft: state.settings?.receiptPaddingLeft ?? 0,
      receiptPaddingRight: state.settings?.receiptPaddingRight ?? 0,
      receiptOffsetX: state.settings?.receiptOffsetX ?? 0,
      receiptHeaderOffsetX: state.settings?.receiptHeaderOffsetX ?? 0,
      receiptFooterOffsetX: state.settings?.receiptFooterOffsetX ?? 0,
      ai_v2_enabled: !!(state.settings as any)?.ai_v2_enabled,
      isLocked: !!(state.settings as any)?.isLocked,
      retailEnabled: !!state.settings?.retailEnabled,
      wholesaleEnabled: !!state.settings?.wholesaleEnabled,
      estoreEnabled: !!state.settings?.estoreEnabled,
      touchKeyboardEnabled: !!state.settings?.touchKeyboardEnabled,
      soundEnabled: !!state.settings?.soundEnabled,
      taxId: state.settings?.taxId || '',
      country: state.settings?.country || 'PK',
      language: (state.settings as any)?.language || 'en',
      theme: (state.settings as any)?.theme || 'dark',
      interfaceMode: (state.settings as any)?.interfaceMode || 'touch',
      allowCreditOverLimit: state.settings?.allowCreditOverLimit ?? true,
      enableSplitPayment: state.settings?.enableSplitPayment ?? false,
      enableExtraCharges: state.settings?.enableExtraCharges ?? false,
      defaultSaleType: state.settings?.defaultSaleType || 'retail',
      barcodeBarWidth: state.settings?.barcodeBarWidth ?? 0.8
    }));
  }, [state.settings]);

  const canEditSettings = profile?.role === 'admin' || profile?.role === 'manager';

  const handleInstantUpdate = async (name: string, value: any) => {
    if (!canEditSettings) return;

    // Validation: At least one sale type must be active
    const saleTypeFields = ['retailEnabled', 'wholesaleEnabled', 'estoreEnabled'];
    if (saleTypeFields.includes(name) && value === false) {
      const otherActive = saleTypeFields.filter(f => f !== name && formData[f as keyof typeof formData]);
      if (otherActive.length === 0) {
        sonner.toast('System Policy: One sale type must remain active. Auto-enabling Retail Mode. 🏪', 'warning');
        setFormData(prev => ({ ...prev, [name]: false, retailEnabled: true }));
        // Continue saving but with retail forced to true
        handleInstantUpdate('retailEnabled', true);
        return;
      }
    }

    // 1. Update form data locally
    setFormData(prev => ({ ...prev, [name]: value }));

    setSyncStatus('saving');
    try {
      const { settingsService } = await import('../../lib/services');

      const updatedSettings = {
        ...state.settings,
        ...formData,
        [name]: value,
        taxRate: parseFloat(String(formData.taxRate || 0)),
        invoiceCounter: parseInt(String(formData.invoiceCounter || 1000)),
        receiptFontScale: parseFloat(String(name === 'receiptFontScale' ? value : (formData.receiptFontScale || 1.0))),
        receiptFontWeight: parseInt(String(name === 'receiptFontWeight' ? value : (formData.receiptFontWeight || 600))),
      } as unknown as AppSettings;

      // 2. Persistent save to Dexie & state dispatch
      await settingsService.update(updatedSettings as any);
      dispatch({
        type: 'SET_SETTINGS',
        payload: updatedSettings as any
      });

      // 3. Trigger cloud sync
      if (navigator.onLine) {
        syncNow().catch(e => console.warn('Instant sync issue:', e));
        setSyncStatus('local');
      } else {
        setSyncStatus('local');
      }

      // Toast for user confirmation
      sonner.toast(`Applied ${name.charAt(0).toUpperCase() + name.slice(1)}: ${value} 🌐`, 'success');

    } catch (error) {
      console.error('Instant update error:', error);
      sonner.toast('Failed to apply change instantly', 'error');
    } finally {
      setTimeout(() => setSyncStatus('idle'), 2000);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    if (!canEditSettings) return;
    const { name, value, type } = e.target;

    // Check if this is an instant-apply field
    const instantFields = [
      'country', 'currency', 'receiptPrinter', 'receiptPaperSize', 'receiptTemplate', 
      'interfaceMode', 'theme', 'receiptShowLogo', 'receiptShowFooter', 'receiptShowTax', 
      'receiptShowDiscount', 'receiptShowStoreName', 'receiptShowStoreAddress', 
      'receiptShowStorePhone', 'receiptShowStoreEmail', 'receiptShowCustomerName', 
      'receiptShowCustomerPhone', 'receiptShowNotes', 'receiptShowBarcode', 'receiptFontBold', 'receiptFontWeight',
      'receiptFontScale', 'language'
    ];
    if (instantFields.includes(name)) {
      const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
      handleInstantUpdate(name, val);
      return;
    }

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  const handleLogoChange = (logo: string | undefined) => {
    if (!canEditSettings) return;
    setFormData(prev => ({ ...prev, storeLogo: logo }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditSettings) {
      sonner.error('You do not have permission to change settings.');
      return;
    }

    setIsSaving(true);
    setSyncStatus('saving');

    try {
      sonner.loading('Deploying settings changes...');
      const { settingsService } = await import('../../lib/services');

      const updatedSettings = {
        ...state.settings,
        ...formData,
        taxRate: parseFloat(formData.taxRate),
        invoiceCounter: parseInt(formData.invoiceCounter),
        receiptFontScale: parseFloat(formData.receiptFontScale),
        receiptFontWeight: parseInt((formData as any).receiptFontWeight?.toString() || '600'),
      } as unknown as AppSettings;

      // 1. Update internal state and Dexie (instant)
      await settingsService.update(updatedSettings as any);
      dispatch({
        type: 'SET_SETTINGS',
        payload: updatedSettings as any
      });

      // 2. Trigger background sync without awaiting
      if (navigator.onLine) {
        syncNow().catch(e => console.warn('Background settings sync issue:', e));
        setSyncStatus('local');
        sonner.success('Saved to device! Syncing to cloud in background... 📶');
      } else {
        setSyncStatus('local');
        sonner.success('Saved to device! Will sync when online. 📶');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      setSyncStatus('idle');
      sonner.error('Failed to save settings. Please try again.');
    } finally {
      setIsSaving(false);
      sonner.close();
      setTimeout(() => setSyncStatus('idle'), 3000);
    }
  };


  const handleRepairCounter = async () => {
    if (!canEditSettings) return;
    if (!isOnline) {
      sonner.error('You must be online to repair the counter from cloud data.');
      return;
    }

    try {
      sonner.loading('Scanning all cloud sales for highest invoice number...');

      // Fetch latest sales to find the max counter
      const { data, error } = await supabase
        .from('sales')
        .select('invoice_number');

      if (error) throw error;

      let maxCounterNum = parseInt(formData.invoiceCounter);

      if (data && data.length > 0) {
        data.forEach(sale => {
          const val = sale.invoice_number;
          if (typeof val === 'string') {
            const matches = val.match(/\d+$/); // Find digits at the end of the string
            if (matches) {
              const num = parseInt(matches[0]);
              if (!isNaN(num) && num > maxCounterNum) {
                maxCounterNum = num;
              }
            }
          }
        });
      }

      const nextCounter = maxCounterNum + 1;
      setFormData(prev => ({ ...prev, invoiceCounter: nextCounter.toString() }));
      sonner.success(`Counter repaired! Next invoice will be: ${formData.invoicePrefix}-${nextCounter}`);
    } catch (err: any) {
      console.error('Repair failed:', err);
      sonner.error(`Failed to repair counter: ${err.message}`);
    } finally {
      sonner.close();
    }
  };

  const handleResetCalibration = () => {
    setFormData(prev => ({
      ...prev,
      receiptPaddingTop: 0,
      receiptPaddingBottom: 0,
      receiptPaddingLeft: 0,
      receiptPaddingRight: 0,
      receiptOffsetX: 0,
      receiptHeaderOffsetX: 0,
      receiptFooterOffsetX: 0
    }));
    sonner.toast('Calibration reset! Logo, items, and footer are now centered. 🎯', 'info');
  };

  const tabs: { id: TabType; label: string; icon: any; adminOnly?: boolean }[] = [
    { id: 'general', label: 'General Settings', icon: Sliders },
    ...(state.settings?.estoreEnabled ? [{ id: 'estore' as TabType, label: 'Online Store', icon: Globe }] : []),
    { id: 'receipt', label: 'Receipt Design', icon: Printer },
    { id: 'security', label: 'Security & Account', icon: Shield },
    { id: 'database', label: 'Zaynahs DB', icon: Database, adminOnly: true },
  ];

  const visibleTabs = tabs.filter(t => !t.adminOnly || profile?.role === 'admin');

  return (
    <div className="main-content-scroll p-1 sm:p-4 lg:p-6 py-4 sm:py-6 bg-gray-50/50 dark:bg-app max-w-[1400px] mx-auto">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-6 pb-2">
        <div className="flex items-center gap-4 shrink-0">
          <button 
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'pos' }))}
            className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl text-gray-600 dark:text-gray-400 active:scale-95 transition-all flex items-center gap-1 mr-1"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="hidden sm:inline text-[10px] font-black uppercase tracking-widest">{t("back", "Back")}</span>
          </button>
          <div className="h-10 w-px bg-gray-200 dark:bg-white/10 mx-1 hidden sm:block" />
          <div className="h-14 w-14 bg-primary/10 rounded-2xl flex items-center justify-center shadow-inner border border-primary/10">
            <Sliders className="h-7 w-7 text-primary" />
          </div>
          <div className="shrink-0 flex flex-col">
            <h1 className="text-2xl xl:text-3xl font-black text-gray-900 dark:text-white uppercase tracking-tighter leading-none">{t("settings")}</h1>
            <p className="text-gray-600 dark:text-gray-400 text-[9px] font-black uppercase tracking-[0.2em] mt-2 opacity-60">{t("control_center", "Control Center")} • {formData.storeName || 'Zaynahs POS'}</p>
          </div>
        </div>

        {!canEditSettings && (
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-900/20 rounded-2xl flex items-center space-x-3 max-w-sm">
            <Lock className="h-4 w-4 text-yellow-600" />
            <p className="text-yellow-800 dark:text-yellow-400 text-[10px] font-black uppercase tracking-widest leading-tight">
              Access Restricted: Admin or Manager only
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 items-start min-h-full pb-48">
        {/* Navigation Sidebar (Desktop) / Chips (Mobile) */}
        <div className="w-full lg:w-64 xl:w-72 shrink-0 relative z-20">
          <div className="hidden lg:flex flex-col gap-2 p-2 bg-white dark:bg-surface rounded-[2rem] border border-gray-200 dark:border-white/5 shadow-xl shadow-gray-200/20 dark:shadow-none">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              
              const tabColors: Record<string, string> = {
                general: 'bg-primary',
                receipt: 'bg-cyan-600',
                security: 'bg-blue-600',
                database: 'bg-indigo-600',
                estore: 'bg-emerald-600'
              };
              const activeColor = tabColors[tab.id] || 'bg-primary';

              return (
                <button
                  key={tab.id}
                  onClick={() => navigate('/settings/' + tab.id)}
                  className={`flex items-center gap-3 px-6 py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all duration-300 active:scale-95 ${
                    isActive 
                      ? `${activeColor} text-white shadow-lg shadow-emerald-500/20 translate-x-1` 
                      : 'text-gray-600 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-white/5'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-gray-600'}`} />
                  {t(tabKeys[tab.id], tab.label)}
                </button>
              );
            })}
          </div>

          {/* Mobile Chips - Standardized & Sticky */}
          <div className="lg:hidden sticky top-0 z-40 -mx-1 sm:-mx-4 px-1 sm:px-4 py-2 bg-gray-50/95 dark:bg-app/95 border-b border-gray-200 dark:border-white/5">
            <div className="chip-nav-container w-full max-w-full overflow-x-auto justify-start">
              {visibleTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                
                const tabColors: Record<string, string> = {
                  general: 'bg-primary',
                  receipt: 'bg-cyan-600',
                  security: 'bg-blue-600',
                  database: 'bg-indigo-600',
                  estore: 'bg-emerald-600'
                };
                const activeColor = tabColors[tab.id] || 'bg-primary';

                return (
                  <button
                    key={tab.id}
                    onClick={() => navigate('/settings/' + tab.id)}
                    className={`chip-nav-item ${isActive ? `${activeColor} text-white shadow-lg` : 'text-gray-600'}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {t(tabKeys[tab.id], tab.label)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 w-full bg-white dark:bg-surface rounded-[2rem] sm:rounded-3xl border border-gray-200 dark:border-white/5 shadow-xl shadow-gray-200/40 dark:shadow-none transition-colors relative z-10">
          <form id="settings-form" onSubmit={handleSubmit} className="p-3.5 sm:p-8 space-y-6 sm:space-y-8">

            {activeTab === 'general' && (
              <section className="space-y-6">
                <div className="flex items-center gap-3 pb-4 border-b border-gray-50 dark:border-white/5">
                  <div className="w-10 h-10 bg-[#10B981]/10 rounded-xl flex items-center justify-center">
                    <Sliders className="w-5 h-5 text-[#10B981]" />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">{t("general_settings", "General Settings")}</h2>
                    <p className="text-[10px] text-gray-600 font-bold tracking-widest uppercase mt-0.5">{t("general_settings_subtitle", "Main Dashboard • Common Configuration")}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  
                  {/* LEFT COLUMN: Business Identity & Defaults (8 Cols) */}
                  <div className="lg:col-span-8 space-y-6">
                    {/* Store Profile & Logo */}
                    <div className="p-4 sm:p-6 bg-gray-50/50 dark:bg-white/[0.02] rounded-[2rem] border border-gray-200 dark:border-white/5 space-y-6">
                      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-gray-200 dark:border-white/5">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-white dark:bg-white/10 rounded-xl shadow-sm">
                            <Store className="w-5 h-5 text-[#10B981]" />
                          </div>
                          <div>
                            <h3 className="text-base font-black text-gray-900 dark:text-white uppercase tracking-tight">{t("store_identity", "Store Identity")}</h3>
                            <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest mt-0.5">{t("store_identity_subtitle", "How your business appears to customers")}</p>
                          </div>
                        </div>
                        <div className="w-full md:w-auto">
                          <LogoUpload
                            currentLogo={formData.storeLogo}
                            onLogoChange={(url: string | undefined) => {
                              setFormData(prev => ({ ...prev, storeLogo: url }));
                              handleInstantUpdate('storeLogo', url);
                            }}
                          />
                        </div>
                      </div>

                      {/* Store Core Contact Details */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">{t("business_name", "Business Name")}</label>
                          <input
                            type="text"
                            name="storeName"
                            value={formData.storeName}
                            onChange={handleChange}
                            className="w-full bg-white dark:bg-black/20 border-gray-200 dark:border-white/5 rounded-xl py-2 px-3 focus:ring-2 focus:ring-[#10B981]/10 focus:border-[#10B981] transition-all text-[13px] sm:text-sm text-gray-900 dark:text-white font-bold"
                            placeholder="Zaynahs POS"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">{t("contact_phone", "Contact Phone")}</label>
                          <input
                            type="tel"
                            name="storePhone"
                            value={formData.storePhone}
                            onChange={handleChange}
                            className="w-full bg-white dark:bg-black/20 border-gray-200 dark:border-white/5 rounded-xl py-2 px-3 focus:ring-2 focus:ring-[#10B981]/10 focus:border-[#10B981] transition-all text-[13px] sm:text-sm text-gray-900 dark:text-white font-bold"
                            placeholder="+94 7X XXX XXXX"
                          />
                        </div>
                        <div className="md:col-span-2 space-y-1.5">
                          <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest ml-1">{t("physical_address", "Physical Address")}</label>
                          <textarea
                            name="storeAddress"
                            value={formData.storeAddress}
                            onChange={handleChange}
                            rows={2}
                            className="w-full bg-white dark:bg-black/20 border-gray-200 dark:border-white/5 rounded-xl py-2.5 px-3 focus:ring-2 focus:ring-[#10B981]/10 focus:border-[#10B981] transition-all text-sm text-gray-900 dark:text-white font-bold resize-none"
                            placeholder="123 Main Street"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Regional & Defaults */}
                    <div className="p-4 sm:p-6 bg-gray-50/50 dark:bg-white/[0.02] rounded-[2rem] border border-gray-200 dark:border-white/5 space-y-6">
                      <div className="flex items-center gap-3 pb-4 border-b border-gray-200 dark:border-white/5">
                        <div className="p-2.5 bg-white dark:bg-white/10 rounded-xl shadow-sm">
                          <Globe className="w-5 h-5 text-blue-500" />
                        </div>
                        <div>
                          <h3 className="text-base font-black text-gray-900 dark:text-white uppercase tracking-tight">{t("localization_defaults", "Localization & Defaults")}</h3>
                          <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest mt-0.5">{t("localization_defaults_subtitle", "Currencies, languages and system default types")}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2 relative z-30">
                          <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">{t("store_currency", "Store Currency")}</label>
                          <SearchableSelect
                            options={CURRENCIES.map(c => ({ id: c.code, label: `${c.code} - ${c.name} (${c.symbol})` }))}
                            value={formData.currency}
                            onChange={(val) => {
                              setFormData(prev => ({ ...prev, currency: val }));
                              handleInstantUpdate('currency', val);
                            }}
                            placeholder="Select currency..."
                            icon={Globe}
                          />
                        </div>
                        <div className="space-y-2 relative z-30">
                          <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">{t("store_country", "Store Country")}</label>
                          <SearchableSelect
                            options={[
                              { id: 'PK', label: 'Pakistan (🇵🇰)' },
                              { id: 'AE', label: 'United Arab Emirates (🇦🇪)' },
                              { id: 'SA', label: 'Saudi Arabia (🇸🇦)' },
                              { id: 'QR', label: 'Qatar (🇶🇦)' },
                              { id: 'KW', label: 'Kuwait (🇰🇼)' },
                              { id: 'OM', label: 'Oman (🇴🇲)' },
                              { id: 'BH', label: 'Bahrain (🇧🇭)' },
                              { id: 'US', label: 'United States (🇺🇸)' },
                              { id: 'GB', label: 'United Kingdom (🇬🇧)' },
                              { id: 'CA', label: 'Canada (🇨🇦)' },
                              { id: 'AU', label: 'Australia (🇦🇺)' },
                              { id: 'LK', label: 'Sri Lanka (🇱🇰)' },
                              { id: 'BD', label: 'Bangladesh (🇧🇩)' },
                              { id: 'IN', label: 'India (🇮🇳)' },
                              { id: 'AF', label: 'Afghanistan (🇦🇫)' },
                              { id: 'TR', label: 'Turkey (🇹🇷)' },
                              { id: 'MY', label: 'Malaysia (🇲🇾)' },
                              { id: 'SG', label: 'Singapore (🇸🇬)' },
                              { id: 'ID', label: 'Indonesia (🇮🇩)' },
                              { id: 'PH', label: 'Philippines (🇵🇭)' },
                              { id: 'VN', label: 'Vietnam (🇻🇳)' },
                              { id: 'EG', label: 'Egypt (🇪🇬)' },
                              { id: 'ZA', label: 'South Africa (🇿🇦)' },
                              { id: 'NG', label: 'Nigeria (🇳🇬)' }
                            ]}
                            value={formData.country || 'PK'}
                            onChange={(val) => {
                              setFormData(prev => ({ ...prev, country: val }));
                              handleInstantUpdate('country', val);
                            }}
                            placeholder="Select country..."
                            icon={Globe}
                          />
                        </div>
                        <div className="space-y-2 relative z-20">
                          <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">{t("system_language", "System Language")}</label>
                          <SearchableSelect
                            options={[
                              { id: 'en', label: 'English (United States)' },
                              { id: 'ur', label: 'Urdu (Pakistan)' },
                              { id: 'ar', label: 'Arabic (UAE)' }
                            ]}
                            value={formData.language || 'en'}
                            onChange={(val) => {
                              setFormData(prev => ({ ...prev, language: val }));
                              handleInstantUpdate('language', val);
                            }}
                            placeholder="Select language..."
                            icon={Languages}
                          />
                        </div>
                        <div className="space-y-2 relative z-20">
                          <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">{t("default_pos_view", "Default POS View")}</label>
                          <SearchableSelect
                            options={[
                              { id: 'retail', label: t('retail_sales', 'Retail Mode') },
                              { id: 'wholesale', label: t('wholesale_mode', 'Wholesale Mode') },
                              { id: 'estore', label: t('estore_mode', 'E-Store Mode') }
                            ]}
                            value={formData.defaultSaleType || 'retail'}
                            onChange={(val) => {
                              setFormData(prev => ({ ...prev, defaultSaleType: val as any }));
                              handleInstantUpdate('defaultSaleType', val);
                            }}
                            placeholder="Select mode..."
                            icon={LayoutGrid}
                          />
                        </div>
                        <div className="space-y-2 relative z-10">
                          <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">{t("standard_paper_size", "Standard Paper Size")}</label>
                          <SearchableSelect
                            options={[
                              { id: '80mm', label: '80mm (Standard Thermal)' },
                              { id: '58mm', label: '58mm (Compact Thermal)' },
                              { id: 'a4', label: 'A4 (Invoice Style)' }
                            ]}
                            value={formData.receiptPaperSize}
                            onChange={(val) => {
                              setFormData(prev => ({ ...prev, receiptPaperSize: val as any }));
                              handleInstantUpdate('receiptPaperSize', val);
                            }}
                            placeholder="Select size..."
                            icon={Printer}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2 relative">
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">{t("default_tax_percent", "Default Tax %")}</label>
                            <input
                              type="number"
                              name="taxRate"
                              value={formData.taxRate}
                              onChange={handleChange}
                              step="0.01"
                              className="w-full bg-white dark:bg-black/20 border-gray-200 dark:border-white/5 rounded-xl py-2 px-3 focus:ring-2 focus:ring-[#10B981]/10 focus:border-[#10B981] transition-all text-[13px] sm:text-sm text-gray-900 dark:text-white font-bold"
                              placeholder="0.00"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">{t("tax_business_id", "Tax/Business ID")}</label>
                            <input
                              type="text"
                              name="taxId"
                              value={formData.taxId}
                              onChange={handleChange}
                              className="w-full bg-white dark:bg-black/20 border-gray-200 dark:border-white/5 rounded-xl py-2 px-3 focus:ring-2 focus:ring-[#10B981]/10 focus:border-[#10B981] transition-all text-[13px] sm:text-sm text-gray-900 dark:text-white font-bold"
                              placeholder="NTN / VAT"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Business Invoicing & Counters */}
                    <div className="p-4 sm:p-6 bg-gray-50/50 dark:bg-white/[0.02] rounded-[2rem] border border-gray-200 dark:border-white/5 space-y-6">
                      <div className="flex items-center gap-4 pb-4 border-b border-gray-200 dark:border-white/5">
                        <div className="p-3 bg-white dark:bg-white/10 rounded-2xl shadow-sm">
                          <ClipboardList className="w-5 h-5 text-amber-500" />
                        </div>
                        <div>
                          <h3 className="text-base font-black text-gray-900 dark:text-white uppercase tracking-tight">{t("business_logic", "Business Logic")}</h3>
                          <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest mt-0.5">{t("business_logic_subtitle", "Invoicing, prefix, and serialization controls")}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">{t("invoice_prefix", "Invoice Prefix")}</label>
                          <input
                            type="text"
                            name="invoicePrefix"
                            value={formData.invoicePrefix}
                            onChange={handleChange}
                            className="w-full bg-white dark:bg-black/20 border-gray-200 dark:border-white/5 rounded-xl py-2 px-3 focus:ring-2 focus:ring-[#10B981]/10 focus:border-[#10B981] transition-all text-gray-900 dark:text-white font-bold"
                          />
                        </div>
                        <div className="space-y-1.5 flex flex-col justify-end">
                          <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1 mb-1.5">{t("serial_start", "Serial Start")}</label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              name="invoiceCounter"
                              value={formData.invoiceCounter}
                              onChange={handleChange}
                              className="flex-1 bg-white dark:bg-black/20 border-gray-200 dark:border-white/5 rounded-xl py-2 px-3 focus:ring-2 focus:ring-[#10B981]/10 focus:border-[#10B981] transition-all text-gray-900 dark:text-white font-bold"
                            />
                            <button
                              type="button"
                              onClick={handleRepairCounter}
                              className="px-4 py-2 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-all active:scale-95 whitespace-nowrap"
                            >
                              Repair
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT COLUMN: Experience & System Modules (4 Cols) */}
                  <div className="lg:col-span-4 space-y-6">
                    {/* User Experience Theme */}
                    <div className="p-4 sm:p-6 bg-gray-50/50 dark:bg-white/[0.02] rounded-[2rem] border border-gray-200 dark:border-white/5 space-y-6">
                      <div className="flex items-center gap-3 pb-4 border-b border-gray-200 dark:border-white/5">
                        <div className="p-2.5 bg-white dark:bg-white/10 rounded-xl shadow-sm">
                          <Layout className="w-5 h-5 text-violet-500" />
                        </div>
                        <div>
                          <h3 className="text-base font-black text-gray-900 dark:text-white uppercase tracking-tight">{t("experience", "Experience")}</h3>
                          <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest mt-0.5">{t("experience_subtitle", "Personalize your workspace")}</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">{t("app_theme", "App Theme")}</label>
                          <div className="grid grid-cols-3 gap-2 bg-white dark:bg-black/25 p-1 rounded-xl border border-gray-200 dark:border-white/5">
                            {(['light', 'dark', 'auto'] as const).map((tVal) => (
                              <button
                                key={tVal}
                                type="button"
                                onClick={() => {
                                  setFormData(prev => ({ ...prev, theme: tVal }));
                                  handleInstantUpdate('theme', tVal);
                                }}
                                className={`py-2 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${formData.theme === tVal
                                  ? 'bg-[#10B981] text-white shadow-md'
                                  : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                                  }`}
                              >
                                {tVal === 'light' ? t("theme_light", "Light") : (tVal === 'dark' ? t("theme_dark", "Dark") : tVal)}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">{t("interface_mode", "Interface Mode")}</label>
                          <select
                            name="interfaceMode"
                            value={formData.interfaceMode || 'touch'}
                            onChange={(e) => {
                              handleChange(e);
                              handleInstantUpdate('interfaceMode', e.target.value);
                            }}
                            className="w-full bg-white dark:bg-black/25 border-gray-200 dark:border-white/5 rounded-xl py-2 px-3 focus:ring-2 focus:ring-[#10B981]/10 focus:border-[#10B981] transition-all text-xs font-bold text-gray-900 dark:text-white"
                          >
                            <option value="touch">{t("touch_friendly", "Touch Friendly (POS Optimized)")}</option>
                            <option value="traditional">{t("traditional", "Traditional (Keyboard Focused)")}</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* System Modules Toggles */}
                    <div className="p-4 sm:p-6 bg-gradient-to-br from-violet-50/40 to-emerald-50/30 dark:from-violet-900/5 dark:to-emerald-900/5 rounded-[2rem] border border-violet-200/30 dark:border-violet-900/20 space-y-6">
                      <div className="flex items-center gap-4 pb-4 border-b border-violet-200/40 dark:border-violet-900/20">
                        <div className="w-10 h-10 bg-violet-100 dark:bg-violet-900/20 rounded-xl flex items-center justify-center">
                          <Sliders className="w-5 h-5 text-violet-600" />
                        </div>
                        <div>
                          <h3 className="text-base font-black text-gray-900 dark:text-white uppercase tracking-tight">{t("system_modules", "System Modules")}</h3>
                          <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest mt-0.5">{t("system_modules_subtitle", "Enable or disable advanced features")}</p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {/* Retail Mode Toggle */}
                        <label className="flex items-center justify-between p-3 bg-white dark:bg-black/20 border border-gray-200 dark:border-white/5 rounded-xl cursor-pointer group transition-all">
                          <div className="flex items-center gap-3">
                            <Store className="w-4 h-4 text-gray-500 group-hover:text-violet-500 transition-colors" />
                            <div>
                              <span className="text-xs font-bold text-gray-700 dark:text-gray-300 block leading-none">{t("retail_sales", "Retail Sales")}</span>
                              <span className="text-[8px] text-gray-500 uppercase tracking-wider block mt-1">{t("retail_sales_subtitle", "B2C direct sales")}</span>
                            </div>
                          </div>
                          <div className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none">
                            <input
                              type="checkbox"
                              name="retailEnabled"
                              checked={formData.retailEnabled}
                              onChange={(e) => handleInstantUpdate('retailEnabled', e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-violet-500"></div>
                          </div>
                        </label>

                        {/* Wholesale Mode Toggle */}
                        <label className="flex items-center justify-between p-3 bg-white dark:bg-black/20 border border-gray-200 dark:border-white/5 rounded-xl cursor-pointer group transition-all">
                          <div className="flex items-center gap-3">
                            <ShoppingBag className="w-4 h-4 text-gray-500 group-hover:text-violet-500 transition-colors" />
                            <div>
                              <span className="text-xs font-bold text-gray-700 dark:text-gray-300 block leading-none">{t("wholesale_mode", "Wholesale Mode")}</span>
                              <span className="text-[8px] text-gray-500 uppercase tracking-wider block mt-1">{t("wholesale_mode_subtitle", "Allow wholesale price tiers")}</span>
                            </div>
                          </div>
                          <div className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none">
                            <input
                              type="checkbox"
                              name="wholesaleEnabled"
                              checked={formData.wholesaleEnabled}
                              onChange={(e) => {
                                setFormData(p => ({ ...p, wholesaleEnabled: e.target.checked }));
                                handleInstantUpdate('wholesaleEnabled', e.target.checked);
                              }}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-violet-500"></div>
                          </div>
                        </label>

                        {/* E-Store Mode Toggle */}
                        <label className="flex items-center justify-between p-3 bg-white dark:bg-black/20 border border-gray-200 dark:border-white/5 rounded-xl cursor-pointer group transition-all">
                          <div className="flex items-center gap-3">
                            <Globe className="w-4 h-4 text-gray-500 group-hover:text-violet-500 transition-colors" />
                            <div>
                              <span className="text-xs font-bold text-gray-700 dark:text-gray-300 block leading-none">{t("estore_mode", "E-Store Mode")}</span>
                              <span className="text-[8px] text-gray-500 uppercase tracking-wider block mt-1">{t("estore_mode_subtitle", "Allow e-store channel")}</span>
                            </div>
                          </div>
                          <div className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none">
                            <input
                              type="checkbox"
                              name="estoreEnabled"
                              checked={formData.estoreEnabled}
                              onChange={(e) => {
                                setFormData(p => ({ ...p, estoreEnabled: e.target.checked }));
                                handleInstantUpdate('estoreEnabled', e.target.checked);
                              }}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-violet-500"></div>
                          </div>
                        </label>

                        {/* Touch Keyboard Toggle */}
                        <label className="flex items-center justify-between p-3 bg-white dark:bg-black/20 border border-gray-200 dark:border-white/5 rounded-xl cursor-pointer group transition-all">
                          <div className="flex items-center gap-3">
                            <Keyboard className="w-4 h-4 text-gray-500 group-hover:text-violet-500 transition-colors" />
                            <div>
                              <span className="text-xs font-bold text-gray-700 dark:text-gray-300 block leading-none">{t("touch_keyboard", "Touch Keyboard")}</span>
                              <span className="text-[8px] text-gray-500 uppercase tracking-wider block mt-1">{t("touch_keyboard_subtitle", "On-screen layout inputs")}</span>
                            </div>
                          </div>
                          <div className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none">
                            <input
                              type="checkbox"
                              name="touchKeyboardEnabled"
                              checked={formData.touchKeyboardEnabled}
                              onChange={(e) => {
                                setFormData(p => ({ ...p, touchKeyboardEnabled: e.target.checked }));
                                handleInstantUpdate('touchKeyboardEnabled', e.target.checked);
                              }}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-violet-500"></div>
                          </div>
                        </label>

                        {/* Sound Feedback Toggle */}
                        <label className="flex items-center justify-between p-3 bg-white dark:bg-black/20 border border-gray-200 dark:border-white/5 rounded-xl cursor-pointer group transition-all">
                          <div className="flex items-center gap-3">
                            {formData.soundEnabled
                              ? <Volume2 className="w-4 h-4 text-violet-500 transition-colors" />
                              : <VolumeX className="w-4 h-4 text-gray-500 group-hover:text-violet-500 transition-colors" />
                            }
                            <div>
                              <span className="text-xs font-bold text-gray-700 dark:text-gray-300 block leading-none">{t("sound_feedback", "Sound Feedback")}</span>
                              <span className="text-[8px] text-gray-500 uppercase tracking-wider block mt-1">{t("sound_feedback_subtitle", "Keyboard UI feedback sounds")}</span>
                            </div>
                          </div>
                          <div className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none">
                            <input
                              type="checkbox"
                              name="soundEnabled"
                              checked={formData.soundEnabled}
                              onChange={(e) => {
                                setFormData(p => ({ ...p, soundEnabled: e.target.checked }));
                                handleInstantUpdate('soundEnabled', e.target.checked);
                                if (e.target.checked) setTimeout(() => play('success'), 100);
                              }}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-violet-500"></div>
                          </div>
                        </label>

                        {/* Split Payments Toggle */}
                        <label className="flex items-center justify-between p-3 bg-white dark:bg-black/20 border border-gray-200 dark:border-white/5 rounded-xl cursor-pointer group transition-all">
                          <div className="flex items-center gap-3">
                            <Layers className="w-4 h-4 text-gray-500 group-hover:text-violet-500 transition-colors" />
                            <div>
                              <span className="text-xs font-bold text-gray-700 dark:text-gray-300 block leading-none">{t("enable_split_payments", "Split Payments")}</span>
                              <span className="text-[8px] text-gray-500 uppercase tracking-wider block mt-1">{t("enable_split_payments_subtitle", "Allow split payment mode")}</span>
                            </div>
                          </div>
                          <div className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none">
                            <input
                              type="checkbox"
                              checked={formData.enableSplitPayment}
                              onChange={(e) => handleInstantUpdate('enableSplitPayment', e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-[#10B981]"></div>
                          </div>
                        </label>

                        {/* Delivery Charges Toggle */}
                        <label className="flex items-center justify-between p-3 bg-white dark:bg-black/20 border border-gray-200 dark:border-white/5 rounded-xl cursor-pointer group transition-all">
                          <div className="flex items-center gap-3">
                            <PlusCircle className="w-4 h-4 text-gray-500 group-hover:text-violet-500 transition-colors" />
                            <div>
                              <span className="text-xs font-bold text-gray-700 dark:text-gray-300 block leading-none">{t("enable_dc_charges", "Enable DC Charges")}</span>
                              <span className="text-[8px] text-gray-500 uppercase tracking-wider block mt-1">{t("enable_dc_charges_subtitle", "Extra packaging & delivery fees")}</span>
                            </div>
                          </div>
                          <div className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none">
                            <input
                              type="checkbox"
                              checked={formData.enableExtraCharges}
                              onChange={(e) => handleInstantUpdate('enableExtraCharges', e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-[#10B981]"></div>
                          </div>
                        </label>

                        {/* Hard Block Credit Limit Toggle */}
                        <label className="flex items-center justify-between p-3 bg-rose-500/5 border border-rose-500/10 rounded-xl cursor-pointer group transition-all">
                          <div className="flex items-center gap-3">
                            <AlertTriangle className="w-4 h-4 text-rose-500" />
                            <div>
                              <span className="text-xs font-bold text-rose-600 dark:text-rose-400 block leading-none">{t("hard_block_credit_limit", "Block Credit Limit")}</span>
                              <span className="text-[8px] text-rose-500/70 uppercase tracking-wider block mt-1">{t("hard_block_credit_limit_subtitle", "Block invoice if over limit")}</span>
                            </div>
                          </div>
                          <div className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none">
                            <input
                              type="checkbox"
                              checked={!formData.allowCreditOverLimit}
                              onChange={(e) => handleInstantUpdate('allowCreditOverLimit', !e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-rose-500"></div>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'database' && profile?.role === 'admin' && (
              <section className="space-y-8">
                <DatabaseTools />
              </section>
            )}



            {activeTab === 'receipt' && (
              <section className="space-y-6">
                <div className="flex items-center gap-3 pb-4 border-b border-gray-50 dark:border-white/5">
                  <div className="w-10 h-10 bg-[#10B981]/10 rounded-xl flex items-center justify-center">
                    <Printer className="w-5 h-5 text-[#10B981]" />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Receipt Design</h2>
                    <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest mt-0.5">Branding & Printing Orchestration</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  
                  {/* Column 1: Layout & Templates (5 Cols) */}
                  <div className="lg:col-span-5 space-y-6">
                    <div className="p-4 sm:p-5 bg-gray-50/50 dark:bg-white/[0.02] rounded-[2rem] border border-gray-200 dark:border-white/5 space-y-4">
                      <div className="space-y-2 relative z-30">
                        <label className="block text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">Paper Size</label>
                        <SearchableSelect
                          options={[
                            { id: '80mm', label: 'Thermal 80mm (Standard)' },
                            { id: '58mm', label: 'Thermal 58mm (Compact)' },
                            { id: 'A4', label: 'Office A4 Sheet' }
                          ]}
                          value={formData.receiptPaperSize}
                          onChange={(val) => {
                            setFormData(p => ({ ...p, receiptPaperSize: val }));
                            handleInstantUpdate('receiptPaperSize', val);
                          }}
                          placeholder="Select paper size..."
                          icon={Printer}
                        />
                      </div>

                      <div className="space-y-2 relative z-30">
                        <label className="block text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">Visual Template</label>
                        <SearchableSelect
                          options={[
                            { id: 'modern', label: 'Modern Clean' },
                            { id: 'minimal', label: 'Minimalist' },
                            { id: 'professional', label: 'Enterprise Pro' },
                            { id: 'compact', label: 'Ultra Compact' },
                            { id: 'classic', label: 'Legacy System' },
                            { id: 'horizontal_header', label: 'Horizontal Header' },
                            { id: 'centered_flow', label: 'Centered Flow' },
                            { id: 'left_grid', label: 'Left-Aligned Grid' },
                            { id: 'split_columns', label: 'Split Columns' },
                            { id: 'floating_totals', label: 'Floating Totals' },
                            { id: 'offset_logo', label: 'Offset Logo' },
                            { id: 'boxed_sections', label: 'Boxed Sections' },
                            { id: 'tear_off', label: 'Tear-Off Slip' },
                            { id: 'vertical_line', label: 'Vertical Line Header' },
                            { id: 'emphasized_total', label: 'Emphasized Total' }
                          ]}
                          value={formData.receiptTemplate}
                          onChange={(val) => {
                            setFormData(p => ({ ...p, receiptTemplate: val }));
                            handleInstantUpdate('receiptTemplate', val);
                          }}
                          placeholder="Select template..."
                          icon={LayoutGrid}
                        />
                      </div>

                      <div className="space-y-1.5 p-3 bg-white dark:bg-black/20 rounded-xl border border-gray-200 dark:border-white/5">
                        <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 ml-1 uppercase tracking-wider flex justify-between">
                          Global Font Weight
                          <span className="text-[#10B981] font-black">{formData.receiptFontWeight || 600}</span>
                        </label>
                        <input
                          type="range"
                          min="100"
                          max="900"
                          step="100"
                          name="receiptFontWeight"
                          value={formData.receiptFontWeight || 600}
                          onChange={(e) => setFormData(p => ({ ...p, receiptFontWeight: parseInt(e.target.value) }))}
                          onMouseUp={(e: any) => handleInstantUpdate('receiptFontWeight', parseInt(e.target.value))}
                          onTouchEnd={(e: any) => handleInstantUpdate('receiptFontWeight', parseInt(e.target.value))}
                          disabled={!canEditSettings}
                          className="w-full h-1.5 bg-gray-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-600 my-2"
                        />
                      </div>

                      <div className="space-y-1.5 p-3 bg-white dark:bg-black/20 rounded-xl border border-gray-200 dark:border-white/5">
                        <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 ml-1 uppercase tracking-wider flex justify-between">
                          Zoom Scale
                          <span className="text-[#10B981] font-black">{formData.receiptFontScale}x</span>
                        </label>
                        <input
                          type="range"
                          min="0.5"
                          max="1.5"
                          step="0.1"
                          name="receiptFontScale"
                          value={formData.receiptFontScale}
                          onChange={(e) => setFormData(p => ({ ...p, receiptFontScale: parseFloat(e.target.value) }))}
                          onMouseUp={(e: any) => handleInstantUpdate('receiptFontScale', parseFloat(e.target.value))}
                          onTouchEnd={(e: any) => handleInstantUpdate('receiptFontScale', parseFloat(e.target.value))}
                          disabled={!canEditSettings}
                          className="w-full h-1.5 bg-gray-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-600 my-2"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex items-center justify-between p-3 bg-white dark:bg-black/20 border border-gray-200 dark:border-white/5 rounded-xl cursor-pointer group">
                          <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300">Auto Print</span>
                          <input
                            type="checkbox"
                            name="receiptPrinter"
                            checked={formData.receiptPrinter}
                            onChange={handleChange}
                            disabled={!canEditSettings}
                            className="w-4 h-4 rounded text-primary focus:ring-emerald-500"
                          />
                        </label>

                        <label className="flex items-center justify-between p-3 bg-white dark:bg-black/20 border border-gray-200 dark:border-white/5 rounded-xl cursor-pointer group">
                          <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300">Enable KOT</span>
                          <input
                            type="checkbox"
                            name="enableKotPrinter"
                            checked={!!formData.enableKotPrinter}
                            onChange={(e) => {
                              setFormData(p => ({ ...p, enableKotPrinter: e.target.checked }));
                              handleInstantUpdate('enableKotPrinter', e.target.checked);
                            }}
                            disabled={!canEditSettings}
                            className="w-4 h-4 rounded text-primary focus:ring-emerald-500"
                          />
                        </label>
                      </div>
                    </div>

                    {/* Texts Areas */}
                    <div className="p-4 sm:p-5 bg-gray-50/50 dark:bg-white/[0.02] rounded-[2rem] border border-gray-200 dark:border-white/5 space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">Header Welcome Text</label>
                        <textarea
                          name="receiptHeader"
                          value={formData.receiptHeader}
                          onChange={handleChange}
                          disabled={!canEditSettings}
                          className="w-full bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-xl py-2 px-3 transition-all text-xs font-bold text-gray-900 dark:text-white font-mono resize-none"
                          rows={2}
                          placeholder="Welcome to our store..."
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">Footer / Terms Text</label>
                        <textarea
                          name="receiptFooter"
                          value={formData.receiptFooter}
                          onChange={handleChange}
                          disabled={!canEditSettings}
                          className="w-full bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-xl py-2 px-3 transition-all text-xs font-bold text-gray-900 dark:text-white font-mono resize-none"
                          rows={2}
                          placeholder="Thank you for shopping!"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Column 2: Margin Settings & Toggles (4 Cols) */}
                  <div className="lg:col-span-4 space-y-6">
                    {/* Hardware Position Calibration */}
                    <div className="p-4 sm:p-5 bg-gray-50/50 dark:bg-white/[0.02] rounded-[2rem] border border-gray-200 dark:border-white/5 space-y-4">
                      <div className="flex items-center justify-between border-b border-gray-200/50 dark:border-white/5 pb-2">
                        <label className="text-[10px] font-black text-gray-900 dark:text-white uppercase tracking-wider block">
                          🎯 Hardware Calibration (mm)
                        </label>
                        <button
                          type="button"
                          onClick={handleResetCalibration}
                          className="text-[9px] font-black uppercase tracking-widest text-primary dark:text-emerald-400 hover:text-primary transition-colors"
                        >
                          Reset
                        </button>
                      </div>

                      <div className="space-y-3">
                        {/* Padding Top */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-[9px] font-bold text-gray-600 uppercase">
                            <span>Margin Top</span>
                            <span className="font-black text-[#10B981]">{formData.receiptPaddingTop ?? 0}mm</span>
                          </div>
                          <input type="range" min="-60" max="60" step="1"
                            value={formData.receiptPaddingTop ?? 0}
                            onChange={(e) => setFormData(p => ({ ...p, receiptPaddingTop: parseInt(e.target.value) }))}
                            disabled={!canEditSettings}
                            className="w-full h-1 bg-gray-250 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                          />
                        </div>

                        {/* Padding Bottom */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-[9px] font-bold text-gray-600 uppercase">
                            <span>Margin Bottom</span>
                            <span className="font-black text-[#10B981]">{formData.receiptPaddingBottom ?? 0}mm</span>
                          </div>
                          <input type="range" min="-60" max="60" step="1"
                            value={formData.receiptPaddingBottom ?? 0}
                            onChange={(e) => setFormData(p => ({ ...p, receiptPaddingBottom: parseInt(e.target.value) }))}
                            disabled={!canEditSettings}
                            className="w-full h-1 bg-gray-250 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                          />
                        </div>

                        {/* Padding Left */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-[9px] font-bold text-gray-600 uppercase">
                            <span>Margin Left</span>
                            <span className="font-black text-[#10B981]">{formData.receiptPaddingLeft ?? 0}mm</span>
                          </div>
                          <input type="range" min="-45" max="45" step="1"
                            value={formData.receiptPaddingLeft ?? 0}
                            onChange={(e) => setFormData(p => ({ ...p, receiptPaddingLeft: parseInt(e.target.value) }))}
                            disabled={!canEditSettings}
                            className="w-full h-1 bg-gray-250 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                          />
                        </div>

                        {/* Padding Right */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-[9px] font-bold text-gray-600 uppercase">
                            <span>Margin Right</span>
                            <span className="font-black text-[#10B981]">{formData.receiptPaddingRight ?? 0}mm</span>
                          </div>
                          <input type="range" min="-45" max="45" step="1"
                            value={formData.receiptPaddingRight ?? 0}
                            onChange={(e) => setFormData(p => ({ ...p, receiptPaddingRight: parseInt(e.target.value) }))}
                            disabled={!canEditSettings}
                            className="w-full h-1 bg-gray-250 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                          />
                        </div>

                        {/* Global Horizontal Offset */}
                        <div className="space-y-1 pt-2 border-t border-gray-200/50 dark:border-white/5">
                          <div className="flex justify-between items-center text-[9px] font-black text-primary dark:text-emerald-400 uppercase tracking-wider">
                            <span>🚀 Global Shift (Everything)</span>
                            <span className="text-[#10B981]">{formData.receiptOffsetX ?? 0}mm</span>
                          </div>
                          <input type="range" min="-40" max="40" step="1"
                            name="receiptOffsetX"
                            value={formData.receiptOffsetX ?? 0}
                            onChange={(e) => handleChange({ target: { name: 'receiptOffsetX', value: parseInt(e.target.value) } } as any)}
                            disabled={!canEditSettings}
                            className="w-full h-1 bg-gray-250 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                          />
                        </div>

                        {/* Header Offset */}
                        <div className="space-y-1 pt-2 border-t border-gray-200/50 dark:border-white/5">
                          <div className="flex justify-between items-center text-[9px] font-bold text-gray-600 uppercase">
                            <span>Header Indent</span>
                            <span className="font-black text-blue-500">{formData.receiptHeaderOffsetX ?? 0}mm</span>
                          </div>
                          <input type="range" min="-30" max="30" step="1"
                            name="receiptHeaderOffsetX"
                            value={formData.receiptHeaderOffsetX ?? 0}
                            onChange={(e) => handleChange({ target: { name: 'receiptHeaderOffsetX', value: parseInt(e.target.value) } } as any)}
                            disabled={!canEditSettings}
                            className="w-full h-1 bg-gray-250 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500/50"
                          />
                        </div>

                        {/* Footer Offset */}
                        <div className="space-y-1 pt-2 border-t border-gray-200/50 dark:border-white/5">
                          <div className="flex justify-between items-center text-[9px] font-bold text-gray-600 uppercase">
                            <span>Footer Indent</span>
                            <span className="font-black text-primary">{formData.receiptFooterOffsetX ?? 0}mm</span>
                          </div>
                          <input type="range" min="-30" max="30" step="1"
                            name="receiptFooterOffsetX"
                            value={formData.receiptFooterOffsetX ?? 0}
                            onChange={(e) => handleChange({ target: { name: 'receiptFooterOffsetX', value: parseInt(e.target.value) } } as any)}
                            disabled={!canEditSettings}
                            className="w-full h-1 bg-gray-250 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-500/50"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Visibility Toggles */}
                    <div className="p-4 sm:p-5 bg-gray-50/50 dark:bg-white/[0.02] rounded-[2rem] border border-gray-200 dark:border-white/5 space-y-3">
                      <label className="text-[10px] font-black text-gray-900 dark:text-white uppercase tracking-wider block border-b border-gray-250/50 dark:border-white/5 pb-2">
                        👁️ Print Visibility
                      </label>
                      <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto scrollbar-hide">
                        {[
                          { name: 'receiptShowLogo', label: 'Store Logo' },
                          { name: 'receiptShowTax', label: 'Tax Breakdown' },
                          { name: 'receiptShowDiscount', label: 'Discount Details' },
                          { name: 'receiptFontBold', label: 'High Contrast' },
                          { name: 'receiptShowStoreName', label: 'Store Name' },
                          { name: 'receiptShowStoreAddress', label: 'Store Address' },
                          { name: 'receiptShowStorePhone', label: 'Store Phone' },
                          { name: 'receiptShowStoreEmail', label: 'Store Email' },
                          { name: 'receiptShowCustomerName', label: 'Customer Name' },
                          { name: 'receiptShowCustomerPhone', label: 'Customer Phone' },
                          { name: 'receiptShowNotes', label: 'Show Notes' },
                          { name: 'receiptShowBarcode', label: 'Show Barcode' },
                          { name: 'receiptShowFooter', label: 'Show Footer' },
                        ].map((item) => (
                          <label key={item.name} className="flex items-center gap-2 p-2 bg-white dark:bg-white/[0.02] border border-gray-200 dark:border-white/5 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-white/5">
                            <input
                              type="checkbox"
                              name={item.name}
                              checked={(formData as any)[item.name]}
                              onChange={handleChange}
                              disabled={!canEditSettings}
                              className="rounded border-gray-300 text-primary h-3.5 w-3.5 bg-white dark:bg-[#1C1C1C]"
                            />
                            <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300 truncate">{item.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Column 3: Live Preview (3 Cols) */}
                  <div className="lg:col-span-3 lg:sticky lg:top-4 bg-gray-100 dark:bg-white/[0.03] rounded-[2.5rem] p-4 border border-gray-200 dark:border-white/5 flex flex-col items-center">
                    <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-[#10B981] rounded-full animate-pulse" />
                      Live Preview
                    </h3>
                    <div className="bg-white dark:bg-[#1C1C1C] rounded-2xl p-3 shadow-xl overflow-hidden w-full max-w-[240px] border border-gray-200 dark:border-white/5">
                      <ReceiptPreview settings={{
                        ...state.settings,
                        ...formData,
                        taxRate: parseFloat(formData.taxRate) || 0,
                        receiptFontScale: parseFloat(formData.receiptFontScale) || 1,
                        invoiceCounter: parseInt(formData.invoiceCounter) || 1000,
                      } as unknown as AppSettings} />
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => {
                        const mockSale = {
                          id: 'TEST-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
                          invoiceNumber: (formData.invoicePrefix || 'INV') + '-' + formData.invoiceCounter,
                          timestamp: new Date(),
                          items: [
                            { product: { id: 'p1', name: 'Sample Item 01 (Premium)', price: 1250 }, quantity: 2 },
                            { product: { id: 'p2', name: 'Standard Utility Item', price: 450 }, quantity: 1 }
                          ],
                          subtotal: 2950,
                          discountAmount: 0,
                          taxAmount: 2950 * (parseFloat(formData.taxRate) / 100),
                          total: 2950 * (1 + parseFloat(formData.taxRate) / 100),
                          paymentMethod: 'cash' as const,
                          cashier: profile?.name?.split(' ')[0] || 'ADMIN',
                          saleType: 'retail' as const,
                          saleDate: new Date().toLocaleDateString('en-CA')
                        };
                        setCompletedSale(mockSale as any);
                        setShowReceipt(true);
                      }}
                      className="mt-4 w-full py-3 bg-primary hover:bg-emerald-700 text-white rounded-xl text-[9px] font-black uppercase tracking-[0.2em] shadow-lg shadow-emerald-500/10 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Test Print
                    </button>
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'security' && (
              <section>
                <PasswordChange />
              </section>
            )}

            {activeTab === 'database' && (window as any).electronAPI?.isElectron && (
              <section className="space-y-8">
                <div className="flex items-center gap-3 pb-2 border-b border-gray-50 dark:border-white/5">
                  <div className="w-10 h-10 bg-cyan-100/30 rounded-xl flex items-center justify-center">
                    <Globe className="w-5 h-5 text-cyan-600" />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">Zaynahs DB Adapter</h2>
                    <p className="text-xs text-gray-600 font-medium uppercase tracking-wider">Cloud Backend Provisioning</p>
                  </div>
                </div>

                <div className="p-4 sm:p-8 bg-cyan-50/20 dark:bg-cyan-900/5 rounded-[2rem] border border-cyan-100 dark:border-cyan-900/20 space-y-6">
                  <div className="grid grid-cols-1 gap-6">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-600 uppercase tracking-widest ml-1">Database API URL</label>
                      <input
                        type="url"
                        id="electron-supabase-url"
                        placeholder="https://xxxxxx.zaynahsdb.com"
                        className="w-full bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 rounded-2xl py-3.5 px-5 font-mono text-xs font-bold"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-600 uppercase tracking-widest ml-1">Client Anon Key</label>
                      <input
                        type="password"
                        id="electron-supabase-anon"
                        placeholder="Public token..."
                        className="w-full bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 rounded-2xl py-3.5 px-5 font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-600 uppercase tracking-widest ml-1">Service Role Key (Admin)</label>
                      <input
                        type="password"
                        id="electron-supabase-service"
                        placeholder="Private role key..."
                        className="w-full bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 rounded-2xl py-3.5 px-5 font-mono text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={async () => {
                        const url = (document.getElementById('electron-supabase-url') as HTMLInputElement)?.value;
                        const anon = (document.getElementById('electron-supabase-anon') as HTMLInputElement)?.value;
                        const service = (document.getElementById('electron-supabase-service') as HTMLInputElement)?.value;
                        if (!url || !anon || !service) return sonner.warning('Credentials missing.');
                        try {
                          sonner.loading('Securing connection...');
                          await (window as any).electronAPI.saveConfig({
                            supabaseUrl: url,
                            supabaseAnonKey: anon,
                            supabaseServiceRoleKey: service
                          });
                          sonner.close();
                          const res = await sonner.confirm('Connection Saved', 'Restart system now?', 'Restart App');
                          if (res.isConfirmed) (window as any).electronAPI.restartApp();
                        } catch { 
                          sonner.close();
                          sonner.error('Adapter rejection.'); 
                        }
                      }}
                      className="flex-1 py-4 bg-cyan-600 text-white rounded-2xl font-black text-sm hover:bg-cyan-700 transition-all flex items-center justify-center gap-2"
                    >
                      <Save className="w-5 h-5" />
                      Apply & Restart System
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const config = await (window as any).electronAPI.getConfig();
                          (document.getElementById('electron-supabase-url') as HTMLInputElement).value = config.supabaseUrl || '';
                          (document.getElementById('electron-supabase-anon') as HTMLInputElement).value = config.supabaseAnonKey || '';
                          (document.getElementById('electron-supabase-service') as HTMLInputElement).value = config.supabaseServiceRoleKey || '';
                          sonner.info('Configuration loaded.');
                        } catch { sonner.error('Read failure.'); }
                      }}
                      className="p-4 bg-gray-100 dark:bg-white/5 text-gray-600 rounded-2xl hover:bg-gray-200"
                    >
                      <RefreshCw className="w-5 h-5" />
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-600 font-bold text-center uppercase tracking-widest leading-relaxed">
                    Connecting to restricted infrastructure.<br />Ensure SSL/TLS endpoint is verified.
                  </p>
                </div>
              </section>
            )}

            {activeTab === 'estore' && (
              <section className="space-y-8">
                <div className="flex items-center gap-3 pb-2 border-b border-gray-50 dark:border-white/5">
                  <div className="w-10 h-10 bg-emerald-100/30 rounded-xl flex items-center justify-center">
                    <Globe className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">Online Store Settings</h2>
                    <p className="text-xs text-gray-600 font-medium uppercase tracking-wider">Manage your public E-Store</p>
                  </div>
                </div>

                <div className="p-4 sm:p-8 bg-emerald-50/20 dark:bg-emerald-900/5 rounded-[2rem] border border-emerald-100 dark:border-emerald-900/20 space-y-6">
                  <div className="flex items-center justify-between p-4 bg-white dark:bg-black/20 border border-gray-200 dark:border-white/5 rounded-2xl">
                    <div>
                      <h4 className="font-bold text-gray-900 dark:text-white">Your Public Store Link</h4>
                      <p className="text-xs text-gray-500 mt-1">Share this link with your customers to start receiving orders.</p>
                    </div>
                    <a href="/store" target="_blank" rel="noopener noreferrer" className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all">
                      Visit Store
                    </a>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* --- ADVANCED THEME SETTINGS --- */}
                    <div className="col-span-1 md:col-span-2 pt-2 border-t border-gray-100 dark:border-white/5">
                      <h4 className="text-sm font-bold text-gray-800 dark:text-white mb-4">Advanced Theme Customization</h4>
                      <div className="space-y-4">
                        <div>
                          <label className="text-xs font-bold text-gray-600 uppercase tracking-widest ml-1 mb-2 block">Theme Presets</label>
                          <div className="flex flex-wrap gap-3 items-center">
                            {[
                              { name: 'Green', primary: '#10b981', hover: '#059669', bg: '#f9fafb', text: '#111827', card: '#ffffff' },
                              { name: 'Blue', primary: '#3b82f6', hover: '#2563eb', bg: '#0f172a', text: '#f8fafc', card: '#1e293b' },
                              { name: 'Rose', primary: '#fb7185', hover: '#e11d48', bg: '#fff1f2', text: '#4c0519', card: '#ffffff' },
                              { name: 'Orange', primary: '#f97316', hover: '#ea580c', bg: '#fff7ed', text: '#431407', card: '#ffffff' },
                              { name: 'Purple', primary: '#8b5cf6', hover: '#7c3aed', bg: '#faf5ff', text: '#2e1065', card: '#ffffff' },
                              { name: 'Dark', primary: '#6366f1', hover: '#4f46e5', bg: '#000000', text: '#ffffff', card: '#111111' },
                              { name: 'Coffee', primary: '#d97706', hover: '#b45309', bg: '#fefce8', text: '#713f12', card: '#fffbeb' },
                              { name: 'Ocean', primary: '#06b6d4', hover: '#0891b2', bg: '#f0fdfa', text: '#164e63', card: '#ffffff' },
                              { name: 'Crimson', primary: '#e11d48', hover: '#be123c', bg: '#fff1f2', text: '#881337', card: '#ffffff' },
                              { name: 'Mono', primary: '#000000', hover: '#333333', bg: '#ffffff', text: '#000000', card: '#fafafa' }
                            ].map((preset, idx) => (
                              <button
                                key={idx}
                                type="button"
                                title={preset.name}
                                onClick={() => setFormData(prev => ({ 
                                  ...prev, 
                                  estoreThemeColor: preset.primary,
                                  estorePrimaryColorHover: preset.hover,
                                  estoreBgColor: preset.bg,
                                  estoreTextColor: preset.text,
                                  estoreCardBgColor: preset.card
                                }))}
                                className={`px-4 py-2 rounded-xl border-2 transition-transform hover:-translate-y-0.5 shadow-sm flex items-center gap-2 font-bold text-xs ${formData.estoreThemeColor === preset.primary && formData.estoreBgColor === preset.bg ? 'border-primary ring-2 ring-primary/20 shadow-md' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}
                                style={{ backgroundColor: preset.card, color: preset.text }}
                              >
                                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: preset.primary }}></span>
                                {preset.name}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-500 uppercase">Primary</label>
                            <div className="flex items-center gap-2">
                              <input type="color" name="estoreThemeColor" value={formData.estoreThemeColor || '#10b981'} onChange={handleChange} className="w-8 h-8 rounded cursor-pointer border-0 p-0" />
                              <span className="text-xs text-gray-600 font-mono">{formData.estoreThemeColor || '#10b981'}</span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-500 uppercase">Btn Hover</label>
                            <div className="flex items-center gap-2">
                              <input type="color" name="estorePrimaryColorHover" value={formData.estorePrimaryColorHover || '#059669'} onChange={handleChange} className="w-8 h-8 rounded cursor-pointer border-0 p-0" />
                              <span className="text-xs text-gray-600 font-mono">{formData.estorePrimaryColorHover || '#059669'}</span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-500 uppercase">Page BG</label>
                            <div className="flex items-center gap-2">
                              <input type="color" name="estoreBgColor" value={formData.estoreBgColor || '#f9fafb'} onChange={handleChange} className="w-8 h-8 rounded cursor-pointer border-0 p-0" />
                              <span className="text-xs text-gray-600 font-mono">{formData.estoreBgColor || '#f9fafb'}</span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-500 uppercase">Card BG</label>
                            <div className="flex items-center gap-2">
                              <input type="color" name="estoreCardBgColor" value={formData.estoreCardBgColor || '#ffffff'} onChange={handleChange} className="w-8 h-8 rounded cursor-pointer border-0 p-0" />
                              <span className="text-xs text-gray-600 font-mono">{formData.estoreCardBgColor || '#ffffff'}</span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-500 uppercase">Text</label>
                            <div className="flex items-center gap-2">
                              <input type="color" name="estoreTextColor" value={formData.estoreTextColor || '#111827'} onChange={handleChange} className="w-8 h-8 rounded cursor-pointer border-0 p-0" />
                              <span className="text-xs text-gray-600 font-mono">{formData.estoreTextColor || '#111827'}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* --- ORDER TIMER SETTINGS --- */}
                    <div className="col-span-1 md:col-span-2 pt-4 border-t border-gray-100 dark:border-white/5">
                      <h4 className="text-sm font-bold text-gray-800 dark:text-white mb-4">Live Order Timer</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="flex items-center justify-between p-4 bg-white dark:bg-black/20 border border-gray-200 dark:border-white/5 rounded-2xl cursor-pointer">
                          <div>
                            <h4 className="font-bold text-sm text-gray-900 dark:text-white">Enable Countdown</h4>
                            <p className="text-[10px] text-gray-500 font-medium">Show live countdown on customer order screen</p>
                          </div>
                          <div className="relative">
                            <input type="checkbox" name="estoreOrderTimerEnabled" checked={formData.estoreOrderTimerEnabled === true} onChange={handleChange} className="sr-only peer" />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 dark:peer-focus:ring-primary/30 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
                          </div>
                        </label>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-gray-600 uppercase tracking-widest ml-1">Default Prep Time (Minutes)</label>
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">Min</span>
                            <input
                              type="number"
                              name="estoreOrderTimerMinutes"
                              value={formData.estoreOrderTimerMinutes || 30}
                              onChange={handleChange}
                              min="1"
                              disabled={!formData.estoreOrderTimerEnabled}
                              className="w-full pl-12 bg-white dark:bg-black/20 border-gray-200 dark:border-white/5 rounded-2xl py-3.5 px-5 text-xs font-bold focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all disabled:opacity-50"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <label className="flex items-center justify-between p-4 bg-white dark:bg-black/20 border border-gray-200 dark:border-white/5 rounded-2xl cursor-pointer">
                      <div>
                        <h4 className="font-bold text-sm text-gray-900 dark:text-white">Cash on Delivery</h4>
                        <p className="text-[10px] text-gray-500 font-medium">Allow customers to pay when order arrives</p>
                      </div>
                      <div className="relative">
                        <input type="checkbox" name="estoreCodEnabled" checked={formData.estoreCodEnabled !== false} onChange={handleChange} className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 dark:peer-focus:ring-primary/30 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
                      </div>
                    </label>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-600 uppercase tracking-widest ml-1">Delivery Fee</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">{formData.currency || 'Rs'}</span>
                        <input
                          type="number"
                          name="estoreDeliveryFee"
                          value={formData.estoreDeliveryFee || 0}
                          onChange={handleChange}
                          min="0"
                          className="w-full pl-12 bg-white dark:bg-black/20 border-gray-200 dark:border-white/5 rounded-2xl py-3.5 px-5 text-xs font-bold focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-600 uppercase tracking-widest ml-1">Min Order for Free Delivery</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">{formData.currency || 'Rs'}</span>
                        <input
                          type="number"
                          name="estoreMinOrder"
                          value={formData.estoreMinOrder || 0}
                          onChange={handleChange}
                          min="0"
                          className="w-full pl-12 bg-white dark:bg-black/20 border-gray-200 dark:border-white/5 rounded-2xl py-3.5 px-5 text-xs font-bold focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                        />
                      </div>
                    </div>

                    {/* Geofencing Settings */}
                    <div className="col-span-1 md:col-span-2 pt-4 border-t border-gray-100 dark:border-white/5">
                      <h4 className="text-sm font-bold text-gray-800 dark:text-white mb-4">Delivery Geofencing</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-gray-600 uppercase tracking-widest ml-1 flex items-center gap-1">
                            Store Latitude
                            <HelpTooltip content={<span>The central Latitude coordinate of your physical store. You can find this by right-clicking your location on <a href="https://maps.google.com" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">Google Maps</a>. E.g. 31.5204</span>} />
                          </label>
                          <input
                            type="number"
                            step="any"
                            name="estoreLocationLat"
                            value={formData.estoreLocationLat || ''}
                            onChange={handleChange}
                            placeholder="e.g. 24.8607"
                            className="w-full bg-white dark:bg-black/20 border-gray-200 dark:border-white/5 rounded-2xl py-3.5 px-5 text-xs font-bold focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-gray-600 uppercase tracking-widest ml-1 flex items-center gap-1">
                            Store Longitude
                            <HelpTooltip content={<span>The central Longitude coordinate of your physical store. You can find this by right-clicking your location on <a href="https://maps.google.com" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">Google Maps</a>. E.g. 74.3587</span>} />
                          </label>
                          <input
                            type="number"
                            step="any"
                            name="estoreLocationLng"
                            value={formData.estoreLocationLng || ''}
                            onChange={handleChange}
                            placeholder="e.g. 67.0011"
                            className="w-full bg-white dark:bg-black/20 border-gray-200 dark:border-white/5 rounded-2xl py-3.5 px-5 text-xs font-bold focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-gray-600 uppercase tracking-widest ml-1 flex items-center gap-1">
                            Max Radius (km)
                            <HelpTooltip content="The maximum distance (in kilometers) from your store where you offer delivery. Customers outside this range will not be able to checkout." />
                          </label>
                          <div className="relative">
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">km</span>
                            <input
                              type="number"
                              name="estoreDeliveryRadius"
                              value={formData.estoreDeliveryRadius || 5}
                              onChange={handleChange}
                              min="1"
                              className="w-full pr-12 bg-white dark:bg-black/20 border-gray-200 dark:border-white/5 rounded-2xl py-3.5 px-5 text-xs font-bold focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                            />
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-r-xl text-sm">
                        <p className="font-bold text-blue-800 dark:text-blue-300">How to get your coordinates?</p>
                        <p className="text-blue-700 dark:text-blue-400 mt-1">
                          1. Open <a href="https://maps.google.com" target="_blank" rel="noreferrer" className="underline font-bold">Google Maps</a><br/>
                          2. Search for your store location.<br/>
                          3. Right-click the red pin and click the numbers (e.g. 31.5204, 74.3587) to copy them.<br/>
                          4. Paste the first number in Latitude and the second in Longitude.
                        </p>
                      </div>
                    </div>

                    {/* WhatsApp Support Settings */}
                    <div className="col-span-1 md:col-span-2 pt-4 border-t border-gray-100 dark:border-white/5">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h4 className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
                            WhatsApp Support Icon
                            <HelpTooltip content="Displays a floating WhatsApp icon in the bottom right corner of the online store, allowing customers to message you directly." />
                          </h4>
                          <p className="text-xs text-gray-500">Show a floating WhatsApp button on your E-Store</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" name="estoreWhatsappEnabled" checked={formData.estoreWhatsappEnabled || false} onChange={handleChange} className="sr-only peer" />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-black/40 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-emerald-500"></div>
                        </label>
                      </div>
                      
                      {formData.estoreWhatsappEnabled && (
                        <div className="space-y-1.5 max-w-sm">
                          <label className="text-xs font-bold text-gray-600 uppercase tracking-widest ml-1 flex items-center gap-1">
                            WhatsApp Phone Number
                            <HelpTooltip content="Enter your number in international format without plus or zeros. Example for Pakistan: 923001234567" />
                          </label>
                          <input
                            type="text"
                            name="estoreWhatsappNumber"
                            value={formData.estoreWhatsappNumber || ''}
                            onChange={handleChange}
                            placeholder="e.g. +923001234567"
                            className="w-full bg-white dark:bg-black/20 border-gray-200 dark:border-white/5 rounded-2xl py-3.5 px-5 text-xs font-bold focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                          />
                        </div>
                      )}
                    </div>

                  </div>
                  
                  <div className="p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5 mt-6">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      Note: You can turn individual products on or off for the E-Store from the Inventory section by checking the "Show in Online Store" option when editing a product.
                    </p>
                  </div>
                </div>
              </section>
            )}
          </form>
        </div>
      </div>

      {/* Floating Action Bar - Standardized & Mobile Fit */}
      <StickyFormFooter
        isSaving={isSaving}
        onDiscard={() => window.history.back()}
        saveLabel={t("update_system", "Update System")}
        formId="settings-form"
        disabled={!canEditSettings}
        statusBadge={
          <div className="hidden sm:flex items-center gap-4">
            {syncStatus === 'saving' && (
              <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-full border border-blue-100 dark:border-blue-900/30">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                <span className="text-xs font-black text-blue-700 dark:text-blue-400">Saving...</span>
              </div>
            )}
            {syncStatus === 'syncing' && (
              <div className="flex items-center gap-3 px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-full border border-emerald-100 dark:border-emerald-900/30">
                <Cloud className="w-4 h-4 text-primary animate-bounce" />
                <span className="text-xs font-black text-emerald-700 dark:text-emerald-400">Cloud Sync...</span>
              </div>
            )}
            {syncStatus === 'idle' && (
              <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 dark:bg-white/5 rounded-full border border-gray-200 dark:border-white/5">
                <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-[#10B981]' : 'bg-gray-300'}`} />
                <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">{isOnline ? 'Online' : 'Offline'}</span>
              </div>
            )}
          </div>
        }
      />

      {/* Support Footer */}
      <div className="mt-12 pb-32 text-center space-y-4">
        <div className="flex flex-col sm:flex-row justify-center items-center gap-4 sm:gap-8">
          <button onClick={() => window.open('https://www.zaynahspos.com', '_blank')} className="flex items-center gap-2 text-primary hover:text-emerald-700 font-bold underline underline-offset-4 decoration-2 decoration-emerald-100 transition-all">
            <Globe className="w-4 h-4" />
            <span className="text-xs uppercase tracking-widest whitespace-nowrap">www.zaynahspos.com</span>
          </button>
          <button onClick={() => window.location.href = 'mailto:zaynahspos@gmail.com'} className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-bold underline underline-offset-4 decoration-2 decoration-blue-100 transition-all">
            <Smartphone className="w-4 h-4" />
            <span className="text-xs uppercase tracking-widest whitespace-nowrap">zaynahspos@gmail.com</span>
          </button>
        </div>
        <p className="text-[10px] text-gray-600 font-bold uppercase tracking-[0.2em]">Crafted for peak performance & enterprise reliability</p>
      </div>
      {showReceipt && completedSale && (
        <ReceiptPrint sale={completedSale} onClose={() => setShowReceipt(false)} />
      )}
    </div>
  );
}