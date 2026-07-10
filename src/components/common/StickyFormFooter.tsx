import React from 'react';
import { Save, RefreshCw } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';

interface StickyFormFooterProps {
  show?: boolean;
  isSaving: boolean;
  onDiscard: () => void;
  onSave?: () => void;
  saveLabel?: string;
  discardLabel?: string;
  formId?: string;
  disabled?: boolean;
  unsaved?: boolean;
  statusBadge?: React.ReactNode;
}

export function StickyFormFooter({
  show = true,
  isSaving,
  onDiscard,
  onSave,
  saveLabel,
  discardLabel,
  formId,
  disabled = false,
  unsaved = false,
  statusBadge
}: StickyFormFooterProps) {
  const { t } = useTranslation();

  if (!show) return null;

  return (
    <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-0 left-0 right-0 bg-white/95 dark:bg-surface/95 border-t border-gray-200 dark:border-white/5 py-3 sm:py-4 z-[150] animate-in slide-in-from-bottom-full duration-500 shadow-[0_-8px_30px_rgba(0,0,0,0.12)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 flex items-center justify-between gap-4">
        {/* Left Side: Status / Unsaved Warning */}
        <div className="flex items-center gap-4">
          {unsaved && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 rounded-full border border-amber-500/20">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">
                {t('unsaved_modifications', 'Unsaved Modifications')}
              </span>
            </div>
          )}
          {statusBadge}
        </div>

        {/* Right Side: Discard & Save Actions */}
        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
          <button
            type="button"
            onClick={onDiscard}
            className="px-6 py-3 rounded-xl border border-gray-200 dark:border-white/10 text-[10px] font-black uppercase tracking-widest text-gray-600 hover:text-rose-500 dark:text-gray-400 dark:hover:text-white hover:bg-rose-50 dark:hover:bg-rose-500/5 transition-all active:scale-95 bg-white dark:bg-transparent shadow-sm sm:shadow-none"
          >
            {discardLabel || t('discard', 'Discard')}
          </button>
          
          <button
            form={formId}
            type={formId ? 'submit' : 'button'}
            onClick={onSave}
            disabled={isSaving || disabled}
            className={`
              flex-1 sm:flex-none flex items-center justify-center gap-3 px-8 py-3.5 rounded-2xl bg-primary text-white text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-emerald-500/20 hover:bg-primary active:scale-[0.98] transition-all
              ${isSaving || disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>{t('processing', 'Saving...')}</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>{saveLabel || t('save_changes', 'Save Changes')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
