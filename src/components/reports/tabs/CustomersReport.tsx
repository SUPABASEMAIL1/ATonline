import { TrendingUp, Users, DollarSign, ShoppingBag, Star, UserPlus } from 'lucide-react';
import { XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line, ResponsiveContainer } from 'recharts';
import { formatCurrency, getCurrencySymbol } from '../../../lib/currencies';
import { formatAppDate } from '../../../lib/dateUtils';
import { useTranslation } from '../../../hooks/useTranslation';
import { EmptyState, Avatar } from '../../../shared/ui';
import { ExportButton } from '../../../shared/export';
import { useMemo } from 'react';

interface CustomerData {
  id: string;
  name: string;
  totalSpent: number;
  periodSpent?: number;
  lifetimeSpent?: number;
  totalTransactions: number;
  totalItems: number;
  avgTransactionValue: number;
  lastPurchase: Date;
}

interface CustomersReportProps {
  customerData: CustomerData[];
  currency: string;
  theme: string;
  country: string;
}

export function CustomersReport({ customerData, currency, theme, country }: CustomersReportProps) {
  const { t } = useTranslation();
  const tooltipStyle = {
    backgroundColor: theme === 'dark' ? '#171717' : 'white',
    border: theme === 'dark' ? '1px solid #444' : '1px solid #e5e7eb',
    borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
    color: theme === 'dark' ? '#fff' : '#000'
  };

  const totalCustomers = customerData.length;
  const totalSpending = customerData.reduce((sum, c) => sum + c.totalSpent, 0);
  const totalOrders = customerData.reduce((sum, c) => sum + c.totalTransactions, 0);
  const avgOrderValue = totalOrders > 0 ? totalSpending / totalOrders : 0;

  const exportColumns = [
    { key: 'name', label: t('customer', 'Customer') },
    { key: 'totalSpent', label: t('total_spent', 'Total Spent'), format: 'currency' as const },
    { key: 'totalTransactions', label: t('transactions', 'Transactions'), format: 'number' as const },
    { key: 'totalItems', label: t('items_purchased', 'Items Purchased'), format: 'number' as const },
    { key: 'avgTransactionValue', label: t('average_transaction', 'Avg. Transaction'), format: 'currency' as const },
    { key: 'lastPurchase', label: t('last_purchase', 'Last Purchase') },
  ];

  const exportRows = useMemo(() => customerData.map(c => ({
    name: c.name,
    totalSpent: c.periodSpent ?? c.totalSpent,
    totalTransactions: c.totalTransactions,
    totalItems: c.totalItems,
    avgTransactionValue: c.avgTransactionValue,
    lastPurchase: c.lastPurchase ? formatAppDate(c.lastPurchase, country) : '',
  })), [customerData, country]);

  if (!customerData || customerData.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-10 w-10" />}
        title={t("no_insights_found", "No Insights Found")}
        subtext={t("no_insights_desc", "We couldn't find any customer records for the selected period.")}
        className="min-h-[400px] bg-white/50 dark:bg-white/5 rounded-[2.5rem] border border-dashed border-gray-200 dark:border-white/10 p-12"
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Stat Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Customers */}
        <div className="stat-card bg-gradient-to-br from-indigo-500 to-blue-600 group">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t("total_customers", "Total Customers")}</span>
            <span className="stat-card-value">{totalCustomers}</span>
            <div className="flex items-center gap-1 mt-2">
              <span className="px-1.5 py-0.5 rounded-md bg-white/20 text-[8px] font-black text-white uppercase tracking-tighter">{t("lifetime", "Lifetime")}</span>
            </div>
          </div>
          <Users className="stat-card-icon" />
        </div>

        {/* Total Spending */}
        <div className="stat-card bg-gradient-to-br from-emerald-500 to-teal-600 group">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t("period_revenue", "Period Revenue")}</span>
            <span className="stat-card-value">{formatCurrency(totalSpending, currency)}</span>
            <div className="flex items-center gap-1 mt-2">
              <span className="px-1.5 py-0.5 rounded-md bg-white/20 text-[8px] font-black text-white uppercase tracking-tighter">{t("current_range", "Current Range")}</span>
            </div>
          </div>
          <DollarSign className="stat-card-icon" />
        </div>

        {/* Total Orders */}
        <div className="stat-card bg-gradient-to-br from-amber-500 to-orange-600 group">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t("repeat_visits", "Repeat Visits")}</span>
            <span className="stat-card-value">{totalOrders}</span>
            <div className="flex items-center gap-1 mt-2">
              <span className="px-1.5 py-0.5 rounded-md bg-white/20 text-[8px] font-black text-white uppercase tracking-tighter">{t("total_invoices", "Total Invoices")}</span>
            </div>
          </div>
          <ShoppingBag className="stat-card-icon" />
        </div>

        {/* Avg Value */}
        <div className="stat-card bg-gradient-to-br from-rose-500 to-pink-600 group">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t("avg_retention", "Avg. Retention")}</span>
            <span className="stat-card-value">{formatCurrency(avgOrderValue, currency)}</span>
            <div className="flex items-center gap-1 mt-2">
              <span className="px-1.5 py-0.5 rounded-md bg-white/20 text-[8px] font-black text-white uppercase tracking-tighter">{t("per_transaction", "Per Transaction")}</span>
            </div>
          </div>
          <Star className="stat-card-icon" />
        </div>
      </div>
      {/* Customer Spending Chart */}
      <div className="bg-white dark:bg-surface rounded-[2.5rem] border border-gray-200 dark:border-white/5 p-6 shadow-sm">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 flex items-center">
          <TrendingUp className="h-5 w-5 mr-2 text-primary" />{t("top_customer_spending", "Top Customer Spending")}
        </h3>
        <ResponsiveContainer width="100%" height={window.innerWidth < 768 ? 240 : 300}>
          <LineChart data={customerData.slice(0, 10).map(c => ({ name: c.name.length > 15 ? c.name.substring(0, 15) + '...' : c.name, spending: c.totalSpent, transactions: c.totalTransactions }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" stroke={theme === 'dark' ? '#9ca3af' : '#6b7280'} fontSize={12} />
            <YAxis stroke={theme === 'dark' ? '#9ca3af' : '#6b7280'} fontSize={12} />
            <Tooltip formatter={(value: any, name: string) => [name === 'spending' ? formatCurrency(Number(value), currency) : value, name === 'spending' ? t("total_spent", "Total Spent") : t("transactions", "Transactions")]} contentStyle={tooltipStyle} itemStyle={{ color: theme === 'dark' ? '#e5e7eb' : '#4b5563' }} />
            <Legend />
            <Line type="monotone" dataKey="spending" stroke="#10b981" strokeWidth={3} name={t("total_spent", "Total Spent")} dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }} activeDot={{ r: 6, stroke: '#10b981', strokeWidth: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Customer Analytics Table */}
      <div className="bg-white dark:bg-surface rounded-[2.5rem] border border-gray-200 dark:border-white/5 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-white/10 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
            <Users className="h-5 w-5 mr-2 text-primary" />{t("customer_analytics", "Customer Analytics")}
          </h3>
          <ExportButton
            data={exportRows}
            columns={exportColumns}
            title={t('customers_report', 'Customers Report')}
            currencySymbol={getCurrencySymbol(currency)}
            className="!min-h-0 !px-4 !py-2.5 !rounded-xl !text-[10px] !font-black !bg-gray-100 dark:!bg-white/5 !text-gray-600 dark:!text-gray-400 !border-gray-200 dark:!border-white/5 hover:!text-primary"
          />
        </div>

        {/* Desktop Table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-white/[0.02] border-b border-gray-200 dark:border-white/5">
              <tr>
                <th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-400">{t("customer", "Customer")}</th>
                <th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-400">{t("total_spent", "Total Spent")}</th>
                <th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-400 hidden sm:table-cell">{t("transactions", "Transactions")}</th>
                <th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-400 hidden md:table-cell">{t("items_purchased", "Items Purchased")}</th>
                <th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-400 hidden md:table-cell">{t("average_transaction", "Avg. Transaction")}</th>
                <th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-400 hidden lg:table-cell">{t("last_purchase", "Last Purchase")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
              {customerData.map(customer => (
                <tr key={customer.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Avatar name={customer.name} size="sm" shape="square" className="font-bold text-sm rounded-xl from-emerald-500 to-teal-600 mr-3 shadow-sm" />
                        <span className="font-semibold text-gray-900 dark:text-white">{customer.name}</span>
                      </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="font-black text-primary dark:text-emerald-400">
                        {formatCurrency(customer.periodSpent ?? customer.totalSpent, currency)}
                      </span>
                      {customer.lifetimeSpent !== undefined && (
                        <span className="text-[10px] text-gray-500 font-bold uppercase">
                          {t("life", "Life:")} {formatCurrency(customer.lifetimeSpent, currency)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap hidden sm:table-cell"><span className="px-2 py-1 rounded-lg bg-emerald-100 dark:bg-primary/10 text-primary text-[10px] font-black">{customer.totalTransactions}</span></td>
                  <td className="px-6 py-4 whitespace-nowrap hidden md:table-cell"><span className="px-2 py-1 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 text-[10px] font-black">{customer.totalItems}</span></td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-600 dark:text-gray-400 hidden md:table-cell font-bold">{formatCurrency(customer.avgTransactionValue, currency)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-600 dark:text-gray-400 hidden lg:table-cell font-bold">{formatAppDate(customer.lastPurchase, country)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="lg:hidden divide-y divide-gray-100 dark:divide-white/[0.05]">
          {customerData.map(customer => (
            <div key={customer.id} className="p-4 active:bg-gray-50 dark:active:bg-white/5 transition-colors">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                  <Avatar name={customer.name} size="md" shape="square" className="text-sm from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20" />
                  <div>
                    <p className="text-sm font-black text-gray-900 dark:text-white leading-tight">{customer.name}</p>
                    <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">{t("last_seen", "Last seen:")} {formatAppDate(customer.lastPurchase, country)}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <p className="text-base font-black text-primary dark:text-emerald-400">
                    {formatCurrency(customer.periodSpent ?? customer.totalSpent, currency)}
                  </p>
                  {customer.lifetimeSpent !== undefined && (
                    <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">
                      {t("life", "Life:")} {formatCurrency(customer.lifetimeSpent, currency)}
                    </p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <div className="bg-gray-50 dark:bg-white/5 p-2 rounded-xl text-center">
                  <p className="text-[8px] font-black text-gray-600 uppercase mb-0.5">{t("visits", "Visits")}</p>
                  <p className="text-xs font-black text-gray-900 dark:text-white">{customer.totalTransactions}</p>
                </div>
                <div className="bg-gray-50 dark:bg-white/5 p-2 rounded-xl text-center">
                  <p className="text-[8px] font-black text-gray-600 uppercase mb-0.5">{t("items", "Items")}</p>
                  <p className="text-xs font-black text-gray-900 dark:text-white">{customer.totalItems}</p>
                </div>
                <div className="bg-gray-50 dark:bg-white/5 p-2 rounded-xl text-center">
                  <p className="text-[8px] font-black text-gray-600 uppercase mb-0.5">{t("average", "Average")}</p>
                  <p className="text-xs font-black text-gray-900 dark:text-white">{formatCurrency(customer.avgTransactionValue, currency)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
