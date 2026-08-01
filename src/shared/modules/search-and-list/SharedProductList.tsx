import React from 'react';
import { X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { SkeletonLoader } from '../../../components/common/SkeletonLoader';
import { SharedProductListProps } from './types';
import { SharedProductListItem } from './SharedProductListItem';
import { useDragDropList } from './SharedDragDropList';
import { EmptyState } from '../../ui/EmptyState';

/**
 * SharedProductList — the single standardized item/product listing used on all
 * non-POS routes.
 *
 * - loading            → shimmer rows matching the item-row shape
 * - empty              → centered box icon + uppercase empty state text
 * - draggable+onReorder → rows become reorderable via the shared drag module
 * - onClearSearch      → renders the "Smart Match Results (N)" header with a
 *                        CLOSE pill, mirroring the restock/PO experience
 *
 * The module is presentation + interaction only — data fetching and filtering
 * stay in the page. No business types are hardcoded.
 */
export function SharedProductList({
  items,
  loading = false,
  emptyStateText = 'NO ITEMS SELECTED YET',
  emptyStateSubtext,
  selectedIds = [],
  onItemAdd,
  onItemSelect,
  onClearSearch,
  headerTitle = 'Smart Match Results',
  maxHeight,
  skeletonCount = 5,
  draggable = false,
  onReorder,
  compact = false,
  className,
}: SharedProductListProps) {
  const dnd = useDragDropList(onReorder);

  const renderRow = (item: (typeof items)[number], index: number) => {
    const selected = selectedIds.includes(item.id);
    const row = (
      <SharedProductListItem
        item={item}
        selected={selected}
        onAdd={onItemAdd}
        onSelect={onItemSelect}
        showDragHandle={draggable}
        compact={compact}
      />
    );

    if (!draggable || !onReorder) return row;

    return (
      <div
        draggable
        onDragStart={() => dnd.handleDragStart(index)}
        onDragEnter={() => dnd.handleDragEnter(index)}
        onDragOver={dnd.handleDragOver}
        onDragEnd={dnd.handleDragEnd}
        className={cn(dnd.rowCls(index), 'rounded-xl')}
      >
        {row}
      </div>
    );
  };

  return (
    <div
      className={cn(
        'bg-white dark:bg-[#1f1f1f] rounded-[2rem] shadow-xl border border-gray-200 dark:border-white/10 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300',
        className
      )}
    >
      {onClearSearch && (
        <div className="p-3 bg-gray-50 dark:bg-white/[0.02] border-b border-gray-200 dark:border-white/5 flex items-center justify-between">
          <span className="text-[9px] font-black text-gray-600 uppercase tracking-[0.2em] px-2">
            {headerTitle} ({items.length})
          </span>
          <button
            onClick={onClearSearch}
            className="p-1 px-3 bg-rose-500/10 text-rose-500 text-[8px] font-black uppercase rounded-lg hover:bg-rose-500/20 transition-colors"
          >
            <span className="flex items-center gap-1">
              <X className="h-2.5 w-2.5" />
              CLOSE
            </span>
          </button>
        </div>
      )}

      {loading ? (
        <div className={cn('overflow-y-auto custom-scrollbar p-2')} style={maxHeight ? { maxHeight } : undefined}>
          <SkeletonLoader type="item-rows" count={skeletonCount} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title={emptyStateText} subtext={emptyStateSubtext} />
      ) : (
        <div
          className="overflow-y-auto custom-scrollbar p-2"
          style={maxHeight ? { maxHeight } : undefined}
        >
          <div className="flex flex-col gap-1">
            {items.map((item, index) => (
              <React.Fragment key={item.id}>{renderRow(item, index)}</React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
