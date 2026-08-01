import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button, BottomSheet } from '../ui';
import { AppIcons } from '../../lib/icons';
import { sonner } from '../../lib/sonner';
import {
  exportToCSV,
  exportToExcel,
  exportToPDF,
  printReport,
  DEFAULT_BRAND,
  type ExportFormat,
  type ExportColumn,
  type ReportExportConfig,
} from './exportEngine';

/**
 * ExportButton — the single reusable export trigger for ALL business reports.
 * Zero business logic: pages pass their own filtered data/columns/title.
 *
 * Desktop: labeled dropdown menu. Mobile (<768px): BottomSheet picker.
 * `compact` renders the icon-only style used in tight toolbars (e.g. PurchaseOrderSystem).
 */
export interface ExportButtonProps {
  data: Record<string, any>[];
  columns: ExportColumn[];
  title: string;
  subtitle?: string;
  filtersSummary?: string;
  formats?: ExportFormat[];
  compact?: boolean;
  icon?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  maxRows?: number;
  filename?: string;
  currencySymbol?: string;
  brand?: { name: string; logo?: string };
}

const FORMAT_META: Record<ExportFormat, { label: string; icon: React.ReactNode }> = {
  pdf: { label: 'Export as PDF', icon: <AppIcons.file className="w-4 h-4" /> },
  xlsx: { label: 'Export as Excel', icon: <AppIcons.spreadsheet className="w-4 h-4" /> },
  csv: { label: 'Export as CSV', icon: <AppIcons.fileDown className="w-4 h-4" /> },
  print: { label: 'Print', icon: <AppIcons.printer className="w-4 h-4" /> },
};

const ALL_FORMATS: ExportFormat[] = ['pdf', 'xlsx', 'csv', 'print'];

export function ExportButton({
  data,
  columns,
  title,
  subtitle,
  filtersSummary,
  formats = ALL_FORMATS,
  compact = false,
  icon,
  className,
  disabled = false,
  maxRows,
  filename,
  currencySymbol,
  brand = DEFAULT_BRAND,
}: ExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const run = async (format: ExportFormat) => {
    setIsOpen(false);
    if (busy) return;

    let rows = data;
    if (maxRows && data.length > maxRows) {
      rows = data.slice(0, maxRows);
      sonner.warning(`Large dataset — exporting first ${maxRows.toLocaleString()} rows`);
    }

    const config: ReportExportConfig = {
      title,
      subtitle,
      columns,
      rows,
      filtersSummary,
      filename,
      currencySymbol,
      brand,
    };

    setBusy(format);
    try {
      if (format === 'csv') exportToCSV(config);
      else if (format === 'xlsx') exportToExcel(config);
      else if (format === 'pdf') await exportToPDF(config);
      else printReport(config);
      sonner.success(`${title} ${format === 'print' ? 'sent to print' : 'exported successfully'}`);
    } catch (error) {
      console.error(`[Export] ${format} failed:`, error);
      sonner.error(`Export failed — ${(error as Error)?.message || 'unknown error'}`);
    } finally {
      setBusy(null);
    }
  };

  const trigger = (
    <Button
      variant="secondary"
      size="md"
      onClick={() => setIsOpen(o => !o)}
      disabled={disabled || data.length === 0}
      loading={!!busy}
      icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (icon ?? <AppIcons.download className="h-4 w-4" />)}
      className={
        compact
          ? `!min-h-0 !p-3.5 !bg-gray-100 dark:!bg-white/5 !text-gray-600 !rounded-2xl hover:!text-primary !border-transparent hover:!border-primary/30 ${className || ''}`
          : `!px-5 !shadow-sm ${className || ''}`
      }
    >
      {!compact && <span>Export</span>}
    </Button>
  );

  const renderFormatList = (onPick: (f: ExportFormat) => void) => (
    <div className="w-full space-y-1">
      {formats.map(f => (
        <button
          key={f}
          type="button"
          onClick={() => onPick(f)}
          disabled={!!busy}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 active:scale-[0.98] transition-all disabled:opacity-40 text-left"
        >
          <span className="text-primary">{FORMAT_META[f].icon}</span>
          <span>{FORMAT_META[f].label}</span>
          {busy === f && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary ml-auto" />}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <div className="relative" ref={menuRef}>
        {trigger}

        {isOpen && !isMobile && (
          <div className="absolute right-0 top-full mt-2 z-[60] min-w-[220px] bg-white dark:bg-surface rounded-2xl border border-gray-200 dark:border-white/10 shadow-xl p-2 animate-in fade-in zoom-in-95 duration-150">
            {renderFormatList(f => run(f))}
          </div>
        )}
      </div>

      {isOpen && isMobile && (
        <BottomSheet
          open={isOpen}
          onClose={() => setIsOpen(false)}
          title="Export Report"
          subtitle={title}
          maxWidth="md"
        >
          <div className="px-1 pb-2">
            {renderFormatList(f => run(f))}
          </div>
        </BottomSheet>
      )}
    </>
  );
}
