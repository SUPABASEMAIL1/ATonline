import { TrendingUp, TrendingDown, DollarSign, Wallet, Banknote, CreditCard, Smartphone, Building2, FileText } from 'lucide-react';
import { formatCurrency } from '../../../lib/currencies';
import { useTranslation } from '../../../hooks/useTranslation';

interface WalletStat {
  method: string;
  sales: number;
  refunds: number;
  expenses: number;
  net: number;
}

interface FinancialReportProps {
  totalRevenue: number;
  totalTransactions: number;
  totalCostOfGoods: number;
  grossProfit: number;
  totalExpenseAmount: number;
  filteredExpensesCount: number;
  netProfit: number;
  walletStats: WalletStat[];
  currency: string;
}

export function FinancialReport({
  totalRevenue, totalTransactions, totalCostOfGoods, grossProfit,
  totalExpenseAmount, filteredExpensesCount, netProfit, walletStats, currency
}: FinancialReportProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      {/* Main Profit Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <div className="stat-card bg-gradient-to-br from-blue-600 to-indigo-700">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t("total_revenue", "Total Revenue")}</span>
            <span className="stat-card-value">{formatCurrency(totalRevenue, currency)}</span>
            <p className="text-[7px] font-black text-white/40 uppercase tracking-widest mt-1">
              {totalTransactions} {t("transactions", "Transactions")}
            </p>
          </div>
          <TrendingUp className="stat-card-icon" />
        </div>
        <div className="stat-card bg-gradient-to-br from-rose-500 to-red-600">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t("cost_of_goods", "Cost of Goods")}</span>
            <span className="stat-card-value">{formatCurrency(totalCostOfGoods, currency)}</span>
            <p className="text-[7px] font-black text-white/40 uppercase tracking-widest mt-1">
              {t("est_inventory_cost", "Est. Inventory Cost")}
            </p>
          </div>
          <TrendingDown className="stat-card-icon" />
        </div>
        <div className="stat-card bg-gradient-to-br from-orange-500 to-amber-600">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t("total_expenses", "Total Expenses")}</span>
            <span className="stat-card-value">{formatCurrency(totalExpenseAmount, currency)}</span>
            <p className="text-[7px] font-black text-white/40 uppercase tracking-widest mt-1">
              {filteredExpensesCount} {t("records", "Records")}
            </p>
          </div>
          <Wallet className="stat-card-icon" />
        </div>
        <div className="stat-card bg-gradient-to-br from-indigo-500 to-violet-700">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t("net_profit", "Net Profit")}</span>
            <span className="stat-card-value">{formatCurrency(netProfit, currency)}</span>
            <p className="text-[7px] font-black text-white/40 uppercase tracking-widest mt-1">
              {t("gp_minus_expenses", "GP - Expenses")}
            </p>
          </div>
          <DollarSign className="stat-card-icon" />
        </div>
      </div>

      {/* Wallet-wise Financial Breakdown */}
      <div className="space-y-4">
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-gray-600 flex items-center gap-2">
          <span className="w-1.5 h-4 bg-violet-600 rounded-full inline-block shadow-lg shadow-violet-600/20"></span>
          {t("wallet_wise_summary", "Wallet-wise Summary (Net Cash Movement)")}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-3 gap-6">
          {[
            { method: 'cash', label: t("cash_wallet", "Cash Wallet"), icon: <Banknote className="h-6 w-6" />, color: 'text-primary', accent: 'emerald', bg: 'bg-primary/10 dark:bg-primary/5', bar: 'bg-primary', stats: walletStats.find(w => w.method === 'cash') },
            { method: 'card', label: t("card_wallet", "Card Wallet"), icon: <CreditCard className="h-6 w-6" />, color: 'text-blue-500', accent: 'blue', bg: 'bg-blue-500/10 dark:bg-blue-500/5', bar: 'bg-blue-500', stats: walletStats.find(w => w.method === 'card') },
            { method: 'digital', label: t("digital_wallet", "Bank Transfer"), icon: <Building2 className="h-6 w-6" />, color: 'text-cyan-500', accent: 'cyan', bg: 'bg-cyan-500/10 dark:bg-cyan-500/5', bar: 'bg-cyan-500', stats: walletStats.find(w => w.method === 'digital') }
          ].map((w, i) => (
            <div key={i} className="group relative p-6 rounded-[1.5rem] border border-white/5 bg-gradient-to-br from-white to-gray-50 dark:from-[#171717] dark:to-[#111] shadow-xl hover:scale-[1.02] transition-all duration-300">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className={`p-3.5 rounded-2xl ${w.bg} ${w.color} shadow-lg shadow-black/[0.02] group-hover:scale-110 transition-transform`}>{w.icon}</div>
                  <div>
                    <span className={`text-[10px] font-black uppercase tracking-[0.2em] opacity-60 ${w.color}`}>{w.label}</span>
                    <h4 className="text-lg font-black text-gray-900 dark:text-white leading-tight">{t("net_flow", "Net Flow")}</h4>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center px-1">
                  <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">{t("total_sales", "Total Sales")}</span>
                  <span className="text-sm font-black text-primary dark:text-emerald-400">+{formatCurrency(w.stats?.sales || 0, currency)}</span>
                </div>
                <div className="flex justify-between items-center px-1">
                  <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">{t("total_refunds", "Total Refunds")}</span>
                  <span className="text-sm font-black text-rose-500">-{formatCurrency(w.stats?.refunds || 0, currency)}</span>
                </div>
                <div className="flex justify-between items-center px-1">
                  <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">{t("total_expenses", "Total Expenses")}</span>
                  <span className="text-sm font-black text-rose-500">-{formatCurrency(w.stats?.expenses || 0, currency)}</span>
                </div>
                <div className="relative pt-4 mt-4 border-t border-gray-200 dark:border-white/5">
                  <div className={`absolute top-0 left-0 w-8 h-[2px] ${w.bar} -translate-y-[1px]`}></div>
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[11px] font-black text-gray-900 dark:text-white uppercase tracking-widest">{t("wallet_net", "Wallet Net")}</span>
                    <span className={`text-xl font-black ${w.color}`}>{formatCurrency(w.stats?.net || 0, currency)}</span>
                  </div>
                </div>
              </div>
              <div className={`absolute -right-6 -bottom-6 w-24 h-24 rounded-full ${w.bg} opacity-50 transition-transform group-hover:scale-150`}></div>
            </div>
          ))}
        </div>

        {/* Grand Total Consolidation */}
        <div className="p-8 mt-4 bg-gradient-to-br from-gray-900 to-black dark:from-white/[0.08] dark:to-white/[0.02] rounded-[2.5rem] flex flex-col md:flex-row justify-between items-center gap-8 border border-white/5 shadow-2xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
          <div className="flex items-center gap-6 relative z-10">
            <div className="p-4 bg-white/10 rounded-3xl"><TrendingUp className="h-8 w-8 text-emerald-400" /></div>
            <div>
              <p className="text-[10px] font-black text-white/50 uppercase tracking-[0.3em] mb-1">
                {t("final_reconciliation", "Final Business Reconciliation")}
              </p>
              <p className="text-xs text-white/30 font-bold max-w-[300px]">
                {t("final_reconciliation_desc", "Total Revenue remaining after deducting all business expenses for this period.")}
              </p>
            </div>
          </div>
          <div className="text-center md:text-right relative z-10">
            <p className="text-[9px] font-black text-emerald-400 uppercase tracking-[0.4em] mb-2">
              {t("grand_total_net", "Grand Total Net")}
            </p>
            <p className="text-5xl font-black text-white tracking-tighter drop-shadow-2xl">{formatCurrency(totalRevenue - totalExpenseAmount, currency)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
