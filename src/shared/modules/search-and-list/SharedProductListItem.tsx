import React from 'react';
import { Package, Plus, CheckCircle2, GripVertical } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { SharedProductListItemProps } from './types';

/**
 * SharedProductListItem — the single standardized row used for any item /
 * product / category listing across non-POS routes.
 *
 * Layout (desktop baseline):
 *   [thumb 64x64] [badge] [sku]             [ + add ]
 *                 [bold title]
 *                 [stock pill] [direct tag]
 *
 * Mobile (<768px): thumbnail shrinks to 48x48; row stays touch-friendly.
 * Selected rows receive the emerald-50 highlight; the add button transitions
 * from outline to solid emerald fill on hover/active.
 */
export function SharedProductListItem({
  item,
  selected = false,
  disabled = false,
  onAdd,
  onSelect,
  addButton = true,
  selectedLabel = 'ADDED',
  showDragHandle = false,
  dragHandle,
  compact = false,
}: SharedProductListItemProps) {
  const handleClick = () => {
    if (onSelect && !disabled) onSelect(item);
  };

  return (
    <div
      onClick={handleClick}
      role={onSelect ? 'button' : undefined}
      className={cn(
        'w-full text-left p-2 sm:p-3 rounded-xl group flex items-center justify-between transition-all duration-200',
        onSelect ? 'cursor-pointer hover:scale-[1.005]' : '',
        !disabled && 'hover:bg-emerald-50 dark:hover:bg-primary/5',
        selected && 'bg-emerald-50 dark:bg-primary/5',
        disabled && 'opacity-60 cursor-not-allowed',
        compact && 'p-1.5 sm:p-2'
      )}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {showDragHandle && (
          <div className="shrink-0 text-gray-300 dark:text-gray-600">
            {dragHandle || <GripVertical className="h-4 w-4" />}
          </div>
        )}

        {/* Thumbnail */}
        <div className={cn(
          'bg-gray-100 dark:bg-white/5 rounded-xl flex items-center justify-center border border-gray-200 dark:border-white/5 shrink-0 overflow-hidden transition-colors',
          compact ? 'w-9 h-9' : 'w-12 h-12 sm:w-16 sm:h-16',
          'group-hover:border-primary/20'
        )}>
          {item.thumbnailUrl ? (
            <img src={item.thumbnailUrl} alt={item.title} className="w-full h-full object-cover" />
          ) : (
            <Package className={cn('text-gray-600 group-hover:text-primary transition-colors', compact ? 'h-4 w-4' : 'h-5 w-5 sm:h-6 sm:w-6')} />
          )}
        </div>

        {/* Content */}
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          {(item.badgeLabel || item.sku) && (
            <div className="flex flex-wrap items-center gap-2">
              {item.badgeLabel && (
                <span className="text-[7px] font-black px-1.5 py-0.5 bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-400 rounded uppercase tracking-widest">
                  {item.badgeLabel}
                </span>
              )}
              {item.sku && (
                <span className="text-[7px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-tighter font-mono truncate">
                  {item.sku}
                </span>
              )}
              {selected && (
                <span className="text-[7px] font-black px-1.5 py-0.5 bg-primary text-white rounded uppercase tracking-widest animate-in fade-in zoom-in duration-300">
                  {selectedLabel}
                </span>
              )}
            </div>
          )}
          <p className={cn(
            'font-black uppercase text-gray-900 dark:text-white group-hover:text-primary transition-colors leading-tight truncate',
            compact ? 'text-[10px]' : 'text-[10px] sm:text-xs'
          )}>
            {item.title}
          </p>
          {(item.stock != null || item.tag || item.subtitle) && (
            <div className="flex items-center gap-2 flex-wrap">
              {item.subtitle && (
                <span className="text-[8px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-tight truncate">
                  {item.subtitle}
                </span>
              )}
              {item.stock != null && (
                <span className="text-[7px] font-black px-1.5 py-0.5 rounded uppercase border bg-primary/10 text-primary border-primary/10">
                  {compact ? String(item.stock) : `STOCK: ${item.stock}`}
                </span>
              )}
              {item.tag && (
                <span className="text-[7px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-widest truncate">
                  {item.tag}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add / Selected action */}
      {addButton && (
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            if (onAdd) onAdd(item);
          }}
          className={cn(
            'rounded-lg flex items-center justify-center transition-all duration-300 shrink-0 active:scale-90',
            compact ? 'w-7 h-7' : 'w-8 h-8 sm:w-9 sm:h-9',
            selected
              ? 'bg-primary text-white shadow-lg shadow-emerald-500/30'
              : 'bg-gray-100 dark:bg-white/5 group-hover:bg-primary group-hover:text-white group-hover:rotate-90',
            disabled && 'cursor-not-allowed'
          )}
          title={selected ? selectedLabel : 'Add'}
        >
          {selected ? <CheckCircle2 className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} /> : <Plus className={compact ? 'h-3.5 w-3.5' : 'h-3.5 w-3.5 sm:h-4 sm:w-4'} />}
        </button>
      )}
    </div>
  );
}
