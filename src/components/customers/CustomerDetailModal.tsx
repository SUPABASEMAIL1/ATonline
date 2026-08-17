import { useState, useMemo, useEffect } from 'react';
import { Phone, CreditCard, ShoppingBag, Receipt, MessageCircle, ChevronRight, User } from 'lucide-react';
import { Customer, Sale } from '../../types';
import { useApp } from '../../context/SupabaseAppContext';
import { formatCurrency } from '../../lib/currencies';
import { formatAppDateTime } from '../../lib/dateUtils';
import { Modal } from '../common/Modal';
import { cn } from '../../lib/utils';
import { useTranslation } from '../../hooks/useTranslation';
import { TransactionDetailModal } from '../transactions/TransactionDetailModal';
import { Badge, Button, EmptyState, Pagination, usePagination } from '../../shared/ui';
import { getEffectiveTotal } from '../reports/ReportsManager';

interface CustomerDetailModalProps {
  customer: Customer;
  onClose: () => void;
}

export function CustomerDetailModal({ customer: initialCustomer, onClose }: CustomerDetailModalProps) {
  const { state, dispatch } = useApp();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'details' | 'transactions'>('details');
  const [viewingTransaction, setViewingTransaction] = useState<Sale | null>(null);

  // Always read fresh customer from state
  const customer = useMemo(() =>
    state.customers.find(c => c.id === initialCustomer.id) || initialCustomer,
    [state.customers, initialCustomer]
  );

  const customerTransactions = useMemo(() => {
    return state.sales
      .filter(sale => sale.customerId === customer.id)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [state.sales, customer.id]);

  const totalTransactions = customerTransactions.length;
  const totalSpent = customerTransactions.reduce((sum, sale) => sum + getEffectiveTotal(sale), 0);
  const averageTransaction = totalTransactions > 0 ? totalSpent / totalTransactions : 0;
  const { page: paidPage, totalPages: paidTotalPages, pageItems: paidPageItems, goToPage: goToPaidPage, pageSize: paidPageSize, setPageSize: setPaidPageSize } = usePagination(customerTransactions, 10);

  const footer = (
    <div className="flex items-center justify-end gap-2 sm:gap-3 w-full">
      <Button
        variant="secondary"
        onClick={onClose}
        className="!min-h-0 !ml-auto !px-4 sm:!px-8 !py-2.5 sm:!py-3 !text-[9px] sm:!text-[11px] !font-black !rounded-2xl sm:!rounded-full !border-gray-200 dark:!border-white/10 !shrink-0"
      >
        {t('close')}
      </Button>
    </div>
  );

  const tabs = [
    { id: 'details', label: t('details'), icon: User },
    { id: 'transactions', label: `Sales (${totalTransactions})`, icon: Receipt },
  ];

  return (
    <>
      <Modal isOpen={true} onClose={onClose} title={customer.name} maxWidth="lg" footer={footer}>
        <div className="space-y-6">
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
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
              </div>

              {/* Contact */}
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
                    <Button
                      variant="primary"
                      onClick={() => customer.phone && window.open(`https://wa.me/${customer.phone.replace(/\D/g, '')}`, '_blank')}
                      disabled={!customer.phone}
                      aria-label="Send WhatsApp message"
                      className="!min-h-0 !p-2.5 !rounded-xl !shadow-lg !shadow-emerald-500/20 active:!scale-90 disabled:!opacity-30"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-black/20 rounded-2xl border border-gray-200 dark:border-white/5">
                    <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-1">Address</p>
                    <p className="text-xs font-bold text-gray-900 dark:text-gray-300">{customer.address || 'Not set'}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-[11px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest flex items-center gap-3">
                    <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
                    {t('details')}
                  </h3>
                  <div className="bg-gray-50 dark:bg-black/20 p-6 rounded-[24px] space-y-4">
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-gray-600 text-[9px] font-black uppercase tracking-widest mb-1">Email</p>
                        <p className="text-lg font-black text-gray-900 dark:text-white">{customer.email || 'Not set'}</p>
                      </div>
                    </div>
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-gray-600 text-[9px] font-black uppercase tracking-widest mb-1">Pricing Tier</p>
                        <p className="text-lg font-black text-gray-900 dark:text-white capitalize">{customer.priceTier}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Transactions Tab ── */}
          {activeTab === 'transactions' && (
            <div className="space-y-6">
              {customerTransactions.length > 0 ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {paidPageItems.map((tx) => (
                      <div key={tx.id} onClick={() => setViewingTransaction(tx)} className="p-5 bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/5 rounded-[20px] space-y-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/5 transition-all active:scale-[0.98]">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-[10px] font-black text-gray-900 dark:text-white uppercase">#{tx.invoiceNumber || tx.receiptNumber || 'N/A'}</p>
                            <p className="text-[8px] font-bold text-gray-500 mt-0.5">{formatAppDateTime(tx.timestamp, state.settings.country)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="text-lg font-black text-blue-600">{formatCurrency(tx.total, state.settings.currency)}</p>
                            <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Badge tone="info" size="sm" className="!rounded-lg !text-[8px] !px-2 !py-0.5 !bg-blue-50 dark:!bg-blue-500/10 !text-blue-600 !border-blue-100 dark:!border-blue-500/20">{tx.paymentMethod}</Badge>
                          <Badge tone="success" size="sm" className="!rounded-lg !text-[8px] !px-2 !py-0.5 !bg-emerald-50 dark:!bg-primary/10 !text-primary !border-emerald-100 dark:!border-primary/20">{tx.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                  {paidTotalPages > 1 && (
                    <div className="pt-2 flex justify-center">
                      <Pagination
                        page={paidPage}
                        totalPages={paidTotalPages}
                        onPageChange={goToPaidPage}
                        totalItems={customerTransactions.length}
                        mode="numbered"
                        pageSize={paidPageSize}
                        onPageSizeChange={setPaidPageSize}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState
                  icon={<Receipt className="h-12 w-12 text-gray-500 opacity-20" />}
                  title="No transactions yet"
                  className="!py-16"
                />
              )}
            </div>
          )}
        </div>
      </Modal>

      {viewingTransaction && (
        <TransactionDetailModal
          transaction={viewingTransaction}
          allTransactions={customerTransactions}
          onNavigate={setViewingTransaction}
          onClose={() => setViewingTransaction(null)}
          onReprint={() => {}}
          onBack={() => setViewingTransaction(null)}
        />
      )}
    </>
  );
}
