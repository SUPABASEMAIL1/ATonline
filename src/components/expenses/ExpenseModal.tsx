import React, { useState, useEffect } from 'react';
import { X, DollarSign, Calendar, Tag, CreditCard, FileText, ShoppingBag, RefreshCw, Save } from 'lucide-react';
import { format } from 'date-fns';
import { Expense, EXPENSE_CATEGORIES } from '../../types';
import { useApp } from '../../context/SupabaseAppContext';
import { Modal } from '../common/Modal';
import { cn } from '../../lib/utils';
import { useTranslation } from '../../hooks/useTranslation';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (expense: Omit<Expense, 'id' | 'createdAt'>) => Promise<void>;
  expense?: Expense | null;
}

export function ExpenseModal({ isOpen, onClose, onSave, expense }: ExpenseModalProps) {
  const { state } = useApp();
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    category: EXPENSE_CATEGORIES[0],
    date: format(new Date(), 'yyyy-MM-dd'),
    paymentMethod: 'cash' as 'cash' | 'card' | 'digital',
    storeType: 'retail' as 'retail' | 'wholesale' | 'estore' | undefined,
    notes: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (expense) {
      setFormData({
        description: expense.description,
        amount: expense.amount.toString(),
        category: expense.category,
        date: format(new Date(expense.date), 'yyyy-MM-dd'),
        paymentMethod: expense.paymentMethod,
        storeType: expense.storeType,
        notes: expense.notes || ''
      });
    } else {
      setFormData({
        description: '',
        amount: '',
        category: EXPENSE_CATEGORIES[0],
        date: format(new Date(), 'yyyy-MM-dd'),
        paymentMethod: 'cash',
        storeType: state.settings.wholesaleEnabled ? undefined : (state.settings.retailEnabled ? 'retail' : undefined),
        notes: ''
      });
    }
  }, [expense, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const exactDate = new Date();
      const selectedParts = formData.date.split('-');
      exactDate.setFullYear(parseInt(selectedParts[0]), parseInt(selectedParts[1]) - 1, parseInt(selectedParts[2]));

      await onSave({
        description: formData.description,
        amount: parseFloat(formData.amount),
        category: formData.category,
        date: exactDate,
        paymentMethod: formData.paymentMethod,
        storeType: formData.storeType,
        notes: formData.notes,
      });
      onClose();
    } catch (error) {
      console.error('Error saving expense:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const footer = (
    <div className="flex items-center justify-end gap-2 sm:gap-3 w-full">
      <button
        type="button"
        onClick={onClose}
        className="px-4 sm:px-6 py-2.5 sm:py-3.5 border border-rose-200 dark:border-rose-900/30 text-[#ff4b6e] hover:bg-rose-50 dark:hover:bg-rose-500/10 text-[9px] sm:text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all active:scale-95 shrink-0"
      >
        {t('discard')}
      </button>
      <button
        type="submit"
        form="expense-form"
        disabled={isSubmitting}
        className="btn btn-md btn-primary flex-1 sm:flex-none sm:min-w-[240px] !py-2.5 sm:!py-3.5 !text-[9px] sm:!text-[11px]"
      >
        {isSubmitting ? (
          <RefreshCw className="h-4 w-4 sm:h-5 sm:w-5 animate-spin shrink-0" />
        ) : (
          <Save className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
        )}
        <span className="leading-none ml-2">
          {expense ? t('commit_changes') : t('register_expense')}
        </span>
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={expense ? t('edit_expense') : t('register_new_expense')}
      maxWidth="lg"
      footer={footer}
    >
      <form id="expense-form" onSubmit={handleSubmit} className="space-y-10">
        {/* Core Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          <h3 className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest flex items-center gap-3">
            <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
            {t('transaction_details')}
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('description')} *</label>
              <input
                type="text"
                required
                className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                placeholder={t('expense_desc_placeholder')}
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('amount')} *</label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 transition-all font-black"
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                      setFormData({ ...formData, amount: val });
                    }
                  }}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 font-bold text-[10px] uppercase tracking-widest">{state.settings.currency}</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('expense_date')} *</label>
              <input
                type="date"
                required
                className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                value={formData.date}
                onChange={e => setFormData({ ...formData, date: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Classification */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          <h3 className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest flex items-center gap-3">
            <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
            {t('classification')}
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('category')} *</label>
              <select
                required
                className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 transition-all appearance-none cursor-pointer"
                value={formData.category}
                onChange={e => setFormData({ ...formData, category: e.target.value })}
              >
                {EXPENSE_CATEGORIES.map(cat => (
                  <option key={cat} value={cat} className="dark:bg-surface">
                    {t('category_' + cat.toLowerCase(), cat)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('payment_method')} *</label>
              <select
                required
                className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 transition-all appearance-none cursor-pointer"
                value={formData.paymentMethod}
                onChange={e => setFormData({ ...formData, paymentMethod: e.target.value as any })}
              >
                <option value="cash" className="dark:bg-surface">{t('cash_settlement')}</option>
                <option value="card" className="dark:bg-surface">{t('card_payment')}</option>
                <option value="digital" className="dark:bg-surface">{t('digital_transfer')}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Intelligence */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          <h3 className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest flex items-center gap-3">
            <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
            {t('operational_intelligence')}
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            {(state.settings.wholesaleEnabled || state.settings.estoreEnabled) && (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('channel_selection')}</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { id: undefined, label: t('general'), icon: ShoppingBag, enabled: true },
                    { id: 'retail', label: t('retail'), icon: CreditCard, enabled: state.settings.retailEnabled },
                    { id: 'wholesale', label: t('wholesale'), icon: ShoppingBag, enabled: state.settings.wholesaleEnabled },
                    { id: 'estore', label: t('estore'), icon: RefreshCw, enabled: state.settings.estoreEnabled }
                  ].filter(c => c.enabled !== false).map((c) => (
                    <button
                      key={c.id ?? 'general'}
                      type="button"
                      onClick={() => setFormData({ ...formData, storeType: c.id as any })}
                      className={cn(
                        "flex flex-col items-center gap-2 p-4 rounded-xl border transition-all active:scale-95",
                        formData.storeType === c.id 
                          ? 'bg-primary border-primary text-white shadow-lg shadow-emerald-500/20' 
                          : 'bg-[#f8f9fa] dark:bg-black/20 border-gray-200 dark:border-white/5 text-gray-600'
                      )}
                    >
                      <c.icon className={cn("h-5 w-5", formData.storeType === c.id ? 'text-white' : 'text-gray-600')} />
                      <span className={cn("text-[9px] font-black uppercase tracking-widest", formData.storeType === c.id ? 'text-white' : 'text-gray-600 dark:text-gray-400')}>{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('administrative_notes')}</label>
              <textarea
                className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl p-4 focus:ring-2 focus:ring-emerald-500 transition-all min-h-[100px] resize-none"
                placeholder={t('expense_notes_placeholder')}
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}
