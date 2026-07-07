import { useState, useEffect, useRef, lazy, Suspense } from 'react';
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
  const { state, dispatch } = useApp();
  const { isKeyboardOpen } = useTouchKeyboard();
  const { isRtl } = useTranslation();
  const [currentView, setCurrentView] = useState(() => localStorage.getItem('pos_current_view') || 'pos');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const hasRoutedIntially = useRef(false);

  // Persistence: Save currentView to localStorage
  useEffect(() => {
    localStorage.setItem('pos_current_view', currentView);
  }, [currentView]);

  // Initialize correct view based on role (only if no saved view or if saved view is not allowed)
  useEffect(() => {
    if (state.currentUser && !hasRoutedIntially.current) {
      const savedView = localStorage.getItem('pos_current_view');
      
      // If no saved view, use role defaults
      if (!savedView) {
        if (state.currentUser.role === 'admin' || state.currentUser.role === 'manager') {
          setCurrentView('dashboard');
        } else {
          setCurrentView('pos');
        }
      }
      hasRoutedIntially.current = true;
    }
  }, [state.currentUser]);

  // Play transition sound on view changes
  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    playPageSound();
  }, [currentView]);

  // Global navigation listener
  useEffect(() => {
    const handleNavigate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && typeof customEvent.detail === 'string') {
        setCurrentView(customEvent.detail);
      }
    };
    window.addEventListener('navigate', handleNavigate);
    return () => window.removeEventListener('navigate', handleNavigate);
  }, []);

  // Initialize offline sync service
  useEffect(() => {
    startSyncEngine();
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



  const renderCurrentView = () => {
    const userRole = state.currentUser?.role;
    const perms = state.currentUser?.permissions || [];

    // General unauthorized fallback handler
    const enforceAccess = (allowed: boolean, Component: React.ReactElement) => {
      if (allowed) return Component;
      setCurrentView('pos');
      return <POSTerminal />;
    };

    // Restrict cashiers and managers if they don't have explicit access to their current view (Fallback safety)
    if (userRole !== 'admin') {
      const allowedViews = ['pos'];

      if (userRole === 'manager' || userRole === 'cashier') {
        allowedViews.push('transactions');
      }
      if (userRole === 'manager') {
        allowedViews.push('dashboard', 'settings', 'expenses', 'customers', 'reports', 'discounts', 'suppliers', 'purchase-orders', 'inventory');
      }

      if (perms.includes('access_inventory') || state.currentUser?.canManageStock || state.currentUser?.canManagePO || state.currentUser?.canViewRecords) allowedViews.push('inventory');
      if (perms.includes('access_expenses')) allowedViews.push('expenses');
      if (perms.includes('access_customers')) allowedViews.push('customers');
      if (perms.includes('access_reports') || state.currentUser?.canViewProfit) allowedViews.push('reports');
      if (state.currentUser?.canGiveDiscount) allowedViews.push('discounts');
      if (state.currentUser?.canManagePO) allowedViews.push('purchase-orders');

      if (!allowedViews.includes(currentView)) {
        setCurrentView('pos');
        return <POSTerminal />;
      }
    }

    switch (currentView) {
      case 'pos':
        return <POSTerminal />;
      case 'transactions':
        return enforceAccess(userRole === 'admin' || userRole === 'manager' || userRole === 'cashier',
          <TransactionsManager onViewChange={setCurrentView} />);
      case 'expenses':
        return enforceAccess(userRole === 'admin' || userRole === 'manager' || perms.includes('access_expenses'),
          <ExpenseManager />);
      case 'inventory':
        return enforceAccess(userRole === 'admin' || userRole === 'manager' || perms.includes('access_inventory') || !!state.currentUser?.canManageStock || !!state.currentUser?.canManagePO || !!state.currentUser?.canViewRecords,
          <InventoryManager />);
      case 'customers':
        return enforceAccess(userRole === 'admin' || userRole === 'manager' || perms.includes('access_customers'),
          <CustomerManager />);
      case 'reports':
        return enforceAccess(userRole === 'admin' || userRole === 'manager' || perms.includes('access_reports') || !!state.currentUser?.canViewProfit,
          <ReportsManager />);
      case 'discounts':
        return enforceAccess(userRole === 'admin' || userRole === 'manager' || !!state.currentUser?.canGiveDiscount,
          <DiscountManager />);
      case 'users':
        return enforceAccess(userRole === 'admin',
          <UserManager />);
      case 'settings':
        if (userRole === 'admin' || userRole === 'manager') {
          return <Settings />;
        }
        setCurrentView('pos');
        return <POSTerminal />;

      case 'suppliers':
        if (userRole === 'admin' || userRole === 'manager') {
          return <SupplierManager />;
        }
        setCurrentView('pos');
        return <POSTerminal />;
      case 'purchase-orders':
        if (userRole === 'admin' || userRole === 'manager' || state.currentUser?.canManagePO) {
          return <PurchaseOrderSystem />;
        }
        setCurrentView('pos');
        return <POSTerminal />;
      case 'dashboard':
        if (userRole === 'admin' || userRole === 'manager') {
          return <DashboardManager onNavigate={setCurrentView} />;
        }
        setCurrentView('pos');
        return <POSTerminal />;
      default:
        return <POSTerminal />;
    }
  };

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className="h-[100dvh] bg-gray-50 dark:bg-app flex flex-col overflow-hidden">
      <Toaster 
        position="top-right"
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
          <Header currentView={currentView} onViewChange={setCurrentView} onShowMobileMenu={() => setIsMobileMenuOpen(true)} isMobileMenuOpen={isMobileMenuOpen} onHideMobileMenu={() => setIsMobileMenuOpen(false)} />
          <main className="flex-1 min-h-0 relative overflow-y-auto overflow-x-hidden" style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
            <Suspense fallback={<LoadingView />}>
              {renderCurrentView()}
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
          <MobileBottomNav 
            currentView={currentView} 
            // @ts-ignore
            onViewChange={(view) => {
              setCurrentView(view);
              setIsMobileMenuOpen(false);
            }} 
            onShowMenu={() => setIsMobileMenuOpen(true)} 
          />
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