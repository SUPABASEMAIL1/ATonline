import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "max" | "full";
  footer?: React.ReactNode;
  children: React.ReactNode;
  headerActions?: React.ReactNode;
  showClose?: boolean;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
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
  showClose = true,
  className,
  headerClassName,
  bodyClassName
}: ModalProps) {
  const [render, setRender] = useState(isOpen);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setRender(true);
      document.body.style.overflow = 'hidden';
    } else {
      const timer = setTimeout(() => {
        setRender(false);
        const otherOpenModals = Array.from(document.querySelectorAll('[data-modal="true"]'))
          .filter(el => el !== containerRef.current);
        if (otherOpenModals.length === 0) {
          document.body.style.overflow = '';
        }
      }, 250);
      return () => clearTimeout(timer);
    }
    
    return () => {
      const otherOpenModals = Array.from(document.querySelectorAll('[data-modal="true"]'))
        .filter(el => el !== containerRef.current);
      if (otherOpenModals.length === 0) {
        document.body.style.overflow = '';
      }
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
    <div ref={containerRef} data-modal="true" className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-6 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      {/* Backdrop — no onClick: only X button closes */}
      <div 
        className={`absolute inset-0 bg-[rgba(15,23,42,0.6)] dark:bg-[rgba(0,0,0,0.75)] transition-opacity duration-250 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
      />
      
      {/* Dialog */}
      <div 
        className={cn(
          "relative flex flex-col w-full sm:w-[90vw] bg-surface border-default border",
          "rounded-3xl shadow-2xl overflow-hidden",
          maxWidthClasses[maxWidth],
            "max-h-[calc(100dvh-2.5rem-env(safe-area-inset-top))] sm:max-h-[calc(90dvh-env(safe-area-inset-top))]",
          "transition-all duration-250 ease-out",
          isOpen ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-4 scale-95 opacity-0',
          className
        )}
      >
        {/* Header */}
        {(title || showClose) && (
          <div className={cn(
            "flex-shrink-0 flex items-center justify-between px-5 sm:px-6 py-4 border-b border-default bg-surface",
            headerClassName
          )}>
            <div className="flex flex-col min-w-0">
              {title && <h2 className="text-base sm:text-lg font-bold text-default truncate">{title}</h2>}
              {subtitle && <p className="text-xs text-muted mt-0.5 truncate">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-4">
              {headerActions}
              {showClose && (
                <button 
                  onClick={onClose}
                  className="p-2 text-muted hover:text-default hover:bg-app rounded-xl transition-colors active:scale-95"
                >
                  <X size={18} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Body */}
        <div className={cn(
          "flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-5 sm:p-6 text-default custom-scrollbar",
          bodyClassName
        )}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex-shrink-0 px-5 sm:px-6 py-4 border-t border-default bg-surface pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

