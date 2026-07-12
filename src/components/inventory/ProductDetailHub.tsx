import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X, Edit3, Trash2, Plus, ArrowUpRight, ArrowDownLeft,
  History, Info, ClipboardList, ShieldAlert, User,
  FileText, CheckCircle2, Package, Globe, Star, Save, Loader2,
  Edit, PackageSearch, BadgeInfo, ArrowDownRight, RotateCcw,
  ArrowLeft, Ban, Wand2, ChevronLeft, ChevronRight,
  CircleDollarSign, ShoppingBag, Percent, Folder, Building2,
  AlertTriangle, TrendingUp, Infinity, Camera, Library, Image as ImageIcon,
  Scan, QrCode, Database, Tag
} from 'lucide-react';
import { SearchableSelect } from '../common/SearchableSelect';
import { Modal } from '../common/Modal';
import { CameraScanner } from '../common/CameraScanner';
import { HelpTooltip } from '../common/HelpTooltip';
import { StickyFormFooter } from '../common/StickyFormFooter';
import { useApp } from '../../context/SupabaseAppContext';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../hooks/useTranslation';
import { Product, PurchaseRecord, Sale } from '../../types';
import { formatCurrency } from '../../lib/currencies';
import { productsService, purchaseRecordsService, generateId, toRemoteStockHistory, toRemoteProductBatch } from '../../lib/services';
import { localDb, queueOp } from '../../lib/localDb';
import { calculateFIFOSplit } from '../../lib/inventoryUtils';
import { compressImage } from '../../lib/imageCompression';
import { sonner } from '../../lib/sonner';
import { BatchStockInSystem } from './BatchStockInSystem';
import { generateBarcodeValue } from '../../utils/barcode';
import { BarcodePreview } from '../common/BarcodePreview';
import { MediaLibrary } from './MediaLibrary';

interface ProductDetailHubProps {
  product: Product;
  onBack: () => void;
  onEdit: () => void;
}

