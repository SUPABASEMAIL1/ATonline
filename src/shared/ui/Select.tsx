import React, { forwardRef } from 'react';
import { cn } from '../../lib/utils';
import { ChevronDown } from 'lucide-react';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  fullWidth?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, fullWidth = false, children, ...props }, ref) => {
    return (
      <div className={cn('relative', fullWidth && 'w-full')}>
        <select
          ref={ref}
          className={cn(
            'input appearance-none w-full text-[13px] font-medium py-2.5 px-3 bg-white dark:bg-black/20 cursor-pointer rounded-xl pr-10 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white',
            className
          )}
          {...props}
        >
          {children}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
          <ChevronDown className="w-4 h-4" />
        </div>
      </div>
    );
  }
);

Select.displayName = 'Select';
