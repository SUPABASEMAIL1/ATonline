import React from 'react';
import { DiscountCondition } from '../../types';
import { useTranslation } from '../../hooks/useTranslation';
import { useApp } from '../../context/SupabaseAppContext';
import { HelpTooltip } from '../common/HelpTooltip';

interface MixAndMatchBuilderProps {
  conditions: DiscountCondition[];
  onChange: (conditions: DiscountCondition[]) => void;
  currency: string;
}

export function MixAndMatchBuilder({ conditions, onChange, currency }: MixAndMatchBuilderProps) {
  const { state } = useApp();
  const { t } = useTranslation();

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

  // Get unique categories from products
  const categories = Array.from(new Set(state.products.map(p => p.category))).filter(Boolean);

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
          <select
            value={mmCondition.type}
            onChange={(e) => updateCondition({ type: e.target.value as 'specific_products' | 'category', value: [] })}
            className="w-full bg-white dark:bg-black/40 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-violet-500 transition-all font-medium appearance-none cursor-pointer"
          >
            <option value="category">Any items from Category</option>
            <option value="specific_products">Specific Products Only</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-black text-violet-700 dark:text-violet-400 uppercase tracking-wider">
          {mmCondition.type === 'category' ? 'Select Categories' : 'Select Specific Products'}
        </label>
        <select
          multiple
          value={Array.isArray(mmCondition.value) ? mmCondition.value : []}
          onChange={(e) => {
            const selectedOptions = Array.from(e.target.selectedOptions, option => option.value);
            updateCondition({ value: selectedOptions });
          }}
          className="w-full bg-white dark:bg-black/40 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-violet-500 transition-all h-32 custom-scrollbar"
        >
          {mmCondition.type === 'category'
            ? categories.map(cat => <option key={cat} value={cat}>{cat}</option>)
            : state.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)
          }
        </select>
        <p className="text-[9px] font-bold text-violet-600/70 uppercase tracking-widest">Hold Cmd/Ctrl to select multiple</p>
      </div>

      <div className="pt-4 border-t border-violet-200 dark:border-violet-500/20 grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-violet-700 dark:text-violet-400 uppercase tracking-wider">Deal Reward Type</label>
          <select
            value={mmCondition.rewardType || 'fixed_total'}
            onChange={(e) => updateCondition({ rewardType: e.target.value as any })}
            className="w-full bg-white dark:bg-black/40 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-violet-500 transition-all font-medium appearance-none cursor-pointer"
          >
            <option value="fixed_total">Fixed Deal Price (e.g. 2 for $30)</option>
            <option value="percentage_off_all">Percentage Off Deal Items</option>
            <option value="cheapest_free">Cheapest Item Free (Buy X Get Y Free)</option>
          </select>
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
