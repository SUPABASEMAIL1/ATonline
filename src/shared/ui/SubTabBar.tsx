import React from 'react';
import { cn } from '../../lib/utils';

/**
 * SubTabBar — the single standardized chip-style tab bar for all non-POS
 * routes. Wraps the existing `.chip-nav-container` / `.chip-nav-item` CSS
 * classes.
 */
export interface SubTab {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

export interface SubTabBarProps {
  tabs: SubTab[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

export function SubTabBar({ tabs, value, onChange, className }: SubTabBarProps) {
  return (
    <div className={cn('chip-nav-container', className)}>
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              'chip-nav-item',
              active
                ? 'bg-primary text-white shadow-lg shadow-emerald-500/20'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5'
            )}
          >
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
