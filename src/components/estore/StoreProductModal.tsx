import React, { useState, useEffect } from 'react';
import { Product, CartItemTopping, ProductModifier } from '../../types';
import { X, Plus, Minus } from 'lucide-react';
import { formatCurrency } from '../../lib/currencies';
import { productToppingsService } from '../../lib/services';
import ExtraToppingSelector from '../common/ExtraToppingSelector';

interface StoreProductModalProps {
  product: Product;
  currency?: string;
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (product: Product, quantity: number, options: { selectedVariant?: string; selectedModifiers?: ProductModifier[]; toppings?: CartItemTopping[] }) => void;
}

export function StoreProductModal({ product, currency, isOpen, onClose, onAddToCart }: StoreProductModalProps) {
  const [quantity, setQuantity] = useState(1);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [selectedToppings, setSelectedToppings] = useState<CartItemTopping[]>([]);
  const [allowedToppingIds, setAllowedToppingIds] = useState<string[] | undefined>(undefined);

  useEffect(() => {
    if (isOpen) {
      setQuantity(1);
      setSelectedToppings([]);
      setAllowedToppingIds(undefined);
      productToppingsService.getByProduct(product.id)
        .then(setAllowedToppingIds)
        .catch(() => setAllowedToppingIds(undefined));

      const initial: Record<string, string> = {};
      if (product.variants && product.variants.length > 0) {
        product.variants.forEach(group => {
          if (group.options && group.options.length > 0) {
            initial[group.name] = group.options[0];
          }
        });
      }
      setSelectedVariants(initial);
    }
  }, [isOpen, product]);

  if (!isOpen) return null;

  const getVariantPrice = () => {
    if (Object.keys(selectedVariants).length === 0) return product.price;
    const variantString = Object.entries(selectedVariants)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
    const parts = variantString.split(',').map(s => s.trim());
    const match = product.variantData?.find(vd => {
      let m = true;
      if (vd.option1 && !parts.includes(vd.option1)) m = false;
      if (vd.option2 && !parts.includes(vd.option2)) m = false;
      if (vd.option3 && !parts.includes(vd.option3)) m = false;
      return m;
    });
    return match?.priceOverride !== undefined ? match.priceOverride : product.price;
  };

  const basePrice = getVariantPrice();
  const toppingsPrice = selectedToppings.reduce((sum, t) => sum + t.price, 0);
  const totalPrice = (basePrice + toppingsPrice) * quantity;

  const handleAdd = () => {
    const variantString = Object.entries(selectedVariants)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
    onAddToCart(product, quantity, {
      selectedVariant: variantString || undefined,
      selectedModifiers: undefined,
      toppings: selectedToppings.length > 0 ? selectedToppings : undefined
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} />
      
      <div className="relative w-full max-w-lg bg-[var(--color-card-bg)] rounded-[2rem] shadow-2xl flex flex-col max-h-[90vh] animate-scale-up overflow-hidden">
        
        {/* Image Header */}
        <div className="relative h-64 bg-gray-100 sm:rounded-t-[2rem] rounded-t-[2rem] overflow-hidden shrink-0">
          {product.image ? (
            <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
              <span className="font-black text-5xl text-gray-300">{product.name.charAt(0)}</span>
            </div>
          )}
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 w-10 h-10 bg-[var(--color-card-bg)]/50 backdrop-blur-md rounded-full flex items-center justify-center text-[var(--color-text)] hover:bg-[var(--color-card-bg)] transition-all shadow-sm"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <h2 className="text-2xl font-black text-[var(--color-text)] mb-2">{product.name}</h2>
            {product.description && <p className="text-gray-500 font-medium leading-relaxed">{product.description}</p>}
          </div>

          {/* Variants */}
          {product.variants && product.variants.length > 0 && (
            <div className="space-y-4">
              {product.variants.map((vGroup, idx) => (
                <div key={idx}>
                  <h3 className="font-black text-lg text-[var(--color-text)] mb-3">{vGroup.name}</h3>
                  <div className="flex flex-wrap gap-2">
                    {vGroup.options && vGroup.options.map(opt => {
                      const isSelected = selectedVariants[vGroup.name] === opt;
                      return (
                        <button
                          key={opt}
                          onClick={() => {
                            setSelectedVariants(prev => ({ ...prev, [vGroup.name]: opt }));
                          }}
                          className={`px-4 py-2 rounded-xl font-bold text-sm transition-all border ${isSelected ? 'bg-primary border-primary text-white shadow-md' : 'bg-[var(--color-card-bg)] border-black/10 dark:border-white/10 text-[var(--color-text)] opacity-80 hover:opacity-100 hover:border-black/20 dark:hover:border-white/20'}`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Extra Toppings */}
          <ExtraToppingSelector
            selectedToppings={selectedToppings}
            onChange={setSelectedToppings}
            allowedToppingIds={allowedToppingIds}
            size={(() => {
              const sizeOpt = Object.values(selectedVariants).find(v => /inch/i.test(v));
              if (!sizeOpt) return undefined;
              if (/6/i.test(sizeOpt)) return 'small' as const;
              if (/13/i.test(sizeOpt)) return 'large' as const;
              return 'medium' as const;
            })()}
          />
        </div>

        {/* Footer Actions */}
        <div className="p-6 bg-[var(--color-card-bg)] border-t border-gray-100 sm:rounded-b-[2rem] flex items-center gap-4 shrink-0">
          <div className="flex items-center justify-between bg-black/5 dark:bg-white/5 rounded-full p-1.5 w-32 shrink-0">
            <button 
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="w-10 h-10 rounded-full bg-[var(--color-card-bg)] text-[var(--color-text)] opacity-80 shadow-sm flex items-center justify-center hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 transition-all"
            >
              <Minus className="w-5 h-5" />
            </button>
            <span className="font-black text-xl text-[var(--color-text)] w-10 text-center">{quantity}</span>
            <button 
              onClick={() => setQuantity(quantity + 1)}
              className="w-10 h-10 rounded-full bg-primary text-white shadow-sm flex items-center justify-center hover:brightness-90 active:scale-95 transition-all"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
          
          <button 
            onClick={handleAdd}
            className="flex-1 py-4 bg-primary text-white rounded-full font-black text-lg flex items-center justify-between px-6 hover:brightness-90 active:scale-95 transition-all shadow-xl shadow-black/10"
          >
            <span>Add to Order</span>
            <span>{formatCurrency(totalPrice, currency)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
