import { useState, useMemo, useEffect } from 'react';
import { User, Phone, CreditCard, ShoppingBag, Receipt, MessageCircle, Banknote, RefreshCw, CheckCircle2, Save, AlertTriangle, ArrowDownLeft, ArrowUpRight, Wallet, Smartphone, Building2, FileText } from 'lucide-react';
import { Customer } from '../../types';
import { useApp } from '../../context/SupabaseAppContext';
import { formatCurrency, getCurrencySymbol } from '../../lib/currencies';
import { customersService } from '../../lib/services';
import { formatAppDateTime } from '../../lib/dateUtils';
import { sonner } from '../../lib/sonner';
import { Modal } from '../common/Modal';
import { cn } from '../../lib/utils';
import { useTranslation } from '../../hooks/useTranslation';

interface CustomerDetailModalProps {
  customer: Customer;
  onClose: () => void;
}

export function CustomerDetailModal({ customer: initialCustomer, onClose }: CustomerDetailModalProps) {
  const { state, dispatch } = useApp();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'details' | 'transactions' | 'payments'>('details');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'digital'>('cash');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);

  // Always read fresh customer from state so creditUsed updates instantly after payment
  const customer = useMemo(() =>
    state.customers.find(c => c.id === initialCustomer.id) || initialCustomer,
    [state.customers, initialCustomer]
  );

  // Load payment history when payments tab is opened
  useEffect(() => {
    if (activeTab === 'payments') {
      setLoadingPayments(true);
      customersService.getCustomerPayments(customer.id)
        .then(data => setPaymentHistory(data))
        .catch(() => setPaymentHistory([]))
        .finally(() => setLoadingPayments(false));
    }
  }, [activeTab, customer.id]);

  // Reload payment history after a new payment is added
  const refreshPayments = async () => {
    const data = await customersService.getCustomerPayments(customer.id).catch(() => []);
    setPaymentHistory(data);
  };

  const customerTransactions = useMemo(() => {
    return state.sales
      .filter(sale => sale.customerId === customer.id)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [state.sales, customer.id]);

  // Separate credit sales from paid sales
  const creditSales = useMemo(() =>
    customerTransactions.filter(s => s.status === 'credit' || s.paymentMethod === 'credit'),
    [customerTransactions]
  );
  const paidSales = useMemo(() =>
    customerTransactions.filter(s => s.status !== 'credit' && s.paymentMethod !== 'credit'),
    [customerTransactions]
  );

  const totalTransactions = customerTransactions.length;
  const totalSpent = customerTransactions.reduce((sum, sale) => sum + sale.total, 0);
  const averageTransaction = totalTransactions > 0 ? totalSpent / totalTransactions : 0;
  const creditAvailable = Math.max(0, customer.creditLimit - customer.creditUsed);
  const totalCollected = paymentHistory.reduce((sum, p) => sum + (p.amount || 0), 0);

  const handleAddPayment = async () => {
    const amt = parseFloat(paymentAmount);
    if (isNaN(amt) || amt <= 0) {
      sonner.error(t('invalid_amount_error'));
      return;
    }
    if (amt > customer.creditUsed) {
      sonner.error('Amount cannot exceed the outstanding credit balance.');
      return;
    }
    setIsSubmitting(true);
    try {
      const updated = await customersService.recordPayment(customer.id, amt, paymentMethod as any, paymentNotes);
      dispatch({ type: 'UPDATE_CUSTOMER', payload: updated });
      await refreshPayments();
      sonner.success(`✅ ${formatCurrency(amt, state.settings.currency)} received — credit updated!`);
      setShowPaymentModal(false);
      setPaymentAmount('');
      setPaymentNotes('');
    } catch (err) {
      sonner.error(t('payment_failed_error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const footer = (
    <div className="flex items-center justify-between gap-2 sm:gap-3 w-full">
      {customer.creditUsed > 0 && (
        <button
          onClick={() => { setPaymentAmount(String(customer.creditUsed)); setShowPaymentModal(true); }}
          className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2.5 sm:py-3 bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 rounded-2xl sm:rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-widest hover:bg-rose-500/20 transition-all active:scale-95 shrink-0"
        >
          <ArrowDownLeft className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
          <span className="hidden sm:inline">Collect Payment</span>
          <span className="sm:hidden">Collect</span>
        </button>
      )}
      <button
        onClick={onClose}
        className="ml-auto px-4 sm:px-8 py-2.5 sm:py-3 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 text-[9px] sm:text-[11px] font-black uppercase tracking-widest rounded-2xl sm:rounded-full transition-all active:scale-95 shrink-0"
      >
        {t('close')}
      </button>
    </div>
  );

  const paymentFooter = (
    <div className="flex items-center justify-end gap-2 sm:gap-3 w-full">
      <button
        type="button"
        onClick={() => setShowPaymentModal(false)}
        className="px-4 sm:px-6 py-2.5 sm:py-3.5 border border-rose-200 dark:border-rose-900/30 text-[#ff4b6e] hover:bg-rose-50 dark:hover:bg-rose-500/10 text-[9px] sm:text-[11px] font-black uppercase tracking-widest rounded-2xl transition-all active:scale-95 shrink-0"
      >
        {t('discard')}
      </button>
      <button
        onClick={handleAddPayment}
        disabled={isSubmitting || !paymentAmount}
        className="btn btn-md btn-primary flex-1 hover:bg-emerald-700 !py-2.5 sm:!py-3.5 !text-[9px] sm:!text-[11px]"
      >
        {isSubmitting ? <RefreshCw className="h-4 w-4 sm:h-5 sm:w-5 animate-spin shrink-0" /> : <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />}
        <span>{isSubmitting ? 'Saving...' : 'Confirm Receipt'}</span>
      </button>
    </div>
  );

  const tabs = [
    { id: 'details', label: t('details'), icon: User },
    { id: 'transactions', label: `Sales (${totalTransactions})`, icon: Receipt },
    { id: 'payments', label: `Payments`, icon: Wallet },
  ];

  return (
    <>
      <Modal isOpen={true} onClose={onClose} title={customer.name} maxWidth="lg" footer={footer}>
        <div className="space-y-6">

          {/* Outstanding Credit Alert Banner */}
          {customer.creditUsed > 0 && (
            <div className="flex items-center justify-between bg-rose-500/10 border border-rose-500/20 rounded-2xl px-5 py-4 animate-in slide-in-from-top-2">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 bg-rose-500/15 rounded-xl flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-rose-500" />
                </div>
                <div>
                  <p className="text-[9px] font-black text-rose-600/70 dark:text-rose-400/70 uppercase tracking-[0.2em]">
                    Outstanding Credit (Udhaar)
                  </p>
                  <p className="text-2xl font-black text-rose-600 dark:text-rose-400 tabular-nums leading-none">
                    {formatCurrency(customer.creditUsed, state.settings.currency)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setPaymentAmount(String(customer.creditUsed)); setShowPaymentModal(true); }}
                className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-primary active:scale-95 transition-all shadow-lg shadow-emerald-500/30"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Wasool Karo
              </button>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-gray-100 dark:bg-black/75 rounded-2xl">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                  activeTab === tab.id
                    ? 'bg-white dark:bg-surface text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-400'
                )}
              >
                <tab.icon className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* ── Details Tab ── */}
          {activeTab === 'details' && (
            <div className="space-y-8">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-primary/5 border border-primary/10 p-5 rounded-[1.5rem] relative overflow-hidden">
                  <p className="text-primary/60 dark:text-emerald-400/60 text-[9px] font-black uppercase tracking-[0.2em] mb-1">{t('total_spent')}</p>
                  <p className="text-xl font-black text-primary dark:text-emerald-400">{formatCurrency(totalSpent, state.settings.currency)}</p>
                  <ShoppingBag className="absolute -bottom-2 -right-2 h-12 w-12 text-primary/10" />
                </div>
                <div className="bg-blue-500/5 border border-blue-500/10 p-5 rounded-[1.5rem] relative overflow-hidden">
                  <p className="text-blue-600/60 dark:text-blue-400/60 text-[9px] font-black uppercase tracking-[0.2em] mb-1">{t('total_orders')}</p>
                  <p className="text-xl font-black text-blue-600 dark:text-blue-400">{totalTransactions}</p>
                  <Receipt className="absolute -bottom-2 -right-2 h-12 w-12 text-blue-500/10" />
                </div>
                <div className="bg-indigo-500/5 border border-indigo-500/10 p-5 rounded-[1.5rem] relative overflow-hidden">
                  <p className="text-indigo-600/60 dark:text-indigo-400/60 text-[9px] font-black uppercase tracking-[0.2em] mb-1">{t('average_sale')}</p>
                  <p className="text-xl font-black text-indigo-600 dark:text-indigo-400">{formatCurrency(averageTransaction, state.settings.currency)}</p>
                  <CreditCard className="absolute -bottom-2 -right-2 h-12 w-12 text-indigo-500/10" />
                </div>
                <div className="bg-rose-500/5 border border-rose-500/10 p-5 rounded-[1.5rem] relative overflow-hidden">
                  <p className="text-rose-600/60 dark:text-rose-400/60 text-[9px] font-black uppercase tracking-[0.2em] mb-1">Amount Due</p>
                  <p className="text-xl font-black text-rose-600 dark:text-rose-400">{formatCurrency(customer.creditUsed, state.settings.currency)}</p>
                  <Banknote className="absolute -bottom-2 -right-2 h-12 w-12 text-rose-500/10" />
                </div>
              </div>

              {/* Contact + Credit Limit */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h3 className="text-[11px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest flex items-center gap-3">
                    <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
                    {t('contact_info')}
                  </h3>
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-black/20 rounded-2xl border border-gray-200 dark:border-white/5">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                        <Phone className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Phone</p>
                        <p className="text-sm font-black text-gray-900 dark:text-white">{customer.phone || 'Not set'}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => customer.phone && window.open(`https://wa.me/${customer.phone.replace(/\D/g, '')}`, '_blank')}
                      disabled={!customer.phone}
                      className="p-2.5 bg-primary text-white rounded-xl shadow-lg shadow-emerald-500/20 active:scale-90 transition-all disabled:opacity-30"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-black/20 rounded-2xl border border-gray-200 dark:border-white/5">
                    <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-1">Address</p>
                    <p className="text-xs font-bold text-gray-900 dark:text-gray-300">{customer.address || 'Not set'}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-[11px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest flex items-center gap-3">
                    <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
                    {t('credit_lending')}
                  </h3>
                  <div className="bg-rose-500/5 border border-rose-500/10 p-6 rounded-[24px] space-y-4">
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-rose-600/60 dark:text-rose-400/60 text-[9px] font-black uppercase tracking-[0.2em] mb-1">Credit Limit</p>
                        <p className="text-2xl font-black text-rose-600 dark:text-rose-400">{formatCurrency(customer.creditLimit, state.settings.currency)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-gray-600 text-[9px] font-black uppercase tracking-widest mb-1">Available</p>
                        <p className="text-lg font-black text-gray-900 dark:text-white">{formatCurrency(creditAvailable, state.settings.currency)}</p>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={cn("h-full transition-all duration-1000", (customer.creditUsed / (customer.creditLimit || 1)) > 0.8 ? 'bg-rose-500' : 'bg-blue-500')}
                        style={{ width: `${Math.min(100, customer.creditLimit > 0 ? (customer.creditUsed / customer.creditLimit) * 100 : 0)}%` }}
                      />
                    </div>
                    {customer.creditUsed > 0 && (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => { setPaymentAmount(String(customer.creditUsed)); setShowPaymentModal(true); }}
                          className="py-3 bg-primary text-white rounded-full font-black text-[9px] uppercase tracking-widest hover:bg-emerald-700 active:scale-95 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-1.5"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Full — {formatCurrency(customer.creditUsed, state.settings.currency)}
                        </button>
                        <button
                          onClick={() => { setPaymentAmount(''); setShowPaymentModal(true); }}
                          className="py-3 bg-blue-600 text-white rounded-full font-black text-[9px] uppercase tracking-widest hover:bg-blue-700 active:scale-95 transition-all shadow-lg shadow-blue-500/20"
                        >
                          Partial Amount
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Transactions Tab ── */}
          {activeTab === 'transactions' && (
            <div className="space-y-6">
              {/* Unpaid Credit Sales */}
              {creditSales.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Unpaid Credit Sales ({creditSales.length})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {creditSales.map((tx) => (
                      <div key={tx.id} className="p-5 bg-rose-500/5 border border-rose-500/20 rounded-[20px] space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-[10px] font-black text-gray-900 dark:text-white uppercase">#{tx.receiptNumber || 'N/A'}</p>
                            <p className="text-[8px] font-bold text-gray-500 mt-0.5">{formatAppDateTime(tx.timestamp, state.settings.country)}</p>
                          </div>
                          <p className="text-lg font-black text-rose-600 dark:text-rose-400">{formatCurrency(tx.total, state.settings.currency)}</p>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <span className="px-2 py-0.5 bg-rose-100 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 text-[8px] font-black uppercase rounded-lg border border-rose-200 dark:border-rose-500/20">Udhaar / Credit</span>
                          <span className="px-2 py-0.5 bg-orange-50 dark:bg-orange-500/10 text-orange-600 text-[8px] font-black uppercase rounded-lg border border-orange-200/50">Pending</span>
                        </div>
                        <button
                          onClick={() => { setPaymentAmount(String(tx.total)); setShowPaymentModal(true); }}
                          className="w-full py-2 bg-primary/10 text-emerald-700 dark:text-emerald-400 border border-primary/20 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-primary/20 transition-all active:scale-95"
                        >
                          ✓ Collect {formatCurrency(tx.total, state.settings.currency)}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Paid Sales */}
              {paidSales.length > 0 && (
                <div className="space-y-3">
                  {creditSales.length > 0 && (
                    <h4 className="text-[10px] font-black text-primary dark:text-emerald-400 uppercase tracking-widest">
                      Paid Transactions ({paidSales.length})
                    </h4>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {paidSales.map((tx) => (
                      <div key={tx.id} className="p-5 bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/5 rounded-[20px] space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-[10px] font-black text-gray-900 dark:text-white uppercase">#{tx.receiptNumber || 'N/A'}</p>
                            <p className="text-[8px] font-bold text-gray-500 mt-0.5">{formatAppDateTime(tx.timestamp, state.settings.country)}</p>
                          </div>
                          <p className="text-lg font-black text-blue-600">{formatCurrency(tx.total, state.settings.currency)}</p>
                        </div>
                        <div className="flex gap-2">
                          <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 text-[8px] font-black uppercase rounded-lg border border-blue-100 dark:border-blue-500/20">{tx.paymentMethod}</span>
                          <span className="px-2 py-0.5 bg-emerald-50 dark:bg-primary/10 text-primary text-[8px] font-black uppercase rounded-lg border border-emerald-100 dark:border-primary/20">{tx.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {customerTransactions.length === 0 && (
                <div className="text-center py-16 text-gray-500">
                  <Receipt className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="text-[11px] font-black uppercase tracking-widest">No transactions yet</p>
                </div>
              )}
            </div>
          )}

          {/* ── Payments Received Tab ── */}
          {activeTab === 'payments' && (
            <div className="space-y-4">
              {/* Summary banner */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-primary/5 border border-primary/10 p-5 rounded-2xl relative overflow-hidden">
                  <p className="text-[9px] font-black text-primary/60 uppercase tracking-[0.2em] mb-1">Total Collected</p>
                  <p className="text-xl font-black text-primary dark:text-emerald-400">{formatCurrency(totalCollected, state.settings.currency)}</p>
                  <ArrowDownLeft className="absolute -bottom-2 -right-2 h-12 w-12 text-primary/10" />
                </div>
                <div className="bg-rose-500/5 border border-rose-500/10 p-5 rounded-2xl relative overflow-hidden">
                  <p className="text-[9px] font-black text-rose-600/60 uppercase tracking-[0.2em] mb-1">Still Outstanding</p>
                  <p className="text-xl font-black text-rose-600 dark:text-rose-400">{formatCurrency(customer.creditUsed, state.settings.currency)}</p>
                  <AlertTriangle className="absolute -bottom-2 -right-2 h-12 w-12 text-rose-500/10" />
                </div>
              </div>

              {loadingPayments ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-6 w-6 text-blue-500 animate-spin" />
                </div>
              ) : paymentHistory.length === 0 ? (
                <div className="text-center py-16">
                  <Wallet className="h-12 w-12 mx-auto mb-3 text-gray-400 opacity-30" />
                  <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">No payments received yet</p>
                  {customer.creditUsed > 0 && (
                    <button
                      onClick={() => { setPaymentAmount(String(customer.creditUsed)); setShowPaymentModal(true); }}
                      className="mt-4 px-6 py-3 bg-primary text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-primary active:scale-95 transition-all shadow-lg"
                    >
                      Record First Payment
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {paymentHistory.map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between p-4 bg-white dark:bg-black/20 border border-gray-200 dark:border-white/5 rounded-2xl hover:border-primary/20 transition-all group">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                          {(() => {
                            switch (payment.method) {
                              case 'cash': return <Banknote className="h-5 w-5 text-primary" />;
                              case 'card': return <CreditCard className="h-5 w-5 text-blue-500" />;
                              case 'digital': return <Smartphone className="h-5 w-5 text-amber-500" />;
                              case 'bank_transfer': return <Building2 className="h-5 w-5 text-indigo-500" />;
                              case 'cheque': return <FileText className="h-5 w-5 text-rose-500" />;
                              default: return <Wallet className="h-5 w-5 text-purple-500" />;
                            }
                          })()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-gray-900 dark:text-white uppercase">
                              {(() => {
                                switch (payment.method) {
                                  case 'cash': return 'Cash Received';
                                  case 'card': return 'Card Payment';
                                  case 'digital': return 'Digital Wallet';
                                  case 'bank_transfer': return 'Bank Transfer';
                                  case 'cheque': return 'Cheque Received';
                                  default: return `${payment.method} Received`;
                                }
                              })()}
                            </span>
                            <span className="px-2 py-0.5 bg-emerald-100 dark:bg-primary/10 text-emerald-700 dark:text-emerald-400 text-[7px] font-black uppercase rounded-full">
                              Collected
                            </span>
                          </div>
                          <p className="text-[9px] text-gray-500 mt-0.5">
                            {formatAppDateTime(payment.createdAt, state.settings.country)}
                          </p>
                          {payment.notes && (
                            <p className="text-[9px] text-gray-600 dark:text-gray-400 italic mt-0.5">"{payment.notes}"</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-black text-primary dark:text-emerald-400 tabular-nums">
                          +{formatCurrency(payment.amount, state.settings.currency)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Payment Modal */}
      <Modal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        title="Collect Credit Payment"
        maxWidth="sm"
        footer={paymentFooter}
      >
        <div className="space-y-6">
          {/* Outstanding balance */}
          <div className="bg-rose-500/5 border border-rose-500/10 p-6 rounded-[20px] text-center">
            <p className="text-rose-600/60 dark:text-rose-400/60 text-[10px] font-black uppercase tracking-[0.2em] mb-1">Total Amount Due</p>
            <p className="text-3xl font-black text-rose-600 dark:text-rose-400">{formatCurrency(customer.creditUsed, state.settings.currency)}</p>
          </div>

          <div className="space-y-4">
            {/* Amount input */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">Amount Receiving</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-black text-sm">{getCurrencySymbol(state.settings.currency)}</span>
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full bg-[#f8f9fa] dark:bg-black/75 border-2 border-transparent focus:border-primary rounded-xl py-4 pl-12 pr-6 text-2xl font-black text-gray-900 dark:text-white transition-all"
                  placeholder="0.00"
                  max={customer.creditUsed}
                  autoFocus
                />
              </div>
              {/* Quick buttons */}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setPaymentAmount(String(customer.creditUsed))}
                  className="px-3 py-1.5 bg-primary/10 text-emerald-700 dark:text-emerald-400 border border-primary/20 rounded-lg text-[9px] font-black uppercase hover:bg-primary/20 transition-all"
                >
                  Full Amount
                </button>
                {customer.creditUsed >= 2 && (
                  <button
                    onClick={() => setPaymentAmount(String(Math.floor(customer.creditUsed / 2)))}
                    className="px-3 py-1.5 bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20 rounded-lg text-[9px] font-black uppercase hover:bg-blue-500/20 transition-all"
                  >
                    Half ({formatCurrency(Math.floor(customer.creditUsed / 2), state.settings.currency)})
                  </button>
                )}
              </div>
            </div>

            {/* Payment Method */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">Payment Method</label>
              <div className="grid grid-cols-3 sm:grid-cols-3 gap-3">
                {[
                  { id: 'cash', label: 'Cash', icon: Banknote },
                  { id: 'card', label: 'Card', icon: CreditCard },
                  { id: 'digital', label: 'Bank Transfer', icon: Building2 }
                ].map((method) => (
                  <button
                    key={method.id}
                    onClick={() => setPaymentMethod(method.id as any)}
                    className={cn(
                      "flex flex-col items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all duration-200 active:scale-95",
                      paymentMethod === method.id
                        ? 'border-primary bg-primary/10 text-emerald-700 dark:text-emerald-400 shadow-md'
                        : 'border-gray-200 dark:border-white/5 bg-[#f8f9fa] dark:bg-black/20 text-gray-600'
                    )}
                  >
                    <method.icon className="h-5 w-5" />
                    <span className="text-[9px] font-black uppercase tracking-wider">{method.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">Notes (Optional)</label>
              <textarea
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none rounded-xl p-4 text-sm font-medium text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 transition-all h-20 resize-none"
                placeholder="e.g. Partial payment, receipt no. 123..."
              />
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}