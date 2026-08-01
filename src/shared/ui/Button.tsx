import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Button — the single standardized button for all non-POS routes.
 *
 * Built on the global `.btn` CSS system (uppercase, rounded-xl, min-height
 * 44px touch target, active:scale-95). The historical `btn-danger` /
 * `btn-ghost` / `btn-sm` / `btn-lg` modifiers are rescued and wired in here
 * as `variant` / `size` instead of being dropped.
 *
 * Presentation only — no business logic.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  fullWidth?: boolean;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  danger: 'btn-danger',
  ghost: 'btn-ghost',
};

const sizeClass: Record<ButtonSize, string> = {
  sm: 'btn-sm',
  md: 'btn-md',
  lg: 'btn-lg',
};

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  loading = false,
  fullWidth = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const iconEl = loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon;

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'btn',
        variantClass[variant],
        sizeClass[size],
        fullWidth && 'w-full',
        className
      )}
      {...rest}
    >
      {iconEl && iconPosition === 'left' && <span className="shrink-0">{iconEl}</span>}
      {children}
      {iconEl && iconPosition === 'right' && <span className="shrink-0">{iconEl}</span>}
    </button>
  );
}