export function ProductDetailHub({ product, onBack, onEdit }: ProductDetailHubProps) {
  const { state, dispatch } = useApp();
  const { profile } = useAuth();
  const { t } = useTranslation();

  const [isUpdating, setIsUpdating] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showStockIn, setShowStockIn] = useState(false);
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [adjustmentData, setAdjustmentData] = useState({
    quantity: '1',
    reason: 'Correction',
    notes: ''
  });
  const [isCompressing, setIsCompressing] = useState(false);
  const [filterType, setFilterType] = useState<'ALL' | 'IN' | 'OUT' | 'RETURN'>('ALL');
  const [historyPage, setHistoryPage] = useState(1);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [showImageMenu, setShowImageMenu] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [activeScannerField, setActiveScannerField] = useState<'sku' | 'barcode'>('barcode');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const HISTORY_PER_PAGE = 7;

  // ─── Edit Form State ───
  const [formData, setFormData] = useState({
    name: product.name,
    sku: product.sku || '',
    barcode: product.barcode || '',
    price: product.price?.toString() || '0',
    cost: product.cost?.toString() || '0',
    minStock: product.minStock?.toString() || '0',
    targetStock: product.targetStock?.toString() || '',
    category: product.category,
    supplier: product.supplier || '',
    description: product.description || '',
    active: product.active ?? true,
    trackInventory: product.trackInventory !== false && product.stock < 990000,
    isFeatured: product.isFeatured || false,
    image: product.image || '',
    isService: product.isService || false,
    requireSerial: product.requireSerial || false,
  });

  const [batches, setBatches] = useState(product.batches || []);
  const [variants, setVariants] = useState<any[]>((product.variants || []).map((v: any) => ({ ...v, optionsRaw: '' })));
  const [modifiers, setModifiers] = useState<any[]>(product.modifiers || []);

  // Sync state if product prop changes
  useEffect(() => {
    setFormData({
      name: product.name,
      sku: product.sku || '',
      barcode: product.barcode || '',
      price: product.price?.toString() || '0',
      cost: product.cost?.toString() || '0',
      minStock: product.minStock?.toString() || '0',
      targetStock: product.targetStock?.toString() || '',
      category: product.category,
      supplier: product.supplier || '',
      description: product.description || '',
      active: product.active ?? true,
      trackInventory: product.trackInventory !== false && product.stock < 990000,
      isFeatured: product.isFeatured || false,
      image: product.image || '',
      isService: product.isService || false,
      requireSerial: product.requireSerial || false,
    });
    setBatches(product.batches || []);
    setVariants((product.variants || []).map((v: any) => ({ ...v, optionsRaw: '' })));
    setModifiers(product.modifiers || []);
  }, [product]);

  const categories = useMemo(() => {
    const cats = state.products.map(p => p.category).filter(Boolean);
    return Array.from(new Set(cats)).sort();
  }, [state.products]);

  const suppliers = useMemo(() => {
    return Array.from(new Set(state.suppliers?.map(s => s.name) || [])).sort();
  }, [state.suppliers]);

  const currency = state.settings?.currency || 'PKR';

  // ─── Derived Data ───
  const isInfinite = isEditMode
    ? !formData.trackInventory
    : (product.trackInventory === false || product.stock >= 990000);

  const productSales = useMemo(() => {
    return (state.sales || []).filter((s: Sale) =>
      (s.status === 'completed' || s.status === 'credit' || s.status === 'refunded') &&
      s.items?.some(item => item.product?.id === product.id)
    );
  }, [state.sales, product.id]);

  const productPurchases = useMemo(() => {
    // Aggressively filter out records that are already handled by other loops (like Sales)
    // or are known system duplicates.
    return (state.purchaseRecords || []).filter((r: PurchaseRecord) => {
      const isDuplicateSale = r.type === 'Sale' ||
        r.type === 'Return' ||
        r.notes?.includes('Invoice #') ||
        r.supplier === 'Sale' ||
        r.supplier === 'SALE';

      return r.productId === product.id && !isDuplicateSale;
    });
  }, [state.purchaseRecords, product.id]);

  // ─── KPIs ───
  const totalPurchased = productPurchases.reduce((s, r) => s + (r.quantity || 0), 0);
  const totalSoldUnits = productSales.reduce((s, sale) => {
    return s + (sale.items || []).filter(i => i.product?.id === product.id)
      .reduce((a, i) => a + (i.quantity || 0), 0);
  }, 0);
  const totalRevenue = productSales.reduce((s, sale) => {
    return s + (sale.items || []).filter(i => i.product?.id === product.id)
      .reduce((a, i) => a + (i.subtotal || 0), 0);
  }, 0);
  const totalCOGS = totalSoldUnits * (product.cost || 0);
  const grossProfit = totalRevenue - totalCOGS;
  const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  const sellingPrice = product.isWeightBased ? (product.pricePerUnit || 0) : product.price;

  const stockValueCost = isInfinite ? 0 : product.stock * (product.cost || 0);
  const stockValueSale = isInfinite ? 0 : product.stock * sellingPrice;

  const isLow = !isInfinite && product.stock <= (product.minStock || 0) && product.stock > 0;
  const isOut = !isInfinite && product.stock <= 0;
  const maxStock = product.targetStock || Math.max(product.stock, (product.minStock || 0) * 3, 50);
  const stockPct = Math.max(0, Math.min(100, maxStock > 0 ? (product.stock / maxStock) * 100 : 0));

  const handleAdjustment = async () => {
    const qtyChange = parseInt(adjustmentData.quantity);
    if (!qtyChange || qtyChange === 0) return;
    const reason = adjustmentData.reason || 'Correction';

    const result = await sonner.confirm(
      t('confirm_adjustment_title', 'Confirm Adjustment?'),
      t('confirm_adjustment_desc', 'Adjusting stock by <strong>{qty}</strong> due to <strong>{reason}</strong>.')
        .replace('{qty}', (qtyChange > 0 ? '+' : '') + qtyChange)
        .replace('{reason}', reason),
      t('yes_confirm', 'Yes, Confirm')
    );

    if (!result.isConfirmed) return;

    setIsUpdating(true);
    sonner.loading(t('adjusting_stock', 'Adjusting stock...'));

    try {
      let updatedBatches = [...batches];
      const now = new Date();

      if (qtyChange < 0) {
        // Deduction - Use FIFO
        const deduction = calculateFIFOSplit(product, Math.abs(qtyChange));
        updatedBatches = deduction.updatedBatches;
      } else {
        // Addition - Create Adjustment Batch
        const adjBatchId = generateId();
        const adjBatch = {
          id: adjBatchId,
          productId: product.id,
          batchNumber: `ADJ-${now.getTime().toString().slice(-6)}`,
          batchType: 'purchase',
          quantity: qtyChange,
          qtyRemaining: qtyChange,
          costPrice: product.cost || 0,
          salePrice: product.price || 0,
          createdAt: now
        };
        updatedBatches.push(adjBatch as any);

        // Persist batch to separate productBatches table + queue for cloud sync
        await localDb.productBatches.add(adjBatch as any);
        await queueOp('product_batches', 'create', adjBatchId, toRemoteProductBatch(adjBatch));
      }

      const newRecord = {
        id: generateId(),
        productId: product.id,
        productName: product.name,
        sku: product.sku || '',
        quantity: qtyChange, // Signed quantity for adjustment tracking
        costPrice: product.cost || 0,
        totalAmount: Math.abs(qtyChange) * (product.cost || 0),
        type: 'Adjustment',
        supplier: reason.toUpperCase(),
        date: now,
        addedBy: profile?.email || 'System',
        notes: adjustmentData.notes ? `${reason}: ${adjustmentData.notes}` : `Manual Adjustment: ${reason}`
      } as PurchaseRecord;

      // Read fresh product from localDb to avoid stale stock from prop
      const freshProduct = await localDb.products.get(product.id);
      const currentStock = freshProduct?.stock ?? product.stock ?? 0;
      const newStock = Math.max(0, currentStock + qtyChange);

      const updatedProduct = {
        ...product,
        stock: newStock,
        batches: updatedBatches,
        updatedAt: now
      };

      await productsService.update(product.id, updatedProduct);
      dispatch({ type: 'UPDATE_PRODUCT', payload: updatedProduct });

      // Log stock_history for adjustments (purchaseRecordsService skips this for type=Adjustment)
      const histId = generateId();
      const histEntry = {
        id: histId,
        productId: product.id,
        changeQty: qtyChange,
        type: qtyChange > 0 ? 'adjustment_in' as const : 'adjustment_out' as const,
        referenceId: newRecord.id,
        note: `Adjustment: ${reason}`,
        balanceAfter: updatedProduct.stock,
        cashierName: profile?.email || 'System',
        createdAt: now
      };
      await localDb.stockHistory.add(histEntry);
      await queueOp('stock_history', 'create', histId, toRemoteStockHistory(histEntry));

      await purchaseRecordsService.create(newRecord);
      dispatch({ type: 'ADD_PURCHASE_RECORD', payload: newRecord });

      sonner.success(t('stock_adjusted_success', 'Stock adjusted successfully'));
      setShowAdjustment(false);
      setAdjustmentData({ quantity: '1', reason: 'Correction', notes: '' });
    } catch (error) {
      console.error('Adjustment failed:', error);
      sonner.error(t('stock_adjusted_error', 'Failed to adjust stock'));
    } finally {
      setIsUpdating(false);
      sonner.close();
    }
  };

  const handleSave = async () => {
    // --- NEW CONFIRMATION WORKFLOW ---
    const confirmMsg = showStockIn
      ? t('pending_stock_entry_warning', 'You have a pending Stock Entry open. Proceeding will save product details, but you should finish the Stock Entry separately to update inventory counts. Save changes anyway?')
      : t('confirm_changes_desc', 'Commit all modifications for this product to the database?');

    const result = await sonner.confirm(
      t('confirm_changes_title', 'Confirm Changes'),
      confirmMsg,
      t('yes_confirm', 'Yes, Confirm')
    );

    if (!result.isConfirmed) return;

    setIsUpdating(true);
    sonner.loading(t('syncing_changes', 'Syncing changes...'));

    try {
      const isInfinity = formData.trackInventory === false;
      const wasInfinity = product.trackInventory === false || (product.stock || 0) >= 990000;

      const now = new Date();
      const updatedProduct = {
        ...product,
        ...formData,
        price: parseFloat(formData.price) || 0,
        cost: parseFloat(formData.cost) || 0,
        minStock: parseInt(formData.minStock) || 0,
        targetStock: formData.targetStock ? parseInt(formData.targetStock) : null,
        // Fixed: If turning tracking ON, and it was previously infinite (>= 990,000), reset baseline to 0.
        // This prevents the '1,000,009' display bug where the infinity baseline was accidentally kept.
        stock: isInfinity ? 0 : (wasInfinity && (product.stock || 0) >= 990000 ? 0 : (product.stock || 0)),
        batches: isInfinity ? [] : [...batches],
        trackInventory: formData.trackInventory,
        variants: variants.map((v: any) => ({ name: v.name, options: v.options })),
        modifiers: modifiers,
        isService: formData.isService,
        requireSerial: formData.requireSerial,
        updatedAt: now,
      };

      // NEW: Log 'Initial' movement and create batch if we just enabled tracking
      if (!isInfinity && wasInfinity) {
        const batchId = generateId();
        const initialBatch = {
          id: batchId,
          batchNumber: `B-${now.getTime().toString().slice(-6)}`,
          quantity: updatedProduct.stock,
          qtyRemaining: updatedProduct.stock,
          costPrice: updatedProduct.cost || 0,
          salePrice: updatedProduct.price || 0,
          manufacturingDate: now,
          expiryDate: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
          createdAt: now
        };

        // Ensure we have at least one batch if tracking is on
        if (updatedProduct.batches.length === 0) {
          updatedProduct.batches = [initialBatch];
        }

        // Register in Audit Log
        const histId = generateId();
        const histEntry = {
          id: histId,
          productId: product.id,
          changeQty: updatedProduct.stock,
          type: 'stock_in' as const,
          referenceId: batchId,
          note: 'Inventory Tracking Enabled (Initial Balance)',
          balanceAfter: updatedProduct.stock,
          cashierName: profile?.email || 'System',
          createdAt: now
        };
        await localDb.stockHistory.add(histEntry);
        await queueOp('stock_history', 'create', histId, toRemoteStockHistory(histEntry));
      }

      const saved = await productsService.update(product.id, updatedProduct);
      dispatch({ type: 'UPDATE_PRODUCT', payload: saved });
      sonner.success(t('product_updated_success', 'Product updated successfully'));
      setIsEditMode(false);
    } catch (error) {
      sonner.error(t('product_updated_error', 'Failed to update product'));
    } finally {
      setIsUpdating(false);
      sonner.close();
    }
  };

  const addBatch = () => {
    setBatches([...batches, {
      id: crypto.randomUUID(),
      batchNumber: `BATCH-${Date.now()}`,
      quantity: 0,
      costPrice: parseFloat(formData.cost) || 0,
      createdAt: new Date(),
    }]);
  };

  const updateBatch = (index: number, field: string, value: any) => {
    const newBatches = [...batches];
    newBatches[index] = { ...newBatches[index], [field]: value };
    setBatches(newBatches);
  };

  const removeBatch = (index: number) => {
    setBatches(batches.filter((_, i) => i !== index));
  };

  const updateBatchPrices = async (field: 'costPrice' | 'salePrice', newValue: number) => {
    const activeBatches = batches.filter(b => (b.qtyRemaining || 0) > 0);
    if (activeBatches.length === 0) return;
    const now = new Date();
    for (const batch of activeBatches) {
      const updatedBatch = { ...batch, [field]: newValue, updatedAt: now };
      await localDb.productBatches.put(updatedBatch);
      await queueOp('product_batches', 'update', batch.id, toRemoteProductBatch({ [field]: newValue, updatedAt: now }));
    }
    setBatches(prev => prev.map(b =>
      (b.qtyRemaining || 0) > 0 ? { ...b, [field]: newValue } : b
    ));
  };

  const generateBarcode = () => {
    if (!formData.name.trim()) {
      sonner.error(t('barcode_name_required', 'Please enter a product name first to generate a barcode'));
      return;
    }
    const barcode = generateBarcodeValue(formData.name);
    setFormData(prev => ({ ...prev, barcode }));
  };

  const generateSku = () => {
    if (!formData.name.trim()) {
      sonner.error(t('sku_name_required', 'Please enter a product name first to generate a smart SKU'));
      return;
    }

    const words = formData.name.trim().split(/\s+/);
    let prefix = '';

    if (words.length >= 2) {
      prefix = (words[0].substring(0, 2) + words[1].substring(0, 2)).toUpperCase();
    } else if (words[0].length >= 3) {
      prefix = words[0].substring(0, 3).toUpperCase();
    } else {
      prefix = words[0].toUpperCase() + 'X';
    }

    const randomDigits = Math.floor(100 + Math.random() * 900).toString();
    const sku = prefix + '-' + randomDigits;

    setFormData(prev => ({ ...prev, sku }));
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsCompressing(true);
      sonner.loading(t('optimizing_image', 'Optimizing image...'));
      // Compress and convert to WebP
      const compressedFile = await compressImage(file, 1024, 1024, 0.8);

      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, image: reader.result as string }));
        sonner.close();
        sonner.success(t('image_optimized_success', 'Image optimized successfully'));
      };
      reader.readAsDataURL(compressedFile);
    } catch (error) {
      console.error('Image compression failed:', error);
      sonner.error(t('image_optimized_error', 'Failed to process image'));
    } finally {
      setIsCompressing(false);
      sonner.close();
    }
  };

  // ─── Unified Audit Logic ───
  const movementHistory = useMemo(() => {
    const history: any[] = [];

    productSales.forEach(s => {
      // Use String comparison for IDs to prevent type mismatch failures
      const items = (s.items || []).filter(i => String(i.product?.id) === String(product.id));

      const qty = items.reduce((a, i) => a + (Number(i.weight || 0) || Number(i.quantity || 0) || 0), 0);
      const isNegativeSubtotal = items.some(i => Number(i.subtotal || 0) < 0);
      const isReturnNote = s.notes?.toLowerCase().includes('return') || s.invoiceNumber?.toLowerCase().includes('ret');
      const isNegativeTotal = Number(s.total || 0) < 0;

      // ULTIMATE RETURN DETECTION: If total is negative OR qty is negative OR notes say return, IT IS A RETURN.
      const isReturn = s.status === 'refunded' || qty < 0 || isNegativeSubtotal || isReturnNote || isNegativeTotal;

      const safeDate = s.date ? (s.date instanceof Date ? s.date : new Date(s.date)) :
        (s.timestamp ? (s.timestamp instanceof Date ? s.timestamp : new Date(s.timestamp)) : new Date());

      // FORCE THE SIGN: Returns are ALWAYS plus (IN), Sales are ALWAYS minus (OUT)
      // We use Math.abs to avoid double-negative confusion
      const displayQty = isReturn ? Math.abs(qty) : -Math.abs(qty);
      const displayType = isReturn ? 'IN' : 'OUT';

      history.push({
        id: s.id,
        date: isNaN(safeDate.getTime()) ? new Date() : safeDate,
        type: displayType,
        label: s.status === 'refunded' ? 'Refunded Sale' : (isReturn ? 'POS Return' : 'POS Sale'),
        qty: displayQty,
        reference: s.orderNumber || s.invoiceNumber || s.receiptNumber || s.id.slice(-6).toUpperCase(),
        entity: s.customerName || 'Walk-in',
        user: s.cashier,
        icon: isReturn ? ArrowDownLeft : ArrowUpRight,
        // Using Yellow for returns as requested (+)
        color: isReturn ? 'text-yellow-500 font-black' : 'text-red-500',
        bg: isReturn ? 'bg-yellow-500/10' : 'bg-red-500/10'
      });
    });


    // Purchases/Stock IN
    productPurchases.forEach(r => {
      const isAdjustment = r.type === 'Adjustment';
      const qty = r.quantity;
      const safeDate = r.date ? (r.date instanceof Date ? r.date : new Date(r.date)) : new Date();

      history.push({
        id: r.id,
        date: isNaN(safeDate.getTime()) ? new Date() : safeDate,
        type: qty >= 0 ? 'IN' : 'OUT',
        label: isAdjustment ? `ADJ: ${r.supplier}` : (r.type === 'Return' ? 'Return' : (r.type || 'Stock Movement')),
        qty: qty,
        reference: r.id.slice(-6).toUpperCase(),
        entity: r.supplier || 'System',

        user: r.addedBy,
        notes: r.notes,
        icon: qty >= 0 ? ArrowDownLeft : Ban,
        color: qty >= 0 ? 'text-primary' : (isAdjustment ? 'text-amber-500' : 'text-orange-500'),
        bg: qty >= 0 ? 'bg-primary/10' : (isAdjustment ? 'bg-amber-500/10' : 'bg-orange-500/10')
      });
    });

    const rawHistory = [...history];

    return rawHistory
      .filter(h => filterType === 'ALL' || h.type === filterType || (filterType === 'RETURN' && h.label.includes('Return')))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [productSales, productPurchases, filterType]);

  const totalHistoryPages = Math.ceil(movementHistory.length / HISTORY_PER_PAGE);
  const paginatedHistory = movementHistory.slice(
    (historyPage - 1) * HISTORY_PER_PAGE,
    historyPage * HISTORY_PER_PAGE
  );

  const handleRowClick = (h: any) => {
    // Both Sales (OUT) and Returns (now IN) should redirect to the bill
    const isRetailTransaction = h.label?.includes('Sale') || h.label?.includes('Return');

    if (isRetailTransaction) {
      dispatch({ type: 'SET_PENDING_RETURN_TAB', payload: 'product_hub' });
      dispatch({ type: 'SET_LAST_PRODUCT_HUB', payload: product.id });
      dispatch({ type: 'SET_PENDING_SEARCH', payload: h.reference });
      const event = new CustomEvent('navigate', { detail: 'transactions' });
      window.dispatchEvent(event);
      onBack(); // Close hub
    }
  };

  return (
    <div className="space-y-0 animate-in slide-in-from-right-4 duration-500">
      {/* ═══ HEADER ═══ */}
      <div className="bg-white dark:bg-surface border-b border-gray-200 dark:border-white/5 px-3 sm:px-6 py-6 rounded-t-[2.5rem] relative overflow-hidden">
        {/* Decorative Background for Mobile Premium Look */}
        <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-emerald-500/5 to-transparent pointer-events-none" />

        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 relative">
          <button onClick={onBack} className="absolute left-0 top-0 sm:relative p-3 bg-gray-100 dark:bg-white/5 rounded-2xl hover:bg-gray-200 dark:hover:bg-white/10 transition-all hover:scale-105 active:scale-90 z-20">
            <ArrowLeft className="h-5 w-5 text-gray-600 dark:text-gray-300" />
          </button>

          {/* Product Image Stage */}
          <div className="relative group/img mt-4 sm:mt-0">
            <div className="w-24 h-24 sm:w-20 sm:h-20 rounded-[2rem] sm:rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30 border-4 border-white dark:border-[#171717] ring-1 ring-gray-100 dark:ring-white/5 flex items-center justify-center shadow-xl overflow-hidden flex-shrink-0 transition-transform duration-500 group-hover/img:scale-105">
              {formData.image ? <img src={formData.image} className="h-full w-full object-cover" /> : <Package className="h-8 w-8 sm:h-8 text-primary dark:text-emerald-400" />}
            </div>

            <div className="absolute -bottom-1 -right-1">
              <button
                onClick={() => setShowImageMenu(!showImageMenu)}
                className={`p-3 rounded-2xl shadow-lg border-2 border-white dark:border-[#171717] transition-all active:scale-90 ${isEditMode ? 'bg-primary text-white scale-110' : 'bg-white dark:bg-[#262626] text-gray-600 scale-90'}`}
              >
                <Camera className="w-5 h-5" />
              </button>

              <Modal
                isOpen={showImageMenu}
                onClose={() => setShowImageMenu(false)}
                title={t('change_image', 'Change Image')}
                subtitle={t('choose_image_source', 'Choose image source')}
                maxWidth="sm"
              >
                <div className="space-y-3">
                  <button
                    onClick={() => { setShowImageMenu(false); setShowMediaLibrary(true); }}
                    className="w-full px-6 py-4 bg-blue-50 dark:bg-blue-900/10 text-blue-600 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 transition-all outline-none ring-1 ring-blue-500/20"
                  >
                    <Library className="w-5 h-5" />
                    {t('pick_from_library', 'Pick from Library')}
                  </button>

                  <label className="w-full px-6 py-4 bg-emerald-50 dark:bg-emerald-900/10 text-primary rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 transition-all outline-none ring-1 ring-emerald-500/20 cursor-pointer">
                    <ImageIcon className="w-5 h-5" />
                    <span>{t('upload_from_gallery', 'Upload from Gallery')}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { setShowImageMenu(false); handleFileSelect(e); }} />
                  </label>
                </div>
              </Modal>
            </div>
          </div>

          <div className="flex flex-col items-center sm:items-start text-center sm:text-left flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${isOut ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : isLow ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'bg-primary text-white shadow-lg shadow-emerald-500/20'}`}>
                {isInfinite ? t('infinity_mode', 'Infinity Mode') : isOut ? t('out_of_stock', 'Out of Stock') : isLow ? t('low_stock', 'Low Stock') : t('in_stock', 'In Stock')}
              </span>
              {product.isFeatured && (
                <div className="p-1.5 bg-yellow-400 text-white rounded-lg shadow-lg shadow-yellow-400/20">
                  <Star className="w-3 h-3 fill-current" />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1 w-full max-w-xs sm:max-w-none">
              {isEditMode ? (
                <input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="bg-gray-50 dark:bg-white/5 border-none px-4 py-2 rounded-2xl text-xl font-black text-gray-900 dark:text-white uppercase outline-none text-center sm:text-left ring-1 ring-transparent focus:ring-emerald-500/50 transition-all"
                  placeholder={t('product_name_req', 'Product Name *').replace(' *', '')}
                />
              ) : (
                <h2 className="text-2xl sm:text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight line-clamp-1">{product.name}</h2>
              )}
              <div className="flex items-center justify-center sm:justify-start gap-4 mt-2">
                <div className="flex flex-col">
                  <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest leading-none mb-1">{t('sku', 'SKU')}</p>
                  <span className="font-mono text-xs text-gray-600 dark:text-gray-400 font-bold">{product.sku}</span>
                </div>
                <div className="w-px h-6 bg-gray-100 dark:bg-white/5" />
                <div className="flex flex-col">
                  <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest leading-none mb-1">{t('category', 'Category')}</p>
                  <span className="text-xs text-gray-600 dark:text-gray-400 font-bold">{product.category}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Header Actions */}
          <div className="flex sm:flex-col gap-2 w-full sm:w-auto mt-4 sm:mt-0">
            <button
              onClick={() => setIsEditMode(!isEditMode)}
              className={`flex-1 sm:flex-none p-4 sm:p-2.5 rounded-2xl transition-all text-[11px] font-black uppercase flex items-center justify-center gap-2 shadow-lg active:scale-95 ${isEditMode ? 'bg-rose-500 text-white shadow-rose-500/20' : 'bg-white dark:bg-white/5 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-white/10'}`}
            >
              {isEditMode ? <><X className="h-4 w-4" /> {t('stop', 'Stop')}</> : <><Edit3 className="h-4 w-4" /> {t('edit', 'Edit')}</>}
            </button>
          </div>

          <div className="hidden lg:flex items-center gap-6 flex-shrink-0">
            {[
              { label: t('stock', 'Stock'), value: isInfinite ? '∞' : `${product.stock}`, color: isLow || isOut ? 'text-red-500' : 'text-gray-900 dark:text-white' },
              { label: t('sales', 'Sales'), value: `${totalSoldUnits}`, color: 'text-gray-900 dark:text-white' },
            ].map(stat => (
              <div key={stat.label} className="text-center">
                <p className={`text-xl font-black ${stat.color}`}>{stat.value}</p>
                <p className="text-[10px] text-gray-600 font-bold">{stat.label}</p>
              </div>
            ))}
            <div className="w-28">
              <div className="flex justify-between text-[10px] text-gray-600 mb-1 font-bold">
                <span>{t('health', 'Health')}</span>
                <span>{stockPct.toFixed(0)}%</span>
              </div>
              <div className="w-full h-2 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${isLow || isOut ? 'bg-gradient-to-r from-red-400 to-red-500' : stockPct < 60 ? 'bg-gradient-to-r from-amber-400 to-yellow-400' : 'bg-gradient-to-r from-emerald-400 to-teal-400'}`}
                  style={{ width: `${stockPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6 mt-6 px-6 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2 bg-primary/5 px-3 py-1.5 rounded-full border border-primary/10">
            <BadgeInfo className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase">{t('integrated_smart_hub', 'Integrated Smart Hub')}</span>
          </div>
          {isEditMode && (
            <div className="flex items-center gap-2 bg-amber-500/5 px-3 py-1.5 rounded-full border border-amber-500/10 animate-pulse">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase">{t('edit_mode_active', 'Edit Mode Active')}</span>
            </div>
          )}
        </div>
      </div>

      <div className={`p-4 sm:p-8 space-y-6 lg:space-y-10 max-w-7xl mx-auto transition-all ${isEditMode ? 'pb-[200px] sm:pb-[180px] lg:pb-32' : 'pb-10'}`}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { label: t('revenue', 'Revenue'), value: formatCurrency(totalRevenue, currency), icon: CircleDollarSign, color: 'text-primary', bg: 'bg-primary/10' },
              { label: t('sold_qty', 'Sold'), value: `${totalSoldUnits}`, icon: ShoppingBag, color: 'text-blue-500', bg: 'bg-blue-500/10' },
              { label: t('cogs_cost', 'COGS (Cost)'), value: formatCurrency(totalCOGS, currency), icon: Package, color: 'text-gray-600', bg: 'bg-gray-500/10' },
              { label: t('margin', 'Margin'), value: `${profitMargin.toFixed(1)}%`, icon: TrendingUp, color: profitMargin > 20 ? 'text-violet-500' : 'text-orange-500', bg: profitMargin > 20 ? 'bg-violet-500/10' : 'bg-orange-500/10' },
              { label: t('stock_value_cost', 'Stock Value (Cost)'), value: formatCurrency(stockValueCost, currency), icon: Database, color: 'text-amber-500', bg: 'bg-amber-500/10' },
              { label: t('stock_value_sale', 'Stock Value (Sale)'), value: formatCurrency(stockValueSale, currency), icon: Tag, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
            ].map(m => (
              <div key={m.label} className="bg-white dark:bg-[#1C1C1C] p-4 sm:p-4 rounded-[2rem] border border-gray-200 dark:border-white/5 shadow-sm transition-all hover:shadow-md active:scale-95 group">
                <div className={`p-2.5 rounded-2xl w-fit ${m.bg} ${m.color} transition-transform group-hover:scale-110`}>
                  <m.icon className="w-5 h-5" />
                </div>
                <p className={`text-base sm:text-sm font-black mt-4 tracking-tighter ${m.color}`}>{m.value}</p>
                <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest leading-none mt-1">{m.label}</p>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-[#1C1C1C] p-6 rounded-[2.5rem] border border-gray-200 dark:border-white/5 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-2xl">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <h4 className="text-[11px] font-black text-gray-700 dark:text-white uppercase tracking-wider">{t('quick_controls', 'Quick Controls')}</h4>
              </div>
              <div className="flex gap-2">
                {!isInfinite && (
                  <button
                    onClick={() => setShowAdjustment(true)}
                    className="px-5 py-2.5 bg-amber-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-amber-500/20 transition-all hover:scale-[1.02] active:scale-95"
                  >
                    {t('adjust', 'Adjust')}
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1 ml-1">
                  <p className="text-[9px] text-gray-600 uppercase font-bold">{t('min_stock_alert', 'Min Stock Alert')}</p>
                  {parseInt(formData.minStock) !== (product.minStock || 0) && (
                    <button
                      onClick={async () => {
                        try {
                          const newMin = parseInt(formData.minStock) || 0;
                          const saved = await productsService.update(product.id, { minStock: newMin });
                          dispatch({ type: 'UPDATE_PRODUCT', payload: saved });
                          sonner.success('Min stock alert updated');
                        } catch (e) {
                          sonner.error('Failed to save min stock');
                        }
                      }}
                      className="text-[9px] font-black text-primary uppercase hover:underline"
                    >
                      {t('save', 'Save')}
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  value={formData.minStock}
                  onChange={(e) => setFormData({ ...formData, minStock: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-black/30 border-none px-4 py-2.5 rounded-xl text-xs font-bold outline-none ring-1 ring-transparent focus:ring-emerald-500/50 transition-all"
                />
              </div>
              {isEditMode && (
                <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-2">
                  <div>
                    <div className="flex items-center justify-between mb-1 ml-1">
                      <div className="flex items-center gap-1">
                        <p className="text-[9px] text-gray-600 uppercase font-bold">{t('sale_price', 'Sale Price')}</p>
                        <HelpTooltip content="YES → Updates product price AND all active batch sale prices. NO → Updates product price only. Batch sale prices are purely historical." />
                      </div>
                      {parseFloat(formData.price) !== product.price && (
                        <button
                          onClick={async () => {
                            try {
                              const newPrice = parseFloat(formData.price) || 0;
                              const saved = await productsService.update(product.id, { price: newPrice });
                              dispatch({ type: 'UPDATE_PRODUCT', payload: saved });
                              const activeCount = batches.filter(b => (b.qtyRemaining || 0) > 0).length;
                              if (activeCount > 0) {
                                const confirm = await sonner.confirm(
                                  'Update batch sale prices?',
                                  `${activeCount} batch${activeCount > 1 ? 'es have' : ' has'} remaining stock. Update their sale price to ${newPrice}?`,
                                  'Yes, update batches'
                                );
                                if (confirm.isConfirmed) {
                                  await updateBatchPrices('salePrice', newPrice);
                                  sonner.success(`Sale price updated (${activeCount} batch${activeCount > 1 ? 'es' : ''} synced)`);
                                } else {
                                  sonner.success('Sale price updated (batches unchanged)');
                                }
                              } else {
                                sonner.success('Sale price updated');
                              }
                            } catch (e) {
                              sonner.error('Failed to save sale price');
                            }
                          }}
                          className="text-[9px] font-black text-primary uppercase hover:underline"
                        >
                          <div className="flex items-center gap-1">
                            <span>{t('save', 'Save')}</span>
                            <HelpTooltip position="bottom" content="YES = product + batches both update. NO = only product price changes." />
                          </div>
                        </button>
                      )}
                    </div>
                    <input
                      type="number"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      className="w-full bg-gray-50 dark:bg-black/30 border-none px-4 py-2.5 rounded-xl text-xs font-bold text-gray-900 dark:text-white outline-none ring-1 ring-transparent focus:ring-emerald-500/50 transition-all"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1 ml-1">
                      <div className="flex items-center gap-1">
                        <p className="text-[9px] text-gray-600 uppercase font-bold">{t('cost_price', 'Cost Price')}</p>
                        <HelpTooltip content="Cost changes auto-update ALL active batch cost prices for accurate FIFO COGS and stock valuation." />
                      </div>
                      {parseFloat(formData.cost) !== product.cost && (
                        <button
                          onClick={async () => {
                            try {
                              const newCost = parseFloat(formData.cost) || 0;
                              const saved = await productsService.update(product.id, { cost: newCost });
                              dispatch({ type: 'UPDATE_PRODUCT', payload: saved });
                              const activeCount = batches.filter(b => (b.qtyRemaining || 0) > 0).length;
                              if (activeCount > 0) {
                                await updateBatchPrices('costPrice', newCost);
                                sonner.success(`Cost price updated (${activeCount} batch${activeCount > 1 ? 'es' : ''} synced)`);
                              } else {
                                sonner.success('Cost price updated');
                              }
                            } catch (e) {
                              sonner.error('Failed to save cost price');
                            }
                          }}
                          className="text-[9px] font-black text-primary uppercase hover:underline"
                        >
                          {t('save', 'Save')}
                        </button>
                      )}
                    </div>
                    <input
                      type="number"
                      value={formData.cost}
                      onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                      className="w-full bg-gray-50 dark:bg-black/30 border-none px-4 py-2.5 rounded-xl text-xs font-bold text-gray-900 dark:text-white outline-none ring-1 ring-transparent focus:ring-emerald-500/50 transition-all"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {isEditMode && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in slide-in-from-bottom-4">
            
            {/* Card 1: Identity Details (Col span 8) */}
            <div className="lg:col-span-8 bg-white dark:bg-[#1C1C1C] p-6 sm:p-8 rounded-[3rem] border border-gray-200 dark:border-white/5 shadow-2xl">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-3 bg-violet-500/10 text-violet-500 rounded-[1.5rem]"><BadgeInfo className="w-6 h-6" /></div>
                <div>
                  <h3 className="text-base font-black text-gray-900 dark:text-white uppercase tracking-tight">{t('identity_details', 'Identity Details')}</h3>
                  <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">{t('global_product_properties', 'Global product properties')}</p>
                </div>
              </div>
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <SearchableSelect
                      label={t('category_req', 'Category *').replace(' *', '')}
                      options={categories.map(c => ({ id: c, label: c }))}
                      value={formData.category}
                      onChange={(val) => setFormData({ ...formData, category: val })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <SearchableSelect
                      label={t('supplier_label', 'SUPPLIER')}
                      options={[{ id: '', label: t('none', 'NONE') }, ...suppliers.map(s => ({ id: s, label: s }))]}
                      value={formData.supplier}
                      onChange={(val) => setFormData({ ...formData, supplier: val })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest ml-1">{t('sku_optional', 'SKU (Optional)')}</label>
                    <div className="relative">
                      <input
                        value={formData.sku}
                        onChange={(e) => setFormData({ ...formData, sku: e.target.value.toUpperCase() })}
                        className="w-full bg-gray-50 dark:bg-black/30 border-none pl-5 pr-20 py-4 rounded-[1.5rem] text-sm font-mono outline-none ring-1 ring-gray-100 dark:ring-white/5 focus:ring-emerald-500/50"
                        placeholder={t('enter_sku', 'ENTER SKU')}
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {formData.sku && (
                          <button
                            onClick={() => setFormData({ ...formData, sku: '' })}
                            className="p-2 text-gray-600 hover:text-rose-500 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={generateSku}
                          className="p-2.5 bg-white dark:bg-[#262626] text-primary rounded-2xl shadow-sm hover:scale-110 transition-all active:scale-95"
                          title={t('generate_sku_tooltip', 'Generate Smart SKU')}
                        >
                          <Wand2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest ml-1">{t('barcode_ean', 'Barcode / EAN')}</label>
                    <div className="relative">
                      <input
                        value={formData.barcode}
                        onChange={(e) => setFormData({ ...formData, barcode: e.target.value.toUpperCase() })}
                        className="w-full bg-gray-50 dark:bg-black/30 border-none pl-5 pr-32 py-4 rounded-[1.5rem] text-sm font-mono outline-none ring-1 ring-gray-100 dark:ring-white/5 focus:ring-emerald-500/50"
                        placeholder={t('scan_barcode', 'SCAN BARCODE')}
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {formData.barcode && (
                          <button
                            onClick={() => setFormData({ ...formData, barcode: '' })}
                            className="p-2 text-gray-600 hover:text-rose-500 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={generateBarcode}
                          className="p-2 bg-white dark:bg-[#262626] text-primary rounded-xl shadow-sm hover:scale-110 transition-all active:scale-95 border border-primary/10"
                          title={t('generate_barcode_tooltip', 'Generate Barcode')}
                        >
                          <Wand2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { setActiveScannerField('barcode'); setShowScanner(true); }}
                          className="p-2 bg-white dark:bg-[#262626] text-blue-500 rounded-xl shadow-sm hover:scale-110 transition-all active:scale-95 border border-blue-500/10"
                          title={t('scan_with_camera_tooltip', 'Scan with Camera')}
                        >
                          <Camera className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {formData.barcode && (
                      <BarcodePreview value={formData.barcode} />
                    )}
                  </div>
                </div>

                {/* --- Product Image Section --- */}
                <div className="pt-4 border-t border-gray-200 dark:border-white/5">
                  <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3 ml-1">{t('product_image', 'Product Image')}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFileSelect}
                          disabled={isCompressing}
                          className="input flex-1 !py-2 !text-[10px] font-bold"
                        />
                        {isCompressing && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
                      </div>
                      <p className="text-[8px] font-bold text-gray-500 uppercase tracking-widest ml-1">{t('image_compression_notice', 'WebP, JPG, PNG (Auto-compressed to 20-50KB)')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowMediaLibrary(true)}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500/5 text-blue-500 rounded-xl text-[10px] font-black uppercase tracking-tight border border-blue-500/10 hover:bg-blue-500 hover:text-white transition-all shadow-sm"
                      >
                        <Library className="w-3.5 h-3.5" />
                        {t('pick_from_library', 'Pick from Library')}
                      </button>
                      {formData.image && (
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, image: '' }))}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-500/5 text-rose-500 rounded-xl text-[10px] font-black uppercase tracking-tight border border-rose-500/10 hover:bg-rose-500 hover:text-white transition-all shadow-sm"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {t('remove', 'Remove')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Status & Controls (Col span 4) */}
            <div className="lg:col-span-4 bg-white dark:bg-[#1C1C1C] p-6 sm:p-8 rounded-[3rem] border border-gray-200 dark:border-white/5 shadow-2xl flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-8">
                  <div className="p-3 bg-primary/10 text-primary rounded-[1.5rem]"><Tag className="w-6 h-6" /></div>
                  <div>
                    <h3 className="text-base font-black text-gray-900 dark:text-white uppercase tracking-tight">{t('product_status', 'Product Status')}</h3>
                    <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">{t('status_controls', 'Status & Controls')}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-white/[0.03] rounded-[1.5rem] border border-gray-200 dark:border-white/5">
                    <div className="flex flex-col">
                      <span className="text-[11px] font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center">
                        {t('active_status', 'Active Status')}
                        <HelpTooltip content="Toggles whether this item is selectable or scannable at the POS checkout." />
                      </span>
                      <span className="text-[9px] font-bold text-gray-600 uppercase">{t('visible_in_pos', 'Visible in POS')}</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer scale-110">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={formData.active}
                        onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                      />
                      <div className="w-10 h-5 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-white/[0.03] rounded-[1.5rem] border border-gray-200 dark:border-white/5">
                    <div className="flex flex-col">
                      <span className="text-[11px] font-black text-violet-600 dark:text-violet-400 uppercase tracking-wider flex items-center">
                        {t('featured', 'Featured')}
                        <HelpTooltip content="Highlights this product with a gold star badge across inventory and POS quick-select grids." />
                      </span>
                      <span className="text-[9px] font-bold text-gray-600 uppercase">{t('star_product', 'Star Product')}</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer scale-110">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={formData.isFeatured}
                        onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
                      />
                      <div className="w-10 h-5 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-violet-500"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-white/[0.03] rounded-[1.5rem] border border-gray-200 dark:border-white/5">
                    <div className="flex flex-col">
                      <span className="text-[11px] font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center">
                        {t('track_stock', 'Track Stock')}
                        <HelpTooltip content="Maintains physical inventory balance. Unchecking allows infinite sales without stock validation." />
                      </span>
                      <span className="text-[9px] font-bold text-gray-600 uppercase">{t('inventory_control', 'Inventory Control')}</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer scale-110">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={formData.trackInventory}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setFormData({ ...formData, trackInventory: checked });
                          if (checked) setShowStockIn(true);
                        }}
                      />
                      <div className="w-10 h-5 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-white/[0.03] rounded-[1.5rem] border border-gray-200 dark:border-white/5">
                    <div className="flex flex-col">
                      <span className="text-[11px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-wider flex items-center">
                        {t('service_item', 'Service Item')}
                        <HelpTooltip content="Flags item as labor or consultation. Auto-disables stock tracking and ignores low stock warnings." />
                      </span>
                      <span className="text-[9px] font-bold text-gray-600 uppercase">{t('no_stock_tracking', 'No Stock Tracking')}</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer scale-110">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={formData.isService}
                        onChange={(e) => setFormData({ ...formData, isService: e.target.checked, trackInventory: e.target.checked ? false : formData.trackInventory })}
                      />
                      <div className="w-10 h-5 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-500"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-white/[0.03] rounded-[1.5rem] border border-gray-200 dark:border-white/5">
                    <div className="flex flex-col">
                      <span className="text-[11px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center">
                        {t('require_serial_imei', 'Require Serial/IMEI')}
                        <HelpTooltip content="Forces scanner or keyboard prompt at POS for unique serial number / IMEI registration." />
                      </span>
                      <span className="text-[9px] font-bold text-gray-600 uppercase">{t('prompt_on_pos', 'Prompt on POS')}</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer scale-110">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={formData.requireSerial}
                        onChange={(e) => setFormData({ ...formData, requireSerial: e.target.checked })}
                      />
                      <div className="w-10 h-5 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: Variants & Modifiers (Col span 8) */}
            <div className="lg:col-span-8 bg-white dark:bg-[#1C1C1C] p-6 sm:p-8 rounded-[3rem] border border-gray-200 dark:border-white/5 shadow-2xl">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-[1.5rem]"><PackageSearch className="w-6 h-6" /></div>
                <div>
                  <h3 className="text-base font-black text-gray-900 dark:text-white uppercase tracking-tight">{t('customization_details', 'Customizations & Options')}</h3>
                  <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">{t('variants_modifiers_subtitle', 'Manage product variants and add-on modifiers')}</p>
                </div>
              </div>
              <div className="space-y-6">
                {/* Variants */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black text-gray-900 dark:text-white uppercase">{t('product_variants', 'Product Variants')}</h4>
                      <p className="text-[9px] text-gray-600 uppercase font-bold tracking-widest">{t('variants_sub', 'Size, Color, Material (e.g. Garments, Shoes)')}</p>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => setVariants([...variants, { name: '', options: [], optionsRaw: '' }])}
                      className="px-3 py-1.5 bg-white dark:bg-black text-primary dark:text-primary text-[10px] font-black uppercase tracking-widest rounded-lg border border-gray-200 dark:border-white/10 hover:border-primary shadow-sm"
                    >
                      {t('add_variant_option', 'Add Variant Option')}
                    </button>
                  </div>
                  
                  {variants.map((variant, index) => {
                    const addTag = (text: string) => {
                      const trimmed = text.trim();
                      if (!trimmed) return;
                      const parts = trimmed.split(/[,;]+/).map(p => p.trim()).filter(p => p && !variant.options.includes(p));
                      if (parts.length > 0) {
                        const newVariants = [...variants];
                        newVariants[index].options = [...variant.options, ...parts];
                        newVariants[index].optionsRaw = '';
                        setVariants(newVariants);
                      } else {
                        const newVariants = [...variants];
                        newVariants[index].optionsRaw = '';
                        setVariants(newVariants);
                      }
                    };

                    const removeTag = (optIndex: number) => {
                      const newVariants = [...variants];
                      newVariants[index].options = variant.options.filter((_, i) => i !== optIndex);
                      setVariants(newVariants);
                    };

                    return (
                      <div key={index} className="flex gap-2 items-start p-3 bg-white dark:bg-black/40 rounded-xl border border-gray-200 dark:border-white/5">
                        <input
                          type="text"
                          placeholder={t('variant_name_placeholder', 'Variant Name (e.g. Size)')}
                          value={variant.name}
                          onChange={(e) => {
                            const newVariants = [...variants];
                            newVariants[index].name = e.target.value;
                            setVariants(newVariants);
                          }}
                          className="w-1/3 bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 text-xs rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 font-black"
                        />
                        
                        <div 
                          className="flex-1 flex flex-wrap items-center gap-1.5 min-h-[38px] bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 focus-within:ring-1 focus-within:ring-emerald-500 focus-within:border-primary transition-all cursor-text"
                          onClick={(e) => {
                            const inputEl = e.currentTarget.querySelector('input[type="text"]');
                            if (inputEl) (inputEl as HTMLInputElement).focus();
                          }}
                        >
                          {variant.options.map((opt, optIndex) => (
                            <span 
                              key={optIndex} 
                              className="bg-emerald-50 dark:bg-primary/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-primary/20 px-2 py-0.5 rounded-md text-[11px] font-bold flex items-center gap-1 animate-fadeIn select-none"
                            >
                              {opt}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeTag(optIndex);
                                }}
                                className="text-primary hover:text-emerald-700 dark:hover:text-emerald-300 font-bold focus:outline-none transition-colors"
                              >
                                &times;
                              </button>
                            </span>
                          ))}
                          <input
                            type="text"
                            placeholder={variant.options.length === 0 ? t('variant_options_placeholder', 'Options (Comma/Enter)') : ""}
                            value={variant.optionsRaw || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val.includes(',') || val.includes(';')) {
                                addTag(val);
                              } else {
                                const newVariants = [...variants];
                                newVariants[index].optionsRaw = val;
                                setVariants(newVariants);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                e.stopPropagation();
                                addTag(e.currentTarget.value);
                              } else if (e.key === 'Backspace' && !variant.optionsRaw && variant.options.length > 0) {
                                removeTag(variant.options.length - 1);
                              }
                            }}
                            onBlur={(e) => {
                              addTag(e.target.value);
                            }}
                            className="flex-1 min-w-[60px] bg-transparent border-0 outline-none p-0 text-xs text-gray-900 dark:text-white focus:ring-0 placeholder-gray-400 dark:placeholder-gray-500 font-medium"
                          />
                        </div>

                        <button type="button" onClick={() => setVariants(variants.filter((_, i) => i !== index))} className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Modifiers */}
                <div className="space-y-3 pt-6 border-t border-gray-200 dark:border-white/5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black text-gray-900 dark:text-white uppercase">{t('addons_modifiers', 'Add-ons & Modifiers')}</h4>
                      <p className="text-[9px] text-gray-600 uppercase font-bold tracking-widest">{t('modifiers_sub', 'Extra Charges (e.g. Extra Cheese, Warranty)')}</p>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => setModifiers([...modifiers, { name: '', price: 0 }])}
                      className="px-3 py-1.5 bg-white dark:bg-black text-blue-600 dark:text-blue-500 text-[10px] font-black uppercase tracking-widest rounded-lg border border-gray-200 dark:border-white/10 hover:border-blue-500 shadow-sm"
                    >
                      {t('add_modifier', 'Add Modifier')}
                    </button>
                  </div>
                  
                  {modifiers.map((modifier, index) => (
                    <div key={index} className="flex flex-col sm:flex-row gap-2.5 p-3 bg-white dark:bg-black/40 rounded-xl border border-gray-200 dark:border-white/5">
                      <div className="flex-1 min-w-0 space-y-1.5 w-full">
                        <input
                          type="text"
                          placeholder={t('modifier_name_placeholder', 'Modifier Name')}
                          value={modifier.name}
                          onChange={(e) => {
                            const newModifiers = [...modifiers];
                            newModifiers[index].name = e.target.value;
                            setModifiers(newModifiers);
                          }}
                          className="w-full min-w-0 bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-blue-500 font-medium text-gray-900 dark:text-white"
                        />
                        {variants.length > 0 && variants.some(v => v.options && v.options.length > 0) && (
                          <select
                            value={modifier.variantName || ''}
                            onChange={(e) => {
                              const newModifiers = [...modifiers];
                              newModifiers[index].variantName = e.target.value || undefined;
                              setModifiers(newModifiers);
                            }}
                            className="w-full min-w-0 bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-blue-500 font-medium"
                          >
                            <option value="">Apply to all variants</option>
                            {variants.flatMap(v => (v.options || []).map((opt: string) => `${v.name}: ${opt}`)).map(opt => (
                              <option key={opt} value={opt}>Only for {opt}</option>
                            ))}
                          </select>
                        )}
                      </div>
                      <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-between sm:justify-start">
                        <div className="relative flex-1 sm:flex-none w-full sm:w-24">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs font-bold z-10">+</span>
                          <input
                            type="number"
                            placeholder="0"
                            value={modifier.price || ''}
                            onChange={(e) => {
                              const newModifiers = [...modifiers];
                              newModifiers[index].price = parseFloat(e.target.value) || 0;
                              setModifiers(newModifiers);
                            }}
                            className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-lg pl-6 pr-2 py-1.5 focus:ring-1 focus:ring-blue-500 font-bold text-gray-900 dark:text-white text-xs"
                          />
                        </div>
                        <button type="button" onClick={() => setModifiers(modifiers.filter((_, i) => i !== index))} className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg shrink-0 transition-colors mt-0.5">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Card 4: Batches (Col span 4) */}
            <div className="lg:col-span-4 bg-white dark:bg-[#1C1C1C] p-6 sm:p-8 rounded-[3rem] border border-gray-200 dark:border-white/5 shadow-2xl flex flex-col h-fit">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-primary/10 text-primary rounded-[1.5rem]"><Plus className="w-6 h-6" /></div>
                  <div>
                    <h3 className="text-base font-black text-gray-900 dark:text-white uppercase tracking-tight">{t('batches', 'Batches')}</h3>
                    <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">{t('inventory_stock_logs', 'Inventory stock logs')}</p>
                  </div>
                </div>
                {!isInfinite && (
                  <button
                    onClick={() => setShowStockIn(true)}
                    className="p-3 bg-primary text-white rounded-[1.1rem] shadow-lg shadow-emerald-500/30 hover:scale-105 active:scale-95 transition-all"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                )}
              </div>
              <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2 no-scrollbar">
                {isInfinite ? (
                  <div className="text-center py-12 text-[10px] text-gray-600 font-bold uppercase border-2 border-dashed border-gray-200 dark:border-white/5 rounded-[2.5rem]">{t('tracking_disabled', 'Tracking Disabled')}</div>
                ) : batches.length === 0 ? (
                  <div className="text-center py-12 text-[10px] text-gray-600 font-bold uppercase border-2 border-dashed border-gray-200 dark:border-white/5 rounded-[2.5rem]">{t('no_batches', 'No Batches')}</div>
                ) : [...batches].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).map((batch) => (
                  <div key={batch.id} className="p-4 bg-gray-50 dark:bg-white/[0.03] rounded-[1.75rem] border border-gray-200 dark:border-white/5 group relative transition-transform hover:scale-[1.02]">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black uppercase text-gray-600 tracking-widest mb-1">{t('batch_id', 'Batch ID')}</span>
                        <span className="text-xs font-black text-gray-700 dark:text-gray-200">{batch.batchNumber}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] font-black uppercase text-gray-600 tracking-widest mb-1 block">{t('quantity', 'Quantity')}</span>
                        <span className="text-sm font-black text-primary">{Number(batch.quantity) || 0}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-white dark:bg-white/5 rounded-2xl border border-gray-50 dark:border-white/5">
                        <p className="text-[8px] font-black text-gray-600 uppercase mb-0.5 tracking-widest">{t('added', 'Added')}</p>
                        <p className="text-[11px] font-bold text-gray-600 dark:text-gray-400">
                          {batch.createdAt ? new Date(batch.createdAt).toLocaleDateString() : 'N/A'}
                        </p>
                      </div>
                      <div className="p-3 bg-white dark:bg-white/5 rounded-2xl border border-gray-50 dark:border-white/5">
                        <p className="text-[8px] font-black text-gray-600 uppercase mb-0.5 tracking-widest">{t('source', 'Source')}</p>
                        <p className="text-[11px] font-bold text-primary truncate">
                          {batch.supplier || 'DIRECT'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {showStockIn && (
          <BatchStockInSystem
            initialProduct={product}
            onClose={() => setShowStockIn(false)}
          />
        )}

        <Modal
          isOpen={showAdjustment}
          onClose={() => setShowAdjustment(false)}
          title={t('stock_adjustment', 'Stock Adjustment')}
          maxWidth="lg"
          footer={
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowAdjustment(false)}
                className="px-6 py-3 border border-rose-200 dark:border-rose-900/30 text-[#ff4b6e] hover:bg-rose-50 dark:hover:bg-rose-500/10 text-[10px] font-black uppercase tracking-widest rounded-full transition-all active:scale-95"
              >
                {t('discard', 'DISCARD')}
              </button>
              <button
                onClick={handleAdjustment}
                disabled={isUpdating || !adjustmentData.quantity}
                className="px-8 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-full text-[11px] font-black uppercase tracking-widest shadow-lg shadow-amber-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>{t('apply_correction', 'APPLY CORRECTION')}</span>
              </button>
            </div>
          }
        >
          <div className="space-y-8">
            <div className="grid grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest ml-1">{t('qty_change_req', 'Qty Change *')}</label>
                <input
                  type="number"
                  value={adjustmentData.quantity}
                  onChange={(e) => setAdjustmentData({ ...adjustmentData, quantity: e.target.value })}
                  className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none px-4 py-4 rounded-xl text-xl font-black outline-none focus:ring-2 focus:ring-amber-500 dark:text-white"
                  placeholder="-5 or +10"
                />
              </div>
              <div className="space-y-2 relative z-30">
                <label className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest ml-1">{t('reason_req', 'Reason *')}</label>
                <SearchableSelect
                  options={['Correction', 'Damage', 'Theft', 'Expired', 'Gift', 'Return to Vendor'].map(r => ({ id: r, label: r }))}
                  value={adjustmentData.reason}
                  onChange={(val) => setAdjustmentData({ ...adjustmentData, reason: val })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest ml-1">{t('audit_notes', 'Audit Notes')}</label>
              <textarea
                value={adjustmentData.notes}
                onChange={(e) => setAdjustmentData({ ...adjustmentData, notes: e.target.value })}
                className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none px-4 py-4 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-amber-500 min-h-[120px] resize-none dark:text-white"
                placeholder={t('explain_adjustment_placeholder', 'Explain the context of this adjustment...')}
              />
            </div>
          </div>
        </Modal>

        <div className="bg-white dark:bg-surface rounded-[2.5rem] border border-gray-200 dark:border-white/5 overflow-hidden shadow-xl">
          <div className="px-4 sm:px-8 py-4 sm:py-6 border-b border-gray-50 dark:border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 text-blue-500 rounded-xl"><PackageSearch className="w-4 h-4" /></div>
              <h4 className="text-xs font-black text-gray-700 dark:text-white uppercase tracking-widest">{t('movement_history', 'Movement History')}</h4>
            </div>
            <div className="flex bg-gray-100/80 dark:bg-black/75 p-1 rounded-xl border border-gray-200/50 dark:border-white/5 shadow-inner">
              {['ALL', 'IN', 'OUT'].map(opt => {
                const isActive = filterType === opt;
                return (
                  <button
                    key={opt}
                    onClick={() => setFilterType(opt as any)}
                    className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300 relative z-10 ${isActive ? 'text-primary' : 'text-gray-600 hover:text-gray-600 dark:hover:text-white'}`}
                  >
                    {isActive && (
                      <div className="absolute inset-0 bg-white dark:bg-[#1f1f1f] rounded-lg shadow-sm border border-gray-200 dark:border-white/10 -z-10 animate-in zoom-in-95" />
                    )}
                    {opt === 'ALL' ? t('all', 'ALL') : opt === 'IN' ? t('in', 'IN') : t('out', 'OUT')}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Top Pagination */}
          {totalHistoryPages > 1 && (
            <div className="px-8 py-3 bg-gray-50/50 dark:bg-white/[0.01] border-b border-gray-200 dark:border-white/5 flex items-center justify-between">
              <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest italic">
                {t('page', 'Page')} <span className="text-primary">{historyPage}</span> {t('of', 'of')} {totalHistoryPages}
              </p>
              <div className="flex gap-2">
                <button
                  disabled={historyPage === 1}
                  onClick={() => setHistoryPage(p => p - 1)}
                  className="p-1.5 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-gray-600 hover:text-primary disabled:opacity-30 transition-all shadow-sm"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  disabled={historyPage === totalHistoryPages}
                  onClick={() => setHistoryPage(p => p + 1)}
                  className="p-1.5 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-gray-600 hover:text-primary disabled:opacity-30 transition-all shadow-sm"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          <div className="overflow-hidden">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/50 dark:bg-white/[0.02]">
                    <th className="px-8 py-4 text-[9px] font-black text-gray-600 uppercase tracking-widest">{t('date_time', 'Date / Time')}</th>
                    <th className="px-8 py-4 text-[9px] font-black text-gray-600 uppercase tracking-widest text-center">{t('entity_source', 'Entity / Source')}</th>
                    <th className="px-8 py-4 text-[9px] font-black text-gray-600 uppercase tracking-widest text-center">{t('user', 'User')}</th>
                    <th className="px-8 py-4 text-[9px] font-black text-gray-600 uppercase tracking-widest text-right">{t('qty_change', 'Qty Change')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                  {movementHistory.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-8 py-20 text-center text-[11px] text-gray-600 uppercase font-black italic">{t('no_records_found', 'No records found')}</td>
                    </tr>
                  ) : paginatedHistory.map((h) => (
                    <tr
                      key={h.id}
                      onClick={() => handleRowClick(h)}
                      className={`group hover:bg-gray-50/50 dark:hover:bg-white/[0.01] transition-colors cursor-pointer active:scale-[0.99]`}
                    >
                      <td className="px-8 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${h.bg} ${h.color}`}><h.icon className="w-3.5 h-3.5" /></div>
                          <div>
                            <p className="text-[10px] font-black text-gray-900 dark:text-white uppercase leading-tight">{new Date(h.date).toLocaleDateString()}</p>
                            <p className="text-[8px] text-gray-600 font-bold uppercase">{new Date(h.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-4 text-center">
                        <p className="text-[9px] font-black text-gray-700 dark:text-gray-300 uppercase tracking-tighter">{h.entity}</p>
                        <p className="text-[8px] text-gray-600 font-bold uppercase">{h.label}</p>
                      </td>
                      <td className="px-8 py-4 text-center">
                        <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">{h.user?.split('@')[0] || 'System'}</span>
                        {h.notes && (
                          <p className="text-[7px] text-gray-600 font-medium italic mt-0.5 max-w-[150px] mx-auto truncate">
                            {h.notes}
                          </p>
                        )}
                      </td>
                      <td className={`px-8 py-4 text-right font-black text-xs ${h.color}`}>
                        {h.qty > 0 ? '+' : ''}{h.qty} <span className="text-[9px] opacity-70 ml-1 font-bold">{h.type}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-gray-50 dark:divide-white/5">
              {movementHistory.length === 0 ? (
                <div className="py-20 text-center text-[11px] text-gray-600 uppercase font-black italic">{t('no_records_found', 'No records found')}</div>
              ) : paginatedHistory.map((h) => (
                <div
                  key={h.id}
                  onClick={() => handleRowClick(h)}
                  className="p-4 flex flex-col gap-3 active:bg-gray-50 dark:active:bg-white/5 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${h.bg} ${h.color}`}><h.icon className="w-3.5 h-3.5" /></div>
                      <div>
                        <p className="text-[10px] font-black text-gray-900 dark:text-white uppercase leading-tight">{new Date(h.date).toLocaleDateString()}</p>
                        <p className="text-[8px] text-gray-600 font-bold uppercase">{new Date(h.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    </div>
                    <div className={`text-sm font-black ${h.color}`}>
                      {h.qty > 0 ? '+' : ''}{h.qty} <span className="text-[9px] opacity-70 font-bold uppercase">{h.type}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between bg-gray-50 dark:bg-white/5 p-2 rounded-xl">
                    <div className="flex flex-col">
                      <p className="text-[8px] font-black text-gray-600 uppercase tracking-widest mb-0.5">{t('reference', 'Reference')}</p>
                      <p className="text-[10px] font-black text-gray-700 dark:text-gray-300 uppercase truncate max-w-[120px]">{h.entity}</p>
                    </div>
                    <div className="text-right flex flex-col">
                      <p className="text-[8px] font-black text-gray-600 uppercase tracking-widest mb-0.5">{t('source_user', 'Source / User')}</p>
                      <p className="text-[10px] font-black text-primary uppercase">{h.user?.split('@')[0] || 'System'}</p>
                    </div>
                  </div>
                  {h.notes && (
                    <p className="text-[9px] text-gray-600 font-medium italic px-1 line-clamp-2">
                      {h.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Pagination Footer */}
          {totalHistoryPages > 1 && (
            <div className="px-8 py-4 bg-gray-50/50 dark:bg-white/[0.01] border-t border-gray-200 dark:border-white/5 flex items-center justify-between">
              <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest italic">
                {t('showing', 'Showing')} {(historyPage - 1) * HISTORY_PER_PAGE + 1} {t('to', 'to')} {Math.min(historyPage * HISTORY_PER_PAGE, movementHistory.length)} {t('of', 'of')} {movementHistory.length}
              </p>
              <div className="flex gap-2">
                <button
                  disabled={historyPage === 1}
                  onClick={() => setHistoryPage(p => p - 1)}
                  className="px-3 py-1.5 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-[10px] font-black uppercase tracking-tighter disabled:opacity-30 hover:scale-105 transition-all shadow-sm"
                >
                  {t('prev', 'Prev')}
                </button>
                <button
                  disabled={historyPage === totalHistoryPages}
                  onClick={() => setHistoryPage(p => p + 1)}
                  className="px-3 py-1.5 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-[10px] font-black uppercase tracking-tighter disabled:opacity-30 hover:scale-105 transition-all shadow-sm"
                >
                  {t('next', 'Next')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {
        showMediaLibrary && (
          <MediaLibrary
            isOpen={showMediaLibrary}
            onClose={() => setShowMediaLibrary(false)}
            onSelect={(url) => setFormData(prev => ({ ...prev, image: url }))}
          />
        )
      }

      {
        showScanner && (
          <CameraScanner
            onScan={(code) => {
              setFormData(prev => ({ ...prev, [activeScannerField]: code }));
              setShowScanner(false);
            }}
            onClose={() => setShowScanner(false)}
          />
        )
      }

      {/* --- COMPACT SAVE BAR (Sticky Footer) --- */}
      <StickyFormFooter
        show={isEditMode}
        isSaving={isUpdating}
        onDiscard={() => setIsEditMode(false)}
        onSave={handleSave}
        saveLabel={t('commit_changes', 'Confirm Changes')}
        unsaved={true}
      />
    </div>
  );
}
