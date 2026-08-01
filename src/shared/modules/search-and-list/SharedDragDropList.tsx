import React, { useState, useCallback } from 'react';
import { GripVertical } from 'lucide-react';
import { cn } from '../../../lib/utils';

/**
 * Shared Drag-and-Drop module — the single standardized reorder primitive.
 *
 * Uses native HTML5 drag-and-drop (no external library) so it works offline,
 * on every browser, and on touch devices via the always-visible drag handle.
 * Everything that needs reordering (PO line items, category ordering, deal
 * ordering, combo-slot options, ...) must go through this module so the drag
 * visual feedback + handle behavior stay identical everywhere.
 */

export interface DragDropState {
  dragIndex: number | null;
  dragOverIndex: number | null;
  handleDragStart: (index: number) => void;
  handleDragEnter: (index: number) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragEnd: () => void;
  rowCls: (index: number) => string;
  isDragging: (index: number) => boolean;
}

/** Shared row styling while dragging: elevated shadow + slight scale + brand ring. */
export const DRAG_ROW_CLS = [
  'transition-all select-none cursor-grab active:cursor-grabbing',
  'hover:bg-gray-50 dark:hover:bg-white/[0.02]',
].join(' ');

/** Standard drag-handle (grip icon), always visible on touch, hover-friendly on desktop. */
export function DragHandle({ index, className }: { index?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-0.5 w-8 shrink-0 touch-manipulation', className)}>
      <GripVertical className="h-4 w-4 text-gray-300 dark:text-gray-600" />
      {index != null && (
        <span className="text-[8px] font-black text-gray-300 dark:text-gray-600">#{index + 1}</span>
      )}
    </div>
  );
}

/**
 * Hook exposing the shared drag state + handlers. Rows rendered by the caller
 * must call `rowCls(index)` for their className and wire the handlers onto the
 * draggable row. Drop indicator is a primary top-border highlight.
 */
export function useDragDropList(onDrop?: (from: number, to: number) => void): DragDropState {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((index: number) => setDragIndex(index), []);
  const handleDragEnter = useCallback((index: number) => setDragOverIndex(index), []);
  const handleDragOver = useCallback((e: React.DragEvent) => e.preventDefault(), []);
  const handleDragEnd = useCallback(() => {
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      onDrop?.(dragIndex, dragOverIndex);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  }, [dragIndex, dragOverIndex, onDrop]);

  const rowCls = useCallback(
    (index: number) =>
      cn(
        DRAG_ROW_CLS,
        dragIndex === index && 'opacity-40 scale-[0.98]',
        dragIndex !== null && dragOverIndex === index && dragIndex !== index
          ? 'bg-emerald-50 dark:bg-primary/10 border-t-2 border-t-primary'
          : 'border-t-2 border-t-transparent'
      ),
    [dragIndex, dragOverIndex]
  );

  const isDragging = useCallback((index: number) => dragIndex === index, [dragIndex]);

  return {
    dragIndex,
    dragOverIndex,
    handleDragStart,
    handleDragEnter,
    handleDragOver,
    handleDragEnd,
    rowCls,
    isDragging,
  };
}

export interface SharedDragDropListProps<T> {
  items: T[];
  onReorder: (from: number, to: number) => void;
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor: (item: T) => string;
  className?: string;
  draggable?: boolean;
}

/**
 * Ready-made reorderable list wrapper: applies the shared drag handlers to
 * every row and calls `onReorder(from, to)` when a drop completes.
 */
export function SharedDragDropList<T>({
  items,
  onReorder,
  renderItem,
  keyExtractor,
  className,
  draggable = true,
}: SharedDragDropListProps<T>) {
  const dnd = useDragDropList(draggable ? onReorder : undefined);

  if (!draggable) {
    return (
      <div className={cn('flex flex-col', className)}>
        {items.map((item, index) => (
          <div key={keyExtractor(item)}>{renderItem(item, index)}</div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col', className)}>
      {items.map((item, index) => (
        <div
          key={keyExtractor(item)}
          draggable
          onDragStart={() => dnd.handleDragStart(index)}
          onDragEnter={() => dnd.handleDragEnter(index)}
          onDragOver={dnd.handleDragOver}
          onDragEnd={dnd.handleDragEnd}
          className={dnd.rowCls(index)}
        >
          {renderItem(item, index)}
        </div>
      ))}
    </div>
  );
}
