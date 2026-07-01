import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/SupabaseAppContext';
import { TouchKeyboard } from '../components/common/TouchKeyboard';

interface TouchKeyboardContextType {
  isKeyboardOpen: boolean;
  openKeyboard: (element: HTMLInputElement | HTMLTextAreaElement) => void;
  closeKeyboard: () => void;
}

const TouchKeyboardContext = createContext<TouchKeyboardContextType | undefined>(undefined);

export function useTouchKeyboard() {
  const context = useContext(TouchKeyboardContext);
  if (!context) throw new Error('useTouchKeyboard must be used within a TouchKeyboardProvider');
  return context;
}

export function TouchKeyboardProvider({ children }: { children: React.ReactNode }) {
  const { state } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [activeElement, setActiveElement] = useState<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const openKeyboard = useCallback((element: HTMLInputElement | HTMLTextAreaElement) => {
    setActiveElement(element);
    setIsOpen(true);

    // Auto-scroll the element into view so it's not covered by the keyboard
    setTimeout(() => {
      const rect = element.getBoundingClientRect();
      const keyboardHeight = window.innerWidth < 1024 ? 260 : 320;
      const threshold = window.innerHeight - keyboardHeight - 40;

      if (rect.bottom > threshold) {
        const scrollContainer = element.closest('.overflow-y-auto') || window;
        const scrollAmount = rect.bottom - threshold + 20;

        if (scrollContainer === window) {
          window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
        } else {
          (scrollContainer as HTMLElement).scrollBy({ top: scrollAmount, behavior: 'smooth' });
        }
      }
    }, 150);
  }, []);

  const closeKeyboard = useCallback(() => {
    setIsOpen(false);
    setActiveElement(null);
  }, []);

  const handleInput = useCallback((char: string) => {
    if (!activeElement) return;

    // For number inputs, selectionStart is often null. Default to value length to append instead of prepend.
    const isNumberInput = activeElement.type === 'number';
    let start = 0;
    let end = 0;

    try {
      start = activeElement.selectionStart ?? activeElement.value.length;
      end = activeElement.selectionEnd ?? activeElement.value.length;
    } catch (e) {
      start = activeElement.value.length;
      end = activeElement.value.length;
    }

    const value = activeElement.value;
    const newValue = value.substring(0, start) + char + value.substring(end);

    // ── CRITICAL REACT SYNC FIX ─────────────────────────────────────
    // Use the native value setter to ensure React's internal tracker sees the change
    const prototype = activeElement instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;

    const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(activeElement, newValue);
    } else {
      activeElement.value = newValue;
    }

    // Maintain cursor position
    const newPos = start + char.length;
    if (!isNumberInput) {
      try { activeElement.setSelectionRange(newPos, newPos); } catch (_) { /* ignore */ }
    }

    // Trigger input event
    activeElement.dispatchEvent(new Event('input', { bubbles: true }));
    activeElement.dispatchEvent(new Event('change', { bubbles: true }));

    activeElement.focus();
  }, [activeElement]);

  const handleBackspace = useCallback(() => {
    if (!activeElement) return;

    const isNumberInput = activeElement.type === 'number';
    let start = 0;
    let end = 0;

    try {
      start = activeElement.selectionStart ?? activeElement.value.length;
      end = activeElement.selectionEnd ?? activeElement.value.length;
    } catch (e) {
      start = activeElement.value.length;
      end = activeElement.value.length;
    }

    const value = activeElement.value;
    let newValue = '';
    let newPos = start;

    if (start !== end) {
      newValue = value.substring(0, start) + value.substring(end);
      newPos = start;
    } else if (start > 0) {
      newValue = value.substring(0, start - 1) + value.substring(start);
      newPos = start - 1;
    } else {
      return;
    }

    // ── CRITICAL REACT SYNC FIX ─────────────────────────────────────
    const prototype = activeElement instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;

    const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(activeElement, newValue);
    } else {
      activeElement.value = newValue;
    }

    if (!isNumberInput) {
      try { activeElement.setSelectionRange(newPos, newPos); } catch (_) { /* ignore */ }
    }

    activeElement.dispatchEvent(new Event('input', { bubbles: true }));
    activeElement.dispatchEvent(new Event('change', { bubbles: true }));
    activeElement.focus();
  }, [activeElement]);

  const handleEnter = useCallback(() => {
    if (!activeElement) return;

    if (activeElement.tagName === 'TEXTAREA') {
      handleInput('\n');
    } else {
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      });
      const dispatched = activeElement.dispatchEvent(event);
      if (!event.defaultPrevented && dispatched) {
        activeElement.blur();
        setIsOpen(false);
        setActiveElement(null);
      }
    }
  }, [activeElement, handleInput]);

  useEffect(() => {
    if (!state.settings.touchKeyboardEnabled) {
      setIsOpen(false); setActiveElement(null);
      return;
    }

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      
      if (isInput) {
        const input = target as HTMLInputElement | HTMLTextAreaElement;

        // Skip hidden or disabled inputs
        if (input.tagName === 'INPUT') {
          if (input.type === 'hidden' || input.type === 'file' || input.type === 'checkbox' || input.type === 'radio') return;
        }
        if (input.readOnly || input.disabled) return;

        openKeyboard(input);
      }
    };

    // Global listener to close keyboard when clicking outside
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // ⚠️ CRITICAL: If a SweetAlert2 modal is open, NEVER process this event.
      // Processing it would blur the active input and potentially re-trigger
      // async handlers that called the modal (causing double popups).
      if (document.querySelector('.swal2-container')) return;

      // If clicking an input, textarea, or contentEditable, let focusin handle it
      const isInput = target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // Check if clicking a label for an input
      const isLabel = target.tagName === 'LABEL' || target.closest('label');

      // If clicking a button, we assume it's an action (like 'Select Customer' or 'Checkout')
      // Many of these buttons don't need the keyboard open.
      const isButton = target.closest('button');

      // If clicking the keyboard itself, do nothing
      const isKeyboard = target.closest('.touch-keyboard-container');

      if (isInput) {
        // If clicking an already focused input, focusin won't fire again.
        // We ensure the keyboard opens/unfolds here.
        openKeyboard(target as any);
        return;
      }

      if (!isInput && !isKeyboard && !isLabel) {
        closeKeyboard();
      }
    };

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('mousedown', onMouseDown);

    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [state.settings.touchKeyboardEnabled, openKeyboard, closeKeyboard]);

  return (
    <TouchKeyboardContext.Provider value={{ isKeyboardOpen: isOpen, openKeyboard, closeKeyboard }}>
      {children}
      <div className="touch-keyboard-container">
        <TouchKeyboard
          isOpen={isOpen}
          onClose={closeKeyboard}
          onInput={handleInput}
          onBackspace={handleBackspace}
          onEnter={handleEnter}
          inputElement={activeElement}
        />
      </div>
    </TouchKeyboardContext.Provider>
  );
}
