import { useState, useCallback, useEffect, useRef } from 'react';
import { ProductGrid } from './ProductGrid';
import { Cart } from './Cart';
import { CheckoutPage } from './CheckoutPage';
import { SalesTabManager } from './SalesTabManager';
import { GridDensityController } from './GridDensityController';
import { DraftsModal } from './DraftsModal';
import { ProductOptionsModal } from './ProductOptionsModal';
import { ShortcutsModal } from './ShortcutsModal';
import { Product, Sale, ProductModifier } from '../../types';
import { useApp } from '../../context/SupabaseAppContext';
import { useAuth } from '../../context/AuthContext';
import { salesService } from '../../lib/services';
import { sonner } from '../../lib/sonner';
import { ShoppingCart, Keyboard, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { formatCurrency } from '../../lib/currencies';
import { useHardwareScanner } from '../../hooks/useHardwareScanner';
import { usePOSKeyboard } from '../../hooks/usePOSKeyboard';
import { useSoundFeedback } from '../../hooks/useSoundFeedback';
import { useCartCalculations } from '../../hooks/useCartCalculations';
import { useTranslation } from '../../hooks/useTranslation';

export function POSTerminal() {
  const { state, dispatch } = useApp();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [showCheckout, setShowCheckout] = useState(false);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [isDraftsModalOpen, setIsDraftsModalOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [isReturnMode, setIsReturnMode] = useState(false);

  const [optionsProduct, setOptionsProduct] = useState<Product | null>(null);
  const [pendingWeight, setPendingWeight] = useState<number | undefined>(undefined);

  const isTouchMode = state.settings.interfaceMode === 'touch';
  const posContainerRef = useRef<HTMLDivElement>(null);
  const shortcutsRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const { play } = useSoundFeedback();

  const scrollShortcuts = (direction: 'left' | 'right') => {
    if (shortcutsRef.current) {
      const scrollAmount = 140;
      shortcutsRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const scrollTabs = (direction: 'left' | 'right') => {
    if (tabsRef.current) {
      const scrollAmount = 140;
      tabsRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const [canScrollTabsLeft, setCanScrollTabsLeft] = useState(false);
  const [canScrollTabsRight, setCanScrollTabsRight] = useState(false);
  const [canScrollShortcutsLeft, setCanScrollShortcutsLeft] = useState(false);
  const [canScrollShortcutsRight, setCanScrollShortcutsRight] = useState(false);

  const checkTabsScroll = useCallback(() => {
    if (tabsRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = tabsRef.current;
      setCanScrollTabsLeft(scrollLeft > 0);
      setCanScrollTabsRight(Math.ceil(scrollLeft + clientWidth) < scrollWidth);
    }
  }, []);

  const checkShortcutsScroll = useCallback(() => {
    if (shortcutsRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = shortcutsRef.current;
      setCanScrollShortcutsLeft(scrollLeft > 0);
      setCanScrollShortcutsRight(Math.ceil(scrollLeft + clientWidth) < scrollWidth);
    }
  }, []);

  useEffect(() => {
    checkTabsScroll();
    checkShortcutsScroll();
    
    const resizeObserver = new ResizeObserver(() => {
      checkTabsScroll();
      checkShortcutsScroll();
    });
    
    if (tabsRef.current) resizeObserver.observe(tabsRef.current);
    if (shortcutsRef.current) resizeObserver.observe(shortcutsRef.current);
    
    return () => resizeObserver.disconnect();
  }, [checkTabsScroll, checkShortcutsScroll]);

  useEffect(() => {
    // Only focus the POS container for Electron keyboard events
    posContainerRef.current?.focus({ preventScroll: true });
  }, []);

  // Lock background <main> container scrolling when any popup, mobile drawer or checkout is open
  useEffect(() => {
    const isAnyPopupOpen = isMobileCartOpen || showCheckout || isDraftsModalOpen || isShortcutsModalOpen || !!optionsProduct;
    const mainEl = document.querySelector('main');
    if (isAnyPopupOpen) {
      document.body.style.overflow = 'hidden';
      if (mainEl) {
        mainEl.style.overflow = 'hidden';
      }
    } else {
      document.body.style.overflow = '';
      if (mainEl) {
        mainEl.style.overflow = '';
      }
    }
    return () => {
      document.body.style.overflow = '';
      if (mainEl) {
        mainEl.style.overflow = '';
      }
    };
  }, [isMobileCartOpen, showCheckout, isDraftsModalOpen, isShortcutsModalOpen, optionsProduct]);

  const addToCart = (product: Product, weight?: number, options?: { selectedVariant?: string; selectedModifiers?: ProductModifier[]; serialNumber?: string }) => {
    // Intercept if product requires options but options aren't provided yet
    if (!options && (
      (product.variants && product.variants.length > 0) ||
      (product.modifiers && product.modifiers.length > 0) ||
      product.requireSerial
    )) {
      setPendingWeight(weight);
      setOptionsProduct(product);
      return;
    }

    const existingItemIndex = state.cart.findIndex(item =>
      item.product.id === product.id &&
      !item.bundleId && !item.bundle_id && // Never merge into a bundle child line (standalone click must stay standalone)
      (product.isWeightBased ? false : true) && // For weight-based products, always add new item
      (!options?.selectedVariant || item.selectedVariant === options.selectedVariant) && // Match variant
      (!options?.serialNumber || item.serialNumber === options.serialNumber) // Match serial
      // We generally don't group items with modifiers to avoid complexity, but for simplicity we let it group if modifiers match.
      // Actually, if it has modifiers, we should probably add as new line or deeply compare. For now, let's always add new line if it has modifiers or serial.
    );

    const shouldAddNewLine = product.isWeightBased || product.requireSerial || (options?.selectedModifiers && options.selectedModifiers.length > 0);

    let quantityModifier = isReturnMode ? -1 : 1;
    let newQuantity = quantityModifier;

    if (existingItemIndex >= 0 && !shouldAddNewLine) {
      newQuantity = state.cart[existingItemIndex].quantity + quantityModifier;
    } else {
      newQuantity = product.isWeightBased ? (isReturnMode ? -1 : 1) : quantityModifier;
    }

    // Check stock limit for increasing quantity or new item
    if (product.trackInventory && !isReturnMode) {
      if (product.stock <= 0) {
        sonner.warning(`Out of stock! Added ${product.name}, but verify stock.`);
      } else if (newQuantity > product.stock) {
        sonner.warning(`Stock limit exceeded for ${product.name} — only ${product.stock} in stock`);
      }
    }

    if (existingItemIndex >= 0 && !shouldAddNewLine) {
      const existingItem = state.cart[existingItemIndex];
      let updatedDiscount = existingItem.discount || 0;
      if (existingItem.discountValue && existingItem.discountValue > 0) {
        if (existingItem.discountType === 'percentage') {
          updatedDiscount = (product.price * newQuantity * existingItem.discountValue) / 100;
        } else {
          updatedDiscount = Math.sign(newQuantity) * existingItem.discountValue;
        }
      }
      if (newQuantity === 0) {
        updatedDiscount = 0;
      }
      const updatedItem = {
        ...existingItem,
        quantity: newQuantity,
        discount: updatedDiscount,
        subtotal: product.price * newQuantity - updatedDiscount
      };
      dispatch({ type: 'UPDATE_CART_ITEM', payload: { index: existingItemIndex, item: updatedItem } });
    } else {
      // For weight-based products, new items, or items with specific options
      const itemWeight = weight ? (isReturnMode ? -weight : weight) : undefined;

      // Calculate base price including modifiers
      let basePrice = product.price;
      if (options?.selectedModifiers) {
        options.selectedModifiers.forEach(m => basePrice += m.price);
      }

      const price = product.isWeightBased ? (product.pricePerUnit || 0) * (weight || 1) : basePrice;

      const newItem = {
        product,
        quantity: newQuantity,
        weight: itemWeight,
        discount: 0,
        discountType: 'percentage' as const,
        subtotal: product.isWeightBased ? price * Math.sign(newQuantity) : price * newQuantity,
        originalPrice: basePrice,
        selectedVariant: options?.selectedVariant,
        selectedModifiers: options?.selectedModifiers,
        serialNumber: options?.serialNumber
      };

      dispatch({ type: 'ADD_TO_CART', payload: newItem });
    }

    // Play sound unless it was a barcode scan (we'll let handleScan trigger it so they don't overlap double)
    // Wait, the prompt says "Barcode scan success -> play('scan')" and "Add item -> play('addItem')".
    // Let's just play 'addItem' here. If it's a scan, it'll play scan first, then this will override or layer. `Web Audio API` can layer perfectly.
    play('addItem');

    // Cart status update handled by the core reducer automatically to ensure zero-lag persistence
  };

  const handleScan = useCallback((barcode: string) => {
    try {
      const term = barcode.trim();
      const normalizedTerm = term.toUpperCase()
        .replace(/O/g, '0')
        .replace(/I/g, '1')
        .replace(/L/g, '1')
        .replace(/S/g, '5')
        .replace(/Z/g, '2');

      // 1. Try exact match
      let scannedProduct = state.products.find(
        (p: Product) => p.barcodeValue === term || p.barcode === term || p.sku === term
      );

      // 2. If not found, try normalized match (handles OCR confusion)
      if (!scannedProduct) {
        scannedProduct = state.products.find((p: Product) => {
          const pBarcodeVal = (p.barcodeValue || '').toUpperCase()
            .replace(/O/g, '0').replace(/I/g, '1').replace(/L/g, '1').replace(/S/g, '5').replace(/Z/g, '2');
          const pBarcode = (p.barcode || '').toUpperCase()
            .replace(/O/g, '0').replace(/I/g, '1').replace(/L/g, '1').replace(/S/g, '5').replace(/Z/g, '2');
          const pSku = (p.sku || '').toUpperCase()
            .replace(/O/g, '0').replace(/I/g, '1').replace(/L/g, '1').replace(/S/g, '5').replace(/Z/g, '2');
          return pBarcodeVal === normalizedTerm || pBarcode === normalizedTerm || pSku === normalizedTerm;
        });
      }

      if (!scannedProduct) {
        play('error');
        sonner.error(`Not found: ${term}`);
        return;
      }

      play('scan');
      addToCart(scannedProduct);


      if (scannedProduct.trackInventory && scannedProduct.stock <= 0) {
        // Warning is already handled inside addToCart, but adding explicit matching message just in case
        // sonner.warning(`⚠️ Out of stock: ${scannedProduct.name} — added but verify stock`);
      } else {
        sonner.success(`Added: ${scannedProduct.name}`);
      }
    } catch {
      sonner.error('Scanner error — check connection');
    }
  }, [state.products, addToCart]);

  useHardwareScanner(handleScan);

  const handleCheckout = () => {
    setShowCheckout(true);
  };

  const handleCheckoutComplete = () => {
    // Note: setShowCheckout(false) is now handled by the modal's onClose callback 
    // to ensure ReceiptPrint has time to display/auto-print.

    // Clear current tab after successful checkout
    if (state.activeSalesTab) {
      dispatch({
        type: 'UPDATE_SALES_TAB',
        payload: {
          id: state.activeSalesTab,
          updates: { cart: [], selectedCustomer: null }
        }
      });
    }
    play('payment');
  };


  const saveDraft = async () => {
    if (state.cart.length === 0) return;

    try {
      const draftSale: Omit<Sale, 'id'> = {
        invoiceNumber: `DRAFT-${Date.now().toString().slice(-6)}`,
        customerId: state.selectedCustomer?.id,
        customerName: state.selectedCustomer?.name,
        items: state.cart,
        subtotal: cartTotal, // Use unified total from useCartCalculations
        discountAmount: 0,
        taxAmount: 0,
        total: cartTotal,
        paymentMethod: 'cash',
        status: 'completed',
        cashier: user?.user_metadata?.full_name || user?.email || 'Unknown',
        timestamp: new Date(),
        receiptNumber: `DRAFT-${Date.now().toString().slice(-6)}`,
        notes: 'DRAFT_SALE - payment pending',
      };

      // Save to Supabase and update local state
      const savedDraft = await salesService.create(draftSale);
      if ((savedDraft as any).wasOversold) {
        sonner.warning(
          'Stock Oversold',
          'Some items were sold beyond available stock. Inventory may show negative quantities.'
        );
      }
      dispatch({ type: 'ADD_SALE', payload: savedDraft });
      dispatch({ type: 'CLEAR_CART' });

      // Clear current tab
      if (state.activeSalesTab) {
        dispatch({
          type: 'UPDATE_SALES_TAB',
          payload: {
            id: state.activeSalesTab,
            updates: { cart: [], selectedCustomer: null }
          }
        });
      }

      sonner.success('Draft sale saved successfully!');
    } catch (error) {
      console.error('Error saving draft:', error);
      sonner.error('Failed to save draft. Please try again.');
    }
  };

  const loadDraft = async (draft: Sale) => {
    // Empty current cart then populate with draft
    dispatch({ type: 'CLEAR_CART' });

    // Set customer if exists
    if (draft.customerId || draft.customerName) {
      dispatch({
        type: 'SET_SELECTED_CUSTOMER',
        payload: {
          id: draft.customerId || '',
          name: draft.customerName || '',
          email: '',
          phone: '',
          address: '',
          creditLimit: 0,
          creditUsed: 0,
          priceTier: 'retail',
          totalPurchases: 0,
          createdAt: new Date()
        }
      });
    }

    // Load items
    draft.items.forEach((item: any) => {
      dispatch({ type: 'ADD_TO_CART', payload: item });
    });

    // Auto-delete the draft after loading it?
    try {
      if (draft.id) {
        await salesService.delete(draft.id);
        dispatch({ type: 'DELETE_SALE', payload: draft.id });
      }
    } catch (error) {
      console.error('Error auto-deleting loaded draft:', error);
    }

    setIsDraftsModalOpen(false);
  };

  const { total: cartTotal } = useCartCalculations();

  const handleNewTab = () => {
    window.dispatchEvent(new CustomEvent('create-new-tab'));
  };

  const handleFocusSearch = () => {
    window.dispatchEvent(new CustomEvent('refocus-search'));
  };

  const handleClearCart = () => {
    if (state.cart.length === 0) return;
    dispatch({ type: 'CLEAR_CART' });
  };

  // ── Keyboard Shortcuts ──
  usePOSKeyboard({
    isCheckoutOpen: showCheckout,
    onFocusSearch: handleFocusSearch,
    onCheckout: () => { if (state.cart.length > 0) handleCheckout(); },
    onSaveDraft: saveDraft,
    onNewTab: handleNewTab,
    onToggleReturnMode: () => {
      setIsReturnMode(prev => !prev);
      window.dispatchEvent(new CustomEvent('refocus-search'));
    },
    onOpenDrafts: () => setIsDraftsModalOpen(true),
    onClearCart: handleClearCart,
  });

  return (
    <div
      ref={posContainerRef}
      tabIndex={-1}
      className="flex flex-col md:flex-row h-full w-full bg-gray-50 dark:bg-app relative overflow-hidden transition-colors select-none outline-none"
    >



      <div className="flex flex-1 overflow-hidden relative">
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-white dark:bg-app transition-colors relative">
          {/* Return Mode Toggle Strip */}
          <div className="bg-white dark:bg-surface px-2 py-0.5 sm:px-4 sm:py-2 border-b border-gray-200 dark:border-white/5 flex items-center justify-between shadow-sm z-10 transition-colors flex-shrink-0">
            {/* View controls tabs container with hover scrolling arrows */}
            <div className="flex items-center min-w-0 flex-1 md:shrink-0 mr-2 gap-1 lg:gap-2 justify-start">
              <div className="relative group flex items-center min-w-0 flex-shrink">
                <button
                  onClick={() => scrollTabs('left')}
                  style={{ minHeight: 'unset' }}
                  className={`absolute -left-2.5 top-1/2 -translate-y-1/2 z-20 w-5 h-5 min-h-0 bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-white/10 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white shadow-md transition-opacity duration-200 active:scale-90 ${canScrollTabsLeft ? 'opacity-0 group-hover:opacity-100' : 'opacity-0 pointer-events-none hidden'}`}
                >
                  <ChevronLeft className="h-3 w-3" />
                </button>

                <div
                  ref={tabsRef}
                  onScroll={checkTabsScroll}
                  className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth snap-x min-w-0 flex-shrink"
                >
                  <SalesTabManager showAddButton={false} />
                </div>

                <button
                  onClick={() => scrollTabs('right')}
                  style={{ minHeight: 'unset' }}
                  className={`absolute -right-2.5 top-1/2 -translate-y-1/2 z-20 w-5 h-5 min-h-0 bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-white/10 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white shadow-md transition-opacity duration-200 active:scale-90 ${canScrollTabsRight ? 'opacity-0 group-hover:opacity-100' : 'opacity-0 pointer-events-none hidden'}`}
                >
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>

              {/* Add Tab Button - Placed statically outside the scrolling tabs list */}
              {state.salesTabs.length < 3 && (
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('create-new-tab'))}
                  style={{ minHeight: 'unset' }}
                  className="w-5 h-5 min-h-0 lg:w-8 lg:h-8 flex items-center justify-center bg-primary/10 text-primary dark:text-emerald-400 rounded-md lg:rounded-lg transition-all active:scale-90 border border-primary/20 hover:bg-primary hover:text-white shrink-0 z-10"
                  title="Add New Tab"
                >
                  <Plus className="h-3 w-3 lg:h-4 lg:w-4" />
                </button>
              )}

              <div className="h-4 w-[1px] bg-gray-100 dark:bg-white/10 shrink-0 hidden lg:block" />
              <GridDensityController />
            </div>

            <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
              <button
                onClick={() => setIsShortcutsModalOpen(true)}
                style={{ minHeight: 'unset' }}
                className="p-1.5 min-h-0 bg-gray-100 dark:bg-white/5 hover:bg-emerald-50 dark:hover:bg-primary/10 text-gray-500 dark:text-gray-400 hover:text-primary rounded-xl transition-all active:scale-95 flex items-center justify-center shrink-0"
                title={t('shortcuts_guide', 'Shortcuts Guide')}
              >
                <Keyboard className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>
              <div className="h-4 w-[1px] bg-gray-100 dark:bg-white/10 shrink-0 mx-0.5" />
              <span className={`text-[8px] sm:text-[10px] font-black uppercase tracking-widest leading-none ${isReturnMode ? 'text-red-600 dark:text-red-500' : 'text-gray-600 dark:text-gray-400'}`}>
                {isReturnMode ? t('return_mode', 'Return') : t('sale_mode', 'Sale')}
              </span>
              <label className="flex items-center cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isReturnMode}
                    onChange={(e) => {
                      setIsReturnMode(e.target.checked);
                      window.dispatchEvent(new CustomEvent('refocus-search'));
                    }}
                  />
                  <div className={`block w-7 h-4 lg:w-10 lg:h-6 rounded-full transition-colors ${isReturnMode ? 'bg-red-500 shadow-lg shadow-red-500/30' : 'bg-gray-300 dark:bg-white/10'}`}></div>
                  <div className={`dot absolute left-[2px] top-[2px] lg:left-1 lg:top-1 bg-white w-3 h-3 lg:w-4 lg:h-4 rounded-full transition-transform ${isReturnMode ? 'transform translate-x-[12px] lg:translate-x-4' : ''}`}></div>
                </div>
              </label>
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            <ProductGrid
              onAddToCart={addToCart}
              onOpenDrafts={() => setIsDraftsModalOpen(true)}
              onAddTab={() => window.dispatchEvent(new CustomEvent('create-new-tab'))}
              isReturnMode={isReturnMode}
            />
          </div>
        </div>

        {/* Floating Separate Desktop Cart - Fixed Height Pillar */}
        <div className={`hidden md:flex flex-col h-full p-2 lg:py-3 lg:pl-2 lg:pr-5 bg-gray-50 dark:bg-app flex-shrink-0 z-30 transition-all duration-300 overflow-hidden ${isTouchMode ? 'w-[410px]' : 'w-[340px]'}`}>
          <Cart onCheckout={handleCheckout} onSaveDraft={saveDraft} />
        </div>

        {/* Mobile + Tablet Cart Bottom Bar */}
        <div className="md:hidden fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-4 right-4 bg-black/90 border border-white/10 p-2 px-4 flex items-center justify-between z-40 rounded-[1.5rem] shadow-2xl transition-all animate-slide-up active:scale-[0.98]">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <div className="bg-primary p-1.5 rounded-xl shadow-lg shadow-emerald-500/20">
                <ShoppingCart className="h-4 w-4 text-white" />
              </div>
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-black w-4 h-4 flex items-center justify-center rounded-full ring-2 ring-black shadow-lg">
                {state.cart.reduce((sum, item) => sum + item.quantity, 0)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] text-gray-600 font-black uppercase tracking-widest opacity-60">{t('total', 'Total')}</span>
              <span className="font-black text-white text-base tracking-tighter leading-none">{formatCurrency(cartTotal, state.settings.currency)}</span>
            </div>
          </div>
          <button
            onClick={() => setIsMobileCartOpen(true)}
            className="bg-primary hover:bg-primary text-white px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-xl shadow-emerald-500/30 active:scale-95 transition-all"
          >
            {t('review_cart', 'Review Cart')}
          </button>
        </div>

        {/* Mobile + Tablet Cart Drawer */}
        {isMobileCartOpen && (
          <div 
            onTouchMove={(e) => e.preventDefault()}
            onClick={() => setIsMobileCartOpen(false)}
            className="md:hidden fixed inset-0 z-[80] bg-black/80 transition-opacity flex items-center justify-center p-4"
          >
            <div 
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-surface w-full h-[90vh] rounded-2xl shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200"
            >
              <Cart
                onCheckout={() => {
                  setIsMobileCartOpen(false);
                  handleCheckout();
                }}
                onSaveDraft={() => {
                  setIsMobileCartOpen(false);
                  saveDraft();
                }}
                isMobileDrawer={true}
                onClose={() => setIsMobileCartOpen(false)}
              />
            </div>
          </div>
        )}

        {showCheckout && (
          <CheckoutPage
            onClose={() => setShowCheckout(false)}
            onComplete={handleCheckoutComplete}
          />
        )}

        <DraftsModal
          isOpen={isDraftsModalOpen}
          onClose={() => setIsDraftsModalOpen(false)}
          onLoadDraft={loadDraft}
        />

        {optionsProduct && (
          <ProductOptionsModal
            product={optionsProduct}
            isOpen={!!optionsProduct}
            onClose={() => {
              setOptionsProduct(null);
              setPendingWeight(undefined);
            }}
            onConfirm={(options) => {
              addToCart(optionsProduct, pendingWeight, options);
              setOptionsProduct(null);
              setPendingWeight(undefined);
            }}
          />
        )}

        <ShortcutsModal
          isOpen={isShortcutsModalOpen}
          onClose={() => setIsShortcutsModalOpen(false)}
        />
      </div>
    </div>
  );
}