import { useMemo } from 'react';
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

interface DashboardManagerProps {
  onNavigate?: (page: string) => void;
}

export function DashboardManager({ onNavigate }: DashboardManagerProps) {
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

  const loading = false; // Placeholder

  return (
    <div className="main-content-scroll p-2.5 sm:p-6 bg-gray-50/50 dark:bg-app flex flex-col gap-4 sm:gap-8">
      {/* --- PREMIUM HERO SECTION --- */}
      <div className="order-2 lg:order-1 grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-8 items-stretch animate-in fade-in slide-in-from-top-4 duration-1000">

        {/* Left: Identity & Greeting */}
        <div className="lg:col-span-2 order-2 lg:order-1 flex flex-col justify-between p-6 sm:p-10 bg-gradient-to-br from-indigo-950 via-[#0A0A0A] to-black rounded-[3rem] border border-indigo-500/20 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none group-hover:scale-110 transition-transform duration-1000">
            <TrendingUp className="w-64 h-64 -mr-16 -mt-16 text-indigo-500" />
          </div>

          <div className="relative z-10">
            <div className="flex items-center gap-4 mb-4">
              <div className="px-4 py-1.5 bg-primary/10 text-primary rounded-full border border-primary/20 flex items-center gap-2">
                <Zap className="w-3 h-3 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest">{t("system_live", "System Live")}</span>
              </div>
              <div className="px-4 py-1.5 bg-indigo-500/10 text-indigo-400 rounded-full border border-indigo-500/20 flex items-center gap-2">
                <Activity className="w-3 h-3" />
                <span className="text-[10px] font-black uppercase tracking-widest">Zaynahs POS</span>
              </div>
            </div>

            <h1 className="text-4xl sm:text-6xl font-black text-white uppercase tracking-tight leading-[0.9] mb-4">
              {t("control_center", "Control Center")}
            </h1>
            <p className="text-sm font-bold text-gray-600 max-w-md leading-relaxed">
              {t("welcome_back", "Welcome back. Your business pulse is stable and scaling.")}
              <br />
              {t("monitor_realtime", "Monitor real-time transactions and inventory health across your workspace.")}
            </p>
          </div>

          <div className="relative z-10 mt-10 flex flex-wrap items-center gap-3">
            <button
              onClick={() => onNavigate?.('pos')}
              className="px-8 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-emerald-500/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
            >
              {t("launch_pos", "Launch POS")} <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => onNavigate?.('inventory')}
              className="px-8 py-4 bg-white/5 text-white border border-white/10 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all"
            >
              {t("manage_stock", "Manage Stock")}
            </button>
          </div>
        </div>

        {/* Right: The Magical Watch (Analytic Hub) */}
        <div className="order-1 lg:order-2 bg-gradient-to-b from-indigo-950 to-black rounded-[3rem] p-6 border border-indigo-500/20 shadow-2xl relative overflow-hidden flex flex-col items-center justify-center min-h-[320px] group">
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-indigo-500/5 rounded-full" />
          </div>

          <div className="relative z-10 w-full flex-1 flex flex-col items-center justify-center">
            <MagicalClock />
          </div>

          <div className="relative z-10 text-center mt-4 pb-2">
            <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em] leading-none">{t("local_time", "Local Time")}</p>
            <div className="h-px w-8 bg-primary/20 mx-auto mt-2" />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="bg-gray-100 dark:bg-white/[0.03] rounded-2xl animate-pulse aspect-square" />)}
        </div>
      ) : (
        <div className="order-1 lg:order-2 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6 lg:gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-500">
          {/* 1. Collections */}
          <div
            className="stat-card bg-gradient-to-br from-indigo-600 via-blue-600 to-blue-800 group cursor-pointer !min-h-[100px] sm:!min-h-[120px]"
            onClick={() => onNavigate?.('reports')}
          >
            <div className="stat-card-inner">
              <div className="space-y-1">
                <span className="stat-card-label">{t("revenue_today", "Revenue Today")}</span>
                <span className="stat-card-value !text-lg sm:!text-xl lg:!text-2xl">{formatCurrency(walletStats.total, currency)}</span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <div className="px-2 py-0.5 bg-white/10 rounded-lg border border-white/5">
                  <p className="text-[8px] font-black text-white uppercase tracking-widest">{walletStats.cash > 0 ? t("cash_ready", "CASH READY") : t("no_cash", "NO CASH")}</p>
                </div>
              </div>
            </div>
            <Wallet className="stat-card-icon !h-10 !w-10 sm:!h-12 sm:!w-12 !opacity-20 group-hover:!opacity-40" />
          </div>

          {/* 2. Activity */}
          <div
            className="stat-card bg-gradient-to-br from-violet-600 via-purple-700 to-indigo-800 group cursor-pointer !min-h-[100px] sm:!min-h-[120px]"
            onClick={() => onNavigate?.('reports')}
          >
            <div className="stat-card-inner">
              <div className="space-y-1">
                <span className="stat-card-label">{t("flow_monitor", "Flow Monitor")}</span>
                <div className="flex flex-col gap-1.5 mt-2">
                  <div className="flex items-center justify-between text-[9px] font-black text-white/50">
                    <span>{t("inflow", "INFLOW")}</span>
                    <span className="text-white">+{formatCurrency(todayStats.sales, currency, false)}</span>
                  </div>
                  <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-400 w-3/4 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  </div>
                </div>
              </div>
            </div>
            <Activity className="stat-card-icon !h-10 !w-10 sm:!h-12 sm:!w-12 !opacity-20 group-hover:!opacity-40" />
          </div>

          {/* 3. Customers */}
          <div
            className="stat-card bg-gradient-to-br from-emerald-500 via-teal-600 to-teal-800 group cursor-pointer shadow-emerald-500/10 !min-h-[100px] sm:!min-h-[120px]"
            onClick={() => onNavigate?.('customers')}
          >
            <div className="stat-card-inner">
              <div className="space-y-1">
                <span className="stat-card-label">{t("receivables", "Receivables")}</span>
                <span className="stat-card-value !text-lg sm:!text-xl lg:!text-2xl">{formatCurrency(customerReceivableStats.toReceive, currency)}</span>
              </div>
            </div>
            <Users className="stat-card-icon !h-10 !w-10 sm:!h-12 sm:!w-12 !opacity-20 group-hover:!opacity-40" />
          </div>

          {/* 4. Suppliers */}
          <div
            className="stat-card bg-gradient-to-br from-rose-500 via-red-600 to-red-800 group cursor-pointer shadow-red-500/10 !min-h-[100px] sm:!min-h-[120px]"
            onClick={() => onNavigate?.('suppliers')}
          >
            <div className="stat-card-inner">
              <div className="space-y-1">
                <span className="stat-card-label">{t("payables", "Payables")}</span>
                <span className="stat-card-value !text-lg sm:!text-xl lg:!text-2xl">{formatCurrency(payableStats.toPay, currency)}</span>
              </div>
            </div>
            <Building2 className="stat-card-icon !h-10 !w-10 sm:!h-12 sm:!w-12 !opacity-20 group-hover:!opacity-40" />
          </div>

          {/* 5. Orders */}
          <div
            className="stat-card bg-gradient-to-br from-amber-500 via-orange-600 to-orange-800 group cursor-pointer shadow-orange-500/10 !min-h-[100px] sm:!min-h-[120px]"
            onClick={() => onNavigate?.('purchase-orders')}
          >
            <div className="stat-card-inner">
              <div className="space-y-1">
                <span className="stat-card-label">{t("pending", "Pending")}</span>
                <span className="stat-card-value !text-lg sm:!text-xl lg:!text-2xl">{pendingPOsCount}</span>
              </div>
            </div>
            <ShoppingBag className="stat-card-icon !h-10 !w-10 sm:!h-12 sm:!w-12 !opacity-20 group-hover:!opacity-40" />
          </div>

          {/* 6. Inventory */}
          <div
            className={`stat-card group cursor-pointer transition-all duration-500 !min-h-[100px] sm:!min-h-[120px] ${lowStockCount > 0
              ? 'bg-gradient-to-br from-pink-600 to-rose-700 shadow-rose-500/20 ring-1 ring-white/20'
              : 'bg-gradient-to-br from-pink-500 to-fuchsia-700'
              }`}
            onClick={() => onNavigate?.('inventory')}
          >
            <div className="stat-card-inner">
              <div className="space-y-1">
                <span className="stat-card-label">{t("inventory", "Inventory")}</span>
                <span className="stat-card-value !text-lg sm:!text-xl lg:!text-2xl">{lowStockCount}</span>
                <p className="text-[9px] font-black uppercase tracking-widest text-white/50">{lowStockCount > 0 ? t("critical_alert", "CRITICAL ALERT") : t("optimized", "OPTIMIZED")}</p>
              </div>
            </div>
            <Package className="stat-card-icon !h-10 !w-10 sm:!h-12 sm:!w-12 !opacity-20 group-hover:!opacity-40" />
          </div>
        </div>
      )}

      {/* --- BUSINESS PULSE & LIVE FEED (THE ANALYTICS) --- */}
      {!loading && (
        <div className="order-3 grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-8 animate-in slide-in-from-bottom-6 duration-1000 delay-300">

          {/* Live Business Pulse Chart */}
          <div className="lg:col-span-2 bg-white dark:bg-[#080808] rounded-[3rem] p-6 sm:p-10 border border-primary/10 dark:border-white/5 shadow-2xl relative overflow-hidden group min-h-[350px]">
            <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none group-hover:scale-110 transition-transform duration-1000">
              <Activity className="w-56 h-56 -mr-16 -mt-16 text-primary" />
            </div>

            <div className="relative z-10 flex flex-col h-full">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight">{t("business_pulse", "Business Pulse")}</h3>
                  <p className="text-[10px] font-black text-primary uppercase tracking-[0.3em] mt-1">{t("live_momentum_analytic", "Live Momentum Analytic")}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right hidden sm:block">
                    <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest leading-none mb-1">{t("peak_sales", "Peak Sales")}</p>
                    <p className="text-sm font-black text-gray-900 dark:text-white">{formatCurrency(Math.max(...hourlyData.map(d => d.value), 0), currency)}</p>
                  </div>
                  <div className="w-10 h-10 bg-primary/10 rounded-2xl flex items-center justify-center border border-primary/20">
                    <Zap className="w-5 h-5 text-primary animate-pulse" />
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
          <div className="lg:col-span-1 bg-gradient-to-br from-[#0A0A0A] via-[#111] to-black rounded-[3rem] p-6 sm:p-8 border border-blue-500/10 dark:border-white/5 shadow-2xl relative overflow-hidden flex flex-col min-h-[350px]">
            <div className="relative z-10 flex items-center justify-between mb-8">
              <div>
                <h3 className="text-xl font-black text-white uppercase tracking-tight">{t("live_feed", "Live Feed")}</h3>
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mt-1">{t("real_time_stream", "Real-time Stream")}</p>
              </div>
              <div className="w-8 h-8 bg-blue-500/10 rounded-xl flex items-center justify-center border border-blue-500/20">
                <Clock className="w-4 h-4 text-blue-400" />
              </div>
            </div>

            <div className="relative z-10 flex-1 flex flex-col gap-3 overflow-y-auto scrollbar-hide pb-10">
              {recentActivity.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1">
                  <div className="relative mb-4">
                    <Star className="relative w-12 h-12 text-blue-400/30" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20">{t("standby", "Standby")}</p>
                </div>
              ) : (
                recentActivity.map((sale, i) => (
                  <div
                    key={sale.id}
                    className="bg-white/[0.03] hover:bg-white/[0.08] transition-all p-4 rounded-[1.75rem] border border-white/5 flex items-center justify-between group active:scale-95"
                    style={{ animationDelay: `${i * 100}ms` }}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${sale.paymentMethod === 'cash' ? 'bg-primary/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>
                        {sale.paymentMethod === 'cash' ? <Wallet className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-black text-white uppercase tracking-widest truncate">TRX-{sale.id.slice(-4)}</p>
                        <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest">{formatInTimeZone(sale.createdAt || sale.timestamp, { hour: '2-digit', minute: '2-digit', hour12: false }, state.settings.country)}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[13px] font-black text-emerald-400">{formatCurrency(sale.total, currency, false)}</p>
                      <p className="text-[8px] font-black text-white/20 uppercase tracking-widest">{sale.items?.length || 0} {sale.items?.length === 1 ? t("item", "ITEM") : t("items", "ITEMS")}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Fade out bottom */}
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black to-transparent z-20 pointer-events-none rounded-b-[3rem]" />
          </div>
        </div>
      )}

    </div>
  );
}
