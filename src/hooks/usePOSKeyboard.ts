import { useEffect, useCallback } from 'react';

/**
 * usePOSKeyboard — Global POS keyboard shortcut handler
 *
 * POS Terminal shortcuts:
 *   /  or  F3        → Focus product search bar
 *   Escape            → Clear search / close dropdowns
 *   F2                → Open checkout
 *   F4                → Save draft / hold order
 *   F5                → New tab
 *   F6                → Toggle return mode
 *   F7                → Open drafts
 *   Ctrl + Delete     → Clear entire cart
 *
 * Checkout Page shortcuts:
 *   1                 → Select Cash payment
 *   2                 → Select Card payment
 *   3                 → Select Digital payment
 *   4                 → Select Credit payment
 *   5                 → Select Split payment
 *   E                 → Set exact amount (match total)
 *   Enter             → Process payment (when ready)
 *   Escape            → Cancel / close checkout
 */

export interface POSKeyboardOptions {
  // POS Terminal handlers (pass undefined if not on POS screen)
  onFocusSearch?: () => void;
  onCheckout?: () => void;
  onSaveDraft?: () => void;
  onNewTab?: () => void;
  onToggleReturnMode?: () => void;
  onOpenDrafts?: () => void;
  onClearCart?: () => void;

  // Checkout Page handlers (pass undefined if not in checkout)
  onPaymentMethod?: (method: 'cash' | 'card' | 'digital' | 'credit' | 'split') => void;
  onExactAmount?: () => void;
  onProcessPayment?: () => void;
  onClose?: () => void;

  // Control flags
  isCheckoutOpen?: boolean;
  canProcessPayment?: boolean;
  isProcessing?: boolean;
}

export function usePOSKeyboard(options: POSKeyboardOptions) {
  const {
    onFocusSearch,
    onCheckout,
    onSaveDraft,
    onNewTab,
    onToggleReturnMode,
    onOpenDrafts,
    onClearCart,
    onPaymentMethod,
    onExactAmount,
    onProcessPayment,
    onClose,
    isCheckoutOpen = false,
    canProcessPayment = false,
    isProcessing = false,
  } = options;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTypingInField =
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'checkbox' && (target as HTMLInputElement).type !== 'radio');

      // ── CHECKOUT SHORTCUTS (active when checkout modal is open) ──
      if (isCheckoutOpen) {
        // Escape → close checkout
        if (e.key === 'Escape' && !isTypingInField) {
          e.preventDefault();
          onClose?.();
          return;
        }

        // Enter → process payment (only when not typing & payment is valid)
        if (e.key === 'Enter' && !isTypingInField && !isProcessing && canProcessPayment) {
          e.preventDefault();
          onProcessPayment?.();
          return;
        }

        // E → exact amount
        if ((e.key === 'e' || e.key === 'E') && !isTypingInField) {
          e.preventDefault();
          onExactAmount?.();
          return;
        }

        // 1 → Cash
        if (e.key === '1' && !isTypingInField) {
          e.preventDefault();
          onPaymentMethod?.('cash');
          return;
        }

        // 2 → Card
        if (e.key === '2' && !isTypingInField) {
          e.preventDefault();
          onPaymentMethod?.('card');
          return;
        }

        // 3 → Digital
        if (e.key === '3' && !isTypingInField) {
          e.preventDefault();
          onPaymentMethod?.('digital');
          return;
        }

        // 4 → Credit
        if (e.key === '4' && !isTypingInField) {
          e.preventDefault();
          onPaymentMethod?.('credit');
          return;
        }

        // 5 → Split
        if (e.key === '5' && !isTypingInField) {
          e.preventDefault();
          onPaymentMethod?.('split');
          return;
        }

        return; // Don't fire POS shortcuts while checkout is open
      }

      // ── POS TERMINAL SHORTCUTS ──

      // / or F3 → focus search
      if ((e.key === '/' || e.key === 'F3') && !isTypingInField) {
        e.preventDefault();
        onFocusSearch?.();
        return;
      }

      // F2 → checkout
      if (e.key === 'F2' && !isTypingInField) {
        e.preventDefault();
        onCheckout?.();
        return;
      }

      // F4 → save draft
      if (e.key === 'F4' && !isTypingInField) {
        e.preventDefault();
        onSaveDraft?.();
        return;
      }

      // F5 → new tab (prevent browser refresh)
      if (e.key === 'F5') {
        e.preventDefault();
        onNewTab?.();
        return;
      }

      // F6 → toggle return mode
      if (e.key === 'F6' && !isTypingInField) {
        e.preventDefault();
        onToggleReturnMode?.();
        return;
      }

      // F7 → open drafts
      if (e.key === 'F7' && !isTypingInField) {
        e.preventDefault();
        onOpenDrafts?.();
        return;
      }

      // Ctrl + Delete → clear cart
      if (e.key === 'Delete' && (e.ctrlKey || e.metaKey) && !isTypingInField) {
        e.preventDefault();
        onClearCart?.();
        return;
      }
    },
    [
      isCheckoutOpen,
      canProcessPayment,
      isProcessing,
      onFocusSearch,
      onCheckout,
      onSaveDraft,
      onNewTab,
      onToggleReturnMode,
      onOpenDrafts,
      onClearCart,
      onPaymentMethod,
      onExactAmount,
      onProcessPayment,
      onClose,
    ]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [handleKeyDown]);
}
