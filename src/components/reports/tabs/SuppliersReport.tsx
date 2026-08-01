import React, { useState, useEffect, useMemo, Fragment } from 'react';
import { Building2, TrendingUp, TrendingDown, Wallet, ChevronDown, ChevronUp } from 'lucide-react';
import { formatCurrency, getCurrencySymbol } from '../../../lib/currencies';
import { formatAppDate } from '../../../lib/dateUtils';
import { useApp } from '../../../context/SupabaseAppContext';
import { suppliersService } from '../../../lib/services';
import { useTranslation } from '../../../hooks/useTranslation';
import { Supplier } from '../../../types';
import { SharedSearchBar } from '../../../shared/modules/search-and-list';
import { Badge } from '../../../shared/ui';
import { ExportButton } from '../../../shared/export';

interface SupplierReportRow {
  supplier: Supplier;
  totalBilled: number;
  totalPaid: number;
  balance: number;
  transactionCount: number;
}

interface SuppliersReportProps {
  currency: string;
  country: string;
}

export function SuppliersReport({ currency, country }: SuppliersReportProps) {
  const { state } = useApp();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SupplierReportRow[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedLedger, setExpandedLedger] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'balance' | 'billed' | 'paid'>('balance');
  const [sortDesc, setSortDesc] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const supplierRows: SupplierReportRow[] = [];
        for (const supplier of state.suppliers) {
          const balance = await suppliersService.getBalance(supplier.id);
          const ledger = await suppliersService.getLedger(supplier.id, 9999, 0, false);
          
          let totalBilled = 0;
          let totalPaid = 0;
          ledger.forEach((tx: any) => {
            totalBilled += Number(tx.credit) || 0;
            totalPaid += Number(tx.debit) || 0;
          });

          supplierRows.push({
            supplier,
            totalBilled,
            totalPaid,
            balance,
            transactionCount: ledger.length,
          });
        }
        setRows(supplierRows);
      } catch (err) {
        console.error('Failed to load supplier report data:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [state.suppliers]);

  const handleExpand = async (supplierId: string) => {
    if (expandedId === supplierId) {
      setExpandedId(null);
      setExpandedLedger([]);
      return;
    }
    setExpandedId(supplierId);
    const ledger = await suppliersService.getLedger(supplierId, 50, 0, false);
    setExpandedLedger(ledger);
  };

  const exportColumns = [
    { key: 'name', label: t('supplier', 'Supplier') },
    { key: 'phone', label: t('phone', 'Phone') },
    { key: 'totalBilled', label: t('total_billed', 'Billed'), format: 'currency' as const },
    { key: 'totalPaid', label: t('total_paid', 'Paid'), format: 'currency' as const },
    { key: 'balance', label: t('balance', 'Balance'), format: 'currency' as const },
    { key: 'transactionCount', label: t('transactions', 'Transactions'), format: 'number' as const },
  ];

  const exportRows = useMemo(() => filteredRows.map(r => ({
    name: r.supplier.name,
    phone: r.supplier.phone || '',
    totalBilled: r.totalBilled,
    totalPaid: r.totalPaid,
    balance: r.balance,
    transactionCount: r.transactionCount,
  })), [filteredRows]);

  const filteredRows = useMemo(() => {
    let result = rows;
    if (searchTerm) {
      result = result.filter(r =>
        r.supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.supplier.phone?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') cmp = a.supplier.name.localeCompare(b.supplier.name);
      else if (sortBy === 'balance') cmp = a.balance - b.balance;
      else if (sortBy === 'billed') cmp = a.totalBilled - b.totalBilled;
      else if (sortBy === 'paid') cmp = a.totalPaid - b.totalPaid;
      return sortDesc ? -cmp : cmp;
    });
    return result;
  }, [rows, searchTerm, sortBy, sortDesc]);

  const totals = useMemo(() => ({
    billed: rows.reduce((s, r) => s + r.totalBilled, 0),
    paid: rows.reduce((s, r) => s + r.totalPaid, 0),
    outstanding: rows.reduce((s, r) => s + r.balance, 0),
    count: rows.length,
  }), [rows]);

  const handleExportCSV = () => {
    const headers = ['Supplier Name', 'Phone', 'Total Billed', 'Total Paid', 'Outstanding Balance', 'Transactions'];
    const csvRows = filteredRows.map(r => [
      r.supplier.name,
      r.supplier.phone || '',
      r.totalBilled.toFixed(2),
      r.totalPaid.toFixed(2),
      r.balance.toFixed(2),
      r.transactionCount.toString(),
    ]);
    const csv = [headers, ...csvRows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `supplier_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sourceBadgeBase = '!rounded !px-1.5 !text-[8px] !tracking-normal';
  const getSourceBadge = (sourceType: string) => {
    if (sourceType === 'auto_purchase') {
      return <Badge className={`${sourceBadgeBase} !bg-blue-500/10 !text-blue-400 dark:!text-blue-400 !border-blue-500/20`}>AUTO</Badge>;
    }
    if (sourceType === 'payment') {
      return <Badge className={`${sourceBadgeBase} !bg-primary/10 !text-emerald-400 dark:!text-emerald-400 !border-primary/20`}>PAID</Badge>;
    }
    if (sourceType === 'opening_balance') {
      return <Badge className={`${sourceBadgeBase} !bg-violet-500/10 !text-violet-400 dark:!text-violet-400 !border-violet-500/20`}>OPENING</Badge>;
    }
    return <Badge tone="danger" className={`${sourceBadgeBase} !bg-red-500/10 !text-red-400 dark:!text-red-400 !border-red-500/20`}>BILL</Badge>;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 bg-gray-200/50 dark:bg-white/[0.03] rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <>
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="stat-card bg-gradient-to-br from-blue-500 to-indigo-700 group">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t('total_billed', 'Total Billed')}</span>
            <span className="stat-card-value">{formatCurrency(totals.billed, currency)}</span>
            <p className="text-[7px] font-black text-white/40 uppercase tracking-[0.2em] mt-1">{totals.count} {t('suppliers', 'suppliers')}</p>
          </div>
          <Building2 className="stat-card-icon" />
        </div>
        <div className="stat-card bg-gradient-to-br from-emerald-500 to-teal-700 group">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t('total_paid', 'Total Paid')}</span>
            <span className="stat-card-value">{formatCurrency(totals.paid, currency)}</span>
          </div>
          <Wallet className="stat-card-icon" />
        </div>
        <div className="stat-card bg-gradient-to-br from-rose-500 to-red-700 group">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t('outstanding', 'Outstanding')}</span>
            <span className="stat-card-value">{formatCurrency(totals.outstanding, currency)}</span>
          </div>
          <TrendingDown className="stat-card-icon" />
        </div>
        <div className="stat-card bg-gradient-to-br from-violet-500 to-purple-700 group">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t('suppliers', 'Suppliers')}</span>
            <span className="stat-card-value">{totals.count}</span>
          </div>
          <TrendingUp className="stat-card-icon" />
        </div>
      </div>

      {/* Search & Export */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1">
          <SharedSearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder={t('search_suppliers', 'Search suppliers...')}
          />
        </div>
        <ExportButton
          data={exportRows}
          columns={exportColumns}
          title={t('supplier_report', 'Supplier Report')}
          filtersSummary={searchTerm ? `${t('search', 'Search')}: ${searchTerm}` : undefined}
          currencySymbol={getCurrencySymbol(currency)}
          className="!min-h-0 !px-5 !py-3 !rounded-xl !text-[10px] !font-black !bg-gray-100 dark:!bg-white/5 !text-gray-600 dark:!text-gray-400 !border-gray-200 dark:!border-white/5 hover:!text-primary"
        />
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#080808] rounded-[2rem] border border-gray-200 dark:border-white/5 overflow-hidden">
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 dark:bg-white/[0.02] border-b border-gray-200 dark:border-white/5">
                {[
                  { key: 'name' as const, label: t('supplier', 'Supplier') },
                  { key: 'billed' as const, label: t('total_billed', 'Billed') },
                  { key: 'paid' as const, label: t('total_paid', 'Paid') },
                  { key: 'balance' as const, label: t('balance', 'Balance') },
                ].map(col => (
                  <th
                    key={col.key}
                    onClick={() => { setSortBy(col.key); setSortDesc(sortBy === col.key ? !sortDesc : true); }}
                    className="px-6 py-4 text-[9px] font-black text-gray-600 uppercase tracking-[0.2em] cursor-pointer hover:text-primary transition-colors select-none"
                  >
                    <span className="flex items-center gap-1">
                      {col.label}
                      {sortBy === col.key && (sortDesc ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />)}
                    </span>
                  </th>
                ))}
                <th className="px-6 py-4 text-[9px] font-black text-gray-600 uppercase tracking-[0.2em] text-center">{t('actions', 'Details')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500 text-sm font-bold">{t('no_suppliers', 'No suppliers found')}</td>
                </tr>
              ) : (
                filteredRows.map(row => (
                  <Fragment key={row.supplier.id}>
                    <tr className="hover:bg-gray-50 dark:hover:bg-white/[0.01] transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-[11px] font-black text-gray-900 dark:text-white uppercase">{row.supplier.name}</p>
                        <p className="text-[9px] text-gray-500 mt-0.5">{row.supplier.phone || '—'}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[12px] font-black text-red-500 tabular-nums">{formatCurrency(row.totalBilled, currency)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[12px] font-black text-emerald-500 tabular-nums">{formatCurrency(row.totalPaid, currency)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-[12px] font-black tabular-nums ${row.balance > 0 ? 'text-rose-500' : 'text-primary'}`}>
                          {formatCurrency(row.balance, currency)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Button
                          variant="ghost"
                          onClick={() => handleExpand(row.supplier.id)}
                          icon={expandedId === row.supplier.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          className="!min-h-0 !px-3 !py-1.5 !rounded-lg !text-[9px] !font-black !bg-gray-100 dark:!bg-white/5 !text-gray-600 hover:!text-primary !hover:bg-gray-100 dark:!hover:bg-white/5"
                        />
                      </td>
                    </tr>
                    {expandedId === row.supplier.id && (
                      <tr key={`${row.supplier.id}-detail`}>
                        <td colSpan={5} className="px-6 py-4 bg-gray-50/50 dark:bg-white/[0.01]">
                          <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                            {expandedLedger.length === 0 ? (
                              <p className="text-center text-gray-500 text-[10px] font-bold py-4">{t('no_transactions', 'No transactions')}</p>
                            ) : (
                              expandedLedger.map((tx: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between p-3 bg-white dark:bg-black/20 rounded-xl border border-gray-200 dark:border-white/5">
                                  <div className="flex items-center gap-3">
                                    {getSourceBadge(tx.sourceType)}
                                    <div>
                                      <p className="text-[10px] font-bold text-gray-900 dark:text-white">{tx.detail}</p>
                                      <p className="text-[9px] text-gray-500">{formatAppDate(tx.date, country)}</p>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    {tx.credit > 0 && <p className="text-[11px] font-black text-red-500">+{formatCurrency(tx.credit, currency)}</p>}
                                    {tx.debit > 0 && <p className="text-[11px] font-black text-emerald-500">-{formatCurrency(tx.debit, currency)}</p>}
                                    {tx.isManualOverride && <span className="text-[8px] font-black text-amber-500 uppercase">Override</span>}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden divide-y divide-gray-100 dark:divide-white/5">
          {filteredRows.length === 0 ? (
            <div className="p-12 text-center text-gray-500 text-sm font-bold">{t('no_suppliers', 'No suppliers found')}</div>
          ) : (
            filteredRows.map(row => (
              <div key={row.supplier.id} className="p-4">
                <button onClick={() => handleExpand(row.supplier.id)} className="w-full text-left">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-[11px] font-black text-gray-900 dark:text-white uppercase">{row.supplier.name}</p>
                      <p className="text-[9px] text-gray-500 mt-0.5">{row.supplier.phone || '—'}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-black tabular-nums ${row.balance > 0 ? 'text-rose-500' : 'text-primary'}`}>
                        {formatCurrency(row.balance, currency)}
                      </p>
                      <p className="text-[8px] text-gray-500 uppercase tracking-widest">{t('balance', 'Balance')}</p>
                    </div>
                  </div>
                  <div className="flex gap-4 mt-2">
                    <span className="text-[9px] text-red-400 font-bold">{t('billed', 'Billed')}: {formatCurrency(row.totalBilled, currency)}</span>
                    <span className="text-[9px] text-emerald-400 font-bold">{t('paid', 'Paid')}: {formatCurrency(row.totalPaid, currency)}</span>
                  </div>
                </button>
                {expandedId === row.supplier.id && (
                  <div className="mt-3 space-y-2">
                    {expandedLedger.map((tx: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-white/[0.02] rounded-xl">
                        <div className="flex items-center gap-2">
                          {getSourceBadge(tx.sourceType)}
                          <span className="text-[9px] text-gray-700 dark:text-gray-300 font-bold truncate max-w-[120px]">{tx.detail}</span>
                        </div>
                        <span className={`text-[10px] font-black tabular-nums ${tx.credit > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                          {tx.credit > 0 ? `+${formatCurrency(tx.credit, currency)}` : `-${formatCurrency(tx.debit, currency)}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
