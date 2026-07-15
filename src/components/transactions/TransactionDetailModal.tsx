import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ChevronLeft, ChevronRight, Printer, MessageCircle, RotateCcw, Edit, Trash2, ShoppingBag, Gift, Package, Layers, MapPin, Store, Globe, Hash } from 'lucide-react';
import { useApp } from '../../context/SupabaseAppContext';
import { useAuth } from '../../context/AuthContext';
import { formatAppDate, formatAppTime, formatAppDateTime, getTimezone } from '../../lib/dateUtils';
import { formatCurrency, formatNumberWithPrecision } from '../../lib/currencies';
import { Sale, RefundRequest } from '../../types';
import { CheckoutModal } from '../pos/CheckoutModal';
import { ReceiptPrint } from '../pos/ReceiptPrint';
import { salesService, productsService, customersService, getAmountByMethod } from '../../lib/services';
import { sonner } from '../../lib/sonner';
import { useTranslation } from '../../hooks/useTranslation';
import { getDealCountBreakdown, cn } from '../../lib/utils';
import { Modal } from '../common/Modal';
import RefundSaleModal from './RefundSaleModal';

interface TransactionDetailModalProps {
  transaction: Sale;
  allTransactions: Sale[];
  onNavigate: (sale: Sale) => void;
  onClose: () => void;
  onReprint: (sale: Sale) => void;
  onBack?: () => void;
}

