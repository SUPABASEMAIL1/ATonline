import { useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wallet,
  TrendingUp,
  Users,
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

export function DashboardManager() {
  const navigate = useNavigate();
  const { state } = useApp();
  const { t } = useTranslation();
  const { currency } = state.settings;

  const timezone = getTimezone(state.settings.country);



  const walletStats = useMemo(() => {
    const now = new Date();
    const todayStart = getStartOfDayInTimezone(now, timezone).getTime();
    const todayEnd = getEndOfDayInTimezone(now, timezone).getTime();
    const todaySales = state.sales.filter(s => {
      const ts = new Date(s.createdAt || s.timestamp || 0).getTime();
      return ts >= todayStart && ts <= todayEnd;
    });

    return {
      total: todaySales.reduce((sum, s) => {
        if (s.status === 'completed' || s.status === 'credit') return sum + s.total;
        if (s.status === 'refunded') return sum - (s.total || 0);
    if (s.status === 'partially_refunded') return sum - (s.refundedAmount || 0);
        return sum;
      }, 0),
      cash: todaySales.reduce((sum, s) => {
        const amt = getAmountByMethod(s, 'cash');
        if (s.status === 'completed' || s.status === 'credit') return sum + amt;
        if (s.status === 'refunded') return sum - amt;
        if (s.status === 'partially_refunded') return sum - (s.refundedAmount || 0) * (amt / (s.total || 1));
        return sum;
      }, 0),
      card: todaySales.reduce((sum, s) => {
        const amt = getAmountByMethod(s, 'card');
        if (s.status === 'completed' || s.status === 'credit') return sum + amt;
        if (s.status === 'refunded') return sum - amt;
        if (s.status === 'partially_refunded') return sum - (s.refundedAmount || 0) * (amt / (s.total || 1));
        return sum;
      }, 0),
      digital: todaySales.reduce((sum, s) => {
        const amt = getAmountByMethod(s, 'digital');
        if (s.status === 'completed' || s.status === 'credit') return sum + amt;
        if (s.status === 'refunded') return sum - amt;
        if (s.status === 'partially_refunded') return sum - (s.refundedAmount || 0) * (amt / (s.total || 1));
        return sum;
      }, 0),
    };
  }, [state.sales, timezone]);

  const todayStats = useMemo(() => {
    const now = new Date();
    const todayStart = getStartOfDayInTimezone(now, timezone).getTime();
    const todayEnd = getEndOfDayInTimezone(now, timezone).getTime();
    return {
      sales: state.sales.filter(s => {
        const ts = new Date(s.createdAt || s.timestamp || 0).getTime();
        return ts >= todayStart && ts <= todayEnd;
      }).reduce((sum, s) => {
        if (s.status === 'completed' || s.status === 'credit') return sum + s.total;
        if (s.status === 'refunded') return sum - (s.total || 0);
    if (s.status === 'partially_refunded') return sum - (s.refundedAmount || 0);
        return sum;
      }, 0),
      purchases: 0,
    };
  }, [state.sales, timezone]);

  const hourlyData = useMemo(() => {
    const now = new Date();
    const todayStart = getStartOfDayInTimezone(now, timezone).getTime();
    const todayEnd = getEndOfDayInTimezone(now, timezone).getTime();
    const todaySales = state.sales.filter(s => {
      const ts = new Date(s.createdAt || s.timestamp || 0).getTime();
      return ts >= todayStart && ts <= todayEnd;
    });

    const hours = Array.from({ length: 24 }, (_, i) => ({
      name: `${i.toString().padStart(2, '0')}:00`,
      value: 0
    }));

    todaySales.forEach(sale => {
      const date = new Date(sale.createdAt || sale.timestamp || new Date());
      const hour = date.getUTCHours();
      let amount = 0;
      if (sale.status === 'refunded') amount = -(sale.total || 0);
      else if (sale.status === 'partially_refunded') amount = (sale.total || 0) - (sale.refundedAmount || 0);
      else if (sale.status === 'completed' || sale.status === 'credit') amount = sale.total || 0;
      hours[hour].value += amount;
    });

    const currentHour = new Date().getUTCHours();
    const startHour = Math.max(0, currentHour - 11);
    return hours.slice(startHour, currentHour + 1);
  }, [state.sales, timezone]);

  const recentActivity = useMemo(() => {
    const all = [...state.sales].sort((a, b) => {
      const dateA = new Date(a.createdAt || a.timestamp || 0).getTime();
      const dateB = new Date(b.createdAt || b.timestamp || 0).getTime();
      return dateB - dateA;
    });
    return all.slice(0, 5); // Latest 5
  }, [state.sales]);

  const customerReceivableStats = useMemo(() => {
    const toReceive = state.customers.reduce((sum, c) => sum + (c.balance < 0 ? Math.abs(c.balance) : 0), 0);
    const advance = state.customers.reduce((sum, c) => sum + (c.balance > 0 ? c.balance : 0), 0);
    return { toReceive, advance };
  }, [state.customers]);

  const payableStats = useMemo(() => {
    const toPay = state.suppliers.reduce((sum, s) => sum + (s.balance < 0 ? Math.abs(s.balance) : 0), 0);
    const advance = state.suppliers.reduce((sum, s) => sum + (s.balance > 0 ? s.balance : 0), 0);
    return { toPay, advance };
  }, [state.suppliers]);

  const pendingPOsCount = 0; // Placeholder
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
                <span className="text-[8px] font-black uppercase tracking-widest">Zaynahs POS</span>
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
            <button
              onClick={() => navigate('/pos')}
              className="px-4 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl text-[8px] sm:text-[9px] font-black uppercase tracking-widest shadow-xl shadow-emerald-500/10 active:scale-95 transition-all flex items-center gap-1.5"
            >
              {t("launch_pos", "Launch POS")} <ArrowRight className="w-3 h-3" />
            </button>
            <button
              onClick={() => navigate('/inventory')}
              className="px-4 sm:px-5 py-2 sm:py-2.5 bg-white/5 text-white border border-white/10 rounded-xl text-[8px] sm:text-[9px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
            >
              {t("manage_stock", "Manage Stock")}
            </button>
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* 1. Revenue Today */}
          <div
            className="stat-card bg-gradient-to-br from-indigo-600 via-blue-600 to-blue-800 group cursor-pointer !min-h-[85px] py-2.5 px-4 rounded-[1.5rem]"
            onClick={() => navigate('/reports')}
          >
            <div className="stat-card-inner">
              <div className="space-y-0.5">
                <span className="stat-card-label text-[8.5px] tracking-widest">{t("revenue_today", "Revenue Today")}</span>
                <span className="stat-card-value text-base sm:text-lg lg:text-xl font-black">{formatCurrency(walletStats.total, currency)}</span>
              </div>
              <div className="mt-2">
                <span className="text-[7.5px] font-black text-white/50 bg-white/15 px-1.5 py-0.5 rounded border border-white/5 uppercase tracking-wider">
                  {walletStats.cash > 0 ? t("cash_ready", "CASH READY") : t("no_cash", "NO CASH")}
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
                    <div className="h-full bg-emerald-400 w-3/4" />
                  </div>
                </div>
              </div>
            </div>
            <Activity className="stat-card-icon !h-8 !w-8 -bottom-1 -right-1 !opacity-10 group-hover:!opacity-20" />
          </div>

          {/* 3. Receivables */}
          <div
            className="stat-card bg-gradient-to-br from-emerald-500 via-teal-600 to-teal-800 group cursor-pointer shadow-emerald-500/10 !min-h-[85px] py-2.5 px-4 rounded-[1.5rem]"
            onClick={() => navigate('/customers')}
          >
            <div className="stat-card-inner">
              <div className="space-y-0.5">
                <span className="stat-card-label text-[8.5px] tracking-widest">{t("receivables", "Receivables")}</span>
                <span className="stat-card-value text-base sm:text-lg lg:text-xl font-black">{formatCurrency(customerReceivableStats.toReceive, currency)}</span>
              </div>
            </div>
            <Users className="stat-card-icon !h-8 !w-8 -bottom-1 -right-1 !opacity-10 group-hover:!opacity-20" />
          </div>

          {/* 4. Payables */}
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

          {/* 5. Orders */}
          <div
            className="stat-card bg-gradient-to-br from-amber-500 via-orange-600 to-orange-800 group cursor-pointer shadow-orange-500/10 !min-h-[85px] py-2.5 px-4 rounded-[1.5rem]"
            onClick={() => navigate('/purchase-orders')}
          >
            <div className="stat-card-inner">
              <div className="space-y-0.5">
                <span className="stat-card-label text-[8.5px] tracking-widest">{t("pending", "Pending")}</span>
                <span className="stat-card-value text-base sm:text-lg lg:text-xl font-black">{pendingPOsCount}</span>
              </div>
            </div>
            <ShoppingBag className="stat-card-icon !h-8 !w-8 -bottom-1 -right-1 !opacity-10 group-hover:!opacity-20" />
          </div>

          {/* 6. Inventory */}
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
                    className="bg-white/[0.03] hover:bg-white/[0.08] transition-all p-3 rounded-[1.25rem] border border-white/5 flex items-center justify-between group active:scale-95"
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
                      <p className="text-xs font-black text-emerald-400">{formatCurrency(sale.total, currency, false)}</p>
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
