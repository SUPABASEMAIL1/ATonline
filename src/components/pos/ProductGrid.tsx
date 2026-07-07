import { useState, useRef, useEffect } from 'react';
import { Search, Plus, Minus, Package, X, ChevronLeft, ChevronRight, FileText, Star, Infinity, Camera, LayoutGrid, Gift, ChevronDown, ChevronUp } from 'lucide-react';
import { CameraScanner } from '../common/CameraScanner';
import { Product } from '../../types';
import { useApp } from '../../context/SupabaseAppContext';
import { getCurrencySymbol } from '../../lib/currencies';
import { settingsService, bundlesService } from '../../lib/services';
import { sonner } from '../../lib/sonner';
import { useTranslation } from '../../hooks/useTranslation';

interface ProductGridProps {
  onAddToCart: (product: Product, weight?: number) => void;
  onOpenDrafts?: () => void;
  onAddTab?: () => void;
  isReturnMode?: boolean;
}

/**
 * v50 Optimized Product Grid
 * Features: Immediate search response, Category bypass on search, Featured sorting, and Integrated density control.
 */
export function ProductGrid({ onAddToCart, onOpenDrafts, onAddTab, isReturnMode = false }: ProductGridProps) {
  const { state, dispatch } = useApp();
  const { t } = useTranslation();

  // Safety check to prevent black screen
  if (!state?.settings || !state?.products) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Featured');
  const prevSearchRef = useRef('');
  const categoriesRef = useRef<HTMLDivElement>(null);
  const [showLeftScroll, setShowLeftScroll] = useState(false);
  const [showRightScroll, setShowRightScroll] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // AGGRESSIVE FOCUS MANAGEMENT
  useEffect(() => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 0 && /Macintosh/i.test(navigator.userAgent));

    if (isMobile) return;

    const focusSearch = () => searchRef.current?.focus({ preventScroll: true });
    focusSearch();
    setTimeout(focusSearch, 100);
    setTimeout(focusSearch, 500);

    window.addEventListener('focus', focusSearch);

    const handleGlobalClick = () => {
      if (document.querySelector('.fixed.inset-0')) return;

      if (
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        document.activeElement?.tagName !== 'SELECT'
      ) {
        focusSearch();
      }
    };
    document.addEventListener('click', handleGlobalClick);

    const handleGlobalKeydown = (e: KeyboardEvent) => {
      if (document.querySelector('.fixed.inset-0')) return;

      if (
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        document.activeElement?.tagName !== 'SELECT' &&
        e.key.length === 1
      ) {
        focusSearch();
      }
    };
    document.addEventListener('keydown', handleGlobalKeydown, { capture: true });

    const handleManualRefocus = () => focusSearch();
    window.addEventListener('refocus-search', handleManualRefocus);

    return () => {
      window.removeEventListener('focus', focusSearch);
      document.removeEventListener('click', handleGlobalClick);
      document.removeEventListener('keydown', handleGlobalKeydown, { capture: true });
      window.removeEventListener('refocus-search', handleManualRefocus);
    };
  }, []);

  // When user starts typing in search, reset category to 'All' so the visual state
  // matches the actual filtering behavior (category is bypassed during search)
  useEffect(() => {
    const prev = prevSearchRef.current;
    if (searchTerm !== '' && prev === '' && selectedCategory !== 'All') {
      setSelectedCategory('All');
    }
    prevSearchRef.current = searchTerm;
  }, [searchTerm, selectedCategory]);

  // AUTO-DETECT barcode
  useEffect(() => {
    const term = searchTerm.trim();
    if (term.length < 3) return;

    const timer = setTimeout(() => {
      const normalizedTerm = term.toUpperCase().replace(/O/g, '0');

      const found = state.products.find((p: Product) => {
        const pBarcode = (p.barcode || '').toUpperCase().replace(/O/g, '0');
        const pSku = (p.sku || '').toUpperCase().replace(/O/g, '0');
        const pBarcodeVal = (p.barcodeValue || '').toUpperCase().replace(/O/g, '0');

        const exactMatch = (p.barcodeValue && p.barcodeValue.toLowerCase() === term.toLowerCase()) ||
          (p.barcode && p.barcode.toLowerCase() === term.toLowerCase()) ||
          (p.sku && p.sku.toLowerCase() === term.toLowerCase());

        if (exactMatch) return true;
        return pBarcodeVal === normalizedTerm || pBarcode === normalizedTerm || pSku === normalizedTerm;
      });

      if (found) {
        onAddToCart(found);
        setSearchTerm('');
        sonner.success(`Added: ${found.name}`);

        if (!isMobileDevice) {
          setTimeout(() => searchRef.current?.focus({ preventScroll: true }), 50);
        }
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchTerm, state.products, onAddToCart]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const barcode = e.currentTarget.value.trim();
      if (barcode.length < 2) return;
      e.preventDefault();

      const normalizedBarcode = barcode.toUpperCase().replace(/O/g, '0');

      const found = state.products.find((p: Product) => {
        const pBarcode = (p.barcode || '').toUpperCase().replace(/O/g, '0');
        const pSku = (p.sku || '').toUpperCase().replace(/O/g, '0');
        const pBarcodeVal = (p.barcodeValue || '').toUpperCase().replace(/O/g, '0');

        if (p.barcodeValue === barcode || p.barcode === barcode || p.sku === barcode) return true;
        return pBarcodeVal === normalizedBarcode || pBarcode === normalizedBarcode || pSku === normalizedBarcode;
      });

      if (found) {
        onAddToCart(found);
        setSearchTerm('');
        sonner.success(`Added: ${found.name}`);

        if (!isMobileDevice) {
          setTimeout(() => searchRef.current?.focus({ preventScroll: true }), 50);
        }
      }
    }
  };

  const draftsCount = state.sales.filter(sale => sale.notes?.includes('DRAFT_SALE')).length;
  const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 0 && /Macintosh/i.test(navigator.userAgent));

  const filteredProducts = state.products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.sku && product.sku.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (product.barcodeValue && product.barcodeValue.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (product.barcode && product.barcode.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory = searchTerm.trim() !== ''
      ? true
      : (selectedCategory === 'All' || (selectedCategory === 'Featured' ? product.isFeatured : product.category === selectedCategory));

    return matchesSearch && matchesCategory && product.active !== false;
  }).sort((a, b) => {
    if (a.isFeatured && !b.isFeatured) return -1;
    if (!a.isFeatured && b.isFeatured) return 1;
    return a.name.localeCompare(b.name);
  });

  const categories = ['Featured', 'All', '__BUNDLES__', ...Array.from(new Set(state.products.map(p => p.category))).filter(Boolean)];
  const isTouchMode = state.settings.interfaceMode === 'touch';

  const checkScrollButtons = () => {
    if (categoriesRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = categoriesRef.current;
      setShowLeftScroll(scrollLeft > 0);
      setShowRightScroll(scrollLeft < scrollWidth - clientWidth - 5);
    }
  };

  useEffect(() => {
    checkScrollButtons();
    const categoriesElement = categoriesRef.current;
    if (categoriesElement) {
      categoriesElement.addEventListener('scroll', checkScrollButtons);
      return () => categoriesElement.removeEventListener('scroll', checkScrollButtons);
    }
  }, [categories]);

  const scrollCategories = (direction: 'left' | 'right') => {
    if (categoriesRef.current) {
      const scrollAmount = 200;
      const currentScroll = categoriesRef.current.scrollLeft;
      const targetScroll = direction === 'left' ? currentScroll - scrollAmount : currentScroll + scrollAmount;
      categoriesRef.current.scrollTo({ left: targetScroll, behavior: 'smooth' });
    }
  };

  const handleColumnChange = (cols: number) => {
    dispatch({
      type: 'SET_SETTINGS',
      payload: { posGridColumns: cols }
    });

    settingsService.update({ posGridColumns: cols })
      .catch(err => console.error('[POS] Failed to sync grid settings:', err));

    sonner.success(`Grid density set to ${cols} columns`);
  };

  const gridCols = state.settings.posGridColumns ?? 4;

  const getGridClasses = () => {
    const base = "grid gap-2 lg:gap-4";
    const mobileDefaults = "grid-cols-[repeat(auto-fill,minmax(110px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(130px,1fr))]";
    const desktopCols: Record<number, string> = {
      1: "lg:grid-cols-1",
      2: "lg:grid-cols-2",
      3: "lg:grid-cols-3",
      4: "lg:grid-cols-4",
      5: "lg:grid-cols-5",
      6: "lg:grid-cols-6",
      7: "lg:grid-cols-7",
      8: "lg:grid-cols-8",
    };
    const desktopClass = gridCols === 0
      ? "lg:grid-cols-[repeat(auto-fill,minmax(140px,1fr))]"
      : (desktopCols[gridCols] || "lg:grid-cols-4");
    return `${base} ${mobileDefaults} ${desktopClass}`;
  };

  return (
    <>
      <div className="flex-1 flex flex-col bg-white dark:bg-app transition-colors h-full overflow-hidden">
        {/* Search and Filter Bar */}
        <div className="p-1 lg:p-6 border-b border-gray-100 dark:border-white/5 bg-white dark:bg-app transition-colors">
          <div className="flex flex-col xl:flex-row gap-3 xl:gap-4 xl:items-center">
            <div className="flex-1 flex items-center gap-1.5 lg:gap-3 w-full min-w-[280px] sm:min-w-[340px] xl:min-w-[380px]">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 h-3.5 w-3.5 lg:h-5 lg:w-5" />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder={t('search_or_scan', 'Search or scan...')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  className={`input pl-7 pr-14 lg:pl-12 lg:pr-24 w-full transition-all bg-white dark:bg-[#1C1C1C] dark:text-white border-gray-200 dark:border-white/10 ${isTouchMode ? 'h-8 lg:h-14 text-xs lg:text-lg' : 'h-8 lg:h-12'}`}
                />

                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 lg:gap-2">
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="p-1 lg:p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg lg:rounded-xl transition-all"
                      title="Clear Search"
                    >
                      <X className="h-3 w-3 lg:h-4 lg:w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => setShowScanner(true)}
                    className="p-1 lg:p-2 bg-primary/10 text-primary rounded-lg active:bg-primary active:text-white transition-all shadow-sm"
                    title="Scan with Camera"
                  >
                    <Camera className="h-3 w-3 lg:h-4 lg:w-4" />
                  </button>
                </div>
              </div>
              {onOpenDrafts && (
                <button
                  onClick={onOpenDrafts}
                  className={`btn btn-secondary relative flex items-center justify-center flex-shrink-0 ${isTouchMode ? 'h-8 lg:h-14 w-8 lg:w-14' : 'h-8 lg:h-12 w-8 lg:w-12 px-0'}`}
                  title="View saved drafts"
                >
                  <FileText className={`${isTouchMode ? 'h-3.5 w-3.5 lg:h-7 lg:w-7' : 'h-4 w-4 lg:h-6 lg:w-6'}`} />
                  {draftsCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-primary text-white text-[8px] lg:text-[10px] font-black h-4 w-4 lg:h-5 lg:w-5 flex items-center justify-center rounded-full border-2 border-white dark:border-[#0A0A0A]">
                      {draftsCount}
                    </span>
                  )}
                </button>
              )}
            </div>

            <div className="relative flex items-center w-full xl:w-auto min-w-0 xl:max-w-xl">
              {showLeftScroll && (
                <button
                  onClick={() => scrollCategories('left')}
                  className="absolute left-0 z-10 flex items-center justify-center w-7 h-7 bg-white dark:bg-[#1C1C1C] border border-gray-200 dark:border-white/10 rounded-full shadow-sm hover:bg-gray-50 dark:hover:bg-white/10 transition-all focus:outline-none"
                  style={{ transform: 'translateX(-50%)' }}
                >
                  <ChevronLeft className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
                </button>
              )}

              <div
                ref={categoriesRef}
                className="flex overflow-x-auto space-x-1.5 lg:space-x-3 w-full max-w-full xl:max-w-xl scrollbar-hide scroll-smooth px-1 lg:px-6"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={`btn whitespace-nowrap transition-all flex-shrink-0 flex items-center gap-1 px-2.5 ${selectedCategory === category
                      ? category === '__BUNDLES__'
                        ? 'bg-violet-600 text-white font-black shadow-lg shadow-violet-500/20'
                        : 'bg-primary text-white font-black shadow-lg shadow-emerald-500/20'
                      : 'bg-white dark:bg-[#1C1C1C] text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5'
                      } ${isTouchMode ? 'h-7 lg:h-12 rounded-lg lg:rounded-2xl text-[7px] lg:text-[10px] uppercase tracking-wider lg:tracking-widest' : 'h-7 lg:h-10 rounded-lg lg:rounded-xl text-[9px] lg:text-xs font-bold'}`}
                  >
                    {category === 'Featured' && <Star className="w-2.5 h-2.5 lg:w-3.5 lg:h-3.5 fill-current" />}
                    {category === '__BUNDLES__' && <Gift className="w-2.5 h-2.5 lg:w-3.5 lg:h-3.5" />}
                    {category === '__BUNDLES__'
                      ? t('bundles_and_deals', 'Bundles & Deals')
                      : category === 'Featured'
                        ? t('featured', 'Featured')
                        : category === 'All'
                          ? t('all_categories', 'All')
                          : category}
                  </button>
                ))}
              </div>

              {showRightScroll && (
                <button
                  onClick={() => scrollCategories('right')}
                  className="absolute right-0 z-10 flex items-center justify-center w-7 h-7 bg-white dark:bg-[#1C1C1C] border border-gray-200 dark:border-white/10 rounded-full shadow-sm hover:bg-gray-50 dark:hover:bg-white/10 transition-all focus:outline-none"
                  style={{ transform: 'translateX(50%)' }}
                >
                  <ChevronRight className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 p-2 lg:p-6 overflow-y-auto min-h-0 bg-gray-50/50 dark:bg-transparent custom-scrollbar pb-[calc(8.5rem+env(safe-area-inset-bottom))] lg:pb-8"
          style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
        >
          {/* BUNDLES VIEW */}
          {selectedCategory === '__BUNDLES__' ? (
            <BundleGrid onAddToCart={onAddToCart} currency={getCurrencySymbol(state.settings.currency)} isTouchMode={isTouchMode} isReturnMode={isReturnMode} gridCols={gridCols} />
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64">
              <div className="bg-gray-100 dark:bg-white/5 p-6 rounded-3xl mb-4">
                <Package className="h-16 w-16 text-gray-400 dark:text-gray-600" />
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">{t('no_products_found', 'No products found')}</p>
            </div>
          ) : (
            <div className={getGridClasses()}>
              {filteredProducts.map((product) => {
                const cartItem = state.cart.find(item => !item.bundleId && !item.bundle_id && item.product.id === product.id);
                return (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onAddToCart={onAddToCart}
                    onUpdateQuantity={(p, d) => {
                      const idx = state.cart.findIndex(item => !item.bundleId && !item.bundle_id && item.product.id === p.id);
                      if (idx >= 0) {
                        const item = state.cart[idx];
                        const newQty = item.quantity + d;
                        const price = p.price;
                        let updatedDiscount = item.discount || 0;
                        if (item.discountValue && item.discountValue > 0) {
                          if (item.discountType === 'percentage') {
                            updatedDiscount = (price * newQty * item.discountValue) / 100;
                          } else {
                            updatedDiscount = Math.sign(newQty) * item.discountValue;
                          }
                        }
                        if (newQty === 0) {
                          updatedDiscount = 0;
                        }
                        dispatch({
                          type: 'UPDATE_CART_ITEM',
                          payload: {
                            index: idx,
                            item: {
                              ...item,
                              quantity: newQty,
                              discount: updatedDiscount,
                              subtotal: (price * newQty) - updatedDiscount
                            }
                          }
                        });
                      } else if (d > 0) {
                        onAddToCart(p);
                      }
                    }}
                    cartQuantity={cartItem?.quantity || 0}
                    currency={getCurrencySymbol(state.settings.currency)}
                    isTouchMode={isTouchMode}
                    gridCols={gridCols}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showScanner && (
        <CameraScanner
          isContinuous={true}
          onScan={(code) => {
            const term = code.trim();
            const normalizedCode = term.toUpperCase().replace(/O/g, '0');

            const product = state.products.find((p: Product) => {
              const pBarcode = (p.barcode || '').toUpperCase().replace(/O/g, '0');
              const pSku = (p.sku || '').toUpperCase().replace(/O/g, '0');
              const pBarcodeVal = (p.barcodeValue || '').toUpperCase().replace(/O/g, '0');

              if (p.barcodeValue === term || p.barcode === term || p.sku === term) return true;
              return pBarcodeVal === normalizedCode || pBarcode === normalizedCode || pSku === normalizedCode;
            });

            if (product) {
              onAddToCart(product);
            } else {
              sonner.error(`Barcode not found: ${term}`);
            }
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </>
  );
}

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product) => void;
  onUpdateQuantity?: (product: Product, delta: number) => void;
  cartQuantity?: number;
  currency: string;
  isTouchMode: boolean;
  gridCols?: number;
}

function ProductCard({ product, onAddToCart, onUpdateQuantity, cartQuantity = 0, isTouchMode, currency, gridCols = 4 }: ProductCardProps) {
  const { t } = useTranslation();
  const shouldTrackInventory = product.trackInventory !== false;
  const isNegativeStock = shouldTrackInventory && product.stock < 0;
  const isNoStock = shouldTrackInventory && product.stock === 0;
  const isLowStock = shouldTrackInventory && product.stock > 0 && product.stock <= (product.minStock || 5);
  const isInfinite = !shouldTrackInventory || product.stock >= 990000;

  return (
    <div
      onClick={() => {
        onAddToCart(product);
      }}
      className={`group relative bg-white dark:bg-[#1C1C1C] rounded-xl border border-gray-100 dark:border-white/5 overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 cursor-pointer ${cartQuantity !== 0 ? 'ring-2 ring-emerald-500 shadow-md shadow-emerald-500/10' : ''
        }`}
      style={{
        minHeight: (typeof window !== 'undefined' && window.innerWidth >= 1024)
          ? (gridCols === 0 || gridCols >= 4 ? (isTouchMode ? '120px' : '140px') :
            gridCols === 3 ? (isTouchMode ? '150px' : '180px') :
              (isTouchMode ? '180px' : '220px'))
          : (isTouchMode ? '120px' : '140px')
      }}
    >
      {/* Thumbnail Area with Controls */}
      <div className={`relative overflow-hidden bg-gray-50 dark:bg-[#262626] ${isTouchMode ? 'aspect-square' : 'aspect-[4/3]'}`}>
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className={`${isTouchMode ? 'h-8 w-8' : 'h-6 w-6'} text-gray-300`} />
          </div>
        )}

        {/* Featured Star */}
        {product.isFeatured && (
          <div className="absolute top-1 left-1 sm:top-2 sm:left-2 bg-yellow-400 text-white p-0.5 rounded-full shadow-lg z-10">
            <Star className="h-2.5 w-2.5 sm:h-3 sm:w-3 fill-white" />
          </div>
        )}

        {/* Floating Controls Overlay */}
        {cartQuantity !== 0 && (
          <div className="absolute inset-x-0.5 bottom-0.5 flex items-center justify-between bg-white/95 dark:bg-black/95 rounded-lg p-0.5 shadow-lg animate-in fade-in slide-in-from-bottom-1 duration-300 z-20">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUpdateQuantity?.(product, -1);
              }}
              className="p-1 hover:bg-gray-100 dark:hover:bg-white/10 rounded-md transition-colors text-gray-600 dark:text-gray-400"
            >
              <Minus className="h-2.5 w-2.5" />
            </button>
            <span className="font-black text-[9px] sm:text-xs text-gray-900 dark:text-white px-0.5">
              {cartQuantity}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUpdateQuantity?.(product, 1);
              }}
              className="p-1 hover:bg-gray-100 dark:hover:bg-white/10 rounded-md transition-colors text-primary"
            >
              <Plus className="h-2.5 w-2.5" />
            </button>
          </div>
        )}

        {/* Quick Add Visual indicator (When empty) */}
        {cartQuantity === 0 && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center">
            <div className="opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all duration-300">
              <div className="bg-primary text-white p-1.5 rounded-lg shadow-xl">
                <Plus className="h-4 w-4" />
              </div>
            </div>
          </div>
        )}

        {/* Stock Status Badge — 3 states: in-stock (green), no-stock (orange), deficit (red) */}
        <div className={`absolute top-1 right-1 px-1.5 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-wider shadow-md z-10 ${isInfinite
          ? 'bg-violet-500 text-white'
          : isNegativeStock
            ? 'bg-red-500 text-white'
            : isNoStock
              ? 'bg-orange-500 text-white'
              : isLowStock
                ? 'bg-amber-500 text-white'
                : 'bg-primary text-white'
          }`}>
          {isInfinite
            ? <Infinity className="h-3 w-3" />
            : isNegativeStock
              ? `${product.stock} ${t('deficit', 'DEFICIT')}`
              : isNoStock
                ? t('no_stock', 'NO STOCK')
                : product.stock
          }
        </div>
      </div>

      {/* Info Area */}
      <div className="p-1.5 sm:p-2 space-y-0.5">
        <h3 className={`font-black text-gray-900 dark:text-white uppercase tracking-tight leading-[1.1] mb-0.5 break-words line-clamp-2 ${isTouchMode ? 'text-[9px] sm:text-[10px]' : 'text-[10px] sm:text-xs'
          }`}>
          {product.name}
        </h3>
        <div className="flex items-center justify-between">
          <div className="text-primary dark:text-emerald-400 font-black text-[10px] sm:text-xs">
            {currency}{product.price.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── BUNDLE GRID ──────────────────────────────────────────────────────────────
interface BundleGridProps {
  onAddToCart: (product: Product) => void;
  currency: string;
  isTouchMode: boolean;
  isReturnMode: boolean;
  gridCols?: number;
}

function BundleGrid({ onAddToCart, currency, isTouchMode, isReturnMode, gridCols = 4 }: BundleGridProps) {
  const { state, dispatch } = useApp();
  const { t } = useTranslation();
  const bundles = (state.bundles || []).filter(b => b.active !== false);

  const handleAddBundle = (bundle: any) => {
    try {
      console.log('[Bundle] ADD DEAL clicked:', bundle?.name, bundle?.id);
      if (!bundle) {
        sonner.error('Bundle data is missing');
        return;
      }
      const cartItems = bundlesService.getBundleCartItems(bundle, state.products);
      console.log('[Bundle] Cart items from service:', cartItems?.length);
      if (!cartItems || cartItems.length === 0) {
        sonner.error(t('bundle_no_available_products', 'No products available in this bundle deal'));
        return;
      }

      const itemsToDispatch = isReturnMode
        ? cartItems.map(item => ({
          ...item,
          quantity: -Math.abs(item.quantity),
          discount: -Math.abs(item.discount),
          subtotal: -Math.abs(item.subtotal),
        }))
        : cartItems;

      console.log('[Bundle] Items to dispatch:', itemsToDispatch.length);
      let updatedCart = [...state.cart];

      for (const item of itemsToDispatch) {
        const existingIndex = updatedCart.findIndex(
          x => (x.bundleId === item.bundleId || x.bundle_id === item.bundleId) && x.product.id === item.product.id
        );

        if (existingIndex >= 0) {
          const existing = updatedCart[existingIndex];
          updatedCart[existingIndex] = {
            ...existing,
            quantity: existing.quantity + item.quantity,
            discount: (existing.discount || 0) + (item.discount || 0),
            subtotal: (existing.subtotal || 0) + (item.subtotal || 0),
          };
        } else {
          updatedCart.push(item);
        }
      }

      console.log('[Bundle] Dispatching SET_CART with', updatedCart.length, 'items');
      dispatch({ type: 'SET_CART', payload: updatedCart });

      const discountText = bundle.discountType === 'percentage'
        ? `${bundle.discountValue}%`
        : `${currency}${bundle.discountValue}`;
      sonner.success(`🎁 ${bundle.name} added — ${discountText} discount applied!`);
    } catch (err) {
      console.error('[Bundle] Add bundle error:', err);
      sonner.error('Could not add bundle — please try again');
    }
  };

  if (bundles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="bg-violet-500/10 p-6 rounded-3xl mb-4">
          <Gift className="h-16 w-16 text-violet-400" />
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-sm font-bold">{t('no_bundles_title', 'No Bundles & Deals Yet')}</p>
        <p className="text-[11px] text-gray-400 mt-1 mb-4">{t('no_bundles_desc_pos', 'Go to Inventory → Bundles to create combo deals')}</p>
        <button
          type="button"
          onClick={() => {
            dispatch({ type: 'SET_INVENTORY_TAB', payload: 'bundles' });
            window.dispatchEvent(new CustomEvent('navigate', { detail: 'inventory' }));
          }}
          className="bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl transition-all active:scale-95 shadow-lg shadow-violet-500/20"
        >
          {t('create_deal_now_btn', 'Create Deal Now')}
        </button>
      </div>
    );
  }

  // Use EXACT same grid classes as the product grid
  const getGridClasses = () => {
    const base = "grid gap-2 lg:gap-4";
    const mobileDefaults = "grid-cols-[repeat(auto-fill,minmax(110px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(130px,1fr))]";
    const desktopCols: Record<number, string> = {
      1: "lg:grid-cols-1",
      2: "lg:grid-cols-2",
      3: "lg:grid-cols-3",
      4: "lg:grid-cols-4",
      5: "lg:grid-cols-5",
      6: "lg:grid-cols-6",
      7: "lg:grid-cols-7",
      8: "lg:grid-cols-8",
    };
    const desktopClass = gridCols === 0
      ? "lg:grid-cols-[repeat(auto-fill,minmax(140px,1fr))]"
      : (desktopCols[gridCols] || "lg:grid-cols-4");
    return `${base} ${mobileDefaults} ${desktopClass}`;
  };

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between bg-violet-500/5 hover:bg-violet-500/10 border border-violet-500/10 p-2.5 rounded-xl transition-all duration-300">
        <div className="flex items-center gap-2 min-w-0">
          <Gift className="h-4 w-4 text-violet-500 shrink-0" />
          <p className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 font-bold uppercase tracking-wide truncate">
            {t('manage_bundles_hint', 'Create & Manage your combo deals in Inventory')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            dispatch({ type: 'SET_INVENTORY_TAB', payload: 'bundles' });
            window.dispatchEvent(new CustomEvent('navigate', { detail: 'inventory' }));
          }}
          className="bg-violet-600 hover:bg-violet-700 text-white text-[9px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-lg transition-all active:scale-95 shadow-sm shrink-0"
        >
          {t('manage_deals_btn', 'Manage Deals')}
        </button>
      </div>

      <div className={getGridClasses()}>
        {bundles.map(bundle => {
          const totalPrice = (bundle.items || []).reduce((sum: number, bi: any) => {
            const p = state.products.find(pr => pr.id === bi.productId);
            return sum + (p ? p.price * bi.quantity : 0);
          }, 0);
          const discountAmount = bundle.discountType === 'percentage'
            ? (totalPrice * bundle.discountValue) / 100
            : Math.min(bundle.discountValue, totalPrice);
          const finalPrice = totalPrice - discountAmount;

          const bundleProducts = (bundle.items || []).map((bi: any) => {
            const p = state.products.find(pr => pr.id === bi.productId);
            return p ? { ...p, qty: bi.quantity } : null;
          }).filter(Boolean);
          const visibleProducts = bundleProducts.slice(0, 4);

          // Check if bundle is in cart + compute quantity
          let bundleQty = 0;
          const bundleDef = state.bundles?.find((x: any) => x.id === bundle.id);
          if (bundleDef && bundleDef.items && bundleDef.items.length > 0) {
            const firstBi = bundleDef.items[0];
            const cartItem = state.cart.find((x: any) => (x.bundleId || x.bundle_id) === bundle.id && x.product.id === firstBi.productId);
            if (cartItem) {
              bundleQty = Math.round(cartItem.quantity / firstBi.quantity);
            }
          } else {
            const anyBundleItem = state.cart.find((x: any) => (x.bundleId || x.bundle_id) === bundle.id);
            if (anyBundleItem) bundleQty = 1;
          }

          return (
            <div
              key={bundle.id}
              className={`group relative bg-white dark:bg-[#1C1C1C] rounded-xl border border-gray-100 dark:border-white/5 overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 cursor-pointer ${bundleQty > 0 ? 'ring-2 ring-emerald-500 shadow-md shadow-emerald-500/10' : ''}`}
              style={{
                minHeight: (typeof window !== 'undefined' && window.innerWidth >= 1024)
                  ? (gridCols === 0 || gridCols >= 4 ? (isTouchMode ? '120px' : '140px') :
                    gridCols === 3 ? (isTouchMode ? '150px' : '180px') :
                      (isTouchMode ? '180px' : '220px'))
                  : (isTouchMode ? '120px' : '140px')
              }}
            >
              {/* ───── Image Zone (same aspect ratio as product cards) ───── */}
              <div className={`relative overflow-hidden bg-gray-50 dark:bg-[#262626] ${isTouchMode ? 'aspect-square' : 'aspect-[4/3]'}`}>
                {visibleProducts.length > 0 ? (
                  <div className={`grid h-full ${visibleProducts.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    {visibleProducts.map((product: any, idx: number) => {
                      const total = bundleProducts.length;
                      const isLastOfThree = total === 3 && idx === 2;
                      const cellClasses = [
                        'relative overflow-hidden bg-gray-50 dark:bg-black/20',
                        idx >= 2 ? 'border-t border-white/10 dark:border-white/5' : '',
                        idx % 2 === 0 && idx < 2 ? 'border-r border-white/10 dark:border-white/5' : '',
                        isLastOfThree ? 'col-span-2' : '',
                      ].filter(Boolean).join(' ');
                      return (
                        <div key={product.id || idx} className={cellClasses}>
                          {product.image ? (
                            <img src={product.image} className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="h-6 w-6 text-gray-300 dark:text-gray-600" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {/* If only 1 product, show placeholder to fill 2nd column so 2x2 grid looks proper */}
                    {visibleProducts.length === 1 && (
                      <div className="relative overflow-hidden bg-gray-50 dark:bg-black/20 border-l border-white/10 dark:border-white/5 flex items-center justify-center">
                        <Gift className="h-6 w-6 text-gray-300 dark:text-gray-600" />
                      </div>
                    )}
                    {/* If 2 products, show 2 more placeholders for the bottom row */}
                    {visibleProducts.length === 2 && (
                      <>
                        <div className="relative overflow-hidden bg-gray-50 dark:bg-black/20 border-t border-white/10 dark:border-white/5 border-r border-white/10 dark:border-white/5 flex items-center justify-center">
                          <Gift className="h-6 w-6 text-gray-300 dark:text-gray-600" />
                        </div>
                        <div className="relative overflow-hidden bg-gray-50 dark:bg-black/20 border-t border-white/10 dark:border-white/5 flex items-center justify-center">
                          <Gift className="h-6 w-6 text-gray-300 dark:text-gray-600" />
                        </div>
                      </>
                    )}
                    {/* If 3 products, show 1 more placeholder */}
                    {visibleProducts.length === 3 && bundleProducts.length === 3 && (
                      <div className="relative overflow-hidden bg-gray-50 dark:bg-black/20 border-t border-white/10 dark:border-white/5 flex items-center justify-center">
                        <Gift className="h-6 w-6 text-gray-300 dark:text-gray-600" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Gift className="h-12 w-12 text-violet-300 dark:text-violet-600" />
                  </div>
                )}

                {/* Discount badge top-left */}
                <div className="absolute top-1 left-1 bg-violet-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-lg shadow-lg z-10">
                  -{bundle.discountValue}{bundle.discountType === 'percentage' ? '%' : ` ${currency}`}
                </div>

                {/* Gift icon top-right */}
                <div className="absolute top-1 right-1 flex items-center bg-violet-500/90 text-white p-1 rounded-lg text-[8px] font-black shadow-md z-10">
                  <Gift className="h-2.5 w-2.5" />
                </div>

                {/* Bundle Qty Stepper Overlay */}
                {bundleQty > 0 && (
                  <div className="absolute inset-x-0.5 bottom-0.5 flex items-center justify-between bg-white/95 dark:bg-black/95 rounded-lg p-0.5 shadow-lg animate-in fade-in slide-in-from-bottom-1 duration-300 z-20">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        let newCart = [...state.cart];
                        if (bundleQty <= 1) {
                          newCart = newCart.filter((x: any) => (x.bundleId || x.bundle_id) !== bundle.id);
                        } else {
                          const baseItems = bundlesService.getBundleCartItems(bundle, state.products);
                          for (const baseItem of baseItems) {
                            const idx = newCart.findIndex((x: any) => (x.bundleId || x.bundle_id) === bundle.id && x.product.id === baseItem.product.id);
                            if (idx >= 0) {
                              const cartItem = newCart[idx];
                              const newQty = cartItem.quantity - baseItem.quantity;
                              if (newQty <= 0) {
                                newCart.splice(idx, 1);
                              } else {
                                const newDiscount = (cartItem.discount || 0) - (baseItem.discount || 0);
                                newCart[idx] = { ...cartItem, quantity: newQty, discount: newDiscount, subtotal: cartItem.product.price * newQty - newDiscount };
                              }
                            }
                          }
                        }
                        dispatch({ type: 'SET_CART', payload: newCart });
                      }}
                      className="p-1 hover:bg-gray-100 dark:hover:bg-white/10 rounded-md transition-colors text-gray-600 dark:text-gray-400"
                    >
                      <Minus className="h-2.5 w-2.5" />
                    </button>
                    <span className="font-black text-[9px] sm:text-xs text-gray-900 dark:text-white px-0.5">{bundleQty}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddBundle(bundle);
                      }}
                      className="p-1 hover:bg-gray-100 dark:hover:bg-white/10 rounded-md transition-colors text-primary"
                    >
                      <Plus className="h-2.5 w-2.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* ───── Info Area (same layout as product card) ───── */}
              <div className="p-1.5 sm:p-2 space-y-0.5">
                {/* ADD DEAL button */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleAddBundle(bundle); }}
                  className="w-full flex items-center justify-center gap-1 bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white text-[8px] font-black uppercase tracking-wider rounded-lg py-1.5 transition-all active:scale-95 shadow-lg"
                >
                  <Plus className="h-2.5 w-2.5" /> {t('add_bundle', 'Add Deal')}
                </button>

                <h3 className={`font-black text-gray-900 dark:text-white uppercase tracking-tight leading-tight line-clamp-2 ${isTouchMode ? 'text-[9px]' : 'text-[10px] sm:text-xs'}`}>
                  {bundle.name}
                </h3>

                <div className="flex items-center justify-between gap-1">
                  <span className="text-[9px] text-gray-400 line-through truncate">{currency}{totalPrice.toLocaleString()}</span>
                  <span className="text-primary dark:text-emerald-400 font-black text-[10px] sm:text-xs shrink-0">{currency}{finalPrice.toLocaleString()}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}