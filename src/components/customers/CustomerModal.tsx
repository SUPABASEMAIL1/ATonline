import { useState, useEffect } from 'react';
import { X, User, Phone, Mail, MapPin, Hash, Plus, Trash2, ShieldCheck, Sparkles, ArrowRight, Save, RefreshCw } from 'lucide-react';
import { Customer } from '../../types';
import { useApp } from '../../context/SupabaseAppContext';
import { sonner } from '../../lib/sonner';
import { Modal } from '../common/Modal';
import { cn } from '../../lib/utils';
import { useTranslation } from '../../hooks/useTranslation';
import { Button, Select } from '../../shared/ui';

interface CustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
}

export function CustomerModal({ isOpen, onClose, customer }: CustomerModalProps) {
  const { state, dispatch } = useApp();
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    priceTier: 'retail' as 'retail' | 'wholesale' | 'premium',
    notes: '',
    preferredCategories: [] as string[],
  });

  useEffect(() => {
    if (customer) {
      setFormData({
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        priceTier: customer.priceTier,
        notes: customer.notes || '',
        preferredCategories: customer.preferredCategories || [],
      });
    } else {
      setFormData({
        name: '',
        email: '',
        phone: '',
        address: '',
        priceTier: 'retail',
        notes: '',
        preferredCategories: [],
      });
    }
  }, [customer]);

  const togglePreferredCategory = (categoryName: string) => {
    setFormData(prev => ({
      ...prev,
      preferredCategories: prev.preferredCategories.includes(categoryName)
        ? prev.preferredCategories.filter(c => c !== categoryName)
        : [...prev.preferredCategories, categoryName],
    }));
  };

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.phone) {
      sonner.error(t('critical_data_missing', 'Critical Data Missing'), {
        description: t('customer_mandatory_fields_error', 'Identity name and contact phone are mandatory for CRM registration.')
      });
      return;
    }

    const customerData: Partial<Customer> = {
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      address: formData.address,
      priceTier: formData.priceTier,
      notes: formData.notes,
      preferredCategories: formData.preferredCategories,
    };


    setIsSubmitting(true);
    try {
      if (customer) {
        await dispatch({ type: 'UPDATE_CUSTOMER', payload: { ...customer, ...customerData } });
        sonner.success(t('customer_updated_success', 'Customer Updated'));
      } else {
        await dispatch({ type: 'ADD_CUSTOMER', payload: customerData as Customer });
        sonner.success(t('customer_added_success', 'Customer Added'));
      }
      onClose();
    } catch (error) {
      sonner.error(t('sync_failure', 'Sync Failure'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const footer = (
    <div className="flex items-center justify-end gap-2 sm:gap-3 w-full">
      <Button
        variant="ghost"
        size="md"
        onClick={onClose}
        className="border border-rose-200 dark:border-rose-900/30 text-[#ff4b6e] hover:bg-rose-50 dark:hover:bg-rose-500/10 shrink-0"
      >
        {t('discard', 'DISCARD')}
      </Button>
      <Button
        size="md"
        loading={isSubmitting}
        icon={<Save className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />}
        onClick={handleSubmit}
        className="flex-1 sm:flex-none sm:min-w-[240px]"
      >
        {customer ? t('update_customer_btn', 'UPDATE CUSTOMER') : t('add_customer_btn', 'ADD CUSTOMER')}
      </Button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={customer ? t('edit_customer_title', 'EDIT CUSTOMER') : t('add_new_customer_title', 'ADD NEW CUSTOMER')}
      maxWidth="lg"
      footer={footer}
    >
      <div className="space-y-10">
        {/* Identity Hub */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          <h3 className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest flex items-center gap-3">
            <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
            {t('basic_info', 'Basic Info')}
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('client_name_req', 'Client Name *')}</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                placeholder={t('john_doe_placeholder', 'John Doe')}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('mobile_number_req', 'Mobile Number *')}</label>
              <input
                type="text"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                required
                className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                placeholder={t('phone_placeholder', '+92 3xx xxxxxxx')}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('email_address', 'E-Mail Address')}</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                placeholder={t('email_placeholder', 'client@account.com')}
              />
            </div>
          </div>
        </div>

        {/* Commercials */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          <h3 className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest flex items-center gap-3">
            <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
            {t('billing_details', 'Billing Details')}
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('pricing_tier_req', 'Pricing Tier *')}</label>
              <Select
                name="priceTier"
                value={formData.priceTier}
                onChange={handleChange}
                className="!bg-[#f8f9fa] dark:!bg-black/75 !border-none !text-sm !rounded-xl !px-4 !text-gray-900 dark:!text-white !font-medium"
              >
                <option value="retail" className="dark:bg-surface">{t('standard_retail', 'Standard Retail')}</option>
                <option value="wholesale" className="dark:bg-surface">{t('wholesale_logic', 'Wholesale Logic')}</option>
              </Select>
            </div>
          </div>
        </div>

        {/* Preferences */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          <h3 className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest flex items-center gap-3">
            <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
            {t('preferences', 'Preferences')}
          </h3>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('preferred_categories', 'Preferred Categories')}</label>
            <div className="flex flex-wrap gap-2">
              {state.categories.length === 0 ? (
                <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400">{t('no_categories_available', 'No categories available')}</p>
              ) : (
                state.categories.map(category => {
                  const isSelected = formData.preferredCategories.includes(category.name);
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => togglePreferredCategory(category.name)}
                      className={cn(
                        "px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all border",
                        isSelected
                          ? "bg-emerald-500 text-white border-emerald-500 shadow-sm active:scale-95"
                          : "bg-[#f8f9fa] dark:bg-black/75 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-white/10 hover:border-emerald-300 active:scale-95"
                      )}
                    >
                      {category.name}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Location & Insights */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          <h3 className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest flex items-center gap-3">
            <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
            {t('address_notes', 'Address & Notes')}
          </h3>
          
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('physical_address', 'Physical Address')}</label>
              <textarea
                name="address"
                value={formData.address}
                onChange={handleChange}
                className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-emerald-500 transition-all min-h-[80px] resize-none font-medium"
                placeholder={t('address_placeholder', 'Complete location details...')}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('notes', 'Notes')}</label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-emerald-500 transition-all min-h-[80px] resize-none font-medium"
                placeholder={t('notes_placeholder_cust', 'Additional notes about the customer...')}
              />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}