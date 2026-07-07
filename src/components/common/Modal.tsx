import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "max" | "full";
  footer?: React.ReactNode;
  children: React.ReactNode;
  headerActions?: React.ReactNode;
  showClose?: boolean;
}

const maxWidthClasses = {
  sm: 'sm:max-w-[480px]',
  md: 'sm:max-w-[640px]',
  lg: 'sm:max-w-[800px]',
  xl: 'sm:max-w-[1000px]',
  max: 'sm:max-w-screen-xl',
  full: 'sm:max-w-[95vw]'
};

export function Modal({ 
  isOpen, 
  onClose, 
  title, 
  subtitle, 
  maxWidth = "md", 
  footer, 
  children,
  headerActions,
  showClose = true
}: ModalProps) {
  const [render, setRender] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setRender(true);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      const timer = setTimeout(() => setRender(false), 250);
      return () => clearTimeout(timer);
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!render) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 bg-[rgba(15,23,42,0.5)] dark:bg-[rgba(0,0,0,0.6)] transition-opacity duration-250 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      
      {/* Dialog */}
      <div 
        className={`
          relative flex flex-col w-full sm:w-[90vw] bg-surface border-default border
          rounded-2xl shadow-2xl
          ${maxWidthClasses[maxWidth]}
          max-h-[85dvh] sm:max-h-[90dvh]
          transition-all duration-250 ease-out
          ${isOpen ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-4 scale-95 opacity-0'}
        `}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 sm:px-6 py-4 sm:py-5 border-b border-default bg-surface rounded-t-2xl">
          <div className="flex flex-col">
            <h2 className="text-lg font-bold text-default">{title}</h2>
            {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {headerActions}
            {showClose && (
              <button 
                onClick={onClose}
                className="p-2 text-muted hover:text-default hover:bg-app rounded-xl transition-colors active:scale-95"
              >
                <X size={20} />
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y p-5 sm:p-6 pb-6 sm:pb-6 text-default">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex-shrink-0 px-5 sm:px-6 py-4 border-t border-default bg-surface pb-4 sm:pb-4 rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
