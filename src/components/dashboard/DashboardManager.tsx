import { useMemo, useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wallet,
  TrendingUp,
  Building2,
  ShoppingBag,
  Package,
  AlertCircle,
  ArrowRight,
  Clock,
  Activity,
  Zap,
  Star
} from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';
import { MagicalClock } from './MagicalClock';
import { useApp } from '../../context/SupabaseAppContext';
import { formatCurrency } from '../../lib/currencies';
import { getAmountByMethod } from '../../lib/services';
import { getTimezone, getStartOfDayInTimezone, getEndOfDayInTimezone, formatInTimeZone } from '../../lib/dateUtils';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../../shared/ui';

export function DashboardManager() {
  const navigate = useNavigate();
  const { state } = useApp();
  const { t } = useTranslation();
  const { currency } = state.settings;

  const timezone = getTimezone(state.settings.country);

  const [dashboardSales, setDashboardSales] = useState([]);
  const [recentSales, setRecentSales] = useState([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      const now = new Date();
      const todayStart = getStartOfDayInTimezone(now, timezone).getTime();
      const todayEnd = getEndOfDayInTimezone(now, timezone).getTime();
      
      // Fetch today's sales from localDb
      const today = await localDb.sales
        .filter(s => {
          const ts = new Date(s.createdAt || s.timestamp || 0).getTime();
          return ts >= todayStart && ts <= todayEnd;
        })
        .toArray();
      setDashboardSales(today);

      // Fetch recent 5 sales
      const recent = await localDb.sales
        .orderBy('timestamp')
        .reverse()
        .limit(5)
        .toArray();
      setRecentSales(recent);
    };

    fetchDashboardData();
  }, [state.sales, timezone]); // Re-run when state.sales changes so it stays live

  const todaySalesStats = useMemo(() => {
    let revenue = 0, cash = 0, card = 0, online = 0;
    for (const s of dashboardSales) {
      if (s.status === 'refunded' || s.status === 'deleted') continue; // net 0
      const total = s.total || 0;
      const refunded = s.status === 'partially_refunded' ? (s.refundedAmount || 0) : 0;
      // X5: net of tax so Dashboard Revenue matches Reports (which subtract tax) — previously
      // tax was counted as revenue, overstating the figure.
      const tax = Number(s.taxAmount) || 0;
      const taxPortion = s.status === 'partially_refunded' && total > 0 ? tax * (refunded / total) : tax;
      revenue += total - refunded - taxPortion;
      const netFor = (method: string) => {
        const amt = getAmountByMethod(s, method);
        return total > 0 ? amt - refunded * (amt / total) : 0;
      };
      cash += netFor('cash');
      card += netFor('card');
      online += netFor('online');
    }
    return { revenue, cash, card, online };
  }, [dashboardSales]);

  const todayStats = useMemo(() => {
    return {
      sales: todaySalesStats.revenue,
      purchases: 0,
    };
  }, [todaySalesStats.revenue]);

  const todayExpenses = useMemo(() => {
    const now = new Date();
    const start = getStartOfDayInTimezone(now, timezone).getTime();
    const end = getEndOfDayInTimezone(now, timezone).getTime();
    return (state.expenses || []).reduce((sum, e) => {
      const ts = new Date(e.createdAt || e.date || 0).getTime();
      return ts >= start && ts <= end ? sum + (e.amount || 0) : sum;
    }, 0);
  }, [state.expenses, timezone]);

  const flowRatio = useMemo(() => {
    const total = todayStats.sales + todayExpenses;
    if (total <= 0) return 8;
    return Math.max(8, Math.min(100, (todayStats.sales / total) * 100));
  }, [todayStats.sales, todayExpenses]);

  const hourlyData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({
      name: `${i.toString().padStart(2, '0')}:00`,
      value: 0
    }));

    dashboardSales.forEach(sale => {
      const date = new Date(sale.createdAt || sale.timestamp || new Date());
      const hour = date.getHours();
      let amount = 0;
      if (sale.status === 'completed') amount = (sale.total || 0);
      else if (sale.status === 'partially_refunded') amount = (sale.total || 0) - (sale.refundedAmount || 0);
      else amount = 0; // refunded -> net 0
      hours[hour].value += amount;
    });

    const currentHour = new Date().getHours();
    const startHour = Math.max(0, currentHour - 11);
    return hours.slice(startHour, currentHour + 1);
  }, [dashboardSales]);

  const recentActivity = useMemo(() => {
    return recentSales;
  }, [recentSales]);

  const payableStats = useMemo(() => {
    // X1: mapSupplier never populates Supplier.balance, so summing s.balance was always 0.
    // Compute each supplier's balance from the transaction ledger (mirrors suppliersService.getBalance).
    const balances = state.suppliers.map(s => {
      const txs = state.supplierTransactions.filter(t => t.supplierId === s.id);
      return txs.reduce((sum, tx) => {
        if (tx.type === 'payment' || tx.type === 'return') return sum - (tx.amount || 0);
        return sum + (tx.amount || 0);
      }, 0);
    });
    const toPay = balances.filter(b => b < 0).reduce((a, b) => a + Math.abs(b), 0);
    const advance = balances.filter(b => b > 0).reduce((a, b) => a + b, 0);
    return { toPay, advance };
  }, [state.suppliers, state.supplierTransactions]);

  const pendingPOsCount = state.storeOrders.filter(o => o.status === 'pending').length;
  const lowStockCount = state.products.filter(p => p.trackInventory && p.stock <= (p.minStock || 5)).length;

  return (
    <div className="main-content-scroll p-2.5 sm:p-4 bg-gray-50/50 dark:bg-app flex flex-col gap-4">
      {/* --- COMPACT HERO GRID WITH MAGICAL WATCH --- */}
      <div className="grid grid-cols-[1fr_auto] lg:grid-cols-3 gap-3 items-stretch">
        
        {/* Left: Identity Greeting Card */}
        <div className="lg:col-span-2 flex flex-col justify-between p-4 sm:p-5 bg-gradient-to-br from-indigo-950 via-[#0A0A0A] to-black rounded-[2rem] border border-indigo-500/10 shadow-2xl relative overflow-hidden group min-h-[140px] sm:min-h-[160px]">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none group-hover:scale-110 transition-transform duration-1000">
            <TrendingUp className="w-32 h-32 -mr-8 -mt-8 text-indigo-500" />
          </div>

          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <div className="px-2 py-0.5 bg-primary/10 text-primary rounded-full border border-primary/20 flex items-center gap-1">
                <Zap className="w-2.5 h-2.5 animate-pulse" />
                <span className="text-[8px] font-black uppercase tracking-widest">{t("system_live", "System Live")}</span>
              </div>
              <div className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded-full border border-indigo-500/20 flex items-center gap-1">
                <Activity className="w-2.5 h-2.5" />
                <span className="text-[8px] font-black uppercase tracking-widest">POS</span>
              </div>
            </div>

            <h1 className="text-lg sm:text-2xl font-black text-white uppercase tracking-tight leading-none mb-1">
              {t("control_center", "Control Center")}
            </h1>
            <p className="text-[9px] sm:text-[10px] font-bold text-gray-500 max-w-xl leading-normal hidden sm:block">
              {t("welcome_back", "Welcome back. Your business pulse is stable and scaling.")}
              <br />
              {t("monitor_realtime", "Monitor real-time transactions and inventory health across your workspace.")}
            </p>
          </div>

          <div className="relative z-10 mt-2 sm:mt-3 flex items-center gap-2">
            <Button
              onClick={() => navigate('/pos')}
              icon={<ArrowRight className="w-3 h-3" />}
              className="!min-h-0 !px-4 sm:!px-5 !py-2 sm:!py-2.5 !rounded-xl !text-[8px] sm:!text-[9px] !font-black !gap-1.5 !shadow-xl !shadow-emerald-500/10 !bg-gradient-to-r !from-emerald-500 !to-teal-600 !text-white !hover:bg-transparent"
            >
              {t("launch_pos", "Launch POS")}
            </Button>
            <Button
              onClick={() => navigate('/inventory')}
              className="!min-h-0 !px-4 sm:!px-5 !py-2 sm:!py-2.5 !rounded-xl !text-[8px] sm:!text-[9px] !font-black !bg-white/5 !text-white !border !border-white/10 !hover:bg-white/10"
            >
              {t("manage_stock", "Manage Stock")}
            </Button>
          </div>
        </div>

        {/* Right: The Magical Clock Card — compact on mobile, full on lg */}
        <div className="w-[110px] sm:w-auto lg:w-auto bg-gradient-to-b from-indigo-950 to-black rounded-[2rem] p-2 sm:p-3 border border-indigo-500/15 shadow-2xl relative overflow-hidden flex flex-col items-center justify-center group">
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-indigo-500/5 rounded-full" />
          </div>

          {/* Scale down the clock container so it fits the compact height perfectly */}
          <div className="relative z-10 w-full h-full max-w-[110px] sm:max-w-[130px] aspect-square flex items-center justify-center">
            <MagicalClock />
          </div>
        </div>
      </div>

      {/* Cards always mounted — never swap with skeleton to prevent blink */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* 1. Revenue Today */}
          <div
            className="stat-card bg-gradient-to-br from-indigo-600 via-blue-600 to-blue-800 group cursor-pointer !min-h-[85px] py-2.5 px-4 rounded-[1.5rem]"
            onClick={() => navigate('/reports')}
          >
            <div className="stat-card-inner">
              <div className="space-y-0.5">
                <span className="stat-card-label text-[8.5px] tracking-widest">{t("revenue_today", "Revenue Today")}</span>
                <span className="stat-card-value text-base sm:text-lg lg:text-xl font-black">{formatCurrency(todaySalesStats.revenue, currency)}</span>
              </div>
              <div className="mt-2">
                <span className="text-[7.5px] font-black text-white/50 bg-white/15 px-1.5 py-0.5 rounded border border-white/5 uppercase tracking-wider">
                  {todaySalesStats.cash > 0 ? t("cash_ready", "CASH READY") : t("no_cash", "NO CASH")}
                </span>
              </div>
            </div>
            <Wallet className="stat-card-icon !h-8 !w-8 -bottom-1 -right-1 !opacity-10 group-hover:!opacity-20" />
          </div>

          {/* 2. Flow Monitor */}
          <div
            className="stat-card bg-gradient-to-br from-violet-600 via-purple-700 to-indigo-800 group cursor-pointer !min-h-[85px] py-2.5 px-4 rounded-[1.5rem]"
            onClick={() => navigate('/reports')}
          >
            <div className="stat-card-inner">
              <div className="space-y-0.5">
                <span className="stat-card-label text-[8.5px] tracking-widest">{t("flow_monitor", "Flow Monitor")}</span>
                <div className="flex flex-col gap-1 mt-1">
                  <div className="flex items-center justify-between text-[8px] font-black text-white/60">
                    <span>{t("inflow", "INFLOW")}</span>
                    <span className="text-white">+{formatCurrency(todayStats.sales, currency, false)}</span>
                  </div>
                  <div className="w-full h-0.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-400" style={{ width: `${flowRatio}%` }} />
                  </div>
                </div>
              </div>
            </div>
            <Activity className="stat-card-icon !h-8 !w-8 -bottom-1 -right-1 !opacity-10 group-hover:!opacity-20" />
          </div>

          {/* 3. Payables */}
          <div
            className="stat-card bg-gradient-to-br from-rose-500 via-red-600 to-red-800 group cursor-pointer shadow-red-500/10 !min-h-[85px] py-2.5 px-4 rounded-[1.5rem]"
            onClick={() => navigate('/suppliers')}
          >
            <div className="stat-card-inner">
              <div className="space-y-0.5">
                <span className="stat-card-label text-[8.5px] tracking-widest">{t("payables", "Payables")}</span>
                <span className="stat-card-value text-base sm:text-lg lg:text-xl font-black">{formatCurrency(payableStats.toPay, currency)}</span>
              </div>
            </div>
            <Building2 className="stat-card-icon !h-8 !w-8 -bottom-1 -right-1 !opacity-10 group-hover:!opacity-20" />
          </div>

          {/* 4. Orders */}
          <div
            className="stat-card bg-gradient-to-br from-amber-500 via-orange-600 to-orange-800 group cursor-pointer shadow-orange-500/10 !min-h-[85px] py-2.5 px-4 rounded-[1.5rem]"
            onClick={() => navigate(state.settings.estoreEnabled ? '/online-orders' : '/purchase-orders')}
          >
            <div className="stat-card-inner">
              <div className="space-y-0.5">
                <span className="stat-card-label text-[8.5px] tracking-widest">{t("pending", "Pending")}</span>
                <span className="stat-card-value text-base sm:text-lg lg:text-xl font-black">{pendingPOsCount}</span>
              </div>
            </div>
            <ShoppingBag className="stat-card-icon !h-8 !w-8 -bottom-1 -right-1 !opacity-10 group-hover:!opacity-20" />
          </div>

          {/* 5. Inventory */}
          <div
            className={`stat-card group cursor-pointer transition-all duration-500 !min-h-[85px] py-2.5 px-4 rounded-[1.5rem] ${lowStockCount > 0
              ? 'bg-gradient-to-br from-pink-600 to-rose-700 shadow-rose-500/20 ring-1 ring-white/20'
              : 'bg-gradient-to-br from-pink-500 to-fuchsia-700'
              }`}
            onClick={() => navigate('/inventory')}
          >
            <div className="stat-card-inner">
              <div className="space-y-0.5">
                <span className="stat-card-label text-[8.5px] tracking-widest">{t("inventory", "Inventory")}</span>
                <span className="stat-card-value text-base sm:text-lg lg:text-xl font-black">{lowStockCount}</span>
                <p className="text-[7.5px] font-black text-white/50 uppercase tracking-wider">{lowStockCount > 0 ? t("critical_alert", "CRITICAL ALERT") : t("optimized", "OPTIMIZED")}</p>
              </div>
            </div>
            <Package className="stat-card-icon !h-8 !w-8 -bottom-1 -right-1 !opacity-10 group-hover:!opacity-20" />
          </div>
        </div>

      {/* --- BUSINESS PULSE & LIVE FEED (THE ANALYTICS) --- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Live Business Pulse Chart */}
          <div className="lg:col-span-2 bg-white dark:bg-[#080808] rounded-[2.5rem] p-5 sm:p-6 border border-primary/10 dark:border-white/5 shadow-2xl relative overflow-hidden group h-[350px]">
            <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none group-hover:scale-110 transition-transform duration-1000">
              <Activity className="w-48 h-48 -mr-12 -mt-12 text-primary" />
            </div>

            <div className="relative z-10 flex flex-col h-full">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">{t("business_pulse", "Business Pulse")}</h3>
                  <p className="text-[9px] font-black text-primary uppercase tracking-[0.3em] mt-1">{t("live_momentum_analytic", "Live Momentum Analytic")}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right hidden sm:block">
                    <p className="text-[8px] font-black text-gray-600 uppercase tracking-widest leading-none mb-1">{t("peak_sales", "Peak Sales")}</p>
                    <p className="text-xs font-black text-gray-900 dark:text-white">{formatCurrency(Math.max(...hourlyData.map(d => d.value), 0), currency)}</p>
                  </div>
                  <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
                    <Zap className="w-4 h-4 text-primary animate-pulse" />
                  </div>
                </div>
              </div>

              <div className="flex-1 w-full min-h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={hourlyData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorPulse" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#000',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '24px',
                        padding: '12px 20px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                        color: '#fff',
                        fontWeight: 900
                      }}
                      itemStyle={{ color: '#10B981', fontWeight: 900, textTransform: 'uppercase', fontSize: '10px' }}
                      formatter={(value: number) => formatCurrency(value, currency)}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#10B981"
                      strokeWidth={4}
                      fillOpacity={1}
                      fill="url(#colorPulse)"
                      animationDuration={1000}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Live Feed - Compact List */}
          <div className="lg:col-span-1 bg-gradient-to-br from-[#0A0A0A] via-[#111] to-black rounded-[2.5rem] p-5 sm:p-6 border border-blue-500/10 dark:border-white/5 shadow-2xl relative overflow-hidden flex flex-col h-[350px]">
            <div className="relative z-10 flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-black text-white uppercase tracking-tight">{t("live_feed", "Live Feed")}</h3>
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mt-1">{t("real_time_stream", "Real-time Stream")}</p>
              </div>
              <div className="w-8 h-8 bg-blue-500/10 rounded-xl flex items-center justify-center border border-blue-500/20">
                <Clock className="w-4 h-4 text-blue-400" />
              </div>
            </div>

            <div className="relative z-10 flex-1 flex flex-col gap-2 overflow-y-auto scrollbar-hide pb-2">
              {recentActivity.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1">
                  <div className="relative mb-4">
                    <Star className="relative w-10 h-10 text-blue-400/30" />
                  </div>
                  <p className="text-[9px] font-black uppercase tracking-[0.4em] text-white/20">{t("standby", "Standby")}</p>
                </div>
              ) : (
                recentActivity.map((sale, i) => (
                  <div
                    key={sale.id}
                    onClick={() => navigate('/transactions')}
                    className="bg-white/[0.03] hover:bg-white/[0.08] transition-all p-3 rounded-[1.25rem] border border-white/5 flex items-center justify-between group active:scale-95 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${sale.paymentMethod === 'cash' ? 'bg-primary/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>
                        {sale.paymentMethod === 'cash' ? <Wallet className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-black text-white uppercase tracking-widest truncate">TRX-{sale.id.slice(-4)}</p>
                        <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest">{formatInTimeZone(sale.createdAt || sale.timestamp, state.settings.country, 'HH:mm')}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-black text-emerald-400">{formatCurrency(sale.total - (sale.refundedAmount || 0), currency, false)}</p>
                      <p className="text-[7.5px] font-black text-white/20 uppercase tracking-widest">{sale.items?.length || 0} {sale.items?.length === 1 ? t("item", "ITEM") : t("items", "ITEMS")}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Fade out bottom */}
            <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-black to-transparent z-20 pointer-events-none rounded-b-[2.5rem]" />
          </div>
        </div>
    </div>
  );
}
