import React, { useState, useEffect, useMemo } from 'react';
import { X, Plus, Minus, Check, Gift, Package, Timer, Flame } from 'lucide-react';
import { Bundle, Product, CartItem, CartItemTopping } from '../../types';
import { formatCurrency } from '../../lib/currencies';
import { bundlesService } from '../../lib/services';
import { sonner } from '../../lib/sonner';
import ExtraToppingSelector from '../common/ExtraToppingSelector';

const Dealtimer = ({ bundle }: { bundle: Bundle }) => {
  const [display, setDisplay] = useState('');
  useEffect(() => {
    if (!bundle.scheduleType || bundle.scheduleType === 'always') return;
    const tick = () => {
      const now = new Date();
      let target: number | null = null;
      if (bundle.endTime) {
        const [eh, em] = bundle.endTime.split(':').map(Number);
        const endToday = new Date(now);
        endToday.setHours(eh, em, 0, 0);
        let diff = endToday.getTime() - now.getTime();
        if (diff > 0) target = diff;
        if (diff < 0 && bundle.startTime && bundle.startTime > bundle.endTime) {
          endToday.setDate(endToday.getDate() + 1);
          diff = endToday.getTime() - now.getTime();
          if (diff > 0) target = diff;
        }
      }
      if (!target && bundle.endDate) {
        target = new Date(bundle.endDate + 'T23:59:59').getTime() - now.getTime();
      }
      if (target && target > 0) {
        const h = Math.floor(target / 3600000);
        const m = Math.floor((target % 3600000) / 60000);
        const s = Math.floor((target % 60000) / 1000);
        setDisplay(h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`);
      } else { setDisplay(''); }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [bundle]);
  if (!display) return null;
  return (
    <div className="flex items-center gap-1 mt-2 text-white/80 text-[11px] font-black">
      <Timer className="h-3.5 w-3.5" />
      <span className="tabular-nums">{display}</span>
    </div>
  );
};

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
  const [toppingsSelections, setToppingsSelections] = useState<CartItemTopping[]>([]);
  const [selectedSizeTier, setSelectedSizeTier] = useState(0);

  // Reset selections when bundle changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setSelections({});
      setToppingsSelections([]);
      setSelectedSizeTier(0);
    }
  }, [isOpen, bundle.id]);

  if (!isOpen) return null;

  const nameBasedTier = useMemo(() => {
    const lower = bundle.name.toLowerCase();
    if (lower.includes(' - large')) return 1;
    if (lower.includes(' - medium')) return 0;
    if (lower.includes(' - small')) return 0;
    return -1;
  }, [bundle]);

  const effectiveTier = nameBasedTier >= 0 ? nameBasedTier : selectedSizeTier;

  // Calculate pricing
  const { totalPrice, dealPrice, discountAmount } = useMemo(() => {
    const getItemPrice = (p: Product | undefined, qty: number): number => {
      if (!p) return 0;
      const tier = nameBasedTier >= 0 ? nameBasedTier : selectedSizeTier;
      if (p.variantData && p.variantData.length > tier) {
        return (p.variantData[tier].priceOverride ?? p.price) * qty;
      }
      return p.price * qty;
    };

    let total = 0;
    if (bundle.isCombo && bundle.slots) {
      total = bundle.slots.reduce((sum, slot) => {
        const slotSelections = selections[slot.id] || {};
        const selectedIds = Object.keys(slotSelections);
        if (selectedIds.length > 0) {
          return sum + Object.entries(slotSelections).reduce((slotSum, [productId, qty]) => {
            const p = products.find(pr => pr.id === productId);
            return slotSum + getItemPrice(p, qty);
          }, 0);
        }
        const maxPriceOpt = slot.options?.reduce((max, opt) => {
          const p = products.find(pr => pr.id === opt.productId);
          return Math.max(max, p ? getItemPrice(p, 1) : 0);
        }, 0) || 0;
        return sum + (maxPriceOpt * slot.requiredQuantity);
      }, 0);
    } else {
      total = (bundle.items || []).reduce((sum, bi) => {
        const p = products.find(pr => pr.id === bi.productId);
        return sum + getItemPrice(p, bi.quantity);
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
  }, [bundle, products, selectedSizeTier, selections]);

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

  const dealSize = useMemo((): 'small' | 'medium' | 'large' => {
    const lower = bundle.name.toLowerCase();
    if (lower.includes(' - small')) return 'small';
    if (lower.includes(' - medium')) return 'medium';
    if (lower.includes(' - large')) return 'large';
    if (selectedSizeTier === 2) return 'large';
    if (selectedSizeTier === 1) return 'medium';
    return 'medium';
  }, [bundle.name, selectedSizeTier]);

  const showSizeToggle = useMemo(() => {
    if (bundle.overridePrice !== undefined && bundle.overridePrice !== null) return false;
    if (nameBasedTier >= 0) return false;
    if (bundle.isCombo && bundle.slots) {
      const allOptIds = bundle.slots.flatMap(s => s.options?.map(o => o.productId) || []);
      return allOptIds.length > 0 && allOptIds.every(pid => {
        const p = products.find(pr => pr.id === pid);
        return p?.variantData && p.variantData.length >= 2;
      });
    }
    return (bundle.items || []).length > 0 && (bundle.items || []).every(bi => {
      const p = products.find(pr => pr.id === bi.productId);
      return p?.variantData && p.variantData.length >= 2;
    });
  }, [bundle, products]);

  const tierLabels = useMemo(() => {
    let firstProductId: string | undefined;
    if (bundle.isCombo && bundle.slots) {
      firstProductId = bundle.slots[0]?.options?.[0]?.productId;
    } else {
      firstProductId = bundle.items?.[0]?.productId;
    }
    const p = products.find(pr => pr.id === firstProductId);
    return p?.variantData?.map((vd: any) => {
      const label = vd.option1 || vd.name || '';
      if (/10/i.test(label)) return 'Medium (10")';
      if (/13/i.test(label)) return 'Large (13")';
      return label;
    }) || ['Medium', 'Large'];
  }, [bundle, products]);

  const selectedItemsList = useMemo(() => {
    const result: string[] = [];
    Object.entries(selections).forEach(([slotId, slotSelections]) => {
      Object.entries(slotSelections).forEach(([productId, qty]) => {
        const product = products.find(p => p.id === productId);
        if (product) {
          result.push(`${product.name}${qty > 1 ? ' \u00d7' + qty : ''}`);
        }
      });
    });
    return result;
  }, [selections, products]);

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

      // Apply variant pricing when size tier is selected
      const sizedCartItems = effectiveTier > 0 ? cartItems.map(item => {
        const p = products.find(pr => pr.id === item.product.id);
        if (p?.variantData?.[effectiveTier]?.priceOverride) {
          const vp = p.variantData[effectiveTier].priceOverride;
          return {
            ...item,
            subtotal: (vp * item.quantity) - item.discount,
            selectedVariant: p.variantData[effectiveTier].option1 || undefined,
          };
        }
        return item;
      }) : cartItems;

      // Merge deal-level toppings into ALL cart items (price added only once)
      const finalCartItems = sizedCartItems.map((item, idx) => {
        if (toppingsSelections.length > 0) {
          if (idx === 0) {
            const toppingsPrice = toppingsSelections.reduce((sum, t) => sum + t.price, 0);
            return {
              ...item,
              toppings: toppingsSelections,
              subtotal: item.subtotal + (toppingsPrice * item.quantity),
            };
          }
        }
        return item;
      });

      onAddBundle(finalCartItems);
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
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="relative w-full max-w-3xl bg-[var(--color-card-bg)] rounded-[2rem] shadow-2xl flex flex-col max-h-[90vh] animate-scale-up overflow-hidden">
        
        {/* Close button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-50 p-2 bg-black/40 hover:bg-black/60 text-white rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Banner with multiple images if available */}
        <div className="relative w-full aspect-[900/650] max-h-48 sm:max-h-64 bg-slate-950 shrink-0">
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
            <div className="flex items-center gap-2 mb-2">
              {bundle.overridePrice !== undefined && bundle.overridePrice !== null || bundle.discountValue === 0 ? null : (
                <span className="bg-red-500 text-white text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full inline-block shadow">
                  {bundle.discountType === 'percentage' ? `-${bundle.discountValue}%` : `-${bundle.discountValue}`} OFF Deal
                </span>
              )}
              {bundle.scheduleType === 'scheduled' && (
                <span className="bg-amber-500 text-white text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full inline-block shadow flex items-center gap-1">
                  <Flame className="h-3 w-3" /> Hot Deal
                </span>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight leading-tight line-clamp-1">{bundle.name}</h2>
            {bundle.description && (
              <p className="text-xs text-white/70 line-clamp-1 mt-1 font-medium">{bundle.description}</p>
            )}
            {bundle.scheduleType === 'scheduled' && (
              <Dealtimer bundle={bundle} />
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 scrollbar-hide">
          {bundle.isCombo ? (
            // Combo Deal choices selection
            <div className="space-y-6">
              {/* Size tier toggle for slot-based bundles with variant items */}
              {showSizeToggle && (
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-[var(--color-text)] opacity-60 mb-3">Size</h3>
                  <div className="flex gap-2">
                    {tierLabels.map((label: string, idx: number) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedSizeTier(idx)}
                        className={`px-4 py-2 rounded-xl font-bold text-sm transition-all border ${
                          selectedSizeTier === idx
                            ? 'bg-primary border-primary text-white shadow-md'
                            : 'bg-[var(--color-card-bg)] border-black/10 dark:border-white/10 text-[var(--color-text)] opacity-80 hover:opacity-100'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="sticky top-0 z-10 bg-[var(--color-card-bg)] p-3 rounded-2xl border border-primary/10 shadow-sm space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                    Choose your items:
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest shrink-0 ${
                    totalSelected === totalRequired
                      ? 'bg-emerald-500 text-white'
                      : 'bg-orange-500/10 text-orange-600'
                  }`}>
                    Selected: {totalSelected} / {totalRequired}
                  </span>
                </div>
                {selectedItemsList.length > 0 && (
                  <p className="text-[9px] text-gray-500 font-medium leading-tight">
                    {selectedItemsList.join(', ')}
                  </p>
                )}
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
                      {(slot.options || [])
                        .slice()
                        .sort((a, b) => {
                          const pa = products.find(p => p.id === a.productId);
                          const pb = products.find(p => p.id === b.productId);
                          return (pa?.menuNumber ?? 999) - (pb?.menuNumber ?? 999);
                        })
                        .map((opt, optIdx) => {
                        const product = products.find(p => p.id === opt.productId);
                        if (!product) return null;
                        const qty = slotSelections[opt.productId] || 0;

                        return (
                          <div 
                            key={opt.productId}
                            className={`flex flex-col gap-0 p-3 rounded-2xl border transition-all ${
                              qty > 0 
                                ? 'border-primary bg-primary/5 shadow-sm' 
                                : 'border-black/5 dark:border-white/5 bg-black/[0.01] dark:bg-white/[0.01]'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex items-center justify-center h-5 w-5 rounded-full bg-gray-100 dark:bg-white/10 text-[9px] font-black text-gray-500 shrink-0">
                                {product.menuNumber || optIdx + 1}
                              </span>
                              <div className="h-8 w-8 bg-gray-100 dark:bg-white/5 rounded-lg overflow-hidden shrink-0">
                                {product.image ? (
                                  <img src={product.image} className="h-full w-full object-cover" alt={product.name} />
                                ) : (
                                  <div className="h-full w-full flex items-center justify-center text-gray-400">
                                    <Package className="h-4 w-4" />
                                  </div>
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-black text-[var(--color-text)] uppercase leading-tight">{product.name}</p>
                                <p className="text-[9px] text-[var(--color-text)] opacity-50 mt-0.5">
                                  {formatCurrency(
                                    (product.variantData && product.variantData.length > effectiveTier)
                                      ? (product.variantData[effectiveTier].priceOverride ?? product.price)
                                      : product.price,
                                    currency
                                  )}
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
              {/* Size tier toggle for bundles with variant items */}
              {showSizeToggle && (
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-[var(--color-text)] opacity-60 mb-3">Size</h3>
                  <div className="flex gap-2">
                    {tierLabels.map((label: string, idx: number) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedSizeTier(idx)}
                        className={`px-4 py-2 rounded-xl font-bold text-sm transition-all border ${
                          selectedSizeTier === idx
                            ? 'bg-primary border-primary text-white shadow-md'
                            : 'bg-[var(--color-card-bg)] border-black/10 dark:border-white/10 text-[var(--color-text)] opacity-80 hover:opacity-100'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <h3 className="text-xs font-black uppercase tracking-widest text-[var(--color-text)] opacity-60">
                Included in this bundle deal:
              </h3>
              <div className="divide-y divide-black/5 dark:divide-white/5">
                {(bundle.items || []).map((bi, bIdx) => {
                  const product = products.find(p => p.id === bi.productId);
                  if (!product) return null;
                  const itemPrice = (product.variantData && product.variantData.length > effectiveTier)
                    ? (product.variantData[effectiveTier].priceOverride ?? product.price)
                    : product.price;
                  return (
                    <div key={bi.productId} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 text-[10px] font-bold shrink-0">{bIdx + 1}</span>
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
                            {formatCurrency(itemPrice, currency)} each
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

        {/* Deal-level Extra Toppings — once for the entire deal */}
        {isComplete && (
          <div className="mx-4 mb-2 rounded-xl border-2 bg-green-50 dark:bg-green-900/10 border-green-300 dark:border-green-700 p-4 animate-in fade-in slide-in-from-top-1 duration-300 min-h-[60px]">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">✨</span>
              <span className="text-xs font-black uppercase tracking-widest text-green-700 dark:text-green-300">
                Extra Toppings
              </span>
            </div>
            <ExtraToppingSelector
              selectedToppings={toppingsSelections}
              onChange={setToppingsSelections}
              size={dealSize}
              toppings={bundle.extraToppings?.filter(t => t.active !== false) as any[]}
            />
          </div>
        )}

        {/* Footer controls */}
        <div className="px-6 py-4 border-t border-black/5 dark:border-white/5 bg-gray-50/50 dark:bg-white/[0.01] shrink-0 flex items-center justify-between gap-4">
          <div>
            {bundle.overridePrice !== undefined && bundle.overridePrice !== null ? (
              <span className="text-2xl font-black text-primary">
                {formatCurrency(bundle.overridePrice, currency)}
              </span>
            ) : totalPrice > 0 && dealPrice < totalPrice ? (
              <>
                <span className="text-[10px] text-[var(--color-text)] opacity-40 line-through font-bold block">
                  {formatCurrency(totalPrice, currency)}
                </span>
                <span className="text-2xl font-black text-primary">
                  {formatCurrency(dealPrice, currency)}
                </span>
              </>
            ) : (
              <span className="text-2xl font-black text-primary">
                {formatCurrency(dealPrice, currency)}
              </span>
            )}
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
