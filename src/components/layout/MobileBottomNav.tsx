import { 
  ShoppingCart, 
  Receipt, 
  Package, 
  Users, 
  BarChart3, 
  LayoutDashboard,
  Menu
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/SupabaseAppContext';
import { useTranslation } from '../../hooks/useTranslation';

interface MobileBottomNavProps {
  onShowMenu: () => void;
}

export function MobileBottomNav({ onShowMenu }: MobileBottomNavProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = useApp();
  const { t } = useTranslation();
  const role = state.currentUser?.role;

  const navItems = [
    { id: 'pos', label: t('pos', 'POS'), icon: ShoppingCart },
    { id: 'transactions', label: t('sales', 'Sales'), icon: Receipt },
    { id: 'inventory', label: t('stock', 'Stock'), icon: Package },
  ];

  // Add Dashboard for admins/managers
  if (role === 'admin' || role === 'manager') {
    navItems.unshift({ id: 'dashboard', label: t('home', 'Home'), icon: LayoutDashboard });
  } else {
    // For others, maybe Customers?
    navItems.push({ id: 'customers', label: t('clients', 'Clients'), icon: Users });
  }

  return (
    <div className="md:hidden bg-white dark:bg-app border-t border-gray-200 dark:border-white/5 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-[40] flex-shrink-0">
      <div className="flex items-center justify-around h-14 max-w-md mx-auto">
        {navItems.map((item) => {
          const active = location.pathname === '/' + item.id || location.pathname.startsWith('/' + item.id + '/');
          return (
            <button
              key={item.id}
              onClick={() => navigate('/' + item.id)}
              className={`flex flex-col items-center justify-center flex-1 py-1 gap-0.5 transition-all duration-300 min-h-[44px] ${
                active 
                  ? 'text-primary scale-110' 
                  : 'text-gray-600 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-600'
              }`}
            >
              <div className={`p-1.5 rounded-xl transition-all ${active ? 'bg-primary/10' : ''}`}>
                <item.icon className="w-5 h-5 md:w-6 md:h-6" strokeWidth={active ? 2.5 : 2} />
              </div>
              <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest">{item.label}</span>
              {active && (
                <div className="w-1 h-1 rounded-full bg-primary animate-pulse" />
              )}
            </button>
          );
        })}
        
        {/* Menu Toggle */}
        <button
          onClick={onShowMenu}
          className="flex flex-col items-center justify-center flex-1 py-1 gap-0.5 text-gray-600 dark:text-gray-500 min-h-[44px]"
        >
          <div className="p-1.5 rounded-xl">
            <Menu className="w-5 h-5 md:w-6 md:h-6" />
          </div>
          <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest">{t('more', 'More')}</span>
        </button>
      </div>
    </div>
  );
}
