import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * usePagination — the single page-state hook replacing the fragmented
 * ITEMS_PER_PAGE / itemsPerPage / ITEMS_PER_PAGE_REPORT / displayLimit
 * constants across the app.
 *
 * Contract: pass RAW (unsliced) data in; get the page slice out.
 */
export function usePagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);

  const pageItems = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize]
  );

  return {
    page: safePage,
    setPage,
    pageSize,
    totalPages,
    totalItems: items.length,
    pageItems,
    hasMore: safePage < totalPages,
    hasPrev: safePage > 1,
    nextPage: () => setPage((p) => Math.min(p + 1, totalPages)),
    prevPage: () => setPage((p) => Math.max(p - 1, 1)),
    goToPage: setPage,
    reset: () => setPage(1),
  };
}

/**
 * Pagination — the single standardized pager for all non-POS routes.
 * Desktop: numbered pager. Mobile (<768px): collapses to Prev/Next with a
 * "Page X of Y" indicator.
 */
export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  mode?: 'numbered' | 'prevNext';
  siblingCount?: number;
  className?: string;
}

function pageNumbers(page: number, totalPages: number, siblingCount: number): (number | '…')[] {
  const start = Math.max(1, page - siblingCount);
  const end = Math.min(totalPages, page + siblingCount);

  const nums: (number | '…')[] = [];
  if (start > 1) {
    nums.push(1);
    if (start > 2) nums.push('…');
  }
  for (let i = start; i <= end; i++) nums.push(i);
  if (end < totalPages) {
    if (end < totalPages - 1) nums.push('…');
    nums.push(totalPages);
  }
  return nums;
}

const navBtn =
  'btn btn-secondary btn-sm !min-h-0 !px-2.5 !py-1.5 disabled:opacity-30';

export function Pagination({
  page,
  totalPages,
  onPageChange,
  totalItems,
  mode = 'numbered',
  siblingCount = 1,
  className,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav
      className={cn('flex items-center justify-center gap-1.5 select-none flex-wrap', className)}
      aria-label="Pagination"
    >
      <button
        type="button"
        className={navBtn}
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>

      {/* Numbered pages: desktop only */}
      {mode === 'numbered' && (
        <div className="hidden sm:flex items-center gap-1">
          {pageNumbers(page, totalPages, siblingCount).map((num, i) =>
            num === '…' ? (
              <span key={`e${i}`} className="px-1 text-xs font-black text-gray-400">
                …
              </span>
            ) : (
              <button
                key={num}
                type="button"
                onClick={() => onPageChange(num)}
                aria-current={num === page ? 'page' : undefined}
                className={cn(
                  'min-w-[32px] h-9 px-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all active:scale-95',
                  num === page
                    ? 'bg-primary text-white shadow-lg shadow-emerald-500/20'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5'
                )}
              >
                {num}
              </button>
            )
          )}
        </div>
      )}

      {/* Mobile page indicator */}
      <span className="sm:hidden text-[10px] font-black uppercase tracking-widest text-gray-500 px-2">
        Page {page} of {totalPages}
      </span>

      <button
        type="button"
        className={navBtn}
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        aria-label="Next page"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>

      {totalItems != null && (
        <span className="hidden lg:inline text-[9px] font-bold uppercase tracking-widest text-gray-400 ml-2">
          {totalItems} total
        </span>
      )}
    </nav>
  );
}

