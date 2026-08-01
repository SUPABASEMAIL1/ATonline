import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, Wallet, TrendingUp, TrendingDown, Clock, Plus, Check, FileText, Trash2, Phone } from 'lucide-react';
import { SharedSearchBar } from '../../../shared/modules/search-and-list';
import { Supplier } from '../../../types';
import { suppliersService, expensesService, generateId } from '../../../lib/services';
import { formatAppDate, formatAppTime } from '../../../lib/dateUtils';
import { formatCurrency } from '../../../lib/currencies';
import { useApp } from '../../../context/SupabaseAppContext';
import { sonner } from '../../../lib/sonner';
import { X } from 'lucide-react';
import { Modal } from '../../common/Modal';
import { Button, ToggleSwitch, Badge, EmptyState, Pagination, usePagination, Select } from '../../../shared/ui';
import { useTranslation } from '../../../hooks/useTranslation';

interface SupplierLedgerProps {
  supplier: Supplier;
  onBack: () => void;
  startDate?: Date;
  endDate?: Date;
  dateFilter?: string;
}

export function SupplierLedger({ supplier, onBack, startDate, endDate, dateFilter }: SupplierLedgerProps) {
  const { state, dispatch } = useApp();
  const { t } = useTranslation();
  const [ledger, setLedger] = useState<any[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const ITEMS_PER_PAGE = 50;

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showBillModal, setShowBillModal] = useState(false);
  const [formLoading, setFormLoading] = useState(false);

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentNote, setPaymentNote] = useState('');

  const [billAmount, setBillAmount] = useState('');
  const [billNote, setBillNote] = useState('');
  const [isPaymentManualOverride, setIsPaymentManualOverride] = useState(false);
  const [isBillManualOverride, setIsBillManualOverride] = useState(false);
  const loadLedger = async () => {
    try {
      setLoading(true);
      // Fetch all transactions for client-side pagination
      const data = await suppliersService.getLedger(supplier.id, 999999, 0, false);
      setLedger(data);

      const bal = await suppliersService.getBalance(supplier.id);
      setBalance(bal);
    } catch (err) {
      console.error('Failed to load ledger', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLedger();
  }, [supplier.id]);

  const stats = useMemo(() => {
    let totalBilled = 0;
    let totalPaid = 0;
    ledger.forEach(t => {
      if (t.type === 'purchase' || t.type === 'opening_balance') {
        totalBilled += Number(t.credit) || 0;
      } else if (t.type === 'payment') {
        totalPaid += Number(t.debit) || 0;
      }
    });
    return { totalBilled, totalPaid, remaining: totalBilled - totalPaid };
  }, [ledger]);

  const handleMakePayment = () => {
    setPaymentAmount('');
    setPaymentMethod('cash');
    setPaymentNote('');
    setShowPaymentModal(true);
  };

  const submitPayment = async () => {
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) {
      sonner.error('Please enter a valid amount');
      return;
    }

    try {
      setFormLoading(true);
      sonner.loading('Recording payment...');

      await suppliersService.recordPayment({
        supplier_id: supplier.id,
        amount: amount,
        payment_type: paymentMethod,
        note: paymentNote,
        isManualOverride: isPaymentManualOverride,
        overrideBy: isPaymentManualOverride ? (state.currentUser?.id || state.currentUser?.username) : undefined,
      });

      // Automatically generate an Expense for financial reporting
      const newExpense = {
        id: generateId(),
        date: new Date(),
        description: `Supplier Payout: ${supplier.name}`,
        amount: amount,
        category: 'Supplies',
        paymentMethod: paymentMethod,
        notes: `From Supplier Ledger. ${paymentNote ? 'Ref: ' + paymentNote : ''}`,
        addedBy: state.currentUser?.name || state.currentUser?.username || 'Operator',
        createdAt: new Date()
      };
      await expensesService.create(newExpense as any);
      dispatch({ type: 'ADD_EXPENSE', payload: newExpense as any });

      sonner.success('Payment recorded!');
      setShowPaymentModal(false);
      setIsPaymentManualOverride(false);
      loadLedger();
    } catch (err) {
      console.error(err);
      sonner.error('Failed to submit payment.');
    } finally {
      setFormLoading(false);
      sonner.close();
    }
  };

  const handleRecordBill = () => {
    setBillAmount('');
    setBillNote('');
    setShowBillModal(true);
  };

  const submitBill = async () => {
    const amount = Number(billAmount);
    if (!amount || amount <= 0) {
      sonner.error('Please enter a valid amount');
      return;
    }

    try {
      setFormLoading(true);
      sonner.loading('Recording bill...');

      await suppliersService.recordBill({
        supplierId: supplier.id,
        amount: amount,
        note: billNote || 'Manual Bill Entry',
        sourceType: 'manual_bill',
        isManualOverride: isBillManualOverride,
        overrideBy: isBillManualOverride ? (state.currentUser?.id || state.currentUser?.username) : undefined,
      });

      sonner.success('Bill recorded!');
      setShowBillModal(false);
      setIsBillManualOverride(false);
      loadLedger();
    } catch (err) {
      console.error(err);
      sonner.error('Failed to record bill.');
    } finally {
      setFormLoading(false);
      sonner.close();
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    if (state.currentUser?.role !== 'admin') {
      sonner.error('Only administrators can delete transactions.');
      return;
    }

    const { isConfirmed } = await sonner.confirm(
      'Delete Transaction?',
      'This will permanently remove this entry from the ledger and recalculate the balance. This action cannot be undone.'
    );

    if (isConfirmed) {
      try {
        sonner.loading('Deleting transaction...');
        await suppliersService.deleteTransaction(id);
        sonner.dismissAll();
        sonner.success('Transaction deleted!');
        loadLedger();
      } catch (err) {
        console.error(err);
        sonner.error('Failed to delete transaction.');
      } finally {
        sonner.close();
      }
    }
  };

  const filteredLedger = useMemo(() => {
    let result = ledger;
    if (dateFilter && dateFilter !== 'all' && startDate && endDate) {
      result = result.filter(l => {
        const d = new Date(l.date || 0);
        return d >= startDate && d <= endDate;
      });
    }
    if (!searchTerm) return result;
    return result.filter(l =>
      (l.detail || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (l.type || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [ledger, searchTerm, dateFilter, startDate, endDate]);

  const { page, totalPages, pageItems, goToPage } = usePagination(filteredLedger, ITEMS_PER_PAGE);

  const getBadge = (type: string, sourceType?: string) => {
    // Use sourceType for more granular distinction
    if (sourceType === 'auto_purchase') {
      return { label: t('auto_purchase', 'AUTO-PURCHASE'), tone: 'info' as const, cls: '!bg-blue-500/10 !text-blue-400 !border-blue-500/20' };
    }
    switch (type) {
      case 'payment':
        return { label: t('paid', 'PAID'), tone: 'success' as const, cls: '!bg-primary/10 !text-emerald-400 !border-primary/20' };
      case 'opening_balance':
        return { label: t('opening_debt', 'OPENING'), tone: 'info' as const, cls: '!bg-violet-500/10 !text-violet-400 !border-violet-500/20' };
      default:
        return { label: t('manual_bill', 'MANUAL BILL'), tone: 'danger' as const, cls: '!bg-red-500/10 !text-red-400 !border-red-500/20' };
    }
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <Button
          variant="secondary"
          onClick={onBack}
          className="!bg-white dark:!bg-zinc-900 !px-4 !py-2.5 !rounded-xl !shadow-sm !border-gray-200 dark:!border-white/5 !font-black !text-[10px] !text-gray-600 hover:!text-gray-900 dark:hover:!text-white w-full sm:w-auto"
        >
          <ChevronLeft className="h-4 w-4" /> {t('back_to_suppliers', 'Back to Suppliers')}
        </Button>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            variant="danger"
            onClick={handleRecordBill}
            className="flex-1 sm:flex-none !px-5 !py-2.5 !rounded-xl !font-black !text-[11px] !bg-rose-500 hover:!bg-rose-600 !shadow-lg !shadow-rose-500/20"
          >
            <FileText className="h-4 w-4" /> {t('bill', 'Bill')}
          </Button>
          <Button
            variant="primary"
            onClick={handleMakePayment}
            className="flex-1"
          >
            <Plus className="h-4 w-4" /> {t('payment', 'Payment')}
          </Button>
        </div>
      </div>

      {/* Supplier Header Card */}
      <div className="bg-white dark:bg-app rounded-[2rem] p-6 lg:p-8 shadow-2xl border border-gray-200 dark:border-white/5 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-80 h-80 bg-primary/10 rounded-full blur-[100px] -mr-20 -mt-20 pointer-events-none group-hover:bg-primary/15 transition-colors duration-700" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-[80px] -ml-20 -mb-20 pointer-events-none" />

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 border-b border-gray-200 dark:border-white/10 pb-6 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/10 rounded-2xl">
                <Wallet className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white uppercase tracking-tighter leading-none">
                {supplier.name}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 text-[10px] font-black text-gray-600 uppercase tracking-[0.2em]">
              <span className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-primary/50" /> {supplier.phone || t('no_phone', 'No Phone')}</span>
              <span className="hidden sm:block text-white/10">|</span>
              <span className="flex items-center gap-1.5"><Clock className="w-3 h-3 text-indigo-500/50" /> {supplier.paymentTerms || t('standard_terms', 'Standard Terms')}</span>
            </div>
          </div>
          <div className="w-full lg:w-auto text-left lg:text-right bg-black/5 dark:bg-white/5 p-4 lg:p-0 rounded-2xl lg:bg-transparent">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-600 mb-1">{t('outstanding_balance', 'Outstanding Balance')}</p>
            <p className={`text-4xl sm:text-5xl font-black uppercase tracking-tighter drop-shadow-sm ${balance > 0 ? 'text-rose-500' : 'text-primary'}`}>
              {formatCurrency(balance, state.settings.currency)}
            </p>
            {balance <= 0 && (
              <p className="text-[10px] font-black text-primary mt-2 uppercase tracking-[0.2em] flex items-center justify-start lg:justify-end gap-2">
                <Check className="h-4 w-4 bg-primary/20 p-0.5 rounded-full" /> {t('all_settled', 'All Settled')}
              </p>
            )}
          </div>
        </div>

        {/* Stats Grid - Vibrant Gradients */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mt-6">
          <div className="stat-card bg-gradient-to-br from-rose-500 to-rose-700 p-4 sm:p-5 rounded-[1.5rem] shadow-lg shadow-rose-500/20 col-span-1">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70">{t('total_billed', 'Total Billed')}</span>
              <TrendingUp className="h-4 w-4 text-white/40" />
            </div>
            <p className="text-xl sm:text-2xl font-black text-white tracking-tight">{formatCurrency(stats.totalBilled, state.settings.currency)}</p>
          </div>

          <div className="stat-card bg-gradient-to-br from-emerald-500 to-teal-700 p-4 sm:p-5 rounded-[1.5rem] shadow-lg shadow-emerald-500/20 col-span-1">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70">{t('total_paid', 'Total Paid')}</span>
              <TrendingDown className="h-4 w-4 text-white/40" />
            </div>
            <p className="text-xl sm:text-2xl font-black text-white tracking-tight">{formatCurrency(stats.totalPaid, state.settings.currency)}</p>
          </div>

          <div className="stat-card bg-gradient-to-br from-indigo-500 to-blue-700 p-4 sm:p-5 rounded-[1.5rem] shadow-lg shadow-indigo-500/20 col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70">{t('remaining_debt', 'Remaining Debt')}</span>
              <Clock className="h-4 w-4 text-white/40" />
            </div>
            <p className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {formatCurrency(Math.abs(stats?.remaining || 0), state.settings.currency)}
            </p>
          </div>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-3xl overflow-hidden border border-gray-200 dark:border-white/5 shadow-sm">
        <div className="p-4 border-b border-gray-200 dark:border-white/5 flex items-center justify-between gap-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-600">{t('manual_ledger_only', 'Manual Ledger (Bills & Payments Only)')}</p>
          <div className="w-full max-w-xs">
            <SharedSearchBar
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder={t('filter_transactions', 'Filter transactions...')}
            />
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto scrollbar-hide">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-white/[0.02]">
                <th className="px-6 py-4 text-[10px] font-black uppercase text-gray-600 tracking-widest">{t('date', 'Date')}</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-gray-600 tracking-widest">{t('type', 'Type')}</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-gray-600 tracking-widest">{t('description', 'Description')}</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-gray-600 tracking-widest text-right">{t('paid', 'Paid')}</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-gray-600 tracking-widest text-right">{t('bill', 'Bill')}</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-gray-600 tracking-widest text-center">{t('actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-600 font-bold italic animate-pulse">{t('loading_ledger_data', 'Loading ledger data...')}</td>
                </tr>
              ) : filteredLedger.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <EmptyState
                      icon={<Clock className="h-10 w-10 text-gray-600 dark:text-gray-500" />}
                      title={t('no_transactions_yet', 'No transactions yet')}
                      className="py-6"
                    />
                  </td>
                </tr>
              ) : (
                pageItems.map((tx, idx) => {
                  const badge = getBadge(tx.type, tx.sourceType);
                  return (
                    <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-white/[0.01] transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-[11px] font-black text-gray-900 dark:text-white uppercase tracking-tighter">{formatAppDate(tx.date, state.settings.country)}</p>
                        <p className="text-[9px] uppercase font-bold tracking-widest text-gray-600 mt-0.5">{formatAppTime(tx.date, state.settings.country)}</p>
                      </td>
                      <td className="px-6 py-4">
                        <Badge tone={badge.tone} size="sm" className={`${badge.cls} !text-[8px] !px-2 !py-1 !rounded-md`}>
                          {badge.label}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-[11px] font-bold text-gray-900 dark:text-white truncate max-w-[200px]" title={tx.detail}>{tx.detail}</p>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        {tx.type === 'payment' && tx.debit > 0 ? (
                          <span className="text-xs font-black text-primary tracking-tighter">
                            {formatCurrency(tx.debit, state.settings.currency)}
                          </span>
                        ) : <span className="text-gray-600 dark:text-gray-500 opacity-20">—</span>}
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        {tx.type !== 'payment' && tx.credit > 0 ? (
                          <span className="text-xs font-black text-rose-500 tracking-tighter">
                            {formatCurrency(tx.credit, state.settings.currency)}
                          </span>
                        ) : <span className="text-gray-600 dark:text-gray-500 opacity-20">—</span>}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {state.currentUser?.role === 'admin' && (
                          <Button variant="ghost" onClick={() => handleDeleteTransaction(tx.id)} className="!min-h-0 !p-1.5 !rounded-lg !text-gray-600 hover:!text-red-500 active:scale-90">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile List View */}
        <div className="md:hidden divide-y divide-gray-50 dark:divide-white/5">
          {loading ? (
            <div className="p-8 text-center text-gray-600 font-bold animate-pulse uppercase text-[10px] tracking-widest">{t('loading_ledger_data', 'Loading transactions...')}</div>
          ) : filteredLedger.length === 0 ? (
            <EmptyState
              icon={<Clock className="h-8 w-8 text-gray-600 dark:text-gray-500" />}
              title={t('no_transactions_yet', 'No entries found')}
              className="p-10"
            />
          ) : (
            pageItems.map((tx, idx) => {
              const badge = getBadge(tx.type, tx.sourceType);
              return (
                <div key={idx} className="p-4 flex flex-col gap-2 hover:bg-gray-50 dark:hover:bg-white/[0.01]">
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-gray-900 dark:text-white uppercase tracking-tight">
                        {formatAppDate(tx.date, state.settings.country)}
                      </span>
                      <span className="text-[9px] text-gray-600 font-bold uppercase">
                        {formatAppTime(tx.date, state.settings.country)}
                      </span>
                    </div>
                    <Badge tone={badge.tone} size="sm" className={`${badge.cls} !text-[8px] !px-2 !py-0.5 !rounded-md`}>
                      {badge.label}
                    </Badge>
                  </div>

                  <div className="flex justify-between items-center bg-gray-50 dark:bg-white/5 p-2.5 rounded-xl border border-gray-200 dark:border-white/5">
                    <div className="flex flex-col max-w-[60%]">
                      <span className="text-[9px] font-black uppercase tracking-widest text-gray-600 mb-0.5">{t('description', 'Description')}</span>
                      <span className="text-[10px] font-bold text-gray-700 dark:text-gray-300 truncate">{tx.detail}</span>
                    </div>
                    <div className="text-right">
                      {tx.type === 'payment' ? (
                        <div className="flex flex-col items-end">
                          <span className="text-[9px] font-black uppercase tracking-widest text-primary/50 mb-0.5">{t('paid', 'Paid')} (Dr)</span>
                          <span className="text-xs font-black text-primary tracking-tighter">{formatCurrency(tx.debit, state.settings.currency)}</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-end">
                          <span className="text-[9px] font-black uppercase tracking-widest text-rose-500/50 mb-0.5">{t('bill', 'Bill')} (Cr)</span>
                          <span className="text-xs font-black text-rose-500 tracking-tighter">{formatCurrency(tx.credit, state.settings.currency)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {state.currentUser?.role === 'admin' && (
                    <div className="flex justify-end pt-1">
                      <Button
                        variant="danger"
                        onClick={() => handleDeleteTransaction(tx.id)}
                        className="!min-h-0 !bg-rose-500/10 !text-rose-500 hover:!bg-rose-500/10 !px-3 !py-1.5 !rounded-lg !text-[9px] !font-black"
                      >
                        <Trash2 className="w-3 h-3" /> {t('delete_entry', 'Delete Entry')}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {totalPages > 1 && (
          <div className="p-4 sm:p-6 bg-gray-50/50 dark:bg-white/[0.02] border-t border-gray-200 dark:border-white/5 flex justify-center">
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={goToPage}
              totalItems={filteredLedger.length}
              mode="prevNext"
            />
          </div>
        )}
      </div>

      {/* Payment Modal */}
      <Modal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        title={t('record_payment', 'RECORD PAYMENT')}
        subtitle={`${t('settle_debt_for', 'SETTLE DEBT FOR')} ${supplier.name.toUpperCase()}`}
        maxWidth="sm"
        footer={
          <div className="flex items-center justify-end gap-2 sm:gap-3 w-full">
            <Button
              variant="danger"
              onClick={() => setShowPaymentModal(false)}
              className="flex-1 sm:flex-none !bg-transparent !border-rose-100 dark:!border-rose-900/30 !text-rose-500 hover:!bg-rose-50 dark:hover:!bg-rose-500/10 !px-4 sm:!px-6 !py-2.5 sm:!py-3.5 !text-[9px] sm:!text-[10px] !font-black !rounded-2xl shrink-0"
            >
              {t('cancel', 'Cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={submitPayment}
              disabled={formLoading}
              className="flex-1 sm:flex-none sm:min-w-[200px] !py-2.5 sm:!py-3.5 !text-[9px] sm:!text-[11px]"
            >
              {formLoading ? t('processing', 'Recording...') : t('confirm_payment', 'Confirm Payment')}
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          <div className="bg-emerald-50 dark:bg-primary/10 border border-emerald-100 dark:border-primary/20 p-4 rounded-2xl">
            <p className="text-[9px] text-primary font-black uppercase tracking-widest text-center mb-1">{t('outstanding_balance', 'Outstanding Balance')}</p>
            <p className="text-2xl font-black text-primary dark:text-emerald-400 text-center">{formatCurrency(balance, state.settings.currency)}</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest mb-1.5 block ml-1">{t('amount_paid', 'Amount Paid *')}</label>
              <input
                type="number"
                step="0.01"
                className="w-full bg-gray-50 dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-5 py-3.5 focus:ring-2 focus:ring-emerald-500 outline-none font-bold"
                placeholder="0.00"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest mb-1.5 block ml-1">{t('payment_method', 'Payment Method *')}</label>
              <Select
                className="!bg-gray-50 dark:!bg-black/75 !border-none !text-sm !rounded-xl !px-5 !text-gray-900 dark:!text-white !font-bold"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="cash">{t('cash', 'Cash')}</option>
                <option value="card">{t('card', 'Credit/Debit Card')}</option>
                <option value="digital">{t('digital', 'Digital Transfer')}</option>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest mb-1.5 block ml-1">{t('note_reference', 'Note / Reference')}</label>
              <input
                type="text"
                className="w-full bg-gray-50 dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-5 py-3.5 focus:ring-2 focus:ring-emerald-500 outline-none font-bold"
                placeholder="e.g. Cleared invoice #1234"
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
              />
            </div>

            {/* Manual Override Toggle */}
            <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 p-3.5 rounded-xl">
              <div className="flex-1">
                <p className="text-[10px] font-black text-amber-700 dark:text-amber-400 uppercase tracking-widest">{t('manual_override', 'Manual Override')}</p>
                <p className="text-[9px] text-amber-600/70 dark:text-amber-500/60 mt-0.5">{t('override_desc', 'Admin amount correction — logged')}</p>
              </div>
              <ToggleSwitch checked={isPaymentManualOverride} onChange={setIsPaymentManualOverride} color="bg-amber-500" />
            </div>
          </div>
        </div>
      </Modal>

      {/* Bill Modal */}
      <Modal
        isOpen={showBillModal}
        onClose={() => setShowBillModal(false)}
        title={t('record_manual_bill', 'RECORD MANUAL BILL')}
        subtitle={t('add_manual_invoice_amount', 'ADD MANUAL INVOICE AMOUNT TO LEDGER')}
        maxWidth="sm"
        footer={
          <div className="flex items-center justify-end gap-2 sm:gap-3 w-full">
            <Button
              variant="secondary"
              onClick={() => setShowBillModal(false)}
              className="flex-1 sm:flex-none !px-4 sm:!px-6 !py-2.5 sm:!py-3.5 !text-[9px] sm:!text-[10px] !font-black !rounded-2xl !text-gray-600 !border-gray-200 dark:!border-white/10 shrink-0"
            >
              {t('cancel', 'Cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={submitBill}
              disabled={formLoading}
              className="flex-1 sm:flex-none sm:min-w-[200px] !px-4 sm:!px-6 !py-2.5 sm:!py-3.5 !bg-rose-500 hover:!bg-rose-600 !text-[9px] sm:!text-[11px] !font-black !rounded-2xl !shadow-lg !shadow-rose-500/20"
            >
              {formLoading ? t('processing', 'Recording...') : t('record_bill', 'Record Bill')}
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 p-4 rounded-2xl text-center">
            <p className="text-[9px] text-rose-500 font-black uppercase tracking-widest">{t('this_will_increase_balance', 'THIS WILL INCREASE THE OUTSTANDING BALANCE')}</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest mb-1.5 block ml-1">{t('bill_amount', 'Bill Amount *')}</label>
              <input
                type="number"
                step="0.01"
                className="w-full bg-gray-50 dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-5 py-3.5 focus:ring-2 focus:ring-emerald-500 outline-none font-bold"
                placeholder="0.00"
                value={billAmount}
                onChange={(e) => setBillAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest mb-1.5 block ml-1">{t('note_reference', 'Note / Reference')}</label>
              <input
                type="text"
                className="w-full bg-gray-50 dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-5 py-3.5 focus:ring-2 focus:ring-emerald-500 outline-none font-bold"
                placeholder="e.g. Invoice #9988"
                value={billNote}
                onChange={(e) => setBillNote(e.target.value)}
              />
            </div>

            {/* Manual Override Toggle */}
            <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 p-3.5 rounded-xl">
              <div className="flex-1">
                <p className="text-[10px] font-black text-amber-700 dark:text-amber-400 uppercase tracking-widest">{t('manual_override', 'Manual Override')}</p>
                <p className="text-[9px] text-amber-600/70 dark:text-amber-500/60 mt-0.5">{t('override_desc', 'Admin amount correction — logged')}</p>
              </div>
              <ToggleSwitch checked={isBillManualOverride} onChange={setIsBillManualOverride} color="bg-amber-500" />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
