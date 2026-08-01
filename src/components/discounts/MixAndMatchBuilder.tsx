import React, { useMemo, useState } from 'react';
import { DiscountCondition } from '../../types';
import { useTranslation } from '../../hooks/useTranslation';
import { useApp } from '../../context/SupabaseAppContext';
import { HelpTooltip } from '../common/HelpTooltip';
import { SharedSearchBar, SharedProductList } from '../../shared/modules/search-and-list';
import { SharedItem } from '../../shared/modules/search-and-list';
import { Select } from '../../shared/ui';

interface MixAndMatchBuilderProps {
  conditions: DiscountCondition[];
  onChange: (conditions: DiscountCondition[]) => void;
  currency: string;
}

export function MixAndMatchBuilder({ conditions, onChange, currency }: MixAndMatchBuilderProps) {
  const { state } = useApp();
  const { t } = useTranslation();
  const [pickerSearch, setPickerSearch] = useState('');

  // Find the primary mix and match condition, or create a default one
  const mmCondition = conditions.find(c => c.type === 'specific_products' || c.type === 'category') || {
    type: 'category',
    value: [],
    targetQuantity: 2,
    rewardType: 'fixed_total',
    rewardValue: 0
  };

  const updateCondition = (updates: Partial<DiscountCondition>) => {
    // We only want ONE primary mix and match condition that holds the rules
    // So we replace all conditions with this updated one.
    const newCondition = { ...mmCondition, ...updates } as DiscountCondition;
    onChange([newCondition]);
  };

  const toggleValue = (value: string) => {
    const current: string[] = Array.isArray(mmCondition.value) ? mmCondition.value : [];
    const next = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    updateCondition({ value: next });
  };

  // Get unique categories from products
  const categories = useMemo(
    () => Array.from(new Set(state.products.map(p => p.category))).filter(Boolean) as string[],
    [state.products]
  );

  // Shared module picker data — generic item mapping (no niche types hardcoded)
  const pickerItems = useMemo<SharedItem[]>(() => {
    const term = pickerSearch.trim().toLowerCase();
    if (mmCondition.type === 'category') {
      return categories
        .filter(c => !term || c.toLowerCase().includes(term))
        .slice(0, 40)
        .map(c => ({
          id: c,
          badgeLabel: t('category', 'CATEGORY'),
          title: c,
          sku: '',
        }));
    }
    return state.products
      .filter(p => {
        if (!term) return true;
        return (
          (p.name || '').toLowerCase().includes(term) ||
          (p.sku || '').toLowerCase().includes(term) ||
          (p.barcode || '').toLowerCase().includes(term)
        );
      })
      .slice(0, 40)
      .map(p => ({
        id: p.id,
        thumbnailUrl: p.image || undefined,
        badgeLabel: p.category || 'GENERAL',
        sku: p.sku || 'N/A',
        title: p.name,
        stock: p.stock,
      }));
  }, [mmCondition.type, categories, state.products, pickerSearch, t]);

  return (
    <div className="space-y-6 bg-violet-50 dark:bg-violet-900/10 p-5 rounded-[20px] border border-violet-200 dark:border-violet-500/20">
      <div className="flex items-center gap-2 mb-4">
        <h4 className="text-[12px] font-black text-violet-900 dark:text-violet-200 uppercase tracking-widest flex items-center gap-2">
          Mix & Match Deal Rules
          <HelpTooltip content="Define a bundle deal where customers can mix and match items (e.g. Any 2 Pizzas for $30, or Buy 2 Get 1 Free)." />
        </h4>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-violet-700 dark:text-violet-400 uppercase tracking-wider">Buy Quantity (Any Combination)</label>
          <input
            type="number"
            min="2"
            value={mmCondition.targetQuantity || 2}
            onChange={(e) => updateCondition({ targetQuantity: parseInt(e.target.value) || 2 })}
            className="w-full bg-white dark:bg-black/40 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-violet-500 transition-all font-medium"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-violet-700 dark:text-violet-400 uppercase tracking-wider">Target Type</label>
          <Select
            value={mmCondition.type}
            onChange={(e) => { updateCondition({ type: e.target.value as 'specific_products' | 'category', value: [] }); setPickerSearch(''); }}
            className="!bg-white dark:!bg-black/40 !border-none !text-sm !rounded-xl !px-4 !text-gray-900 dark:!text-white !font-medium"
          >
            <option value="category">Any items from Category</option>
            <option value="specific_products">Specific Products Only</option>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-black text-violet-700 dark:text-violet-400 uppercase tracking-wider">
          {mmCondition.type === 'category' ? 'Select Categories' : 'Select Specific Products'}
        </label>

        {/* Shared search + picker module (same component used across all non-POS routes) */}
        <SharedSearchBar
          value={pickerSearch}
          onChange={setPickerSearch}
          placeholder={
            mmCondition.type === 'category'
              ? t('search_categories', 'Search categories...')
              : t('search_products_to_add', 'Search products...')
          }
        />
        <SharedProductList
          items={pickerItems}
          selectedIds={Array.isArray(mmCondition.value) ? mmCondition.value : []}
          onItemSelect={(item) => toggleValue(item.id)}
          onClearSearch={() => setPickerSearch('')}
          headerTitle={mmCondition.type === 'category' ? t('matching_categories', 'Matching Categories') : t('matching_products', 'Matching Products')}
          maxHeight="220px"
          emptyStateText={t('nothing_found', 'NOTHING FOUND')}
          className="rounded-2xl shadow-none"
        />
        <p className="text-[9px] font-bold text-violet-600/70 uppercase tracking-widest">Tap items to toggle them on / off</p>
      </div>

      <div className="pt-4 border-t border-violet-200 dark:border-violet-500/20 grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-violet-700 dark:text-violet-400 uppercase tracking-wider">Deal Reward Type</label>
          <Select
            value={mmCondition.rewardType || 'fixed_total'}
            onChange={(e) => updateCondition({ rewardType: e.target.value as any })}
            className="!bg-white dark:!bg-black/40 !border-none !text-sm !rounded-xl !px-4 !text-gray-900 dark:!text-white !font-medium"
          >
            <option value="fixed_total">Fixed Deal Price (e.g. 2 for $30)</option>
            <option value="percentage_off_all">Percentage Off Deal Items</option>
            <option value="cheapest_free">Cheapest Item Free (Buy X Get Y Free)</option>
          </Select>
        </div>

        {mmCondition.rewardType !== 'cheapest_free' && (
          <div className="space-y-2">
            <label className="text-[10px] font-black text-violet-700 dark:text-violet-400 uppercase tracking-wider">
              {mmCondition.rewardType === 'fixed_total' ? `Total Deal Price (${currency})` : 'Percentage Off (%)'}
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={mmCondition.rewardValue || ''}
              onChange={(e) => updateCondition({ rewardValue: parseFloat(e.target.value) || 0 })}
              className="w-full bg-white dark:bg-black/40 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-violet-500 transition-all font-medium"
              placeholder="0"
            />
          </div>
        )}
      </div>
    </div>
  );
}
