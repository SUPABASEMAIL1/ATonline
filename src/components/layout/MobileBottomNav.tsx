import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/SupabaseAppContext';
import { useTranslation } from '../../hooks/useTranslation';
import { AppIcons } from '../../lib/icons';
import { Button } from '../../shared/ui';

interface MobileBottomNavProps {
  onShowMenu: () => void;
}

export function MobileBottomNav({ onShowMenu }: MobileBottomNavProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = useApp();
  const { t } = useTranslation();

  const navItems = [
    { id: 'pos', label: t('pos', 'POS'), icon: AppIcons.pos },
    { id: 'transactions', label: t('sales', 'Sales'), icon: AppIcons.sales },
    { id: 'inventory', label: t('stock', 'Stock'), icon: AppIcons.inventory },
  ];

  // Role logic removed — show Dashboard + Customers for all users
  navItems.unshift({ id: 'dashboard', label: t('home', 'Home'), icon: AppIcons.dashboard });
  navItems.push({ id: 'customers', label: t('clients', 'Clients'), icon: AppIcons.customers });

  return (
    <div className="md:hidden bg-white/95 dark:bg-zinc-950/95 border-t border-gray-200/50 dark:border-white/5 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_25px_rgba(0,0,0,0.06)] z-[40] flex-shrink-0 backdrop-blur-md">
      <div className="flex items-center justify-around h-14 max-w-md mx-auto">
        {navItems.map((item) => {
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
