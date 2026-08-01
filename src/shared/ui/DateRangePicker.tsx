import React from 'react';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import { cn } from '../../lib/utils';

/**
 * DateRangePicker — the single standardized date-range filter for all
 * non-POS routes.
 *
 * Modeled on ReportsManager's 7-option dropdown (the app's most complete
 * implementation). Presentation + interaction only: preset math stays in
 * the page via dateUtils; this component renders the preset dropdown and
 * the custom-range date inputs.
 */
export interface DateRangePreset {
  id: string;
  label: string;
}

export interface DateRangePickerProps {
  preset: string;
  presets: DateRangePreset[];
  onPresetChange: (id: string) => void;
  startDate: string;
  endDate: string;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  label?: string;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}

export function DateRangePicker({
  preset,
  presets,
  onPresetChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  label = 'RANGE',
  icon,
  className,
}: DateRangePickerProps) {
  const isCustom = preset === 'custom';

  return (
    <div className={cn('flex flex-col sm:flex-row items-stretch sm:items-center gap-3', className)}>
      <div className="flex-1 sm:flex-none sm:min-w-[200px]">
        <SearchableSelect
          label={label}
          options={presets}
          value={preset}
          onChange={onPresetChange}
          icon={icon}
        />
      </div>

      {isCustom && (
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center w-full p-2 bg-white/30 dark:bg-black/75 rounded-xl border border-gray-200/50 dark:border-white/5 animate-in slide-in-from-top-2 sm:slide-in-from-left-4 duration-300">
          <input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="w-full sm:flex-1 px-3 py-2 text-[10px] font-black bg-white dark:bg-zinc-800 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white uppercase shadow-sm focus:ring-2 focus:ring-emerald-500 outline-none"
          />
          <span className="hidden sm:block text-gray-600 dark:text-gray-400 font-black text-[10px] uppercase tracking-tighter px-1">
            TO
          </span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="w-full sm:flex-1 px-3 py-2 text-[10px] font-black bg-white dark:bg-zinc-800 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white uppercase shadow-sm focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>
      )}
    </div>
  );
}
