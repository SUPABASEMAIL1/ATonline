import React from 'react';
import { Search, Camera } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { SharedSearchBarProps } from './types';

/**
 * SharedSearchBar — the single standardized search input used across all
 * non-POS routes. Renders a magnifying-glass icon on the left, a bordered
 * rounded-xl input with an emerald focus ring, an optional camera/scan icon
 * button on the right, and an optional trailing "Add All Items" bulk action.
 *
 * Business-type-agnostic: works for items, products, categories, orders,
 * customers, expenses, discounts, sales records — whatever the page searches.
 */
export function SharedSearchBar({
  value,
  onChange,
  placeholder = 'Search...',
  onScanClick,
  onAddAll,
  addAllLabel = 'ADD ALL ITEMS',
  resultsCount,
  className,
  inputClassName,
}: SharedSearchBarProps) {
  return (
    <div className={cn('relative flex-1 flex items-center gap-2 group', className)}>
      <div className="relative flex-1">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-600 group-focus-within:text-primary transition-colors" />
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'w-full bg-gray-50 dark:bg-black/30 border border-transparent focus:border-primary/40 pl-10 pr-4 py-2.5 rounded-xl sm:rounded-2xl text-xs font-bold focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-gray-600 focus:bg-white dark:focus:bg-black/75 shadow-inner',
            inputClassName
          )}
        />
      </div>
      {onScanClick && (
        <button
          type="button"
          onClick={onScanClick}
          title="Scan with Camera"
          className="p-2.5 bg-primary/10 text-primary rounded-xl hover:bg-primary hover:text-white active:scale-95 transition-all shadow-sm shrink-0"
        >
          <Camera className="h-5 w-5" />
        </button>
      )}
      {onAddAll && value && (
        <button
          type="button"
          onClick={onAddAll}
          className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-[0.2em] shadow-lg shadow-emerald-500/20 hover:scale-105 active:scale-95 transition-all whitespace-nowrap shrink-0"
        >
          {resultsCount != null && (
            <span className="text-white/80 font-black">{resultsCount}</span>
          )}
          {addAllLabel}
        </button>
      )}
    </div>
  );
}
