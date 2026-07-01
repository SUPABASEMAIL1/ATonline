import { useMemo } from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line, ResponsiveContainer } from 'recharts';
import { TrendingUp, ShoppingCart, DollarSign, BarChart3, Wallet, ShoppingBag, Receipt, PieChart as PieIcon } from 'lucide-react';
import { formatCurrency } from '../../../lib/currencies';
import { formatAppDateTime } from '../../../lib/dateUtils';
import { Sale } from '../../../types';
import { useTranslation } from '../../../hooks/useTranslation';

interface SalesReportProps {
  filteredSales: Sale[];
  paginatedSales: Sale[];
  salesData: { date: string; sales: number; transactions: number }[];
  categoryData: { name: string; value: number }[];
  saleTypeData: { name: string; value: number }[];
  topProducts: { name: string; quantity: number; revenue: number }[];
  featureAnalytics: {
    serviceRevenue: number;
    productRevenue: number;
    modifiersRevenue: number;
    topVariants: { name: string; quantity: number; revenue: number }[];
  };
  totalRevenue: number;
  totalTransactions: number;
  averageTransaction: number;
  totalCostOfGoods: number;
  grossProfit: number;
  totalExpenseAmount: number;
  netProfit: number;
  walletStats: {
    method: string;
    sales: number;
    expenses: number;
    net: number;
    retailSales: number;
    wholesaleSales: number;
    estoreSales: number;
    collections: number;
  }[];
  currency: string;
  theme: string;
  country: string;
  users: any[];
  retailEnabled?: boolean;
  wholesaleEnabled: boolean;
  estoreEnabled: boolean;
  onLoadMore: () => void;
  creditSalesTotal?: number;
  creditSalesCount?: number;
  creditCollectedTotal?: number;
  creditCollectedCount?: number;
}

const COLORS = ['#2563EB', '#059669', '#D97706', '#DC2626', '#7C3AED', '#EC4899'];

