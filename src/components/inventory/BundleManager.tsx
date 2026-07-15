import { useState } from 'react';
import {
  Package, Plus, Edit, Trash2, Tag, Search, X, ChevronDown, ChevronUp, Check,
  Percent, DollarSign, ToggleLeft, ToggleRight, Gift, Info, MoreHorizontal,
  Calendar, Clock, Repeat
} from 'lucide-react';
import { useApp } from '../../context/SupabaseAppContext';
import { useAuth } from '../../context/AuthContext';
import { Bundle, BundleItem, Product } from '../../types';
import { bundlesService } from '../../lib/services';
import { sonner } from '../../lib/sonner';
import { formatCurrency } from '../../lib/currencies';
import { useTranslation } from '../../hooks/useTranslation';

interface BundleFormItem {
  productId: string;
  quantity: number;
}

interface BundleFormSlotOption {
  productId: string;
}

interface BundleFormSlot {
  id: string; // temp id for UI
  name: string;
  requiredQuantity: number;
  options: BundleFormSlotOption[];
}

interface BundleForm {
  name: string;
  description: string;
  discountValue: number;
  discountType: 'percentage' | 'fixed';
  hideItemPrices: boolean;
  isCombo: boolean;
  scheduleType: 'always' | 'scheduled';
  startDate: string;
  endDate: string;
  repeatDays: string[];
  startTime: string;
  endTime: string;
  items: BundleFormItem[];
  slots: BundleFormSlot[];
}

const emptyForm: BundleForm = {
  name: '',
  description: '',
  discountValue: 0,
  discountType: 'percentage',
  hideItemPrices: false,
  isCombo: false,
  scheduleType: 'always',
  startDate: '',
  endDate: '',
  repeatDays: [],
  startTime: '',
  endTime: '',
  items: [],
  slots: [],
};

