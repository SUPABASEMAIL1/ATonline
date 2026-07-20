import { useEffect, useState } from 'react';
import {
  Trash2, Plus, Minus, User, FileText, ShoppingCart, X,
  UserPlus, Eraser, AlertCircle, Gift, MessageCircle, Edit2, Eye, Info,
  Package
} from 'lucide-react';
import { CustomerDetailModal } from '../customers/CustomerDetailModal';
import { customersService, bundlesService } from '../../lib/services';
import { sonner } from '../../lib/sonner';
import { localDb } from '../../lib/localDb';
import { Bundle, CartItem, Customer } from '../../types';
import { useApp } from '../../context/SupabaseAppContext';
import { useTranslation } from '../../hooks/useTranslation';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, getCurrencySymbol } from '../../lib/currencies';
import { getDealCountBreakdown } from '../../lib/utils';
import { useCartCalculations } from '../../hooks/useCartCalculations';
import { Modal } from '../common/Modal';
import { HelpTooltip } from '../common/HelpTooltip';

interface CartProps {
  onCheckout: () => void;
  onSaveDraft: () => void;
  isMobileDrawer?: boolean;
  onClose?: () => void;
}

export function Cart({ onCheckout, onSaveDraft, isMobileDrawer, onClose }: CartProps) {
  const { state, dispatch } = useApp();
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '' });
  const [viewingCustomer, setViewingCustomer] = useState<import('../../types').Customer | null>(null);
  const [billDiscountInput, setBillDiscountInput] = useState('');
  const [showPromoModal, setShowPromoModal] = useState(false);

  const isTouchMode = state.settings.interfaceMode === 'touch';

  const showDiscount = state.settings.receiptShowDiscount !== false && 
    !state.cart.some(item => item.bundleHideItemPrices === true || item.bundle_hide_item_prices === true);

  const updateQuantity = (index: number, newQuantity: number) => {
    const item = state.cart[index];
    const price = item.product.price;
    const toppingsTotal = (item.toppings || []).reduce((sum: number, t: any) => sum + t.price, 0);
    const effectivePrice = price + toppingsTotal;
    
    let updatedDiscount = item.discount || 0;
    if (item.discountValue && item.discountValue > 0) {
      if (item.discountType === 'percentage') {
        updatedDiscount = (effectivePrice * newQuantity * item.discountValue) / 100;
      } else {
        updatedDiscount = Math.sign(newQuantity) * item.discountValue;
      }
    }
    if (newQuantity === 0) {
      updatedDiscount = 0;
    }

    dispatch({
      type: 'UPDATE_CART_ITEM',
      payload: {
        index,
        item: {
          ...item,
          quantity: newQuantity,
          discount: updatedDiscount,
          subtotal: effectivePrice * newQuantity - updatedDiscount,
        },
      },
    });
  };

  const updateBundleQuantity = async (bundleId: string, newBundleQty: number) => {
    if (newBundleQty === 0) {
      const newCart = state.cart.filter(x => (x.bundleId || x.bundle_id) !== bundleId);
      dispatch({ type: 'SET_CART', payload: newCart });
      return;
    }

    let bundleDef = state.bundles?.find(b => b.id === bundleId);
    if (!bundleDef) {
      const localBundle = await localDb.bundles.get(bundleId);
      if (localBundle) {
        const bundleItems = await localDb.bundleItems.where('bundleId').equals(bundleId).toArray();
        bundleDef = {
          ...localBundle,
          discountValue: Number(localBundle.discountValue) || 0,
          discountType: localBundle.discountType || 'percentage',
          active: localBundle.active !== false,
          hideItemPrices: localBundle.hideItemPrices === true,
          items: bundleItems.map((bi: any) => ({
            id: bi.id,
            bundleId: bi.bundleId,
            productId: bi.productId,
            quantity: Number(bi.quantity) || 1,
          })),
        } as Bundle;
      }
    }
    if (!bundleDef) {
      console.warn(`[Cart] Cannot update bundle ${bundleId}: definition not found in state or localDb.`);
      sonner.error('Bundle definition not found. Try refreshing.');
      return;
    }

    // Get the base items for 1 bundle unit
    const baseItems = bundlesService.getBundleCartItems(bundleDef, state.products);
    
    // Map existing cart items: if they belong to this bundle, update them using baseItems; else keep them
    const newCart = state.cart.map(item => {
      if ((item.bundleId || item.bundle_id) === bundleId) {
        const baseItem = baseItems.find(x => x.product.id === item.product.id);
        if (baseItem) {
          const qty = baseItem.quantity * newBundleQty;
          const discount = (baseItem.discount || 0) * newBundleQty;
          const toppingsTotal = (item.toppings || []).reduce((sum: number, t: any) => sum + t.price, 0);
          return {
            ...item,
            quantity: qty,
            discount: discount,
            subtotal: (item.product.price + toppingsTotal) * qty - discount
          };
        }
      }
      return item;
    });

    dispatch({ type: 'SET_CART', payload: newCart });
  };

  const removeFromCart = (index: number) => dispatch({ type: 'REMOVE_FROM_CART', payload: index });

  const applyDiscount = (index: number, discount: number, discountType: 'percentage' | 'fixed') => {
    const item = state.cart[index];
    const price = item.product.price;
    const toppingsTotal = (item.toppings || []).reduce((sum: number, t: any) => sum + t.price, 0);
    const effectivePrice = price + toppingsTotal;
    const discountAmount =
      discountType === 'percentage'
        ? (effectivePrice * item.quantity * discount) / 100
        : Math.sign(item.quantity) * discount;
    dispatch({
      type: 'UPDATE_CART_ITEM',
      payload: {
        index,
        item: {
          ...item,
          discount: discountAmount,
          discountValue: discount,
          discountType,
          subtotal: effectivePrice * item.quantity - discountAmount,
        },
      },
    });
  };

  const selectCustomer = (customer: Customer) => {
    dispatch({ type: 'SET_SELECTED_CUSTOMER', payload: customer });
    setShowCustomerSearch(false);
    setCustomerSearch('');
    setIsAddingCustomer(false);
  };

  const handleQuickAddCustomer = async () => {
    if (!newCustomer.name || !newCustomer.phone) {
      sonner.alert('Error!', 'Name and Phone are required.');
      return;
    }
    try {
      const customerData: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'> = {
        name: newCustomer.name,
        phone: newCustomer.phone,
        email: newCustomer.email,
        address: '',
        creditLimit: 0,
        creditUsed: 0,
        priceTier: 'retail',
        totalPurchases: 0,
      };
      const created = await customersService.create(customerData);
      dispatch({ type: 'ADD_CUSTOMER', payload: created });
      dispatch({ type: 'SET_SELECTED_CUSTOMER', payload: created });
      setIsAddingCustomer(false);
      setShowCustomerSearch(false);
      setCustomerSearch('');
      setNewCustomer({ name: '', phone: '', email: '' });
      sonner.success('Customer added and selected.');
    } catch {
      sonner.alert('Error!', 'Failed to create customer.');
    }
  };

  const filteredCustomers = state.customers.filter(
    (c) =>
      (c.name || '').toLowerCase().includes((customerSearch || '').toLowerCase()) ||
      (c.email || '').toLowerCase().includes((customerSearch || '').toLowerCase()) ||
      (c.phone || '').includes(customerSearch || '')
  );

  const { subtotal, totalDiscount, taxAmount, total, activePromotions, freeGifts, billDiscountAmount, isBelowCost, manualItemDiscountTotal } =
    useCartCalculations();

  const cartItems = state.cart;
  const { totalPcs, dealsCount, standaloneCount, label: dealLabel } = getDealCountBreakdown(cartItems, state.bundles);

  useEffect(() => {
    setBillDiscountInput(state.billDiscountValue > 0 ? String(state.billDiscountValue) : '');
  }, [state.billDiscountValue, state.activeSalesTab]);

  return (
    <div
      className={`
        bg-white dark:bg-surface flex flex-col transition-all duration-300
        border border-gray-200 dark:border-white/10 overflow-hidden
        ${isMobileDrawer
          ? 'w-full h-full rounded-2xl shadow-2xl'
          : `rounded-[1.5rem] shadow-2xl
             ${isTouchMode ? 'w-full lg:w-[410px]' : 'w-full lg:w-[340px]'}
             h-full`
        }
      `}
    >
      {/* ══ HEADER ══ */}
      <div className="shrink-0 pl-4 pr-5 pt-3 pb-2 border-b border-gray-200 dark:border-white/10 bg-white dark:bg-surface z-30 shadow-sm shadow-gray-200/50 dark:shadow-none">
        {/* Title row */}
          <div className="flex items-start sm:items-center justify-between mb-2">
            <div className="flex items-start sm:items-center gap-2 flex-wrap">
              <h2 className={`font-black text-gray-900 dark:text-white flex items-center ${isTouchMode ? 'text-base' : 'text-sm'}`}>
              {t('cart', 'Cart')}
              <HelpTooltip position="bottom" content="Current active cart session. Items scanned or tapped from the catalog are accumulated here." />
            </h2>
            <span className="text-[9px] font-black bg-primary/10 text-primary dark:text-emerald-400 px-2 py-0.5 rounded-full uppercase tracking-widest whitespace-normal">
              {dealLabel}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {state.cart.length > 0 && (
              <>
                <button
                  onClick={() =>
                    sonner.confirm('Clear Cart?', 'Remove all items?').then((r) => r.isConfirmed && dispatch({ type: 'CLEAR_CART' }))
                  }
                  className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-full transition-all active:scale-95 flex items-center gap-1"
                  title="Clear Cart"
                >
                  <Eraser className="h-3.5 w-3.5" />
                </button>
                <HelpTooltip position="bottom" content="Instantly wipes all items from the current active cart." />
              </>
            )}
            {isMobileDrawer && onClose ? (
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-colors"
              >
                <X className="h-4 w-4 text-gray-600" />
              </button>
            ) : (
              <ShoppingCart className="h-4 w-4 text-gray-600 dark:text-gray-500" />
            )}
          </div>
        </div>
        
        {/* Editing Sale Banner */}
        {state.editingSaleId && (
          <div className="mb-2 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 bg-amber-500 rounded-lg flex items-center justify-center">
                <Edit2 className="h-3 w-3 text-white" />
              </div>
              <div>
                <p className="text-[9px] font-black text-amber-700 dark:text-amber-400 uppercase leading-none">
                  {t('editing_sale', 'Editing Sale')}
                </p>
                <p className="text-[8px] font-bold text-amber-600/60 uppercase tracking-widest mt-0.5">ID: {state.editingSaleId.substring(0, 12)}...</p>
              </div>
              <HelpTooltip position="bottom" content="You are modifying an existing finalized sale. Canceling restores original. Saving replaces it with an atomic ledger update." />
            </div>
            <button 
              onClick={() => {
                sonner.confirm('Cancel Edit?', 'The current changes will be lost and the original bill will remain as is.').then(r => {
                  if (r.isConfirmed) dispatch({ type: 'CLEAR_CART' });
                });
              }}
              className="flex items-center gap-1.5 px-3 h-7 bg-amber-500 text-white rounded-full text-[8px] font-black uppercase tracking-widest active:scale-95 transition-all shadow-sm shadow-amber-500/20"
            >
              <X className="h-2.5 w-2.5" /> <span>{t('cancel', 'Cancel')}</span>
            </button>
          </div>
        )}

        {/* Customer row */}
        <div className="relative">
          {state.selectedCustomer ? (
            <div className="flex items-center justify-between bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 rounded-full px-3.5 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black text-emerald-800 dark:text-emerald-400 truncate leading-none">
                  {state.selectedCustomer.name}
                </p>
                <p className="text-[9px] text-primary dark:text-primary truncate mt-0.5">
                  {state.selectedCustomer.phone || state.selectedCustomer.email}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-2">
                {state.selectedCustomer.phone && (
                  <button
                    onClick={() => {
                      const clean = state.selectedCustomer!.phone.replace(/\D/g, '');
                      window.open(`https://wa.me/${clean}`, '_blank');
                    }}
                    className="p-1.5 text-primary hover:bg-emerald-500/10 rounded-full transition-all active:scale-95"
                    title="WhatsApp"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setViewingCustomer(state.selectedCustomer)}
                  className="p-1.5 text-blue-500 hover:bg-blue-500/10 rounded-full transition-all active:scale-95"
                  title="View Customer"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => dispatch({ type: 'SET_SELECTED_CUSTOMER', payload: null })}
                  className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-full transition-all active:scale-95"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowCustomerSearch(true)}
                className="w-full flex items-center justify-center gap-2 h-9 rounded-full border border-dashed border-gray-300 dark:border-white/10 text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:border-emerald-400 hover:text-primary hover:bg-emerald-500/5 active:scale-95 transition-all"
              >
                <User className="h-3.5 w-3.5" />
                {t('select_customer', 'Select Customer')}
              </button>
              <HelpTooltip content="Link a customer to track credit sales, loyalty history, and send instant WhatsApp receipts upon settlement." />
            </div>
          )}

          {/* ── Customer Search Dropdown ── */}
          {showCustomerSearch && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-[#1f1f1f] border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl z-50 max-h-[50vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
              {!isAddingCustomer ? (
                <div className="p-3 space-y-3">
                  <div className="relative">
                    <input
                      type="text"
                      autoFocus
                      placeholder={t('search_customer_placeholder', 'Search name, phone, email...')}
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="w-full bg-gray-100 dark:bg-black/30 border-none rounded-xl px-4 py-2.5 text-[11px] font-bold text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-emerald-500/20"
                    />
                    <button
                      onClick={() => setIsAddingCustomer(true)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-primary hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors flex items-center gap-1 text-[9px] font-black uppercase tracking-wider"
                    >
                      <Plus className="h-3.5 w-3.5" /> {t('new', 'NEW')}
                    </button>
                  </div>

                  <div className="max-h-[220px] overflow-y-auto custom-scrollbar divide-y divide-gray-100 dark:divide-white/5 pr-1">
                    {filteredCustomers.length === 0 ? (
                      <div className="py-8 text-center space-y-2">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">No customer found</p>
                        <button
                          onClick={() => setIsAddingCustomer(true)}
                          className="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-primary rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-colors"
                        >
                          + Create New Customer
                        </button>
                      </div>
                    ) : (
                      filteredCustomers.map((customer) => (
                        <div
                          key={customer.id}
                          className="flex items-center gap-1 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-all group"
                        >
                          <button
                            onClick={() => selectCustomer(customer)}
                            className="flex-1 text-left p-2.5 flex items-center justify-between"
                          >
                            <div>
                              <p className="text-[11px] font-black text-gray-900 dark:text-white uppercase leading-none group-hover:text-primary transition-colors">
                                {customer.name}
                              </p>
                              <p className="text-[9px] text-gray-500 mt-1">
                                {customer.phone || customer.email || 'No contact info'}
                              </p>
                            </div>
                            {customer.creditUsed > 0 && (
                              <span className="text-[9px] font-black text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-md uppercase tracking-wider">
                                Credit: {formatCurrency(customer.creditUsed, state.settings.currency)}
                              </span>
                            )}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setViewingCustomer(customer); setShowCustomerSearch(false); }}
                            className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100 mr-1"
                            title="View customer profile"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Skip / No Customer */}
                  <button
                    onClick={() => { setShowCustomerSearch(false); setCustomerSearch(''); }}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-all border border-dashed border-gray-200 dark:border-white/10"
                  >
                    <X className="h-3 w-3" />
                    Skip — No Customer
                  </button>
                </div>
              ) : (
                <div className="p-3 space-y-3 bg-emerald-50/50 dark:bg-emerald-950/10">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-black text-emerald-800 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                      <UserPlus className="h-3 w-3 text-primary" /> Quick Add Customer
                    </span>
                    <button onClick={() => setIsAddingCustomer(false)}>
                      <X className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600" />
                    </button>
                  </div>

                  <div className="space-y-2">
                    {['name', 'phone', 'email'].map((key) => (
                      <input
                        key={key}
                        type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'}
                        placeholder={`Customer ${key.toUpperCase()}${key === 'name' || key === 'phone' ? ' *' : ''}`}
                        value={newCustomer[key as keyof typeof newCustomer]}
                        onChange={(e) => setNewCustomer({ ...newCustomer, [key]: e.target.value })}
                        className="w-full bg-white dark:bg-black/30 border border-emerald-200 dark:border-emerald-800/30 rounded-xl px-3 py-2 text-[11px] font-bold text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-emerald-500/20"
                      />
                    ))}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button onClick={handleQuickAddCustomer} className="btn btn-md btn-primary flex-1 hover:bg-emerald-700">
                      Save & Link
                    </button>
                    <button
                      onClick={() => setIsAddingCustomer(false)}
                      className="px-3 py-1.5 bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-gray-300 text-[9px] font-bold uppercase tracking-wider rounded-lg hover:bg-gray-300 transition-colors"
                    >
                      Back
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ══ CART ITEMS ══ */}
      <div
        className="flex-1 min-h-0 overflow-y-auto"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}
      >
        {state.cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-8 opacity-70">
            <div className="bg-gray-100 dark:bg-white/5 p-5 rounded-2xl mb-3">
              <ShoppingCart className="h-8 w-8 text-gray-600 dark:text-gray-500" />
            </div>
            <p className="text-[11px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest">{t('cart_empty', 'Cart is empty')}</p>
            <p className="text-[9px] text-gray-600 mt-1">{t('add_products_to_start', 'Add products to get started')}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-white/5">
            {(() => {
              const groupCartItems = (cartItems: CartItem[]) => {
                const bundlesMap = new Map<string, {
                  bundleId: string;
                  bundleName: string;
                  bundleImage?: string;
                  items: { item: CartItem; originalIndex: number }[];
                  totalOriginal: number;
                  totalDiscount: number;
                  totalSubtotal: number;
                  bundleQty: number;
                }>();
                const standaloneItems: { item: CartItem; originalIndex: number }[] = [];

                cartItems.forEach((item, index) => {
                  const bundleId = item.bundleId || item.bundle_id;
                  const bundleName = item.bundleName || item.bundle_name;

                  if (bundleId) {
                    if (!bundlesMap.has(bundleId)) {
                      bundlesMap.set(bundleId, {
                        bundleId,
                        bundleName: bundleName || 'Deal',
                        items: [],
                        totalOriginal: 0,
                        totalDiscount: 0,
                        totalSubtotal: 0,
                        bundleQty: 1
                      });
                    }
                    const b = bundlesMap.get(bundleId)!;
                    b.items.push({ item, originalIndex: index });
                    b.totalOriginal += item.product.price * item.quantity;
                    b.totalDiscount += item.discount || 0;
                    b.totalSubtotal += item.subtotal || 0;
                  } else {
                    standaloneItems.push({ item, originalIndex: index });
                  }
                });

                bundlesMap.forEach((b) => {
                  const bundleDef = state.bundles?.find(x => x.id === b.bundleId);
                  if (bundleDef?.image) b.bundleImage = bundleDef.image;
                  let bundleQty = 1;
                  if (bundleDef && bundleDef.items && bundleDef.items.length > 0) {
                    const firstBi = bundleDef.items[0];
                    const cartItem = b.items.find(x => x.item.product.id === firstBi.productId);
                    if (cartItem) {
                      bundleQty = Math.round(cartItem.item.quantity / firstBi.quantity);
                    }
                  } else if (b.items.length > 0) {
                    bundleQty = b.items[0].item.quantity;
                  }
                  b.bundleQty = bundleQty;
                });

                return {
                  bundles: Array.from(bundlesMap.values()),
                  standaloneItems
                };
              };

              const { bundles, standaloneItems } = groupCartItems(state.cart);

              const renderedBundlesHeader = bundles.length > 0 ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-[8px] font-black text-violet-600 dark:text-violet-400 uppercase tracking-widest bg-violet-500/[0.03] border-b border-violet-500/10 mb-1">
                  <Gift className="h-3 w-3 text-violet-500 shrink-0" />
                  <span>{t('combo_deals_sec', 'Bundle / Deal Items')} ({bundles.length})</span>
                </div>
              ) : null;

              const renderedStandalonesHeader = bundles.length > 0 && standaloneItems.length > 0 ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-[8px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest bg-gray-50 dark:bg-white/[0.02] border-y border-gray-100 dark:border-white/5 my-1">
                  <ShoppingCart className="h-3 w-3 text-gray-400 shrink-0" />
                  <span>{t('standalone_items_sec', 'Other / Standalone Items')} ({standaloneItems.length})</span>
                </div>
              ) : null;

              const bundleImage = (b: typeof bundles[number]) => {
                return b.bundleImage || b.items[0]?.item.product.image || null;
              };

              let itemNumber = 0;

              const renderedBundleSummaries = bundles.map((b) => (
                <div key={`cart-bundle-${b.bundleId}`} className="px-2 py-1.5 mx-2 mb-1 rounded-xl border border-dashed border-violet-500/25 bg-violet-500/[0.01] animate-in fade-in duration-200">
                  <div className="flex items-center gap-1.5">
                    {/* Thumbnail */}
                    <div className="w-9 h-9 rounded-lg overflow-hidden bg-violet-100 dark:bg-violet-900/20 shrink-0 flex items-center justify-center aspect-square">
                      {bundleImage(b) ? (
                        <img src={bundleImage(b)!} alt={b.bundleName} className="w-full h-full object-cover" />
                      ) : (
                        <Package className="h-3.5 w-3.5 text-violet-400" />
                      )}
                    </div>
                    {/* Name + Price */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-black text-violet-700 dark:text-violet-300 truncate leading-tight">{b.bundleName}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className={`text-[8px] font-bold ${b.items.some(({ item }) => item.bundleHideItemPrices === true) ? 'text-violet-700 dark:text-violet-300' : 'text-gray-500'}`}>
                          {formatCurrency(b.totalSubtotal, state.settings.currency)}
                        </span>
                        {showDiscount && b.totalDiscount > 0 && (
                          <span className="text-[7px] font-black text-rose-500 bg-rose-500/10 px-1 py-[1px] rounded leading-none">
                            -{formatCurrency(b.totalDiscount, state.settings.currency)}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Qty stepper */}
                    <div className="flex items-center bg-violet-500/5 dark:bg-violet-500/10 rounded-full border border-violet-500/20 shrink-0 overflow-hidden">
                      <button
                        onClick={() => updateBundleQuantity(b.bundleId, b.bundleQty - 1)}
                        className="w-5 h-5 flex items-center justify-center text-violet-500 hover:text-red-500 hover:bg-violet-500/10 transition-colors"
                      >
                        <Minus className="h-2 w-2" />
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={b.bundleQty || ''}
                        onChange={(e) => {
                          const val = parseInt(e.target.value.replace(/[^0-9-]/g, ''));
                          updateBundleQuantity(b.bundleId, isNaN(val) ? 0 : val);
                        }}
                        onKeyDown={(e) => e.stopPropagation()}
                        className={`w-6 bg-transparent text-center text-[8px] font-black focus:outline-none border-0 p-0 no-spinners select-all ${
                          b.bundleQty < 0 ? 'text-red-500' : 'text-violet-600 dark:text-violet-400'
                        }`}
                      />
                      <button
                        onClick={() => updateBundleQuantity(b.bundleId, b.bundleQty + 1)}
                        className="w-5 h-5 flex items-center justify-center text-violet-500 hover:text-primary hover:bg-violet-500/10 transition-colors"
                      >
                        <Plus className="h-2 w-2" />
                      </button>
                    </div>
                    {/* Delete */}
                    <button
                      onClick={() =>
                        sonner.confirm('Remove Bundle?', `Are you sure you want to remove the bundle "${b.bundleName}"?`).then((r) => { if (r.isConfirmed) updateBundleQuantity(b.bundleId, 0).catch(() => {}); })
                      }
                      className="p-1 text-violet-400 hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                      title="Remove Entire Bundle"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  {/* Nested item list */}
                  <div className="mt-2 pl-10 border-t border-dashed border-violet-500/10 pt-1.5 space-y-1">
                    {b.items.map(({ item }) => (
                      <CartItemCard
                        key={`${item.product.id}-${++itemNumber}`}
                        item={item}
                        index={itemNumber - 1}
                        onUpdateQuantity={updateQuantity}
                        onRemove={removeFromCart}
                        onApplyDiscount={applyDiscount}
                        currency={state.settings.currency}
                        dispatch={dispatch}
                        profile={profile}
                        isNested={true}
                        isFromBundle={true}
                      />
                    ))}
                  </div>
                </div>
              ));

              const renderedStandalones = standaloneItems.map(({ item }) => (
                <CartItemCard
                  key={`${item.product.id}-${++itemNumber}`}
                  item={item}
                  index={itemNumber - 1}
                  onUpdateQuantity={updateQuantity}
                  onRemove={removeFromCart}
                  onApplyDiscount={applyDiscount}
                  currency={state.settings.currency}
                  dispatch={dispatch}
                  profile={profile}
                />
              ));

              return (
                <>
                  {/* No Active Promotions Banner */}
                  {cartItems.length > 0 && activePromotions.length === 0 && (
                    <div className="px-3 py-1.5 flex items-center gap-1.5 bg-amber-500/[0.03] border-b border-amber-500/10">
                      <Info className="h-2.5 w-2.5 text-amber-500 shrink-0" />
                      <span className="text-[7px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest">
                        No Active Promotions
                      </span>
                    </div>
                  )}
                  {renderedBundlesHeader}
                  {renderedBundleSummaries}
                  {renderedStandalonesHeader}
                  {renderedStandalones}
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* ══ SUMMARY + CHECKOUT ══ */}
      {state.cart.length > 0 && (
        <div className="shrink-0 border-t border-gray-200 dark:border-white/10 bg-gray-50/80 dark:bg-black/75">

          {/* Subtotal / Tax / Discounts */}
          <div className="pl-4 pr-5 pt-2 pb-1 space-y-1">

            {/* Sub + Tax */}
            {showDiscount && (
              <div className="flex justify-between text-[9px] font-bold text-gray-600">
                <span>{t('subtotal', 'Subtotal')}</span>
                <span className="text-gray-700 dark:text-gray-300">{formatCurrency(subtotal, state.settings.currency)}</span>
              </div>
            )}
            {Math.abs(taxAmount) > 0 && (
              <div className="flex justify-between text-[9px] font-bold text-gray-600">
                <span>{t('tax', 'Tax')} ({state.settings.taxRate}%)</span>
                <span className="text-gray-700 dark:text-gray-300">{formatCurrency(Math.abs(taxAmount), state.settings.currency)}</span>
              </div>
            )}

            {/* Item discounts */}
            {showDiscount && Math.abs(manualItemDiscountTotal) > 0 && (
              <div className="flex justify-between text-[9px] font-black text-primary dark:text-emerald-400">
                <span>{t('discount', 'Discount')}</span>
                <span>-{formatCurrency(Math.abs(manualItemDiscountTotal), state.settings.currency)}</span>
              </div>
            )}

            {/* Promotions */}
            {showDiscount && activePromotions.map((promo, i) => (
              <div key={i} className="flex items-center justify-between bg-primary/5 border border-primary/10 rounded-lg px-2 py-0.5">
                <span className="text-[8px] font-black text-emerald-700 dark:text-emerald-400 uppercase truncate pr-2">{promo.discountName}</span>
                <span className="text-[8px] font-black text-primary shrink-0">-{formatCurrency(promo.discountAmount, state.settings.currency)}</span>
              </div>
            ))}
            {/* Free gifts */}
            {freeGifts.map((gift, i) => (
              <div key={i} className="flex items-center justify-between bg-purple-500/5 border border-purple-500/10 rounded-lg px-2 py-0.5">
                <span className="text-[8px] font-black text-purple-600 dark:text-purple-400 uppercase truncate pr-2">FREE: {gift.product.name}</span>
                <Gift className="h-3 w-3 text-purple-500 shrink-0" />
              </div>
            ))}
          </div>

          {/* Bill Discount Row */}
          <div className="pl-4 pr-5 pb-2">
            <div className="flex items-center gap-1.5 w-full">
              {/* % / $ toggle */}
              <div className="flex items-center bg-gray-150 dark:bg-white/5 p-0.5 rounded-full shrink-0 self-center">
                {(['percentage', 'fixed'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() =>
                      dispatch({
                        type: 'UPDATE_SALES_TAB',
                        payload: { id: state.activeSalesTab, updates: { billDiscountType: type } },
                      })
                    }
                    disabled={profile?.role !== 'admin' && !profile?.canGiveDiscount}
                    className={`flex items-center justify-center min-w-[32px] h-[26px] px-2 text-[10px] font-black rounded-full transition-all ${state.billDiscountType === type
                      ? 'bg-white dark:bg-zinc-800 text-primary dark:text-white shadow-sm'
                      : 'text-gray-500'
                      } disabled:opacity-40`}
                  >
                    {type === 'percentage' ? '%' : getCurrencySymbol(state.settings.currency)}
                  </button>
                ))}
              </div>

              {/* Discount input */}
              <div className="relative flex-1 flex items-center">
                <input
                  type="text"
                  value={billDiscountInput}
                  dir="ltr"
                  inputMode="decimal"
                  disabled={profile?.role !== 'admin' && !profile?.canGiveDiscount}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (!/^\d*\.?\d*$/.test(raw)) return;
                    setBillDiscountInput(raw);
                    const val = parseFloat(raw);
                    dispatch({
                      type: 'UPDATE_SALES_TAB',
                      payload: { id: state.activeSalesTab, updates: { billDiscountValue: Number.isFinite(val) ? val : 0 } },
                    });
                  }}
                  onBlur={() => {
                    const val = parseFloat(billDiscountInput);
                    const normalized = Number.isFinite(val) && val > 0 ? String(val) : '';
                    setBillDiscountInput(normalized);
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder={t('bill_discount', 'Bill discount')}
                  className={`w-full text-left text-[11px] font-bold bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/10 rounded-full h-[32px] py-1 pl-3 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 ${billDiscountAmount > 0 ? 'pr-16' : 'pr-3'}`}
                />
                <HelpTooltip content="Apply a discount to the entire bill (either percentage or fixed currency amount). Requires authorized discount privileges." />
                {showDiscount && Math.abs(billDiscountAmount) > 0 && (
                  <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[8px] font-black text-primary pointer-events-none">
                    -{formatCurrency(Math.abs(billDiscountAmount), state.settings.currency)}
                  </span>
                )}
              </div>

              {(profile?.role === 'admin' || profile?.canGiveDiscount) && state.billDiscountValue > 0 && (
                <button
                  onClick={() => {
                    setBillDiscountInput('');
                    dispatch({
                      type: 'UPDATE_SALES_TAB',
                      payload: { id: state.activeSalesTab, updates: { billDiscountValue: 0 } },
                    });
                  }}
                  className="shrink-0 w-[32px] h-[32px] flex items-center justify-center bg-gray-100 dark:bg-white/5 border border-transparent rounded-full text-gray-500 hover:text-red-500 hover:bg-rose-500/10 transition-colors active:scale-95"
                  title="Clear Discount"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}

              {/* Promo picker */}
              {(profile?.role === 'admin' || profile?.canGiveDiscount) && (
                <button
                  onClick={() => {
                    const promos = state.discounts.filter((d) => d.active);
                    if (!promos.length) { sonner.info('No active promotions.'); return; }
                    setShowPromoModal(true);
                  }}
                  className="shrink-0 w-[32px] h-[32px] flex items-center justify-center bg-gray-100 dark:bg-white/5 border border-transparent rounded-full text-gray-500 hover:text-primary hover:bg-emerald-500/10 transition-colors active:scale-95"
                  title="Browse Promotions"
                >
                  <Gift className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Grand Total + Buttons */}
          <div className="flex items-center justify-between pl-4 pr-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-2.5 border-t border-gray-200 dark:border-white/10">
            <div>
              <p className="text-[8px] font-black text-gray-600 uppercase tracking-widest leading-none">{t('grand_total', 'Grand Total')}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <span className={`text-lg font-black tracking-tight leading-none ${isBelowCost ? 'text-red-500 animate-pulse' : 'text-amber-500 dark:text-amber-400'}`}>
                  {formatCurrency(total, state.settings.currency)}
                </span>
                {isBelowCost && <AlertCircle className="h-3 w-3 text-red-500" />}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="flex items-center">
                <button
                  onClick={onSaveDraft}
                  disabled={state.cart.length === 0 || state.cart.reduce((s, i) => s + Math.abs(i.quantity), 0) === 0}
                  title="Save Draft / Hold Order"
                  className="p-2.5 rounded-full bg-gray-150/70 dark:bg-white/5 text-gray-500 dark:text-gray-400 hover:bg-gray-250 dark:hover:bg-white/10 transition-all active:scale-95 disabled:opacity-40"
                >
                  <FileText className="h-3.5 w-3.5" />
                </button>
                <HelpTooltip content="Hold Order / Save Draft: Store this incomplete order to attend to another customer, then resume it anytime from Drafts." />
              </span>
              <span className="flex items-center">
                <button
                  onClick={onCheckout}
                  disabled={state.cart.length === 0 || state.cart.reduce((s, i) => s + Math.abs(i.quantity), 0) === 0}
                  className="px-5 py-2.5 h-[40px] rounded-full bg-primary text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:bg-primary-hover active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t('checkout', 'Checkout')}
                </button>
                <HelpTooltip content="Proceed to settlement modal to collect cash, split payments, record credit sales, and print/WhatsApp receipt." />
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Promotion Selection Modal */}
      <Modal
        isOpen={showPromoModal}
        onClose={() => setShowPromoModal(false)}
        title={t('select_promotion', 'SELECT PROMOTION')}
        subtitle={t('apply_active_offers', 'APPLY ACTIVE OFFERS TO BILL')}
        maxWidth="sm"
      >
        <div className="space-y-3">
          {state.discounts.filter(d => d.active).map(d => (
            <button
              key={d.id}
              onClick={() => {
                setBillDiscountInput(String(d.value));
                dispatch({
                  type: 'UPDATE_SALES_TAB',
                  payload: {
                    id: state.activeSalesTab,
                    updates: {
                      billDiscountValue: d.value,
                      billDiscountType: d.type === 'percentage' ? 'percentage' : 'fixed'
                    }
                  }
                });
                setShowPromoModal(false);
                sonner.success(`"${d.name}" applied!`);
              }}
              className="w-full text-left p-5 bg-gray-50 dark:bg-white/5 hover:bg-emerald-50 dark:hover:bg-primary/10 border border-gray-200 dark:border-white/5 rounded-2xl transition-all active:scale-[0.98] group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -mr-8 -mt-8 group-hover:bg-primary/10 transition-colors" />
              
              <div className="flex justify-between items-start mb-2 relative z-10">
                <div className="space-y-0.5">
                  <p className="font-black text-[12px] text-gray-900 dark:text-white uppercase tracking-tight group-hover:text-primary transition-colors">{d.name}</p>
                  <p className="text-[8px] font-black text-gray-600 uppercase tracking-[0.2em]">Promotion ID: {d.id.slice(-6).toUpperCase()}</p>
                </div>
                <span className="text-[10px] font-black text-primary bg-primary/10 px-3 py-1 rounded-full border border-primary/20 shadow-sm">
                  {d.type === 'percentage' ? d.value + '%' : formatCurrency(d.value, state.settings.currency)} OFF
                </span>
              </div>
              
              {d.minAmount ? (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-white/5 relative z-10">
                  <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                  <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">
                    Unlock at {formatCurrency(d.minAmount, state.settings.currency)}+
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-white/5 relative z-10">
                  <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                  <p className="text-[9px] text-primary/60 font-black uppercase tracking-widest">Available for all orders</p>
                </div>
              )}
            </button>
          ))}
          
          {state.discounts.filter(d => d.active).length === 0 && (
            <div className="py-12 text-center">
              <Gift className="w-12 h-12 text-gray-200 dark:text-gray-500 mx-auto mb-4" />
              <p className="text-[11px] font-black text-gray-600 uppercase tracking-widest">No Active Promotions</p>
            </div>
          )}
        </div>
      </Modal>

      {/* Customer Profile Viewer */}
      {viewingCustomer && (
        <CustomerDetailModal
          customer={viewingCustomer}
          onClose={() => setViewingCustomer(null)}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   CART ITEM CARD
══════════════════════════════════════════════════ */
interface CartItemCardProps {
  item: CartItem;
  index: number;
  onUpdateQuantity: (index: number, quantity: number) => void;
  onRemove: (index: number) => void;
  onApplyDiscount: (index: number, discount: number, type: 'percentage' | 'fixed') => void;
  currency: string;
  dispatch: any;
  profile: any;
  isNested?: boolean;
  isFromBundle?: boolean;
}

function CartItemCard({ item, index, onUpdateQuantity, onRemove, onApplyDiscount, currency, dispatch, profile, isNested, isFromBundle }: CartItemCardProps) {
  const { state } = useApp();
  const showDiscount = state.settings.receiptShowDiscount !== false && 
    !state.cart.some(cartItem => cartItem.bundleHideItemPrices === true || cartItem.bundle_hide_item_prices === true);
  const hidePrices = item.bundleHideItemPrices === true;
  const [showDiscountInput, setShowDiscountInput] = useState(false);
  const [discountValue, setDiscountValue] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [tempPrice, setTempPrice] = useState('');

  const handleDiscountSubmit = () => {
    const value = parseFloat(discountValue);
    if (!isNaN(value) && value > 0) {
      onApplyDiscount(index, value, discountType);
      setShowDiscountInput(false);
      setDiscountValue('');
    }
  };

  const handlePriceSubmit = () => {
    const newPrice = parseFloat(tempPrice);
    if (!isNaN(newPrice) && newPrice >= 0) {
      const toppingsTotal = (item.toppings || []).reduce((sum: number, t: any) => sum + t.price, 0);
      const updatedProduct = { ...item.product, price: newPrice };
      const quantityTotal = (newPrice + toppingsTotal) * item.quantity;
      const calculatedDiscount =
        item.discountValue && item.discountValue > 0
          ? item.discountType === 'percentage'
            ? (quantityTotal * item.discountValue) / 100
            : item.discountValue
          : 0;
      dispatch({
        type: 'UPDATE_CART_ITEM',
        payload: { index, item: { ...item, product: updatedProduct, discount: calculatedDiscount, subtotal: quantityTotal - calculatedDiscount } },
      });
    }
    setIsEditingPrice(false);
  };

  const clearItemDiscount = () => {
    const toppingsTotal = (item.toppings || []).reduce((sum: number, t: any) => sum + t.price, 0);
    dispatch({
      type: 'UPDATE_CART_ITEM',
      payload: {
        index,
        item: {
          ...item,
          discount: 0,
          discountValue: 0,
          subtotal: (item.product.price + toppingsTotal) * item.quantity,
        },
      },
    });
    setShowDiscountInput(false);
    setDiscountValue('');
  };

  return (
    <div className={`group hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors overflow-hidden ${isNested ? 'pl-0 pr-1 py-0.5 hover:bg-transparent dark:hover:bg-transparent' : isFromBundle ? 'pl-3 pr-4 py-1' : 'pl-3 pr-4 py-1.5'}`}>
      {/* Main row */}
      <div className="flex items-center gap-1.5">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 text-[10px] font-bold shrink-0">{index + 1}</span>
        {/* Thumbnail (not for nested items) */}
        {!isNested && (
          <div className="w-9 h-9 rounded-lg overflow-hidden bg-gray-100 dark:bg-white/5 shrink-0 flex items-center justify-center self-start mt-0.5 aspect-square">
            {item.product.image ? (
              <img src={item.product.image} alt={item.product.name} className="w-full h-full object-cover" />
            ) : (
              <Package className="h-4 w-4 text-gray-300" />
            )}
          </div>
        )}

        {/* Product name + price */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <p className="text-[10px] font-black text-gray-900 dark:text-gray-100 truncate leading-tight">
              {item.product.name}
            </p>
            {isFromBundle && (
              <span className="text-[6px] font-black text-violet-500 bg-violet-500/10 px-1 py-0.5 rounded-full uppercase tracking-wider shrink-0 leading-none">
                deal
              </span>
            )}
          </div>
          {(item.selectedVariant || item.selectedVariantLabel || (item.selectedModifiers && item.selectedModifiers.length > 0)) && (
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0 mt-0.5">
              {item.selectedVariantLabel && (
                <span className="text-[7px] font-bold text-gray-500 dark:text-gray-400 leading-tight">{item.selectedVariantLabel}</span>
              )}
              {!item.selectedVariantLabel && item.selectedVariant && (
                <span className="text-[7px] font-bold text-gray-500 dark:text-gray-400 leading-tight">{item.selectedVariant}</span>
              )}
              {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                <span className="text-[7px] font-bold text-primary leading-tight">+{item.selectedModifiers.map(m => m.name).join(', ')}</span>
              )}
            </div>
          )}
          {item.addonItems && item.addonItems.length > 0 && (
            <div className="mt-0.5">
              <span className="text-[6px] font-bold text-violet-500 dark:text-violet-400 leading-tight">
                + Add-ons: {item.addonItems.map(a => `${a.name} (${a.quantity}x)`).join(', ')}
              </span>
            </div>
          )}
          {item.toppings && item.toppings.length > 0 && (
            <div className="mt-0.5">
              <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 leading-tight">
                + {item.toppings.map(t => `${t.name} (${formatCurrency(t.price, state.settings.currency)})`).join(', ')}
              </span>
            </div>
          )}
          {item.serialNumber && (
            <div className="mt-0.5">
              <span className="text-[7px] font-black text-amber-600 bg-amber-500/10 px-1 rounded leading-none">SN: {item.serialNumber}</span>
            </div>
          )}
          {!hidePrices && (
            <div className="flex items-center gap-1 mt-0.5">
              {isEditingPrice ? (
                <input
                  type="text"
                  inputMode="decimal"
                  value={tempPrice}
                  onChange={(e) => setTempPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                  onBlur={handlePriceSubmit}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') handlePriceSubmit();
                    if (e.key === 'Escape') setIsEditingPrice(false);
                  }}
                  className="w-14 h-4 text-[8px] font-black bg-white dark:bg-zinc-800 border border-primary rounded px-1 focus:outline-none"
                  autoFocus
                />
              ) : (
                <div
                  onClick={() => (profile?.role === 'admin' || profile?.canEditPrice) && (setTempPrice(item.product.price.toString()), setIsEditingPrice(true))}
                  className={`flex items-center gap-1 -ml-1 px-1 py-0.5 rounded-lg transition-all ${(profile?.role === 'admin' || profile?.canEditPrice) ? 'cursor-pointer hover:bg-emerald-50 dark:hover:bg-primary/10 active:scale-95 group/price' : ''}`}
                >
                  <span className={`text-[9px] font-black ${item.product.price < item.product.cost ? 'text-rose-500' : (profile?.role === 'admin' || profile?.canEditPrice) ? 'text-primary dark:text-emerald-400' : 'text-gray-600'}`}>
                    {formatCurrency(item.product.price, currency)}
                  </span>
                  {item.originalPrice !== undefined && Math.round(item.product.price) !== Math.round(item.originalPrice) && (
                    <span className="text-[7px] font-bold text-gray-500 line-through">{formatCurrency(item.originalPrice, currency)}</span>
                  )}
                  {item.product.price < item.product.cost && (
                    <div className="flex items-center gap-0.5 px-1 bg-rose-500/10 rounded">
                      <AlertCircle className="h-2 w-2 text-rose-500" />
                      <span className="text-[6px] font-black text-rose-500">Cost: {formatCurrency(item.product.cost, currency)}</span>
                    </div>
                  )}
                  {(profile?.role === 'admin' || profile?.canEditPrice) && (
                    <Edit2 className="h-2 w-2 text-primary/50 group-hover/price:text-primary transition-colors" />
                  )}
                </div>
              )}
              {showDiscount && Math.abs(item.discount) > 0 && (
                <span className="text-[7px] font-black text-primary bg-primary/10 px-1 py-0.5 rounded leading-none shrink-0">
                  -{(item.bundleId || item.bundle_id) ? Math.abs(item.discount).toLocaleString() : item.discountValue}{(item.bundleId || item.bundle_id) ? getCurrencySymbol(currency) : (item.discountType === 'percentage' ? '%' : getCurrencySymbol(currency))}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Qty stepper or static Qty display if nested / from bundle */}
        {(isNested || isFromBundle) ? (
          <span className="text-[9px] font-black px-1.5 py-0.5 bg-violet-500/5 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 rounded shrink-0 self-center select-none">
            {Math.abs(item.quantity)}
          </span>
        ) : (
          <div className="flex items-center self-center bg-gray-150/70 dark:bg-white/5 rounded-full p-0.5 shrink-0">
            <button
              onClick={() => onUpdateQuantity(index, item.quantity - 1)}
              className="w-5.5 h-5.5 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-200 dark:hover:bg-white/10 hover:text-red-500 active:scale-90 transition-all"
            >
              <Minus className="h-2.5 w-2.5" />
            </button>
            <input
              type="text"
              inputMode="decimal"
              value={item.quantity || ''}
              onChange={(e) => { const v = parseInt(e.target.value.replace(/[^0-9.-]/g, '')); onUpdateQuantity(index, isNaN(v) ? 0 : v); }}
              onKeyDown={(e) => e.stopPropagation()}
              className={`w-6 bg-transparent text-center text-[10px] font-black focus:outline-none no-spinners ${item.quantity < 0 ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}
            />
            <button
              onClick={() => onUpdateQuantity(index, item.quantity + 1)}
              className="w-5.5 h-5.5 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-200 dark:hover:bg-white/10 hover:text-primary active:scale-90 transition-all"
            >
              <Plus className="h-2.5 w-2.5" />
            </button>
          </div>
        )}

        {/* Subtotal + actions */}
        <div className="flex flex-col items-end shrink-0 min-w-[50px]">
          {!hidePrices && (
            <span className={`text-[9px] font-black leading-tight ${item.quantity < 0 || item.subtotal < (item.product.cost * item.quantity) ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>
              {formatCurrency(item.subtotal, currency)}
            </span>
          )}
          {!(isNested || isFromBundle) && (
            <div className="flex items-center gap-0.5 mt-0.5">
              {(profile?.role === 'admin' || profile?.canGiveDiscount) && (
                <button
                  onClick={() => setShowDiscountInput(!showDiscountInput)}
                  className={`w-5.5 h-5.5 flex items-center justify-center text-[8px] font-black leading-none rounded-full transition-colors ${item.discount > 0 ? 'text-primary bg-emerald-500/10' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-primary'}`}
                  title="Discount"
                >
                  %
                </button>
              )}
              {(profile?.role === 'admin' || profile?.canGiveDiscount) && item.discount > 0 && (
                <button
                  onClick={clearItemDiscount}
                  className="w-5.5 h-5.5 flex items-center justify-center text-primary hover:text-red-500 hover:bg-rose-500/10 rounded-full transition-colors"
                  title="Clear Item Discount"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
              {(profile?.role === 'admin' || profile?.canEditPrice) && (
                <button
                  onClick={() => {
                    setTempPrice(item.product.price.toString());
                    setIsEditingPrice(!isEditingPrice);
                  }}
                  className={`w-5.5 h-5.5 flex items-center justify-center rounded-full transition-colors ${isEditingPrice ? 'text-primary bg-emerald-500/10' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-primary'}`}
                  title="Edit Price"
                >
                  <Edit2 className="h-2.5 w-2.5" />
                </button>
              )}
              <button onClick={() => onRemove(index)} className="w-5.5 h-5.5 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-rose-500/10 rounded-full transition-colors" title="Remove">
                <Trash2 className="h-2.5 w-2.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Inline discount panel */}
      {showDiscountInput && (
        <div className="mt-1 flex items-center gap-1 bg-gray-50 dark:bg-black/75 border border-gray-200 dark:border-white/10 rounded-lg px-2 py-1">
          <div className="flex bg-gray-200 dark:bg-white/5 p-0.5 rounded-md shrink-0">
            {(['percentage', 'fixed'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setDiscountType(t)}
                className={`px-1.5 py-0.5 text-[6px] font-black rounded-md transition-all ${discountType === t ? 'bg-white dark:bg-white/10 text-primary shadow-sm' : 'text-gray-600'}`}
              >
                {t === 'percentage' ? '%' : getCurrencySymbol(currency)}
              </button>
            ))}
          </div>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value.replace(/[^0-9.]/g, ''))}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') handleDiscountSubmit();
              if (e.key === 'Escape') setShowDiscountInput(false);
            }}
            className="flex-1 bg-white dark:bg-white/5 rounded-md px-2 py-1 text-[8px] font-bold text-gray-900 dark:text-white focus:ring-1 focus:ring-emerald-500 outline-none border-0"
            autoFocus
          />
          <button onClick={handleDiscountSubmit} className="w-5 h-5 flex items-center justify-center bg-primary text-white rounded-md hover:bg-emerald-700 transition-colors">
            <Plus className="h-2.5 w-2.5" />
          </button>
          <button onClick={() => setShowDiscountInput(false)} className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-red-500 transition-colors">
            <X className="h-2 w-2" />
          </button>
        </div>
      )}
    </div>
  );
}