export function SalesReport({
  filteredSales, paginatedSales, salesData, categoryData, saleTypeData, topProducts, featureAnalytics,
  totalRevenue, totalTransactions, averageTransaction, totalCostOfGoods, grossProfit,
  totalExpenseAmount, netProfit, walletStats, currency, theme, country, users,
  retailEnabled = true, wholesaleEnabled, estoreEnabled, onLoadMore,
  creditSalesTotal = 0, creditSalesCount = 0, creditCollectedTotal = 0, creditCollectedCount = 0
}: SalesReportProps) {
  const { t } = useTranslation();
  const tooltipStyle = {
    backgroundColor: theme === 'dark' ? '#171717' : 'white',
    border: theme === 'dark' ? '1px solid #333' : '1px solid #e5e7eb',
    borderRadius: '12px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    color: theme === 'dark' ? '#fff' : '#000'
  };
  const itemStyle = { color: theme === 'dark' ? '#e5e7eb' : '#374151' };

  const { retailVol, retailCount, wholesaleVol, wholesaleCount, estoreVol, estoreCount } = useMemo(() => {
    let rVol = 0, rCount = 0;
    let wVol = 0, wCount = 0;
    let eVol = 0, eCount = 0;

    filteredSales.forEach(s => {
      if (s.status === 'completed' || s.status === 'credit') {
        const type = s.saleType || 'retail';
        if (type === 'retail') {
          rVol += s.total;
          rCount++;
        } else if (type === 'wholesale') {
          wVol += s.total;
          wCount++;
        } else if (type === 'estore') {
          eVol += s.total;
          eCount++;
        }
      }
    });

    return {
      retailVol: rVol,
      retailCount: rCount,
      wholesaleVol: wVol,
      wholesaleCount: wCount,
      estoreVol: eVol,
      estoreCount: eCount
    };
  }, [filteredSales]);

  return (
    <>
      {/* Summary Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7 gap-3 lg:gap-4 animate-in fade-in duration-500">
        <div className="stat-card bg-gradient-to-br from-emerald-500 to-teal-700">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t("total_revenue", "Total Revenue")}</span>
            <span className="stat-card-value">{formatCurrency(totalRevenue, currency)}</span>
          </div>
          <TrendingUp className="stat-card-icon" />
        </div>
        <div className="stat-card bg-gradient-to-br from-blue-500 to-indigo-700">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t("transactions", "Transactions")}</span>
            <span className="stat-card-value">{totalTransactions}</span>
          </div>
          <ShoppingCart className="stat-card-icon" />
        </div>
        <div className="stat-card bg-gradient-to-br from-violet-500 to-purple-600">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t("average_transaction", "Avg Transaction")}</span>
            <span className="stat-card-value">{formatCurrency(averageTransaction, currency)}</span>
          </div>
          <TrendingUp className="stat-card-icon" />
        </div>
        <div className="stat-card bg-gradient-to-br from-orange-500 to-amber-600">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t("cogs_product_cost", "COGS (Product Cost)")}</span>
            <span className="stat-card-value">{formatCurrency(totalCostOfGoods, currency)}</span>
          </div>
          <DollarSign className="stat-card-icon" />
        </div>
        <div className="stat-card bg-gradient-to-br from-cyan-500 to-teal-600">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t("gross_profit", "Gross Profit")}</span>
            <span className="stat-card-value">{formatCurrency(grossProfit, currency)}</span>
            <p className="text-[7px] font-black text-white/40 uppercase tracking-widest mt-1">{t("rev_minus_cost", "Rev - Cost")}</p>
          </div>
          <BarChart3 className="stat-card-icon" />
        </div>
        <div className="stat-card bg-gradient-to-br from-rose-500 to-red-600">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t("expenses", "Expenses")}</span>
            <span className="stat-card-value">{formatCurrency(totalExpenseAmount, currency)}</span>
          </div>
          <Wallet className="stat-card-icon" />
        </div>
        <div className="stat-card bg-gradient-to-br from-amber-500 to-orange-600">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t("net_profit", "Net Profit")}</span>
            <span className="stat-card-value">{formatCurrency(netProfit, currency)}</span>
            <p className="text-[7px] font-black text-white/40 uppercase tracking-widest mt-1">{t("gp_minus_expenses", "GP - EXP")}</p>
          </div>
          <PieChart className="stat-card-icon" />
        </div>
      </div>

      {/* Sale Mode KPI Cards */}
      {(wholesaleEnabled || estoreEnabled) && (
        <div className="mt-6">
          <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
            {t("sale_mode_performance", "Sale Mode Performance")}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(retailEnabled ?? true) && (
              <div className="p-5 rounded-3xl border border-blue-500/20 bg-blue-500/5 shadow-sm relative overflow-hidden group hover:border-blue-500/40 transition-all">
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-500 to-indigo-600 opacity-10 rounded-bl-full group-hover:scale-110 transition-transform duration-500" />
                <div className="relative z-10 space-y-1">
                  <span className="text-[10px] font-black text-blue-600/70 uppercase tracking-widest">{t("retail_sales", "Retail Sales")} ({retailCount})</span>
                  <p className="text-2xl font-black text-blue-600">{formatCurrency(retailVol, currency)}</p>
                  <p className="text-[9px] font-bold text-gray-500 mt-2">{t("retail_sales_desc", "Direct sales to walk-in or retail customers")}</p>
                </div>
              </div>
            )}
            {wholesaleEnabled && (
              <div className="p-5 rounded-3xl border border-purple-500/20 bg-purple-500/5 shadow-sm relative overflow-hidden group hover:border-purple-500/40 transition-all">
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-purple-500 to-pink-600 opacity-10 rounded-bl-full group-hover:scale-110 transition-transform duration-500" />
                <div className="relative z-10 space-y-1">
                  <span className="text-[10px] font-black text-purple-600/70 uppercase tracking-widest">{t("wholesale_sales", "Wholesale Sales")} ({wholesaleCount})</span>
                  <p className="text-2xl font-black text-purple-600">{formatCurrency(wholesaleVol, currency)}</p>
                  <p className="text-[9px] font-bold text-gray-500 mt-2">{t("wholesale_sales_desc", "Bulk orders to businesses and vendors")}</p>
                </div>
              </div>
            )}
            {estoreEnabled && (
              <div className="p-5 rounded-3xl border border-pink-500/20 bg-pink-500/5 shadow-sm relative overflow-hidden group hover:border-pink-500/40 transition-all">
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-pink-500 to-rose-600 opacity-10 rounded-bl-full group-hover:scale-110 transition-transform duration-500" />
                <div className="relative z-10 space-y-1">
                  <span className="text-[10px] font-black text-pink-600/70 uppercase tracking-widest">{t("estore_sales", "E-Store Sales")} ({estoreCount})</span>
                  <p className="text-2xl font-black text-pink-600">{formatCurrency(estoreVol, currency)}</p>
                  <p className="text-[9px] font-bold text-gray-500 mt-2">{t("estore_sales_desc", "Online e-commerce platform orders")}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Credit & Ledger Summaries */}
      {(creditSalesTotal > 0 || creditCollectedTotal > 0) && (
        <div className="mt-6">
          <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
            {t("credit_ledger_summary", "Credit & Collections Summary")}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-5 rounded-3xl border border-rose-500/20 bg-rose-500/5 shadow-sm relative overflow-hidden group hover:border-rose-500/40 transition-all">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-rose-500 to-red-600 opacity-10 rounded-bl-full group-hover:scale-110 transition-transform duration-500" />
              <div className="relative z-10 space-y-1">
                <span className="text-[10px] font-black text-rose-600/70 uppercase tracking-widest">{t("credit_sales_given", "Credit Sales Given")} ({creditSalesCount})</span>
                <p className="text-2xl font-black text-rose-600">{formatCurrency(creditSalesTotal, currency)}</p>
                <p className="text-[9px] font-bold text-gray-500 mt-2">{t("credit_sales_desc", "Value of goods sold on credit (Pending collection)")}</p>
              </div>
            </div>
            <div className="p-5 rounded-3xl border border-primary/20 bg-primary/5 shadow-sm relative overflow-hidden group hover:border-primary/40 transition-all">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-emerald-500 to-teal-600 opacity-10 rounded-bl-full group-hover:scale-110 transition-transform duration-500" />
              <div className="relative z-10 space-y-1">
                <span className="text-[10px] font-black text-primary/70 uppercase tracking-widest">{t("credit_collected", "Credit Collected")} ({creditCollectedCount})</span>
                <p className="text-2xl font-black text-primary">{formatCurrency(creditCollectedTotal, currency)}</p>
                <p className="text-[9px] font-bold text-gray-500 mt-2">{t("credit_collected_desc", "Money received from previous credit sales")}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Wallet Net Balances */}
      <div className="mt-8">
        <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
          {t("expected_wallet_balances", "Expected Wallet Balances (Sales − Expenses)")}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6">
          {walletStats.map(wallet => (
            <div key={wallet.method} className={`p-5 rounded-3xl border border-white/10 shadow-xl transition-all group overflow-hidden relative ${
                wallet.method === 'cash' ? 'bg-gradient-to-br from-emerald-500 to-teal-700' :
                wallet.method === 'card' ? 'bg-gradient-to-br from-blue-500 to-indigo-700' :
                'bg-gradient-to-br from-cyan-600 to-blue-800'
              }`}>
              <div className="absolute top-0 right-0 w-24 h-24 opacity-20 transition-opacity group-hover:opacity-40 bg-white"></div>
              <div className="space-y-3 relative z-10 text-white">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-white uppercase tracking-wider">{t(wallet.method, wallet.method).replace('_', ' ')}</span>
                  <span className="text-[8px] font-black uppercase tracking-widest bg-white/20 px-1.5 py-0.5 rounded-md">Wallet</span>
                </div>
                
                <div className="space-y-1.5">
                  <div className="flex justify-between items-end">
                    <span className="text-[9px] font-black text-white/60 uppercase tracking-widest">{t("sales", "Sales")}</span>
                    <span className="text-xs font-black text-white">+{formatCurrency(wallet.sales, currency)}</span>
                  </div>
                  
                  {/* Sub-breakdown by Sale Mode */}
                  <div className="pl-2 border-l border-white/10 space-y-0.5 text-[8px] text-white/70 font-bold">
                    {(retailEnabled ?? true) && (wallet.retailSales > 0 || (wallet.retailSales === 0 && wallet.wholesaleSales === 0 && wallet.estoreSales === 0)) && (
                      <div className="flex justify-between items-center">
                        <span className="opacity-80">{t("retail", "Retail")}</span>
                        <span>{formatCurrency(wallet.retailSales, currency)}</span>
                      </div>
                    )}
                    {wholesaleEnabled && wallet.wholesaleSales > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="opacity-80">{t("wholesale", "Wholesale")}</span>
                        <span>{formatCurrency(wallet.wholesaleSales, currency)}</span>
                      </div>
                    )}
                    {estoreEnabled && wallet.estoreSales > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="opacity-80">{t("estore", "E-Store")}</span>
                        <span>{formatCurrency(wallet.estoreSales, currency)}</span>
                      </div>
                    )}
                    {wallet.collections > 0 && (
                      <div className="flex justify-between items-center text-emerald-200">
                        <span className="opacity-90">{t("collections", "Collections")}</span>
                        <span>+{formatCurrency(wallet.collections, currency)}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-end">
                    <span className="text-[9px] font-black text-white/60 uppercase tracking-widest">{t("expenses", "Expenses")}</span>
                    <span className="text-xs font-black text-white/90">− {formatCurrency(wallet.expenses, currency)}</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-white/10 flex justify-between items-end">
                  <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">{t("expected", "EXPECTED")}</span>
                  <span className="text-xl font-black text-white">{formatCurrency(wallet.net, currency)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 flex items-center">
            <TrendingUp className="h-5 w-5 mr-2 text-primary" />{t("sales_trend", "Sales Trend")}
          </h3>
          <ResponsiveContainer width="100%" height={window.innerWidth < 768 ? 240 : 300}>
            <LineChart data={salesData}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#333' : '#f0f0f0'} />
              <XAxis dataKey="date" stroke={theme === 'dark' ? '#9ca3af' : '#6b7280'} fontSize={12} />
              <YAxis stroke={theme === 'dark' ? '#9ca3af' : '#6b7280'} fontSize={12} />
              <Tooltip formatter={(value: any, name: string) => [name === 'sales' ? formatCurrency(Number(value), currency) : value, name === 'sales' ? t("sales", "Sales") : t("transactions", "Transactions")]} contentStyle={tooltipStyle} itemStyle={itemStyle} />
              <Legend />
              <Line type="monotone" dataKey="sales" stroke="#10b981" strokeWidth={3} name={t("sales", "Sales")} dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="transactions" stroke="#059669" strokeWidth={3} name={t("transactions", "Transactions")} dot={{ fill: '#059669', strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Feature Analytics (Services vs Products vs Modifiers) */}
        <div className="card p-6 border border-primary/20 shadow-emerald-500/5">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 flex items-center">
            <PieIcon className="h-5 w-5 mr-2 text-indigo-500" />{t("revenue_by_item_type", "Revenue By Item Type")}
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={[
                  { name: t("physical_products", "Physical Products"), value: featureAnalytics.productRevenue },
                  { name: t("services", "Services"), value: featureAnalytics.serviceRevenue },
                  { name: t("modifiers_addons", "Modifiers & Add-ons"), value: featureAnalytics.modifiersRevenue }
                ].filter(d => d.value > 0)}
                cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value"
              >
                {[
                  { name: t("physical_products", "Physical Products"), value: featureAnalytics.productRevenue },
                  { name: t("services", "Services"), value: featureAnalytics.serviceRevenue },
                  { name: t("modifiers_addons", "Modifiers & Add-ons"), value: featureAnalytics.modifiersRevenue }
                ].filter(d => d.value > 0).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={['#3B82F6', '#8B5CF6', '#EC4899'][index % 3]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: any) => formatCurrency(Number(value), currency)} contentStyle={tooltipStyle} itemStyle={itemStyle} />
              <Legend verticalAlign="bottom" height={36} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 flex items-center">
            <BarChart3 className="h-5 w-5 mr-2 text-primary" />{t("sales_by_category", "Sales by Category")}
          </h3>
          <ResponsiveContainer width="100%" height={window.innerWidth < 768 ? 240 : 300}>
            <PieChart>
              <Pie data={categoryData} cx="50%" cy="50%" labelLine={false} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} outerRadius={100} fill="#10b981" dataKey="value">
                {categoryData.map((_, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
              </Pie>
              <Tooltip formatter={(value: any) => [formatCurrency(Number(value), currency), t("revenue", "Revenue")]} contentStyle={tooltipStyle} itemStyle={itemStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Top Variants */}
        {featureAnalytics.topVariants.length > 0 && (
          <div className="card p-6 border border-purple-500/20 shadow-purple-500/5">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 flex items-center">
              <ShoppingBag className="h-5 w-5 mr-2 text-purple-500" />{t("top_selling_variants", "Top Selling Variants")}
            </h3>
            <div className="space-y-4">
              {featureAnalytics.topVariants.map((variant, index) => (
                <div key={index} className="flex justify-between items-center p-3 hover:bg-gray-50 dark:hover:bg-white/5 rounded-xl transition-colors">
                  <div className="flex flex-col">
                    <span className="font-medium text-gray-900 dark:text-white text-sm">{variant.name}</span>
                    <span className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">{variant.quantity} {t("sold", "sold")}</span>
                  </div>
                  <span className="font-bold text-primary dark:text-emerald-400 text-sm">
                    {formatCurrency(variant.revenue, currency)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sale Type Breakdown */}
      {(wholesaleEnabled || estoreEnabled) && saleTypeData.length > 0 && (
        <div className="card p-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 flex items-center">
            <ShoppingBag className="h-5 w-5 mr-2 text-blue-600" />{t("sale_type_breakdown", "Sale Type Breakdown")}
          </h3>
          <div className="flex flex-col lg:flex-row items-center gap-8">
            <div className="w-full lg:w-1/2 h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={saleTypeData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                    {saleTypeData.map((_, index) => (<Cell key={`cell-${index}`} fill={['#3b82f6', '#8b5cf6', '#ec4899'][index % 3]} />))}
                  </Pie>
                  <Tooltip formatter={(val: number) => formatCurrency(val, currency)} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', backgroundColor: theme === 'dark' ? '#171717' : 'white', color: theme === 'dark' ? '#fff' : '#000' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full lg:w-1/2 space-y-3">
              {saleTypeData.map((type, index) => (
                <div key={type.name} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-transparent hover:border-gray-200 dark:hover:border-white/10 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ['#3b82f6', '#8b5cf6', '#ec4899'][index % 3] }} />
                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300 capitalize">{t(type.name, type.name)}</span>
                  </div>
                  <span className="font-black text-gray-900 dark:text-white">{formatCurrency(type.value, currency)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sales History Table */}
      <div className="card shadow-xl border-none bg-white dark:bg-surface overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white flex items-center">
            <Receipt className="h-5 w-5 mr-3 text-primary" />{t("detailed_sales_history", "Detailed Sales History")}
          </h3>
          <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest bg-gray-50 dark:bg-black/75 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/5">
            {filteredSales.length} {t("total_sales", "Total Records")}
          </span>
        </div>

        {/* Desktop Table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50/50 dark:bg-white/[0.02] border-b border-gray-200 dark:border-white/5">
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-400">{t("order_ref", "Order Ref")}</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-400">{t("date_time", "Date & Time")}</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-400">{t("customer_details", "Customer Details")}</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-400">{t("cashier", "Cashier")}</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-400 text-right">{t("revenue", "Revenue")}</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-400 text-center">{t("status", "Status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {filteredSales.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-600 font-bold uppercase tracking-widest text-xs">{t("no_transactions_found_period", "No transactions found for the selected period.")}</td></tr>
              ) : paginatedSales.map(sale => (
                <tr key={sale.id} className="group hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4"><span className="text-sm font-black text-primary dark:text-emerald-400 uppercase tracking-tighter">{sale.invoiceNumber}</span></td>
                  <td className="px-6 py-4 text-xs text-gray-600 dark:text-gray-400 font-bold">{formatAppDateTime(sale.timestamp, country)}</td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{sale.customerName || t("walk_in_customer", "Walk-in Customer")}</p>
                    <p className="text-[10px] text-gray-600 uppercase font-black">{t(sale.paymentMethod, sale.paymentMethod)} {t("payment", "Payment")}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-xs font-bold text-gray-700 dark:text-gray-300 leading-tight">{sale.cashier}</p>
                    <p className="text-[9px] font-black text-primary dark:text-emerald-400 uppercase tracking-widest mt-0.5">@{(users.find((u: any) => u.name === sale.cashier || u.email === sale.cashier)?.username) || 'system'}</p>
                  </td>
                  <td className="px-6 py-4 text-sm font-black text-gray-900 dark:text-white text-right">{formatCurrency(sale.total, currency)}</td>
                  <td className="px-6 py-4 text-center"><span className="inline-flex px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-primary/10 text-primary dark:text-emerald-400 border border-primary/20">{t("completed", "Completed")}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="lg:hidden divide-y divide-gray-100 dark:divide-white/[0.05]">
          {filteredSales.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-600 font-bold uppercase tracking-widest text-[10px]">{t("no_transactions_found_period", "No transactions found")}</div>
          ) : paginatedSales.map(sale => (
            <div key={sale.id} className="p-4 active:bg-gray-50 dark:active:bg-white/5 transition-colors">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="text-xs font-black text-primary dark:text-emerald-400 uppercase tracking-tighter mb-1">{sale.invoiceNumber}</p>
                  <p className="text-[10px] text-gray-600 font-bold">{formatAppDateTime(sale.timestamp, country)}</p>
                </div>
                <p className="text-base font-black text-gray-900 dark:text-white">{formatCurrency(sale.total, currency)}</p>
              </div>
              <div className="flex justify-between items-end">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-200 leading-none">{sale.customerName || t("walk_in_customer", "Walk-in Customer")}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">{t(sale.paymentMethod, sale.paymentMethod)}</span>
                    <span className="text-[8px] text-gray-600">•</span>
                    <span className="text-[9px] font-black text-primary/80 uppercase tracking-widest">{t("by", "By")} {sale.cashier}</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-[0.15em] bg-primary/10 text-primary border border-primary/10">{t("completed", "COMPLETED")}</span>
              </div>
            </div>
          ))}
        </div>

        {filteredSales.length > paginatedSales.length && (
          <div className="bg-gray-50/50 dark:bg-white/[0.02] border-t border-gray-200 dark:border-white/10 px-6 py-6 flex items-center justify-center">
            <button onClick={onLoadMore} className="btn btn-md btn-primary w-full sm:w-auto">
              {t("load_more_transactions", "Load More Transactions")}
            </button>
          </div>
        )}
      </div>

      {/* Top Selling Products */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-white/10">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
            <ShoppingCart className="h-5 w-5 mr-2 text-green-600" />{t("top_selling_products", "Top Selling Products")}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead className="table-header">
              <tr>
                <th className="table-header-cell hidden sm:table-cell">{t("rank", "Rank")}</th>
                <th className="table-header-cell">{t("product", "Product")}</th>
                <th className="table-header-cell">{t("quantity_sold", "Quantity Sold")}</th>
                <th className="table-header-cell">{t("revenue", "Revenue")}</th>
                <th className="table-header-cell hidden sm:table-cell">{t("avg_price", "Avg. Price")}</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-surface divide-y divide-gray-200 dark:divide-white/5">
              {topProducts.map((product, index) => (
                <tr key={index} className="table-row">
                  <td className="table-cell hidden sm:table-cell">
                    <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-full font-bold text-sm">{index + 1}</div>
                  </td>
                  <td className="table-cell font-semibold text-gray-900 dark:text-white">{product.name}</td>
                  <td className="table-cell"><span className="badge badge-emerald-light">{product.quantity}</span></td>
                  <td className="table-cell font-semibold text-green-600">{formatCurrency(product.revenue, currency)}</td>
                  <td className="table-cell text-gray-600 dark:text-gray-400 hidden sm:table-cell">{formatCurrency(product.revenue / product.quantity, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
