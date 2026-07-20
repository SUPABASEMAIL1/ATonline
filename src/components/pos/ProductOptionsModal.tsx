import React, { useState } from 'react';
import { Product, ProductVariant, CartAddonItem, ProductAddon } from '../../types';
import { X, Check, Plus, Minus } from 'lucide-react';
import { Modal } from '../common/Modal';
import { formatCurrency } from '../../lib/currencies';
import { useApp } from '../../context/SupabaseAppContext';
import { useTranslation } from '../../hooks/useTranslation';

interface ProductOptionsModalProps {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (options: {
    selectedVariant?: string;
    selectedVariantId?: string;
    selectedVariantLabel?: string;
    addonItems?: CartAddonItem[];
    serialNumber?: string;
    overrideProduct?: Product;
  }) => void;
}

export function ProductOptionsModal({ product, isOpen, onClose, onConfirm }: ProductOptionsModalProps) {
  const { state } = useApp();
  const { t } = useTranslation();
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [selectedVariationChildId, setSelectedVariationChildId] = useState<string>('');
  const [addonItems, setAddonItems] = useState<CartAddonItem[]>([]);
  const [serialNumber, setSerialNumber] = useState('');

  const childVariations = product.productType === 'variable' 
    ? state.products.filter(p => p.parentId === product.id && p.productType === 'variation')
    : [];

  if (!isOpen) return null;

  const handleConfirm = () => {
    let overrideProduct: Product | undefined;

    if (product.productType === 'variable') {
      overrideProduct = childVariations.find(c => c.id === selectedVariationChildId);
      if (!overrideProduct) return;
    } else if (product.variants && product.variants.length > 0) {
      for (const variant of product.variants) {
        if (!selectedVariants[variant.name]) {
          return;
        }
      }
    }

    if (product.requireSerial && !serialNumber.trim()) {
      return;
    }

    let selectedVariantId: string | undefined;
    let selectedVariantLabel: string | undefined;
    if (variantString && product.variantData && product.variantData.length > 0 && product.productType !== 'variable') {
      const selectedParts = variantString.split(',').map(s => s.trim());
      const matchingVariant = product.variantData.find(vd => {
        let match = true;
        if (vd.option1 && !selectedParts.includes(vd.option1)) match = false;
        if (vd.option2 && !selectedParts.includes(vd.option2)) match = false;
        return match;
      });
      if (matchingVariant) {
        if (matchingVariant.trackInventory && (matchingVariant.stock ?? 0) <= 0) {
          return;
        }
        selectedVariantId = matchingVariant.id;
        selectedVariantLabel = matchingVariant.cardTitle || variantString;
      }
    }

    onConfirm({
      selectedVariant: variantString || undefined,
      selectedVariantId,
      selectedVariantLabel,
      addonItems: addonItems.length > 0 ? addonItems : undefined,
      serialNumber: serialNumber.trim() || undefined,
      overrideProduct
    });
  };

  const updateAddonQuantity = (addon: ProductAddon, delta: number) => {
    setAddonItems(current => {
      const existing = current.find(item => item.addon.id === addon.id);
      const currentQty = existing ? existing.quantity : 0;
      const newQty = Math.max(0, Math.min(currentQty + delta, addon.maxQty || 1));
      
      // Also check addon product stock if trackInventory is true
      const addonProduct = state.products.find(p => p.id === addon.addonProductId);
      const stockLimit = addonProduct && addonProduct.trackInventory ? (addonProduct.stock || 0) : 999999;
      if (newQty > stockLimit) return current; // Don't allow adding more than stock

      if (newQty === 0) {
        return current.filter(item => item.addon.id !== addon.id);
      }

      if (existing) {
        return current.map(item => 
          item.addon.id === addon.id 
            ? { ...item, quantity: newQty, subtotal: newQty * addon.price }
            : item
        );
      }

      return [...current, { addon, quantity: newQty, subtotal: newQty * addon.price }];
    });
  };

  const isFormValid = () => {
    if (product.productType === 'variable') {
      if (!selectedVariationChildId) return false;
      const child = childVariations.find(c => c.id === selectedVariationChildId);
      if (child?.trackInventory && child.stock <= 0) return false;
    } else if (product.variants && product.variants.length > 0) {
      for (const variant of product.variants) {
        if (!selectedVariants[variant.name]) return false;
      }
    }
    if (product.requireSerial && !serialNumber.trim()) return false;
    if (isVariantOutOfStock) return false;
    return true;
  };

  // Format variants string early to calculate price
  let variantString = '';
  if (Object.keys(selectedVariants).length > 0) {
    variantString = Object.entries(selectedVariants)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
  }

  let basePrice = product.price;
  let matchingVariant: (typeof product.variantData)[number] | undefined;
  
  if (product.productType === 'variable' && selectedVariationChildId) {
    const child = childVariations.find(c => c.id === selectedVariationChildId);
    if (child) basePrice = child.price;
  } else if (variantString && product.variantData && product.variantData.length > 0) {
    const selectedParts = variantString.split(',').map(s => s.trim());
    matchingVariant = product.variantData.find(vd => {
      let match = true;
      if (vd.option1 && !selectedParts.includes(vd.option1)) match = false;
      if (vd.option2 && !selectedParts.includes(vd.option2)) match = false;
      return match;
    });

    if (matchingVariant && matchingVariant.priceOverride !== undefined) {
      basePrice = matchingVariant.priceOverride;
    }
  }

  let totalPrice = basePrice;
  addonItems.forEach(item => {
    totalPrice += item.subtotal;
  });

  const isVariantOutOfStock = product.productType === 'variable' 
    ? (childVariations.find(c => c.id === selectedVariationChildId)?.trackInventory && (childVariations.find(c => c.id === selectedVariationChildId)?.stock ?? 0) <= 0)
    : (matchingVariant?.trackInventory && (matchingVariant.stock ?? 0) <= 0);

  const footer = (
    <div className="flex items-center justify-between w-full">
      <div className="text-left">
        <p className="text-[9px] sm:text-[10px] font-black text-gray-500 uppercase tracking-widest">{t('total_price', 'Total Price')}</p>
        <p className="text-base sm:text-lg font-black text-primary dark:text-emerald-400 leading-tight">
          {formatCurrency(totalPrice, state.settings.currency)}
        </p>
        {isVariantOutOfStock && (
          <p className="text-[8px] font-black text-rose-500 uppercase tracking-widest mt-0.5">Out of Stock</p>
        )}
        {matchingVariant?.trackInventory && matchingVariant.stock !== undefined && !isVariantOutOfStock && (
          <p className="text-[7px] font-black text-gray-500 uppercase tracking-widest mt-0.5">Stock: {matchingVariant.stock}</p>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 sm:gap-3">
        <button
          onClick={onClose}
          className="px-4 sm:px-6 py-2.5 sm:py-3 border border-rose-200 dark:border-rose-900/30 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-[9px] sm:text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all active:scale-95 shrink-0"
        >
          {t('cancel', 'Cancel')}
        </button>
        <button
          onClick={handleConfirm}
          disabled={!isFormValid()}
          className="btn btn-md btn-primary !py-2.5 sm:!py-3 !text-[9px] sm:!text-[11px]"
        >
          <Check className="w-4 h-4 shrink-0" /> <span className="hidden sm:inline">{t('add_to_cart_btn', 'Add to Cart')}</span><span className="sm:hidden">{t('add', 'Add')}</span>
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={product.name}
      maxWidth="sm"
      footer={footer}
    >
      <div className="space-y-6">
        
        {/* Variants Selection */}
        {product.productType === 'variable' && childVariations.length > 0 ? (
          <div className="space-y-4">
            <h4 className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest border-b border-gray-200 dark:border-white/10 pb-2">
              {t('select_variation', 'Select Variation')}
            </h4>
            <div className="grid grid-cols-1 gap-2">
              {childVariations.map(child => {
                const isOutOfStock = child.trackInventory && child.stock <= 0;
                return (
                  <button
                    key={child.id}
                    onClick={() => !isOutOfStock && setSelectedVariationChildId(child.id)}
                    disabled={isOutOfStock}
                    className={`text-left p-3 rounded-xl border transition-all ${
                      selectedVariationChildId === child.id
                        ? 'bg-primary text-white border-primary shadow-md shadow-emerald-500/20'
                        : isOutOfStock
                          ? 'bg-gray-100 dark:bg-black/60 border-gray-200 dark:border-white/5 opacity-60 grayscale cursor-not-allowed'
                          : 'bg-white dark:bg-black text-gray-700 dark:text-gray-300 border-gray-200 dark:border-white/10 hover:border-primary/50'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black uppercase">{child.name.replace(`${product.name} - `, '')}</span>
                      <span className="text-[10px] font-bold tracking-widest">
                        {formatCurrency(child.price, state.settings.currency)}
                      </span>
                    </div>
                    {child.trackInventory && (
                      <div className={`text-[9px] font-black uppercase tracking-widest mt-1 ${
                        selectedVariationChildId === child.id ? 'text-emerald-100' : isOutOfStock ? 'text-red-500' : 'text-gray-400'
                      }`}>
                        {isOutOfStock ? 'Out of Stock' : `Stock: ${child.stock}`}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : product.variants && product.variants.length > 0 && (
          <div className="space-y-4">
            <h4 className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest border-b border-gray-200 dark:border-white/10 pb-2">
              {t('select_variants', 'Select Variants')}
            </h4>
            {product.variants.map((variant) => (
              <div key={variant.name} className="space-y-2">
                <label className="text-xs font-bold text-gray-800 dark:text-gray-200 uppercase">{variant.name}</label>
                <div className="flex flex-wrap gap-2">
                  {variant.options.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setSelectedVariants({ ...selectedVariants, [variant.name]: opt })}
                      className={`px-4 py-2 text-xs font-black uppercase rounded-lg border transition-all ${
                        selectedVariants[variant.name] === opt
                          ? 'bg-primary text-white border-primary shadow-md shadow-emerald-500/20'
                          : 'bg-white dark:bg-black text-gray-600 dark:text-gray-400 border-gray-200 dark:border-white/10 hover:border-primary'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Linked Addons Selection */}
        {product.productAddons && product.productAddons.length > 0 && (
          <div className="space-y-4">
            <h4 className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest border-b border-gray-200 dark:border-white/10 pb-2">
              {t('addons_extras', 'Add-ons & Extras')}
            </h4>
            <div className="grid grid-cols-1 gap-2">
              {product.productAddons
                .filter(addon => addon.active)
                .map((addon) => {
                const cartItem = addonItems.find(item => item.addon.id === addon.id);
                const quantity = cartItem ? cartItem.quantity : 0;
                const addonProduct = state.products.find(p => p.id === addon.addonProductId);
                const isOutOfStock = addonProduct?.trackInventory && (addonProduct.stock || 0) <= 0;

                return (
                  <div
                    key={addon.id}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                      quantity > 0
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 border-primary shadow-sm'
                        : isOutOfStock
                          ? 'bg-gray-100 dark:bg-black/60 border-gray-200 dark:border-white/5 opacity-60 grayscale'
                          : 'bg-gray-50 dark:bg-black/40 border-gray-200 dark:border-white/5 hover:border-gray-300 dark:hover:border-white/20'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className={`text-xs font-black uppercase ${quantity > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-300'}`}>
                        {addon.name}
                      </span>
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-0.5">
                        +{formatCurrency(addon.price, state.settings.currency)} {isOutOfStock ? '(Out of Stock)' : ''}
                      </span>
                    </div>

                    {!isOutOfStock && (
                      <div className="flex items-center gap-3">
                        <div className="flex items-center bg-white dark:bg-black/60 rounded-lg border border-gray-200 dark:border-white/10 p-0.5 shadow-sm">
                          <button
                            onClick={() => updateAddonQuantity(addon, -1)}
                            className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 rounded-md transition-colors"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-6 text-center text-xs font-black text-gray-900 dark:text-white">
                            {quantity}
                          </span>
                          <button
                            onClick={() => updateAddonQuantity(addon, 1)}
                            disabled={quantity >= addon.maxQty}
                            className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 rounded-md transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Serial Number / IMEI Input */}
        {product.requireSerial && (
          <div className="space-y-4">
            <h4 className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest border-b border-gray-200 dark:border-white/10 pb-2">
              {t('device_registration', 'Device Registration')}
            </h4>
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-800 dark:text-gray-200 uppercase">{t('serial_imei_req', 'Serial Number / IMEI *')}</label>
              <input
                type="text"
                autoFocus
                placeholder={t('scan_serial_placeholder', 'Scan or type serial number...')}
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value.toUpperCase())}
                className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white text-sm rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 uppercase font-black tracking-widest placeholder:text-gray-400 placeholder:font-medium placeholder:normal-case"
              />
            </div>
          </div>
        )}

      </div>
    </Modal>
  );
}
