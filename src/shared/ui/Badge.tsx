import React from 'react';
import { cn } from '../../lib/utils';

/**
 * Badge — the single standardized status pill for all non-POS routes.
 *
 * Unifies the app's 4 competing badge conventions onto one component.
 * Default `soft` variant uses the `/10`-opacity + text-color convention
 * (closest to majority usage across the app).
 *
 * Presentation only.
 */
export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
export type BadgeSize = 'sm' | 'md';
export type BadgeVariant = 'soft' | 'solid' | 'outline';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  size?: BadgeSize;
  variant?: BadgeVariant;
  icon?: React.ReactNode;
}

const softToneClass: Record<BadgeTone, string> = {
  success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  danger: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  info: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  neutral: 'bg-gray-500/10 text-gray-600 dark:text-gray-300',
};

const solidToneClass: Record<BadgeTone, string> = {
  success: 'bg-emerald-500 text-white',
  warning: 'bg-amber-500 text-white',
  danger: 'bg-rose-500 text-white',
  info: 'bg-sky-500 text-white',
  neutral: 'bg-gray-500 text-white',
};

const outlineToneClass: Record<BadgeTone, string> = {
  success: 'border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-transparent',
  warning: 'border border-amber-500/40 text-amber-600 dark:text-amber-400 bg-transparent',
  danger: 'border border-rose-500/40 text-rose-600 dark:text-rose-400 bg-transparent',
  info: 'border border-sky-500/40 text-sky-600 dark:text-sky-400 bg-transparent',
  neutral: 'border border-gray-400/40 text-gray-600 dark:text-gray-300 bg-transparent',
};

const toneClass: Record<BadgeVariant, Record<BadgeTone, string>> = {
  soft: softToneClass,
  solid: solidToneClass,
  outline: outlineToneClass,
};

const sizeClass: Record<BadgeSize, string> = {
  sm: 'text-[9px] px-2 py-0.5 gap-1',
  md: 'text-[10px] px-2.5 py-1 gap-1.5',
};

export function Badge({
  tone = 'neutral',
  size = 'md',
  variant = 'soft',
  icon,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-black uppercase tracking-widest border border-transparent whitespace-nowrap',
        sizeClass[size],
        toneClass[variant][tone],
        className
      )}
      {...rest}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </span>
  );
}
