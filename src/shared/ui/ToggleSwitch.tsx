import React from 'react';
import { cn } from '../../lib/utils';

/**
 * ToggleSwitch — the single standardized on/off switch for all non-POS
 * routes.
 *
 * Unifies the fragmented `w-9 h-5` / `w-11 h-6` copy-pasted toggles.
 * Presentation only.
 */
export interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  size?: 'sm' | 'md';
  color?: string;
  disabled?: boolean;
  label?: string;
  className?: string;
}

const sizeClass = {
  sm: {
    track: 'w-9 h-5',
    knob: 'h-4 w-4',
    translate: 'translate-x-4',
  },
  md: {
    track: 'w-11 h-6',
    knob: 'h-5 w-5',
    translate: 'translate-x-5',
  },
};

export function ToggleSwitch({
  checked,
  onChange,
  size = 'md',
  color,
  disabled = false,
  label,
  className,
}: ToggleSwitchProps) {
  const s = sizeClass[size];

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'inline-flex items-center gap-2 select-none',
        disabled && 'opacity-40 cursor-not-allowed',
        className
      )}
    >
      <span
        className={cn(
          'relative inline-flex items-center rounded-full transition-colors duration-200 shrink-0',
          s.track,
          checked
            ? color || 'bg-primary'
            : 'bg-gray-200 dark:bg-white/10'
        )}
      >
        <span
          className={cn(
            'absolute left-0.5 inline-block rounded-full bg-white shadow-md transform transition-transform duration-200',
            s.knob,
            checked && s.translate
          )}
        />
      </span>
      {label && (
        <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{label}</span>
      )}
    </button>
  );
}
