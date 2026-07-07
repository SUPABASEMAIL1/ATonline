import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Tag, AlertCircle } from 'lucide-react';
import { Discount, DiscountCondition } from '../../types';
import { useApp } from '../../context/SupabaseAppContext';
import { sonner } from '../../lib/sonner';
import { formatCurrency } from '../../lib/currencies';
import { Modal } from '../common/Modal';
import { cn } from '../../lib/utils';
import { useTranslation } from '../../hooks/useTranslation';

interface DiscountModalProps {
  isOpen: boolean;
  onClose: () => void;
  discount: Discount | null;
}

export function DiscountModal({ isOpen, onClose, discount }: DiscountModalProps) {
  const { state, dispatch } = useApp();
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'percentage' as 'percentage' | 'fixed' | 'free_gift' | 'bogo',
    value: '',
    minAmount: '',
    maxDiscount: '',
    validFrom: '',
    validTo: '',
    active: true,
    isAutoApply: true,
  });
  const [conditions, setConditions] = useState<DiscountCondition[]>([]);
  const [freeGiftProducts, setFreeGiftProducts] = useState<string[]>([]);
  const [validDays, setValidDays] = useState<number[]>([]);

  useEffect(() => {
    if (discount) {
      setFormData({
        name: discount.name,
        description: discount.description,
        type: discount.type,
        value: discount.value.toString(),
        minAmount: discount.minAmount?.toString() || '',
        maxDiscount: discount.maxDiscount?.toString() || '',
        validFrom: new Date(discount.validFrom).toLocaleDateString('en-CA'),
        validTo: new Date(discount.validTo).toLocaleDateString('en-CA'),
        active: discount.active,
        isAutoApply: discount.isAutoApply ?? true,
      });
      setConditions((discount.conditions || []).map(condition =>
        condition.type === 'specific_products' && !condition.minQuantity
          ? { ...condition, minQuantity: 1 }
          : condition
      ));
      setFreeGiftProducts(discount.freeGiftProducts || []);
      setValidDays(discount.validDays || []);
    } else {
      setFormData({
        name: '',
        description: '',
        type: 'percentage',
        value: '',
        minAmount: '',
        maxDiscount: '',
        validFrom: new Date().toLocaleDateString('en-CA'),
        validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA'),
        active: true,
        isAutoApply: true,
      });
      setConditions([]);
      setFreeGiftProducts([]);
      setValidDays([]);
    }
  }, [discount]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    // Validate required fields
    if (!formData.name.trim()) {
      sonner.warning(t('discount_name_warning'));
      return;
    }

    if (formData.type !== 'free_gift' && (!formData.value || parseFloat(formData.value) <= 0)) {
      sonner.warning(t('discount_value_warning'));
      return;
    }

    if (!formData.validFrom || !formData.validTo) {
      sonner.warning(t('discount_dates_warning'));
      return;
    }

    // Validate specific products conditions
    const specificProductsConditions = conditions.filter(c => c.type === 'specific_products');
    for (const condition of specificProductsConditions) {
      if (!condition.value || (Array.isArray(condition.value) && condition.value.length === 0)) {
        sonner.warning(t('discount_products_warning'));
        return;
      }
      if (!condition.minQuantity || condition.minQuantity < 1) {
        sonner.warning(t('discount_qty_warning'));
        return;
      }
    }

    // Validate card-specific conditions
    const hasCardTypeCondition = conditions.some(c => c.type === 'card_type');
    const hasBankNameCondition = conditions.some(c => c.type === 'bank_name');
    const paymentMethodCondition = conditions.find(c => c.type === 'payment_method');

    if ((hasCardTypeCondition || hasBankNameCondition) && paymentMethodCondition && paymentMethodCondition.value !== 'card') {
      sonner.warning(t('card_warning_conflict'));
      return;
    }

    if ((hasCardTypeCondition || hasBankNameCondition) && !paymentMethodCondition) {
      const result = await sonner.confirm(
        t('card_warning_title'),
        t('card_warning_desc'),
        t('yes_confirm')
      );
      if (!result.isConfirmed) return;
    }

    const discountData: Discount = {
      id: discount?.id || Date.now().toString(),
      name: formData.name,
      description: formData.description,
      type: formData.type,
      value: formData.type === 'free_gift' ? 0 : parseFloat(formData.value),
      conditions,
      freeGiftProducts: formData.type === 'free_gift' ? freeGiftProducts : undefined,
      minAmount: formData.minAmount ? parseFloat(formData.minAmount) : undefined,
      maxDiscount: formData.maxDiscount ? parseFloat(formData.maxDiscount) : undefined,
      validFrom: new Date(formData.validFrom),
      validTo: new Date(formData.validTo),
      validDays: validDays.length > 0 ? validDays : undefined,
      active: formData.active,
      isAutoApply: formData.isAutoApply,
      createdAt: discount?.createdAt || new Date(),
    };

    try {
      sonner.loading(discount ? t('updating_discount') : t('creating_discount'));
      const { discountsService } = await import('../../lib/services');

      if (discount) {
        await discountsService.update(discount.id, discountData);
        dispatch({ type: 'UPDATE_DISCOUNT', payload: discountData });
        sonner.success(t('discount_update_success'));
      } else {
        const newDiscount = await discountsService.create(discountData);
        dispatch({ type: 'ADD_DISCOUNT', payload: newDiscount });
        sonner.success(t('discount_create_success'));
      }

      onClose();
    } catch (error) {
      console.error('Error saving discount:', error);
      sonner.error(t('discount_save_error'));
    } finally {
      sonner.close();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  const addCondition = () => {
    setConditions(prev => [...prev, {
      type: 'min_amount',
      value: '',
      operator: 'greater_than'
    }]);
  };

  const updateCondition = (index: number, field: keyof DiscountCondition, value: any) => {
    setConditions(prev => prev.map((condition, i) => {
      if (i === index) {
        const updatedCondition = { ...condition, [field]: value };

        // Set default minQuantity when switching to specific_products type
        if (field === 'type' && value === 'specific_products' && !updatedCondition.minQuantity) {
          updatedCondition.minQuantity = 1;
        }

        return updatedCondition;
      }
      return condition;
    }));
  };

  const removeCondition = (index: number) => {
    setConditions(prev => prev.filter((_, i) => i !== index));
  };

  const toggleDay = (day: number) => {
    setValidDays(prev =>
      prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day].sort()
    );
  };

  const toggleProduct = (productId: string) => {
    setFreeGiftProducts(prev =>
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  // Helper function to check for card-specific conditions
  const getCardConditionWarning = () => {
    const hasCardTypeCondition = conditions.some(c => c.type === 'card_type');
    const hasBankNameCondition = conditions.some(c => c.type === 'bank_name');
    const paymentMethodCondition = conditions.find(c => c.type === 'payment_method');

    if (hasCardTypeCondition || hasBankNameCondition) {
      if (paymentMethodCondition && paymentMethodCondition.value !== 'card') {
        return {
          type: 'error',
          message: t('card_warning_conflict')
        };
      } else if (!paymentMethodCondition) {
        return {
          type: 'warning',
          message: t('card_warning_no_method')
        };
      } else if (paymentMethodCondition.value === 'card') {
        return {
          type: 'info',
          message: t('card_warning_success')
        };
      }
    }
    return null;
  };

  const cardConditionWarning = getCardConditionWarning();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={discount ? t('edit_privilege') : t('register_new_privilege')}
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-end gap-2 sm:gap-3 w-full">
          <button
            type="button"
            onClick={onClose}
            className="px-4 sm:px-6 py-2.5 sm:py-3.5 border border-rose-200 dark:border-rose-900/30 text-[#ff4b6e] hover:bg-rose-50 dark:hover:bg-rose-500/10 text-[9px] sm:text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all active:scale-95 shrink-0"
          >
            {t('discard')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="btn btn-md btn-primary flex-1 sm:flex-none sm:min-w-[240px] !py-2.5 sm:!py-3.5 !text-[9px] sm:!text-[11px]"
          >
            <Tag className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
            <span className="leading-none ml-2">{discount ? t('edit_privilege') : t('register_privilege')}</span>
          </button>
        </div>
      }
    >
      <div className="space-y-10">
        {/* Identity & Core Details */}
        <div className="space-y-6">
          <h3 className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest flex items-center gap-3">
            <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
            {t('identity_hub')}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('promotion_name_label')}</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 transition-all font-medium placeholder:text-gray-600"
                placeholder={t('promotion_name_placeholder', 'e.g. Eid Mega Sale')}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('privilege_type_label')}</label>
              <select
                name="type"
                value={formData.type}
                onChange={handleChange}
                className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 transition-all font-medium appearance-none cursor-pointer"
              >
                <option value="percentage" className="dark:bg-surface">{t('percentage_off')}</option>
                <option value="fixed" className="dark:bg-surface">{t('fixed_amount_off')}</option>
                <option value="bogo" className="dark:bg-surface">{t('bogo_buy_1_get_1')}</option>
                <option value="free_gift" className="dark:bg-surface">{t('gift_incentive')}</option>
              </select>
            </div>

            {formData.type !== 'free_gift' && (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  {formData.type === 'percentage' ? t('factor_percent') : t('amount_currency').replace('{currency}', state.settings.currency)} *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="value"
                    value={formData.value}
                    onChange={handleChange}
                    required
                    className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 transition-all font-medium placeholder:text-gray-600"
                    placeholder="0"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 font-bold text-[10px] uppercase tracking-widest">{formData.type === 'percentage' ? '%' : state.settings.currency}</span>
                </div>
              </div>
            )}
            {formData.type === 'free_gift' && (
              <div></div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('min_basket')}</label>
              <input
                type="number"
                step="0.01"
                name="minAmount"
                value={formData.minAmount}
                onChange={handleChange}
                className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 transition-all font-medium placeholder:text-gray-600"
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('max_ceiling')}</label>
              <input
                type="number"
                step="0.01"
                name="maxDiscount"
                value={formData.maxDiscount}
                onChange={handleChange}
                className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 transition-all font-medium placeholder:text-gray-600"
                placeholder={t('no_cap')}
              />
            </div>
          </div>
        </div>

        {/* Operational Window */}
        <div className="space-y-6 pt-2">
          <h3 className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest flex items-center gap-3">
            <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
            {t('operational_window')}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('activation')}</label>
              <input
                type="date"
                name="validFrom"
                value={formData.validFrom}
                onChange={handleChange}
                className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('expiry')}</label>
              <input
                type="date"
                name="validTo"
                value={formData.validTo}
                onChange={handleChange}
                className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
              />
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('weekly_cyclic_schedule')}</label>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((day, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => toggleDay(index)}
                  className={`py-2 rounded-xl text-[10px] font-black transition-all border-2 ${validDays.includes(index)
                    ? 'bg-primary border-primary text-white shadow-lg shadow-emerald-500/20'
                    : 'bg-[#f8f9fa] dark:bg-black/75 border-transparent text-gray-600 hover:bg-gray-100'
                    }`}
                >
                  {t(day.toLowerCase())}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Trigger Protocols */}
        <div className="space-y-6 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest flex items-center gap-3">
              <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
              {t('trigger_protocols')}
            </h3>
            <button
              type="button"
              onClick={addCondition}
              className="px-4 py-2 bg-emerald-50 dark:bg-primary/10 text-primary hover:bg-emerald-100 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('add_rule')}
            </button>
          </div>

          {cardConditionWarning && (
            <div className={`p-4 rounded-[16px] border ${cardConditionWarning.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-600' : 'bg-amber-50 border-amber-200 text-amber-600'}`}>
              <div className="flex items-center gap-3">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-widest leading-tight">{cardConditionWarning.message}</span>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {conditions.map((condition, index) => (
              <div key={index} className="p-5 bg-[#f8f9fa] dark:bg-black/75 rounded-[20px] border border-gray-200 dark:border-white/5 relative group">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-2 block">{t('variable_label')}</label>
                    <select
                      value={condition.type}
                      onChange={(e) => updateCondition(index, 'type', e.target.value)}
                      className="w-full bg-white dark:bg-surface border-none rounded-xl px-4 py-2.5 text-[11px] font-black text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 transition-all appearance-none cursor-pointer"
                    >
                      <option value="min_amount" className="dark:bg-surface">{t('rule_threshold_amount')}</option>
                      <option value="specific_products" className="dark:bg-surface">{t('rule_product_whitelist')}</option>
                      <option value="payment_method" className="dark:bg-surface">{t('rule_payment_gateway')}</option>
                      <option value="customer_tier" className="dark:bg-surface">{t('rule_membership_tier')}</option>
                      <option value="card_type" className="dark:bg-surface">{t('rule_network')}</option>
                      <option value="bank_name" className="dark:bg-surface">{t('rule_issuing_institution')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-2 block">{t('condition_value_label')}</label>
                    {condition.type === 'specific_products' ? (
                      <div className="space-y-3">
                        <select
                          multiple
                          value={Array.isArray(condition.value) ? condition.value : []}
                          onChange={(e) => {
                            const selectedOptions = Array.from(e.target.selectedOptions, option => option.value);
                            updateCondition(index, 'value', selectedOptions);
                          }}
                          className="w-full bg-white dark:bg-surface border-none rounded-xl px-4 py-2 text-[11px] font-black text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 transition-all h-24 custom-scrollbar"
                        >
                          {state.products.map(product => (
                            <option key={product.id} value={product.id} className="dark:bg-surface">{product.name}</option>
                          ))}
                        </select>
                        <div className="flex items-center gap-3 p-3 bg-white dark:bg-surface rounded-xl border border-gray-50 dark:border-white/5">
                          <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest shrink-0">{t('min_quantity_label')}</span>
                          <input
                            type="number"
                            min="1"
                            value={condition.minQuantity || 1}
                            onChange={(e) => updateCondition(index, 'minQuantity', parseInt(e.target.value) || 1)}
                            className="w-full bg-transparent border-none p-0 text-sm font-black text-gray-900 dark:text-white focus:ring-0 outline-none"
                          />
                        </div>
                      </div>
                    ) : condition.type === 'payment_method' || condition.type === 'customer_tier' || condition.type === 'card_type' || condition.type === 'bank_name' ? (
                      <select
                        value={condition.value}
                        onChange={(e) => updateCondition(index, 'value', e.target.value)}
                        className="w-full bg-white dark:bg-surface border-none rounded-xl px-4 py-2.5 text-[11px] font-black text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 transition-all appearance-none cursor-pointer"
                      >
                        <option value="" className="dark:bg-surface">Select...</option>
                        {condition.type === 'payment_method' && (
                          <>
                            <option value="cash" className="dark:bg-surface">{t('cash_settlement')}</option>
                            <option value="card" className="dark:bg-surface">{t('card')}</option>
                            <option value="digital" className="dark:bg-surface">{t('digital')}</option>
                            <option value="credit" className="dark:bg-surface">{t('credit')}</option>
                          </>
                        )}
                        {condition.type === 'customer_tier' && (
                          <>
                            <option value="Standard" className="dark:bg-surface">{t('tier_standard', 'Standard Tier')}</option>
                            <option value="Premium" className="dark:bg-surface">{t('tier_premium', 'Premium Tier')}</option>
                            <option value="VIP" className="dark:bg-surface">{t('tier_vip', 'VIP Elite')}</option>
                            <option value="Wholesale" className="dark:bg-surface">{t('tier_wholesale', 'Trade Partner')}</option>
                          </>
                        )}
                        {condition.type === 'card_type' && (
                          <>
                            <option value="visa" className="dark:bg-surface">{t('visa_network', 'Visa Network')}</option>
                            <option value="mastercard" className="dark:bg-surface">{t('mastercard_network', 'Mastercard Network')}</option>
                            <option value="amex" className="dark:bg-surface">{t('amex_network', 'Amex Enterprise')}</option>
                            <option value="discover" className="dark:bg-surface">{t('discover_network', 'Discover Net')}</option>
                          </>
                        )}
                        {condition.type === 'bank_name' && (
                          ['Bank of Ceylon', 'People\'s Bank', 'Commercial Bank', 'HNB', 'Sampath Bank', 'NTB', 'DFCC', 'Seylan Bank', 'NDB'].map(bank => (
                            <option key={bank} value={bank} className="dark:bg-surface">{bank}</option>
                          ))
                        )}
                      </select>
                    ) : (
                      <input
                        type={condition.type === 'min_amount' ? 'number' : 'text'}
                        value={condition.value}
                        onChange={(e) => updateCondition(index, 'value', e.target.value)}
                        className="w-full bg-white dark:bg-surface border-none rounded-xl px-4 py-2.5 text-[11px] font-black text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 transition-all placeholder:text-gray-600"
                        placeholder="Value..."
                      />
                    )}
                  </div>
                </div>
                <button
                  onClick={() => removeCondition(index)}
                  className="absolute -top-3 -right-3 p-2 bg-white dark:bg-[#2A2A2A] text-rose-500 rounded-full shadow-lg border border-gray-200 dark:border-white/5 hover:scale-110 active:scale-90 transition-all opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Status & Behavior */}
        <div className="space-y-6 pt-2">
          <h3 className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest flex items-center gap-3">
            <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
            {t('status_behavior')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex items-center justify-between p-5 bg-[#f8f9fa] dark:bg-black/75 border border-gray-200 dark:border-white/5 rounded-[20px] cursor-pointer hover:bg-emerald-50 dark:hover:bg-primary/10 transition-all">
              <span className="text-[11px] font-black text-gray-900 dark:text-white uppercase tracking-wider">{t('active_status_label')}</span>
              <div className="relative inline-flex items-center cursor-pointer scale-110">
                <input
                  type="checkbox"
                  name="active"
                  checked={formData.active}
                  onChange={handleChange}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 dark:bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </div>
            </label>
            <label className="flex items-center justify-between p-5 bg-[#f8f9fa] dark:bg-black/75 border border-gray-200 dark:border-white/5 rounded-[20px] cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all">
              <span className="text-[11px] font-black text-gray-900 dark:text-white uppercase tracking-wider">{t('auto_apply_label')}</span>
              <div className="relative inline-flex items-center cursor-pointer scale-110">
                <input
                  type="checkbox"
                  name="isAutoApply"
                  checked={formData.isAutoApply}
                  onChange={handleChange}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 dark:bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
              </div>
            </label>
          </div>
        </div>
      </div>
    </Modal>
  );
}