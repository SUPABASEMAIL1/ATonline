import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';
import { Plus, Search, Edit, Trash2, Package, AlertTriangle, TrendingUp, TrendingDown, Printer, Star, CheckSquare, Square, Layers, ChevronLeft, ChevronRight, Download, Upload, Truck, History, ClipboardList, Camera, X, Database, Tag, Power, MinusSquare, Gift } from 'lucide-react';
import { Product } from '../../types';
import { useApp } from '../../context/SupabaseAppContext';
import { ProductModal } from './ProductModal';
import { ProductDetailHub } from './ProductDetailHub';
import { BarcodeGenerator, clearPersistedBarcodeState } from './BarcodeGenerator';
import { BulkEditModal } from './BulkEditModal';
import { MediaLibrary } from './MediaLibrary'; // Import MediaLibrary as a standalone tab component if needed
import { PurchaseHistory } from './PurchaseHistory';
import { AuditTimeline } from './AuditTimeline';
import { ReceiptPrint } from '../pos/ReceiptPrint';
import { PurchaseOrderSystem } from './PurchaseOrderSystem';
import { CameraScanner } from '../common/CameraScanner';
import { BarcodePreview } from '../common/BarcodePreview';

import { SupplierManager } from './suppliers/SupplierManager';
import { sonner } from '../../lib/sonner';
import { productsService } from '../../lib/services';
import { formatCurrency } from '../../lib/currencies';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { useTranslation } from '../../hooks/useTranslation';
import { SearchableSelect } from '../common/SearchableSelect';
import { generateId, localDb, queueOp } from '../../lib/localDb';
import { toRemoteProduct } from '../../lib/services';
import { BundleManager } from './BundleManager';

type TabType = 'inventory' | 'purchase_orders' | 'groups' | 'media' | 'purchases' | 'bundles';

