import { useState } from 'react';
import { Plus, Edit, Trash2, UserCheck, Crown, Shield, User, Users, Building2, CreditCard } from 'lucide-react';
import { User as UserType } from '../../types';
import { useApp } from '../../context/SupabaseAppContext';
import { useAuth } from '../../context/AuthContext';
import { SharedSearchBar } from '../../shared/modules/search-and-list';
import { Avatar, Badge, Button, EmptyState, Pagination, usePagination } from '../../shared/ui';
import { usersService } from '../../lib/services';
import { UserModal } from './UserModal';
import { formatAppDate, formatAppTime, formatAppDateTime } from '../../lib/dateUtils';
import { sonner } from '../../lib/sonner';
import { useTranslation } from '../../hooks/useTranslation';

export function UserManager() {
  const { state, dispatch } = useApp();
  const { refreshProfile, user: authUser } = useAuth();
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [loading, setLoading] = useState(false);

  const filteredUsers = state.users.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const { page, totalPages, pageItems, goToPage } = usePagination(filteredUsers, 50);


  const handleEditUser = (user: UserType) => {
    setEditingUser(user);
    setShowUserModal(true);
  };

  const handleDeleteUser = async (userId: string) => {
    if (userId === state.currentUser?.id) {
      sonner.warning('You cannot delete your own account');
      return;
    }

    const result = await sonner.deleteConfirm('user');
    if (result.isConfirmed) {
      setLoading(true);
      sonner.loading('Deleting user...');
      try {
        await usersService.delete(userId);
        dispatch({ type: 'SET_USERS', payload: state.users.filter(u => u.id !== userId) });
        sonner.success('User deleted successfully!');
      } catch (error: any) {
        sonner.error(`Error deleting user: ${error.message}`);
      } finally {
        setLoading(false);
        sonner.close();
      }
    }
  };

  const handleAddUser = () => {
    setEditingUser(null);
    setShowUserModal(true);
  };

  const togglePermission = async (user: UserType, key: keyof UserType) => {
    setLoading(true);
    sonner.loading(`Updating permissions...`);
    try {
      const updatedUser = await usersService.update(user.id, { [key]: !user[key] });
      
      // Refresh current user's profile if they are the one being edited
      if (user.id === authUser?.id) {
        await refreshProfile();
      }

      dispatch({
        type: 'SET_USERS',
        payload: state.users.map(u => u.id === user.id ? updatedUser : u)
      });
      sonner.success(`Permission updated successfully!`);
    } catch (error: any) {
      sonner.error(`Error updating permission: ${error.message}`);
    } finally {
      setLoading(false);
      sonner.close();
    }
  };

  const toggleUserStatus = async (user: UserType) => {
    if (user.id === state.currentUser?.id) {
      sonner.warning('You cannot deactivate your own account');
      return;
    }

    setLoading(true);
    sonner.loading(`${user.active ? 'Deactivating' : 'Activating'} user...`);
    try {
        const updatedUser = await usersService.update(user.id, { active: !user.active });
        
        // Refresh profile if editing self
        if (user.id === state.currentUser?.id) {
          await refreshProfile();
        }

        dispatch({
        type: 'SET_USERS',
        payload: state.users.map(u => u.id === user.id ? updatedUser : u)
      });
      sonner.success(`User ${user.active ? 'deactivated' : 'activated'} successfully!`);
    } catch (error: any) {
      sonner.error(`Error updating user: ${error.message}`);
    } finally {
      setLoading(false);
      sonner.close();
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return <Crown className="h-4 w-4" />;
      case 'manager':
        return <Shield className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'badge-warning';
      case 'manager':
        return 'badge-emerald-light';
      default:
        return 'badge-secondary';
    }
  };

  const activeUsers = state.users.filter(u => u.active).length;
  const adminUsers = state.users.filter(u => u.role === 'admin').length;
  const managerUsers = state.users.filter(u => u.role === 'manager').length;

  return (
    <div className="main-content-scroll p-1 sm:p-4 lg:p-6 bg-gray-50/50 dark:bg-app space-y-3 lg:space-y-6 max-w-[1400px] mx-auto">
      {/* Layer 1: Identity & Tab Navigation */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6 pb-2">
        <div className="flex flex-col md:flex-row md:items-center gap-4 sm:gap-6 xl:gap-10">
          <div className="flex items-center gap-4 shrink-0">
            <div className="h-10 w-10 sm:h-12 sm:w-12 bg-primary/10 rounded-xl flex items-center justify-center shadow-inner border border-primary/10">
              <Users className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            </div>
            <div className="shrink-0 flex flex-col">
              <h1 className="text-lg sm:text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tighter leading-none">{t('users', 'Users')}</h1>
              <p className="hidden sm:block text-gray-600 dark:text-gray-400 text-[9px] font-black uppercase tracking-[0.2em] mt-1 opacity-60">{t('management_tools', 'Management Hub')} • {state.users.length} {t('total', 'Total')}</p>
            </div>
          </div>

          {/* Redundant Switcher Removed to Fix Double Tabs */}
        </div>

        <div className="flex items-center gap-2">
           <Button
            variant="primary"
            onClick={handleAddUser}
            disabled={loading}
            icon={<Plus className="h-3.5 w-3.5" />}
          >
            {t('add_user', 'Add User')}
          </Button>
        </div>
      </div>

      {/* Layer 2: Filter Toolbar */}
      <div className="relative z-30 bg-white/50 dark:bg-black/20 p-3 lg:p-4 rounded-[1.75rem] border border-gray-200/50 dark:border-white/5 shadow-xl ring-1 ring-black/5 dark:ring-white/5">
        <SharedSearchBar
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder={t('search_users_placeholder', 'Search users by name, username or email...')}
        />
      </div>

      {/* Layer 3: Vibrant Stats section */}
      <div className="relative z-20 grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 mt-2">
        <div className="stat-card bg-gradient-to-br from-emerald-500 to-teal-700">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t('total_users', 'Total Users')}</span>
            <span className="stat-card-value">{state.users.length}</span>
          </div>
          <User className="stat-card-icon h-10 w-10 text-white" />
        </div>

        <div className="stat-card bg-gradient-to-br from-green-500 to-green-700">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t('active_now', 'Active Now')}</span>
            <span className="stat-card-value">{activeUsers}</span>
          </div>
          <UserCheck className="stat-card-icon h-10 w-10 text-white" />
        </div>

        <div className="stat-card bg-gradient-to-br from-purple-500 to-fuchsia-700">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t('admin_roles', 'Admin Roles')}</span>
            <span className="stat-card-value">{adminUsers}</span>
          </div>
          <Crown className="stat-card-icon h-10 w-10 text-white" />
        </div>

        <div className="stat-card bg-gradient-to-br from-orange-500 to-amber-700">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t('managers', 'Managers')}</span>
            <span className="stat-card-value">{managerUsers}</span>
          </div>
          <Shield className="stat-card-icon h-10 w-10 text-white" />
        </div>
      </div>

      {/* Main Table View */}
          <div className="bg-white dark:bg-surface rounded-3xl border border-gray-200 dark:border-white/5 overflow-hidden shadow-xl">
            <div className="overflow-x-auto scrollbar-hide">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/50 dark:bg-white/[0.02] border-b border-gray-200 dark:border-white/5">
                <th className="p-4 text-[10px] font-black uppercase text-gray-700 dark:text-gray-400 tracking-widest">{t('user_details', 'User Details')}</th>
                <th className="p-4 text-[10px] font-black uppercase text-gray-700 dark:text-gray-400 tracking-widest text-center">{t('role', 'Role')}</th>
                <th className="p-4 text-[10px] font-black uppercase text-gray-700 dark:text-gray-400 tracking-widest text-center">{t('price_override', 'Price Override')}</th>
                <th className="p-4 text-[10px] font-black uppercase text-gray-700 dark:text-gray-400 tracking-widest text-center">{t('discounts', 'Discounts')}</th>
                <th className="p-4 text-[10px] font-black uppercase text-gray-700 dark:text-gray-400 tracking-widest text-center">{t('last_login', 'Last Login')}</th>
                <th className="p-4 text-[10px] font-black uppercase text-gray-700 dark:text-gray-400 tracking-widest text-center">{t('status', 'Status')}</th>
                <th className="p-4 text-[10px] font-black uppercase text-gray-700 dark:text-gray-400 tracking-widest text-right">{t('actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-white/5">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-20 text-center">
                    <EmptyState
                      icon={<Users className="h-12 w-12 text-gray-600" />}
                      title={t('no_users_found', 'No users found')}
                      className="!p-0 !opacity-20"
                    />
                  </td>
                </tr>
              ) : (
                pageItems.map((user) => (
                  <tr key={user.id} className={`group hover:bg-gray-50 dark:hover:bg-white/[0.01] transition-colors ${!user.active ? 'opacity-40 grayscale-[0.5]' : ''}`}>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <Avatar src={user.avatar || undefined} name={user.name} size="md" shape="square" />
                        <div>
                          <p className="text-[11px] font-black text-gray-900 dark:text-white uppercase leading-none">{user.name}</p>
                          <p className="text-[9px] text-gray-600 font-bold mt-1 uppercase tracking-widest">@{user.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-center">
                       <Badge
                         tone={user.role === 'admin' ? 'warning' : user.role === 'manager' ? 'success' : 'neutral'}
                         size="sm"
                         icon={getRoleIcon(user.role)}
                         className={`!px-3 !py-1 ${
                           user.role === 'admin' ? '!text-amber-500 !border-amber-500/20' :
                           user.role === 'manager' ? '!bg-primary/10 !text-primary !border-primary/20' :
                           '!text-gray-600 !border-gray-500/20 dark:!text-gray-600'
                         }`}
                       >
                        {user.role === 'admin' ? t('full_administrator', 'ADMIN') : user.role === 'manager' ? t('operations_manager', 'MANAGER') : t('terminal_operator', 'CASHIER')}
                      </Badge>
                    </td>
                    <td className="p-4 text-center">
                      <Button
                        variant="ghost"
                        onClick={() => togglePermission(user, 'canEditPrice')}
                        disabled={loading || user.role === 'admin'}
                        className={`!min-h-0 !text-[9px] !px-3 !py-1 !rounded-full !border ${
                          user.canEditPrice || user.role === 'admin' ? '!bg-primary/10 !text-primary !border-primary/20' : '!bg-gray-500/10 !text-gray-600 !border-gray-500/10'
                        }`}
                      >
                        {user.canEditPrice || user.role === 'admin' ? t('allowed', 'ALLOWED') : t('locked', 'LOCKED')}
                      </Button>
                    </td>
                    <td className="p-4 text-center">
                      <Button
                        variant="ghost"
                        onClick={() => togglePermission(user, 'canGiveDiscount')}
                        disabled={loading || user.role === 'admin'}
                        className={`!min-h-0 !text-[9px] !px-3 !py-1 !rounded-full !border ${
                          user.canGiveDiscount || user.role === 'admin' ? '!bg-indigo-500/10 !text-indigo-500 !border-indigo-500/20' : '!bg-gray-500/10 !text-gray-600 !border-gray-500/10'
                        }`}
                      >
                        {user.canGiveDiscount || user.role === 'admin' ? t('allowed', 'ALLOWED') : t('locked', 'LOCKED')}
                      </Button>
                    </td>
                    <td className="p-4 text-center">
                      {user.lastLogin ? (
                        <div>
                          <p className="text-[10px] font-black text-gray-900 dark:text-white uppercase leading-none">{formatAppDate(user.lastLogin, state.settings.country)}</p>
                          <p className="text-[8px] text-gray-600 font-bold mt-1">{formatAppTime(user.lastLogin, state.settings.country)}</p>
                        </div>
                      ) : (
                        <span className="text-[9px] font-black text-gray-600 uppercase">{t('never', 'NEVER')}</span>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <Button
                        variant="ghost"
                        onClick={() => toggleUserStatus(user)}
                        disabled={loading || user.id === state.currentUser?.id}
                        className={`!min-h-0 !text-[9px] !px-3 !py-1 !rounded-full !border ${
                          user.active ? '!bg-primary/10 !text-primary !border-primary/20 hover:!bg-primary hover:!text-white' : '!bg-red-500/10 !text-red-500 !border-red-500/20 hover:!bg-red-500 hover:!text-white'
                        }`}
                      >
                        {user.active ? t('allowed', 'ACTIVE') : t('locked', 'INACTIVE')}
                      </Button>
                    </td>
                    <td className="p-4 text-right">
                       <div className="flex justify-end items-center gap-2 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          onClick={() => handleEditUser(user)}
                          disabled={loading}
                          aria-label="Edit user"
                          className="!min-h-0 !p-2 !rounded-xl !bg-emerald-50 dark:!bg-primary/10 !text-primary hover:!scale-110 active:!scale-95"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        {user.id !== state.currentUser?.id && (
                          <Button
                            variant="ghost"
                            onClick={() => handleDeleteUser(user.id)}
                            disabled={loading}
                            aria-label="Delete user"
                            className="!min-h-0 !p-2 !rounded-xl !bg-red-50 dark:!bg-red-500/10 !text-red-600 hover:!scale-110 active:!scale-95"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {totalPages > 1 && (
          <div className="p-4 sm:p-6 bg-gray-50/50 dark:bg-white/[0.02] border-t border-gray-200 dark:border-white/5 flex justify-center">
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={goToPage}
              totalItems={filteredUsers.length}
              mode="numbered"
            />
          </div>
        )}
      </div>


      <UserModal
        isOpen={showUserModal}
        onClose={() => setShowUserModal(false)}
        user={editingUser}
      />
    </div>
  );
}
