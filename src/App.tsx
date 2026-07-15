import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider, useApp } from './context/SupabaseAppContext';
import { LoginPage } from './components/auth/LoginPage';
import { ResetPasswordPage } from './components/auth/ResetPasswordPage';
import { Header } from './components/layout/Header';
import { POSTerminal } from './components/pos/POSTerminal';

// Lazy load heavy components
const TransactionsManager = lazy(() => import('./components/transactions/TransactionsManager').then(m => ({ default: m.TransactionsManager })));
const InventoryManager = lazy(() => import('./components/inventory/InventoryManager').then(m => ({ default: m.InventoryManager })));
const CustomerManager = lazy(() => import('./components/customers/CustomerManager').then(m => ({ default: m.CustomerManager })));
const ReportsManager = lazy(() => import('./components/reports/ReportsManager').then(m => ({ default: m.ReportsManager })));
const Settings = lazy(() => import('./components/settings/Settings').then(m => ({ default: m.Settings })));
const DiscountManager = lazy(() => import('./components/discounts/DiscountManager').then(m => ({ default: m.DiscountManager })));
const UserManager = lazy(() => import('./components/users/UserManager').then(m => ({ default: m.UserManager })));
const ExpenseManager = lazy(() => import('./components/expenses/ExpenseManager').then(m => ({ default: m.ExpenseManager })));
const SupplierManager = lazy(() => import('./components/inventory/suppliers/SupplierManager').then(m => ({ default: m.SupplierManager })));
const PurchaseOrderSystem = lazy(() => import('./components/inventory/PurchaseOrderSystem').then(m => ({ default: m.PurchaseOrderSystem })));
const DashboardManager = lazy(() => import('./components/dashboard/DashboardManager').then(m => ({ default: m.DashboardManager })));
const EStoreApp = lazy(() => import('./components/estore/EStoreApp').then(m => ({ default: m.EStoreApp })));
const OnlineOrdersPage = lazy(() => import('./components/orders/OnlineOrdersPage').then(m => ({ default: m.OnlineOrdersPage })));
import { playPageSound } from './lib/sounds';
import { SkeletonLoader } from './components/common/SkeletonLoader';
import { TouchKeyboardProvider, useTouchKeyboard } from './providers/TouchKeyboardProvider';
import { startSyncEngine } from './lib/syncEngine';
import { MobileBottomNav } from './components/layout/MobileBottomNav';
import { Toaster } from 'sonner';
import { DialogProvider } from './components/common/DialogProvider';
import { useTranslation } from './hooks/useTranslation';
import { OfflineBanner } from './components/OfflineBadge';


