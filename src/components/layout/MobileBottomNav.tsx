import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/SupabaseAppContext';
import { useTranslation } from '../../hooks/useTranslation';
import { AppIcons } from '../../lib/icons';
import { Button } from '../../shared/ui';
import { can } from '../../lib/permissions';

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
    { id: 'pos', label: t('pos', 'POS'), icon: AppIcons.pos, perm: 'view_pos' as const },
    { id: 'transactions', label: t('sales', 'Sales'), icon: AppIcons.sales, perm: 'view_transactions' as const },
    { id: 'inventory', label: t('stock', 'Stock'), icon: AppIcons.inventory, perm: 'view_inventory' as const },
  ];

  // Real RBAC (MASTER §2): only show items the role can access.
  navItems.unshift({ id: 'dashboard', label: t('home', 'Home'), icon: AppIcons.dashboard, perm: 'view_dashboard' as const });
  navItems.push({ id: 'customers', label: t('clients', 'Clients'), icon: AppIcons.customers, perm: 'view_customers' as const });

  const visibleItems = navItems.filter((item) => can(role, item.perm));

  return (
    <div className="md:hidden bg-white/95 dark:bg-zinc-950/95 border-t border-gray-200/50 dark:border-white/5 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_25px_rgba(0,0,0,0.06)] z-[40] flex-shrink-0 backdrop-blur-md">
      <div className="flex items-center justify-around h-14 max-w-md mx-auto">
        {visibleItems.map((item) => {
          const active = location.pathname === '/' + item.id || location.pathname.startsWith('/' + item.id + '/');
          return (
            <Button
              key={item.id}
              variant="ghost"
              onClick={() => navigate('/' + item.id)}
              className={`!flex-1 !flex !flex-col !items-center !justify-center !py-1 !gap-0.5 !min-h-[44px] ${
                active 
                  ? '!text-primary' 
                  : '!text-gray-400 dark:!text-zinc-500 hover:!text-gray-600 dark:hover:!text-zinc-300'
              }`}
            >
              <div className={`p-1.5 rounded-full transition-all ${active ? 'bg-primary/10' : ''}`}>
                <item.icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
              </div>
              <span className="text-[8px] font-black uppercase tracking-wider">{item.label}</span>
              {active && (
                <div className="w-1 h-1 rounded-full bg-primary mt-0.5" />
              )}
            </Button>
          );
        })}
        
        {/* Menu Toggle */}
        <Button
          variant="ghost"
          onClick={onShowMenu}
          className="!flex-1 !flex !flex-col !items-center !justify-center !py-1 !gap-0.5 !min-h-[44px] !text-gray-400 dark:!text-zinc-500 hover:!text-gray-600 dark:hover:!text-zinc-300"
        >
          <div className="p-1.5 rounded-full">
            <AppIcons.menu className="w-5 h-5" />
          </div>
          <span className="text-[8px] font-black uppercase tracking-wider">{t('more', 'More')}</span>
        </Button>
      </div>
    </div>
  );
}
