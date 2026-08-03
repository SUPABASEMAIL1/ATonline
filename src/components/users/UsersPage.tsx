import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { Users, CreditCard } from 'lucide-react';
import { SubTabBar, SubTab } from '../../shared/ui';
import { UserManager } from './UserManager';
import { SalesmanManager } from './SalesmanManager';
import { useTranslation } from '../../hooks/useTranslation';

export function UsersPage() {
  const { subTab } = useParams<{ subTab: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Route /users to /users/staff by default
  if (!subTab || !['staff', 'salesmen'].includes(subTab)) {
    return <Navigate to="/users/staff" replace />;
  }

  const tabs: SubTab[] = [
    {
      id: 'staff',
      label: t('system_users', 'SYSTEM USERS'),
      icon: Users,
    },
    {
      id: 'salesmen',
      label: t('salesmen', 'SALESMEN'),
      icon: CreditCard,
    }
  ];

  const handleTabChange = (tabId: string) => {
    navigate(`/users/${tabId}`);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 bg-white dark:bg-black border-b border-gray-200 dark:border-white/10 relative z-20">
        <div className="max-w-[1600px] mx-auto px-1 sm:px-4 lg:px-6">
          <SubTabBar
            tabs={tabs}
            activeTabId={subTab}
            onTabChange={handleTabChange}
          />
        </div>
      </div>
      <div className="flex-1 overflow-hidden relative z-10 bg-gray-50 dark:bg-black/40">
        {subTab === 'staff' && <UserManager />}
        {subTab === 'salesmen' && <SalesmanManager />}
      </div>
    </div>
  );
}
