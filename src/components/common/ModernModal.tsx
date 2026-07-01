import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ModernModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** sm=480 md=640 lg=900 xl=1200 max=1400 full=stretch */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'max' | 'full';
  className?: string;
  showClose?: boolean;
  headerClassName?: string;
  bodyClassName?: string;
  headerActions?: React.ReactNode;
}

const MAX_WIDTH_MAP: Record<string, string> = {
  sm: 'max-w-[480px]',
  md: 'max-w-[640px]',
  lg: 'max-w-[900px]',
  xl: 'max-w-[1200px]',
  max: 'max-w-[1400px]',
  full: 'max-w-full',
};

/**
 * UNIFIED CENTERED MODAL FOR ALL DEVICES
 * This is the ultimate fix for cropping issues.
 * By centering the modal and using controlled padding guards, 
 * we ensure it never hits the edges or gets hidden by docks.
 */
export function ModernModal({
  isOpen, onClose, title, subtitle, children, footer,
  maxWidth = 'md', showClose = true, headerClassName, bodyClassName, className, headerActions
}: ModernModalProps) {
  const mwClass = MAX_WIDTH_MAP[maxWidth] ?? MAX_WIDTH_MAP.md;

  // Lock body scroll while open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-[1000] overflow-y-auto overflow-x-hidden custom-scrollbar">
          {/* Backdrop */}
          <div
            onClick={onClose}
            className="fixed inset-0 bg-black/60 animate-in fade-in duration-150"
          />

          {/* Modal Container (Vertical Spacer/Centerer) */}
          <div className="min-h-full w-full flex items-center justify-center p-4 sm:p-8 pb-16">
            <div
              onClick={(e) => e.stopPropagation()}
              className={cn(
                'relative w-full my-auto flex flex-col animate-in fade-in zoom-in-95 duration-200',
                'bg-white dark:bg-surface',
                'rounded-[2.5rem] shadow-2xl',
                'border border-white/5 overflow-hidden',
                'max-h-[85dvh]', // Rule-compliant max height with top/bottom breathing room
                mwClass,
                className
              )}
            >
              {/* Header (Shrink-0 / Static) */}
              <div className={cn(
                'px-6 sm:px-10 py-5 sm:py-6 flex items-center justify-between gap-4 border-b border-gray-200 dark:border-white/5 shrink-0',
                headerClassName
              )}>
                <div className="flex-1 min-w-0">
                  {title && (
                    <h2 className="text-[16px] sm:text-[18px] font-black text-gray-900 dark:text-white uppercase tracking-wider sm:tracking-widest leading-none truncate">
                      {title}
                    </h2>
                  )}
                  {subtitle && (
                    <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mt-2 opacity-80">{subtitle}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {headerActions}
                  {showClose && (
                    <button
                      onClick={onClose}
                      className="p-3 bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-400 rounded-2xl hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-500 transition-all active:scale-90"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Scrollable Content Body (Flex-1) */}
              <div
                className={cn(
                  "flex-1 overflow-y-auto custom-scrollbar min-h-0",
                  bodyClassName || "px-6 sm:px-10 py-6 sm:py-8"
                )}
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                {children}
              </div>

              {/* Footer (Shrink-0 / Static) */}
              {footer && (
                <div className="px-6 sm:px-10 py-6 sm:py-8 bg-gray-50/50 dark:bg-black/20 border-t border-gray-200 dark:border-white/5 rounded-b-[2.5rem] shrink-0">
                  {footer}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
