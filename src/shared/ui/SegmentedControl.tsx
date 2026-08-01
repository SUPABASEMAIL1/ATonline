import React from 'react';
import { cn } from '../../lib/utils';

/**
 * SegmentedControl — the single standardized segmented tab/toggle control
 * for all non-POS routes.
 *
 * Replaces the ~11 copy-pasted segmented bars (same
 * `isActive ? 'bg-white dark:bg-surface ... shadow-sm' : ...` template),
 * including the verbatim-duplicate Simple/Variable product-type toggle in
 * ProductModal / ProductDetailHub.
 */
export interface SegmentedOption {
  label: React.ReactNode;
  value: string;
}

export interface SegmentedControlProps {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  className?: string;
}

export function SegmentedControl({
  options,
  value,
  onChange,
  size = 'md',
  fullWidth = true,
  className,
}: SegmentedControlProps) {
  return (
    <div
      role="tablist"
      className={cn(
        'flex bg-[#f8f9fa] dark:bg-black/75 p-1 rounded-xl items-stretch',
        fullWidth && 'w-full',
        className
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex-1 flex flex-col items-center justify-center text-center font-black uppercase tracking-wider rounded-lg transition-all leading-tight',
              size === 'md' ? 'py-2 px-1.5 text-[9px] sm:text-[10px]' : 'py-1.5 px-1 text-[8px] sm:text-[9px]',
              active
                ? 'bg-white dark:bg-surface text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
