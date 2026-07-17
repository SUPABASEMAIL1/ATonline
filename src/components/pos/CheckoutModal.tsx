import { useState, useEffect } from 'react';
import { X, CreditCard, Banknote, Smartphone, Check, AlertCircle, Gift, MessageCircle, FileText, Store, Globe, ShoppingBag, RefreshCw, CheckCircle2, Layers, Hash, PlusCircle, Building2, Package } from 'lucide-react';
import { Sale, SplitPayment } from '../../types';
import { useApp, useInvoiceGeneration } from '../../context/SupabaseAppContext';
import { useCartCalculations } from '../../hooks/useCartCalculations';
import { useAuth } from '../../context/AuthContext';
import { ReceiptPrint } from './ReceiptPrint';
import { KOTPrint } from './KOTPrint';
import { salesService, generateId, getCustomerCreditStatus, toRemoteSale, getAmountByMethod } from '../../lib/services';
import { sonner } from '../../lib/sonner';
import { formatCurrency } from '../../lib/currencies';
import { Modal } from '../common/Modal';
import { HelpTooltip } from '../common/HelpTooltip';
import { useMemo } from 'react';
import { cn } from '../../lib/utils';
import { CompactItemRow } from './CompactItemRow';
import { localDb, queueOp } from '../../lib/localDb';
import { useTranslation } from '../../hooks/useTranslation';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (sale: Sale) => void;
}

/**
 * @deprecated Use CheckoutPage instead. CheckoutPage is the primary settlement component
 * with keyboard shortcuts, extra charges, and better mobile layout. This modal is retained
 * only for bill-edit mode from TransactionsManager.
 */
