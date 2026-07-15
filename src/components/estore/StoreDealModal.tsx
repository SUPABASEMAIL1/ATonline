import React, { useState, useEffect, useMemo } from 'react';
import { X, Plus, Minus, Check, Gift, Package } from 'lucide-react';
import { Bundle, Product, CartItem } from '../../types';
import { formatCurrency } from '../../lib/currencies';
import { bundlesService } from '../../lib/services';
import { sonner } from '../../lib/sonner';

interface StoreDealModalProps {
  bundle: Bundle;
  products: Product[];
  currency?: string;
  isOpen: boolean;
  onClose: () => void;
  onAddBundle: (cartItems: CartItem[]) => void;
}

export function StoreDealModal({ bundle, products, currency, isOpen, onClose, onAddBundle }: StoreDealModalProps) {
  // selections[slotId] = map of productId -> quantity
  const [selections, setSelections] = useState<Record<string, Record<string, number>>>({});

  // Reset selections when bundle changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setSelections({});
    }
  }, [isOpen, bundle.id]);

  if (!isOpen) return null;

  // Calculate pricing
  const { totalPrice, dealPrice, discountAmount } = useMemo(() => {
    let total = 0;
    if (bundle.isCombo && bundle.slots) {
      total = bundle.slots.reduce((sum, slot) => {
        const maxPriceOpt = slot.options?.reduce((max, opt) => {
          const p = products.find(pr => pr.id === opt.productId);
          return Math.max(max, p ? p.price : 0);
        }, 0) || 0;
        return sum + (maxPriceOpt * slot.requiredQuantity);
      }, 0);
    } else {
      total = (bundle.items || []).reduce((sum, bi) => {
        const p = products.find(pr => pr.id === bi.productId);
        return sum + (p ? p.price * bi.quantity : 0);
      }, 0);
    }

    const discount = bundle.discountType === 'percentage'
      ? (total * bundle.discountValue) / 100
      : Math.min(bundle.discountValue, total);

    return {
      totalPrice: total,
      discountAmount: discount,
      dealPrice: Math.max(0, total - discount)
    };
  }, [bundle, products]);

  // Combo choice completeness check
  const isComplete = useMemo(() => {
    if (!bundle.slots) return false;
    return bundle.slots.every(slot => {
      const slotSelections = selections[slot.id] || {};
      const totalSlotQty = Object.values(slotSelections).reduce((sum, qty) => sum + qty, 0);
      return totalSlotQty === slot.requiredQuantity;
    });
  }, [bundle.slots, selections]);

  const totalSelected = useMemo(() => {
    return Object.values(selections).reduce((sum, slotSelections) => {
      return sum + Object.values(slotSelections).reduce((slotSum, qty) => slotSum + qty, 0);
    }, 0);
  }, [selections]);

  const totalRequired = useMemo(() => {
    if (!bundle.slots) return 0;
    return bundle.slots.reduce((sum, slot) => sum + slot.requiredQuantity, 0);
  }, [bundle.slots]);

  const updateSelection = (slotId: string, productId: string, delta: number, maxRequired: number) => {
    setSelections(prev => {
      const slotSelections = prev[slotId] || {};
      const currentQty = slotSelections[productId] || 0;
      const totalSlotQty = Object.values(slotSelections).reduce((sum, qty) => sum + qty, 0);

      if (delta > 0 && totalSlotQty >= maxRequired) {
        return prev;
      }

      const newQty = Math.max(0, currentQty + delta);
      const newSlotSelections = { ...slotSelections };

      if (newQty === 0) {
        delete newSlotSelections[productId];
      } else {
        newSlotSelections[productId] = newQty;
      }

      return {
        ...prev,
        [slotId]: newSlotSelections
      };
    });
  };

  const handleAdd = () => {
    try {
      let effectiveItems = bundle.items || [];

      if (bundle.isCombo) {
        if (!isComplete) return;
        const combined: Record<string, number> = {};
        Object.values(selections).forEach(slotSelections => {
          Object.entries(slotSelections).forEach(([productId, qty]) => {
            combined[productId] = (combined[productId] || 0) + qty;
          });
        });
        effectiveItems = Object.entries(combined).map(([productId, quantity]) => ({
          id: `${bundle.id}-${productId}`,
          bundleId: bundle.id,
          productId,
          quantity
        }));
      }

      const effectiveBundle = { ...bundle, items: effectiveItems };
      const cartItems = bundlesService.getBundleCartItems(effectiveBundle, products);

      if (!cartItems || cartItems.length === 0) {
        sonner.error('No products available in this deal');
        return;
      }

      onAddBundle(cartItems);
      sonner.success(`🎁 ${bundle.name} added to cart!`);
      onClose();
    } catch (e) {
      console.error(e);
      sonner.error('Failed to add deal');
    }
  };

  // Get preview images of products in the bundle (up to 4)
  const previewProducts = useMemo(() => {
    if (bundle.isCombo && bundle.slots) {
      const allOptIds = bundle.slots.flatMap(s => s.options?.map(o => o.productId) || []);
      const uniqueIds = Array.from(new Set(allOptIds));
      return uniqueIds.map(id => products.find(p => p.id === id)).filter(Boolean) as Product[];
    } else {
      return (bundle.items || []).map(bi => products.find(p => p.id === bi.productId)).filter(Boolean) as Product[];
    }
  }, [bundle, products]);

  const bannerImage = previewProducts[0]?.image || null;

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="relative w-full max-w-xl bg-[var(--color-card-bg)] sm:rounded-[2rem] rounded-t-[2rem] shadow-2xl flex flex-col max-h-[90vh] animate-slide-up sm:animate-in sm:zoom-in-95 overflow-hidden">
        
        {/* Close button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-50 p-2 bg-black/40 hover:bg-black/60 text-white rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Banner with multiple images if available */}
        <div className="relative w-full aspect-[900/650] bg-slate-950 shrink-0">
          {bundle.image ? (
            <img src={bundle.image} alt={bundle.name} className="w-full h-full object-contain" />
          ) : previewProducts.length > 0 ? (
            <div className={`grid h-full w-full ${previewProducts.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {previewProducts.slice(0, 4).map((product, idx) => (
                <div key={product.id || idx} className="relative h-full w-full overflow-hidden bg-black/10">
                  {product.image ? (
                    <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-600 bg-gray-100 dark:bg-white/5">
                      <Package className="h-8 w-8" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Gift className="h-16 w-16 text-primary" />
            </div>
          )}
          
          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
          
          <div className="absolute bottom-4 left-6 right-6 text-white">
            <span className="bg-red-500 text-white text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full inline-block mb-2 shadow">
              {bundle.discountType === 'percentage' ? `-${bundle.discountValue}%` : `-${bundle.discountValue}`} OFF Deal
            </span>
            <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight leading-tight line-clamp-1">{bundle.name}</h2>
            {bundle.description && (
              <p className="text-xs text-white/70 line-clamp-1 mt-1 font-medium">{bundle.description}</p>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 scrollbar-hide">
          {bundle.isCombo ? (
            // Combo Deal choices selection
            <div className="space-y-6">
              <div className="flex justify-between items-center bg-primary/5 p-3 rounded-2xl border border-primary/10">
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                  Choose your items:
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                  totalSelected === totalRequired
                    ? 'bg-emerald-500 text-white'
                    : 'bg-orange-500/10 text-orange-600'
                }`}>
                  Selected: {totalSelected} / {totalRequired}
                </span>
              </div>

              {bundle.slots?.map((slot, index) => {
                const slotSelections = selections[slot.id] || {};
                const totalSlotQty = Object.values(slotSelections).reduce((sum, qty) => sum + qty, 0);
                const remaining = slot.requiredQuantity - totalSlotQty;
                const isSlotComplete = remaining === 0;

                return (
                  <div key={slot.id} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-black">
                        {index + 1}
                      </span>
                      <h3 className="text-xs sm:text-sm font-black text-[var(--color-text)] uppercase tracking-wider">
                        {slot.name} <span className="text-gray-400 font-medium normal-case">(Pick {slot.requiredQuantity})</span>
                      </h3>
                      {isSlotComplete && (
                        <Check className="h-4 w-4 text-emerald-500 ml-auto shrink-0" />
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {slot.options?.map(opt => {
                        const product = products.find(p => p.id === opt.productId);
                        if (!product) return null;
                        const qty = slotSelections[opt.productId] || 0;

                        return (
                          <div 
                            key={opt.productId}
                            className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${
                              qty > 0 
                                ? 'border-primary bg-primary/5 shadow-sm' 
                                : 'border-black/5 dark:border-white/5 bg-black/[0.01] dark:bg-white/[0.01]'
                            }`}
                          >
                            <div className="h-10 w-10 bg-gray-100 dark:bg-white/5 rounded-xl overflow-hidden shrink-0">
                              {product.image ? (
                                <img src={product.image} className="h-full w-full object-cover" alt={product.name} />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center text-gray-400">
                                  <Package className="h-5 w-5" />
                                </div>
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-black text-[var(--color-text)] uppercase truncate">{product.name}</p>
                              <p className="text-[9px] text-[var(--color-text)] opacity-50 mt-0.5">
                                {formatCurrency(product.price, currency)}
                              </p>
                            </div>

                            <div className="flex items-center gap-1 shrink-0 bg-black/5 dark:bg-white/5 rounded-lg p-0.5">
                              <button
                                type="button"
                                onClick={() => updateSelection(slot.id, opt.productId, -1, slot.requiredQuantity)}
                                disabled={qty === 0}
                                className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-[var(--color-card-bg)] text-gray-500 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="w-5 text-center text-xs font-black text-[var(--color-text)]">
                                {qty}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateSelection(slot.id, opt.productId, 1, slot.requiredQuantity)}
                                disabled={remaining === 0}
                                className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-[var(--color-card-bg)] text-primary disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            // Fixed Bundle contents display
            <div className="space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-[var(--color-text)] opacity-60">
                Included in this bundle deal:
              </h3>
              <div className="divide-y divide-black/5 dark:divide-white/5">
                {(bundle.items || []).map(bi => {
                  const product = products.find(p => p.id === bi.productId);
                  if (!product) return null;
                  return (
                    <div key={bi.productId} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-gray-100 dark:bg-white/5 rounded-xl overflow-hidden shrink-0">
                          {product.image ? (
                            <img src={product.image} className="h-full w-full object-cover" alt={product.name} />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-gray-400">
                              <Package className="h-5 w-5" />
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-black text-[var(--color-text)] uppercase">{product.name}</p>
                          <p className="text-[10px] text-[var(--color-text)] opacity-50 mt-0.5">
                            {formatCurrency(product.price, currency)} each
                          </p>
                        </div>
                      </div>
                      <span className="bg-primary/10 text-primary text-xs font-black px-3 py-1 rounded-xl">
                        Qty: {bi.quantity}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div className="px-6 py-4 border-t border-black/5 dark:border-white/5 bg-gray-50/50 dark:bg-white/[0.01] shrink-0 flex items-center justify-between gap-4">
          <div>
            {totalPrice > 0 && (
              <span className="text-[10px] text-[var(--color-text)] opacity-40 line-through font-bold block">
                {formatCurrency(totalPrice, currency)}
              </span>
            )}
            <span className="text-2xl font-black text-primary">
              {formatCurrency(dealPrice, currency)}
            </span>
          </div>

          <button
            onClick={handleAdd}
            disabled={bundle.isCombo && !isComplete}
            className="flex-1 max-w-[200px] py-3.5 bg-primary text-white rounded-full font-black text-sm hover:brightness-95 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100 shadow-md shadow-primary/20"
          >
            Add Deal to Cart
          </button>
        </div>

      </div>
    </div>
  );
}
