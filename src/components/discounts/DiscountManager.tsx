import { useState } from 'react';
import { Plus, Search, Edit, Trash2, Percent, Gift } from 'lucide-react';
import { Discount } from '../../types';
import { useApp } from '../../context/SupabaseAppContext';
import { DiscountModal } from './DiscountModal';
import { sonner } from '../../lib/sonner';
import { formatAppDate } from '../../lib/dateUtils';
import { useTranslation } from '../../hooks/useTranslation';

export function DiscountManager() {
  const { state, dispatch } = useApp();
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<Discount | null>(null);

  const filteredDiscounts = state.discounts.filter(discount =>
    discount?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    discount?.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEditDiscount = (discount: Discount) => {
    setEditingDiscount(discount);
    setShowDiscountModal(true);
  };

  const handleDeleteDiscount = async (discountId: string) => {
    const result = await sonner.deleteConfirm('discount');
    if (result.isConfirmed) {
      try {
        sonner.loading('Deleting discount...');
        const { discountsService } = await import('../../lib/services');
        await discountsService.delete(discountId);
        dispatch({ type: 'DELETE_DISCOUNT', payload: discountId });
        sonner.success('Discount deleted successfully!');
      } catch (error) {
        console.error('Error deleting discount:', error);
        sonner.error('Failed to delete discount. Please try again.');
      } finally {
        sonner.close();
      }
    }
  };

  const handleAddDiscount = () => {
    setEditingDiscount(null);
    setShowDiscountModal(true);
  };

  const toggleDiscountStatus = async (discount: Discount) => {
    try {
      sonner.loading(`${discount.active ? 'Deactivating' : 'Activating'} discount...`);
      const updatedDiscount = { ...discount, active: !discount.active };
      const { discountsService } = await import('../../lib/services');
      await discountsService.update(discount.id, updatedDiscount);
      dispatch({
        type: 'UPDATE_DISCOUNT',
        payload: updatedDiscount
      });
      sonner.success(`Discount ${discount.active ? 'deactivated' : 'activated'} successfully!`);
    } catch (error) {
      console.error('Error updating discount:', error);
      sonner.error('Failed to update discount. Please try again.');
    } finally {
      sonner.close();
    }
  };

  const getDiscountTypeIcon = (type: string) => {
    switch (type) {
      case 'percentage':
      case 'fixed':
        return <Percent className="h-4 w-4" />;
      case 'free_gift':
        return <Gift className="h-4 w-4" />;
      default:
        return <Percent className="h-4 w-4" />;
    }
  };

  const getDiscountTypeColor = (type: string) => {
    switch (type) {
      case 'percentage':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'fixed':
        return 'bg-green-100 text-green-800';
      case 'free_gift':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="main-content-scroll p-3 sm:p-4 lg:p-6 bg-gray-50/50 dark:bg-app space-y-3 lg:space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6 pb-2">
        <div className="flex flex-col md:flex-row md:items-center gap-4 sm:gap-6 xl:gap-10">
          <div className="flex items-center gap-4 shrink-0">
            <div className="h-10 w-10 sm:h-12 sm:w-12 bg-primary/10 rounded-xl flex items-center justify-center shadow-inner border border-primary/10">
              <Gift className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            </div>
            <div className="shrink-0 flex flex-col">
              <h1 className="text-lg sm:text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tighter leading-none">{t("discounts", "Discounts")}</h1>
              <p className="hidden sm:block text-gray-600 dark:text-gray-400 text-[9px] font-black uppercase tracking-[0.2em] mt-1 opacity-60">{t("promotional_offers", "Promotional Offers")}</p>
            </div>
          </div>
        </div>

        <button
          onClick={handleAddDiscount}
          className="btn btn-md btn-primary"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>{t("add_discount", "Add Discount")}</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="relative z-20 grid grid-cols-2 lg:grid-cols-4 gap-4 mt-2">
        <div className="stat-card bg-gradient-to-br from-emerald-500 to-teal-700">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t("total_discounts", "Total Discounts")}</span>
            <span className="stat-card-value">{state.discounts.length}</span>
          </div>
          <Percent className="stat-card-icon h-10 w-10 text-white" />
        </div>

        <div className="stat-card bg-gradient-to-br from-green-500 to-emerald-600">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t("active_discounts", "Active Discounts")}</span>
            <span className="stat-card-value">{state.discounts.filter(d => d.active).length}</span>
          </div>
          <Gift className="stat-card-icon h-10 w-10 text-white" />
        </div>

        <div className="stat-card bg-gradient-to-br from-purple-500 to-fuchsia-700">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t("percentage_offers", "Percentage Offers")}</span>
            <span className="stat-card-value">{state.discounts.filter(d => d.type === 'percentage').length}</span>
          </div>
          <Percent className="stat-card-icon h-10 w-10 text-white" />
        </div>

        <div className="stat-card bg-gradient-to-br from-orange-500 to-rose-600">
          <div className="stat-card-inner">
            <span className="stat-card-label">{t("free_gift_offers", "Free Gift Offers")}</span>
            <span className="stat-card-value">{state.discounts.filter(d => d.type === 'free_gift').length}</span>
          </div>
          <Gift className="stat-card-icon h-10 w-10 text-white" />
        </div>
      </div>

      {/* Controls */}
      <div className="card p-4 lg:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-3 sm:space-y-0 gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 h-5 w-5" />
            <input
              type="text"
              placeholder={t("search_discounts_placeholder", "Search discounts...")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pl-10"
            />
          </div>
        </div>
      </div>

      {/* Discounts Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead className="table-header">
              <tr>
                <th className="table-header-cell">{t("discount", "Discount")}</th>
                <th className="table-header-cell hidden sm:table-cell">{t("type", "Type")}</th>
                <th className="table-header-cell">{t("value", "Value")}</th>
                <th className="table-header-cell hidden md:table-cell">{t("conditions", "Conditions")}</th>
                <th className="table-header-cell hidden lg:table-cell">{t("valid_period", "Valid Period")}</th>
                <th className="table-header-cell hidden sm:table-cell">{t("status", "Status")}</th>
                <th className="table-header-cell text-right">{t("actions", "Actions")}</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-surface divide-y divide-gray-200 dark:divide-white/5">
              {filteredDiscounts.map((discount) => (
                <tr key={discount.id} className="table-row">
                  <td className="table-cell" data-label="Discount">
                    <div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">{discount.name}</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">{discount.description}</div>
                    </div>
                  </td>
                  <td className="table-cell hidden sm:table-cell" data-label="Type">
                    <span className={`badge ${getDiscountTypeColor(discount.type)} flex items-center space-x-1`}>
                      {getDiscountTypeIcon(discount.type)}
                      <span className="capitalize">{discount.type.replace('_', ' ')}</span>
                    </span>
                  </td>
                  <td className="table-cell font-semibold" data-label="Value">
                    {discount.type === 'percentage' && `${discount.value}%`}
                    {discount.type === 'fixed' && `${state.settings.currency} ${discount.value}`}
                    {discount.type === 'free_gift' && 'Free Gift'}
                  </td>
                  <td className="table-cell hidden md:table-cell" data-label="Conditions">
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      {discount.conditions.length} condition(s)
                    </div>
                  </td>
                  <td className="table-cell text-gray-900 dark:text-gray-300 hidden lg:table-cell" data-label="Valid Period">
                    <div className="text-xs">
                      <div>{formatAppDate(discount.validFrom, state.settings.country)}</div>
                      <div className="text-gray-600 dark:text-gray-400">to {formatAppDate(discount.validTo, state.settings.country)}</div>
                    </div>
                  </td>
                  <td className="table-cell hidden sm:table-cell" data-label="Status">
                    <button
                      onClick={() => toggleDiscountStatus(discount)}
                      className={`badge ${discount.active ? 'badge-emerald' : 'badge-danger'
                        } cursor-pointer hover:opacity-80`}
                    >
                      {discount.active ? t("active", "Active") : t("inactive", "Inactive")}
                    </button>
                  </td>
                  <td className="table-cell text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => handleEditDiscount(discount)}
                        className="text-primary dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-300 p-2 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteDiscount(discount.id)}
                        className="text-red-600 hover:text-red-900 p-2 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <DiscountModal
        isOpen={showDiscountModal}
        onClose={() => setShowDiscountModal(false)}
        discount={editingDiscount}
      />
    </div>
  );
}