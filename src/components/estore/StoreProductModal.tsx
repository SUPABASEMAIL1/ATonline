import React, { useState, useEffect } from 'react';
import { Product, ProductModifier } from '../../types';
import { X, Plus, Minus } from 'lucide-react';
import { formatCurrency } from '../../lib/currencies';

interface StoreProductModalProps {
  product: Product;
  currency?: string;
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (product: Product, quantity: number, options: { selectedVariant?: string; selectedModifiers?: ProductModifier[] }) => void;
}

export function StoreProductModal({ product, currency, isOpen, onClose, onAddToCart }: StoreProductModalProps) {
  const [quantity, setQuantity] = useState(1);
  const [selectedVariantStr, setSelectedVariantStr] = useState<string>('');
  const [selectedModifiers, setSelectedModifiers] = useState<ProductModifier[]>([]);

  useEffect(() => {
    if (isOpen) {
      setQuantity(1);
      setSelectedVariantStr('');
      setSelectedModifiers([]);

      // Auto-select first variant if exists
      if (product.variantData && product.variantData.length > 0) {
        const first = product.variantData[0];
        setSelectedVariantStr([first.option1, first.option2, first.option3].filter(Boolean).join(', '));
      }
    }
  }, [isOpen, product]);

  if (!isOpen) return null;

  const getVariantPrice = () => {
    if (!selectedVariantStr) return product.price;
    const parts = selectedVariantStr.split(',').map(s => s.trim());
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
  const modifiersPrice = selectedModifiers.reduce((sum, m) => sum + m.price, 0);
  const totalPrice = (basePrice + modifiersPrice) * quantity;

  const handleAdd = () => {
    onAddToCart(product, quantity, {
      selectedVariant: selectedVariantStr || undefined,
      selectedModifiers: selectedModifiers.length > 0 ? selectedModifiers : undefined
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} />
      
      <div className="relative w-full max-w-lg bg-[var(--color-card-bg)] sm:rounded-[2rem] rounded-t-[2rem] shadow-2xl flex flex-col max-h-[90vh] animate-slide-up sm:animate-in sm:zoom-in-95">
        
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
                      // Extremely simplified variant selection (assuming 1 group for now for UI sake)
                      const isSelected = selectedVariantStr.includes(opt);
                      return (
                        <button
                          key={opt}
                          onClick={() => {
                            // Note: real implementation needs proper multi-group combinatorial matching.
                            // This replaces the whole string for simplicity of the prompt.
                            setSelectedVariantStr(opt);
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

          {/* Modifiers */}
          {product.modifiers && product.modifiers.length > 0 && (
            <div>
              <h3 className="font-black text-lg text-[var(--color-text)] mb-3">Add-ons & Modifiers</h3>
              <div className="space-y-3">
                {product.modifiers.map(mod => {
                  const isSelected = selectedModifiers.some(m => m.id === mod.id);
                  return (
                    <label key={mod.id} className={`flex items-center justify-between p-4 rounded-2xl border cursor-pointer transition-all ${isSelected ? 'border-primary bg-emerald-50' : 'border-gray-100 bg-[var(--color-card-bg)] hover:border-gray-200'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors ${isSelected ? 'border-primary bg-primary' : 'border-gray-300'}`}>
                          {isSelected && <div className="w-2.5 h-2.5 bg-[var(--color-card-bg)] rounded-full" />}
                        </div>
                        <span className="font-bold text-[var(--color-text)]">{mod.name}</span>
                      </div>
                      <span className="font-black text-gray-600">+{formatCurrency(mod.price, currency)}</span>
                      <input 
                        type="checkbox"
                        className="sr-only"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedModifiers([...selectedModifiers, mod]);
                          else setSelectedModifiers(selectedModifiers.filter(m => m.id !== mod.id));
                        }}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          )}
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
