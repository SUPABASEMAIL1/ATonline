import React, { useState } from 'react';
import { Product, ProductVariant, ProductModifier } from '../../types';
import { X, Check } from 'lucide-react';
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
    selectedModifiers?: ProductModifier[];
    serialNumber?: string;
  }) => void;
}

export function ProductOptionsModal({ product, isOpen, onClose, onConfirm }: ProductOptionsModalProps) {
  const { state } = useApp();
  const { t } = useTranslation();
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [selectedModifiers, setSelectedModifiers] = useState<ProductModifier[]>([]);
  const [serialNumber, setSerialNumber] = useState('');

  if (!isOpen) return null;

  const handleConfirm = () => {
    // Validate required fields
    if (product.variants && product.variants.length > 0) {
      for (const variant of product.variants) {
        if (!selectedVariants[variant.name]) {
          // You could use sonner here, but for simplicity, we'll just not confirm
          return;
        }
      }
    }

    if (product.requireSerial && !serialNumber.trim()) {
      return;
    }

    // Format variants string
    let variantString = '';
    if (Object.keys(selectedVariants).length > 0) {
      variantString = Object.entries(selectedVariants)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');
    }

    onConfirm({
      selectedVariant: variantString || undefined,
      selectedModifiers: selectedModifiers.length > 0 ? selectedModifiers : undefined,
      serialNumber: serialNumber.trim() || undefined,
    });
  };

  const toggleModifier = (mod: ProductModifier) => {
    const exists = selectedModifiers.find(m => m.name === mod.name);
    if (exists) {
      setSelectedModifiers(selectedModifiers.filter(m => m.name !== mod.name));
    } else {
      setSelectedModifiers([...selectedModifiers, mod]);
    }
  };

  const isFormValid = () => {
    if (product.variants && product.variants.length > 0) {
      for (const variant of product.variants) {
        if (!selectedVariants[variant.name]) return false;
      }
    }
    if (product.requireSerial && !serialNumber.trim()) return false;
    return true;
  };

  let totalPrice = product.price;
  selectedModifiers.forEach(m => {
    totalPrice += m.price;
  });

  const footer = (
    <div className="flex items-center justify-between w-full">
      <div className="text-left">
        <p className="text-[9px] sm:text-[10px] font-black text-gray-500 uppercase tracking-widest">{t('total_price', 'Total Price')}</p>
        <p className="text-base sm:text-lg font-black text-primary dark:text-emerald-400 leading-tight">
          {formatCurrency(totalPrice, state.settings.currency)}
        </p>
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
        {product.variants && product.variants.length > 0 && (
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

        {/* Modifiers Selection */}
        {product.modifiers && product.modifiers.length > 0 && (
          <div className="space-y-4">
            <h4 className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest border-b border-gray-200 dark:border-white/10 pb-2">
              {t('addons_extras', 'Add-ons & Extras')}
            </h4>
            <div className="grid grid-cols-1 gap-2">
              {product.modifiers.map((mod) => {
                const isSelected = selectedModifiers.some(m => m.name === mod.name);
                return (
                  <button
                    key={mod.name}
                    onClick={() => toggleModifier(mod)}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all text-left ${
                      isSelected
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 border-primary shadow-sm'
                        : 'bg-gray-50 dark:bg-black/40 border-gray-200 dark:border-white/5 hover:border-gray-300 dark:hover:border-white/20'
                    }`}
                  >
                    <span className={`text-xs font-black uppercase ${isSelected ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-300'}`}>
                      {mod.name}
                    </span>
                    <span className="text-[10px] font-black text-primary bg-emerald-100 dark:bg-emerald-900/50 px-2 py-1 rounded-md">
                      +{formatCurrency(mod.price, state.settings.currency)}
                    </span>
                  </button>
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