export function BundleManager() {
  const { state, dispatch } = useApp();
  const { profile } = useAuth();
  const { t } = useTranslation();
  const isAdmin = profile?.role === 'admin';
  const isManager = profile?.role === 'manager';
  const canManage = isAdmin || isManager;

  const [showForm, setShowForm] = useState(false);
  const [editingBundle, setEditingBundle] = useState<Bundle | null>(null);
  const [form, setForm] = useState<BundleForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [showProductPicker, setShowProductPicker] = useState<boolean | string>(false);
  const [expandedBundle, setExpandedBundle] = useState<string | null>(null);
  const [actionMenuBundleId, setActionMenuBundleId] = useState<string | null>(null);
  const [menuUpward, setMenuUpward] = useState(false);

  const currency = formatCurrency(0, state.settings.currency).replace('0', '').trim();

  const filteredSearchProducts = state.products.filter(p =>
    p.active !== false &&
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  const openCreate = () => {
    setEditingBundle(null);
    setForm(emptyForm);
    setShowForm(true);
    setProductSearch('');
  };

  const openEdit = (bundle: Bundle) => {
    setEditingBundle(bundle);
    const isCombo = Array.isArray(bundle.slots) && bundle.slots.length > 0;
    setForm({
      name: bundle.name || '',
      description: bundle.description || '',
      discountValue: bundle.discountValue || 0,
      discountType: bundle.discountType || 'percentage',
      hideItemPrices: bundle.hideItemPrices || false,
      isCombo: isCombo,
      scheduleType: bundle.scheduleType || 'always',
      startDate: bundle.startDate || '',
      endDate: bundle.endDate || '',
      repeatDays: bundle.repeatDays || [],
      startTime: bundle.startTime || '',
      endTime: bundle.endTime || '',
      items: (bundle.items || []).map(bi => ({ productId: bi.productId, quantity: bi.quantity })),
      slots: (bundle.slots || []).map(s => ({
        id: s.id,
        name: s.name,
        requiredQuantity: s.requiredQuantity,
        options: (s.options || []).map(o => ({ productId: o.productId }))
      })).sort((a: any, b: any) => a.orderIndex - b.orderIndex)
    });
    setShowForm(true);
    setProductSearch('');
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingBundle(null);
    setForm(emptyForm);
    setShowProductPicker(false);
  };

  const addProduct = (product: Product) => {
    setForm(prev => {
      const existing = prev.items.find(i => i.productId === product.id);
      if (existing) {
        return {
          ...prev,
          items: prev.items.map(i =>
            i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i
          ),
        };
      }
      return { ...prev, items: [...prev.items, { productId: product.id, quantity: 1 }] };
    });
    setProductSearch('');
    setShowProductPicker(false);
  };

  const removeItem = (productId: string) => {
    setForm(prev => ({ ...prev, items: prev.items.filter(i => i.productId !== productId) }));
  };

  const updateQty = (productId: string, delta: number) => {
    setForm(prev => ({
      ...prev,
      items: prev.items
        .map(i => i.productId === productId ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i)
        .filter(i => i.quantity > 0),
    }));
  };

  const addSlot = () => {
    setForm(prev => ({
      ...prev,
      slots: [...prev.slots, { id: Date.now().toString(36) + Math.random().toString(36).substring(2), name: `Slot ${prev.slots.length + 1}`, requiredQuantity: 1, options: [] }]
    }));
  };

  const removeSlot = (slotId: string) => {
    setForm(prev => ({
      ...prev,
      slots: prev.slots.filter(s => s.id !== slotId)
    }));
  };

  const updateSlot = (slotId: string, updates: Partial<BundleFormSlot>) => {
    setForm(prev => ({
      ...prev,
      slots: prev.slots.map(s => s.id === slotId ? { ...s, ...updates } : s)
    }));
  };

  const addOptionToSlot = (slotId: string, product: Product) => {
    setForm(prev => ({
      ...prev,
      slots: prev.slots.map(s => {
        if (s.id === slotId) {
          if (s.options.find(o => o.productId === product.id)) return s;
          return { ...s, options: [...s.options, { productId: product.id }] };
        }
        return s;
      })
    }));
    setProductSearch('');
    setShowProductPicker(false);
  };

  const removeOptionFromSlot = (slotId: string, productId: string) => {
    setForm(prev => ({
      ...prev,
      slots: prev.slots.map(s => {
        if (s.id === slotId) {
          return { ...s, options: s.options.filter(o => o.productId !== productId) };
        }
        return s;
      })
    }));
  };

  // Live price preview
  const bundleTotal = form.items.reduce((sum, item) => {
    const product = state.products.find(p => p.id === item.productId);
    return sum + (product ? product.price * item.quantity : 0);
  }, 0);

  const discountAmount = form.discountType === 'percentage'
    ? (bundleTotal * form.discountValue) / 100
    : Math.min(form.discountValue, bundleTotal);

  const finalPrice = bundleTotal - discountAmount;

  const handleSave = async () => {
    if (!form.name || form.name.trim().length < 3) return sonner.error(t('bundle_name_too_short', 'Bundle name must be at least 3 characters'));
    
    if (form.isCombo) {
      if (form.slots.length === 0) return sonner.error(t('bundle_min_slots', 'Deal must have at least one slot'));
      for (const slot of form.slots) {
        if (!slot.name.trim()) return sonner.error(t('bundle_slot_name_req', 'All slots must have a name'));
        if (slot.options.length < slot.requiredQuantity) return sonner.error(`Slot "${slot.name}" requires at least ${slot.requiredQuantity} options, but has ${slot.options.length}`);
      }
    } else {
      if (form.items.length < 1) return sonner.error(t('bundle_min_products', 'Bundle must contain at least 1 product'));
    }

    if (form.discountType === 'percentage' && form.discountValue > 100) return sonner.error(t('bundle_discount_percent_max', 'Percentage discount cannot exceed 100%'));
    if (!form.isCombo && bundleTotal > 0 && discountAmount >= bundleTotal) return sonner.error(t('bundle_discount_exceeds_total', 'Discount cannot equal or exceed the total price'));
    setSaving(true);
    try {
      const wasOffline = !navigator.onLine;
      const slotsPayload = form.isCombo ? form.slots.map((s, idx) => ({ name: s.name, requiredQuantity: s.requiredQuantity, orderIndex: idx, options: s.options })) : undefined;
      const itemsPayload = form.isCombo ? undefined : form.items;

      if (editingBundle) {
        await bundlesService.update(editingBundle.id, {
          name: form.name,
          description: form.description,
          discountValue: form.discountValue,
          discountType: form.discountType,
          hideItemPrices: form.hideItemPrices,
          items: itemsPayload,
          slots: slotsPayload,
          isCombo: form.isCombo,
          scheduleType: form.scheduleType,
          startDate: form.startDate || null,
          endDate: form.endDate || null,
          repeatDays: form.repeatDays.length > 0 ? form.repeatDays : null,
          startTime: form.startTime || null,
          endTime: form.endTime || null,
        });
        dispatch({
          type: 'UPDATE_BUNDLE',
          payload: {
            ...editingBundle,
            name: form.name,
            description: form.description,
            discountValue: form.discountValue,
            discountType: form.discountType,
            hideItemPrices: form.hideItemPrices,
            isCombo: form.isCombo,
            scheduleType: form.scheduleType,
            startDate: form.startDate || undefined,
            endDate: form.endDate || undefined,
            repeatDays: form.repeatDays.length > 0 ? form.repeatDays : undefined,
            startTime: form.startTime || undefined,
            endTime: form.endTime || undefined,
            items: (itemsPayload || []).map((i, idx) => ({
              id: `${editingBundle.id}-${idx}`,
              bundleId: editingBundle.id,
              productId: i.productId,
              quantity: i.quantity,
            })),
            slots: (slotsPayload || []).map((s) => ({
              id: Date.now().toString() + Math.random().toString(),
              bundleId: editingBundle.id,
              name: s.name,
              requiredQuantity: s.requiredQuantity,
              orderIndex: s.orderIndex,
              options: s.options.map(o => ({
                id: Date.now().toString() + Math.random().toString(),
                slotId: '',
                productId: o.productId
              }))
            })),
            updatedAt: new Date(),
          },
        });
        sonner.success(wasOffline
          ? t('bundle_updated_offline', 'Bundle updated — will sync when online')
          : t('bundle_updated', 'Bundle updated successfully!'));
      } else {
        const created = await bundlesService.create({
          name: form.name,
          description: form.description,
          discountValue: form.discountValue,
          discountType: form.discountType,
          hideItemPrices: form.hideItemPrices,
          items: itemsPayload,
          slots: slotsPayload,
          isCombo: form.isCombo,
          scheduleType: form.scheduleType,
          startDate: form.startDate || null,
          endDate: form.endDate || null,
          repeatDays: form.repeatDays.length > 0 ? form.repeatDays : null,
          startTime: form.startTime || null,
          endTime: form.endTime || null,
        });
        dispatch({ type: 'ADD_BUNDLE', payload: created });
        sonner.success(wasOffline
          ? t('bundle_created_offline', 'Bundle saved — will sync when online')
          : t('bundle_created', 'Bundle created successfully!'));
      }
      closeForm();
    } catch (err: any) {
      sonner.error(err.message || t('bundle_save_error', 'Error saving bundle'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (bundle: Bundle) => {
    const title = t('bundle_delete_confirm_title', 'Delete Bundle?');
    const desc = t('bundle_delete_confirm_desc', '"{name}" bundle will be permanently deleted.').replace('{name}', bundle.name);
    const result = await sonner.confirm(title, desc);
    if (!result.isConfirmed) return;
    try {
      await bundlesService.delete(bundle.id);
      dispatch({ type: 'DELETE_BUNDLE', payload: bundle.id });
      sonner.success(t('bundle_deleted', 'Bundle deleted'));
    } catch (err: any) {
      sonner.error(err.message || t('bundle_delete_error', 'Error deleting bundle'));
    }
  };

  const handleToggleActive = async (bundle: Bundle) => {
    try {
      await bundlesService.update(bundle.id, { active: !bundle.active });
      dispatch({
        type: 'UPDATE_BUNDLE',
        payload: { ...bundle, active: !bundle.active, updatedAt: new Date() },
      });
      sonner.success(bundle.active ? t('bundle_disabled', 'Bundle disabled') : t('bundle_enabled', 'Bundle enabled'));
    } catch (err: any) {
      sonner.error(t('status_update_error', 'Error updating status'));
    }
  };

  const bundles = state.bundles || [];

  return (
    <>
      {/* ─── FORM MODE (kept mounted so sync doesn't reset fields) ─── */}
      {showForm && (
        <div className="animate-in fade-in duration-300 space-y-4 max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={closeForm} className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-all">
            <X className="h-4 w-4 text-gray-500" />
          </button>
          <div>
            <h2 className="text-base font-black text-gray-900 dark:text-white uppercase tracking-tight">
              {editingBundle ? t('edit_bundle_deal', 'Edit Bundle / Deal') : t('new_bundle_deal', 'New Bundle / Deal')}
            </h2>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest">
              {editingBundle ? t('edit_deal_subtitle', 'Update your existing combo deal') : t('info_banner_text_short', 'Create a deal with multiple products')}
            </p>
          </div>
        </div>

        {/* Form Card */}
        <div className="bg-white dark:bg-surface rounded-3xl border border-gray-200 dark:border-white/5 p-5 space-y-5 shadow-xl">

          {/* Mode Toggle */}
          <div className="flex bg-gray-100 dark:bg-white/5 p-1 rounded-xl w-full">
            <button
              type="button"
              onClick={() => setForm(p => ({ ...p, isCombo: false }))}
              className={`flex-1 py-2 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all ${!form.isCombo ? 'bg-white dark:bg-surface shadow-md text-primary' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}
            >
              Fixed Bundle
            </button>
            <button
              type="button"
              onClick={() => setForm(p => ({ ...p, isCombo: true }))}
              className={`flex-1 py-2 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all ${form.isCombo ? 'bg-white dark:bg-surface shadow-md text-primary' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}
            >
              Slot-Based Deal (Combo)
            </button>
          </div>

          {/* Name + Description */}
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5">{t('bundle_name', 'Bundle Name *')}</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder={t('bundle_name_placeholder', 'e.g. Summer Deal, Family Pack, Combo Offer')}
                className="input w-full text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5">{t('description', 'Description')} ({t('optional', 'Optional')})</label>
              <input
                type="text"
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder={t('brief_description', 'Brief description of the bundle')}
                className="input w-full text-sm"
              />
            </div>
          </div>

          {/* Discount Setup */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">{t('discount_setup', 'Discount Setup *')}</label>
            <div className="flex items-center gap-2">
              <div className="flex bg-gray-100 dark:bg-white/5 rounded-xl p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setForm(p => ({ ...p, discountType: 'percentage' }))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${form.discountType === 'percentage' ? 'bg-primary text-white shadow-md' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}
                >
                  <Percent className="h-3 w-3" /> {t('percentage', 'Percentage')}
                </button>
                <button
                  type="button"
                  onClick={() => setForm(p => ({ ...p, discountType: 'fixed' }))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${form.discountType === 'fixed' ? 'bg-primary text-white shadow-md' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}
                >
                  <DollarSign className="h-3 w-3" /> {t('fixed', 'Fixed')}
                </button>
              </div>
              <input
                type="number"
                min={0}
                max={form.discountType === 'percentage' ? 100 : bundleTotal}
                value={form.discountValue}
                onChange={e => setForm(p => ({ ...p, discountValue: Math.max(0, Math.min(Number(e.target.value), form.discountType === 'percentage' ? 100 : bundleTotal)) }))}
                placeholder={form.discountType === 'percentage' ? '0-100' : t('amount', 'Amount')}
                className="input flex-1 text-sm text-center font-black"
              />
              <span className="text-[11px] font-black text-gray-500">{form.discountType === 'percentage' ? '%' : currency}</span>
            </div>
          </div>

          {/* Receipt Display Option */}
          <div className="bg-gray-50 dark:bg-white/[0.02] rounded-2xl border border-gray-100 dark:border-white/5 p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0 pr-4">
                <p className="text-[11px] font-black text-gray-900 dark:text-white uppercase tracking-tight">
                  Hide Per-Item Original Prices
                </p>
                <p className="text-[9px] text-gray-500 mt-0.5 leading-relaxed">
                  {form.hideItemPrices
                    ? '🙈 Hidden — Receipt & POS will only show the deal\'s final price, not individual item prices'
                    : '👁️ Visible — Individual original prices shown alongside deal discount on receipt & POS cart'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, hideItemPrices: !p.hideItemPrices }))}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-all duration-300 focus:outline-none ${
                  form.hideItemPrices
                    ? 'bg-violet-500 shadow-lg shadow-violet-500/30'
                    : 'bg-gray-300 dark:bg-white/10'
                }`}
                aria-checked={form.hideItemPrices}
                role="switch"
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-300 ${
                    form.hideItemPrices ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Deal Schedule */}
          <div className="bg-gray-50 dark:bg-white/[0.02] rounded-2xl border border-gray-100 dark:border-white/5 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-500" />
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Deal Schedule</label>
              </div>
              <div className="flex bg-gray-100 dark:bg-white/5 rounded-xl p-0.5">
                <button
                  type="button"
                  onClick={() => setForm(p => ({ ...p, scheduleType: 'always' }))}
                  className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${form.scheduleType === 'always' ? 'bg-white dark:bg-surface shadow-md text-primary' : 'text-gray-500'}`}
                >
                  Always On
                </button>
                <button
                  type="button"
                  onClick={() => setForm(p => ({ ...p, scheduleType: 'scheduled' }))}
                  className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${form.scheduleType === 'scheduled' ? 'bg-white dark:bg-surface shadow-md text-primary' : 'text-gray-500'}`}
                >
                  Scheduled
                </button>
              </div>
            </div>

            {form.scheduleType === 'scheduled' && (
              <div className="space-y-4 animate-in fade-in duration-200">
                {/* Date Range */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))}
                      className="input w-full text-xs py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">End Date</label>
                    <input
                      type="date"
                      value={form.endDate}
                      onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
                      className="input w-full text-xs py-2"
                    />
                  </div>
                </div>

                {/* Repeat Days */}
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1.5">
                    <Repeat className="h-3 w-3 inline -mt-0.5 mr-1" />
                    Repeat On
                  </label>
                  <div className="flex gap-1">
                    {[
                      { key: 'mon', label: 'M' },
                      { key: 'tue', label: 'T' },
                      { key: 'wed', label: 'W' },
                      { key: 'thu', label: 'T' },
                      { key: 'fri', label: 'F' },
                      { key: 'sat', label: 'S' },
                      { key: 'sun', label: 'S' },
                    ].map(d => {
                      const isSelected = form.repeatDays.includes(d.key);
                      return (
                        <button
                          key={d.key}
                          type="button"
                          onClick={() => {
                            setForm(p => ({
                              ...p,
                              repeatDays: isSelected
                                ? p.repeatDays.filter(k => k !== d.key)
                                : [...p.repeatDays, d.key]
                            }));
                          }}
                          className={`h-8 w-8 rounded-lg text-[10px] font-black uppercase transition-all ${
                            isSelected
                              ? 'bg-primary text-white shadow-md'
                              : 'bg-gray-100 dark:bg-white/10 text-gray-500 hover:bg-gray-200 dark:hover:bg-white/20'
                          }`}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Time Window */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">
                      <Clock className="h-3 w-3 inline -mt-0.5 mr-1" />
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={form.startTime}
                      onChange={e => setForm(p => ({ ...p, startTime: e.target.value }))}
                      className="input w-full text-xs py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">
                      <Clock className="h-3 w-3 inline -mt-0.5 mr-1" />
                      End Time
                    </label>
                    <input
                      type="time"
                      value={form.endTime}
                      onChange={e => setForm(p => ({ ...p, endTime: e.target.value }))}
                      className="input w-full text-xs py-2"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Items / Slots Builder */}
          {!form.isCombo ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">{t('products_in_bundle', 'Products in Bundle *')}</label>
                <span className="text-[9px] font-black text-gray-400">
                  {t('products_count', '{count} products').replace('{count}', String(form.items.length))}
                </span>
              </div>

              {/* Product search */}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('product_search_placeholder', 'Search product name...')}
                  value={showProductPicker === true ? productSearch : ''}
                  onChange={e => { setProductSearch(e.target.value); setShowProductPicker(true); }}
                  onFocus={() => { setProductSearch(''); setShowProductPicker(true); }}
                  className="input pl-8 w-full text-sm"
                />
                {showProductPicker === true && productSearch && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#1C1C1C] border border-gray-200 dark:border-white/10 rounded-2xl shadow-xl z-50 max-h-48 overflow-y-auto">
                    {filteredSearchProducts.length === 0 ? (
                      <p className="p-4 text-[11px] text-gray-500 text-center">{t('no_product_found', 'No product found')}</p>
                    ) : (
                      filteredSearchProducts.slice(0, 8).map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => addProduct(p)}
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-white/5 transition-all text-left"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                              {p.image ? <img src={p.image} className="h-full w-full rounded-lg object-cover" /> : <Package className="h-4 w-4 text-primary" />}
                            </div>
                            <div>
                              <p className="text-[11px] font-black text-gray-900 dark:text-white uppercase">{p.name}</p>
                              <p className="text-[9px] text-gray-500">{p.category} · {t('stock', 'Stock')}: {p.stock}</p>
                            </div>
                          </div>
                          <span className="text-[11px] font-black text-primary">{formatCurrency(p.price, state.settings.currency)}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Selected items */}
              {form.items.length === 0 ? (
                <div className="flex items-center gap-2 p-4 bg-gray-50 dark:bg-white/[0.02] rounded-2xl border border-dashed border-gray-200 dark:border-white/10">
                  <Info className="h-4 w-4 text-gray-400 shrink-0" />
                  <p className="text-[11px] text-gray-400">{t('search_and_add_products', 'Search and add products above')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {form.items.map(item => {
                    const product = state.products.find(p => p.id === item.productId);
                    if (!product) return null;
                    return (
                      <div key={item.productId} className="flex items-center gap-3 p-2.5 bg-gray-50 dark:bg-white/[0.02] rounded-xl border border-gray-100 dark:border-white/5">
                        <div className="h-8 w-8 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                          {product.image ? <img src={product.image} className="h-full w-full rounded-lg object-cover" /> : <Package className="h-4 w-4 text-primary" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-black text-gray-900 dark:text-white uppercase truncate">{product.name}</p>
                          <p className="text-[9px] text-gray-500">{formatCurrency(product.price * item.quantity, state.settings.currency)}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => updateQty(item.productId, -1)} className="h-6 w-6 rounded-lg bg-gray-200 dark:bg-white/10 flex items-center justify-center text-gray-600 hover:bg-red-100 dark:hover:bg-red-500/10 transition-all text-sm font-black">−</button>
                          <span className="w-6 text-center text-[11px] font-black text-gray-900 dark:text-white">{item.quantity}</span>
                          <button type="button" onClick={() => updateQty(item.productId, 1)} className="h-6 w-6 rounded-lg bg-gray-200 dark:bg-white/10 flex items-center justify-center text-primary hover:bg-emerald-100 dark:hover:bg-primary/10 transition-all text-sm font-black">+</button>
                        </div>
                        <button type="button" onClick={() => removeItem(item.productId)} className="p-1 text-gray-400 hover:text-red-500 transition-all">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Deal Slots *</label>
                <button type="button" onClick={addSlot} className="flex items-center gap-1 text-[10px] font-black uppercase text-primary hover:text-primary-dark transition-all">
                  <Plus className="h-3 w-3" /> Add Slot
                </button>
              </div>
              
              {form.slots.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-6 bg-gray-50 dark:bg-white/[0.02] rounded-2xl border border-dashed border-gray-200 dark:border-white/10 text-center">
                  <Gift className="h-6 w-6 text-gray-400 mb-2" />
                  <p className="text-[11px] font-black text-gray-600 dark:text-gray-400">No slots defined</p>
                  <p className="text-[9px] text-gray-500 mt-1">Add a slot (e.g., "Choose 1 Pizza") to get started</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {form.slots.map((slot) => (
                    <div key={slot.id} className="bg-gray-50 dark:bg-white/[0.02] border border-gray-200 dark:border-white/10 rounded-2xl p-4 space-y-4 relative">
                      <button type="button" onClick={() => removeSlot(slot.id)} className="absolute top-4 right-4 text-gray-400 hover:text-red-500 transition-all">
                        <Trash2 className="h-4 w-4" />
                      </button>
                      
                      <div className="grid grid-cols-2 gap-3 pr-8">
                        <div>
                          <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">Slot Name</label>
                          <input type="text" value={slot.name} onChange={e => updateSlot(slot.id, { name: e.target.value })} placeholder="e.g. Choose 1 Flavor" className="input w-full text-xs py-2" />
                        </div>
                        <div>
                          <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">Items to Pick</label>
                          <input type="number" min={1} value={slot.requiredQuantity} onChange={e => updateSlot(slot.id, { requiredQuantity: Math.max(1, parseInt(e.target.value) || 1) })} className="input w-full text-xs py-2" />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">Options for this slot</label>
                        <div className="relative mb-2">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                          <input
                            type="text"
                            placeholder="Search to add options..."
                            value={showProductPicker === slot.id ? productSearch : ''}
                            onChange={e => {
                              setProductSearch(e.target.value);
                              setShowProductPicker(slot.id);
                            }}
                            onFocus={() => {
                              setProductSearch('');
                              setShowProductPicker(slot.id);
                            }}
                            className="input pl-7 w-full text-xs py-1.5"
                          />
                          {showProductPicker === slot.id && productSearch && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#1C1C1C] border border-gray-200 dark:border-white/10 rounded-xl shadow-xl z-50 max-h-40 overflow-y-auto">
                              {filteredSearchProducts.length === 0 ? (
                                <p className="p-3 text-[10px] text-gray-500 text-center">No options found</p>
                              ) : (
                                filteredSearchProducts.slice(0, 8).map(p => (
                                  <button key={p.id} type="button" onClick={() => addOptionToSlot(slot.id, p)} className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/5 text-left border-b border-gray-100 dark:border-white/5 last:border-0">
                                    <div className="flex items-center space-x-2">
                                      {p.image ? (
                                        <img src={p.image} alt={p.name} className="w-6 h-6 object-cover rounded-md" />
                                      ) : (
                                        <div className="w-6 h-6 bg-gray-100 dark:bg-white/10 rounded-md flex items-center justify-center">
                                          <Package className="w-3 h-3 text-gray-400" />
                                        </div>
                                      )}
                                      <span className="text-[10px] font-black text-gray-900 dark:text-white truncate">{p.name}</span>
                                    </div>
                                    <span className="text-[9px] text-primary shrink-0">{formatCurrency(p.price, state.settings.currency)}</span>
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                        
                        {slot.options.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {slot.options.map(opt => {
                              const product = state.products.find(p => p.id === opt.productId);
                              if (!product) return null;
                              return (
                                <div key={opt.productId} className="flex items-center gap-1.5 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-2 py-1 shadow-sm">
                                  {product.image && (
                                    <img src={product.image} alt={product.name} className="w-4 h-4 object-cover rounded shadow-sm" />
                                  )}
                                  <span className="text-[10px] font-black text-gray-800 dark:text-gray-200 truncate max-w-[120px]">{product.name}</span>
                                  <button type="button" onClick={() => removeOptionFromSlot(slot.id, opt.productId)} className="text-gray-400 hover:text-red-500">
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-[9px] text-red-500 italic mt-1">No options added yet. Customers won't be able to select anything.</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Live Preview */}
          {!form.isCombo && form.items.length > 0 && (
            <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-primary/20 rounded-2xl p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-primary dark:text-emerald-400 mb-2">💰 {t('price_preview', 'Price Preview')}</p>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-gray-600 dark:text-gray-400 font-bold">{t('original_total', 'Original Total')}</span>
                <span className="font-black text-gray-900 dark:text-white">{formatCurrency(bundleTotal, state.settings.currency)}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] mt-1">
                <span className="text-red-500 font-bold">{t('discount', 'Discount')} ({form.discountValue}{form.discountType === 'percentage' ? '%' : ' ' + currency})</span>
                <span className="font-black text-red-500">− {formatCurrency(discountAmount, state.settings.currency)}</span>
              </div>
              <div className="h-px bg-primary/20 my-2" />
              <div className="flex items-center justify-between text-sm">
                <span className="font-black text-gray-900 dark:text-white uppercase">{t('bundle_price', 'Bundle Price')}</span>
                <span className="font-black text-primary dark:text-emerald-400 text-base">{formatCurrency(finalPrice, state.settings.currency)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
          <button
            type="button"
            onClick={closeForm}
            className="btn btn-md btn-secondary flex-1 py-3.5 sm:py-4 text-[11px] font-black uppercase tracking-widest min-h-[48px]"
          >
            {t('cancel', 'Cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn btn-md btn-primary btn btn-primary flex-1 active:bg-emerald-700 hover:shadow-emerald-500/40 min-h-[48px]"
          >
            {saving ? t('saving_dots', 'Saving...') : editingBundle ? t('update_bundle', 'Update Bundle') : t('create_bundle_btn', 'Create Bundle')}
          </button>
        </div>
      </div>
      )}

      {/* ─── LIST MODE (always mounted, hidden when form is open) ─── */}
      {!showForm && (
        <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight">{t('bundles_and_deals', 'Bundles & Deals')}</h2>
          <p className="text-[10px] text-gray-500 mt-0.5">
            {t('bundle_deals_count', '{count} bundles · Access from "Bundles" chip in POS').replace('{count}', String(bundles.length))}
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="btn btn-md btn-primary"
          >
            <Plus className="h-3.5 w-3.5" /> {t('create_bundle_action', 'Create Bundle')}
          </button>
        )}
      </div>

      {/* Info Banner */}
      <div className="flex items-start gap-3 p-3 bg-blue-500/5 border border-blue-500/20 rounded-2xl">
        <Gift className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-[10px] text-blue-600 dark:text-blue-400 font-bold leading-relaxed">
          {t('info_banner_text', 'In POS ProductGrid, you will see a 🎁 Bundles chip under category chips. Click it → click "Add Bundle" → all items will be added to the cart with prorated discounts.')}
        </p>
      </div>

      {/* Bundle List */}
      {bundles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white dark:bg-surface rounded-3xl border border-gray-200 dark:border-white/5">
          <div className="h-16 w-16 bg-primary/10 rounded-3xl flex items-center justify-center mb-4">
            <Gift className="h-8 w-8 text-primary" />
          </div>
          <p className="text-sm font-black text-gray-900 dark:text-white mb-1">{t('no_bundles_title', 'No Bundles & Deals Yet')}</p>
          <p className="text-[11px] text-gray-500 mb-4">{t('no_bundles_desc', 'Create your first bundle deal to start selling combos.')}</p>
          {canManage && (
            <button type="button" onClick={openCreate} className="btn btn-md btn-primary">
              <Plus className="h-3.5 w-3.5" /> {t('create_bundle_action', 'Create Bundle')}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {bundles.map(bundle => {
            const isExpanded = expandedBundle === bundle.id;
            let totalPrice = 0;
            let itemCount = 0;
            let productImages: { bi: any; product: any }[] = [];

            if (bundle.isCombo && bundle.slots) {
              totalPrice = bundle.slots.reduce((sum: number, slot: any) => {
                const maxPriceOpt = slot.options.reduce((max: number, opt: any) => {
                  const p = state.products.find(pr => pr.id === opt.productId);
                  return Math.max(max, p ? p.price : 0);
                }, 0);
                return sum + (maxPriceOpt * slot.requiredQuantity);
              }, 0);
              itemCount = bundle.slots.reduce((s, slot: any) => s + (slot.requiredQuantity || 1), 0);
              productImages = bundle.slots.reduce((acc: any[], slot: any) => {
                const opts = slot.options.map((opt: any) => ({
                  bi: { id: opt.id, quantity: 1 },
                  product: state.products.find(p => p.id === opt.productId)
                })).filter(x => !!x.product);
                return [...acc, ...opts];
              }, []);
            } else {
              totalPrice = (bundle.items || []).reduce((sum, bi) => {
                const p = state.products.find(pr => pr.id === bi.productId);
                return sum + (p ? p.price * bi.quantity : 0);
              }, 0);
              itemCount = (bundle.items || []).reduce((s, bi) => s + (bi.quantity || 1), 0);
              productImages = (bundle.items || [])
                .map(bi => ({ bi, product: state.products.find(p => p.id === bi.productId) }))
                .filter((x): x is { bi: typeof bi; product: NonNullable<typeof x.product> } => !!x.product);
            }

            const discAmt = bundle.discountType === 'percentage'
              ? (totalPrice * bundle.discountValue) / 100
              : Math.min(bundle.discountValue, totalPrice);
            const finalAmt = totalPrice - discAmt;

            return (
              <div
                key={bundle.id}
                className={`bg-white dark:bg-surface rounded-2xl border transition-all ${bundle.active ? 'border-gray-200 dark:border-white/5' : 'border-gray-100 dark:border-white/[0.02] opacity-60'} overflow-visible shadow-sm`}
              >
                {/* ─── DESKTOP ROW ─── */}
                <div className="hidden sm:flex items-center gap-3 p-4">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${bundle.active ? 'bg-primary/10' : 'bg-gray-100 dark:bg-white/5'}`}>
                    <Gift className={`h-5 w-5 ${bundle.active ? 'text-primary' : 'text-gray-400'}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-black text-gray-900 dark:text-white uppercase text-sm truncate">{bundle.name}</p>
                      {!bundle.active && <span className="text-[8px] font-black uppercase bg-gray-200 dark:bg-white/10 text-gray-500 px-1.5 py-0.5 rounded">{t('inactive', 'Inactive')}</span>}
                      {(bundle.name?.length < 3 || (bundle.discountType === 'percentage' && bundle.discountValue > 100) || discAmt >= totalPrice) && (
                        <span className="text-[8px] font-black uppercase bg-red-500 text-white px-1.5 py-0.5 rounded" title={t('invalid_pricing_tooltip', 'This bundle has invalid pricing — edit or delete it')}>{t('invalid', 'Invalid')}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[10px] text-gray-500">
                        {t('products_count', '{count} products').replace('{count}', String(itemCount))}
                      </span>
                      <span className="text-[10px] font-black text-red-500">
                        {bundle.discountType === 'percentage' ? `-${bundle.discountValue}%` : `-${formatCurrency(discAmt, state.settings.currency)}`}
                      </span>
                      <span className="text-[10px] font-black text-primary">{formatCurrency(finalAmt, state.settings.currency)}</span>
                      {bundle.scheduleType === 'scheduled' && (
                        <span className="text-[8px] font-black uppercase bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded">
                          Scheduled
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Thumbnails (max 4) */}
                  <div className="flex items-center gap-1.5">
                    {productImages.slice(0, 4).map(({ bi, product }, idx) => (
                      <div
                        key={bi.id || idx}
                        className="h-9 w-9 rounded-lg overflow-hidden bg-gray-100 dark:bg-white/5 shrink-0 border border-gray-200 dark:border-white/10"
                        title={`${product.name} (x${bi.quantity})`}
                      >
                        {product.image ? (
                          <img src={product.image} className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center bg-primary/10">
                            <Package className="h-4 w-4 text-primary" />
                          </div>
                        )}
                      </div>
                    ))}
                    {productImages.length > 4 && (
                      <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10 text-primary dark:text-emerald-400 text-[10px] font-black border border-primary/20 shrink-0">
                        +{productImages.length - 4}
                      </div>
                    )}
                  </div>

                  {/* Desktop Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setExpandedBundle(isExpanded ? null : bundle.id)}
                      className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-all"
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
                    </button>
                    {canManage && (
                      <>
                        <button type="button" onClick={() => handleToggleActive(bundle)} className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-all" title={bundle.active ? t('disable', 'Disable') : t('enable', 'Enable')}>
                          {bundle.active ? <ToggleRight className="h-4 w-4 text-primary" /> : <ToggleLeft className="h-4 w-4 text-gray-400" />}
                        </button>
                        <button type="button" onClick={() => openEdit(bundle)} className="p-2 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-all text-blue-500">
                          <Edit className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => handleDelete(bundle)} className="p-2 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all text-red-500">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* ─── MOBILE ROW ─── */}
                <div className="sm:hidden p-4 space-y-1.5">
                  {/* Line 1: Gift + Name + Actions */}
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${bundle.active ? 'bg-primary/10' : 'bg-gray-100 dark:bg-white/5'}`}>
                      <Gift className={`h-5 w-5 ${bundle.active ? 'text-primary' : 'text-gray-400'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-black text-gray-900 dark:text-white uppercase text-sm line-clamp-2 leading-tight">{bundle.name}</p>
                        {!bundle.active && <span className="text-[8px] font-black uppercase bg-gray-200 dark:bg-white/10 text-gray-500 px-1.5 py-0.5 rounded shrink-0">{t('inactive', 'Inactive')}</span>}
                        {(bundle.name?.length < 3 || (bundle.discountType === 'percentage' && bundle.discountValue > 100) || discAmt >= totalPrice) && (
                          <span className="text-[8px] font-black uppercase bg-red-500 text-white px-1.5 py-0.5 rounded shrink-0" title={t('invalid_pricing_tooltip', 'This bundle has invalid pricing — edit or delete it')}>{t('invalid', 'Invalid')}</span>
                        )}
                      </div>
                    </div>
                    {/* Mobile actions dropdown */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          const isOpen = actionMenuBundleId === bundle.id;
                          if (!isOpen) {
                            const btn = e.currentTarget.getBoundingClientRect();
                            setMenuUpward(window.innerHeight - btn.bottom < 220);
                          }
                          setActionMenuBundleId(isOpen ? null : bundle.id);
                        }}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-all"
                      >
                        <MoreHorizontal className="h-4 w-4 text-gray-500" />
                      </button>
                      {actionMenuBundleId === bundle.id && (
                        <div className={`absolute right-0 ${menuUpward ? 'bottom-full mb-1' : 'top-full mt-1'} bg-white dark:bg-[#1C1C1C] border border-gray-200 dark:border-white/10 rounded-2xl shadow-xl z-[100] p-1 min-w-[160px]`} onClick={() => { setActionMenuBundleId(null); setMenuUpward(false); }}>
                          <button
                            type="button"
                            onClick={() => { setExpandedBundle(isExpanded ? null : bundle.id); setActionMenuBundleId(null); setMenuUpward(false); }}
                            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-white/5 text-[11px] font-black text-gray-700 dark:text-gray-300 uppercase rounded-lg"
                          >
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            {isExpanded ? t('collapse', 'Collapse') : t('expand', 'Expand')}
                          </button>
                          {canManage && (
                            <>
                              <button
                                type="button"
                                onClick={() => { openEdit(bundle); setActionMenuBundleId(null); setMenuUpward(false); }}
                                className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-500/10 text-[11px] font-black text-blue-500 uppercase rounded-lg"
                              >
                                <Edit className="h-3.5 w-3.5" />
                                {t('edit', 'Edit')}
                              </button>
                              <button
                                type="button"
                                onClick={() => { handleToggleActive(bundle); setActionMenuBundleId(null); setMenuUpward(false); }}
                                className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-white/5 text-[11px] font-black text-gray-700 dark:text-gray-300 uppercase rounded-lg"
                              >
                                {bundle.active ? <ToggleRight className="h-3.5 w-3.5 text-primary" /> : <ToggleLeft className="h-3.5 w-3.5 text-gray-400" />}
                                {bundle.active ? t('disable', 'Disable') : t('enable', 'Enable')}
                              </button>
                              <button
                                type="button"
                                onClick={() => { handleDelete(bundle); setActionMenuBundleId(null); setMenuUpward(false); }}
                                className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-red-50 dark:hover:bg-red-500/10 text-[11px] font-black text-red-500 uppercase rounded-lg"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                {t('delete', 'Delete')}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                    {/* Line 2: Details + Thumbnails (aligned under name) */}
                    <div className="flex items-center justify-between gap-2 pl-[52px]">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="text-[10px] text-gray-500 whitespace-nowrap">
                          {t('products_count', '{count} products').replace('{count}', String(itemCount))}
                        </span>
                        <span className="text-[10px] font-black text-red-500 whitespace-nowrap">
                          {bundle.discountType === 'percentage' ? `-${bundle.discountValue}%` : `-${formatCurrency(discAmt, state.settings.currency)}`}
                        </span>
                        <span className="text-[10px] font-black text-primary whitespace-nowrap">{formatCurrency(finalAmt, state.settings.currency)}</span>
                        {bundle.scheduleType === 'scheduled' && (
                          <span className="text-[8px] font-black uppercase bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded">
                            Scheduled
                          </span>
                        )}
                      </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {productImages.slice(0, 3).map(({ bi, product }, idx) => (
                        <div
                          key={bi.id || idx}
                          className="h-8 w-8 rounded-lg overflow-hidden bg-gray-100 dark:bg-white/5 shrink-0 border border-gray-200 dark:border-white/10"
                          title={`${product.name} (x${bi.quantity})`}
                        >
                          {product.image ? (
                            <img src={product.image} className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center bg-primary/10">
                              <Package className="h-3.5 w-3.5 text-primary" />
                            </div>
                          )}
                        </div>
                      ))}
                      {productImages.length > 3 && (
                        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 text-primary dark:text-emerald-400 text-[10px] font-black border border-primary/20 shrink-0">
                          +{productImages.length - 3}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Items */}
                {isExpanded && (
                  <div className="border-t border-gray-100 dark:border-white/5 px-4 pb-4 pt-3 space-y-2 animate-in slide-in-from-top-1 duration-200">
                    {bundle.description && (
                      <p className="text-[11px] text-gray-500 italic mb-2">"{bundle.description}"</p>
                    )}
                    {bundle.isCombo ? (
                      (bundle.slots || []).map(slot => (
                        <div key={slot.id} className="pt-1">
                          <p className="text-[10px] font-black uppercase text-gray-500 mb-1">{slot.name} (Pick {slot.requiredQuantity})</p>
                          <div className="flex flex-wrap gap-1">
                            {slot.options.slice(0, 5).map(opt => {
                              const product = state.products.find(p => p.id === opt.productId);
                              return product ? (
                                <span key={opt.id} className="text-[9px] bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">
                                  {product.name}
                                </span>
                              ) : null;
                            })}
                            {slot.options.length > 5 && (
                              <span className="text-[9px] text-primary px-1">+{slot.options.length - 5} more</span>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <>
                        {(bundle.items || []).slice(0, 5).map(bi => {
                          const product = state.products.find(p => p.id === bi.productId);
                          if (!product) return <p key={bi.id} className="text-[10px] text-red-400">{t('product_not_found', 'Product not found (ID: {id})').replace('{id}', bi.productId)}</p>;
                          return (
                            <div key={bi.id} className="flex items-center gap-3">
                              <div className="h-7 w-7 bg-primary/10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden border border-gray-100 dark:border-white/5">
                                {product.image ? (
                                  <img src={product.image} className="h-full w-full object-cover" />
                                ) : (
                                  <Package className="h-3.5 w-3.5 text-primary" />
                                )}
                              </div>
                              <span className="flex-1 text-[11px] font-black text-gray-700 dark:text-gray-300 uppercase truncate">{product.name}</span>
                              <span className="text-[10px] text-gray-500 font-bold">×{bi.quantity}</span>
                              <span className="text-[11px] font-black text-gray-900 dark:text-white">{formatCurrency(product.price * bi.quantity, state.settings.currency)}</span>
                            </div>
                          );
                        })}
                        {bundle.items && bundle.items.length > 5 && (
                          <p className="text-[10px] text-primary font-black uppercase tracking-widest text-center pt-1 animate-pulse">
                            + {(bundle.items.length - 5)} {t('more_items', 'more items')}...
                          </p>
                        )}
                      </>
                    )}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-white/5">
                      <span className="text-[10px] text-gray-500">{t('before_discount', 'Before Discount')}</span>
                      <span className="text-[11px] font-black text-gray-900 dark:text-white line-through">{formatCurrency(totalPrice, state.settings.currency)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-primary dark:text-emerald-400 font-black">{t('bundle_price', 'Bundle Price')}</span>
                      <span className="text-sm font-black text-primary dark:text-emerald-400">{formatCurrency(finalAmt, state.settings.currency)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )} {/* end ternary */}
      </div>
      )} {/* end !showForm */}
    </>
  );
}
