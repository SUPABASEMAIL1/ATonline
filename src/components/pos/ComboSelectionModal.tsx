import React, { useState, useMemo, useEffect } from 'react';
import { X, CheckCircle, Package, Minus, Plus } from 'lucide-react';
import { Bundle, Product, CartItemTopping } from '../../types';
import { formatCurrency } from '../../lib/currencies';
import { useTranslation } from '../../hooks/useTranslation';
import { Modal } from '../common/Modal';
import ExtraToppingSelector from '../common/ExtraToppingSelector';

interface ComboSelectionModalProps {
  bundle: Bundle;
  products: Product[];
  currency: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedItems: { productId: string; quantity: number }[], toppingsMap?: Record<string, CartItemTopping[]>) => void;
}

export function ComboSelectionModal({
  bundle,
  products,
  currency,
  isOpen,
  onClose,
  onConfirm
}: ComboSelectionModalProps) {
  const { t } = useTranslation();
  
  // selections[slotId] = map of productId -> quantity
  const [selections, setSelections] = useState<Record<string, Record<string, number>>>({});
  const [toppingsSelections, setToppingsSelections] = useState<CartItemTopping[]>([]);

  // Reset selections when bundle changes or modal opens
  React.useEffect(() => {
    if (isOpen) {
      setSelections({});
      setToppingsSelections([]);
    }
  }, [isOpen, bundle.id]);

  const updateSelection = (slotId: string, productId: string, delta: number, maxRequired: number) => {
    setSelections(prev => {
      const slotSelections = prev[slotId] || {};
      const currentQty = slotSelections[productId] || 0;
      
      const totalSlotQty = Object.values(slotSelections).reduce((sum, qty) => sum + qty, 0);
      
      if (delta > 0 && totalSlotQty >= maxRequired) {
        // Can't add more than required
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
    return 'medium';
  }, [bundle.name]);

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

  const handleConfirm = () => {
    if (!isComplete) return;
    
    // Flatten selections into an array of { productId, quantity }
    // Combine quantities for the same product across different slots if necessary
    const combined: Record<string, number> = {};
    Object.values(selections).forEach(slotSelections => {
      Object.entries(slotSelections).forEach(([productId, qty]) => {
        combined[productId] = (combined[productId] || 0) + qty;
      });
    });
    
    const result = Object.entries(combined).map(([productId, quantity]) => ({
      productId,
      quantity
    }));
    
    // Apply deal-level toppings to ALL items
    const unifiedToppingsMap: Record<string, CartItemTopping[]> = {};
    if (toppingsSelections.length > 0) {
      result.forEach(item => {
        unifiedToppingsMap[item.productId] = toppingsSelections;
      });
    }
    
    onConfirm(result, unifiedToppingsMap);
  };

  const footerContent = (
    <button
      type="button"
      onClick={handleConfirm}
      disabled={!isComplete}
      className={`btn-md w-full flex items-center justify-center gap-2 ${
        isComplete ? 'btn-primary' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
      }`}
    >
      <CheckCircle className="h-4 w-4" />
      {t('add_to_cart', 'Add to Cart')}
    </button>
  );

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={bundle.name} 
      maxWidth="xl"
      footer={footerContent}
    >
      <div className="space-y-6">
        <div className="sticky top-0 z-10 -mx-5 sm:-mx-6 px-5 sm:px-6 bg-surface shadow-[0_1px_0_rgba(0,0,0,0.05)] dark:shadow-[0_1px_0_rgba(255,255,255,0.05)] pb-3 pt-3 -mt-5 sm:-mt-6 mb-4 border-0 space-y-1">
          <div className="flex justify-between items-center">
            <p className="text-[10px] sm:text-[11px] text-gray-500 uppercase tracking-widest">
              {t('configure_combo', 'Configure your choices')}
            </p>
            <div className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all shrink-0 ${
              totalSelected === totalRequired
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
            }`}>
              Selected: {totalSelected} / {totalRequired}
            </div>
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
          const sortedOptions = (slot.options || []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

          return (
            <div key={slot.id} className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-black">
                    {index + 1}
                  </span>
                  <h3 className="text-[12px] sm:text-sm font-black text-gray-900 dark:text-white uppercase">
                    {slot.name}
                  </h3>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {sortedOptions.map((opt, optIdx) => {
                  const product = products.find(p => p.id === opt.productId);
                  if (!product) return null;
                  const qty = slotSelections[opt.productId] || 0;
                  return (
                    <div 
                      key={opt.productId}
                      className={`flex flex-col gap-0 p-3 rounded-2xl border transition-all ${
                        qty > 0 
                        ? 'border-primary/50 bg-primary/5' 
                        : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.02]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex items-center justify-center h-5 w-5 rounded-full bg-gray-100 dark:bg-white/10 text-[9px] font-black text-gray-500 shrink-0">
                          {optIdx + 1}
                        </span>
                        <div className="h-8 w-8 bg-gray-100 dark:bg-white/10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden aspect-square">
                          {product.image ? (
                            <img src={product.image} className="h-full w-full object-cover" alt={product.name} />
                          ) : (
                            <Package className="h-4 w-4 text-gray-400" />
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-black text-gray-900 dark:text-white uppercase leading-tight">
                              {product.name}
                            </p>
                          <p className="text-[9px] text-gray-500 mt-0.5">
                            {formatCurrency(product.price, currency)}
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-1 shrink-0 bg-gray-50 dark:bg-white/5 rounded-lg p-0.5">
                          <button
                            type="button"
                            onClick={() => updateSelection(slot.id, opt.productId, -1, slot.requiredQuantity)}
                            disabled={qty === 0}
                            className={`h-7 w-7 rounded-md flex items-center justify-center transition-all ${
                              qty > 0 
                                ? 'text-gray-600 hover:bg-white dark:hover:bg-white/10 shadow-sm' 
                                : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                            }`}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-5 text-center text-[12px] font-black text-gray-900 dark:text-white">
                            {qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateSelection(slot.id, opt.productId, 1, slot.requiredQuantity)}
                            disabled={remaining === 0}
                            className={`h-7 w-7 rounded-md flex items-center justify-center transition-all ${
                              remaining > 0 
                                ? 'text-primary hover:bg-white dark:hover:bg-white/10 shadow-sm' 
                                : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                            }`}
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

      {/* Deal-level Extra Toppings — once for the entire deal */}
      {isComplete && (
        <div className="rounded-xl border-2 bg-green-50 dark:bg-green-900/10 border-green-300 dark:border-green-700 p-4 mt-4 animate-in fade-in slide-in-from-top-1 duration-300 min-h-[60px]">
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
    </Modal>
  );
}
