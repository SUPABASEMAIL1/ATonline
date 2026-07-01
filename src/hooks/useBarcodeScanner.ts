import { useEffect, useRef } from 'react';

export function useBarcodeScanner(onScan: (barcode: string) => void) {
  const buffer = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKeyTime = useRef(0);
  const onScanRef = useRef(onScan);

  // Always keep latest callback without re-creating the listener
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore modifier combos (Ctrl+C, Alt+Tab, etc.)
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      if (timer.current) clearTimeout(timer.current);

      const now = Date.now();

      if (e.key === 'Enter') {
        const scanned = (buffer.current || '').trim();
        const gap = lastKeyTime.current > 0 ? now - lastKeyTime.current : 999;
        
        // Barcode scanners are extremely fast (keystroke interval < 50ms)
        // Check both scanned length and interval speed
        if (scanned && scanned.length >= 4 && gap < 50) {
          // Stop Enter from reaching any focused input or triggering form submit
          e.preventDefault();
          e.stopImmediatePropagation();

          // Clear barcode text from any focused input (React-compatible)
          const el = document.activeElement;
          if (el instanceof HTMLInputElement && el.type !== 'checkbox' && el.type !== 'radio') {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            setter?.call(el, '');
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.blur();
          }

          onScanRef.current(scanned);
        }
        buffer.current = '';
        lastKeyTime.current = 0;
        return;
      }

      // Only accumulate printable single characters
      if (e.key && e.key.length === 1) {
        const gap = lastKeyTime.current > 0 ? now - lastKeyTime.current : 0;

        // Reset buffer if gap is > 50ms — scanners type at < 30ms per char, humans at 100ms+
        if (buffer.current.length > 0 && gap > 50) {
          buffer.current = '';
        }

        buffer.current += e.key;
        lastKeyTime.current = now;

        // Clear buffer after 150ms of no input (scanner done or stale chars)
        timer.current = setTimeout(() => {
          buffer.current = '';
          lastKeyTime.current = 0;
        }, 150);
      }
    };

    // CAPTURE PHASE — fires BEFORE any input's onKeyDown/stopPropagation
    // This is the critical fix: works even when search bar or any input is focused
    // Also works when NO element is focused (Electron desktop)
    window.addEventListener('keydown', handleKeyDown, { capture: true });

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
}
