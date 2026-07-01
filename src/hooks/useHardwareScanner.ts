import { useEffect, useRef } from 'react';

export function useHardwareScanner(onScan: (barcodeValue: string) => void) {
  const buffer = useRef('');
  const lastKeyTime = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      if (timer.current) clearTimeout(timer.current);

      const now = Date.now();

      if (e.key === 'Enter' || e.keyCode === 13) {
        const scanned = buffer.current.trim();
        const gap = lastKeyTime.current > 0 ? now - lastKeyTime.current : 999;
        // Hardware scanners typically scan > 5 chars (e.g. ZP-00001 or EAN13) at scanner speeds
        if (scanned && scanned.length >= 5 && gap < 50) {
          e.preventDefault();
          e.stopImmediatePropagation();

          // If focused on an input, clear the buffered characters
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

      if (e.key && e.key.length === 1) {
        const gap = lastKeyTime.current > 0 ? now - lastKeyTime.current : 0;
        // USB HID barcode scanners act as rapid keyboards (gap < 50ms per keystroke)
        if (buffer.current.length > 0 && gap > 50) {
          // If the gap is > 50ms, it's a slow human typing, not a hardware scanner
          buffer.current = '';
        }

        buffer.current += e.key;
        lastKeyTime.current = now;

        // Clear buffer after 100ms of inactivity
        timer.current = setTimeout(() => {
          buffer.current = '';
          lastKeyTime.current = 0;
        }, 100);
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
}
