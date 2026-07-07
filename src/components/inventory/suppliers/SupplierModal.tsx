import React, { useState, useEffect } from 'react';
import { X, Truck, Phone, Mail, MapPin, Briefcase, CreditCard, Tag, Save, RefreshCw } from 'lucide-react';
import { Supplier } from '../../../types';
import { Modal } from '../../common/Modal';
import { cn } from '../../../lib/utils';
import { useTranslation } from '../../../hooks/useTranslation';

interface SupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (supplier: Partial<Supplier>) => Promise<void>;
  supplier?: Supplier | null;
}

export function SupplierModal({ isOpen, onClose, onSave, supplier }: SupplierModalProps) {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<Partial<Supplier>>({
    name: '',
    phone: '',
    email: '',
    businessType: '',
    paymentTerms: '',
    address: '',
    openingBalance: 0,
    rating: 5,
    contactPerson: '',
    ntn: ''
  });

  useEffect(() => {
    if (supplier) {
      setFormData(supplier);
    } else {
      setFormData({
        name: '',
        phone: '',
        email: '',
        businessType: '',
        paymentTerms: '',
        address: '',
        openingBalance: 0,
        rating: 5,
        contactPerson: '',
        ntn: ''
      });
    }
  }, [supplier, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Failed to save supplier:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const footer = (
    <div className="flex items-center justify-end gap-2 sm:gap-3 w-full">
      <button
        type="button"
        onClick={onClose}
        className="px-4 sm:px-6 py-2.5 sm:py-3.5 border border-rose-200 dark:border-rose-900/30 text-[#ff4b6e] hover:bg-rose-50 dark:hover:bg-rose-500/10 text-[9px] sm:text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all active:scale-95 shrink-0"
      >
        {t('discard_upper', 'DISCARD')}
      </button>
      <button
        type="submit"
        form="supplier-form"
        disabled={isSubmitting}
        className="btn btn-md btn-primary flex-1 sm:flex-none sm:min-w-[240px] !py-2.5 sm:!py-3.5 !text-[9px] sm:!text-[11px]"
      >
        {isSubmitting ? (
          <RefreshCw className="h-4 w-4 sm:h-5 sm:w-5 animate-spin shrink-0" />
        ) : (
          <Save className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
        )}
        <span className="leading-none ml-2">
          {supplier ? t('update_partner', 'UPDATE PARTNER') : t('register_partner', 'REGISTER PARTNER')}
        </span>
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={supplier ? t('edit_supplier_account', 'EDIT SUPPLIER ACCOUNT') : t('register_new_partner', 'REGISTER NEW PARTNER')}
      maxWidth="lg"
      footer={footer}
    >
      <form id="supplier-form" onSubmit={handleSubmit} className="space-y-10">
        {/* Business Profile */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          <h3 className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest flex items-center gap-3">
            <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
            {t('business_profile', 'Business Profile')}
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('legal_entity', 'Legal Entity *')}</label>
              <input
                type="text"
                required
                className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                placeholder="e.g. Acme Corp"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('lead_contact', 'Lead Contact')}</label>
              <input
                type="text"
                className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                placeholder="Point of contact"
                value={formData.contactPerson}
                onChange={e => setFormData({ ...formData, contactPerson: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('business_mobile', 'Business Mobile *')}</label>
              <input
                type="text"
                required
                className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                placeholder="+92 3xx xxxxxxx"
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Operational Data */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          <h3 className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest flex items-center gap-3">
            <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
            {t('operational_data', 'Operational Data')}
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('operational_email', 'Operational Email')}</label>
              <input
                type="email"
                className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                placeholder="orders@partner.com"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('tax_identity_ntn', 'Tax Identity (NTN)')}</label>
              <input
                type="text"
                className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                placeholder="Tax registration number"
                value={formData.ntn}
                onChange={e => setFormData({ ...formData, ntn: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Logistics & Financials */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          <h3 className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest flex items-center gap-3">
            <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
            {t('logistics_initial_state', 'Logistics & Initial State')}
          </h3>
          
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('distribution_hub_address', 'Distribution Hub Address')}</label>
              <textarea
                className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl p-4 focus:ring-2 focus:ring-emerald-500 transition-all font-medium min-h-[80px] resize-none"
                placeholder="Complete location for logistics..."
                value={formData.address}
                onChange={e => setFormData({ ...formData, address: e.target.value })}
              />
            </div>

            {!supplier && (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-rose-500 uppercase tracking-wider">{t('initial_debt_balance', 'Initial Debt Balance')}</label>
                <div className="relative">
                  <input
                    type="number"
                    value={formData.openingBalance}
                    onChange={(e) => setFormData({ ...formData, openingBalance: Number(e.target.value) })}
                    className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-rose-600 dark:text-rose-400 text-3xl font-black rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 transition-all"
                    placeholder="0.00"
                    inputMode="decimal"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-rose-600/50 dark:text-rose-400/50 font-bold text-[10px] uppercase tracking-widest">{t('opening_debt', 'Opening Debt')}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}