export function InventoryManager() {
  const navigate = useNavigate();
  const location = useLocation();
  const { subTab } = useParams();
  const { state, dispatch } = useApp();
  const { t } = useTranslation();
  const { profile } = useAuth();

  // Safety check to prevent black screen if state/settings haven't loaded yet
  if (!state?.settings || !state?.products) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const isAdmin = profile?.role === 'admin';
  const canManageStock = isAdmin || profile?.canManageStock || profile?.canManagePO;
  const canManagePO = isAdmin || profile?.canManagePO;
  const canViewRecords = isAdmin || profile?.canViewRecords;

  const SUB_TAB_SEGMENT_TO_INTERNAL: Record<string, TabType> = {
    products: 'inventory',
    history: 'purchases',
    restock: 'purchase_orders',
    bundles: 'bundles',
    groups: 'groups',
    media: 'media',
  };
  const INTERNAL_TO_SUB_TAB_SEGMENT: Record<string, string> = {
    inventory: 'products',
    purchases: 'history',
    purchase_orders: 'restock',
    bundles: 'bundles',
    groups: 'groups',
    media: 'media',
  };
  const activeTab = (subTab ? SUB_TAB_SEGMENT_TO_INTERNAL[subTab] : 'inventory') as TabType;

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedType, setSelectedType] = useState('All');
  const [selectedSupplier, setSelectedSupplier] = useState('All');
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'stock' | 'price'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('barcode_selected_product_ids');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showBarcodeGenerator, setShowBarcodeGenerator] = useState(() => {
    return localStorage.getItem('barcode_show_generator') === 'true';
  });
  const [barcodeProducts, setBarcodeProducts] = useState<Product[]>([]);
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [viewingSale, setViewingSale] = useState<any | null>(null);
  const [showScannerInInventory, setShowScannerInInventory] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  // Synchronize barcode selections and generator open state to localStorage
  useEffect(() => {
    localStorage.setItem('barcode_selected_product_ids', JSON.stringify(selectedProductIds));
  }, [selectedProductIds]);

  useEffect(() => {
    localStorage.setItem('barcode_show_generator', String(showBarcodeGenerator));
  }, [showBarcodeGenerator]);

  // Automatically hydrate barcodeProducts from state.products when selections or products load/change
  useEffect(() => {
    if (showBarcodeGenerator && selectedProductIds.length > 0) {
      const filtered = state.products.filter((p: Product) => selectedProductIds.includes(p.id));
      setBarcodeProducts(prev => {
        // Prevent infinite loops by only updating if the filtered IDs list changed
        const prevIds = prev.map(x => x.id).join(',');
        const nextIds = filtered.map(x => x.id).join(',');
        if (prevIds !== nextIds) {
          return filtered;
        }
        return prev;
      });
    } else if (!showBarcodeGenerator) {
      setBarcodeProducts([]);
    }
  }, [state.products, showBarcodeGenerator, selectedProductIds]);

  // Handle auto-opening hub when navigating from sale breakdown (via location.state)
  useEffect(() => {
    const navState = location.state as { productId?: string; fromSale?: string } | null;
    if (navState?.productId) {
      const product = state.products.find((p: Product) => p.id === navState.productId);
      if (product) {
        setDetailProduct(product);
      }
      // Clear the state so back button works correctly (don't reopen on re-render)
      window.history.replaceState({}, document.title);
    }
  }, [location.state, state.products]);

  // Handle return redirection to specific tabs (e.g. Stock History)
  useEffect(() => {
    if (state.pendingReturnTab === 'purchases') {
      navigate('/inventory/history');
      // We don't clear it here yet to allow the 'Back' button in Transactions to persist its state
      // But if we are already in Inventory, we should clear it once we land.
      // Actually, SET_PENDING_RETURN_TAB is cleared by the 'Back' button itself.
    }
  }, [state.pendingReturnTab]);

  const categories = useMemo(() => {
    const rawCategories = state.products.map((p: Product) => {
      const cat = p.category;
      if (typeof cat === 'string' && cat.trim().startsWith('{')) {
        try {
          return JSON.parse(cat).name || cat;
        } catch (_) {}
      }
      return cat;
    }).filter(Boolean);
    return ['All', ...Array.from(new Set(rawCategories))];
  }, [state.products]);

  const suppliers = useMemo(() => {
    return ['All', ...Array.from(new Set(state.products.map((p: Product) => p.supplier).filter(Boolean) as string[]))];
  }, [state.products]);

  const filteredProducts = useMemo(() => {
    return state.products
      .filter(product => {
        const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (product.sku && product.sku.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (product.barcode && product.barcode.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory;
        const matchesSupplier = selectedSupplier === 'All' || product.supplier === selectedSupplier;
        const matchesType = selectedType === 'All' ||
          (selectedType === 'services' && product.isService) ||
          (selectedType === 'serialized' && product.requireSerial) ||
          (selectedType === 'standard' && !product.isService && !product.requireSerial);
        return matchesSearch && matchesCategory && matchesSupplier && matchesType;
      })
      .sort((a, b) => {
        let aValue: string | number;
        let bValue: string | number;

        switch (sortBy) {
          case 'name':
            aValue = a.name.toLowerCase();
            bValue = b.name.toLowerCase();
            break;
          case 'stock':
            aValue = a.stock;
            bValue = b.stock;
            break;
          case 'price':
            aValue = a.price;
            bValue = b.price;
            break;
          default:
            aValue = a.name.toLowerCase();
            bValue = b.name.toLowerCase();
        }

        if (sortOrder === 'asc') {
          return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        } else {
          return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
        }
      });
  }, [state.products, searchTerm, selectedCategory, selectedSupplier, selectedType, sortBy, sortOrder]);

  const totalPages = useMemo(() => {
    return Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  }, [filteredProducts.length]);

  const paginatedProducts = useMemo(() => {
    return filteredProducts.slice(
      (currentPage - 1) * ITEMS_PER_PAGE,
      currentPage * ITEMS_PER_PAGE
    );
  }, [filteredProducts, currentPage]);

  // Barcode scanner logic (Hardware Scanner)
  useBarcodeScanner((barcode: string) => {
    const term = barcode.trim();
    const normalizedTerm = term.toUpperCase().replace(/O/g, '0');

    // 1. Exact match
    let found = state.products.find(
      (p: Product) => p.barcode === term || p.sku === term
    );

    // 2. Normalized match (handles OCR confusion)
    if (!found) {
      found = state.products.find((p: Product) => {
        const pBarcode = (p.barcode || '').toUpperCase().replace(/O/g, '0');
        const pSku = (p.sku || '').toUpperCase().replace(/O/g, '0');
        return pBarcode === normalizedTerm || pSku === normalizedTerm;
      });
    }

    if (found) {
      setSearchTerm(found.barcode || found.sku || '');
      setCurrentPage(1);
      sonner.success(`Found: ${found.name}`);
    } else {
      sonner.error(`Product not found: ${term}`);
    }
  });

  // Listener for cross-tab product redirection
  useEffect(() => {
    const handleOpenProduct = (e: any) => {
      const productId = e.detail;
      const product = state.products.find(p => p.id === productId);
      if (product) {
        setDetailProduct(product);
      }
    };
    window.addEventListener('open-product-hub', handleOpenProduct);
    return () => window.removeEventListener('open-product-hub', handleOpenProduct);
  }, [state.products]);

  const lowStockProducts = state.products.filter((p: Product) =>
    p.trackInventory !== false &&
    p.stock < 990000 &&
    p.stock >= 0 && // Include 0 (out of stock)
    p.stock <= (p.minStock || 5) // Fallback to 5 if minStock is not set
  );
  const totalValue = state.products.reduce((sum: number, p: Product) => {
    const isInfinite = p.trackInventory === false || p.stock >= 990000;
    return sum + (isInfinite ? 0 : (p.stock || 0) * (p.cost || 0));
  }, 0);
  const outOfStockProducts = state.products.filter((p: Product) => p.trackInventory !== false && p.stock < 990000 && p.stock <= 0);



  const handleEditProduct = (product: Product) => {
    setDetailProduct(product);
  };

  const handleDeleteProduct = async (productId: string) => {
    const result = await sonner.deleteConfirm('product');
    if (result.isConfirmed) {
      try {
        await productsService.delete(productId);
        dispatch({ type: 'DELETE_PRODUCT', payload: productId });
        sonner.success('Product deleted successfully!');
      } catch (error) {
        sonner.error('Failed to delete product');
      }
    }
  };

  const handleSelectAll = () => {
    if (selectedProductIds.length === filteredProducts.length && filteredProducts.length > 0) {
      setSelectedProductIds([]);
    } else {
      setSelectedProductIds(filteredProducts.map(p => p.id));
    }
  };

  const handleSelectProduct = (id: string) => {
    setSelectedProductIds((prev: string[]) =>
      prev.includes(id) ? prev.filter((pId: string) => pId !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = async () => {
    if (selectedProductIds.length === 0) return;
    const result = await sonner.confirm(
      'Bulk Delete?',
      `Are you sure you want to delete ${selectedProductIds.length} selected products?`
    );
    if (result.isConfirmed) {
      sonner.loading('Deleting products...');
      try {
        // Break into chunks if too many to avoid DB lock issues
        const CHUNK_SIZE = 50;
        for (let i = 0; i < selectedProductIds.length; i += CHUNK_SIZE) {
          const chunk = selectedProductIds.slice(i, i + CHUNK_SIZE);
          await productsService.bulkDelete(chunk);
        }

        dispatch({ type: 'SET_PRODUCTS', payload: state.products.filter((p: Product) => !selectedProductIds.includes(p.id)) });
        setSelectedProductIds([]);
        sonner.success('Bulk deletion completed');
      } catch (error) {
        console.error('Bulk Delete Error:', error);
        sonner.error('Failed to bulk delete products. Please try again.');
      } finally {
        sonner.close();
      }
    }
  };

  const handleExportSelected = () => {
    if (selectedProductIds.length === 0) return;
    const selectedProducts = state.products.filter(p => selectedProductIds.includes(p.id));

    const exportData = {
      version: '2.0',
      timestamp: new Date().toISOString(),
      data: {
        products: selectedProducts
      }
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Zaynahs_Inventory_Products_${new Date().toLocaleDateString('en-CA')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    sonner.success('Inventory exported to JSON backup');
  };

  const handleViewBill = async (saleId: string) => {
    const { localDb } = await import('../../lib/localDb');
    const sale = await (localDb as any).sales.get(saleId);
    if (sale) {
      setViewingSale(sale);
    } else {
      sonner.error('Could not find sale record');
    }
  };


  const handleImportJSON = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      sonner.loading('Reading file...');
      const text = await file.text();
      let importData;
      try {
        importData = JSON.parse(text);
      } catch (e) {
        throw new Error('Invalid JSON file. Please ensure the file is a valid JSON export.');
      }

      // Validate structure (check for version 2.0 or data.products array or direct array)
      let products = importData.data?.products || importData.products || (Array.isArray(importData) ? importData : null);

      if (!products || !Array.isArray(products)) {
        throw new Error('Invalid file format. Please use a standard Zaynahs Inventory export.');
      }

      const confirmed = await sonner.confirm(
        'Bulk Import?',
        `Found ${products.length} products. This will add them to your inventory. Proceed?`
      );

      if (!confirmed.isConfirmed) {
        sonner.dismissAll();
        return;
      }

      sonner.loading(`Importing ${products.length} products...`);

      const now = new Date();

      // Get all existing products in local db to check for duplicates quickly (Rule F1)
      const allLocalProducts = await localDb.products.toArray();
      const existingNames = new Set(allLocalProducts.map(p => p.name.trim().toLowerCase()));

      const duplicates: string[] = [];
      const productsToCreate: any[] = [];

      for (const p of products) {
        const nameClean = (p.name || '').trim().toLowerCase();
        if (existingNames.has(nameClean)) {
          duplicates.push(p.name);
        } else {
          productsToCreate.push(p);
        }
      }

      if (duplicates.length > 0) {
        const proceedWithoutDups = await sonner.confirm(
          'Duplicates Detected',
          `Skipped ${duplicates.length} products that already exist by name. Import the remaining ${productsToCreate.length} new products?`
        );
        if (!proceedWithoutDups.isConfirmed) {
          sonner.dismissAll();
          return;
        }
      }

      if (productsToCreate.length === 0) {
        sonner.dismissAll();
        await sonner.alert('Import Skipped', 'All products in the file already exist.', 'OK');
        return;
      }

      sonner.loading(`Importing ${productsToCreate.length} products...`);

      const newlyCreatedProducts: Product[] = [];
      for (const p of productsToCreate) {
        const payload = {
          name: p.name,
          sku: p.sku || '',
          barcode: p.barcode || '',
          barcodeValue: p.barcodeValue || p.barcode || '',
          category: p.category || 'Uncategorized',
          supplier: p.supplier || '',
          cost: Number(p.cost) || 0,
          price: Number(p.price) || 0,
          pricePerUnit: Number(p.pricePerUnit) || 0,
          stock: Number(p.stock) || 0,
          minStock: Number(p.minStock) || 5,
          trackInventory: p.trackInventory !== false,
          isService: p.isService === true,
          requireSerial: p.requireSerial === true,
          isWeightBased: p.isWeightBased === true,
          unit: p.unit || 'pcs',
          image: p.image || '',
          active: p.active !== false,
          variants: p.variants || [],
          modifiers: p.modifiers || []
        };

        // Call productsService.create to handle duplicate checks, batches, stock history, localDb and sync queueing
        const created = await productsService.create(payload as any);
        newlyCreatedProducts.push(created);
      }

      dispatch({ type: 'ADD_PRODUCTS_BULK', payload: newlyCreatedProducts });

      sonner.dismissAll();
      await sonner.alert(
        'Import Successful',
        `Successfully imported ${newlyCreatedProducts.length} products to your inventory and synchronized their stock structure.`,
        'Great!'
      );
    } catch (err: any) {
      console.error('Import Error:', err);
      sonner.dismissAll();
      sonner.alert('Import Failed', err.message || 'The file is corrupted or in an invalid format.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };




  // ─── All views rendered in a single return to prevent unmount on sync ───
  // CRITICAL FIX: Old code used early `if (x) { return (...) }` which caused
  // the component to switch render trees on every state.products update (sync),
  // unmounting ProductDetailHub/ProductModal and closing all inner popups.
  const freshProduct = detailProduct
    ? (state.products.find(p => p.id === detailProduct.id) || detailProduct)
    : null;

  return (
    <>
      {/* ─── Product Detail Hub (overlay, stays mounted) ─── */}
      {detailProduct && freshProduct && (
        <div className="main-content-scroll p-1 sm:p-4 lg:p-6 bg-gray-50 dark:bg-app font-sans w-full max-w-[1400px] mx-auto">
          <ProductDetailHub
            product={freshProduct}
            onBack={() => {
              setDetailProduct(null);
              const navState = location.state as { fromSale?: string } | null;
              if (navState?.fromSale) {
                dispatch({ type: 'SET_PENDING_RETURN_SALE_ID', payload: navState.fromSale });
                navigate('/transactions');
              } else if (state.pendingReturnTab) {
                const targetTab = state.pendingReturnTab;
                dispatch({ type: 'SET_PENDING_RETURN_TAB', payload: null });
                window.dispatchEvent(new CustomEvent('navigate', { detail: targetTab }));
              }
            }}
            onEdit={() => { }}
          />
        </div>
      )}

      {/* ─── Barcode Generator Page Mode ─── */}
      {showBarcodeGenerator && (
        <div className="fixed inset-0 z-[450] bg-white dark:bg-surface animate-in fade-in zoom-in-95 duration-300 flex flex-col">
          <div className="flex-shrink-0 flex items-center gap-4 px-4 py-2.5 border-b border-gray-200 dark:border-white/10 bg-white dark:bg-app">
            <button
              onClick={() => {
                setShowBarcodeGenerator(false);
                setBarcodeProducts([]);
                setSelectedProductIds([]);
                clearPersistedBarcodeState();
                localStorage.removeItem('barcode_selected_product_ids');
                localStorage.removeItem('barcode_selected_quantities');
                localStorage.removeItem('barcode_show_generator');
              }}
              className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl text-gray-600 dark:text-gray-400 active:scale-95 transition-all flex items-center gap-1"
            >
              <ChevronLeft className="h-5 w-5" />
              <span className="text-[10px] font-black uppercase tracking-widest">{t("back", "Back")}</span>
            </button>
            <div className="h-6 w-px bg-gray-200 dark:bg-white/10 mx-1" />
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest opacity-60">Management / Barcode Print Engine</p>
          </div>
          <div className="flex-1 min-h-0">
            <BarcodeGenerator
              products={barcodeProducts}
              onClose={() => {
                setShowBarcodeGenerator(false);
                setBarcodeProducts([]);
                setSelectedProductIds([]);
                clearPersistedBarcodeState();
                localStorage.removeItem('barcode_selected_product_ids');
                localStorage.removeItem('barcode_selected_quantities');
                localStorage.removeItem('barcode_show_generator');
              }}
              onProductsChange={(next) => {
                const nextIds = next.map(p => p.id);
                setSelectedProductIds(nextIds);
              }}
            />
          </div>
        </div>
      )}

      {/* ─── Product Editor Page Mode ─── */}
      {showProductModal && (
        <div className="main-content-scroll p-1 sm:p-4 lg:p-6 bg-gray-50 dark:bg-app font-sans w-full max-w-[1400px] mx-auto">
          <ProductModal
            product={editingProduct}
            isOpen={true}
            onClose={() => {
              setShowProductModal(false);
              setEditingProduct(null);
            }}
          />
        </div>
      )}

      {/* ─── Main Inventory List (hidden when detail/editor/barcode is open) ─── */}
      {!detailProduct && !showProductModal && !showBarcodeGenerator && (
        <div className="main-content-scroll p-1 sm:p-4 lg:p-6 space-y-3 lg:space-y-6 bg-gray-50 dark:bg-app max-w-[1400px] mx-auto">

      {/* Layer 1: Identity & Hub Navigation (Smart Stack) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6 pb-0 sm:pb-2">
        <div className="flex flex-col md:flex-row md:items-center gap-4 sm:gap-6 xl:gap-10">
          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'pos' }))}
              className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl text-gray-600 dark:text-gray-400 active:scale-95 transition-all flex items-center gap-1 mr-1"
            >
              <ChevronLeft className="h-5 w-5" />
              <span className="hidden sm:inline text-[10px] font-black uppercase tracking-widest">{t("back", "Back")}</span>
            </button>
            <div className="h-8 w-px bg-gray-200 dark:bg-white/10 mx-1 hidden sm:block" />
            <div className="h-10 w-10 sm:h-12 sm:w-12 bg-primary/10 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-inner border border-primary/10">
              <Package className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            </div>
            <div className="shrink-0 flex flex-col">
              <h1 className="text-lg sm:text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tighter leading-none">{t("inventory", "Inventory")}</h1>
              <p className="hidden sm:block text-gray-600 dark:text-gray-400 text-[9px] font-black uppercase tracking-[0.2em] mt-1 opacity-60">{t("manage_stock", "Manage Stock")}</p>
            </div>
          </div>

          <div className="chip-nav-container overflow-x-auto flex-nowrap">
            {[
              { id: 'inventory', label: t("products", "PRODUCTS"), icon: Package, color: 'bg-primary', show: true },
              { id: 'purchases', label: t("history", "HISTORY"), icon: History, color: 'bg-blue-600', show: canViewRecords },
              { id: 'purchase_orders', label: t("restock", "RESTOCK"), icon: ClipboardList, color: 'bg-rose-600', show: state.settings.enablePurchaseOrders !== false && canManagePO },
              { id: 'bundles', label: t("bundles_and_deals", "BUNDLES & DEALS"), icon: Gift, color: 'bg-violet-600', show: true },
              { id: 'groups', label: t("groups", "GROUPS"), icon: Layers, color: 'bg-indigo-600', show: true },
              { id: 'media', label: t("media", "MEDIA"), icon: Camera, color: 'bg-amber-600', show: true },
            ].filter(t => t.show).map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => navigate('/inventory/' + INTERNAL_TO_SUB_TAB_SEGMENT[tab.id])}
                  className={`chip-nav-item ${isActive ? `${tab.color} text-white shadow-lg` : 'text-gray-600'}`}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {activeTab === 'inventory' ? (
        <>
          {/* Grid Stats - Premium Mobile Layout */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 mt-2">
            {[
              { label: t("active_items", "Active Items"), value: state.products.length, icon: Package, color: 'from-blue-600 to-indigo-700' },
              { label: t("low_stock", "Low Stock"), value: lowStockProducts.length, icon: AlertTriangle, color: 'from-amber-500 to-orange-700' },
              { label: t("stock_value", "Stock Value"), value: formatCurrency(totalValue, state.settings.currency), icon: TrendingUp, color: 'from-emerald-500 to-teal-700' },
              { label: t("out_of_stock", "Out of Stock"), value: outOfStockProducts.length, icon: TrendingDown, color: 'from-rose-500 to-red-700' },
            ].map((stat, i) => (
              <div key={i} className={`stat-card bg-gradient-to-br ${stat.color} shadow-lg shadow-black/5`}>
                <div className="stat-card-inner">
                  <span className="stat-card-label">{stat.label}</span>
                  <span className="stat-card-value">{stat.value}</span>
                </div>
                <stat.icon className="stat-card-icon h-12 w-12 text-white" />
              </div>
            ))}
          </div>

          {/* Action Toolbar - Mobile Optimized */}
          <div className="relative z-30 bg-white/50 dark:bg-black/20 p-2.5 lg:p-4 rounded-2xl lg:rounded-[1.75rem] border border-gray-200/50 dark:border-white/5 shadow-xl ring-1 ring-black/5 dark:ring-white/5">
            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
              {/* Contextual Actions Grid */}
              <div className="grid grid-cols-2 sm:flex items-center gap-2 order-2 lg:order-1">
                {canManageStock && (
                  <>
                    <button
                      onClick={() => { setEditingProduct(null); setShowProductModal(true); }}
                      className="col-span-2 sm:col-auto flex items-center justify-center gap-2 bg-primary text-white px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl font-black text-[9px] sm:text-[10px] shadow-lg shadow-emerald-500/20 hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-widest"
                    >
                      <Plus className="h-3.5 w-3.5" /> <span>{t("add_product", "Add Item")}</span>
                    </button>
                    <button onClick={handleImportJSON} className="flex items-center justify-center gap-2 px-4 py-2.5 text-[9px] font-black bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-all active:scale-95 uppercase tracking-widest">
                      <Upload className="h-4 w-4" /> <span>{t("import", "Import")}</span>
                    </button>
                    <button onClick={handleExportSelected} className="flex items-center justify-center gap-2 px-4 py-2.5 text-[9px] font-black bg-emerald-50 dark:bg-primary/10 border border-emerald-100 dark:border-primary/20 text-primary dark:text-emerald-400 rounded-xl transition-all active:scale-95 uppercase tracking-widest">
                      <Download className="h-4 w-4" /> <span>{t("export", "Export")}</span>
                    </button>
                  </>
                )}
              </div>

              {/* Search Box */}
              <div className="relative flex-1 order-1 lg:order-2">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-primary h-4 w-4 transition-colors" />
                <input
                  type="text"
                  placeholder={t("search_products_placeholder", "Search name, barcode, SKU...")}
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="w-full bg-gray-50 dark:bg-black/30 border-none pl-10 pr-12 py-2.5 rounded-xl sm:rounded-2xl text-xs font-bold focus:ring-2 focus:ring-emerald-500 transition-all placeholder:text-gray-600 focus:bg-white dark:focus:bg-black/75 shadow-inner"
                />
                <button
                  onClick={() => setShowScannerInInventory(true)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 bg-primary/10 text-primary rounded-lg active:bg-primary active:text-white transition-all"
                  title="Scan with Camera"
                >
                  <Camera className="h-4 w-4" />
                </button>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2 order-3">
                <SearchableSelect
                  options={categories.map(c => ({ id: c, label: c === 'All' ? t("categories_all", "Categories: All") : c }))}
                  value={selectedCategory}
                  onChange={val => { setSelectedCategory(val); setCurrentPage(1); }}
                  placeholder={t("category", "Category")}
                />
                <SearchableSelect
                  options={[
                    { id: 'All', label: t("type_all", "Type: All Items") },
                    { id: 'standard', label: t("type_standard", "Type: Standard Products") },
                    { id: 'services', label: t("type_services", "Type: Service Items") },
                    { id: 'serialized', label: t("type_serialized", "Type: IMEI / Serialized") }
                  ]}
                  value={selectedType}
                  onChange={val => { setSelectedType(val); setCurrentPage(1); }}
                  placeholder={t("type", "Item Type")}
                />
                <SearchableSelect
                  options={[
                    { id: 'name-asc', label: t("sort_az", "Sort: A-Z") },
                    { id: 'name-desc', label: t("sort_za", "Sort: Z-A") },
                    { id: 'stock-asc', label: t("stock_low", "Stock: Low") },
                    { id: 'stock-desc', label: t("stock_high", "Stock: High") }
                  ]}
                  value={`${sortBy}-${sortOrder}`}
                  onChange={val => {
                    const [field, order] = val.split('-');
                    setSortBy(field as 'name' | 'stock' | 'price');
                    setSortOrder(order as 'asc' | 'desc');
                  }}
                  placeholder={t("sort", "Sort")}
                  align="right"
                />
              </div>
            </div>

            {/* Bulk Actions Bar (Visible when selected) */}
            {canManageStock && selectedProductIds.length > 0 && (
              <div className="flex items-center gap-2 mt-3 p-1 bg-gray-900 dark:bg-black border border-white/10 rounded-2xl animate-in slide-in-from-bottom-2 duration-300 overflow-x-auto scrollbar-hide shadow-2xl">
                <div className="flex flex-col items-center justify-center px-4 py-1 border-r border-white/10 shrink-0">
                  <span className="text-[11px] font-black text-primary leading-none">{selectedProductIds.length}</span>
                  <span className="text-[7px] font-black text-primary/50 uppercase tracking-tighter">Selected</span>
                </div>

                <div className="flex items-center gap-1 p-1 pr-3">
                  <button onClick={() => setShowBulkEditModal(true)} className="flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase text-blue-400 hover:bg-blue-500/10 rounded-xl transition-all active:scale-95 whitespace-nowrap">
                    <Layers className="h-3.5 w-3.5" /> <span className="hidden sm:inline">BULK EDIT</span><span className="sm:hidden">EDIT</span>
                  </button>
                  <button onClick={handleBulkDelete} className="flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase text-red-400 hover:bg-red-500/10 rounded-xl transition-all active:scale-95 whitespace-nowrap">
                    <Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">DELETE</span><span className="sm:hidden">DEL</span>
                  </button>
                  <button onClick={() => {
                    setBarcodeProducts(state.products.filter(p => selectedProductIds.includes(p.id)));
                    setShowBarcodeGenerator(true);
                  }} className="flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase text-emerald-400 hover:bg-primary/10 rounded-xl transition-all active:scale-95 whitespace-nowrap">
                    <Printer className="h-3.5 w-3.5" /> <span className="hidden sm:inline">PRINT BARCODES</span><span className="sm:hidden">BARCODE</span>
                  </button>
                </div>
              </div>
            )}
          </div>


          {/* Products View */}
          <div className="bg-white dark:bg-surface rounded-3xl border border-gray-200 dark:border-white/5 overflow-hidden shadow-xl">
            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left border-collapse table-fixed">
                <thead>
                  <tr className="bg-gray-50/50 dark:bg-white/[0.02] border-b border-gray-200 dark:border-white/5">
                    <th className="p-4 w-12 cursor-pointer" onClick={handleSelectAll}>
                      {selectedProductIds.length > 0 && selectedProductIds.length === filteredProducts.length
                        ? <CheckSquare className="h-5 w-5 text-primary" />
                        : selectedProductIds.length > 0
                          ? <MinusSquare className="h-5 w-5 text-emerald-400" />
                          : <Square className="h-5 w-5 text-gray-600" />}
                    </th>
                    <th className="p-4 text-[10px] font-black uppercase text-gray-700 dark:text-gray-400 tracking-widest text-left w-[32%]">{t("item", "ITEM")}</th>
                    <th className="p-4 text-[10px] font-black uppercase text-gray-700 dark:text-gray-400 tracking-widest text-left hidden lg:table-cell w-[20%]">{t("sku", "IDENTIFIER")}</th>
                    <th className="p-4 text-[10px] font-black uppercase text-gray-700 dark:text-gray-400 tracking-widest text-center hidden lg:table-cell w-[14%]">{t("barcode", "BARCODE")}</th>
                    <th className="p-4 text-[10px] font-black uppercase text-gray-700 dark:text-gray-400 tracking-widest text-left w-[13%]">{t("price", "PRICING")}</th>
                    <th className="p-4 text-[10px] font-black uppercase text-gray-700 dark:text-gray-400 tracking-widest text-center w-[11%]">{t("stock", "STOCK STATUS")}</th>
                    <th className="p-4 text-[10px] font-black uppercase text-gray-700 dark:text-gray-400 tracking-widest text-right w-[10%]">{t("actions", "Actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                  {paginatedProducts.map(product => (
                    <tr key={product.id} className={`group hover:bg-gray-50 dark:hover:bg-white/[0.01] transition-colors ${selectedProductIds.includes(product.id) ? 'bg-primary/5' : ''} ${!product.active ? 'opacity-50' : ''}`}>
                      <td className="p-4 cursor-pointer" onClick={() => handleSelectProduct(product.id)}>
                        {selectedProductIds.includes(product.id) ? <CheckSquare className="h-5 w-5 text-primary" /> : <Square className="h-5 w-5 text-gray-600" />}
                      </td>
                      <td className="p-4 text-left">
                        <div className="flex items-center gap-4 cursor-pointer group" onClick={() => handleEditProduct(product)}>
                          <div className="h-10 w-10 bg-gray-100 dark:bg-white/5 rounded-xl flex items-center justify-center overflow-hidden border border-white/5 shadow-inner shrink-0">
                            {product.image ? <img src={product.image} className="h-full w-full object-cover transition-transform group-hover:scale-110" /> : <Package className="h-5 w-5 text-gray-600" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-black text-gray-900 dark:text-white uppercase text-xs truncate max-w-[200px] group-hover:text-primary transition-colors">{product.name} {product.isFeatured && <Star className="h-2.5 w-2.5 inline text-yellow-500 fill-yellow-500 mb-1" />}</p>
                            <p className="text-[10px] text-gray-600 font-bold uppercase truncate">{product.category}{product.supplier ? ` · ${product.supplier}` : ''}</p>
                            {(product.isService || product.requireSerial) && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {product.isService && <span className="text-[8px] font-black uppercase tracking-widest bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded leading-none">Service</span>}
                                {product.requireSerial && <span className="text-[8px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded leading-none">IMEI/SN Req</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="p-4 text-left font-mono text-[10px] text-gray-600 hidden lg:table-cell">
                        <div className="truncate max-w-[150px] xl:max-w-[180px]" title={product.sku}>
                          {product.sku}
                        </div>
                      </td>
                      <td className="p-4 text-center hidden lg:table-cell">
                        <div className="inline-flex justify-center w-full">
                          <BarcodePreview value={product.barcodeValue || product.barcode || ''} inline={true} />
                        </div>
                      </td>
                      <td className="p-4 text-left">
                        <p className="text-xs font-black text-gray-900 dark:text-white tracking-widest">{formatCurrency(product.price, state.settings.currency)}</p>
                        {(profile?.role === 'admin' || profile?.role === 'manager') && <p className="text-[9px] text-gray-600 uppercase font-black opacity-50">Cost: {formatCurrency(product.cost || 0, state.settings.currency)}</p>}
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          {product.trackInventory === false || product.stock >= 990000 ? (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400">∞</span>
                          ) : (
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${product.stock <= 0 ? 'bg-red-500 text-white shadow-sm ring-1 ring-red-600' : product.stock <= (product.minStock || 5) ? 'bg-amber-500 text-white shadow-sm ring-1 ring-amber-600' : 'bg-primary/10 text-primary dark:text-emerald-400'}`}>{product.stock}</span>
                          )}
                          {!product.active && <span className="text-[8px] bg-gray-200 dark:bg-white/10 px-1.5 py-0.5 rounded uppercase font-bold text-gray-600 dark:text-gray-400">Disabled</span>}
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end items-center gap-2 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Enable / Disable Toggle */}
                          {(isAdmin || profile?.canManageStock) && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  const updated = { ...product, active: !product.active, updatedAt: new Date() };
                                  await productsService.update(product.id, updated);
                                  dispatch({ type: 'UPDATE_PRODUCT', payload: updated });
                                  sonner.success(updated.active ? 'Product enabled' : 'Product disabled');
                                } catch {
                                  sonner.error('Failed to toggle product status');
                                }
                              }}
                              className={`p-2 rounded-xl transition-all hover:scale-110 active:scale-95 ${
                                product.active
                                  ? 'bg-primary/10 text-primary'
                                  : 'bg-gray-200 dark:bg-white/10 text-gray-500'
                              }`}
                              title={product.active ? 'Disable Product' : 'Enable Product'}
                            >
                              <Power className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {/* Featured Toggle */}
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              const newStatus = !product.isFeatured;
                              try {
                                const updated = { ...product, isFeatured: newStatus, updatedAt: new Date() };
                                await productsService.update(product.id, updated);
                                dispatch({ type: 'UPDATE_PRODUCT', payload: updated });
                              } catch (error) {
                                sonner.error('Failed to toggle featured status');
                              }
                            }}
                            className={`p-2 rounded-xl transition-all hover:scale-110 active:scale-95 ${product.isFeatured ? 'bg-yellow-500/10 text-yellow-500 shadow-sm' : 'bg-gray-100 dark:bg-white/5 text-gray-600 hover:text-yellow-500'}`}
                            title={product.isFeatured ? 'Unmark Featured' : 'Mark as Featured'}
                          >
                            <Star className={`h-3.5 w-3.5 ${product.isFeatured ? 'fill-yellow-500' : ''}`} />
                          </button>
                          {(isAdmin || profile?.canManageStock) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteProduct(product.id);
                              }}
                              className="p-2 bg-red-50 dark:bg-red-500/10 text-red-600 rounded-xl hover:scale-110 active:scale-95 transition-transform"
                              title="Delete Product"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View (Expert Density) */}
            <div className="lg:hidden p-3 sm:p-4">
              {/* Select All on Mobile */}
              {paginatedProducts.length > 0 && (
                <div className="flex items-center justify-between mb-3 bg-gray-50/50 dark:bg-white/[0.02] p-2 rounded-xl">
                  <button
                    onClick={handleSelectAll}
                    className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-600 dark:text-gray-400 active:scale-95 transition-all"
                  >
                    {selectedProductIds.length > 0 && selectedProductIds.length === filteredProducts.length
                      ? <CheckSquare className="h-4 w-4 text-primary" />
                      : selectedProductIds.length > 0
                        ? <MinusSquare className="h-4 w-4 text-emerald-400" />
                        : <Square className="h-4 w-4 text-gray-600" />}
                    Select All
                  </button>
                  <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">{selectedProductIds.length} {t("selected", "Selected")}</span>
                </div>
              )}
              {paginatedProducts.length === 0 ? (
                <div className="text-center py-10 text-gray-600 font-bold uppercase tracking-widest text-xs">{t("no_products_found", "No products found")}</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-4">
                  {paginatedProducts.map(product => (
                    <div
                      key={product.id}
                      onClick={() => handleEditProduct(product)}
                      className={`relative flex flex-col p-2.5 sm:p-4 rounded-[1.5rem] bg-white dark:bg-surface border border-gray-200 dark:border-white/5 shadow-sm active:scale-[0.98] transition-all group ${selectedProductIds.includes(product.id) ? 'ring-2 ring-emerald-500 bg-primary/5' : ''}`}
                    >
                      {/* Selection Toggle */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSelectProduct(product.id); }}
                        className="absolute top-1.5 right-1.5 z-20"
                      >
                        {selectedProductIds.includes(product.id) ? (
                          <div className="bg-primary rounded-lg p-1.5 shadow-lg shadow-emerald-500/30">
                            <CheckSquare className="h-3.5 w-3.5 text-white" />
                          </div>
                        ) : (
                          <div className="bg-white/90 dark:bg-black/75 rounded-lg p-1.5 border border-gray-200 dark:border-white/20 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                            <Square className="h-3.5 w-3.5 text-gray-600" />
                          </div>
                        )}
                      </button>

                      <div className="flex flex-col gap-2.5">
                        <div className="aspect-square w-full bg-gray-50 dark:bg-[#0F0F0F] rounded-xl flex items-center justify-center overflow-hidden border border-gray-200 dark:border-white/5 flex-shrink-0 relative">
                          {product.image ? (
                            <img src={product.image} className="h-full w-full object-cover" />
                          ) : (
                            <Package className="h-6 w-6 text-gray-600" />
                          )}
                          {product.isFeatured && (
                            <div className="absolute bottom-1 right-1 bg-yellow-500 rounded-md p-1 shadow-md">
                              <Star className="h-2 w-2 text-white fill-white" />
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1 flex flex-col">
                          <h3 className="font-black text-gray-900 dark:text-white uppercase text-[10px] leading-tight truncate">
                            {product.name}
                          </h3>
                          <p className="text-[8px] text-gray-600 dark:text-gray-400 font-bold uppercase tracking-tight truncate mb-1">
                            {product.category}
                          </p>
                          {(product.isService || product.requireSerial || !product.active) && (
                            <div className="flex flex-wrap gap-1 mb-1.5">
                              {product.isService && <span className="text-[7px] font-black uppercase tracking-widest bg-blue-500/10 text-blue-500 px-1 py-0.5 rounded leading-none">Service</span>}
                              {product.requireSerial && <span className="text-[7px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-500 px-1 py-0.5 rounded leading-none">IMEI / SN</span>}
                              {!product.active && <span className="text-[7px] font-black uppercase tracking-widest bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-400 px-1 py-0.5 rounded leading-none">Disabled</span>}
                            </div>
                          )}

                          <div className="mt-auto space-y-1.5 pt-1.5 border-t border-gray-200 dark:border-white/5">
                            <div className="flex items-center justify-between gap-1">
                              <p className="text-[11px] font-black text-primary">
                                {formatCurrency(product.price, state.settings.currency)}
                              </p>
                              <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md ${product.stock <= 0 ? 'bg-red-500 text-white' : product.stock <= (product.minStock || 5) ? 'bg-amber-500 text-white' : 'bg-primary/10 text-primary'}`}>
                                {product.trackInventory === false || product.stock >= 990000 ? '∞' : product.stock}
                              </span>
                            </div>
                            {(profile?.role === 'admin' || profile?.role === 'manager') && (
                              <div className="flex items-center justify-between opacity-50">
                                <span className="text-[7px] font-black text-gray-600 dark:text-gray-500 uppercase">{t("cost", "Cost")}</span>
                                <span className="text-[7px] font-black text-gray-600 dark:text-gray-400">{formatCurrency(product.cost || 0, state.settings.currency)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Premium Pagination Footer */}
            {totalPages > 1 && (
              <div className="p-4 bg-gray-50/50 dark:bg-white/[0.02] border-t border-gray-200 dark:border-white/5 flex items-center justify-between gap-4">
                <p className="hidden sm:block text-[10px] font-black text-gray-600 uppercase tracking-widest italic truncate">Items {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredProducts.length)} of {filteredProducts.length}</p>
                <div className="flex items-center gap-1.5 mx-auto sm:mx-0">
                  <button disabled={currentPage === 1} onClick={() => { setCurrentPage(prev => Math.max(1, prev - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="p-2 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400 rounded-xl disabled:opacity-30 hover:bg-primary hover:text-white transition-all shadow-sm"><ChevronLeft className="h-4 w-4" /></button>

                  <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide max-w-[200px] sm:max-w-none py-2 px-1">
                    {[...Array(totalPages)].map((_, i) => {
                      const page = i + 1;
                      const isNear = Math.abs(page - currentPage) <= 1;
                      const isEnd = page === 1 || page === totalPages;

                      if (!isNear && !isEnd) {
                        if (page === 2 || page === totalPages - 1) return <span key={page} className="text-gray-600 px-1">...</span>;
                        return null;
                      }

                      return (
                        <button
                          key={page}
                          onClick={() => { setCurrentPage(page); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                          className={`min-w-[32px] h-8 rounded-lg text-[10px] font-black transition-all ${currentPage === page ? 'bg-primary text-white shadow-lg scale-110 relative z-10' : 'text-gray-600 hover:bg-gray-100 dark:hover:bg-white/5 relative z-0'}`}
                        >
                          {page}
                        </button>
                      );
                    })}
                  </div>

                  <button disabled={currentPage === totalPages} onClick={() => { setCurrentPage(prev => Math.min(totalPages, prev + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="p-2 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400 rounded-xl disabled:opacity-30 hover:bg-primary hover:text-white transition-all shadow-sm"><ChevronRight className="h-4 w-4" /></button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : activeTab === 'purchase_orders' ? (
        canManagePO ? <PurchaseOrderSystem /> : <div className="p-20 text-center uppercase font-black text-gray-600">Access Denied</div>
      ) : activeTab === 'purchases' ? (
        canViewRecords ? (
          <PurchaseHistory />
        ) : <div className="p-20 text-center uppercase font-black text-gray-600">Access Denied</div>
      ) : activeTab === 'bundles' ? (
        <div>
          <BundleManager />
        </div>
      ) : activeTab === 'groups' ? (
        <div className="space-y-6">
          <div className="bg-white dark:bg-surface rounded-3xl border border-gray-200 dark:border-white/5 overflow-hidden shadow-xl">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/50 dark:bg-white/[0.02]">
                    <th className="p-4 text-xs font-bold uppercase text-gray-600 tracking-widest text-center">Identity</th>
                    <th className="p-4 text-xs font-bold uppercase text-gray-600 tracking-widest text-center">Items</th>
                    <th className="p-4 text-xs font-bold uppercase text-gray-600 tracking-widest text-center">Total Stock</th>
                    <th className="p-4 text-xs font-bold uppercase text-gray-600 tracking-widest text-center">In Stock Value</th>
                    <th className="p-4 text-xs font-bold uppercase text-gray-600 tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                  {categories.filter(c => c !== 'All').map(cat => {
                    const productsInCat = state.products.filter(p => p.category === cat);
                    const stockInCat = productsInCat.reduce((sum, p) => sum + (p.trackInventory === false || p.stock >= 990000 ? 0 : (p.stock || 0)), 0);
                    const valueInCat = productsInCat.reduce((sum, p) => sum + (p.trackInventory === false || p.stock >= 990000 ? 0 : ((p.stock || 0) * (p.cost || 0))), 0);

                    return (
                      <tr key={cat} className="group hover:bg-gray-50 dark:hover:bg-white/[0.01] transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 bg-emerald-50 dark:bg-primary/10 rounded-xl flex items-center justify-center">
                              <Layers className="h-5 w-5 text-primary" />
                            </div>
                            <p className="font-black text-gray-900 dark:text-white uppercase text-xs">{cat}</p>
                          </div>
                        </td>
                        <td className="p-4 text-center font-bold text-gray-700 dark:text-gray-300">{productsInCat.length} Products</td>
                        <td className="p-4 text-center">
                          <span className="bg-blue-50 dark:bg-blue-500/10 text-blue-600 px-3 py-1 rounded-full text-[10px] font-black">{stockInCat}</span>
                        </td>
                        <td className="p-4 text-center font-black text-gray-900 dark:text-white">{formatCurrency(valueInCat, state.settings.currency)}</td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => { setSelectedCategory(cat); navigate('/inventory/products'); }}
                            className="text-[10px] font-black uppercase text-primary hover:underline"
                          >
                            View All
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View for Groups */}
            <div className="space-y-3 pt-2 md:hidden">
              {categories.filter(c => c !== 'All').map(cat => {
                const productsInCat = state.products.filter(p => p.category === cat);
                const stockInCat = productsInCat.reduce((sum, p) => sum + (p.trackInventory === false || p.stock >= 990000 ? 0 : (p.stock || 0)), 0);
                const valueInCat = productsInCat.reduce((sum, p) => sum + (p.trackInventory === false || p.stock >= 990000 ? 0 : ((p.stock || 0) * (p.cost || 0))), 0);

                return (
                  <div key={cat} onClick={() => { setSelectedCategory(cat); navigate('/inventory/products'); }} className="p-4 bg-gray-50 dark:bg-black/20 rounded-[2rem] border border-gray-200 dark:border-white/5 active:scale-95 transition-all">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center">
                          <Layers className="h-5 w-5 text-primary" />
                        </div>
                        <p className="font-black text-gray-900 dark:text-white uppercase text-xs">{cat}</p>
                      </div>
                      <span className="text-[10px] font-black text-primary uppercase tracking-widest">VIEW →</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="p-2 rounded-xl bg-white dark:bg-white/5 text-center">
                        <p className="text-[8px] font-black text-gray-600 uppercase mb-0.5">Items</p>
                        <p className="text-xs font-black text-gray-900 dark:text-white">{productsInCat.length}</p>
                      </div>
                      <div className="p-2 rounded-xl bg-white dark:bg-white/5 text-center">
                        <p className="text-[8px] font-black text-gray-600 uppercase mb-0.5">Stock</p>
                        <p className="text-xs font-black text-blue-500">{stockInCat}</p>
                      </div>
                      <div className="p-2 rounded-xl bg-white dark:bg-white/5 text-center col-span-1">
                        <p className="text-[8px] font-black text-gray-600 uppercase mb-0.5">Value</p>
                        <p className="text-[10px] font-black text-gray-900 dark:text-white truncate">{formatCurrency(valueInCat, state.settings.currency)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : activeTab === 'suppliers' ? (
        <SupplierManager />
      ) : (
        <MediaLibrary
          isOpen={true}
          onClose={() => navigate('/inventory/products')}
          onSelect={() => { }} // Standalone mode
          standalone={true}
        />
      )}

        <BulkEditModal selectedIds={selectedProductIds} isOpen={showBulkEditModal} onClose={() => setShowBulkEditModal(false)} categories={categories} suppliers={suppliers} />

        {viewingSale && (
          <ReceiptPrint
            sale={viewingSale}
            onClose={() => setViewingSale(null)}
          />
        )}

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".json"
          style={{ display: 'none' }}
        />
      </div>
      )} {/* end !detailProduct && !showProductModal && !showBarcodeGenerator */}
    </>
  );
}