export function CheckoutModal({ isOpen, onClose, onComplete }: CheckoutModalProps) {
  const { state, dispatch } = useApp();
  const { user, profile } = useAuth();
  const { t } = useTranslation();
  const generateInvoice = useInvoiceGeneration();
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [saleNotes, setSaleNotes] = useState('');
  const [saleType, setSaleType] = useState<'retail' | 'wholesale' | 'estore'>('retail');
  const [showDiscountAlert, setShowDiscountAlert] = useState(false);

  // New fields
  const [dcNumber, setDcNumber] = useState('');
  const [otherAmount, setOtherAmount] = useState('');
  const [otherAmountName, setOtherAmountName] = useState('');
  const [splitPayments, setSplitPayments] = useState<SplitPayment[]>([
    { method: 'cash', amount: 0 },
    { method: 'card', amount: 0 }
  ]);

  const { retailEnabled, wholesaleEnabled, estoreEnabled } = state.settings;

  const {
    subtotal,
    totalDiscount,
    taxAmount,
    total,
    activePromotions: appliedDiscounts,
    freeGifts
  } = useCartCalculations(paymentMethod === 'split' ? 'cash' : paymentMethod); // Use cash as base for split

  const showDiscount = state.settings.receiptShowDiscount !== false &&
    !state.cart.some(item => item.bundleHideItemPrices === true || item.bundle_hide_item_prices === true);

  useEffect(() => {
    if (isOpen) {
      setAmountPaid('');
      setIsProcessing(false);
      setShowReceipt(false);
      setCompletedSale(null);
      setSaleNotes(state.notes || '');
      setShowDiscountAlert(false);
      setPaymentMethod('cash');
      setDcNumber('');
      setOtherAmount('');
      setOtherAmountName('');
      setSplitPayments([
        { method: 'cash', amount: 0 },
        { method: 'card', amount: 0 }
      ]);
      const preferredMode = state.settings.defaultSaleType || 'retail';
      if (preferredMode === 'retail' && retailEnabled) setSaleType('retail');
      else if (preferredMode === 'wholesale' && wholesaleEnabled) setSaleType('wholesale');
      else if (preferredMode === 'estore' && estoreEnabled) setSaleType('estore');
      else if (retailEnabled) setSaleType('retail');
      else if (wholesaleEnabled) setSaleType('wholesale');
      else if (estoreEnabled) setSaleType('estore');
    }
  }, [isOpen, retailEnabled, wholesaleEnabled, estoreEnabled, state.notes, state.settings.defaultSaleType]);

  useEffect(() => {
    if (isOpen && appliedDiscounts.length > 0) setShowDiscountAlert(true);
  }, [isOpen, appliedDiscounts.length]);

  const change = parseFloat(amountPaid) - total;

  const quickAmounts = useMemo(() => {
    const amounts = new Set<number>();
    amounts.add(total);
    if (total < 500) {
      amounts.add(Math.ceil(total / 50) * 50);
      amounts.add(Math.ceil(total / 100) * 100);
      amounts.add(500);
    } else if (total < 1000) {
      amounts.add(Math.ceil(total / 100) * 100);
      amounts.add(1000);
      amounts.add(1500);
    } else if (total < 5000) {
      amounts.add(Math.ceil(total / 500) * 500);
      amounts.add(Math.ceil(total / 1000) * 1000);
      if (total < 4500) amounts.add(5000);
    } else {
      amounts.add(Math.ceil(total / 1000) * 1000);
      const next5k = Math.ceil(total / 5000) * 5000;
      amounts.add(next5k === Math.ceil(total) ? next5k + 5000 : next5k);
      amounts.add(Math.ceil(total / 5000) * 5000 + 5000);
    }

    return Array.from(amounts)
      .filter(a => a >= total)
      .sort((a, b) => a - b)
      .slice(0, 3);
  }, [total]);

  // ── CASH DRAWER VALIDATION (BUG 2) ──
  const currentDrawerCash = useMemo(() => {
    return Infinity;
  }, []);

  const canPayWithCredit = !!state.selectedCustomer;

  const splitTotal = splitPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

  const canProcessPayment = () => {
    if (isProcessing) return false;
    const paid = parseFloat(amountPaid) || 0;
    switch (paymentMethod) {
      case 'cash': return paid >= total;
      case 'card':
      case 'digital': return true;
      case 'credit': return canPayWithCredit;
      case 'split': return splitTotal >= total;
      default: return false;
    }
  };

  if (!isOpen && !showReceipt) return null;

  const handlePayment = async () => {
    // ── CREDIT LIMIT ENFORCEMENT (RULE F9) ──
    if (paymentMethod === 'credit' || (paymentMethod === 'split' && splitPayments.some(p => p.method === 'credit'))) {
      if (!state.selectedCustomer) {
        sonner.error('Customer Required', 'A customer must be selected for credit sales.');
        return;
      }

      const creditAmount = paymentMethod === 'credit'
        ? total
        : splitPayments.find(p => p.method === 'credit')?.amount || 0;

      if (creditAmount > 0) {
        const creditStatus = getCustomerCreditStatus(state.selectedCustomer, creditAmount);

        // Level 3: Hard Block (Blocked Customer)
        if (creditStatus.isBlocked) {
          sonner.error('Credit Blocked', `${state.selectedCustomer.name} is not authorized for credit purchases.`);
          return;
        }

        // Level 2: Hard Block / Confirmation
        if (creditStatus.willExceed) {
          if (state.settings.allowCreditOverLimit === false) {
            sonner.error(
              'Credit Limit Exceeded',
              `${state.selectedCustomer.name} has exceeded their credit limit of Rs ${creditStatus.limit.toLocaleString()}. Sale blocked.`
            );
            return;
          } else {
            const confirmed = await sonner.confirm(
              'Credit Limit Exceeded',
              `${state.selectedCustomer.name} will exceed their Rs ${creditStatus.limit.toLocaleString()} credit limit by Rs ${(creditStatus.afterSale - creditStatus.limit).toLocaleString()}. Do you want to proceed anyway?`,
              'Proceed Anyway',
              'Cancel'
            );
            if (!confirmed) return;
          }
        }
        // Level 1: Soft Warning
        else if (creditStatus.isNearLimit) {
          sonner.warning(
            'Approaching Credit Limit',
            `${state.selectedCustomer.name} has used ${Math.round(creditStatus.usagePercent)}% of their credit limit.`
          );
        }
      }
    }

    // ── CASH DRAWER INSUFFICIENT CHECK (BUG 2) ──
    if (paymentMethod === 'cash' && change > 0 && change > currentDrawerCash) {
      const confirmed = await sonner.confirm(
        'Cash Insufficient in Drawer',
        `The drawer currently contains ${formatCurrency(currentDrawerCash, state.settings.currency)}. You need to return ${formatCurrency(change, state.settings.currency)} in change. Proceed anyway?`,
        'Proceed Anyway',
        'Cancel'
      );
      if (!confirmed) return;
    }

    setIsProcessing(true);
    try {
      let finalInvoiceNumber = '';
      let oldSale: Sale | undefined = undefined;
      
      if (state.editingSaleId) {
        oldSale = state.sales.find(s => s.id === state.editingSaleId);
      }

      if (oldSale && oldSale.invoiceNumber) {
        finalInvoiceNumber = oldSale.invoiceNumber;
      } else {
        finalInvoiceNumber = await generateInvoice();
      }

      const sale: Sale = {
        id: generateId(),
        invoiceNumber: finalInvoiceNumber,
        customerId: state.selectedCustomer?.id,
        customerName: state.selectedCustomer?.name,
        customerPhone: state.selectedCustomer?.phone,
        items: state.cart,
        subtotal,
        discountAmount: totalDiscount,
        taxAmount,
        total,
        billDiscountValue: state.billDiscountValue,
        billDiscountType: state.billDiscountType,
        paymentMethod: paymentMethod as any,
        status: (paymentMethod === 'credit' || (paymentMethod === 'split' && splitPayments.some(p => p.method === 'credit'))) ? 'credit' : 'completed',
        cashier: profile?.name || user?.user_metadata?.full_name || user?.email || 'Unknown',
        timestamp: new Date(),
        receiptNumber: finalInvoiceNumber,
        notes: saleNotes || undefined,
        appliedDiscounts,
        freeGifts: freeGifts.length > 0 ? freeGifts : undefined,
        receivedAmount: (paymentMethod === 'cash' || paymentMethod === 'credit') ? parseFloat(amountPaid) || undefined : (paymentMethod === 'split' ? splitTotal : undefined),
        changeAmount: paymentMethod === 'cash' ? change || undefined : (paymentMethod === 'split' ? (splitTotal - total) || undefined : undefined),
        // If editing an estore order, preserve saleType='estore' so it stays in active orders panel
        saleType: (oldSale?.saleType as any) || saleType,
        saleDate: new Date().toLocaleDateString('en-CA'),
        // New fields
        dcNumber: dcNumber || undefined,
        otherAmount: parseFloat(otherAmount) || undefined,
        otherAmountName: otherAmountName || undefined,
        splitPayments: paymentMethod === 'split' ? splitPayments : undefined,
        // E-Store order → mark as out_for_delivery (Dispatched) when bill is saved in POS
        estoreStatus: (oldSale?.saleType === 'estore' || oldSale?.estoreStatus) ? 'out_for_delivery' : undefined,
        deliveryAddress: oldSale?.deliveryAddress,
        deliveryFee: oldSale?.deliveryFee,
        deliveryLocationLat: oldSale?.deliveryLocationLat,
        deliveryLocationLng: oldSale?.deliveryLocationLng,
        customerNotes: oldSale?.customerNotes,
      };

      // ── BILL EDIT: Safe two-phase create → delete (Replaces broken delete-first pattern) ──
      if (state.editingSaleId) {
        const oldSaleId = state.editingSaleId;

        try {
          // Phase 1: Create the NEW sale first (deducts stock)
          const savedSale = await salesService.create(sale);

          // Phase 2: Try to delete the OLD sale (restores stock)
          try {
            await salesService.delete(oldSaleId, profile?.name || 'Admin');
            dispatch({ type: 'DELETE_SALE', payload: oldSaleId });
          } catch (deleteError) {
            // CRITICAL: New sale exists, old sale restoration failed
            // Instead of leaving both as 'completed', mark old as 'void'
            console.error('BILL EDIT CONFLICT: New sale created but old sale delete failed', { oldSaleId, newSaleId: savedSale.id, deleteError });

            try {
              // Fallback: Status update instead of full delete/stock reversal
              const existingOld = await localDb.sales.get(oldSaleId);
              if (existingOld) {
                const voidedSale = {
                  ...existingOld,
                  status: 'refunded' as const,
                  notes: (existingOld.notes ? existingOld.notes + ' ' : '') + `[VOID] Replaced by ${savedSale.invoiceNumber} on edit`,
                  updatedAt: new Date()
                };
                await localDb.sales.put(voidedSale);
                await queueOp('sales', 'update', oldSaleId, toRemoteSale(voidedSale));

                // Update in memory too so it reflects the 'void' state
                const updatedSales = state.sales.map(s => s.id === oldSaleId ? voidedSale : s);
                dispatch({ type: 'SET_SALES', payload: updatedSales });
              }
            } catch (statusError) {
              console.error('Failed to void old sale during conflict:', statusError);
            }

            sonner.warning(
              '⚠️ Bill Updated with Warning',
              'The new sale was saved, but the original could not be fully removed. Inventory may be double-deducted. Please verify stock counts.',
              'Understood'
            );
          }

          // Phase 3: Finalize UI
          dispatch({ type: 'ADD_SALE', payload: savedSale });
          dispatch({ type: 'CLEAR_CART' });
          dispatch({ type: 'SET_EDITING_SALE_ID', payload: null });

          setCompletedSale(savedSale);
          onComplete(savedSale);
          setIsProcessing(false);
          setShowReceipt(true);
          return;

        } catch (createError) {
          // SAFE: New sale failed, old sale is still untouched in DB
          console.error('Bill edit failed during creation:', createError);
          sonner.error('Update Failed', 'Could not save the updated sale. The original bill remains unchanged.');
          setIsProcessing(false);
          return;
        }
      }


      const savedSale = await salesService.create(sale);
      if ((savedSale as any).wasOversold) {
        sonner.warning(
          'Stock Oversold',
          'Some items were sold beyond available stock. Inventory may show negative quantities.'
        );
      }
      dispatch({ type: 'ADD_SALE', payload: savedSale });

      dispatch({ type: 'CLEAR_CART' });
      setCompletedSale(savedSale);
      onComplete(savedSale);
      setIsProcessing(false);
      setShowReceipt(true);
    } catch (error: any) {
      console.error('Payment processing error:', error);
      setIsProcessing(false);
      const msg = error?.message || 'Please try again.';
      sonner.error('Payment Processing Failed', msg);
    }
  };

  const handleCloseModal = () => {
    setShowReceipt(false);
    setCompletedSale(null);
    onClose();
  };

  const paymentMethods = [
    { id: 'cash', label: 'Cash', icon: Banknote, color: 'emerald' },
    { id: 'card', label: 'Card', icon: CreditCard, color: 'blue' },
    { id: 'digital', label: 'Digital', icon: Building2, color: 'cyan' },
    { id: 'credit', label: 'Credit', icon: FileText, color: 'rose' },
    { id: 'split', label: 'Split', icon: Layers, color: 'indigo' },
  ];

  const colorMap: Record<string, { border: string; bg: string; text: string; icon: string }> = {
    emerald: { border: 'border-primary', bg: 'bg-primary/10', text: 'text-primary dark:text-emerald-400', icon: 'bg-primary' },
    blue: { border: 'border-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', icon: 'bg-blue-500' },
    amber: { border: 'border-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', icon: 'bg-amber-500' },
    cyan: { border: 'border-cyan-500', bg: 'bg-cyan-500/10', text: 'text-cyan-600 dark:text-cyan-400', icon: 'bg-cyan-500' },
    violet: { border: 'border-violet-500', bg: 'bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400', icon: 'bg-violet-500' },
    rose: { border: 'border-rose-500', bg: 'bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400', icon: 'bg-rose-500' },
    indigo: { border: 'border-indigo-500', bg: 'bg-indigo-500/10', text: 'text-indigo-600 dark:text-indigo-400', icon: 'bg-indigo-500' },
  };

  const handleUpdateSplit = (index: number, amount: number) => {
    const newSplits = [...splitPayments];
    newSplits[index].amount = amount;
    setSplitPayments(newSplits);
  };

  const handleUpdateSplitMethod = (index: number, method: any) => {
    const newSplits = [...splitPayments];
    newSplits[index].method = method;
    setSplitPayments(newSplits);
  };

  const addSplitLine = () => {
    if (splitPayments.length < 4) {
      setSplitPayments([...splitPayments, { method: 'cash', amount: 0 }]);
    }
  };

  const removeSplitLine = (index: number) => {
    if (splitPayments.length > 2) {
      setSplitPayments(splitPayments.filter((_, i) => i !== index));
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen && !showReceipt}
        onClose={onClose}
        title={t("finalize_settlement", "Finalize Settlement")}
        showClose={true}
        maxWidth="lg"
        footer={
          <div className="flex w-full items-center gap-2 sm:gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 h-[40px] rounded-full border border-rose-500/20 text-[#ff4b6e] hover:bg-rose-500/10 text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center shrink-0"
            >
              {t("cancel", "Cancel")}
            </button>
            <button
              onClick={handlePayment}
              disabled={isProcessing || !canProcessPayment()}
              className="btn btn-md btn-primary flex-[2] !rounded-full !h-[40px] !py-2.5 !text-[9px] font-black uppercase tracking-widest active:scale-[0.98] shadow-lg shadow-emerald-500/20 disabled:grayscale transition-all"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 sm:h-5 sm:w-5 animate-spin" />
                  <span>{t("processing", "Processing...")}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 sm:h-5 sm:w-5" />
                  <span>{t("complete_order", "Complete Order")}</span>
                </>
              )}
            </button>
          </div>
        }
      >
        <div className="space-y-6">
          {/* ══ DISCOUNT ALERT ══ */}
          {showDiscountAlert && appliedDiscounts.length > 0 && (
            <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-primary/20 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm">
              <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Gift className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-[0.1em]">
                  Promotions Applied
                </p>
                <p className="text-[8px] font-bold text-primary/60 uppercase tracking-widest">
                  {appliedDiscounts.length} Active Discounts · {freeGifts.length} Free Gifts
                </p>
              </div>
              <button onClick={() => setShowDiscountAlert(false)} className="p-2 hover:bg-primary/10 rounded-lg">
                <X className="h-4 w-4 text-primary" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            {/* ── LEFT COLUMN: Order Summary ── */}
            <div className="space-y-6">
              <div className="space-y-4">
                <label className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-[0.2em] flex items-center gap-3">
                  <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
                  {t("order_summary", "Order Summary")}
                </label>

                <div className="bg-gray-50/50 dark:bg-white/[0.02] border border-gray-200 dark:border-white/5 rounded-[2rem] p-5 space-y-4">
                  {/* Cart items */}
                  <div className="max-h-[200px] overflow-y-auto pr-2 custom-scrollbar space-y-2">
                    {(() => {
                      const groupCartItems = (cartItems: CartItem[]) => {
                        const bundlesMap = new Map<string, {
                          bundleId: string;
                          bundleName: string;
                          bundleImage?: string;
                          items: CartItem[];
                          totalOriginal: number;
                          totalDiscount: number;
                          totalSubtotal: number;
                        }>();
                        const standaloneItems: CartItem[] = [];

                        cartItems.forEach((item) => {
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
                                totalSubtotal: 0
                              });
                            }
                            const b = bundlesMap.get(bundleId)!;
                            b.items.push(item);
                            b.totalOriginal += item.product.price * item.quantity;
                            b.totalDiscount += item.discount || 0;
                            b.totalSubtotal += item.subtotal || 0;
                          } else {
                            standaloneItems.push(item);
                          }
                        });

                        bundlesMap.forEach((b) => {
                          const bundleDef = (state as any).bundles?.find((x: any) => x.id === b.bundleId);
                          if (bundleDef?.image) b.bundleImage = bundleDef.image;
                        });

                        return {
                          bundles: Array.from(bundlesMap.values()),
                          standaloneItems
                        };
                      };

                      const { bundles, standaloneItems } = groupCartItems(state.cart);

                      const renderItemCard = (item: CartItem, iIdx: number, isNested = false) => {
                        const hidePrices = isNested && item.bundleHideItemPrices === true;
                        return (
                          <div key={iIdx} className={cn(
                            "flex items-center gap-3 bg-white dark:bg-white/5 p-2 rounded-2xl border border-gray-50 dark:border-white/5 shadow-sm",
                            isNested && "shadow-none border-none bg-transparent dark:bg-transparent p-1"
                          )}>
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 text-[10px] font-bold shrink-0">{iIdx}</span>
                            <div className="h-10 w-10 bg-gray-100 dark:bg-black/20 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden border border-gray-200 dark:border-white/10 aspect-square">
                              {item.product.image ? (
                                <img src={item.product.image} className="h-full w-full object-cover" />
                              ) : (
                                <ShoppingBag className="w-5 h-5 text-gray-600" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-black uppercase text-gray-900 dark:text-white truncate">{item.product.name}</p>
                              {(item.selectedVariant || (item.selectedModifiers && item.selectedModifiers.length > 0)) && (
                                <div className="flex flex-col gap-0.5 my-1">
                                  {item.selectedVariant && (
                                    <span className="text-[8px] font-bold text-gray-600 dark:text-gray-400 leading-tight truncate">
                                      {item.selectedVariant}
                                    </span>
                                  )}
                                  {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                                    <span className="text-[8px] font-bold text-primary dark:text-primary leading-tight truncate">
                                      + {item.selectedModifiers.map(m => m.name).join(', ')}
                                    </span>
                                  )}
                                </div>
                              )}
                              {item.toppings && item.toppings.length > 0 && (
                                <div className="my-1">
                                  <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 leading-tight">
                                    + {item.toppings.map(t => `${t.name} (${formatCurrency(t.price, state.settings.currency)})`).join(', ')}
                                  </span>
                                </div>
                              )}
                              {item.serialNumber && (
                                <div className="my-1">
                                  <span className="text-[8px] font-black text-amber-600 dark:text-amber-500 bg-amber-500/10 px-1 py-[1px] rounded max-w-fit leading-none tracking-widest uppercase">
                                    SN: {item.serialNumber}
                                  </span>
                                </div>
                              )}
                              {!hidePrices && (
                                <div className="flex items-center justify-between mt-0.5">
                                  <p className="text-[9px] font-bold text-gray-600 uppercase">
                                    {Math.abs(item.quantity)} × {formatCurrency(item.product.price, state.settings.currency)}
                                  </p>
                                  <p className="text-[11px] font-black text-gray-900 dark:text-white tabular-nums">
                                    {formatCurrency(item.product.price * item.quantity, state.settings.currency)}
                                  </p>
                                </div>
                              )}
                              {showDiscount && !isNested && item.discount > 0 && (
                                <div className="flex items-center justify-between text-[8px] text-rose-500 font-black mt-1.5 uppercase tracking-widest bg-rose-50 dark:bg-rose-500/10 px-1.5 py-0.5 rounded-md border border-rose-100 dark:border-rose-500/20">
                                  <span className="flex items-center gap-1">
                                    <Gift className="w-2.5 h-2.5" />
                                    {t("discount", "Discount")} {item.discountType === 'percentage' && item.discountValue ? `(${item.discountValue}%)` : ''}
                                  </span>
                                  <span className="tabular-nums">-{formatCurrency(item.discount, state.settings.currency)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      };

                      const renderedBundlesHeader = bundles.length > 0 ? (
                        <div className="flex items-center gap-1.5 px-1 text-[8px] font-black text-violet-600 dark:text-violet-400 uppercase tracking-widest mb-1">
                          <Gift className="h-3 w-3 text-violet-500 shrink-0" />
                          <span>{t('combo_deals_sec', 'Bundle / Deal Items')} ({bundles.length})</span>
                        </div>
                      ) : null;

                      const renderedStandalonesHeader = bundles.length > 0 && standaloneItems.length > 0 ? (
                        <div className="flex items-center gap-1.5 px-1 pt-2 text-[8px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest border-t border-gray-100 dark:border-white/5 mt-2 mb-1">
                          <ShoppingBag className="h-3 w-3 text-gray-400 shrink-0" />
                          <span>{t('standalone_items_sec', 'Other / Standalone Items')} ({standaloneItems.length})</span>
                        </div>
                      ) : null;

                      const bundleThumb = (b: typeof bundles[number]) => b.bundleImage || b.items[0]?.product?.image || null;

                      let itemNumber = 0;
                      const renderedBundles = bundles.map((b) => {
                        const discountStr = showDiscount && b.totalDiscount > 0 ? `-${formatCurrency(b.totalDiscount, state.settings.currency)}` : undefined;
                        return (
                          <div key={`checkout-bundle-${b.bundleId}`} className="p-3 my-1.5 rounded-xl border border-dashed border-violet-500/30 bg-violet-500/[0.01]">
                            <CompactItemRow
                              image={bundleThumb(b)}
                              name={b.bundleName}
                              price={formatCurrency(b.totalSubtotal, state.settings.currency)}
                              discount={discountStr}
                            />
                            <div className="mt-2 pl-8 border-t border-dashed border-violet-500/10 pt-1.5 space-y-1">
                              {b.items.map((item) => (
                                <div key={++itemNumber} className="flex flex-col text-[9px] text-gray-600 dark:text-gray-400 font-bold uppercase">
                                  <div className="flex justify-between items-center">
                                    <span className="flex items-center gap-1.5 truncate"><span className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 text-[8px] font-bold shrink-0">{itemNumber}</span>{Math.abs(item.quantity)} × {item.product.name}</span>
                                    <div className="flex items-center gap-1 shrink-0 ml-2">
                                      {item.selectedVariant && <span className="text-[8px] text-gray-500">({item.selectedVariant})</span>}
                                    </div>
                                  </div>
                                  {item.toppings && item.toppings.length > 0 && (
                                    <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 leading-tight mt-0.5 normal-case">
                                      + {item.toppings.map((t: any) => `${t.name} (${formatCurrency(t.price, state.settings.currency)})`).join(', ')}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      });

                      const renderedStandalones = standaloneItems.map((item) => renderItemCard(item, ++itemNumber));

                      return (
                        <>
                          {renderedBundlesHeader}
                          {renderedBundles}
                          {renderedStandalonesHeader}
                          {renderedStandalones}
                        </>
                      );
                    })()}
                  </div>

                  {/* Totals */}
                  <div className="pt-4 border-t border-dashed border-gray-200 dark:border-white/10 space-y-2">
                    {showDiscount && (
                      <div className="flex justify-between text-[10px] text-gray-600 font-bold uppercase tracking-widest">
                        <span>{t("subtotal", "Subtotal")}</span>
                        <span className="text-gray-900 dark:text-gray-100">{formatCurrency(subtotal, state.settings.currency)}</span>
                      </div>
                    )}
                    {taxAmount > 0 && (
                      <div className="flex justify-between text-[10px] text-gray-600 font-bold uppercase tracking-widest">
                        <span>{t("tax", "Tax")}</span>
                        <span className="text-gray-900 dark:text-gray-100">{formatCurrency(taxAmount, state.settings.currency)}</span>
                      </div>
                    )}
                    <div className="mt-4 bg-primary rounded-[1.5rem] p-4 flex items-center justify-between shadow-xl shadow-emerald-600/20">
                      <div>
                        <p className="text-[8px] font-black text-white/60 uppercase tracking-[0.2em] mb-1">{t("grand_total", "Final Total")}</p>
                        <p className="text-2xl sm:text-3xl font-black text-white tracking-tighter tabular-nums leading-none">
                          {formatCurrency(total, state.settings.currency)}
                        </p>
                      </div>
                      <div className="bg-white/20 px-3 py-2 rounded-xl border border-white/20">
                        <span className="text-xs font-black text-white text-center flex items-center">
                          {state.cart.reduce((sum, item) => sum + Math.abs(item.quantity), 0)} {state.cart.reduce((sum, item) => sum + Math.abs(item.quantity), 0) === 1 ? t("item", "Item") : t("items", "Items")}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Extra Info: DC Number & Other Amount */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[9px] font-black text-gray-600 uppercase tracking-widest px-1">
                    <Hash className="w-3 h-3" />
                    <span className="flex items-center">
                      {t("dc_number", "DC Number")}
                      <HelpTooltip content="Delivery Challan / Dispatch Note serial number. Used for shipping reference and carrier tracking logs." />
                    </span>
                  </div>
                  <input
                    type="text"
                    value={dcNumber}
                    onChange={(e) => setDcNumber(e.target.value)}
                    placeholder="Enter DC#"
                    className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/5 rounded-xl px-4 py-3 text-[11px] font-bold text-gray-900 dark:text-white"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[9px] font-black text-gray-600 uppercase tracking-widest px-1">
                    <PlusCircle className="w-3 h-3" />
                    <span className="flex items-center">
                      {t("other_amount", "Other Amount")}
                      <HelpTooltip content="Additional fees (e.g. delivery fee, packaging charge, installation cost) added directly to the invoice." />
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={otherAmountName}
                      onChange={(e) => setOtherAmountName(e.target.value)}
                      placeholder={t("extra_charges_placeholder", "Name (e.g. Delivery)")}
                      className="flex-1 bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/5 rounded-xl px-3 py-3 text-[10px] font-bold text-gray-900 dark:text-white"
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={otherAmount}
                      onChange={(e) => setOtherAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                      placeholder="0"
                      className="w-20 bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/5 rounded-xl px-3 py-3 text-[10px] font-bold text-gray-900 dark:text-white text-right"
                    />
                  </div>
                </div>
              </div>

              {/* Sale Type */}
              <div className="bg-gray-100/50 dark:bg-black/30 p-1 rounded-2xl border border-gray-200 dark:border-white/5">
                <div className="grid grid-cols-3 gap-1">
                  {retailEnabled && (
                    <button onClick={() => setSaleType('retail')} className={cn("flex items-center justify-center gap-2 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all", saleType === 'retail' ? 'bg-primary text-white shadow-lg' : 'text-gray-600 hover:text-gray-900 dark:hover:text-white')}>
                      <Store className="w-3.5 h-3.5" /> <span>{t("retail", "Retail")}</span>
                    </button>
                  )}
                  {wholesaleEnabled && (
                    <button onClick={() => setSaleType('wholesale')} className={cn("flex items-center justify-center gap-2 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all", saleType === 'wholesale' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-600 hover:text-gray-900 dark:hover:text-white')}>
                      <ShoppingBag className="w-3.5 h-3.5" /> <span>{t("wholesale", "Bulk")}</span>
                    </button>
                  )}
                  {estoreEnabled && (
                    <button onClick={() => setSaleType('estore')} className={cn("flex items-center justify-center gap-2 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all", saleType === 'estore' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-600 hover:text-gray-900 dark:hover:text-white')}>
                      <Globe className="w-3.5 h-3.5" /> <span>{t("estore", "E-Store")}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* ── RIGHT COLUMN: Payment ── */}
            <div className="space-y-6">
              <div className="space-y-4">
                <label className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-[0.2em] flex items-center gap-3">
                  <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
                  <span className="flex items-center">
                    {t("payment_method", "Payment Method")}
                    <HelpTooltip content="Select how the customer is settling the bill. Split allows multiple tenders (e.g. Cash + Card). Credit records a ledger debt." />
                  </span>
                </label>

                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {paymentMethods.map(({ id, label, icon: Icon, color }) => {
                    const c = colorMap[color];
                    const isActive = paymentMethod === id;
                    const disabled = id === 'credit' && !canPayWithCredit;

                    return (
                      <button
                        key={id}
                        onClick={() => setPaymentMethod(id)}
                        disabled={disabled}
                        className={cn(
                          "flex flex-col items-center justify-center gap-2 p-2 rounded-2xl border transition-all active:scale-90",
                          isActive ? `${c.border} ${c.bg} shadow-md` : 'border-gray-200 dark:border-white/5 bg-white dark:bg-black/20 text-gray-600',
                          disabled && 'opacity-20 cursor-not-allowed'
                        )}
                      >
                        <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center", isActive ? `${c.icon} text-white shadow-lg` : 'bg-gray-100 dark:bg-white/5')}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <span className={cn("text-[8px] font-black uppercase tracking-widest", isActive && c.text)}>{t(id, label)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Payment Input */}
              <div className="bg-white dark:bg-black/30 border border-gray-200 dark:border-white/5 rounded-[2rem] overflow-hidden p-6 space-y-4 min-h-[280px]">
                {paymentMethod === 'cash' ? (
                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em]">{t("received", "Received")}</label>
                      <button onClick={() => setAmountPaid(total.toString())} className="text-[8px] font-black text-primary uppercase tracking-widest bg-primary/10 px-3 py-1 rounded-full">{t("exact", "EXACT")}</button>
                    </div>

                    <div className="relative group">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none">
                        <span className="text-xl font-black text-primary uppercase">{state.settings.currency}</span>
                      </div>
                      <input
                        type="text"
                        inputMode="decimal"
                        autoFocus
                        value={amountPaid}
                        onChange={(e) => setAmountPaid(e.target.value.replace(/[^0-9.]/g, ''))}
                        className="w-full h-14 pl-12 pr-12 py-3 bg-white dark:bg-surface border border-gray-200 dark:border-white/10 rounded-full text-xl font-black text-gray-900 dark:text-white focus:border-primary outline-none transition-all [appearance:textfield] text-center"
                        placeholder="0"
                      />
                    </div>

                    <div className="grid grid-cols-4 gap-1.5">
                      {quickAmounts.map((amt, idx) => (
                        <button key={`${amt}-${idx}`} onClick={() => setAmountPaid(amt.toString())}
                          className="py-1.5 sm:py-2 bg-white dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 text-[8px] sm:text-[9px] font-black border border-gray-200 dark:border-white/10 rounded-full active:scale-95 touch-manipulation transition-all tabular-nums hover:border-transparent">
                          {state.settings.currency || 'Rs'} {Math.round(amt)}
                        </button>
                      ))}
                    </div>

                    {/* Change / Due Display (Always visible) */}
                    <div className={`p-4 rounded-2xl flex items-center justify-between border transition-all duration-300 animate-in fade-in zoom-in-95 ${change >= 0 ? 'bg-primary/10 border-transparent text-primary dark:text-emerald-400' : 'bg-amber-500/10 border-transparent text-amber-600 dark:text-amber-400'
                      }`}>
                      <div>
                        <p className="text-[8px] font-black uppercase tracking-widest mb-1">
                          {change >= 0 ? t("change", "Change") : t("due", "Balance Due")}
                        </p>
                        <p className="text-xl font-black tabular-nums tracking-tighter">
                          {formatCurrency(Math.abs(change), state.settings.currency)}
                        </p>
                      </div>
                      {change >= 0 ? (
                        <div className="w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/20">
                          <Check className="w-4.5 h-4.5" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 bg-amber-500/10 text-amber-500 dark:text-amber-400 rounded-full flex items-center justify-center">
                          <AlertCircle className="w-4.5 h-4.5" />
                        </div>
                      )}
                    </div>
                  </div>
                ) : paymentMethod === 'split' ? (
                  <div className="space-y-4 animate-in fade-in zoom-in-95">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em]">{t("combined_payment", "Combined Payment")}</label>
                      <button onClick={addSplitLine} className="text-[8px] font-black text-blue-500 uppercase tracking-widest bg-blue-500/10 px-3 py-1 rounded-full">{t("add_method", "+ ADD METHOD")}</button>
                    </div>

                    <div className="space-y-3 max-h-[180px] overflow-y-auto pr-2 custom-scrollbar">
                      {splitPayments.map((p, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <select
                            value={p.method}
                            onChange={(e) => handleUpdateSplitMethod(i, e.target.value)}
                            className="bg-gray-100 dark:bg-white/5 border-none rounded-xl text-[10px] font-black uppercase px-2 py-3 w-[100px]"
                          >
                            <option value="cash">{t("cash", "Cash")}</option>
                            <option value="card">{t("card", "Card")}</option>
                            <option value="digital">{t("digital", "Bank Transfer")}</option>
                            <option value="credit">{t("credit", "Credit")}</option>
                          </select>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={p.amount || ''}
                            onChange={(e) => handleUpdateSplit(i, parseFloat(e.target.value.replace(/[^0-9.]/g, '')) || 0)}
                            className="flex-1 bg-gray-100 dark:bg-white/5 border-none rounded-xl text-[12px] font-black px-4 py-3 text-center"
                            placeholder="0"
                          />
                          <button onClick={() => removeSplitLine(i)} className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-xl">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className={cn("rounded-2xl p-4 flex items-center justify-between shadow-lg transition-colors", splitTotal >= total ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-white/5 text-gray-500')}>
                      <div>
                        <p className="text-[8px] font-black uppercase opacity-70 mb-1">{t("received", "Paid")} {formatCurrency(splitTotal, state.settings.currency)}</p>
                        <p className="text-xl font-black tabular-nums">
                          {splitTotal >= total ? `${t("change", "CHG")}: ${formatCurrency(splitTotal - total, state.settings.currency)}` : `${t("due", "DUE")}: ${formatCurrency(total - splitTotal, state.settings.currency)}`}
                        </p>
                      </div>
                      {splitTotal >= total && <Check className="w-5 h-5" />}
                    </div>
                  </div>
                ) : paymentMethod === 'credit' ? (
                  <div className="space-y-4 animate-in fade-in zoom-in-95">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-rose-600 uppercase tracking-[0.2em]">{t("advance_received", "Advance Received (Optional)")}</label>
                    </div>

                    <div className="relative group">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none">
                        <span className="text-xl font-black text-rose-500 uppercase">{state.settings.currency}</span>
                      </div>
                      <input
                        type="text"
                        inputMode="decimal"
                        autoFocus
                        value={amountPaid}
                        onChange={(e) => setAmountPaid(e.target.value.replace(/[^0-9.]/g, ''))}
                        className="w-full bg-rose-50 dark:bg-rose-900/10 border-none rounded-2xl px-16 py-4 text-3xl font-black text-rose-600 dark:text-rose-400 focus:ring-2 focus:ring-rose-500/20 tabular-nums text-center"
                        placeholder="0"
                      />
                    </div>

                    <div className="bg-rose-500 text-white rounded-2xl p-4 flex items-center justify-between shadow-lg">
                      <div>
                        <p className="text-[8px] font-black text-white/90 uppercase mb-1">{t("added_to_debt", "Added to Debt")}</p>
                        <p className="text-xl font-black tabular-nums">{formatCurrency(total - (parseFloat(amountPaid) || 0), state.settings.currency)}</p>
                      </div>
                      <AlertCircle className="w-5 h-5 opacity-80" />
                    </div>
                  </div>
                ) : (
                  <div className="py-12 flex flex-col items-center text-center gap-4 animate-in fade-in zoom-in-95">
                    <div className="w-20 h-20 bg-primary/10 rounded-[2.5rem] flex items-center justify-center border border-primary/20 shadow-inner">
                      <Check className="w-10 h-10 text-primary" />
                    </div>
                    <div>
                      <p className="text-[12px] font-black text-gray-900 dark:text-white uppercase tracking-widest">{t(paymentMethod, paymentMethod)}</p>
                      <p className="text-[9px] font-bold text-gray-500 uppercase tracking-[0.2em] mt-1">{t("ready_to_finalize", "Ready to finalize settlement")}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-[9px] font-black text-gray-600 uppercase tracking-[0.2em] px-1">{t("memo", "Internal Notes")}</p>
                <textarea
                  value={saleNotes}
                  onChange={(e) => {
                    setSaleNotes(e.target.value);
                    dispatch({ type: 'SET_NOTES', payload: e.target.value });
                  }}
                  placeholder={t("notes_placeholder", "Special instructions...")}
                  rows={2}
                  className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none rounded-2xl px-4 py-3 text-[10px] font-bold text-gray-900 dark:text-white resize-none"
                />
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {showReceipt && completedSale && (
        <>
          <ReceiptPrint sale={completedSale} onClose={handleCloseModal} />
          {state.settings.enableKotPrinter && (
            <KOTPrint sale={completedSale} />
          )}
        </>
      )}
    </>
  );

}
