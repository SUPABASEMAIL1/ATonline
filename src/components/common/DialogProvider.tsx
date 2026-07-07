import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { dialogEvents } from '../../lib/dialog';
import { AlertTriangle, HelpCircle, Loader2 } from 'lucide-react';

interface DialogState {
  id: string;
  type: 'confirm' | 'delete' | 'input' | 'loading';
  title: string;
  text?: string;
  confirmText?: string;
  cancelText?: string;
  placeholder?: string;
  inputType?: 'text' | 'email' | 'password' | 'number';
  resolve: (value: any) => void;
}

export const DialogProvider: React.FC = () => {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleShow = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setDialog(detail);
      setInputValue('');
      setIsVisible(true);

      // Auto-focus input if it's an input dialog
      if (detail.type === 'input') {
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    };

    const handleUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setDialog(prev => prev ? { ...prev, ...detail } : null);
    };

    const handleClose = () => {
      setIsVisible(false);
      setTimeout(() => setDialog(null), 200); // Wait for animation
    };

    dialogEvents.addEventListener('show-dialog', handleShow);
    dialogEvents.addEventListener('update-dialog', handleUpdate);
    dialogEvents.addEventListener('close-dialog', handleClose);

    return () => {
      dialogEvents.removeEventListener('show-dialog', handleShow);
      dialogEvents.removeEventListener('update-dialog', handleUpdate);
      dialogEvents.removeEventListener('close-dialog', handleClose);
    };
  }, []);

  const handleConfirm = () => {
    if (!dialog) return;
    if (dialog.type === 'input') {
      dialog.resolve(inputValue);
    } else {
      dialog.resolve(true);
    }
    handleCloseInternal();
  };

  const handleCancel = () => {
    if (!dialog) return;
    dialog.resolve(dialog.type === 'input' ? null : false);
    handleCloseInternal();
  };

  const handleCloseInternal = () => {
    setIsVisible(false);
    setTimeout(() => setDialog(null), 200);
  };

  if (!dialog) return null;

  return createPortal(
    <div className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-200 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/75 dark:bg-black/80"
        onClick={dialog.type !== 'loading' ? handleCancel : undefined}
      />

      {/* Dialog Card */}
      <div className={`relative w-full max-w-[400px] max-h-[85dvh] sm:max-h-[90dvh] bg-white dark:bg-surface rounded-[2rem] shadow-2xl border border-white/10 overflow-hidden transform transition-all duration-200 ${isVisible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}`}>

        {/* Progress bar for premium feel */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-500 animate-pulse shrink-0" />

        <div className="p-8 flex flex-col items-center text-center overflow-y-auto overscroll-contain touch-pan-y">
          {/* Icon Header */}
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 ${dialog.type === 'delete' ? 'bg-rose-500/10 text-rose-500' :
              dialog.type === 'loading' ? 'bg-primary/10 text-primary' :
                'bg-primary/10 text-primary'
            }`}>
            {dialog.type === 'delete' ? <AlertTriangle size={32} /> :
              dialog.type === 'loading' ? <Loader2 size={32} className="animate-spin" /> :
                <HelpCircle size={32} />}
          </div>

          <h3 className={`text-xl font-black uppercase tracking-tight mb-3 ${dialog.type === 'delete' ? 'text-rose-500' : 'text-gray-900 dark:text-white'
            }`}>
            {dialog.title}
          </h3>

          {dialog.text && (
            <p
              className="text-[13px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-tight leading-relaxed mb-6"
              dangerouslySetInnerHTML={{ __html: dialog.text }}
            />
          )}

          {dialog.type === 'input' && (
            <div className="w-full mb-6">
              <input
                ref={inputRef}
                type={dialog.inputType || 'text'}
                placeholder={dialog.placeholder}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
                className="w-full bg-gray-50 dark:bg-white/5 border-none px-5 py-4 rounded-2xl text-sm font-bold outline-none ring-2 ring-gray-100 dark:ring-white/5 focus:ring-emerald-500 transition-all text-gray-900 dark:text-white placeholder:text-gray-600"
              />
            </div>
          )}

          {dialog.type !== 'loading' && (
            <div className="flex flex-col sm:flex-row gap-3 w-full">
              {dialog.cancelText && (
                <button
                  onClick={handleCancel}
                  className="flex-1 px-6 py-4 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-600 dark:text-gray-400 rounded-2xl text-[11px] font-black uppercase tracking-[0.1em] transition-all active:scale-95"
                >
                  {dialog.cancelText}
                </button>
              )}
              <button
                onClick={handleConfirm}
                className={`flex-1 px-6 py-4 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.1em] shadow-lg transition-all active:scale-95 ${dialog.type === 'delete'
                    ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20'
                    : 'bg-primary hover:bg-primary shadow-emerald-500/20'
                  }`}
              >
                {dialog.confirmText || 'CONFIRM'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
