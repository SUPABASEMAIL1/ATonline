import { useState, useEffect, useMemo, useRef } from 'react';
import { X, ArrowLeft, CreditCard, Banknote, Smartphone, Check, AlertCircle, FileText, Store, Globe, ShoppingBag, RefreshCw, Package, Wallet, Gift, Layers, Hash, PlusCircle, Keyboard, Building2 } from 'lucide-react';
import { Sale, SplitPayment, CartItem } from '../../types';
import { useApp, useInvoiceGeneration } from '../../context/SupabaseAppContext';
import { useCartCalculations } from '../../hooks/useCartCalculations';
import { useAuth } from '../../context/AuthContext';
import { KOTPrint } from './KOTPrint';
import { ReceiptPrint } from './ReceiptPrint';
import { salesService, generateId, getCustomerCreditStatus, toRemoteSale } from '../../lib/services';
import { localDb, queueOp } from '../../lib/localDb';
import { sonner } from '../../lib/sonner';
import { formatCurrency } from '../../lib/currencies';
import { Modal } from '../common/Modal';
import { HelpTooltip } from '../common/HelpTooltip';
import { cn } from '../../lib/utils';
import { CompactItemRow } from './CompactItemRow';
import { ShortcutsModal } from './ShortcutsModal';
import { useTranslation } from '../../hooks/useTranslation';
import { usePOSKeyboard } from '../../hooks/usePOSKeyboard';

interface CheckoutPageProps {
  onClose: () => void;
  onComplete: (sale: Sale) => void;
}

