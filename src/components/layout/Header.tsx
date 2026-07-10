import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  User, Settings, LogOut, ShoppingCart, Monitor, Smartphone, Menu, X, Percent,
  Receipt, Package, Users, BarChart3, Sun, Moon, Wallet, RefreshCw,
  ChevronLeft, ChevronRight, Activity, Building2, Bell, ChevronDown, MoreHorizontal
} from 'lucide-react';
import { settingsService } from '../../lib/services';
import { useApp } from '../../context/SupabaseAppContext';
import { useAuth } from '../../context/AuthContext';
import { sonner } from '../../lib/sonner';
import { SyncStatusBadge } from './SyncStatusBadge';
import { formatCurrency } from '../../lib/currencies';
import { useTranslation } from '../../hooks/useTranslation';

interface HeaderProps {
  onShowMobileMenu?: () => void;
  onHideMobileMenu?: () => void;
  isMobileMenuOpen?: boolean;
}

export function Header({
  onShowMobileMenu,
  onHideMobileMenu,
  isMobileMenuOpen = false
}: HeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, dispatch, loadData, forceSync } = useApp();
  const { signOut } = useAuth();
  const { t, isRtl } = useTranslation();

  const [renderDrawer, setRenderDrawer] = useState(isMobileMenuOpen);

  useEffect(() => {
    if (isMobileMenuOpen) {
      setRenderDrawer(true);
    } else {
      const timer = setTimeout(() => setRenderDrawer(false), 500); // 500ms slide-out transition
      return () => clearTimeout(timer);
    }
  }, [isMobileMenuOpen]);


  const navRef = useRef<HTMLDivElement>(null);
  const mobileNavRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [mobileCanScrollLeft, setMobileCanScrollLeft] = useState(false);
  const [mobileCanScrollRight, setMobileCanScrollRight] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setIsMoreOpen(false);
      }
    };
    if (isMoreOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMoreOpen]);

  const checkScroll = useCallback(() => {
    if (navRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = navRef.current;
      setCanScrollLeft(scrollLeft > 1);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
    }
  }, []);

  const checkMobileScroll = useCallback(() => {
    if (mobileNavRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = mobileNavRef.current;
      setMobileCanScrollLeft(scrollLeft > 1);
      setMobileCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
    }
  }, []);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [checkScroll]);

  useEffect(() => {
    const el = mobileNavRef.current;
    if (!el) return;
    checkMobileScroll();
    el.addEventListener('scroll', checkMobileScroll, { passive: true });
    window.addEventListener('resize', checkMobileScroll);
    return () => {
      el.removeEventListener('scroll', checkMobileScroll);
      window.removeEventListener('resize', checkMobileScroll);
    };
  }, [checkMobileScroll]);

  useEffect(() => { setTimeout(checkScroll, 100); }, [state.currentUser]);
  useEffect(() => { setTimeout(checkMobileScroll, 100); }, [state.currentUser]);

  const scrollNav = (direction: 'left' | 'right') => {
    navRef.current?.scrollBy({ left: direction === 'left' ? -160 : 160, behavior: 'smooth' });
  };
  const scrollMobileNav = (direction: 'left' | 'right') => {
    mobileNavRef.current?.scrollBy({ left: direction === 'left' ? -120 : 120, behavior: 'smooth' });
  };

  useEffect(() => {
    if (navRef.current) {
      const activeBtn = navRef.current.querySelector('[data-active="true"]') as HTMLElement;
      activeBtn?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
    if (mobileNavRef.current) {
      const activeBtn = mobileNavRef.current.querySelector('[data-active="true"]') as HTMLElement;
      activeBtn?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [location.pathname]);



  const toggleInterfaceMode = async () => {
    const newMode = state.settings.interfaceMode === 'touch' ? 'traditional' : 'touch';
    dispatch({ type: 'SET_SETTINGS', payload: { interfaceMode: newMode } });
    try {
      await settingsService.update({ interfaceMode: newMode });
    } catch (err) {
      console.error('Failed to save interface mode:', err);
    }
  };

  const toggleTheme = async () => {
    const newTheme = (state.settings.theme || 'dark') === 'dark' ? 'light' : 'dark';
    dispatch({ type: 'SET_SETTINGS', payload: { theme: newTheme } });
    try {
      // Force immediate persistence to localStorage for index.html flash prevention
      localStorage.setItem('theme', newTheme);
      await settingsService.update({ theme: newTheme });
    } catch (err) {
      console.error('Failed to save theme:', err);
    }
  };

  const handleLogout = async () => {
    const result = await sonner.confirm(t('sign_out', 'Sign Out'), t('confirm_sign_out', 'Are you sure you want to sign out?'), t('sign_out', 'Sign Out'));
    if (result.isConfirmed) {
      try { await signOut(); } catch { sonner.error('Failed to sign out. Please try again.'); }
    }
  };

  const getNavigationItems = () => {
    const role = state.currentUser?.role;
    const perms = state.currentUser?.permissions || [];
    const items = [];

    if (role === 'admin' || role === 'manager')
      items.push({ id: 'dashboard', label: t('dashboard', 'Dashboard'), icon: Activity, color: 'text-primary' });

    items.push({ id: 'pos', label: t('pos', 'POS'), icon: ShoppingCart, color: 'text-blue-500' });

    if (role === 'admin' || role === 'manager' || role === 'cashier')
      items.push({ id: 'transactions', label: t('sales', 'Sales'), icon: Receipt, color: 'text-orange-500' });

    if (role === 'admin' || perms.includes('access_expenses'))
      items.push({ id: 'expenses', label: t('expenses', 'Expenses'), icon: Wallet, color: 'text-rose-500' });

    if (role === 'admin' || role === 'manager' || state.currentUser?.canManagePO || state.currentUser?.canViewRecords)
      items.push({ id: 'inventory', label: t('inventory', 'Inventory'), icon: Package, color: 'text-purple-500' });

    if (role === 'admin' || perms.includes('access_customers'))
      items.push({ id: 'customers', label: t('customers', 'Customers'), icon: Users, color: 'text-sky-500' });

    if (role === 'admin' || state.currentUser?.canGiveDiscount)
      items.push({ id: 'discounts', label: t('discounts', 'Discounts'), icon: Percent, color: 'text-pink-500' });

    if (role === 'admin' || perms.includes('access_reports'))
      items.push({ id: 'reports', label: t('reports', 'Reports'), icon: BarChart3, color: 'text-red-500' });

    if (role === 'admin' || role === 'manager')
      items.push({ id: 'suppliers', label: t('suppliers', 'Suppliers'), icon: Building2, color: 'text-amber-500' });

    if (role === 'admin')
      items.push({ id: 'users', label: t('users', 'Users'), icon: User, color: 'text-teal-500' });

    return items;
  };

  const navigationItems = getNavigationItems();

  return (
    <header className={`bg-white dark:bg-app border-b border-gray-200 dark:border-white/5 sticky top-0 ${isMobileMenuOpen ? 'z-[400]' : 'z-[40]'} lg:z-[40] pt-[env(safe-area-inset-top)] px-safe`}>

      {/* ── Main Row ── */}
      <div className="flex items-center h-12 lg:h-[72px] px-3 md:px-6 gap-2 lg:gap-4">

        {/* Logo */}
        <div className="flex items-center gap-2 lg:gap-4 flex-shrink-0">
          <div className="rounded-lg lg:rounded-2xl shadow-sm border border-gray-200 dark:border-white/10 bg-white overflow-hidden flex items-center justify-center">
            {state.settings.storeLogo ? (
              <img src={state.settings.storeLogo} alt="Logo"
                className="h-7 w-7 md:h-12 md:w-12 lg:h-14 lg:w-14 object-contain p-0.5" />
            ) : (
              <img src="./logo.png" alt="POS"
                className="h-7 w-7 md:h-12 md:w-12 lg:h-14 lg:w-14 object-contain p-1" />
            )}
          </div>
          <div className="hidden xs:block leading-none">
            <p className="text-[14px] md:text-[17px] lg:text-lg font-black text-gray-900 dark:text-white tracking-tight truncate max-w-[120px] sm:max-w-[160px] lg:max-w-[220px]">
              {state.settings.storeName}
            </p>
            <p className="hidden sm:block text-[9px] lg:text-[10px] font-bold uppercase tracking-[0.25em] text-primary mt-1 lg:mt-1.5 opacity-90">
              ZAYNAHSPOS.COM
            </p>
          </div>
        </div>

        {/* ── Divider ── */}
        <div className="hidden md:block h-7 w-px bg-gray-100 dark:bg-white/5 flex-shrink-0 mx-1" />

        {/* ── Scrollable Nav (Desktop & Tablet/Laptop) ── */}
        <div className="hidden md:flex items-center flex-1 min-w-0 relative">
          {canScrollLeft && (
            <button onClick={() => scrollNav('left')}
              className="absolute left-0 z-10 flex items-center justify-center w-8 h-full
                         bg-gradient-to-r from-white dark:from-[#0A0A0A] to-transparent
                         text-gray-600 hover:text-primary transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <div ref={navRef}
            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth w-full snap-x snap-mandatory px-4 lg:px-6"
            style={{ paddingLeft: canScrollLeft ? 32 : undefined, paddingRight: canScrollRight ? 32 : undefined }}>
            {navigationItems.map((item) => {
              const active = location.pathname === '/' + item.id || location.pathname.startsWith('/' + item.id + '/');
              return (
                <button key={item.id} data-active={active} onClick={() => navigate('/' + item.id)}
                  className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl
                    text-[10px] font-black uppercase tracking-widest whitespace-nowrap flex-shrink-0
                    transition-all duration-300 group snap-start
                    ${active
                      ? 'bg-emerald-50 dark:bg-primary/10 text-primary dark:text-emerald-400'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-white/5'
                    }`}>
                  <item.icon className={`w-3.5 h-3.5 flex-shrink-0 transition-all duration-300 group-hover:scale-110 group-hover:rotate-6
                    ${active ? 'text-primary' : item.color}`} />
                  <span>{item.label}</span>
                  {active && (
                    <span className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-primary
                                     shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                  )}
                </button>
              );
            })}
          </div>
          {canScrollRight && (
            <button onClick={() => scrollNav('right')}
              className="absolute right-0 z-10 flex items-center justify-center w-8 h-full
                         bg-gradient-to-l from-white dark:from-[#0A0A0A] to-transparent
                         text-gray-600 hover:text-primary transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ── Spacer (mobile) ── */}
        <div className="flex-1 md:hidden" />

        {/* ── Right Controls ── */}
        <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">

          {/* Sync Badge */}
          <SyncStatusBadge />

          {/* Force Sync */}
          <button
            onClick={async () => {
              sonner.loading(t('clear_cache_toast', 'Force cleaning system cache & syncing...'));
              try {
                // 1. Clear PWA Caches
                if ('caches' in window) {
                  const keys = await caches.keys();
                  await Promise.all(keys.map(key => caches.delete(key)));
                }
                // 2. Clear Session
                sessionStorage.clear();
                
                // 3. Force Reload
                sonner.success(t('rebooting', 'Cache cleared! Rebooting...'));
                setTimeout(() => window.location.reload(), 800);
              } catch (err) {
                window.location.reload();
              }
            }}
            title="Force Fresh Cloud Sync & Clear Cache"
            className="w-9 h-9 flex items-center justify-center flex-shrink-0 rounded-xl text-blue-500 hover:text-blue-700 dark:hover:text-blue-300
                       hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
          >
            <RefreshCw className="h-5 w-5" />
          </button>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            title={state.settings.theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className={`w-9 h-9 flex items-center justify-center flex-shrink-0 rounded-xl transition-all active:scale-95 ${state.settings.theme === 'dark'
              ? 'text-amber-400 hover:bg-amber-400/10'
              : 'text-blue-600 hover:bg-blue-600/10'
              }`}
          >
            {state.settings.theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>





          {/* ── User Section ── */}
          <div
            onClick={() => onShowMobileMenu?.()}
            className="flex items-center gap-2 lg:gap-2.5 ml-1 cursor-pointer lg:cursor-default group"
          >
            <div className="hidden xl:block text-right leading-none">
              <p className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-tight truncate max-w-[110px]">
                {state.currentUser?.name}
              </p>
              <div className="flex items-center justify-end gap-1 mt-0.5">
                <p className="text-[9px] font-bold text-primary uppercase tracking-widest">
                  @{state.currentUser?.username || 'user'}
                </p>
                <span className="text-[8px] text-gray-600 opacity-60">· {state.currentUser?.role}</span>
              </div>
            </div>

            <div className="h-9 w-9 lg:h-10 lg:w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-blue-600
                            flex items-center justify-center overflow-hidden shadow-sm flex-shrink-0 ring-offset-2 ring-emerald-500/0 group-active:ring-2 group-active:ring-emerald-500/50 transition-all">
              {state.currentUser?.avatar
                ? <img src={state.currentUser.avatar} alt="Avatar" className="h-full w-full object-cover" />
                : <User className="h-5 w-5 text-white" />}
            </div>

            <div className="hidden md:flex items-center gap-0.5">
              <button onClick={(e) => { e.stopPropagation(); navigate('/settings'); }}
                className="p-2 rounded-xl text-gray-600 hover:text-gray-700 dark:hover:text-white
                           hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                <Settings className="h-5 w-5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleLogout(); }}
                className="p-2 rounded-xl text-gray-600 hover:text-red-500 dark:hover:text-red-400
                           hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile Drawer Menu ── */}
      {renderDrawer && (
        <div className="fixed inset-0 z-[300] overflow-hidden">
          {/* Backdrop with slide-in mask */}
          <div 
            onClick={() => onHideMobileMenu?.()}
            className={`absolute inset-0 bg-black/60 transition-opacity duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0'}`} 
          />
          {/* Drawer Card */}
          <div 
            className={`fixed top-0 right-0 bottom-0 w-[280px] sm:w-[320px] lg:w-[450px] bg-white/95 dark:bg-[#0A0A0A]/95 backdrop-blur-xl shadow-2xl border-l border-gray-200/50 dark:border-white/5 flex flex-col z-[300] transform transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}
          >
            <div 
              className="flex items-center justify-between mb-2 px-4 flex-shrink-0"
              style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top))' }}
            >
              <div className="flex items-center gap-2">
                <div className="w-1 h-6 bg-primary rounded-full" />
                <h2 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tighter">ZAYNAHSPOS.COM</h2>
              </div>
              <button onClick={() => onHideMobileMenu?.()} className="p-1.5 rounded-xl bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 transition-all active:scale-90 text-gray-600 dark:text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div 
              className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar"
              style={{ paddingBottom: 'calc(3.5rem + env(safe-area-inset-bottom))' }}
            >
              {/* User card at top */}
              <div className="flex items-center gap-3 p-2 rounded-[1rem] bg-gray-50/50 dark:bg-primary/5 border border-gray-200/50 dark:border-primary/10 mb-1.5 shadow-sm mx-4">
                <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center overflow-hidden shadow-lg flex-shrink-0 ring-2 ring-white dark:ring-white/5">
                  {state.currentUser?.avatar
                    ? <img src={state.currentUser.avatar} alt="Avatar" className="h-full w-full object-cover" />
                    : <User className="h-8 w-8 text-white" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight leading-tight truncate">
                    {state.currentUser?.name}
                  </p>
                  <div className="flex flex-col gap-0.5 mt-1">
                    <p className="text-[11px] font-bold text-primary uppercase tracking-widest">
                      @{state.currentUser?.username || 'user'}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-gray-600 opacity-80 capitalize font-bold">{state.currentUser?.role}</span>
                      <div className="transform scale-90 origin-right">
                        <SyncStatusBadge />
                      </div>
                    </div>
                  </div>
                </div>
              </div>



              {/* Navigation Section Label */}
              <p className="px-6 mb-2 text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-[0.2em]">{t('management_tools', 'Management Tools')}</p>

              {/* Nav grid — 3 cols */}
              <nav className="grid grid-cols-3 gap-1 mb-2 px-4">
                {navigationItems.map((item) => {
                  const active = location.pathname === '/' + item.id || location.pathname.startsWith('/' + item.id + '/');
                  return (
                    <button key={item.id}
                      onClick={() => { navigate('/' + item.id); onHideMobileMenu?.(); }}
                      className={`flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl transition-all duration-300 group ${active
                        ? 'bg-primary text-white shadow-xl shadow-emerald-500/25 scale-105'
                        : 'bg-gray-50 dark:bg-white/[0.03] text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10'
                        }`}>
                      <div className={`p-2 rounded-xl transition-colors ${active ? 'bg-white/20' : 'bg-white dark:bg-black/20 shadow-sm'}`}>
                        <item.icon className={`h-4 w-4 ${active ? 'text-white' : item.color}`} />
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-tight leading-none text-center">{item.label}</span>
                    </button>
                  );
                })}
              </nav>

              {/* Account Settings Label */}
              <p className="px-6 mb-2 text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-[0.2em]">{t('system_account', 'System & Account')}</p>

              <div className="flex flex-col gap-2 px-4 pb-6">
                <button onClick={toggleTheme}
                  className="flex items-center justify-between w-full p-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest bg-gray-50 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-all border border-gray-200 dark:border-white/5 active:scale-95">
                  <div className="flex items-center gap-3">
                    {state.settings.theme === 'dark' ? <Moon className="h-5 w-5 text-blue-400" /> : <Sun className="h-5 w-5 text-amber-500" />}
                    <span>{state.settings.theme === 'dark' ? t('theme_dark', 'Dark Mode') : t('theme_light', 'Light Mode')}</span>
                  </div>
                  <div className={`w-10 h-5 rounded-full p-1 transition-colors ${state.settings.theme === 'dark' ? 'bg-primary' : 'bg-gray-300'}`}>
                    <div className={`w-3 h-3 bg-white rounded-full transition-transform ${state.settings.theme === 'dark' ? 'translate-x-5' : ''}`} />
                  </div>
                </button>

                <button onClick={() => { navigate('/settings'); onHideMobileMenu?.(); }}
                  className="flex items-center gap-3 p-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest bg-gray-50 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-all border border-gray-200 dark:border-white/5">
                  <div className="p-2.5 rounded-2xl bg-blue-500/10 text-blue-500">
                    <Settings className="w-5 h-5" />
                  </div>
                  {t('settings', 'Settings')}
                </button>

                <button
                  onClick={() => { onHideMobileMenu?.(); handleLogout(); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 bg-red-500 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-red-500/20 active:scale-95 transition-all">
                  <div className="p-2.5 rounded-2xl bg-white/20 text-white">
                    <LogOut className="h-5 w-5" />
                  </div>
                  {t('logout', 'Logout Account')}
                </button>
              </div>

              {/* Version / Copyright */}
              <div className="mt-2 mb-8 text-center">
                <p className="text-[10px] font-black text-gray-600 dark:text-white/10 uppercase tracking-[0.3em]">Zaynahs POS v12.0</p>
              </div>
            </div>

          </div>
        </div>
      )}
    </header>
  );
}