const LoadingView = () => {
  return (
    <div className="flex-1 p-4 sm:p-6 space-y-6 bg-gray-50/50 dark:bg-app w-full overflow-hidden animate-pulse">
      {/* Header Row Skeleton */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-2">
          <div className="h-6 w-48 bg-gray-200 dark:bg-white/5 rounded-xl"></div>
          <div className="h-3.5 w-32 bg-gray-200/60 dark:bg-white/5 rounded-lg"></div>
        </div>
        <div className="h-10 w-full sm:w-64 bg-gray-200 dark:bg-white/5 rounded-2xl"></div>
      </div>

      {/* Stats Cards Grid Skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="h-24 bg-gradient-to-br from-gray-200/50 to-gray-200 dark:from-white/[0.03] dark:to-white/[0.01] border border-gray-100 dark:border-white/5 rounded-[1.5rem] p-4 flex flex-col justify-between">
            <div className="h-3 w-16 bg-gray-300 dark:bg-white/10 rounded-lg"></div>
            <div className="h-6 w-24 bg-gray-300 dark:bg-white/10 rounded-xl mt-2"></div>
          </div>
        ))}
      </div>

      {/* Main Workspace Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Heavy Content (Chart/Table) */}
        <div className="lg:col-span-2 bg-white dark:bg-[#080808] border border-gray-100 dark:border-white/5 rounded-[2.5rem] p-6 h-[320px] flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <div className="h-4 w-32 bg-gray-200 dark:bg-white/10 rounded-lg"></div>
            <div className="h-8 w-24 bg-gray-200 dark:bg-white/10 rounded-xl"></div>
          </div>
          <div className="flex-1 flex items-end gap-3 mt-6">
            {[35, 60, 45, 80, 50, 75, 40, 95, 70, 85, 55, 90].map((h, i) => (
              <div key={i} className="flex-1 bg-gray-200/60 dark:bg-white/5 rounded-t-xl" style={{ height: `${h}%` }}></div>
            ))}
          </div>
        </div>

        {/* Right Sidebar List */}
        <div className="bg-white dark:bg-[#080808] border border-gray-100 dark:border-white/5 rounded-[2.5rem] p-6 h-[320px] flex flex-col gap-4">
          <div className="h-4 w-28 bg-gray-200 dark:bg-white/10 rounded-lg mb-2"></div>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gray-200 dark:bg-white/10"></div>
                <div className="space-y-1.5">
                  <div className="h-3 w-20 bg-gray-200 dark:bg-white/10 rounded-lg"></div>
                  <div className="h-2 w-12 bg-gray-200/60 dark:bg-white/10 rounded-md"></div>
                </div>
              </div>
              <div className="h-4 w-12 bg-gray-200 dark:bg-white/10 rounded-lg"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Route-based access control (moved outside AppContent to prevent unmount blinking) ──
function RequireAccess({ viewId, children }: { viewId: string; children: React.ReactNode }) {
  const { state } = useApp();
  const userRole = state.currentUser?.role;
  const perms = state.currentUser?.permissions || [];

  const allowed = (() => {
    if (userRole === 'admin') return true;
    switch (viewId) {
      case 'pos': return true;
      case 'online-orders': return true; // Anyone who can access POS can manage online orders or we can restrict it. Let's make it true for now.
      case 'transactions': return userRole === 'manager' || userRole === 'cashier';
      case 'expenses': return userRole === 'manager' || perms.includes('access_expenses');
      case 'inventory': return userRole === 'manager' || perms.includes('access_inventory') || !!state.currentUser?.canManageStock || !!state.currentUser?.canManagePO || !!state.currentUser?.canViewRecords;
      case 'customers': return userRole === 'manager' || perms.includes('access_customers');
      case 'reports': return userRole === 'manager' || perms.includes('access_reports') || !!state.currentUser?.canViewProfit;
      case 'discounts': return userRole === 'manager' || !!state.currentUser?.canGiveDiscount;
      case 'users': return false;
      case 'settings': return userRole === 'manager';
      case 'suppliers': return userRole === 'manager';
      case 'purchase-orders': return userRole === 'manager' || !!state.currentUser?.canManagePO;
      case 'dashboard': return userRole === 'manager';
      default: return false;
    }
  })();

  if (!allowed) return <Navigate to="/pos" replace />;
  return <>{children}</>;
}

// ── Root redirect based on role and saved preference ──
function RootRedirect() {
  const { state } = useApp();
  const currentUser = state.currentUser;
  const navigate = useNavigate();
  useEffect(() => {
    if (!currentUser) return;
    const savedView = localStorage.getItem('pos_current_view');
    if (savedView) {
      navigate('/' + savedView, { replace: true });
    } else if (currentUser.role === 'admin' || currentUser.role === 'manager') {
      navigate('/dashboard', { replace: true });
    } else {
      navigate('/pos', { replace: true });
    }
  }, [currentUser, navigate]);
  return null;
}

function AppContent() {
  const { user, loading, isRecoveringPassword } = useAuth();
  const { state, dispatch, loadData, forceSync } = useApp();
  const { isKeyboardOpen } = useTouchKeyboard();
  const { isRtl } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Persistence: Save last route to localStorage
  useEffect(() => {
    const path = location.pathname;
    if (path && path !== '/') {
      localStorage.setItem('pos_current_view', path.replace(/^\//, ''));
    }
  }, [location.pathname]);

  // Play transition sound on route changes
  const prevPath = useRef(location.pathname);
  useEffect(() => {
    if (prevPath.current !== location.pathname) {
      if (!location.pathname.startsWith('/store')) {
        playPageSound();
      }
      prevPath.current = location.pathname;
    }
  }, [location.pathname]);

  // Dynamic PWA Manifest Updater
  useEffect(() => {
    if (!state.settings) return;
    const bizName = state.settings.storeName || 'Zaynahs';
    const storeLogo = state.settings.storeLogo || '';
    const themeColor = state.settings.estoreThemeColor || '#10b981';
    const isStore = location.pathname.startsWith('/store');

    const generateManifest = (name: string, shortName: string, desc: string, startUrl: string, scope: string, bgColor: string, icons: any[]) => ({
      name,
      short_name: shortName,
      description: desc,
      theme_color: themeColor,
      background_color: bgColor,
      display: 'standalone' as const,
      orientation: isStore ? ('portrait' as const) : ('any' as const),
      start_url: startUrl,
      scope: scope,
      categories: isStore ? ['shopping', 'food', 'lifestyle'] : ['business', 'finance', 'productivity'],
      icons: icons
    });

    let iconsList = [
      { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
    ];

    if (isStore && storeLogo) {
      iconsList = [
        { src: storeLogo, sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: storeLogo, sizes: '192x192', type: 'image/png', purpose: 'any' }
      ];
      const appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
      if (appleIcon) {
        appleIcon.setAttribute('href', storeLogo);
      }
    }

    let manifest;
    if (isStore) {
      manifest = generateManifest(
        bizName,
        bizName.length > 12 ? bizName.substring(0, 12) : bizName,
        'Order online from ' + bizName,
        '/store', '/store',
        '#f9fafb',
        iconsList
      );
      document.title = bizName + ' - Online Store';
    } else {
      manifest = generateManifest(
        bizName + ' POS',
        (bizName + ' POS').substring(0, 12),
        'Point-of-sale system for ' + bizName,
        '/pos', '/',
        '#0a0a0a',
        iconsList
      );
      document.title = bizName + ' POS';
    }

    const manifestLink = document.querySelector('link[rel="manifest"]');
    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    if (manifestLink) {
      manifestLink.setAttribute('href', url);
    } else {
      const newLink = document.createElement('link');
      newLink.rel = 'manifest';
      newLink.href = url;
      document.head.appendChild(newLink);
    }
  }, [state.settings, location.pathname]);

  // Global navigation listener (convert old viewId events to router navigation)
  useEffect(() => {
    const handleNavigate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && typeof customEvent.detail === 'string') {
        navigate('/' + customEvent.detail);
      }
    };
    window.addEventListener('navigate', handleNavigate);
    return () => window.removeEventListener('navigate', handleNavigate);
  }, [navigate]);

  // Initialize offline sync service
  useEffect(() => {
    import('./lib/localDb').then(({ localDb }) => {
      // 1. Fix poisoned queue items created by old mapper
      localDb.pendingOps
        .filter(q => q.entity === 'products' && q.operation === 'create')
        .modify(q => {
          if (!q.payload.sku) q.payload.sku = q.payload.id || q.payload.barcode_value || `SKU-${Date.now()}`;
          if (q.payload.variantData) {
            q.payload.variant_data = q.payload.variantData;
            delete q.payload.variantData;
          }
        })
        .then(() => {
          // 2. Unstuck EVERYTHING so it tries again!
          return localDb.pendingOps.toCollection().modify({ retries: 0, status: 'pending' });
        })
        .then(() => startSyncEngine())
        .catch(() => startSyncEngine());
    });
  }, []);


  // Globally disable mouse wheel value changes on number inputs
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (document.activeElement?.getAttribute('type') === 'number') {
        (document.activeElement as HTMLElement).blur();
      }
    };
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

  // Theme switching and global listeners remain...

  // Handle Theme switching
  useEffect(() => {
    // Force dark by default if no setting is found yet
    const theme = state.settings.theme || 'dark';
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const isDark = theme === 'dark' || (theme === 'auto' && mediaQuery.matches);
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }

      // Update PWA / Mobile metadata dynamically
      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', isDark ? '#0A0A0A' : '#ffffff');
      }
      const appleStatus = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
      if (appleStatus) {
        appleStatus.setAttribute('content', isDark ? 'black-translucent' : 'default');
      }
    };

    applyTheme();
    mediaQuery.addEventListener('change', applyTheme);
    return () => mediaQuery.removeEventListener('change', applyTheme);
  }, [state.settings.theme]);

  // Show loading spinner while auth is loading
  if (loading) {
    const isStore = window.location.pathname.startsWith('/store');
    return <SkeletonLoader type={isStore ? "storefront" : "list"} count={8} />;
  }

  // Intercept for password recovery mode

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className="h-[100dvh] bg-gray-50 dark:bg-app flex flex-col overflow-hidden">
      <Toaster 
        position="top-center"
        expand={false}
        visibleToasts={3}
        richColors
        closeButton
        duration={3000}
        theme={state.settings.theme === 'auto' ? 'system' : state.settings.theme as any}
        toastOptions={{
          className: 'touch-none',
          style: {
            borderRadius: '1.25rem',
            padding: '12px 16px',
            fontSize: '11px',
            fontWeight: '900',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          },
          success: {
            style: {
              background: '#10b981',
              color: '#fff',
            },
          },
          error: {
            style: {
              background: '#f43f5e',
              color: '#fff',
            },
          },
          warning: {
            style: {
              background: '#f59e0b',
              color: '#fff',
            },
          },
          info: {
            style: {
              background: '#3b82f6',
              color: '#fff',
            },
          },
        }}
      />
      {location.pathname.startsWith('/store') ? (
        <Suspense fallback={<LoadingView />}>
          <EStoreApp />
        </Suspense>
      ) : isRecoveringPassword ? (
        <ResetPasswordPage />
      ) : !user || !state.currentUser || !state.currentUser.active ? (
        <LoginPage />
      ) : (
        <>
          <DialogProvider />
          <Header onShowMobileMenu={() => setIsMobileMenuOpen(true)} isMobileMenuOpen={isMobileMenuOpen} onHideMobileMenu={() => setIsMobileMenuOpen(false)} />
          <main className="flex-1 min-h-0 relative overflow-y-auto overflow-x-hidden bg-gray-50 dark:bg-app" style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
            <Suspense fallback={<LoadingView />}>
              <Routes>
                <Route path="/pos" element={<POSTerminal />} />
                <Route path="/online-orders" element={state.settings.estoreEnabled ? <RequireAccess viewId="online-orders"><OnlineOrdersPage /></RequireAccess> : <Navigate to="/pos" replace />} />
                <Route path="/transactions" element={<RequireAccess viewId="transactions"><TransactionsManager /></RequireAccess>} />
                <Route path="/expenses" element={<RequireAccess viewId="expenses"><ExpenseManager /></RequireAccess>} />
                <Route path="/inventory" element={<Navigate to="/inventory/products" replace />} />
                <Route path="/inventory/:subTab" element={<RequireAccess viewId="inventory"><InventoryManager /></RequireAccess>} />
                <Route path="/customers" element={<RequireAccess viewId="customers"><CustomerManager /></RequireAccess>} />
                <Route path="/reports" element={<Navigate to="/reports/sales" replace />} />
                <Route path="/reports/:subTab" element={<RequireAccess viewId="reports"><ReportsManager /></RequireAccess>} />
                <Route path="/discounts" element={<RequireAccess viewId="discounts"><DiscountManager /></RequireAccess>} />
                <Route path="/users" element={<RequireAccess viewId="users"><UserManager /></RequireAccess>} />
                <Route path="/settings" element={<Navigate to="/settings/general" replace />} />
                <Route path="/settings/:subTab" element={<RequireAccess viewId="settings"><Settings /></RequireAccess>} />
                <Route path="/suppliers" element={<RequireAccess viewId="suppliers"><SupplierManager /></RequireAccess>} />
                <Route path="/purchase-orders" element={<RequireAccess viewId="purchase-orders"><PurchaseOrderSystem /></RequireAccess>} />
                <Route path="/dashboard" element={<RequireAccess viewId="dashboard"><DashboardManager /></RequireAccess>} />
                <Route path="/" element={<RootRedirect />} />
                <Route path="*" element={<Navigate to="/pos" replace />} />
              </Routes>
            </Suspense>

            {state.loading && (
              <div className="absolute inset-0 bg-white/60 dark:bg-black/80 z-[100] flex items-center justify-center animate-in fade-in">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="h-8 w-8 bg-primary/10 rounded-full animate-pulse"></div>
                    </div>
                  </div>
                  {state.syncProgress && (
                    <div className="bg-white dark:bg-surface px-8 py-6 rounded-[2rem] shadow-2xl border border-gray-200 dark:border-white/5 flex flex-col items-center min-w-[320px] animate-in slide-in-from-bottom-4">
                      <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-1">{state.syncProgress.status}</p>
                      <div className="w-full h-1.5 bg-gray-100 dark:bg-white/5 rounded-full mt-4 overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-500 ease-out"
                          style={{ width: `${(state.syncProgress.current / state.syncProgress.total) * 100}%` }}
                        />
                      </div>
                      <div className="flex justify-between w-full mt-3">
                        <span className="text-[9px] font-black text-gray-600">STAGE {state.syncProgress.current}/{state.syncProgress.total}</span>
                        {state.syncProgress.size && <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">{state.syncProgress.size} DATA</span>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </main>
          <OfflineBanner />
          <MobileBottomNav onShowMenu={() => setIsMobileMenuOpen(true)} />
        </>
      )}
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <TouchKeyboardProvider>
          <AppContent />
        </TouchKeyboardProvider>
      </AppProvider>
    </AuthProvider>
  );
}

export default App;