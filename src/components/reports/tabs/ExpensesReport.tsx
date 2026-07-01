import { XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line, ResponsiveContainer } from 'recharts';
import { TrendingDown, BarChart3, Banknote, CreditCard, Smartphone, Package } from 'lucide-react';
import { formatCurrency } from '../../../lib/currencies';
import { formatAppDate } from '../../../lib/dateUtils';
import { EXPENSE_CATEGORIES } from '../../../types';
import { Expense } from '../../../types';
import { useTranslation } from '../../../hooks/useTranslation';

const CATEGORY_ICONS: Record<string, any> = {
  'Utilities': Banknote, 'Food': Package, 'Fuel': Package, 'Rent': Package,
  'Salaries': Package, 'Supplies': Package, 'Marketing': Package,
  'Maintenance': Package, 'Insurance': Package, 'Taxes': Package, 'Other': Package
};

interface ExpensesReportProps {
  filteredExpenses: Expense[];
  expensesTrendData: { date: string; amount: number; count: number }[];
  expenseCategoryData: { name: string; value: number }[];
  totalExpenseAmount: number;
  currentPage: number;
  itemsPerPage: number;
  currency: string;
  theme: string;
  country: string;
  onLoadMore: () => void;
}

export function ExpensesReport({
  filteredExpenses, expensesTrendData, expenseCategoryData,
  totalExpenseAmount, currentPage, itemsPerPage, currency, theme, country, onLoadMore
}: ExpensesReportProps) {
  const { t } = useTranslation();
  const tooltipStyle = {
    backgroundColor: theme === 'dark' ? '#171717' : 'white',
    border: theme === 'dark' ? '1px solid #333' : '1px solid #e5e7eb',
    borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
    color: theme === 'dark' ? '#fff' : '#000'
  };
  const itemStyle = { color: theme === 'dark' ? '#e5e7eb' : '#374151' };

  return (
    <>
      {/* Wallet Breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        {['cash', 'card', 'digital'].map(method => {
          const walletExpenses = filteredExpenses.filter(e => e.paymentMethod === method).reduce((s, e) => s + Number(e.amount), 0);
          const walletCount = filteredExpenses.filter(e => e.paymentMethod === method).length;
          const config: Record<string, { gradient: string; icon: any }> = {
            cash: { gradient: 'from-emerald-500 to-teal-700', icon: Banknote },
            card: { gradient: 'from-blue-500 to-indigo-700', icon: CreditCard },
            digital: { gradient: 'from-purple-500 to-fuchsia-700', icon: Smartphone },
          };
          const item = config[method];
          const Icon = item.icon;
          return (
            <div key={method} className={`stat-card bg-gradient-to-br ${item.gradient} group`}>
              <div className="stat-card-inner">
                <span className="stat-card-label">{t(method, method)} {t('expenses', 'Expenses')}</span>
                <span className="stat-card-value">{formatCurrency(walletExpenses, currency)}</span>
                <p className="text-[7px] font-black text-white/40 uppercase tracking-[0.2em] mt-1">{walletCount} {t('records', 'entries')}</p>
              </div>
              <Icon className="stat-card-icon" />
            </div>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 flex items-center">
            <TrendingDown className="h-5 w-5 mr-2 text-rose-500" />{t('expense_trend', 'Expense Trend')}
          </h3>
          <ResponsiveContainer width="100%" height={window.innerWidth < 768 ? 240 : 300}>
            <LineChart data={expensesTrendData}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#333' : '#f0f0f0'} />
              <XAxis dataKey="date" stroke={theme === 'dark' ? '#9ca3af' : '#6b7280'} fontSize={12} />
              <YAxis stroke={theme === 'dark' ? '#9ca3af' : '#6b7280'} fontSize={12} />
              <Tooltip formatter={(value: any, name: string) => [name === 'amount' ? formatCurrency(Number(value), currency) : value, name === 'amount' ? t('amount', 'Amount') : t('records', 'Entries')]} contentStyle={tooltipStyle} itemStyle={itemStyle} />
              <Legend />
              <Line type="monotone" dataKey="amount" stroke="#ef4444" strokeWidth={3} name={t('amount', 'Amount')} dot={{ fill: '#ef4444', strokeWidth: 2, r: 4 }} activeDot={{ r: 6, stroke: '#ef4444', strokeWidth: 2 }} />
              <Line type="monotone" dataKey="count" stroke="#f97316" strokeWidth={3} name={t('records', 'Entries')} dot={{ fill: '#f97316', strokeWidth: 2, r: 4 }} activeDot={{ r: 6, stroke: '#f97316', strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 flex items-center">
            <BarChart3 className="h-5 w-5 mr-2 text-rose-500" />{t('expenses_by_category', 'Expenses by Category')}
          </h3>
          <ResponsiveContainer width="100%" height={window.innerWidth < 768 ? 240 : 300}>
            <PieChart>
              <Pie data={expenseCategoryData} cx="50%" cy="50%" labelLine={false} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} outerRadius={100} fill="#ef4444" dataKey="value">
                {expenseCategoryData.map((_, index) => (<Cell key={`cell-${index}`} fill={['#ef4444','#f97316','#fbbf24','#10b981','#3b82f6','#8b5cf6'][index % 6]} />))}
              </Pie>
              <Tooltip formatter={(value: any) => [formatCurrency(Number(value), currency), t('amount', 'Amount')]} contentStyle={tooltipStyle} itemStyle={itemStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Full Ledger */}
      <div className="bg-white dark:bg-surface rounded-3xl border border-gray-200 dark:border-white/10 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-white/10 flex items-center justify-between">
          <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-rose-600" />{t('all_expenses_count', 'All Expenses — {count} Entries').replace('{count}', filteredExpenses.length.toString())}
          </h3>
          <span className="text-xs font-black text-rose-500">{formatCurrency(totalExpenseAmount, currency)}</span>
        </div>

        {/* Desktop Table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 dark:bg-white/[0.02] border-b border-gray-200 dark:border-white/5">
                <th className="px-4 py-3 text-[9px] font-black text-gray-700 dark:text-gray-400 uppercase tracking-widest">{t('date', 'Date')}</th>
                <th className="px-4 py-3 text-[9px] font-black text-gray-700 dark:text-gray-400 uppercase tracking-widest">{t('description', 'Description')}</th>
                <th className="px-4 py-3 text-[9px] font-black text-gray-700 dark:text-gray-400 uppercase tracking-widest">{t('category', 'Category')}</th>
                <th className="px-4 py-3 text-[9px] font-black text-gray-700 dark:text-gray-400 uppercase tracking-widest">{t('payment_method', 'Wallet')}</th>
                <th className="px-4 py-3 text-[9px] font-black text-gray-700 dark:text-gray-400 uppercase tracking-widest text-right">{t('amount', 'Amount')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
              {filteredExpenses.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-600 text-xs">{t('no_expenses_period', 'No expenses in this period')}</td></tr>
              ) : [...filteredExpenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, currentPage * itemsPerPage).map((expense, idx) => (
                <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 text-xs text-gray-600 font-bold">{formatAppDate(expense.date, country)}</td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-bold text-gray-900 dark:text-white">{expense.description}</p>
                    {expense.notes && <p className="text-[9px] text-gray-600 mt-0.5">{expense.notes}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-500/10 text-rose-600 text-[9px] font-black uppercase tracking-wider">
                      {(() => { const Icon = CATEGORY_ICONS[expense.category] || Package; return <Icon className="w-3 h-3" />; })()}
                      {expense.category}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider ${expense.paymentMethod === 'cash' ? 'bg-primary/10 text-primary' : expense.paymentMethod === 'card' ? 'bg-blue-500/10 text-blue-600' : 'bg-purple-500/10 text-purple-600'}`}>
                      {expense.paymentMethod === 'cash' ? <Banknote className="w-3 h-3" /> : expense.paymentMethod === 'card' ? <CreditCard className="w-3 h-3" /> : <Smartphone className="w-3 h-3" />}
                      {t(expense.paymentMethod, expense.paymentMethod)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-black text-rose-600 dark:text-rose-400 text-xs">-{formatCurrency(Number(expense.amount), currency)}</td>
                </tr>
              ))}
            </tbody>
            {filteredExpenses.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 dark:bg-white/[0.04] border-t-2 border-gray-200 dark:border-white/10">
                  <td colSpan={4} className="px-4 py-3 text-[9px] font-black text-gray-600 uppercase tracking-widest">{t('total_entries_count', 'TOTAL ({count} entries)').replace('{count}', filteredExpenses.length.toString())}</td>
                  <td className="px-4 py-3 text-right font-black text-rose-600 dark:text-rose-400 text-sm">-{formatCurrency(totalExpenseAmount, currency)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="lg:hidden divide-y divide-gray-100 dark:divide-white/[0.05]">
          {filteredExpenses.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-600 font-bold uppercase tracking-widest text-[10px]">{t('no_expenses_found', 'No expenses found')}</div>
          ) : [...filteredExpenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, currentPage * itemsPerPage).map((expense, idx) => (
            <div key={idx} className="p-4 active:bg-gray-50 dark:active:bg-white/5 transition-colors">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500">
                    {(() => { const Icon = CATEGORY_ICONS[expense.category] || Package; return <Icon className="w-4 h-4" />; })()}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white leading-tight">{expense.description}</p>
                    <p className="text-[10px] text-gray-600 font-bold">{formatAppDate(expense.date, country)}</p>
                  </div>
                </div>
                <p className="text-base font-black text-rose-600 dark:text-rose-400">-{formatCurrency(Number(expense.amount), currency)}</p>
              </div>
              <div className="flex justify-between items-center mt-3">
                <span className="px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-600 text-[8px] font-black uppercase tracking-widest border border-gray-200/50 dark:border-white/5">{expense.category}</span>
                <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${expense.paymentMethod === 'cash' ? 'text-primary bg-primary/5' : expense.paymentMethod === 'card' ? 'text-blue-500 bg-blue-500/5' : 'text-purple-500 bg-purple-500/5'}`}>
                  {expense.paymentMethod === 'cash' ? <Banknote className="w-3 h-3" /> : expense.paymentMethod === 'card' ? <CreditCard className="w-3 h-3" /> : <Smartphone className="w-3 h-3" />}
                  {t(expense.paymentMethod, expense.paymentMethod)}
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredExpenses.length > currentPage * itemsPerPage && (
          <div className="bg-gray-50/50 dark:bg-white/[0.02] border-t border-gray-200 dark:border-white/10 px-6 py-4 flex items-center justify-center">
            <button onClick={onLoadMore} className="px-6 py-2.5 rounded-xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-[10px] font-black uppercase tracking-widest text-gray-600 dark:text-gray-400 hover:text-primary hover:border-primary/30 active:scale-95 transition-all">
              {t('load_more', 'Load More')}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
