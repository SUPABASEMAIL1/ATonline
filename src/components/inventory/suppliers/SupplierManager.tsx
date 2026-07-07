import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../../context/SupabaseAppContext';
import { useAuth } from '../../../context/AuthContext';
import { Search, Plus, Edit, Trash2, Phone, Mail, MapPin, Briefcase, FileText, Wallet, ArrowRight, User, Truck, Building2, Users, CreditCard, Receipt } from 'lucide-react';
import { subDays, startOfDay, endOfDay, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { Supplier } from '../../../types';
import { suppliersService } from '../../../lib/services';
import { sonner } from '../../../lib/sonner';
import { formatCurrency } from '../../../lib/currencies';
import { SupplierLedger } from './SupplierLedger';
import { SearchableSelect } from '../../common/SearchableSelect';
import { SupplierModal } from './SupplierModal';
import { useTranslation } from '../../../hooks/useTranslation';
import { formatAppDate, getTimezone, getStartOfDayInTimezone, getEndOfDayInTimezone, getStartOfInputDayInTimezone, getEndOfInputDayInTimezone } from '../../../lib/dateUtils';

export function SupplierManager() {
  const { state, dispatch } = useApp();
  const { profile } = useAuth();
  const { t } = useTranslation();
  const isAdmin = profile?.role === 'admin';
  const canManage = isAdmin || profile?.canManagePO; // Usually managers/admins

  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [startDateInput, setStartDateInput] = useState('');
  const [endDateInput, setEndDateInput] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [totalRemaining, setTotalRemaining] = useState<number>(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  // Calculate total remaining balance across all suppliers
  useEffect(() => {
    let cancelled = false;
    const loadTotals = async () => {
      try {
        const balances = await Promise.all(
          state.suppliers.map(s => suppliersService.getBalance(s.id))
        );
        if (!cancelled) {
          setTotalRemaining(balances.reduce((sum, b) => sum + b, 0));
        }
      } catch (err) {
        console.error('Failed to load supplier balances', err);
      }
    };
    loadTotals();
    return () => { cancelled = true; };
  }, [state.suppliers]);

  // Stats
  const activeSuppliers = state.suppliers.length;

  const filteredSuppliers = useMemo(() => {
    return state.suppliers.filter(s =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.businessType?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.phone?.includes(searchTerm)
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [state.suppliers, searchTerm]);

  const handleAddEdit = (supplier?: Supplier) => {
    setEditingSupplier(supplier || null);
    setIsModalOpen(true);
  };

  const handleSaveSupplier = async (formData: Partial<Supplier>) => {
    try {
      sonner.loading('Saving supplier...');
      if (editingSupplier) {
        const updated = await suppliersService.update(editingSupplier.id, formData);
        dispatch({ type: 'UPDATE_SUPPLIER', payload: updated });
        sonner.dismissAll();
        sonner.success('Supplier updated!');
      } else {
        const created = await suppliersService.create({
          ...(formData as any),
          workspaceId: state.currentUser?.workspace_id || state.settings.workspaceId || state.settings.id
        });
        dispatch({ type: 'SET_SUPPLIERS', payload: [...state.suppliers, created] });

        sonner.dismissAll();
        sonner.success('Supplier added!');
      }
    } catch (err) {
      console.error(err);
      sonner.error('Failed to save supplier.');
    } finally {
      sonner.close();
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!isAdmin) {
      sonner.error('Only administrators can delete suppliers.');
      return;
    }

    // Check if supplier is used in products
    const inUse = state.products.some(p => p.supplierId === id || p.supplier === name);
    if (inUse) {
      sonner.error('Cannot delete this supplier because there are products associated with them. Reassign the products first.');
      return;
    }

    const { isConfirmed } = await sonner.deleteConfirm('supplier record');
    if (isConfirmed) {
      try {
        sonner.loading('Deleting...');
        await suppliersService.delete(id);
        dispatch({ type: 'DELETE_SUPPLIER', payload: id });
        sonner.dismissAll();
        sonner.success('Supplier deleted successfully.');
      } catch (err) {
        console.error(err);
        sonner.error('Failed to delete supplier.');
      } finally {
        sonner.close();
      }
    }
  };

  const { validStartDate, validEndDate } = useMemo(() => {
    const timezone = getTimezone(state.settings.country);
    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    if (dateFilter === 'custom') {
      startDate = startDateInput
        ? new Date(getStartOfInputDayInTimezone(startDateInput, timezone).getTime())
        : new Date(getStartOfDayInTimezone(now, timezone).getTime());
      endDate = endDateInput
        ? new Date(getEndOfInputDayInTimezone(endDateInput, timezone).getTime())
        : new Date(getEndOfDayInTimezone(now, timezone).getTime());
    } else if (dateFilter === 'today') {
      startDate = getStartOfDayInTimezone(now, timezone);
      endDate = getEndOfDayInTimezone(now, timezone);
    } else if (dateFilter === 'yesterday') {
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      startDate = getStartOfDayInTimezone(yesterday, timezone);
      endDate = getEndOfDayInTimezone(yesterday, timezone);
    } else if (dateFilter === 'last7') {
      const last7 = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      startDate = getStartOfDayInTimezone(last7, timezone);
      endDate = getEndOfDayInTimezone(now, timezone);
    } else if (dateFilter === 'thisMonth') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      startDate = getStartOfDayInTimezone(startOfMonth, timezone);
      endDate = getEndOfDayInTimezone(now, timezone);
    } else if (dateFilter === 'lastMonth') {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      startDate = getStartOfDayInTimezone(lm, timezone);
      endDate = getEndOfDayInTimezone(lmEnd, timezone);
    } else if (dateFilter === 'all') {
      startDate = new Date(Date.UTC(2000, 0, 1));
      endDate = getEndOfDayInTimezone(now, timezone);
    } else {
      // Fallback
      startDate = new Date(Date.UTC(2000, 0, 1));
      endDate = getEndOfDayInTimezone(now, timezone);
    }

    return { validStartDate: startDate, validEndDate: endDate };
  }, [dateFilter, startDateInput, endDateInput, state.settings.country]);

  // If a supplier is selected, show their ledger
  if (selectedSupplierId) {
    const supplier = state.suppliers.find(s => s.id === selectedSupplierId);
    if (!supplier) return null;
    return (
      <SupplierLedger
        supplier={supplier}
        onBack={() => setSelectedSupplierId(null)}
        startDate={validStartDate}
        endDate={validEndDate}
        dateFilter={dateFilter}
      />
    );
  }

  return (
    <div className="main-content-scroll p-1 sm:p-4 lg:p-6 bg-gray-50/50 dark:bg-app space-y-3 lg:space-y-6 max-w-[1400px] mx-auto">
      {/* Layer 1: Identity & Tab Navigation */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6 pb-2">
        <div className="flex flex-col md:flex-row md:items-center gap-4 sm:gap-6 xl:gap-10">
          <div className="flex items-center gap-4 shrink-0">
            <div className="h-10 w-10 sm:h-12 sm:w-12 bg-primary/10 rounded-xl flex items-center justify-center shadow-inner border border-primary/10">
              <Truck className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            </div>
            <div className="shrink-0 flex flex-col">
              <h1 className="text-lg sm:text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tighter leading-none">{t('suppliers', 'Suppliers')}</h1>
              <p className="hidden sm:block text-gray-600 dark:text-gray-400 text-[9px] font-black uppercase tracking-[0.2em] mt-1 opacity-60">{t('supply_network_partners', 'Supply Network • Partners')} • {state.suppliers.length}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleAddEdit()}
            className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl font-black text-[10px] shadow-lg shadow-emerald-500/20 hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-widest"
          >
            <Plus className="h-3.5 w-3.5" /> <span>{t('add_supplier', 'Add Supplier')}</span>
          </button>
        </div>
      </div>

      <div className="relative z-30 bg-white/50 dark:bg-black/20 p-3 lg:p-4 rounded-[1.75rem] border border-gray-200/50 dark:border-white/5 shadow-xl ring-1 ring-black/5 dark:ring-white/5">
        <div className="flex flex-col xl:flex-row gap-4">
          <div className="relative flex-1 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-600 group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              placeholder={t('search_partners', 'Search partners...')}
              className="w-full bg-gray-50 dark:bg-black/30 border-none pl-11 pr-4 py-2.5 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500 transition-all placeholder:text-gray-600 focus:bg-white dark:focus:bg-black/75 shadow-inner"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 sm:flex items-center gap-2">
            <SearchableSelect
              label={t('range', 'RANGE')}
              options={[
                { id: 'all', label: t('all_time', 'ALL TIME') },
                { id: 'today', label: t('today', 'TODAY') },
                { id: 'yesterday', label: t('yesterday', 'YESTERDAY') },
                { id: 'last7', label: t('last_7_days', 'LAST 7 DAYS') },
                { id: 'thisMonth', label: t('this_month', 'THIS MONTH') },
                { id: 'lastMonth', label: t('previous_month', 'PREVIOUS MONTH') },
                { id: 'custom', label: t('custom_range', 'CUSTOM RANGE') }
              ]}
              value={dateFilter}
              onChange={setDateFilter}
              icon={Receipt}
            />
          </div>
        </div>

        {dateFilter === 'custom' && (
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center mt-3 p-2 bg-white/50 dark:bg-black/20 rounded-xl animate-in slide-in-from-top-2">
            <input
              type="date"
              value={startDateInput}
              onChange={(e) => setStartDateInput(e.target.value)}
              className="w-full sm:flex-1 px-3 py-2 text-[10px] font-black bg-white dark:bg-zinc-800 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white uppercase shadow-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
            <span className="hidden sm:block text-[10px] font-black text-gray-600 uppercase tracking-tighter">to</span>
            <input
              type="date"
              value={endDateInput}
              onChange={(e) => setEndDateInput(e.target.value)}
              className="w-full sm:flex-1 px-3 py-2 text-[10px] font-black bg-white dark:bg-zinc-800 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white uppercase shadow-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
        )}
      </div>

      {/* Layer 3: Vibrant Stats section */}
      <div className="relative z-20 grid grid-cols-2 md:grid-cols-2 gap-2 sm:gap-4 mt-2">
        <div className="stat-card bg-gradient-to-br from-emerald-500 to-teal-700">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t('active_partners', 'Active Partners')}</span>
            <span className="stat-card-value">{activeSuppliers}</span>
            <p className="text-[7px] font-black text-emerald-100/50 uppercase tracking-widest mt-1">{t('network_strength', 'Network Strength')}</p>
          </div>
          <Truck className="stat-card-icon h-10 w-10 text-white" />
        </div>

        <div className="stat-card bg-gradient-to-br from-rose-500 to-red-700">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t('total_payables', 'Total Payables')}</span>
            <span className="stat-card-value text-xl lg:text-2xl">{formatCurrency(totalRemaining, state.settings.currency)}</span>
            <p className="text-[7px] font-black text-rose-100/50 uppercase tracking-widest mt-1">{totalRemaining > 0 ? t('outstanding_debt', 'Outstanding Debt') : t('clear_balance', 'Clear Balance')}</p>
          </div>
          <Briefcase className="stat-card-icon h-10 w-10 text-white" />
        </div>
      </div>

      {/* Main Grid View */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-4 lg:gap-6 mt-2">
        {filteredSuppliers.length === 0 ? (
          <div className="col-span-full p-20 text-center bg-white dark:bg-surface rounded-3xl border border-gray-200 dark:border-white/5">
            <div className="flex flex-col items-center gap-3 opacity-20">
              <Briefcase className="h-12 w-12 text-gray-600" />
              <p className="text-xs font-black uppercase tracking-widest">{t('no_partners_found', 'No partners found')}</p>
            </div>
          </div>
        ) : (
          filteredSuppliers.map((supplier) => (
            <div key={supplier.id} className="bg-white dark:bg-surface p-4 rounded-3xl border border-gray-200 dark:border-white/5 shadow-xl hover:scale-[1.02] transition-all group flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/10">
                    <User className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-[11px] font-black text-gray-900 dark:text-white uppercase leading-none truncate max-w-[150px]">{supplier.name}</h3>
                    <span className="text-[9px] font-black uppercase text-primary tracking-widest bg-primary/10 px-2 py-0.5 rounded-full inline-block mt-1 border border-primary/10">
                      {supplier.businessType || t('partner', 'PARTNER')}
                    </span>
                  </div>
                </div>

                {canManage && (
                  <div className="flex items-center gap-1 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleAddEdit(supplier)} className="p-1.5 hover:bg-emerald-50 dark:hover:bg-primary/10 text-primary rounded-lg transition-transform hover:scale-110 active:scale-90">
                      <Edit className="h-3.5 w-3.5" />
                    </button>
                    {isAdmin && (
                      <button onClick={() => handleDelete(supplier.id, supplier.name)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500 rounded-lg transition-transform hover:scale-110 active:scale-90">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-2.5 py-4 border-y border-gray-50 dark:border-white/5 mb-4">
                {supplier.phone && (
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-lg bg-gray-50 dark:bg-white/5 flex items-center justify-center">
                      <Phone className="h-3 w-3 text-gray-600" />
                    </div>
                    <span className="text-[10px] font-bold text-gray-600 dark:text-gray-400">{supplier.phone}</span>
                  </div>
                )}
                {supplier.email && (
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-lg bg-gray-50 dark:bg-white/5 flex items-center justify-center">
                      <Mail className="h-3 w-3 text-gray-600" />
                    </div>
                    <span className="text-[10px] font-bold text-gray-600 dark:text-gray-400 truncate">{supplier.email}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-lg bg-gray-50 dark:bg-white/5 flex items-center justify-center">
                    <MapPin className="h-3 w-3 text-gray-600" />
                  </div>
                  <span className="text-[10px] font-bold text-gray-600 dark:text-gray-400 truncate">{supplier.address || t('address_not_set', 'Address not set')}</span>
                </div>
              </div>

              <button
                onClick={() => setSelectedSupplierId(supplier.id)}
                className="mt-auto w-full flex items-center justify-center gap-2 bg-gray-50 dark:bg-white/5 hover:bg-primary hover:text-white dark:hover:bg-primary text-gray-900 dark:text-white py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all group/btn btn-md border border-gray-200 dark:border-white/5 active:scale-95"
              >
                <Wallet className="h-3.5 w-3.5 transition-transform group-hover/btn:scale-110" />
                <span>{t('view_ledger', 'View Ledger')}</span>
                <ArrowRight className="h-3.5 w-3.5 opacity-30 transition-transform group-hover/btn:translate-x-1" />
              </button>
            </div>
          ))
        )}
      </div>

      <SupplierModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveSupplier}
        supplier={editingSupplier}
      />
    </div>
  );
}