export function CheckoutPage({ onClose, onComplete }: CheckoutPageProps) {
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
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);

  // New Fields
  const [extraCharges, setExtraCharges] = useState<{ name: string; amount: string }[]>([
    { name: 'DC', amount: '' }
  ]);
  const [splitPayments, setSplitPayments] = useState<SplitPayment[]>([
    { method: 'cash', amount: 0 },
    { method: 'card', amount: 0 }
  ]);

  const { retailEnabled, wholesaleEnabled, estoreEnabled } = state.settings;
  const { subtotal, totalDiscount, taxAmount, total: baseTotal, activePromotions: appliedDiscounts, freeGifts } = useCartCalculations(paymentMethod);

  const checkoutCartItems = useMemo(() => {
    return state.cart.filter(item => item.quantity !== 0);
  }, [state.cart]);

  const extraChargesTotal = useMemo(() =>
    extraCharges.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0)
    , [extraCharges]);

  const finalTotal = baseTotal + extraChargesTotal;

  const showDiscount = state.settings.receiptShowDiscount !== false && 
    !checkoutCartItems.some(item => item.bundleHideItemPrices === true || item.bundle_hide_item_prices === true);

  useEffect(() => {
    document.body.classList.add('overflow-hidden');
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.classList.remove('overflow-hidden');
      document.body.style.overflow = originalStyle;
    };
  }, []);

  const quickAmounts = useMemo(() => {
    if (finalTotal <= 0) return [];
    const amounts = new Set<number>();

    // Always include exact total
    amounts.add(Math.ceil(finalTotal));

    if (finalTotal < 500) {
      amounts.add(Math.ceil(finalTotal / 50) * 50);
      amounts.add(Math.ceil(finalTotal / 100) * 100);
      amounts.add(500);
    } else if (finalTotal < 1000) {
      amounts.add(Math.ceil(finalTotal / 100) * 100);
      amounts.add(1000);
      amounts.add(1500);
    } else if (finalTotal < 5000) {
      amounts.add(Math.ceil(finalTotal / 500) * 500);
      amounts.add(Math.ceil(finalTotal / 1000) * 1000);
      if (finalTotal < 4500) amounts.add(5000);
    } else {
      amounts.add(Math.ceil(finalTotal / 1000) * 1000);
      const next5k = Math.ceil(finalTotal / 5000) * 5000;
      amounts.add(next5k === Math.ceil(finalTotal) ? next5k + 5000 : next5k);
      amounts.add(Math.ceil(finalTotal / 5000) * 5000 + 5000);
    }

    return Array.from(amounts)
      .filter(a => a >= finalTotal)
      .sort((a, b) => a - b)
      .slice(0, 3);
  }, [finalTotal]);

  useEffect(() => {
    // If a sale has been completed, do not reset the state or form fields
    if (completedSale || showReceipt) return;

    setAmountPaid('');
    setIsProcessing(false);
    setShowReceipt(false);
    setCompletedSale(null);
    setPaymentMethod('cash');

    // If editing, load notes and extra charges
    if (state.editingSaleId) {
      const editingSale = state.sales.find(s => s.id === state.editingSaleId);
      if (editingSale) {
        setSaleNotes(editingSale.notes || '');
        setSaleType(editingSale.saleType as any);
        if (editingSale.extraCharges && editingSale.extraCharges.length > 0) {
          setExtraCharges(editingSale.extraCharges.map(c => ({ name: c.name, amount: String(c.amount) })));
        } else {
          setExtraCharges([{ name: 'DC', amount: '' }]);
        }
        if (editingSale.paymentMethod) setPaymentMethod(editingSale.paymentMethod === 'split' ? 'split' : editingSale.paymentMethod);
      }
    } else {
      setSaleNotes('');
      setExtraCharges([{ name: 'DC', amount: '' }]);
      const preferredMode = state.settings.defaultSaleType || 'retail';
      if (preferredMode === 'retail' && retailEnabled) setSaleType('retail');
      else if (preferredMode === 'wholesale' && wholesaleEnabled) setSaleType('wholesale');
      else if (preferredMode === 'estore' && estoreEnabled) setSaleType('estore');
      else if (retailEnabled) setSaleType('retail');
      else if (wholesaleEnabled) setSaleType('wholesale');
      else if (estoreEnabled) setSaleType('estore');
    }
  }, [retailEnabled, wholesaleEnabled, estoreEnabled, state.editingSaleId, state.settings.defaultSaleType, completedSale, showReceipt]);

  // canProcessPayment is declared below — usePOSKeyboard is called after it

  const change = (parseFloat(amountPaid) || 0) - finalTotal;
  const totalQty = checkoutCartItems.reduce((s, i) => s + Math.abs(i.quantity), 0);
  const splitTotal = splitPayments.reduce((sum, p) => sum + p.amount, 0);

  const canProcessPayment = () => {
    if (isProcessing) return false;
    const paid = parseFloat(amountPaid) || 0;
    switch (paymentMethod) {
      case 'cash': return paid >= finalTotal;
      case 'card': case 'digital': return true;
      case 'credit': return !!state.selectedCustomer;
      case 'split': return splitTotal >= finalTotal;
      default: return false;
    }
  };

  // Ref so usePOSKeyboard can call handlePayment without TDZ issues
  const handlePaymentRef = useRef<() => Promise<void>>(async () => {});

  // ── Keyboard Shortcuts (must come after canProcessPayment is defined) ──
  usePOSKeyboard({
    isCheckoutOpen: true,
    canProcessPayment: canProcessPayment(),
    isProcessing,
    onPaymentMethod: (method) => {
      // Only switch to split if enabled in settings
      if (method === 'split' && !state.settings.enableSplitPayment) return;
      setPaymentMethod(method);
    },
    onExactAmount: () => setAmountPaid(finalTotal.toString()),
    onProcessPayment: () => handlePaymentRef.current(),
    onClose,
  });

  const handlePayment = async () => {
    // Keep ref synced so the keyboard shortcut always calls this latest version
    handlePaymentRef.current = handlePayment;
    // ── CREDIT LIMIT ENFORCEMENT (RULE F9) ──
    if (paymentMethod === 'credit' || (paymentMethod === 'split' && splitPayments.some(p => p.method === 'credit'))) {
      if (!state.selectedCustomer) {
        sonner.error('Customer Required', 'A customer must be selected for credit sales.');
        return;
      }

      const creditAmount = paymentMethod === 'credit'
        ? finalTotal
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

    setIsProcessing(true);
    try {
      const invoiceNumber = await generateInvoice();
      const sale: Sale = {
        id: generateId(), invoiceNumber,
        customerId: state.selectedCustomer?.id,
        customerName: state.selectedCustomer?.name,
        customerPhone: state.selectedCustomer?.phone,
        items: checkoutCartItems, subtotal,
        discountAmount: totalDiscount, taxAmount, total: finalTotal,
        billDiscountValue: state.billDiscountValue,
        billDiscountType: state.billDiscountType,
        paymentMethod: paymentMethod === 'split' ? 'split' : (paymentMethod as any),
        cardDetails: undefined,
        status: paymentMethod === 'credit' ? 'credit' : 'completed',
        cashier: profile?.name || user?.user_metadata?.full_name || user?.email || 'Unknown',
        timestamp: new Date(), receiptNumber: invoiceNumber,
        notes: saleNotes,
        appliedDiscounts,
        freeGifts: freeGifts.length > 0 ? freeGifts : undefined,
        receivedAmount: paymentMethod === 'cash' ? parseFloat(amountPaid) || undefined : undefined,
        changeAmount: paymentMethod === 'cash' ? change || undefined : undefined,
        saleType,
        saleDate: new Date().toLocaleDateString('en-CA'),
        extraCharges: extraCharges.filter(c => parseFloat(c.amount) > 0),
        splitPayments: paymentMethod === 'split' ? splitPayments : []
      };

      let savedSale;

      if (state.editingSaleId) {
        const oldSaleId = state.editingSaleId;
        try {
          // Phase 1: Create the NEW sale first (deducts stock)
          savedSale = await salesService.create(sale);

          // Phase 2: Try to delete the OLD sale (restores stock)
          try {
            await salesService.delete(oldSaleId, profile?.name || 'Admin');
            dispatch({ type: 'DELETE_SALE', payload: oldSaleId });
          } catch (deleteError) {
            console.error('BILL EDIT CONFLICT: New sale created but old sale delete failed', { oldSaleId, newSaleId: savedSale.id, deleteError });
            try {
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
                const updatedSales = state.sales.map(s => s.id === oldSaleId ? voidedSale : s);
                dispatch({ type: 'SET_SALES', payload: updatedSales });
              }
            } catch (statusError) {
              console.error('Failed to void old sale during conflict:', statusError);
            }
            sonner.warning(
              '⚠️ Bill Updated with Warning',
              'The new bill was recorded successfully, but removing the old bill record had an issue. It has been marked as void.'
            );
          }
          dispatch({ type: 'SET_EDITING_SALE_ID', payload: null });
        } catch (error) {
          throw error;
        }
      } else {
        savedSale = await salesService.create(sale);
      }

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
      setIsProcessing(false);
      sonner.error('Payment Failed', error.message || 'Payment processing failed. Please try again.');
    }
  };

  const addSplitLine = () => {
    if (splitPayments.length < 5) {
      setSplitPayments([...splitPayments, { method: 'cash', amount: 0 }]);
    }
  };

  const removeSplitLine = (index: number) => {
    if (splitPayments.length > 2) {
      setSplitPayments(splitPayments.filter((_, i) => i !== index));
    }
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

  const saleTypes = [
    { id: 'retail', label: 'Retail', icon: Store, enabled: retailEnabled },
    { id: 'wholesale', label: 'Wholesale', icon: Package, enabled: wholesaleEnabled },
    { id: 'estore', label: 'E-Store', icon: Globe, enabled: estoreEnabled },
  ].filter(st => st.enabled);

  const payMethods = [
    { id: 'cash', label: 'Cash', icon: Banknote },
    { id: 'card', label: 'Card', icon: CreditCard },
    { id: 'digital', label: 'Bank Transfer', icon: Building2 },
    { id: 'credit', label: 'Credit', icon: FileText },
    ...(state.settings.enableSplitPayment ? [{ id: 'split', label: 'Split', icon: Layers }] : []),
  ];

  if (showReceipt && completedSale) {
    return (
      <>
        <ReceiptPrint
          sale={completedSale}
          onClose={() => { setShowReceipt(false); setCompletedSale(null); onClose(); }}
        />
        {state.settings.enableKotPrinter && <KOTPrint sale={completedSale} />}
      </>
    );
  }

  const headerActions = (
    <div className="flex items-center gap-1.5 sm:gap-4 shrink-0">
      <button
        onClick={() => setIsShortcutsModalOpen(true)}
        className="p-2 sm:p-3 bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-400 rounded-2xl hover:bg-emerald-50 dark:hover:bg-primary/10 hover:text-primary transition-all active:scale-90 flex items-center gap-1.5"
        title={t('shortcuts_guide', 'Shortcuts Guide')}
      >
        <Keyboard className="h-4 w-4 shrink-0" />
        <span className="hidden sm:inline text-[9px] font-black uppercase tracking-widest leading-none">{t('shortcuts', 'Shortcuts')}</span>
      </button>

      <button
        onClick={handlePayment}
        disabled={!canProcessPayment() || isProcessing}
        className="btn btn-md btn-primary md:hidden !px-3 !py-2 !text-[8px] max-w-[120px]"
      >
        {isProcessing ? <RefreshCw className="h-3 w-3 animate-spin shrink-0" /> : <Check className="h-3.5 w-3.5 shrink-0" />}
        <span className="truncate">{t("save_to_device", "SAVE")}</span>
      </button>

      <div className="hidden sm:flex flex-col items-end">
        <p className="text-[8px] sm:text-[9px] font-black text-gray-600 uppercase tracking-widest leading-none">{t("total", "Net Total")}</p>
        <p className="text-base sm:text-xl font-black text-primary dark:text-emerald-400 tabular-nums leading-tight mt-0.5">{formatCurrency(finalTotal, state.settings.currency)}</p>
      </div>
    </div>
  );

  const footer = (
    <div className="flex flex-col w-full gap-2">
      {/* Keyboard hint strip — desktop only */}
      <div 
        onClick={() => setIsShortcutsModalOpen(true)}
        className="hidden sm:flex items-center justify-center gap-3 flex-wrap cursor-pointer hover:opacity-80 transition-opacity"
        title={t('click_to_open_guide', 'Click to open shortcuts guide')}
      >
        {[
          { key: '1', label: 'Cash' },
          { key: '2', label: 'Card' },
          { key: '3', label: 'Digital' },
          { key: '4', label: 'Credit' },
          { key: 'E', label: 'Exact Amt' },
          { key: 'Enter', label: 'Pay' },
          { key: 'Esc', label: 'Cancel' },
        ].map(({ key, label }) => (
          <span key={key} className="flex items-center gap-1">
            <kbd className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/10 border border-gray-200 dark:border-white/10 text-[8px] font-black text-gray-600 dark:text-gray-400 shadow-sm leading-none">
              {key}
            </kbd>
            <span className="text-[8px] text-gray-400">{label}</span>
          </span>
        ))}
      </div>
      <div className="flex w-full items-center gap-2 sm:gap-3">
        <button onClick={onClose} disabled={isProcessing}
          className="px-4 sm:px-8 py-2.5 sm:py-3.5 border border-rose-200 dark:border-rose-900/30 text-[#ff4b6e] hover:bg-rose-50 dark:hover:bg-rose-500/10 text-[9px] sm:text-[11px] font-black uppercase tracking-widest rounded-2xl transition-all active:scale-95 shrink-0">
          {t("cancel", "Cancel")}
        </button>
        <button onClick={handlePayment} disabled={!canProcessPayment() || isProcessing}
          className="btn btn-md btn-primary flex-1 disabled:grayscale active:scale-[0.98] touch-manipulation !py-2.5 sm:!py-3.5 !text-[9px] sm:!text-[11px]">
          {isProcessing ? (
            <RefreshCw className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
          ) : (
            <>
              <Check className="h-4 w-4 sm:h-5 sm:w-5" />
              <span>{t("process_payment", "Process Payment")}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={t("finalize_settlement", "Settlement")}
      subtitle={t("finalization", "Finalization")}
      maxWidth="lg"
      headerActions={headerActions}
      footer={footer}
      
      
    >
      {/* ── BODY ── */}
      <div className="flex flex-col md:grid md:grid-cols-2 md:divide-x divide-gray-100 dark:divide-white/5 min-h-full">

        {/* RIGHT: Payment — shown 1st on mobile, 2nd on tablet+ */}
        <div className="p-4 space-y-4 order-1 md:order-2 bg-gray-50/50 dark:bg-app">

          {/* Net Payable card — mobile only */}
          <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20 relative overflow-hidden md:hidden mb-1">
            <div className="absolute right-3 top-3 opacity-10"><Wallet className="w-10 h-10 sm:w-14 sm:h-14 text-white rotate-12" /></div>
            <div className="relative z-10 flex items-center justify-between">
              <div>
                <p className="text-[7px] sm:text-[8px] font-black text-white/60 uppercase tracking-[0.25em]">{t("net_payable", "Net Payable")}</p>
                <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight tabular-nums mt-0.5">{formatCurrency(finalTotal, state.settings.currency)}</h3>
              </div>
              <div className="px-2 py-0.5 sm:px-3 sm:py-1 rounded-full bg-white/20 border border-white/10">
                <p className="text-[8px] sm:text-[9px] font-black text-white uppercase tracking-widest">{totalQty} {t("qty", "QTY")}</p>
              </div>
            </div>
          </div>

          {/* Sale Type Selector (Mobile) */}
          {saleTypes.length > 0 && (
            <div className="md:hidden grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(saleTypes.length, 3)}, minmax(0, 1fr))` }}>
              {saleTypes.map(st => {
                const Icon = st.icon;
                return (
                  <button key={st.id} onClick={() => setSaleType(st.id as any)}
                    className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-[9px] font-black uppercase tracking-wide transition-all active:scale-95 touch-manipulation ${saleType === st.id ? 'bg-primary text-white border-primary shadow-sm shadow-emerald-500/20' : 'bg-gray-50 dark:bg-white/[0.03] text-gray-600 border-gray-200 dark:border-white/5 hover:text-gray-600 dark:hover:text-gray-200'}`}>
                    <Icon className="w-3.5 h-3.5" />
                    {t(st.id, st.label)}
                  </button>
                );
              })}
            </div>
          )}

          {/* Payment Method */}
          <div>
            <p className="text-[8px] sm:text-[9px] font-black text-gray-600 uppercase tracking-widest mb-1.5 sm:mb-2 flex items-center">
              {t("payment_method", "Payment Method")}
              <HelpTooltip content="Select how the bill is being paid. Split allows mixed tenders (e.g. Cash and Credit Card). Credit records debt to customer account." />
            </p>
            <div className={cn("grid gap-1 sm:gap-1.5", state.settings.enableSplitPayment ? "grid-cols-5" : "grid-cols-4")}>
              {payMethods.map(m => {
                const isActive = paymentMethod === m.id;
                return (
                  <button key={m.id} onClick={() => setPaymentMethod(m.id as any)}
                    className={`flex flex-col items-center justify-center gap-1 py-2 sm:py-3 rounded-xl border transition-all active:scale-95 touch-manipulation ${isActive ? 'bg-primary border-primary shadow-lg shadow-emerald-500/20' : 'bg-white dark:bg-white/[0.03] border-gray-200 dark:border-white/10 hover:border-primary/30'}`}>
                    <m.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${isActive ? 'text-white' : 'text-gray-600 dark:text-gray-400'}`} />
                    <span className={`text-[7px] sm:text-[8px] font-black uppercase tracking-widest ${isActive ? 'text-white' : 'text-gray-600 dark:text-gray-400'}`}>{t(m.id, m.label)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount Input */}
          <div className="min-h-[200px]">
            {paymentMethod === 'split' ? (
              <div className="space-y-3 animate-in fade-in zoom-in-95 duration-300">
                <div className="flex items-center justify-between">
                  <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest">{t("combined_payment", "Combined Payment")}</label>
                  <button onClick={addSplitLine} className="text-[8px] font-black text-blue-500 uppercase tracking-widest bg-blue-500/10 px-3 py-1 rounded-full">{t("add_method", "+ ADD")}</button>
                </div>

                <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                  {splitPayments.map((p, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <select
                        value={p.method}
                        onChange={(e) => handleUpdateSplitMethod(i, e.target.value)}
                        className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-[10px] font-black uppercase px-2 py-2.5 w-[100px]"
                      >
                        <option value="cash">{t("cash", "Cash")}</option>
                        <option value="card">{t("card", "Card")}</option>
                        <option value="digital">{t("digital", "Bank Transfer")}</option>
                        <option value="credit">{t("credit", "Credit")}</option>
                      </select>
                      <input
                        type="text" inputMode="decimal"
                        value={p.amount || ''}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9.]/g, '');
                          handleUpdateSplit(i, parseFloat(val) || 0);
                        }}
                        className="flex-1 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-[12px] font-black px-4 py-2.5 text-center"
                        placeholder="0"
                      />
                      <button onClick={() => removeSplitLine(i)} className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-xl">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className={cn("rounded-2xl p-4 flex items-center justify-between shadow-lg transition-all", splitTotal >= finalTotal ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-white/5 text-gray-500')}>
                  <div>
                    <p className="text-[8px] font-black uppercase opacity-70 mb-0.5">{t("received", "Paid")} {formatCurrency(splitTotal, state.settings.currency)}</p>
                    <p className="text-lg font-black tabular-nums">
                      {splitTotal >= finalTotal ? `${t("change", "CHG")}: ${formatCurrency(splitTotal - finalTotal, state.settings.currency)}` : `${t("due", "DUE")}: ${formatCurrency(finalTotal - splitTotal, state.settings.currency)}`}
                    </p>
                  </div>
                  {splitTotal >= finalTotal && <Check className="w-5 h-5" />}
                </div>
              </div>
            ) : (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex justify-between items-center">
                  <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest">{t("amount_paid", "Received Amount")}</label>
                  <button onClick={() => setAmountPaid(finalTotal.toString())} className="text-[8px] font-black text-primary uppercase tracking-widest touch-manipulation hover:underline">{t("exact_amount", "Exact Amount")}</button>
                </div>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[9px] font-black text-gray-600">{state.settings.currency || 'PKR'}</span>
                  <input
                    type="text" inputMode="decimal"
                    value={amountPaid}
                    onChange={e => setAmountPaid(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="w-full pl-12 pr-12 py-3 bg-white dark:bg-surface border border-gray-200 dark:border-white/5 rounded-xl text-xl font-black text-gray-900 dark:text-white focus:border-primary outline-none transition-all [appearance:textfield] text-center"
                    placeholder="0"
                  />
                </div>
                <div className="grid grid-cols-4 gap-1 sm:gap-1.5">
                  {quickAmounts.map((amt, idx) => (
                    <button key={`${amt}-${idx}`} onClick={() => setAmountPaid(amt.toString())}
                      className="py-1.5 sm:py-2 bg-white dark:bg-white/5 text-gray-700 dark:text-gray-300 rounded-lg text-[8px] sm:text-[9px] font-black border border-gray-200 dark:border-white/5 hover:border-primary/30 active:scale-95 touch-manipulation transition-all tabular-nums">
                      {state.settings.currency || 'Rs'} {Math.round(amt)}
                    </button>
                  ))}
                </div>

                {/* Change / Due Display */}
                {amountPaid && (
                  <div className={`p-3 rounded-xl flex items-center justify-between border ${change >= 0 ? 'bg-primary/10 border-primary/20' : 'bg-rose-500/10 border-rose-500/20'}`}>
                    <div>
                      <p className={`text-[8px] font-black uppercase tracking-widest mb-0.5 ${change >= 0 ? 'text-primary' : 'text-rose-500'}`}>{change >= 0 ? t("change", "Change") : t("due", "Due")}</p>
                      <p className={`text-xl font-black tabular-nums tracking-tighter ${change >= 0 ? 'text-primary dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {formatCurrency(Math.abs(change), state.settings.currency)}
                      </p>
                    </div>
                    {change >= 0
                      ? <div className="w-9 h-9 bg-primary rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/20"><Check className="w-5 h-5 text-white" /></div>
                      : <div className="w-9 h-9 bg-rose-500/20 rounded-full flex items-center justify-center"><AlertCircle className="w-5 h-5 text-rose-500" /></div>
                    }
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Extra Info: Custom Extra Charges - ONLY IF ENABLED IN SETTINGS & FOR E-STORE */}
          {state.settings.enableExtraCharges && saleType === 'estore' && (
            <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
              <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest px-1 flex items-center gap-2">
                <PlusCircle className="w-3 h-3" /> {t("other_amount", "Extra Charges")}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:gap-3">
                {extraCharges.map((charge, idx) => (
                  <div key={idx} className="flex gap-1.5 p-2 bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/5 rounded-xl transition-all hover:border-primary/30">
                    <div className="flex-1 flex items-center px-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">{t("delivery_charges", "Delivery Charges (DC)")}</span>
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={charge.amount}
                      onChange={(e) => {
                        const newCharges = [...extraCharges];
                        newCharges[idx].amount = e.target.value.replace(/[^0-9.]/g, '');
                        setExtraCharges(newCharges);
                      }}
                      placeholder="0"
                      className="w-32 bg-primary/5 dark:bg-primary/10 border border-transparent rounded-lg px-3 py-2 text-[12px] font-black text-primary dark:text-emerald-400 text-center focus:border-primary focus:ring-0 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-3.5 h-3.5 text-primary" />
              <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest flex items-center">
                {t("memo", "Internal Memo")}
                <HelpTooltip content="Special remarks or shipping notes printed on dispatch notes and saved in transaction history." />
              </span>
            </div>
            <textarea
              value={saleNotes} onChange={e => setSaleNotes(e.target.value)}
              placeholder={t("notes_placeholder", "Add notes or memo...")}
              className="w-full px-3 py-2.5 bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/5 rounded-xl text-[10px] font-medium text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-primary outline-none resize-none min-h-[60px] placeholder:text-gray-600 dark:placeholder:text-gray-600 transition-all"
            />
          </div>
        </div>

        {/* LEFT: Order Summary — shown 2nd on mobile, 1st on tablet+ */}
        <div className="p-4 flex flex-col order-2 md:order-1 border-t md:border-t-0 border-gray-200 dark:border-white/5 bg-white dark:bg-[#0C0C0C]">
          <div className="flex items-center gap-2 mb-2 shrink-0">
            <ShoppingBag className="w-3.5 h-3.5 text-primary" />
            <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">{t("order_items", "Order Items")}</span>
          </div>

          <div className="space-y-1.5 overflow-y-auto custom-scrollbar max-h-[30vh] md:max-h-[40vh] pr-1" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
            {(() => {
              const groupCartItems = (cartItems: CartItem[]) => {
                const bundlesMap = new Map<string, {
                  bundleId: string;
                  bundleName: string;
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

                return {
                  bundles: Array.from(bundlesMap.values()),
                  standaloneItems
                };
              };

              const { bundles, standaloneItems } = groupCartItems(checkoutCartItems);

              const renderItemCard = (item: CartItem, iIdx: number, isNested = false) => {
                const hidePrices = isNested && item.bundleHideItemPrices === true;
                return (
                  <div key={iIdx} className={cn(
                    "flex items-start gap-2.5 p-2 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/5",
                    isNested && "shadow-none border-none bg-transparent dark:bg-transparent p-1"
                  )}>
                    <div className="h-9 w-9 rounded-lg bg-white dark:bg-surface border border-gray-200 dark:border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0 mt-0.5 aspect-square">
                      {item.product.image ? (
                        <img src={item.product.image} className="h-full w-full object-cover" />
                      ) : (
                        <ShoppingBag className="w-4 h-4 text-gray-600 dark:text-white/20" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black uppercase text-gray-900 dark:text-white truncate leading-none">{item.product.name}</p>
                      {(item.selectedVariant || (item.selectedModifiers && item.selectedModifiers.length > 0) || item.serialNumber) && (
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
                          {item.serialNumber && (
                            <span className="text-[8px] font-black text-amber-600 dark:text-amber-500 bg-amber-500/10 px-1 py-[1px] rounded max-w-fit leading-none tracking-widest uppercase">
                              SN: {item.serialNumber}
                            </span>
                          )}
                        </div>
                      )}
                      {!hidePrices && (
                        <div className="flex items-center justify-between mt-0.5">
                          <p className="text-[8px] text-gray-600 font-bold">
                            {Math.abs(item.quantity)} × {formatCurrency(item.product.price, state.settings.currency)}
                          </p>
                          {isNested && (
                            <p className="text-[11px] font-black text-gray-900 dark:text-white tabular-nums shrink-0 self-start">
                              {formatCurrency(item.product.price * item.quantity, state.settings.currency)}
                            </p>
                          )}
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
                    {!isNested && (
                      <p className="text-[11px] font-black text-gray-900 dark:text-white tabular-nums shrink-0 self-start mt-0.5">
                        {formatCurrency(item.product.price * item.quantity, state.settings.currency)}
                      </p>
                    )}
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

              const bundleThumb = (b: typeof bundles[number]) => b.items[0]?.product?.image || null;

              const renderedBundles = bundles.map((b) => {
                const discountStr = showDiscount && b.totalDiscount > 0 ? `-${formatCurrency(b.totalDiscount, state.settings.currency)}` : undefined;
                return (
                  <div key={`checkout-page-bundle-${b.bundleId}`} className="p-3 my-1.5 rounded-xl border border-dashed border-violet-500/30 bg-violet-500/[0.01]">
                    <CompactItemRow
                      image={bundleThumb(b)}
                      name={b.bundleName}
                      price={formatCurrency(b.totalSubtotal, state.settings.currency)}
                      discount={discountStr}
                    />
                    <div className="mt-2 pl-8 border-t border-dashed border-violet-500/10 pt-1.5 space-y-1">
                      {b.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center text-[9px] text-gray-600 dark:text-gray-400 font-bold uppercase">
                          <span>{Math.abs(item.quantity)} × {item.product.name}</span>
                          {item.selectedVariant && <span className="text-[8px] text-gray-500">({item.selectedVariant})</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              });

              const renderedStandalones = standaloneItems.map((item, iIdx) => renderItemCard(item, iIdx));

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
          <div className="pt-3 border-t border-gray-200 dark:border-white/5 space-y-1.5 px-1">
            <div className="flex justify-between">
              <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">{t("subtotal", "Subtotal")}</span>
              <span className="text-[11px] font-black text-gray-900 dark:text-white tabular-nums">{formatCurrency(subtotal - totalDiscount, state.settings.currency)}</span>
            </div>
            {showDiscount && totalDiscount > 0 && (
              <div className="flex justify-between">
                <span className="text-[9px] font-bold text-rose-500 uppercase tracking-widest flex items-center gap-1"><Gift className="w-3 h-3" />{t("discount", "Discount")}</span>
                <span className="text-[11px] font-black text-rose-500 tabular-nums">-{formatCurrency(totalDiscount, state.settings.currency)}</span>
              </div>
            )}
            {taxAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">{t("tax", "Tax")}</span>
                <span className="text-[11px] font-black text-gray-900 dark:text-white tabular-nums">+{formatCurrency(taxAmount, state.settings.currency)}</span>
              </div>
            )}
          </div>

          {/* Net Payable — desktop only */}
          <div className="hidden md:block mt-4 space-y-2">
            <div className="p-5 rounded-[1.5rem] bg-gradient-to-br from-emerald-500 to-teal-600 shadow-xl shadow-emerald-500/20 relative overflow-hidden group transition-all hover:scale-[1.01]">
              <div className="absolute right-3 top-3 opacity-20 group-hover:opacity-40 transition-opacity"><Wallet className="w-14 h-14 text-white rotate-12" /></div>
              <div className="relative z-10 flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-black text-white/60 uppercase tracking-[0.25em]">{t("net_payable", "Net Payable")}</p>
                  <h3 className="text-lg sm:text-xl lg:text-3xl font-black text-white tracking-[-0.05em] leading-none block break-all mt-1">{formatCurrency(finalTotal, state.settings.currency)}</h3>
                </div>
                <div className="px-3 py-1.5 rounded-full bg-white/20 border border-white/10">
                  <p className="text-[9px] font-black text-white uppercase tracking-widest">{totalQty} {t("qty", "QTY")}</p>
                </div>
              </div>
            </div>

            {/* Sale Type Selector (Desktop) */}
            {saleTypes.length > 0 && (
              <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(saleTypes.length, 3)}, minmax(0, 1fr))` }}>
                {saleTypes.map(st => {
                  const Icon = st.icon;
                  return (
                    <button key={st.id} onClick={() => setSaleType(st.id as any)}
                      className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-[9px] font-black uppercase tracking-wide transition-all active:scale-95 touch-manipulation ${saleType === st.id ? 'bg-primary text-white border-primary shadow-sm shadow-emerald-500/20' : 'bg-gray-50 dark:bg-white/[0.03] text-gray-600 border-gray-200 dark:border-white/5 hover:text-gray-600 dark:hover:text-gray-200'}`}>
                      <Icon className="w-3.5 h-3.5" />
                      {t(st.id, st.label)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <ShortcutsModal 
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
      />
    </Modal>
  );
}
