import { useState, useEffect } from 'react';
import { X, User, Mail, Lock, Shield, Crown, Loader2, Camera, Save, Tag, CreditCard, Package, Edit, Trash2, Database, ClipboardList, History, Wallet, Users, BarChart3 } from 'lucide-react';
import { SearchableSelect } from '../common/SearchableSelect';
import { User as UserType } from '../../types';
import { useApp } from '../../context/SupabaseAppContext';
import { useAuth } from '../../context/AuthContext';
import { usersService } from '../../lib/services';
import { createClient } from '@supabase/supabase-js';
import { supabase, adminSupabase } from '../../lib/supabase';
import { sonner } from '../../lib/sonner';
import { hashPasswordString } from '../../context/AuthContext';
import { Modal } from '../common/Modal';
import { cn } from '../../lib/utils';
import { useTranslation } from '../../hooks/useTranslation';
import { MediaLibrary } from '../inventory/MediaLibrary';

if (typeof window !== 'undefined') {
  console.warn(
    '[SECURITY] UserModal imports adminSupabase (service_role key) in client bundle. ' +
    'This is required for auth user creation but exposes the key in browser JS. ' +
    'For production, move adminSupabase.auth.admin calls to a server/edge function.'
  );
}

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: UserType | null;
}

export function UserModal({ isOpen, onClose, user }: UserModalProps) {
  const { state, dispatch } = useApp();
  const { refreshProfile } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    name: '',
    email: '',
    password: '',
    role: 'cashier' as 'admin' | 'manager' | 'cashier',
    active: true,
    avatar: '',
    canEditPrice: false,
    canGiveDiscount: true,
    canDeleteSale: false,
    canViewProfit: false,
    canManageStock: false,
    canManagePO: false,
    canViewRecords: false,
    canEditSale: false,
    permissions: [] as string[]
  });
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData({
        username: user.username,
        name: user.name,
        email: user.email,
        password: '', // Don't pre-fill password for existing users
        role: user.role,
        active: user.active,
        avatar: user.avatar || '',
        canEditPrice: user.canEditPrice,
        canGiveDiscount: user.canGiveDiscount,
        canDeleteSale: user.canDeleteSale,
        canViewProfit: user.canViewProfit,
        canManageStock: user.canManageStock,
        canManagePO: user.canManagePO,
        canViewRecords: user.canViewRecords,
        canEditSale: user.canEditSale ?? false,
        permissions: user.permissions || []
      });
    } else {
      setFormData({
        username: '',
        name: '',
        email: '',
        password: '',
        role: 'cashier',
        active: true,
        avatar: '',
        canEditPrice: false,
        canGiveDiscount: true,
        canDeleteSale: false,
        canViewProfit: false,
        canManageStock: false,
        canManagePO: false,
        canViewRecords: false,
        canEditSale: false,
        permissions: [] as string[]
      });
    }
  }, [user]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!formData.username.trim()) {
        sonner.error('Username is required');
        setLoading(false);
        return;
      }

      if (user) {
        // Update logic remains same

        if (formData.password && formData.password.length >= 6) {
          try {
            if (state.currentUser?.role !== 'admin') throw new Error('Only admins can update user passwords');
            if (!adminSupabase) throw new Error('Admin client not initialized (missing service key)');
            const { error: authError } = await adminSupabase.auth.admin.updateUserById(user.id, {
              password: formData.password
            });
            if (authError) throw authError;
          } catch (adminErr) {
            console.warn('[UserModal] Admin password update failed:', adminErr);
          }

          try {
            const hash = await hashPasswordString(formData.password);
            localStorage.setItem(`offline_hash_${formData.email}`, hash);
            const localU = await localDb.users.get(user.id);
            if (localU) {
              const updatedLocalU = { ...localU, offlineHash: hash };
              await localDb.users.put(updatedLocalU);
            }
            await supabase.from('users').update({ offline_hash: hash }).eq('id', user.id);
          } catch (hashErr) {
            console.warn('Failed to commit local password hash update:', hashErr);
          }
        }

        const updatePayload: Partial<UserType> = {
          username: formData.username,
          name: formData.name,
          email: formData.email,
          role: formData.role as 'admin' | 'manager' | 'cashier',
          active: formData.active,
          avatar: formData.avatar || undefined,
          canEditPrice: formData.role === 'admin' ? true : formData.canEditPrice,
          canGiveDiscount: formData.role === 'admin' ? true : formData.canGiveDiscount,
          canDeleteSale: formData.role === 'admin' ? true : (formData.role === 'cashier' ? false : formData.canDeleteSale),
          canViewProfit: formData.role === 'admin' ? true : formData.canViewProfit,
          canManageStock: formData.role === 'admin' ? true : formData.canManageStock,
          canManagePO: formData.role === 'admin' ? true : formData.canManagePO,
          canViewRecords: formData.role === 'admin' ? true : formData.canViewRecords,
          canEditSale: formData.role === 'admin' ? true : (formData.role === 'cashier' ? false : formData.canEditSale),
          permissions: formData.role === 'admin' ? ['access_payments', 'access_expenses', 'access_customers', 'access_reports', 'access_inventory'] : formData.permissions,
        };

        const updatedUser = await usersService.update(user.id, updatePayload);
        
        // Refresh current user's profile if they are the one being edited
        if (user.id === state.currentUser?.id) {
          await refreshProfile();
        }

        dispatch({
          type: 'SET_USERS',
          payload: state.users.map(u => u.id === user.id ? updatedUser : u)
        });
      } else {
        // Create logic remains same
        if (!formData.password || formData.password.length < 6) {
          sonner.error('Password must be at least 6 characters long');
          setLoading(false);
          return;
        }

        if (state.currentUser?.role !== 'admin') {
          throw new Error('Permission denied — only admins can create users');
        }
        if (!adminSupabase) {
          throw new Error('Permission denied — admin access required (missing service key)');
        }

        const normalizedUsername = formData.username.trim().toLowerCase();
        const resolvedEmail = formData.email.trim()
          ? formData.email.trim().toLowerCase()
          : `${normalizedUsername}.${Date.now().toString(36)}@zaynahs.local`;

        const hash = await hashPasswordString(formData.password);
        const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
          email: resolvedEmail,
          password: formData.password,
          email_confirm: true,
          user_metadata: {
            username: formData.username,
            full_name: formData.name,
            role: formData.role,
          }
        });

        if (authError) throw authError;

        const authUser = authData.user;

        await supabase.from('users').upsert({
          id: authUser.id,
          name: formData.name,
          email: resolvedEmail,
          role: formData.role,
          active: formData.active,
          username: formData.username,
          permissions: formData.role === 'admin' ? ['access_payments', 'access_expenses', 'access_customers', 'access_reports', 'access_inventory'] : formData.permissions,
          can_edit_price: formData.role === 'admin' ? true : formData.canEditPrice,
          can_give_discount: formData.role === 'admin' ? true : formData.canGiveDiscount,
          can_delete_sale: formData.role === 'admin' ? true : (formData.role === 'cashier' ? false : formData.canDeleteSale),
          can_view_profit: formData.role === 'admin' ? true : formData.canViewProfit,
          can_manage_stock: formData.role === 'admin' ? true : formData.canManageStock,
          can_manage_po: formData.role === 'admin' ? true : formData.canManagePO,
          can_view_records: formData.role === 'admin' ? true : formData.canViewRecords,
          can_edit_sale: formData.role === 'admin' ? true : (formData.role === 'cashier' ? false : formData.canEditSale),
          avatar: formData.avatar || null,
          offline_hash: hash
        }, { onConflict: 'id' });

        const newUser: UserType = {
          id: authUser.id,
          username: formData.username,
          name: formData.name,
          email: resolvedEmail,
          role: formData.role as 'admin' | 'manager' | 'cashier',
          permissions: formData.permissions,
          canEditPrice: formData.role === 'admin' || formData.canEditPrice,
          canGiveDiscount: formData.role === 'admin' || formData.canGiveDiscount,
          canDeleteSale: formData.role === 'admin' || (formData.role !== 'cashier' && formData.canDeleteSale),
          canViewProfit: formData.role === 'admin' || formData.canViewProfit,
          canManageStock: formData.role === 'admin' || formData.canManageStock,
          canManagePO: formData.role === 'admin' || formData.canManagePO,
          canViewRecords: formData.role === 'admin' || formData.canViewRecords,
          canEditSale: formData.role === 'admin' || (formData.role !== 'cashier' && formData.canEditSale),
          active: formData.active,
          avatar: formData.avatar || undefined
        };

        dispatch({
          type: 'SET_USERS',
          payload: [...state.users, newUser]
        });
      }

      onClose();
    } catch (error) {
      sonner.error(`Error saving user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  const toggleAccessPerm = (permStr: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      permissions: checked 
        ? [...prev.permissions.filter(p => p !== permStr), permStr]
        : prev.permissions.filter(p => p !== permStr)
    }));
  };



  const footer = (
    <div className="flex items-center justify-end gap-2 sm:gap-3 w-full">
      <button
        type="button"
        onClick={onClose}
        className="px-4 sm:px-6 py-2.5 sm:py-3.5 border border-rose-200 dark:border-rose-900/30 text-[#ff4b6e] hover:bg-rose-50 dark:hover:bg-rose-500/10 text-[9px] sm:text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all active:scale-95 shrink-0"
      >
        {t('discard_upper', 'DISCARD')}
      </button>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading}
        className="btn btn-md btn-primary flex-1 sm:flex-none sm:min-w-[240px] !py-2.5 sm:!py-3.5 !text-[9px] sm:!text-[11px]"
      >
        {loading ? <Loader2 className="w-4 h-4 sm:h-5 sm:w-5 animate-spin shrink-0" /> : <Save className="w-4 h-4 sm:h-5 sm:w-5 shrink-0" />}
        <span className="leading-none ml-2">
          {user ? t('commit_changes', 'COMMIT CHANGES') : t('register_operator', 'REGISTER OPERATOR')}
        </span>
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={user ? t('edit_operator', 'EDIT OPERATOR') : t('register_new_operator', 'REGISTER NEW OPERATOR')}
      maxWidth="lg"
      footer={footer}
    >
      <div className="space-y-10">
        {/* Identity & Biometrics */}
        <div className="space-y-6">
          <h3 className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest flex items-center gap-3">
            <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
            {t('identity_biometrics', 'Identity & Biometrics')}
          </h3>
          
          <div className="flex items-center gap-6">
            <div className="relative group">
              <div
                onClick={() => setShowMediaLibrary(true)}
                className="h-20 w-20 bg-gray-50 dark:bg-black/75 rounded-2xl flex items-center justify-center overflow-hidden border border-gray-200 dark:border-white/5 shadow-sm transition-all group-hover:border-primary/30 cursor-pointer"
              >
                {formData.avatar ? (
                  <img src={formData.avatar} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  <User className="h-10 w-10 text-gray-600" />
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowMediaLibrary(true)}
                className="absolute -bottom-2 -right-2 bg-white dark:bg-zinc-800 text-primary p-2 rounded-xl shadow-lg border border-gray-200 dark:border-white/10 hover:scale-110 active:scale-90 transition-all"
              >
                <Camera className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1">
              <p className="text-[12px] font-black text-gray-900 dark:text-white uppercase tracking-wider">{t('system_avatar', 'System Avatar')}</p>
              <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest mt-0.5">{t('authorized_visual_token', 'Authorized Visual Token')}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('full_legal_name', 'Full Legal Name *')}</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                placeholder="e.g. Michael Chen"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('username_label', 'Username *')}</label>
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                required
                disabled={!!user}
                className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 transition-all font-medium disabled:opacity-50"
                placeholder="m.chen"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('email_address_optional', 'Email Address (Optional)')}</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                placeholder="m.chen@local.com"
              />
            </div>
            <div className="space-y-2 md:col-span-3">
              <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('security_key_password', 'Security Key (Password)')}</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-600" />
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required={!user}
                  className="w-full pl-12 pr-4 bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl py-2.5 focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                  placeholder={user ? t('leave_blank_keep_current', 'Leave blank to keep current') : t('min_6_chars', 'Min 6 characters')}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Authority & Privileges */}
        <div className="space-y-6">
          <h3 className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest flex items-center gap-3">
            <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
            {t('operational_authority', 'Operational Authority')}
          </h3>
          <SearchableSelect
            label={t('select_role', 'SELECT ROLE')}
            options={[
              { id: 'admin', label: t('full_administrator', 'FULL ADMINISTRATOR') },
              { id: 'manager', label: t('operations_manager', 'OPERATIONS MANAGER') },
              { id: 'cashier', label: t('terminal_operator', 'TERMINAL OPERATOR') }
            ]}
            value={formData.role}
            onChange={(val) => setFormData(prev => ({ ...prev, role: val as any }))}
            icon={Shield}
            disabled={user?.id === state.currentUser?.id}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { key: 'canEditPrice', label: t('price_override', 'PRICE OVERRIDE'), icon: Tag },
              { key: 'canGiveDiscount', label: t('issue_discounts', 'ISSUE DISCOUNTS'), icon: CreditCard },
              { key: 'canEditSale', label: t('edit_sales', 'EDIT SALES'), icon: Edit },
              { key: 'canDeleteSale', label: t('delete_sales', 'DELETE SALES'), icon: Trash2 },
              { key: 'canManageStock', label: t('inventory_hub', 'INVENTORY HUB'), icon: Database },
              { key: 'canManagePO', label: t('restock_po', 'RESTOCK (PO)'), icon: ClipboardList },
              { key: 'canViewRecords', label: t('purchase_history', 'PURCHASE HISTORY'), icon: History },
              { key: 'canViewProfit', label: t('revenue_audit', 'REVENUE AUDIT'), icon: Crown, managerOnly: true },
            ].map((perm) => (
              (!perm.managerOnly || formData.role !== 'cashier') && 
              ((perm.key !== 'canEditSale' && perm.key !== 'canDeleteSale') || formData.role !== 'cashier') && (
                <div key={perm.key} className={cn(
                  "flex items-center justify-between p-4 rounded-[20px] border transition-all",
                  formData.role === 'admin' || (formData as any)[perm.key] 
                    ? 'bg-emerald-50 dark:bg-primary/5 border-emerald-100 dark:border-primary/20' 
                    : 'bg-[#f8f9fa] dark:bg-black/20 border-gray-200 dark:border-white/5'
                )}>
                  <div className="flex items-center gap-3">
                    <perm.icon className={cn(
                      "h-4 w-4",
                      formData.role === 'admin' || (formData as any)[perm.key] ? 'text-primary' : 'text-gray-600'
                    )} />
                    <span className={cn(
                      "text-[10px] font-black uppercase tracking-widest",
                      formData.role === 'admin' || (formData as any)[perm.key] ? 'text-primary dark:text-emerald-400' : 'text-gray-600'
                    )}>{perm.label}</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.role === 'admin' || (formData as any)[perm.key]}
                      disabled={formData.role === 'admin'}
                      onChange={(e) => setFormData(prev => ({ ...prev, [perm.key]: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-gray-200 dark:bg-white/10 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>
              )
            ))}
          </div>

          <h3 className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest flex items-center gap-3 pt-4">
            <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
            {t('module_access_control', 'Module Access Control')}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { key: 'access_inventory', label: t('inventory_module', 'INVENTORY MODULE'), icon: Package },
              { key: 'access_expenses', label: t('expenses_module', 'EXPENSES MODULE'), icon: Wallet },
              { key: 'access_customers', label: t('customers_module', 'CUSTOMERS MODULE'), icon: Users },
              { key: 'access_reports', label: t('reports_module', 'REPORTS MODULE'), icon: BarChart3 }
            ].map((mod) => (
              <div key={mod.key} className={cn(
                "flex items-center justify-between p-4 rounded-[20px] border transition-all",
                formData.role === 'admin' || formData.permissions.includes(mod.key)
                  ? 'bg-blue-50 dark:bg-blue-500/5 border-blue-100 dark:border-blue-500/20'
                  : 'bg-[#f8f9fa] dark:bg-black/20 border-gray-200 dark:border-white/5'
              )}>
                <div className="flex items-center gap-3">
                  <mod.icon className={cn(
                    "h-4 w-4",
                    formData.role === 'admin' || formData.permissions.includes(mod.key) ? 'text-blue-500' : 'text-gray-600'
                  )} />
                  <span className={cn(
                    "text-[10px] font-black uppercase tracking-widest",
                    formData.role === 'admin' || formData.permissions.includes(mod.key) ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600'
                  )}>{mod.label}</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.role === 'admin' || formData.permissions.includes(mod.key)}
                    disabled={formData.role === 'admin'}
                    onChange={(e) => toggleAccessPerm(mod.key, e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-gray-200 dark:bg-white/10 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Access Protocol */}
        <div className="p-5 bg-rose-50 dark:bg-rose-500/5 border border-rose-100 dark:border-rose-500/10 rounded-[24px] flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-tight">{t('system_status', 'System Status')}</span>
            <span className="text-[10px] text-rose-400 font-bold uppercase tracking-widest mt-0.5">{t('authorized_locked', 'Authorized / Locked')}</span>
          </div>
          <label className={cn(
            "relative inline-flex items-center cursor-pointer scale-110",
            user?.id === state.currentUser?.id && "opacity-50 pointer-events-none"
          )}>
            <input
              type="checkbox"
              checked={formData.active}
              onChange={(e) => setFormData(prev => ({ ...prev, active: e.target.checked }))}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 dark:bg-white/10 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-500"></div>
          </label>
        </div>
      </div>
      {showMediaLibrary && (
        <MediaLibrary
          isOpen={showMediaLibrary}
          onClose={() => setShowMediaLibrary(false)}
          onSelect={(url) => setFormData(prev => ({ ...prev, avatar: url }))}
        />
      )}
    </Modal>
  );
}
