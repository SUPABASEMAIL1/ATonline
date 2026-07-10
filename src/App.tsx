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

import { playPageSound } from './lib/sounds';
import { TouchKeyboardProvider, useTouchKeyboard } from './providers/TouchKeyboardProvider';
import { startSyncEngine } from './lib/syncEngine';
import { MobileBottomNav } from './components/layout/MobileBottomNav';
import { Toaster } from 'sonner';
import { DialogProvider } from './components/common/DialogProvider';
import { useTranslation } from './hooks/useTranslation';
import { OfflineBanner } from './components/OfflineBadge';


const LoadingView = () => {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex items-center justify-center p-12">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest animate-pulse">{t("loading_module", "Loading Module...")}</p>
      </div>
    </div>
  );
};

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
      playPageSound();
      prevPath.current = location.pathname;
    }
  }, [location.pathname]);

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
    return (
      <div className="min-h-[100dvh] bg-gray-50 dark:bg-app flex items-center justify-center transition-colors">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Intercept for password recovery mode



  // ── Route-based access control ──
  function RequireAccess({ viewId, children }: { viewId: string; children: React.ReactNode }) {
    const userRole = state.currentUser?.role;
    const perms = state.currentUser?.permissions || [];

    const allowed = (() => {
      if (userRole === 'admin') return true;
      switch (viewId) {
        case 'pos': return true;
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
    const currentUser = state.currentUser;
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
    }, [currentUser]);
    // Show nothing (transparent) until redirect fires — avoids LoadingView blink
    return null;
  }

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
      {isRecoveringPassword ? (
        <ResetPasswordPage />
      ) : !user || !state.currentUser || !state.currentUser.active ? (
        <LoginPage />
      ) : (
        <>
          <DialogProvider />
          <Header onShowMobileMenu={() => setIsMobileMenuOpen(true)} isMobileMenuOpen={isMobileMenuOpen} onHideMobileMenu={() => setIsMobileMenuOpen(false)} />
          <main className="flex-1 min-h-0 relative overflow-y-auto overflow-x-hidden" style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
            <Suspense fallback={null}>
              <Routes>
                <Route path="/pos" element={<POSTerminal />} />
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
              <div className="absolute inset-0 bg-white/60 dark:bg-black/80-[2px] z-[100] flex items-center justify-center animate-in fade-in duration-300">
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