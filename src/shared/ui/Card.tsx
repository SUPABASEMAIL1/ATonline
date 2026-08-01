import React from 'react';
import { cn } from '../../lib/utils';

/**
 * Card — the single standardized surface container for all non-POS routes.
 *
 * Consolidates the app's drifting surface conventions (dark:bg-[#1C1C1C],
 * dark:bg-[#111], dark:bg-[#1f1f1f], dark:bg-surface) onto one token.
 * `premium-card` / `glass-card` CSS classes are rescued and exposed as
 * variants rather than left as dead code.
 *
 * `className` is an escape hatch (estore theme vars, page-specific tweaks).
 */
export type CardVariant = 'default' | 'stat' | 'premium' | 'glass' | 'listRow';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
}

const variantClass: Record<CardVariant, string> = {
  default:
    'bg-white dark:bg-surface border border-gray-200/50 dark:border-white/5 rounded-2xl shadow-xl transition-all duration-300',
  stat: 'stat-card',
  premium: 'premium-card',
  glass: 'glass-card',
  listRow:
    'bg-white dark:bg-surface border border-gray-200/50 dark:border-white/5 rounded-xl shadow-sm transition-all duration-200',
};

const paddingClass: Record<CardPadding, string> = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-4 sm:p-5',
  lg: 'p-5 sm:p-6',
};

export function Card({
  variant = 'default',
  padding = 'md',
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(variantClass[variant], variant !== 'stat' && paddingClass[padding], className)}
      {...rest}
    >
      {children}
    </div>
  );
}