export function TransactionDetailModal({ transaction, allTransactions, onNavigate, onClose, onReprint, onBack }: TransactionDetailModalProps) {
  const detailNavigate = useNavigate();
  const { state, dispatch } = useApp();
  const { t } = useTranslation();
  const { profile } = useAuth();
  const showDiscount = state.settings.receiptShowDiscount !== false && 
    !(transaction.items || []).some((item: any) => item.bundleHideItemPrices === true || item.bundle_hide_item_prices === true);
  const [showCheckout, setShowCheckout] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const isAdmin = profile?.role === 'admin';

  const currentIndex = allTransactions.findIndex(tx => tx.id === transaction.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < allTransactions.length - 1;

  const handlePrev = () => hasPrev && onNavigate(allTransactions[currentIndex - 1]);
  const handleNext = () => hasNext && onNavigate(allTransactions[currentIndex + 1]);

  const canEditSale = isAdmin || (profile?.role === 'manager' && profile?.canEditSale);
  const canDeleteSale = isAdmin || (profile?.role === 'manager' && profile?.canDeleteSale);
  const canRefundSale = isAdmin || (profile?.role === 'manager' && profile?.canEditSale);

  const handleEditSale = async () => {
    if (!canEditSale) return;
    const result = await sonner.confirm('Edit Sale?', 'Load items and notes to cart for editing?', 'Yes');
    if (!result.isConfirmed) return;
    setIsReconciling(true);
    try {
      dispatch({ type: 'CLEAR_CART' });
      transaction.items.forEach(item => dispatch({ type: 'ADD_TO_CART', payload: item }));
      dispatch({ type: 'SET_NOTES', payload: transaction.notes || '' });
      dispatch({ type: 'SET_EDITING_SALE_ID', payload: transaction.id });

      if (transaction.customerId) {
        const customer = state.customers.find(c => c.id === transaction.customerId);
        if (customer) dispatch({ type: 'SET_SELECTED_CUSTOMER', payload: customer });
      }

      sonner.success('Loaded to POS for editing.');
      onClose();
      detailNavigate('/pos');
    } catch {
      sonner.error('Error editing sale.');
    } finally {
      setIsReconciling(false);
    }
  };

  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);

  const handleRefundSale = () => {
    if (!canRefundSale) return;
    if (transaction.status === 'refunded') {
      sonner.error('Sale is already fully refunded.');
      return;
    }
    setIsRefundModalOpen(true);
  };

  const executeRefund = async (request: RefundRequest) => {
    setIsReconciling(true);
    try {
      await salesService.returnSale(transaction.id, request, profile?.name || 'Cashier');

      const updatedTx: Sale = {
        ...transaction,
        status: request.type === 'full' ? 'refunded' : 'partially_refunded',
        refundedAmount: (transaction.refundedAmount || 0) + request.totalRefundAmount,
        items: transaction.items.map((item: any, idx: number) => {
          if (request.type === 'full') {
            return { ...item, refundedQuantity: item.quantity };
          } else {
            const reqItem = request.items.find((ri: any) => ri.index === idx);
            if (reqItem) {
              return { ...item, refundedQuantity: (item.refundedQuantity || 0) + reqItem.qty };
            }
          }
          return item;
        })
      };

      dispatch({ type: 'UPDATE_SALE', payload: updatedTx });
      onNavigate(updatedTx);
      sonner.success('Sale successfully refunded.');
      setIsRefundModalOpen(false);
    } catch (error) {
      console.error('[RefundError]', error);
      sonner.error('Error refunding sale.');
    } finally {
      setIsReconciling(false);
    }
  };

  const handleWhatsAppShare = () => {
    const customer = state.customers.find(c => c.id === transaction.customerId);
    const phone = customer?.phone || '';
    if (!phone) { sonner.error('No phone number.'); return; }
    let fp = phone.replace(/\D/g, '');
    if (fp.startsWith('0')) fp = '92' + fp.substring(1);
    const msg = `🧾 *Invoice*\nTotal: ${formatCurrency(transaction.total, state.settings.currency)}`;
    window.open(`https://wa.me/${fp}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const handleDeleteSale = async () => {
    if (!canDeleteSale) return;
    const result = await sonner.confirm(
      'PERMANENT DELETE?',
      'All records (Stock, Reports, Inventory) will be REVERTED. This cannot be undone!',
      'Yes, Delete'
    );
    if (!result.isConfirmed) return;

    setIsReconciling(true);
    try {
      await salesService.delete(transaction.id, profile?.name || 'Admin');
      dispatch({ type: 'DELETE_SALE', payload: transaction.id });
      sonner.success('Sale permanently deleted and records reverted.');
      onClose();
    } catch (err) {
      console.error('[DeleteError]', err);
      sonner.error('Error deleting sale.');
    } finally {
      setIsReconciling(false);
    }
  };

  const groupItems = (items: any[]) => {
    const bundlesMap = new Map<string, any>();
    const standaloneItems: any[] = [];

    items.forEach(item => {
      const bundleId = item.bundleId || item.bundle_id;
      const bundleName = item.bundleName || item.bundle_name;

      if (bundleId) {
        if (!bundlesMap.has(bundleId)) {
          bundlesMap.set(bundleId, {
            bundleId,
            bundleName,
            items: [],
            totalOriginal: 0,
            totalDiscount: 0,
            totalSubtotal: 0
          });
        }
        const b = bundlesMap.get(bundleId)!;
        b.items.push(item);
        const itemPrice = item.product?.price || ((item.subtotal + item.discount) / (item.quantity || 1));
        const original = itemPrice * item.quantity;
        b.totalOriginal += original;
        b.totalDiscount += (item.discount || 0);
        b.totalSubtotal += (item.subtotal || 0);
      } else {
        standaloneItems.push(item);
      }
    });

    return {
      bundles: Array.from(bundlesMap.values()),
      standaloneItems
    };
  };

  const getSaleTypeTag = () => {
    const type = transaction.saleType || 'retail';
    switch (type) {
      case 'wholesale':
        return { label: 'WHOLESALE', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border-blue-200 dark:border-blue-500/20' };
      case 'estore':
        return { label: 'ONLINE STORE', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20' };
      default:
        return { label: 'RETAIL', color: 'bg-primary/10 text-primary dark:text-emerald-400 border-primary/20' };
    }
  };

  const sourceTag = getSaleTypeTag();

  return (
    <>
      <Modal
        isOpen={true}
        onClose={onClose}
        title={t("sale_breakdown", "Sale Breakdown")}
        showClose={true}
        maxWidth="lg"
        footer={
          <div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button onClick={handlePrev} disabled={!hasPrev} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-3 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-white/10 rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest disabled:opacity-30 active:scale-95 transition-all">
                <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span>{t("prev", "Prev")}</span>
              </button>
              <button onClick={handleNext} disabled={!hasNext} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-3 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-white/10 rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest disabled:opacity-30 active:scale-95 transition-all">
                <span>{t("next_sale", "Next Sale")}</span> <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full mt-1.5 sm:mt-2">
              <button onClick={() => onReprint(transaction)} className="flex-1 min-w-[calc(50%-4px)] sm:min-w-0 sm:flex-1 flex items-center justify-center gap-1.5 px-2.5 sm:px-3 md:px-5 py-2.5 sm:py-3 bg-primary text-white rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-wider md:tracking-widest active:scale-95 transition-all">
                <Printer className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" /> <span className="truncate">{t("print_receipt", "Print")}</span>
              </button>
              <button onClick={handleWhatsAppShare} className="flex-1 min-w-[calc(50%-4px)] sm:min-w-0 sm:flex-1 flex items-center justify-center gap-1.5 px-2.5 sm:px-3 md:px-5 py-2.5 sm:py-3 bg-emerald-50 dark:bg-emerald-900/10 text-primary rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-wider md:tracking-widest active:scale-95 transition-all">
                <MessageCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" /> <span className="truncate">{t("whatsapp", "WhatsApp")}</span>
              </button>
              <button
                onClick={handleRefundSale}
                disabled={isReconciling || transaction.status === 'refunded'}
                className="flex-1 min-w-[calc(50%-4px)] sm:min-w-0 sm:flex-1 flex items-center justify-center gap-1.5 px-2.5 sm:px-3 md:px-5 py-2.5 sm:py-3 bg-rose-50 dark:bg-rose-900/10 text-rose-600 rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-wider md:tracking-widest active:scale-95 transition-all disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" /> <span className="truncate">{t("refund", "Refund")}</span>
              </button>
              {(isAdmin || profile?.canEditSale) && (
                <button onClick={handleEditSale} disabled={isReconciling} className="flex-1 min-w-[calc(50%-4px)] sm:min-w-0 sm:flex-1 flex items-center justify-center gap-1.5 px-2.5 sm:px-3 md:px-5 py-2.5 sm:py-3 bg-amber-50 dark:bg-amber-900/10 text-amber-600 rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-wider md:tracking-widest active:scale-95 transition-all disabled:opacity-50">
                  <Edit className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" /> <span className="truncate">{t("edit", "Edit")}</span>
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={handleDeleteSale}
                  disabled={isReconciling}
                  className="flex-1 min-w-full sm:min-w-0 sm:flex-1 flex items-center justify-center gap-1.5 px-2.5 sm:px-3 md:px-5 py-2.5 sm:py-3 bg-rose-500 text-white rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-wider md:tracking-widest active:scale-95 transition-all disabled:opacity-50 shadow-lg shadow-rose-500/20"
                >
                  <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" /> <span className="truncate">{t("delete", "Delete")}</span>
                </button>
              )}
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Back button + Source tag row */}
          {(onBack || transaction.saleType) && (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {onBack && (
                <button
                  onClick={onBack}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 rounded-lg text-[9px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-300 transition-all active:scale-95"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Back to Customer</span>
                </button>
              )}
              <span className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-widest rounded-lg border ${sourceTag.color} ml-auto`}>
                {sourceTag.label}
              </span>
            </div>
          )}

          {transaction.status === 'refunded' && (
            <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 p-3 rounded-2xl text-xs font-black text-center uppercase tracking-widest flex items-center justify-center gap-2">
              <RotateCcw className="h-4 w-4 shrink-0" />
              <span>This sale is fully refunded</span>
            </div>
          )}
          {transaction.status === 'partially_refunded' && (
            <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-400 p-3 rounded-2xl text-xs font-black text-center uppercase tracking-widest flex items-center justify-center gap-2">
              <RotateCcw className="h-4 w-4 shrink-0" />
              <span>This sale is partially refunded</span>
            </div>
          )}

          {onBack && (
            <div className="flex items-center justify-center mb-0">
              <span className="text-[9px] font-black bg-primary/10 text-primary dark:text-emerald-400 px-2 py-0.5 rounded-full uppercase tracking-widest">
                {getDealCountBreakdown(transaction.items, state.bundles).label}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 dark:bg-white/[0.02] rounded-2xl border border-gray-200 dark:border-white/5">
            <div><p className="text-[8px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest">{t("receipt", "Receipt")}</p><p className="text-[11px] font-black text-gray-900 dark:text-white uppercase">#{transaction.invoiceNumber || transaction.receiptNumber}</p></div>
            <div><p className="text-[8px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest">{t("date", "Date")}</p><p className="text-[11px] font-black text-gray-900 dark:text-white uppercase">{formatAppDate(transaction.timestamp, state.settings.country)}</p></div>
            <div><p className="text-[8px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest">{t("customer", "Customer")}</p><p className="text-[11px] font-black text-gray-900 dark:text-white uppercase">{transaction.customerName || t("walk_in", "Walk-in")}</p></div>
            <div><p className="text-[8px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest">{t("cashier", "Cashier")}</p><p className="text-[11px] font-black text-gray-900 dark:text-white uppercase">{transaction.cashier || 'System'}</p></div>
            {transaction.dcNumber && (
              <div className="col-span-2"><p className="text-[8px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">{t("dc_number", "DC Number")}</p><p className="text-[11px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-tight tabular-nums">#{transaction.dcNumber}</p></div>
            )}
            {transaction.deliveryLocationLat && transaction.deliveryLocationLng && (
              <div className="col-span-2 mt-1">
                <a 
                  href={`https://maps.google.com/?q=${transaction.deliveryLocationLat},${transaction.deliveryLocationLng}`}
                  target="_blank"
                  rel="noopener noreferrer" 
                  className="flex items-center justify-center gap-2 w-full py-2.5 bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-emerald-100 dark:border-emerald-900/30"
                >
                  <MapPin className="w-3.5 h-3.5 shrink-0" /> {t("view_location", "View Delivery Location")}
                </a>
              </div>
            )}
          </div>

          <div className="border border-gray-200 dark:border-white/5 rounded-[2rem] overflow-x-auto custom-scrollbar">
            <table className="min-w-full divide-y divide-gray-100 dark:divide-white/5">
              <thead className="bg-gray-50 dark:bg-white/[0.02]">
                <tr>
                  <th className="px-2.5 sm:px-4 py-2.5 sm:py-3 text-[10px] font-black text-gray-600 uppercase text-left whitespace-nowrap">{t("item", "Item")}</th>
                  <th className="px-2.5 sm:px-4 py-2.5 sm:py-3 text-[10px] font-black text-gray-600 uppercase text-right whitespace-nowrap">{t("qty", "Qty")}</th>
                  <th className="px-2.5 sm:px-4 py-2.5 sm:py-3 text-[10px] font-black text-gray-600 uppercase text-right whitespace-nowrap">{t("total", "Total")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {(() => {
                  const { bundles, standaloneItems } = groupItems(transaction.items);
                  const rows: React.ReactNode[] = [];
                  const canEditProducts = isAdmin || profile?.role === 'manager' || profile?.canManagePO;

                  if (bundles.length > 0) {
                    rows.push(
                      <tr key="section-bundles" className="bg-violet-500/[0.03]">
                        <td colSpan={3} className="px-2.5 sm:px-4 py-2">
                          <div className="flex items-center gap-1.5">
                            <Gift className="h-3 w-3 text-violet-500 shrink-0" />
                            <span className="text-[8px] font-black text-violet-600 dark:text-violet-400 uppercase tracking-widest">
                              {t('combo_deals_sec', 'Bundle / Deal Items')} ({bundles.length})
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  bundles.forEach((b, bIdx) => {
                    const hideItemPrices = b.items.some((item: any) => item.bundleHideItemPrices === true || item.bundle_hide_item_prices === true);
                    const bundleImage = b.items[0]?.product?.image || null;
                    const discountStr = showDiscount && b.totalDiscount > 0 ? `-${formatCurrency(b.totalDiscount, state.settings.currency)}` : undefined;
                    let bundleQty = 1;
                    const bundleDef = state.bundles?.find((x: any) => x.id === b.bundleId);
                    if (bundleDef && bundleDef.items && bundleDef.items.length > 0) {
                      const firstBi = bundleDef.items[0];
                      const cartItem = b.items.find((x: any) => x.product?.id === firstBi.productId);
                      if (cartItem) {
                        bundleQty = Math.round(cartItem.quantity / firstBi.quantity);
                      }
                    } else if (b.items.length > 0) {
                      bundleQty = b.items[0].quantity;
                    }

                    rows.push(
                      <tr key={`bundle-${b.bundleId}`} className="bg-violet-500/[0.02] border-t border-gray-100 dark:border-white/5">
                        <td className="px-2.5 sm:px-4 py-2">
                          <div className="flex items-center gap-1.5">
                            <div className="w-7 h-7 rounded-md overflow-hidden bg-violet-100 dark:bg-violet-900/20 shrink-0 flex items-center justify-center">
                              {bundleImage ? (
                                <img src={bundleImage} alt={b.bundleName} className="w-full h-full object-cover" />
                              ) : (
                                <Package className="h-3 w-3 text-violet-400" />
                              )}
                            </div>
                            <span className="text-[9px] font-black text-violet-700 dark:text-violet-300 uppercase truncate">{b.bundleName}</span>
                          </div>
                        </td>
                        <td className="px-2.5 sm:px-4 py-2 text-right text-[9px] font-bold text-gray-500">{bundleQty}</td>
                        <td className="px-2.5 sm:px-4 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-[10px] font-black text-primary">{formatCurrency(b.totalSubtotal, state.settings.currency)}</span>
                            {discountStr && <span className="text-[7px] font-black text-rose-500">{discountStr}</span>}
                          </div>
                        </td>
                      </tr>
                    );

                    b.items.forEach((item: any, itemIdx: number) => {
                      rows.push(
                        <tr
                          key={`bundle-${b.bundleId}-item-${itemIdx}`}
                          onClick={() => {
                            if (item.product?.id) {
                              detailNavigate('/inventory/products', { state: { productId: item.product.id, fromSale: transaction.id } });
                              onClose();
                            }
                          }}
                          className={`${item.product?.id ? 'cursor-pointer hover:bg-violet-500/[0.03] dark:hover:bg-violet-500/[0.03] transition-colors group' : ''} bg-violet-500/[0.005] border-t border-gray-100/50 dark:border-white/5`}
                        >
                          <td className={`pl-10 pr-4 py-1.5 text-[9px] text-gray-600 dark:text-gray-400 uppercase ${item.product?.id ? 'group-hover:text-primary' : ''}`}>
                            <span className="font-bold">- {item.product?.name || 'Item'}</span>
                            {item.selectedVariant && <span className="text-[8px] text-gray-400"> ({item.selectedVariant})</span>}
                          </td>
                          <td className="px-2.5 sm:px-4 py-1.5 text-right text-[9px] font-bold text-gray-500">
                            <div>{item.quantity}</div>
                            {item.refundedQuantity > 0 && (
                              <div className="text-[7px] font-black text-rose-500 uppercase tracking-tight mt-0.5 leading-none">
                                {item.refundedQuantity} {t("returned_caps", "Returned")}
                              </div>
                            )}
                          </td>
                          <td className="px-2.5 sm:px-4 py-1.5 text-right text-[9px] text-gray-400">
                            {!hideItemPrices && formatCurrency(item.product?.price * item.quantity, state.settings.currency)}
                          </td>
                        </tr>
                      );
                    });
                  });

                  if (bundles.length > 0 && standaloneItems.length > 0) {
                    rows.push(
                      <tr key="section-standalone" className="bg-gray-50/50 dark:bg-white/[0.02]">
                        <td colSpan={3} className="px-2.5 sm:px-4 py-2 border-t border-gray-100 dark:border-white/5">
                          <div className="flex items-center gap-1.5">
                            <ShoppingBag className="h-3 w-3 text-gray-400 shrink-0" />
                            <span className="text-[8px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                              {t('standalone_items_sec', 'Other / Standalone Items')} ({standaloneItems.length})
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  standaloneItems.forEach((item, index) => {
                    rows.push(
                      <tr
                        key={`standalone-${index}`}
                        onClick={() => {
                          if (item.product?.id) {
                            detailNavigate('/inventory/products', { state: { productId: item.product.id, fromSale: transaction.id } });
                            onClose();
                          }
                        }}
                        className={item.product?.id ? "cursor-pointer hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors group" : ""}
                      >
                        <td className={`px-2.5 sm:px-4 py-3 sm:py-4 text-[11px] font-black text-gray-900 dark:text-white uppercase transition-colors ${item.product?.id ? 'group-hover:text-primary' : ''}`}>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-md overflow-hidden bg-gray-100 dark:bg-white/5 shrink-0 flex items-center justify-center">
                              {item.product?.image ? (
                                <img src={item.product.image} alt={item.product.name} className="w-full h-full object-cover" />
                              ) : (
                                <Package className="h-3 w-3 text-gray-400" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <span className="truncate block">{item.product?.name || t("item", "Item")}</span>
                              {(item.selectedVariant || (item.selectedModifiers && item.selectedModifiers.length > 0) || item.serialNumber) && (
                                <div className="flex flex-col gap-0.5 mt-0.5 normal-case tracking-normal">
                                  {item.selectedVariant && <span className="text-[8px] font-bold text-gray-500">{item.selectedVariant}</span>}
                                  {item.selectedModifiers && item.selectedModifiers.length > 0 && <span className="text-[8px] font-bold text-primary">+ {item.selectedModifiers.map((m: any) => m.name).join(', ')}</span>}
                                  {item.serialNumber && <span className="text-[8px] font-bold text-amber-500">SN: {item.serialNumber}</span>}
                                </div>
                              )}
                              {showDiscount && item.discount > 0 && (
                                <div className="flex items-center gap-1 text-[7px] text-rose-500 font-black mt-1 uppercase tracking-widest bg-rose-50 dark:bg-rose-500/10 px-1.5 py-0.5 rounded-md border border-rose-100 dark:border-rose-500/20">
                                  <Gift className="w-2 h-2" />
                                  <span>Discount</span>
                                  {item.discountType === 'percentage' && item.discountValue ? `(${item.discountValue}%)` : ''}
                                  <span>-{formatCurrency(item.discount, state.settings.currency)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-2.5 sm:px-4 py-3 sm:py-4 text-right text-[11px] font-bold text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          <div>{item.quantity}</div>
                          {item.refundedQuantity > 0 && (
                            <div className="text-[8px] font-black text-rose-500 uppercase tracking-tight mt-0.5 leading-none">
                              {item.refundedQuantity} {t("returned_caps", "Returned")}
                            </div>
                          )}
                        </td>
                        <td className="px-2.5 sm:px-4 py-3 sm:py-4 text-right text-[11px] font-black text-gray-900 dark:text-white whitespace-nowrap">{formatCurrency(item.subtotal, state.settings.currency)}</td>
                      </tr>
                    );
                  });

                  return rows;
                })()}
              </tbody>
            </table>
          </div>

          <div className="p-4 bg-gray-50 dark:bg-white/[0.03] rounded-2xl space-y-2">
            {transaction.notes && (
              <div className="pb-2 mb-2 border-b border-gray-200 dark:border-white/10">
                <p className="text-[8px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest mb-1">{t("memo", "Internal Memo")}</p>
                <p className="text-[10px] font-bold text-gray-700 dark:text-gray-300 italic">"{transaction.notes}"</p>
              </div>
            )}

            {transaction.splitPayments && transaction.splitPayments.length > 0 && (
              <div className="pb-2 mb-2 border-b border-gray-200 dark:border-white/10">
                <p className="text-[8px] font-black text-primary uppercase tracking-widest mb-1.5 flex items-center gap-1"><Layers className="w-2.5 h-2.5" /> {t("split_payment_breakdown", "Split Payment Breakdown")}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {transaction.splitPayments.map((p: any, i: number) => (
                    <div key={i} className="flex justify-between items-center text-[9px] font-black uppercase">
                      <span className="text-gray-500">{t(p.method, p.method)}</span>
                      <span className="text-gray-700 dark:text-gray-300">{formatCurrency(p.amount, state.settings.currency)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {showDiscount && (
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-gray-600">
                <span>{t("subtotal", "Subtotal")}</span>
                <span className="text-gray-900 dark:text-white tabular-nums">{formatCurrency(transaction.subtotal, state.settings.currency)}</span>
              </div>
            )}

            {showDiscount && transaction.discountAmount > 0 && (
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-rose-500">
                <span className="flex items-center gap-1"><Gift className="w-3 h-3" /> {t("discount", "Discount")}</span>
                <span className="tabular-nums">-{formatCurrency(transaction.discountAmount, state.settings.currency)}</span>
              </div>
            )}
            {transaction.taxAmount > 0 && (
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-gray-600">
                <span>{t("tax", "Tax")}</span>
                <span className="text-gray-900 dark:text-white tabular-nums">+{formatCurrency(transaction.taxAmount, state.settings.currency)}</span>
              </div>
            )}

            {(() => {
              const dcExtra = transaction.extraCharges?.find((c: any) => Number(c.amount) > 0 && c.name?.toUpperCase() === 'DC');
              if (dcExtra) {
                return (
                  <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-blue-600">
                    <span>Delivery Charges (DC)</span>
                    <span className="tabular-nums">+{formatCurrency(dcExtra.amount, state.settings.currency)}</span>
                  </div>
                );
              }
              if (transaction.deliveryFee != null && transaction.deliveryFee > 0) {
                return (
                  <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-blue-600">
                    <span>Delivery Charges (DC)</span>
                    <span className="tabular-nums">+{formatCurrency(transaction.deliveryFee, state.settings.currency)}</span>
                  </div>
                );
              }
              if (transaction.extraCharges && transaction.extraCharges.length > 0) {
                return transaction.extraCharges.map((charge: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-blue-600">
                    <span>{charge.name || t("other_amount", "Extra Charge")}</span>
                    <span className="tabular-nums">+{formatCurrency(charge.amount, state.settings.currency)}</span>
                  </div>
                ));
              }
              return null;
            })()}

            {transaction.refundedAmount > 0 && (
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-rose-500">
                <span>Refunded Amount</span>
                <span className="tabular-nums">-{formatCurrency(transaction.refundedAmount, state.settings.currency)}</span>
              </div>
            )}

            <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-white/10">
              <span className="text-xs font-black uppercase tracking-widest text-gray-900 dark:text-white">{t("net_total", "Net Total")}</span>
              <div className="flex flex-col items-end">
                <span className={`text-xs tabular-nums ${transaction.refundedAmount > 0 ? 'line-through text-gray-400 font-bold' : 'text-lg font-black text-primary'}`}>
                  {formatCurrency(transaction.total, state.settings.currency)}
                </span>
                {transaction.refundedAmount > 0 && (
                  <span className="text-lg font-black text-primary tabular-nums leading-none mt-0.5">
                    {formatCurrency(transaction.total - transaction.refundedAmount, state.settings.currency)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {showCheckout && (
        <CheckoutModal
          onClose={() => setShowCheckout(false)}
          onComplete={async () => {
            if (transaction.id) {
              await salesService.delete(transaction.id);
              dispatch({ type: 'DELETE_SALE', payload: transaction.id });
            }
          }}
        />
      )}

      {isRefundModalOpen && (
        <RefundSaleModal
          isOpen={isRefundModalOpen}
          onClose={() => setIsRefundModalOpen(false)}
          sale={transaction}
          onConfirmRefund={executeRefund}
          isProcessing={isReconciling}
        />
      )}
    </>
  );
}
