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
  MapPin,
  Navigation,
  Info,
  LocateFixed,
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
import { Button, ToggleSwitch, SegmentedControl, Select } from '../../shared/ui';

type TabType = 'general' | 'receipt' | 'backup' | 'security' | 'database' | 'estore';

const TIME_OPTIONS = Array.from({ length: 48 }).map((_, i) => {
  const hour = Math.floor(i / 2);
  const min = i % 2 === 0 ? '00' : '30';
  const val = `${hour.toString().padStart(2, '0')}:${min}`;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return { value: val, label: `${displayHour}:${min} ${ampm}` };
});
// Add 23:59 for end of day
TIME_OPTIONS.push({ value: '23:59', label: '11:59 PM' });

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
    receiptShowDeliveryAddress: state.settings?.receiptShowDeliveryAddress ?? true,
    receiptShowQrCode: state.settings?.receiptShowQrCode ?? true,
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
    estoreOrderTimerEnabled: state.settings.estoreOrderTimerEnabled ?? false,
    estoreOrderTimerMinutes: state.settings.estoreOrderTimerMinutes ?? 30,
    estoreCodEnabled: state.settings.estoreCodEnabled ?? true,
    estoreCustomPaymentEnabled: state.settings.estoreCustomPaymentEnabled ?? false,
    estoreCustomPaymentName: state.settings.estoreCustomPaymentName ?? '',
    estoreCustomPaymentDetail: state.settings.estoreCustomPaymentDetail ?? '',
    estoreCustomPaymentNote: state.settings.estoreCustomPaymentNote ?? '',
    estoreDeliveryFee: state.settings.estoreDeliveryFee ?? 0,
    estoreMinOrder: state.settings.estoreMinOrder ?? 0,
    estoreWhatsappEnabled: state.settings.estoreWhatsappEnabled ?? false,
    estoreWhatsappNumber: state.settings.estoreWhatsappNumber ?? '',
    estoreLocationLat: state.settings.estoreLocationLat ?? '',
    estoreLocationLng: state.settings.estoreLocationLng ?? '',
    estoreDeliveryRadius: state.settings.estoreDeliveryRadius ?? 5,
    estoreThemeColor: state.settings.estoreThemeColor ?? '#10b981',
    estorePrimaryColorHover: state.settings.estorePrimaryColorHover ?? '#059669',
    estoreBgColor: state.settings.estoreBgColor ?? '#f9fafb',
    estoreTextColor: state.settings.estoreTextColor ?? '#111827',
    estoreCardBgColor: state.settings.estoreCardBgColor ?? '#ffffff',
    storeType: state.settings.storeType ?? 'both',
    storeLatitude: state.settings.storeLatitude ?? '',
    storeLongitude: state.settings.storeLongitude ?? '',
    touchKeyboardEnabled: state.settings.touchKeyboardEnabled ?? false,
    soundEnabled: state.settings.soundEnabled ?? true,
    enableKotPrinter: state.settings?.enableKotPrinter ?? false,
    autoSaveReceiptPng: state.settings?.autoSaveReceiptPng ?? false,
    taxId: state.settings?.taxId || '',
    country: state.settings?.country || 'PK',
    language: (state.settings as any)?.language || 'en',
    theme: (state.settings as any)?.theme || 'dark',
    interfaceMode: (state.settings as any)?.interfaceMode || 'touch',
    allowCreditOverLimit: state.settings?.allowCreditOverLimit ?? true,
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
      receiptShowFooter: state.settings?.receiptShowFooter ?? true,
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
      receiptShowDeliveryAddress: state.settings?.receiptShowDeliveryAddress ?? true,
      receiptShowQrCode: state.settings?.receiptShowQrCode ?? true,
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
      estoreOrderTimerEnabled: !!state.settings?.estoreOrderTimerEnabled,
      estoreOrderTimerMinutes: state.settings?.estoreOrderTimerMinutes ?? 30,
      estoreCodEnabled: state.settings?.estoreCodEnabled ?? true,
      estoreCustomPaymentEnabled: !!state.settings?.estoreCustomPaymentEnabled,
      estoreCustomPaymentName: state.settings?.estoreCustomPaymentName ?? '',
      estoreCustomPaymentDetail: state.settings?.estoreCustomPaymentDetail ?? '',
      estoreCustomPaymentNote: state.settings?.estoreCustomPaymentNote ?? '',
      estoreDeliveryFee: state.settings?.estoreDeliveryFee ?? 0,
      estoreMinOrder: state.settings?.estoreMinOrder ?? 0,
      estoreWhatsappEnabled: !!state.settings?.estoreWhatsappEnabled,
      estoreWhatsappNumber: state.settings?.estoreWhatsappNumber ?? '',
      estoreLocationLat: state.settings?.estoreLocationLat ?? '',
      estoreLocationLng: state.settings?.estoreLocationLng ?? '',
      estoreDeliveryRadius: state.settings?.estoreDeliveryRadius ?? 5,
      estoreThemeColor: state.settings?.estoreThemeColor ?? '#10b981',
      estorePrimaryColorHover: state.settings?.estorePrimaryColorHover ?? '#059669',
      estoreBgColor: state.settings?.estoreBgColor ?? '#f9fafb',
      estoreTextColor: state.settings?.estoreTextColor ?? '#111827',
      estoreCardBgColor: state.settings?.estoreCardBgColor ?? '#ffffff',
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

  // Role logic removed — single-tenant POS: authenticated user can edit settings
  const canEditSettings = true;

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
      'receiptShowCustomerPhone', 'receiptShowNotes', 'receiptShowBarcode', 'receiptShowDeliveryAddress', 'receiptShowQrCode', 'receiptFontBold', 'receiptFontWeight',
      'receiptFontScale', 'language', 'estoreEnabled', 'estoreOrderTimerEnabled', 'estoreCodEnabled', 'estoreWhatsappEnabled',
      'estoreCustomPaymentEnabled'
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
    { id: 'database', label: 'Database', icon: Database, adminOnly: true },
  ];

  // Role logic removed — show all configured tabs (adminOnly flag retired)
  const visibleTabs = tabs;

  return (
    <div className="main-content-scroll p-1 sm:p-4 lg:p-6 py-4 sm:py-6 bg-gray-50/50 dark:bg-app max-w-[1400px] mx-auto">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-6 pb-2">
        <div className="flex items-center gap-4 shrink-0">
          <Button
            variant="ghost"
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'pos' }))}
            icon={<ChevronLeft className="h-5 w-5" />}
            className="!min-h-0 !p-2 !rounded-xl !gap-1 !text-gray-600 dark:!text-gray-400 mr-1 !hover:bg-gray-100 dark:!hover:bg-white/5"
          >
            <span className="hidden sm:inline text-[10px] font-black uppercase tracking-widest">{t("back", "Back")}</span>
          </Button>
          <div className="h-10 w-px bg-gray-200 dark:bg-white/10 mx-1 hidden sm:block" />
          <div className="h-14 w-14 bg-primary/10 rounded-2xl flex items-center justify-center shadow-inner border border-primary/10">
            <Sliders className="h-7 w-7 text-primary" />
          </div>
          <div className="shrink-0 flex flex-col">
            <h1 className="text-2xl xl:text-3xl font-black text-gray-900 dark:text-white uppercase tracking-tighter leading-none">{t("settings")}</h1>
            <p className="text-gray-600 dark:text-gray-400 text-[9px] font-black uppercase tracking-[0.2em] mt-2 opacity-60">{t("control_center", "Control Center")} • {formData.storeName?.trim() || 'POS'}</p>
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
                general: '!bg-primary',
                receipt: '!bg-cyan-600',
                security: '!bg-blue-600',
                database: '!bg-indigo-600',
                estore: '!bg-emerald-600'
              };
              const activeColor = tabColors[tab.id] || '!bg-primary';

              return (
                <Button
                  key={tab.id}
                  variant="ghost"
                  onClick={() => navigate('/settings/' + tab.id)}
                  className={`!min-h-0 !flex !justify-start !gap-3 !px-6 !py-4 !rounded-[1.5rem] !text-[10px] !tracking-widest !duration-300 !whitespace-nowrap !shadow-none ${isActive
                    ? `${activeColor} !text-white !shadow-lg !shadow-emerald-500/20 translate-x-1`
                    : `!text-gray-600 hover:!text-gray-900 dark:hover:!text-white hover:!bg-gray-50 dark:hover:!bg-white/5`
                    }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-gray-600'}`} />
                  {t(tabKeys[tab.id], tab.label)}
                </Button>
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
                  general: '!bg-primary',
                  receipt: '!bg-cyan-600',
                  security: '!bg-blue-600',
                  database: '!bg-indigo-600',
                  estore: '!bg-emerald-600'
                };
                const activeColor = tabColors[tab.id] || '!bg-primary';

                return (
                  <Button
                    key={tab.id}
                    variant="ghost"
                    onClick={() => navigate('/settings/' + tab.id)}
                    className={`chip-nav-item !min-h-0 !shadow-none ${isActive ? `${activeColor} !text-white !shadow-lg` : '!text-gray-600'}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {t(tabKeys[tab.id], tab.label)}
                  </Button>
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
                            placeholder="My Store"
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
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">{t("store_email", "Store Email")}</label>
                          <input
                            type="email"
                            name="storeEmail"
                            value={formData.storeEmail}
                            onChange={handleChange}
                            className="w-full bg-white dark:bg-black/20 border-gray-200 dark:border-white/5 rounded-xl py-2 px-3 focus:ring-2 focus:ring-[#10B981]/10 focus:border-[#10B981] transition-all text-[13px] sm:text-sm text-gray-900 dark:text-white font-bold"
                            placeholder="contact@mystore.com"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">{t("store_website", "Store Website")}</label>
                          <input
                            type="text"
                            name="storeWebsite"
                            value={formData.storeWebsite}
                            onChange={handleChange}
                            className="w-full bg-white dark:bg-black/20 border-gray-200 dark:border-white/5 rounded-xl py-2 px-3 focus:ring-2 focus:ring-[#10B981]/10 focus:border-[#10B981] transition-all text-[13px] sm:text-sm text-gray-900 dark:text-white font-bold"
                            placeholder="www.mystore.com"
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
                            <Button
                              type="button"
                              onClick={handleRepairCounter}
                              className="!min-h-0 !px-4 !py-2 !rounded-xl !text-[10px] !font-black !bg-indigo-50 dark:!bg-indigo-950/20 !text-indigo-600 dark:!text-indigo-400 !border !border-indigo-200/50 !shadow-none !hover:bg-indigo-100 dark:!hover:bg-indigo-950/20 whitespace-nowrap"
                            >
                              Repair
                            </Button>
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
                              <Button
                                key={tVal}
                                variant="ghost"
                                type="button"
                                onClick={() => {
                                  setFormData(prev => ({ ...prev, theme: tVal }));
                                  handleInstantUpdate('theme', tVal);
                                }}
                                className={`!min-h-0 !gap-0 !py-2 !text-[9px] !tracking-widest !rounded-lg !shadow-none ${formData.theme === tVal
                                  ? '!bg-[#10B981] !text-white !shadow-md'
                                  : '!text-gray-500 hover:!text-gray-900 dark:hover:!text-white'
                                  }`}
                              >
                                {tVal === 'light' ? t("theme_light", "Light") : (tVal === 'dark' ? t("theme_dark", "Dark") : tVal)}
                              </Button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">{t("interface_mode", "Interface Mode")}</label>
                          <Select
                            name="interfaceMode"
                            value={formData.interfaceMode || 'touch'}
                            onChange={(e) => {
                              handleChange(e);
                              handleInstantUpdate('interfaceMode', e.target.value);
                            }}
                            className="!text-xs !font-bold !py-2"
                          >
                            <option value="touch">{t("touch_friendly", "Touch Friendly (POS Optimized)")}</option>
                            <option value="traditional">{t("traditional", "Traditional (Keyboard Focused)")}</option>
                          </Select>
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
                          <ToggleSwitch
                            size="sm"
                            color="bg-violet-500"
                            checked={formData.retailEnabled}
                            onChange={(v) => handleInstantUpdate('retailEnabled', v)}
                          />
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
                          <ToggleSwitch
                            size="sm"
                            color="bg-violet-500"
                            checked={formData.wholesaleEnabled}
                            onChange={(v) => {
                              setFormData(p => ({ ...p, wholesaleEnabled: v }));
                              handleInstantUpdate('wholesaleEnabled', v);
                            }}
                          />
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
                          <ToggleSwitch
                            size="sm"
                            color="bg-violet-500"
                            checked={formData.estoreEnabled}
                            onChange={(v) => {
                              setFormData(p => ({ ...p, estoreEnabled: v }));
                              handleInstantUpdate('estoreEnabled', v);
                            }}
                          />
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
                          <ToggleSwitch
                            size="sm"
                            color="bg-violet-500"
                            checked={formData.touchKeyboardEnabled}
                            onChange={(v) => {
                              setFormData(p => ({ ...p, touchKeyboardEnabled: v }));
                              handleInstantUpdate('touchKeyboardEnabled', v);
                            }}
                          />
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
                          <ToggleSwitch
                            size="sm"
                            color="bg-violet-500"
                            checked={formData.soundEnabled}
                            onChange={(v) => {
                              setFormData(p => ({ ...p, soundEnabled: v }));
                              handleInstantUpdate('soundEnabled', v);
                              if (v) setTimeout(() => play('success'), 100);
                            }}
                          />
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
                          <ToggleSwitch
                            size="sm"
                            color="bg-[#10B981]"
                            checked={formData.enableExtraCharges}
                            onChange={(v) => handleInstantUpdate('enableExtraCharges', v)}
                          />
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
                          <ToggleSwitch
                            size="sm"
                            color="bg-rose-500"
                            checked={!formData.allowCreditOverLimit}
                            onChange={(v) => handleInstantUpdate('allowCreditOverLimit', !v)}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'database' && (
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

                        <label className="flex items-center justify-between p-3 bg-white dark:bg-black/20 border border-gray-200 dark:border-white/5 rounded-xl cursor-pointer group">
                          <div>
                            <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300">Auto-Save Receipt PNG</span>
                            <p className="text-[9px] text-gray-400 mt-0.5">Saves PNG to device, organized by date</p>
                          </div>
                          <input
                            type="checkbox"
                            name="autoSaveReceiptPng"
                            checked={!!formData.autoSaveReceiptPng}
                            onChange={(e) => {
                              setFormData(p => ({ ...p, autoSaveReceiptPng: e.target.checked }));
                              handleInstantUpdate('autoSaveReceiptPng', e.target.checked);
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
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={handleResetCalibration}
                          className="!min-h-0 !p-0 !text-[9px] !font-black !text-primary dark:!text-emerald-400 hover:!text-primary !hover:bg-transparent"
                        >
                          Reset
                        </Button>
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
                          { name: 'receiptShowDeliveryAddress', label: 'Delivery Address' },
                          { name: 'receiptShowQrCode', label: 'QR Code' },
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

                    <Button
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
                      icon={<Printer className="w-3.5 h-3.5" />}
                      className="mt-4 w-full !py-3 !rounded-xl !text-[9px] !font-black !tracking-[0.2em] !gap-1.5 shadow-emerald-500/10 hover:!bg-emerald-700"
                    >
                      Test Print
                    </Button>
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
                    <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">Database Adapter</h2>
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
                        placeholder="https://xxxxxx.supabase.co"
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
                    <Button
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
                      icon={<Save className="w-5 h-5" />}
                      className="flex-1 !py-4 !rounded-2xl !font-black !text-sm !gap-2 !bg-cyan-600 hover:!bg-cyan-700 !shadow-none"
                    >
                      Apply & Restart System
                    </Button>
                    <Button
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
                      icon={<RefreshCw className="w-5 h-5" />}
                      className="!min-h-0 !p-4 !rounded-2xl !shadow-none !bg-gray-100 dark:!bg-white/5 !text-gray-600 !hover:bg-gray-200 dark:!hover:bg-white/5"
                    />
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
                    <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      Online Store Settings
                      <div className="group relative cursor-help inline-flex items-center">
                        <Info className="w-4 h-4 text-emerald-500 hover:text-emerald-600 transition-colors" />
                        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-3 bg-gray-900 text-white text-[11px] font-normal leading-relaxed rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                          <p className="mb-1.5">📦 <strong>Inventory Flow:</strong></p>
                          <p className="mb-1.5">Pending online orders do <strong>not</strong> affect stock.</p>
                          <p className="mb-1.5">Stock is only deducted when you accept and finalize the order in the POS terminal.</p>
                          <p>🗑️ <strong>Cancelled Orders:</strong> Automatically deleted from the database after 24 hours.</p>
                        </div>
                      </div>
                    </h2>
                    <p className="text-xs text-gray-600 font-medium uppercase tracking-wider">Manage your public E-Store</p>
                  </div>
                </div>

                <div className="p-4 sm:p-8 bg-emerald-50/20 dark:bg-emerald-900/5 rounded-[2rem] border border-emerald-100 dark:border-emerald-900/20 space-y-6">
                  <div className="flex items-center justify-between p-4 bg-white dark:bg-black/20 border border-gray-200 dark:border-white/5 rounded-2xl">
                    <div>
                      <h4 className="font-bold text-gray-900 dark:text-white">Your Public Store Link</h4>
                      <p className="text-[10px] text-gray-500 mt-1">Share this link with your customers to start receiving orders.</p>
                    </div>
                    <Button
                      type="button"
                      variant="primary"
                      className="!bg-emerald-600 hover:!bg-emerald-700 whitespace-nowrap !normal-case !tracking-normal !px-6 !py-3 !text-sm"
                      onClick={() => window.open('/store', '_blank')}
                    >
                      Visit Store
                    </Button>
                  </div>

                  {/* Fulfillment Methods */}
                  <div className="p-4 sm:p-5 bg-white dark:bg-black/20 rounded-2xl border border-gray-200 dark:border-white/5 space-y-5">
                    <h4 className="text-sm font-bold text-gray-800 dark:text-white">Fulfillment Methods</h4>

                    {/* Shop Hours */}
                    <div className="bg-gray-50/50 dark:bg-white/[0.02] rounded-2xl border border-gray-200 dark:border-white/5 p-4 space-y-3">
                      <div className="flex flex-col gap-3">
                        <div>
                          <h5 className="text-[11px] font-bold text-gray-900 dark:text-white uppercase tracking-widest">Shop Hours</h5>
                          <p className="text-[10px] text-gray-500">Overall operating hours</p>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          <Button type="button" onClick={() => applyTimePreset('', '')} className="!text-[9px] sm:!text-[10px] !font-bold !uppercase !tracking-wider !bg-emerald-100 !text-emerald-700 dark:!bg-emerald-900/30 dark:!text-emerald-400 !px-1 !py-1.5 !rounded-lg hover:!bg-emerald-200 !min-h-0 !shadow-none">Any Time</Button>
                          <Button type="button" onClick={() => applyTimePreset('00:00', '23:59')} className="!text-[9px] sm:!text-[10px] !font-bold !uppercase !tracking-wider !bg-emerald-100 !text-emerald-700 dark:!bg-emerald-900/30 dark:!text-emerald-400 !px-1 !py-1.5 !rounded-lg hover:!bg-emerald-200 !min-h-0 !shadow-none">24/7</Button>
                          <Button type="button" onClick={() => applyTimePreset('09:00', '17:00')} className="!text-[9px] sm:!text-[10px] !font-bold !uppercase !tracking-wider !bg-emerald-100 !text-emerald-700 dark:!bg-emerald-900/30 dark:!text-emerald-400 !px-1 !py-1.5 !rounded-lg hover:!bg-emerald-200 !min-h-0 !shadow-none">9 to 5</Button>
                          <Button type="button" onClick={() => applyTimePreset('10:00', '22:00')} className="!text-[9px] sm:!text-[10px] !font-bold !uppercase !tracking-wider !bg-emerald-100 !text-emerald-700 dark:!bg-emerald-900/30 dark:!text-emerald-400 !px-1 !py-1.5 !rounded-lg hover:!bg-emerald-200 !min-h-0 !shadow-none">10 to 10</Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mt-4">
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">OPEN</label>
                          <Select name="shopOpenTime" fullWidth value={formData.shopOpenTime || ''} onChange={(e) => { handleChange(e); handleInstantUpdate('shopOpenTime', e.target.value); }} className="!py-2 !text-xs">
                            <option value="">Any Time</option>
                            {TIME_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                          </Select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">CLOSE</label>
                          <Select name="shopCloseTime" fullWidth value={formData.shopCloseTime || ''} onChange={(e) => { handleChange(e); handleInstantUpdate('shopCloseTime', e.target.value); }} className="!py-2 !text-xs">
                            <option value="">Any Time</option>
                            {TIME_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                          </Select>
                        </div>
                      </div>
                    </div>

                    {/* Home Delivery */}
                    <div className="bg-gray-50/50 dark:bg-white/[0.02] rounded-2xl border border-gray-200 dark:border-white/5 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h5 className="text-[11px] font-bold text-gray-900 dark:text-white">Home Delivery</h5>
                          <p className="text-[9px] text-gray-500">Allow customers to choose delivery at checkout</p>
                        </div>
                        <ToggleSwitch
                          checked={formData.estoreDeliveryEnabled !== false}
                          onChange={(checked) => {
                            setFormData(p => ({ ...p, estoreDeliveryEnabled: checked }));
                            handleInstantUpdate('estoreDeliveryEnabled', checked);
                          }}
                        />
                      </div>
                      {formData.estoreDeliveryEnabled !== false && (
                        <div className="grid grid-cols-2 gap-3 pt-2 animate-in fade-in duration-200">
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">START</label>
                            <Select name="deliveryStartTime" fullWidth value={formData.deliveryStartTime || ''} onChange={(e) => { handleChange(e); handleInstantUpdate('deliveryStartTime', e.target.value); }} className="!py-2 !text-xs">
                              <option value="">Any Time</option>
                              {TIME_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </Select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">END</label>
                            <Select name="deliveryEndTime" fullWidth value={formData.deliveryEndTime || ''} onChange={(e) => { handleChange(e); handleInstantUpdate('deliveryEndTime', e.target.value); }} className="!py-2 !text-xs">
                              <option value="">Any Time</option>
                              {TIME_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Customer Pickup */}
                    <div className="bg-gray-50/50 dark:bg-white/[0.02] rounded-2xl border border-gray-200 dark:border-white/5 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h5 className="text-[11px] font-bold text-gray-900 dark:text-white">Customer Pickup</h5>
                          <p className="text-[9px] text-gray-500">Allow customers to order for self-pickup</p>
                        </div>
                        <ToggleSwitch
                          checked={formData.estorePickupEnabled !== false}
                          onChange={(checked) => {
                            setFormData(p => ({ ...p, estorePickupEnabled: checked }));
                            handleInstantUpdate('estorePickupEnabled', checked);
                          }}
                        />
                      </div>
                      {formData.estorePickupEnabled !== false && (
                        <div className="grid grid-cols-2 gap-3 pt-2 animate-in fade-in duration-200">
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">PICKUP START</label>
                            <Select name="pickupStartTime" fullWidth value={formData.pickupStartTime || ''} onChange={(e) => { handleChange(e); handleInstantUpdate('pickupStartTime', e.target.value); }} className="!py-2 !text-xs">
                              <option value="">Any Time</option>
                              {TIME_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </Select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">PICKUP END</label>
                            <Select name="pickupEndTime" fullWidth value={formData.pickupEndTime || ''} onChange={(e) => { handleChange(e); handleInstantUpdate('pickupEndTime', e.target.value); }} className="!py-2 !text-xs">
                              <option value="">Any Time</option>
                              {TIME_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>


                  {/* Shop Location & Delivery Area */}
                  <div className="p-4 sm:p-5 bg-white dark:bg-black/20 rounded-2xl border border-gray-200 dark:border-white/5 space-y-4">
                    <h4 className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-emerald-500" /> Shop Location &amp; Delivery Area
                    </h4>
                    <p className="text-[10px] text-gray-500 font-medium">Set your physical store location for pickup directions and configure your delivery radius</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-600 uppercase tracking-widest ml-1">Latitude</label>
                        <input
                          type="number" step="any"
                          name="storeLatitude"
                          value={formData.storeLatitude || ''}
                          onChange={handleChange}
                          onBlur={() => handleInstantUpdate('storeLatitude', formData.storeLatitude)}
                          placeholder="e.g. 31.5204"
                          className="w-full bg-gray-50 dark:bg-black/20 border-gray-200 dark:border-white/5 rounded-2xl py-3.5 px-5 text-xs font-bold focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-600 uppercase tracking-widest ml-1">Longitude</label>
                        <input
                          type="number" step="any"
                          name="storeLongitude"
                          value={formData.storeLongitude || ''}
                          onChange={handleChange}
                          onBlur={() => handleInstantUpdate('storeLongitude', formData.storeLongitude)}
                          placeholder="e.g. 74.3587"
                          className="w-full bg-gray-50 dark:bg-black/20 border-gray-200 dark:border-white/5 rounded-2xl py-3.5 px-5 text-xs font-bold focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
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
                            onBlur={() => handleInstantUpdate('estoreDeliveryRadius', formData.estoreDeliveryRadius)}
                            min="1"
                            className="w-full pr-12 bg-gray-50 dark:bg-black/20 border-gray-200 dark:border-white/5 rounded-2xl py-3.5 px-5 text-xs font-bold focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                          />
                        </div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      onClick={() => {
                        if ('geolocation' in navigator) {
                          navigator.geolocation.getCurrentPosition(
                            (pos) => {
                              const lat = pos.coords.latitude.toFixed(4);
                              const lng = pos.coords.longitude.toFixed(4);
                              setFormData(p => ({ ...p, storeLatitude: lat, storeLongitude: lng }));
                              handleInstantUpdate('storeLatitude', lat);
                              handleInstantUpdate('storeLongitude', lng);
                              sonner.success('Location detected successfully');
                            },
                            () => sonner.error('Could not detect location. Please check your browser permissions.'),
                            { enableHighAccuracy: true }
                          );
                        } else {
                          sonner.error('Geolocation is not supported by your browser');
                        }
                      }}
                      icon={<LocateFixed className="w-3.5 h-3.5" />}
                      className="w-full !py-2.5 !rounded-xl !text-[10px] !font-black !gap-2 !shadow-none !bg-emerald-50 dark:!bg-emerald-900/10 !text-emerald-600 dark:!text-emerald-400 !border !border-emerald-100 dark:!border-emerald-900/30 !hover:bg-emerald-100 dark:!hover:bg-emerald-900/20"
                    >
                      Use Current Location
                    </Button>
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-r-xl text-sm">
                      <p className="font-bold text-blue-800 dark:text-blue-300">How to get your coordinates?</p>
                      <p className="text-blue-700 dark:text-blue-400 mt-1">
                        1. Open <a href="https://maps.google.com" target="_blank" rel="noreferrer" className="underline font-bold">Google Maps</a><br />
                        2. Search for your store location.<br />
                        3. Right-click the red pin and click the numbers (e.g. 31.5204, 74.3587) to copy them.<br />
                        4. Paste the first number in Latitude and the second in Longitude.
                      </p>
                    </div>
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
                              <Button
                                key={idx}
                                variant="ghost"
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
                                className={`!min-h-0 !normal-case !tracking-normal !px-4 !py-2 !border-2 !transition-transform hover:!-translate-y-0.5 !shadow-sm !font-bold !text-xs ${formData.estoreThemeColor === preset.primary && formData.estoreBgColor === preset.bg ? '!border-primary !ring-2 !ring-primary/20 !shadow-md' : '!border-gray-200 dark:!border-gray-700 hover:!border-gray-300'}`}
                                style={{ backgroundColor: preset.card, color: preset.text }}
                              >
                                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: preset.primary }}></span>
                                {preset.name}
                              </Button>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Primary</label>
                            <div className="flex items-center gap-2">
                              <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-gray-200 dark:border-white/10 shrink-0 shadow-sm cursor-pointer">
                                <input type="color" name="estoreThemeColor" value={formData.estoreThemeColor || '#10b981'} onChange={handleChange} className="absolute inset-0 w-16 h-16 -left-4 -top-4 cursor-pointer border-0 p-0" />
                              </div>
                              <span className="text-xs text-gray-700 dark:text-gray-300 font-mono font-medium">{formData.estoreThemeColor || '#10b981'}</span>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Btn Hover</label>
                            <div className="flex items-center gap-2">
                              <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-gray-200 dark:border-white/10 shrink-0 shadow-sm cursor-pointer">
                                <input type="color" name="estorePrimaryColorHover" value={formData.estorePrimaryColorHover || '#059669'} onChange={handleChange} className="absolute inset-0 w-16 h-16 -left-4 -top-4 cursor-pointer border-0 p-0" />
                              </div>
                              <span className="text-xs text-gray-700 dark:text-gray-300 font-mono font-medium">{formData.estorePrimaryColorHover || '#059669'}</span>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Page BG</label>
                            <div className="flex items-center gap-2">
                              <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-gray-200 dark:border-white/10 shrink-0 shadow-sm cursor-pointer">
                                <input type="color" name="estoreBgColor" value={formData.estoreBgColor || '#f9fafb'} onChange={handleChange} className="absolute inset-0 w-16 h-16 -left-4 -top-4 cursor-pointer border-0 p-0" />
                              </div>
                              <span className="text-xs text-gray-700 dark:text-gray-300 font-mono font-medium">{formData.estoreBgColor || '#f9fafb'}</span>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Card BG</label>
                            <div className="flex items-center gap-2">
                              <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-gray-200 dark:border-white/10 shrink-0 shadow-sm cursor-pointer">
                                <input type="color" name="estoreCardBgColor" value={formData.estoreCardBgColor || '#ffffff'} onChange={handleChange} className="absolute inset-0 w-16 h-16 -left-4 -top-4 cursor-pointer border-0 p-0" />
                              </div>
                              <span className="text-xs text-gray-700 dark:text-gray-300 font-mono font-medium">{formData.estoreCardBgColor || '#ffffff'}</span>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Text</label>
                            <div className="flex items-center gap-2">
                              <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-gray-200 dark:border-white/10 shrink-0 shadow-sm cursor-pointer">
                                <input type="color" name="estoreTextColor" value={formData.estoreTextColor || '#111827'} onChange={handleChange} className="absolute inset-0 w-16 h-16 -left-4 -top-4 cursor-pointer border-0 p-0" />
                              </div>
                              <span className="text-xs text-gray-700 dark:text-gray-300 font-mono font-medium">{formData.estoreTextColor || '#111827'}</span>
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
                            <ToggleSwitch
                              checked={formData.estoreOrderTimerEnabled === true}
                              onChange={(v) => {
                                setFormData(prev => ({ ...prev, estoreOrderTimerEnabled: v }));
                                handleInstantUpdate('estoreOrderTimerEnabled', v);
                              }}
                            />
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
                              onBlur={() => handleInstantUpdate('estoreOrderTimerMinutes', formData.estoreOrderTimerMinutes)}
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
                        <ToggleSwitch
                          checked={formData.estoreCodEnabled !== false}
                          onChange={(v) => {
                            setFormData(prev => ({ ...prev, estoreCodEnabled: v }));
                            handleInstantUpdate('estoreCodEnabled', v);
                          }}
                        />
                      </div>
                    </label>

                    <div className="pt-6 border-t border-gray-100 dark:border-white/5 space-y-4">
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <div className="relative">
                          <ToggleSwitch
                            checked={formData.estoreCustomPaymentEnabled || false}
                            onChange={(v) => {
                              setFormData(prev => ({ ...prev, estoreCustomPaymentEnabled: v }));
                              handleInstantUpdate('estoreCustomPaymentEnabled', v);
                            }}
                          />
                        </div>
                        <div>
                          <span className="text-sm font-bold text-[var(--color-text)]">Enable Custom Payment Method</span>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Allow users to pay via Bank Transfer, EasyPaisa, etc.</p>
                        </div>
                      </label>

                      {formData.estoreCustomPaymentEnabled && (
                        <div className="pl-14 space-y-4 animate-in fade-in slide-in-from-top-2">
                          <div>
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Method Name</label>
                            <input
                              type="text"
                              name="estoreCustomPaymentName"
                              value={formData.estoreCustomPaymentName || ''}
                              onChange={handleChange}
                              onBlur={() => handleInstantUpdate('estoreCustomPaymentName', formData.estoreCustomPaymentName)}
                              placeholder="e.g. Bank Transfer / EasyPaisa"
                              className="w-full bg-white dark:bg-black/20 border-gray-200 dark:border-white/5 rounded-xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Payment Details</label>
                            <textarea
                              name="estoreCustomPaymentDetail"
                              value={formData.estoreCustomPaymentDetail || ''}
                              onChange={handleChange}
                              onBlur={() => handleInstantUpdate('estoreCustomPaymentDetail', formData.estoreCustomPaymentDetail)}
                              placeholder="e.g. Bank: ABC Bank&#10;Account Title: Zaynah&#10;IBAN: PK32..."
                              className="w-full bg-white dark:bg-black/20 border-gray-200 dark:border-white/5 rounded-xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all min-h-[80px]"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Customer Instructions (Note)</label>
                            <input
                              type="text"
                              name="estoreCustomPaymentNote"
                              value={formData.estoreCustomPaymentNote || ''}
                              onChange={handleChange}
                              onBlur={() => handleInstantUpdate('estoreCustomPaymentNote', formData.estoreCustomPaymentNote)}
                              placeholder="e.g. Please share screenshot of payment on our WhatsApp."
                              className="w-full bg-white dark:bg-black/20 border-gray-200 dark:border-white/5 rounded-xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-600 uppercase tracking-widest ml-1">Delivery Fee</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">{formData.currency || 'Rs'}</span>
                        <input
                          type="number"
                          name="estoreDeliveryFee"
                          value={formData.estoreDeliveryFee || 0}
                          onChange={handleChange}
                          onBlur={() => handleInstantUpdate('estoreDeliveryFee', formData.estoreDeliveryFee)}
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
                        <div className="relative inline-flex items-center">
                          <ToggleSwitch
                            checked={formData.estoreWhatsappEnabled || false}
                            onChange={(v) => {
                              setFormData(prev => ({ ...prev, estoreWhatsappEnabled: v }));
                              handleInstantUpdate('estoreWhatsappEnabled', v);
                            }}
                          />
                        </div>
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
                            onBlur={() => handleInstantUpdate('estoreWhatsappNumber', formData.estoreWhatsappNumber)}
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

      {/* Support Footer — UNIVERSAL: tenant website/email from settings, hidden if unset */}
      <div className="mt-12 pb-32 text-center space-y-4">
        <div className="flex flex-col sm:flex-row justify-center items-center gap-4 sm:gap-8">
          {formData.storeWebsite?.trim() && (
            <Button variant="ghost" onClick={() => window.open(formData.storeWebsite, '_blank')} className="!min-h-0 !p-0 !rounded-none !gap-2 !text-primary hover:!text-emerald-700 !font-bold underline underline-offset-4 decoration-2 decoration-emerald-100 !shadow-none !hover:bg-transparent dark:!hover:bg-transparent">
              <Globe className="w-4 h-4" />
              <span className="text-xs uppercase tracking-widest whitespace-nowrap">{formData.storeWebsite}</span>
            </Button>
          )}
          {formData.storeEmail?.trim() && (
            <Button variant="ghost" onClick={() => window.location.href = `mailto:${formData.storeEmail}`} className="!min-h-0 !p-0 !rounded-none !gap-2 !text-blue-600 hover:!text-blue-700 !font-bold underline underline-offset-4 decoration-2 decoration-blue-100 !shadow-none !hover:bg-transparent dark:!hover:bg-transparent">
              <Smartphone className="w-4 h-4" />
              <span className="text-xs uppercase tracking-widest whitespace-nowrap">{formData.storeEmail}</span>
            </Button>
          )}
        </div>
        <p className="text-[10px] text-gray-600 font-bold uppercase tracking-[0.2em]">Crafted for peak performance & enterprise reliability</p>
      </div>
      {showReceipt && completedSale && (
        <ReceiptPrint sale={completedSale} onClose={() => setShowReceipt(false)} />
      )}
    </div>
  );
}