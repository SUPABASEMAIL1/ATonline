import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { X, Delete, Type, Hash, Delete as Backspace, CornerDownLeft, Globe, Space, GripHorizontal, Keyboard as KeyboardIcon, Minimize2 } from 'lucide-react';
import { useSoundFeedback } from '../../hooks/useSoundFeedback';

interface TouchKeyboardProps {
  isOpen: boolean;
  onClose: () => void;
  onInput: (char: string) => void;
  onBackspace: () => void;
  onEnter: () => void;
  inputElement: HTMLInputElement | HTMLTextAreaElement | null;
}

const LAYOUTS = {
  qwerty: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', 'BKSP'],
    ['123', 'ABC', ',', 'SPACE', '.', 'ENTER']
  ],
  numeric: [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['.', '0', 'BKSP'],
    ['ABC', '123', 'CLEAR', 'ENTER']
  ],
  symbols: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['-', '/', ':', ';', '(', ')', '$', '&', '@', '"'],
    ['[', ']', '{', '}', '#', '%', '^', '*', '+', '='],
    ['_', '\\', '|', '~', '<', '>', '?', '!', 'BKSP'],
    ['ABC', ',', 'SPACE', '.', 'ENTER']
  ]
};

export const TouchKeyboard = React.memo(function TouchKeyboard({ isOpen, onClose, onInput, onBackspace, onEnter, inputElement }: TouchKeyboardProps) {
  const [layout, setLayout] = useState<'qwerty' | 'numeric' | 'calculator' | 'symbols'>('qwerty');
  const [isCaps, setIsCaps] = useState(false);
  const { play } = useSoundFeedback();

  // Calculator State
  const [calcExpr, setCalcExpr] = useState('');
  const [calcResult, setCalcResult] = useState('');
  const [calcHistoryExpr, setCalcHistoryExpr] = useState('');

  // Dragging state
  const [position, setPosition] = useState(() => {
    const saved = localStorage.getItem('keyboard_position');
    return saved ? JSON.parse(saved) : { x: 0, y: 0 };
  });
  const [scale, setScale] = useState(() => {
    const saved = localStorage.getItem('keyboard_scale');
    return saved ? parseFloat(saved) : 1.0;
  });
  const [widthScale, setWidthScale] = useState(() => {
    const saved = localStorage.getItem('keyboard_width_scale');
    return saved ? parseFloat(saved) : 1.0;
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isFolded, setIsFolded] = useState(false);
  const [forceOpen, setForceOpen] = useState(false);
  const keyboardRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const calcInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number; currentX: number; currentY: number; initialScale: number }>({ startX: 0, startY: 0, initialX: 0, initialY: 0, currentX: 0, currentY: 0, initialScale: 1.0 });

  // Auto-repeat state for BKSP
  const autoRepeatTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoRepeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasAutoRepeated = useRef(false);

  const clampPosition = useCallback((x: number, y: number, currentScale = scale, currentWidthScale = widthScale) => {
    const winW = window.innerWidth;
    const winH = window.innerHeight;

    let actualWidth = 56;
    let actualHeight = 56;

    if (!isFolded) {
      const kW = innerRef.current?.offsetWidth || 700;
      const kH = innerRef.current?.offsetHeight || 380;
      actualWidth = kW * currentWidthScale * currentScale;
      actualHeight = kH * currentScale;
    }

    const minX = -Math.max(0, (winW / 2 - actualWidth / 2 - 8));
    const maxX = Math.max(0, (winW / 2 - actualWidth / 2 - 8));

    // Enforce safe 24px margin from the screen top, and 0px at bottom
    const minY = -Math.max(0, (winH - actualHeight - 24));
    const maxY = 0;

    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y))
    };
  }, [scale, widthScale, isFolded]);

  const clearAutoRepeat = useCallback(() => {
    if (autoRepeatTimeoutRef.current) clearTimeout(autoRepeatTimeoutRef.current);
    if (autoRepeatIntervalRef.current) clearInterval(autoRepeatIntervalRef.current);
  }, []);

  useEffect(() => {
    return clearAutoRepeat;
  }, [clearAutoRepeat]);

  // Position is preserved across opens by not resetting it.
  useEffect(() => {
    // We intentionally do not reset position to {x:0, y:0} here 
    // so it remembers where the user dragged it last.
  }, []);

  // Keep keyboard inside safe bounds when scale or widthScale changes
  useEffect(() => {
    const clamped = clampPosition(position.x, position.y);
    if (clamped.x !== position.x || clamped.y !== position.y) {
      setPosition(clamped);
      localStorage.setItem('keyboard_position', JSON.stringify(clamped));
    }
  }, [scale, widthScale, clampPosition, position.x, position.y]);

  useLayoutEffect(() => {
    if (keyboardRef.current && !isDragging) {
      keyboardRef.current.style.transform = `translate3d(calc(-50% + ${position.x}px), ${position.y}px, 0)`;
    }
  }, [position.x, position.y, isDragging]);

  // Pointer event handlers for dragging and resizing
  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handlePointerMove = (e: PointerEvent) => {
      e.preventDefault();

      if (isDragging) {
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;

        const rawX = dragRef.current.initialX + dx;
        const rawY = dragRef.current.initialY + dy;

        const clamped = clampPosition(rawX, rawY, dragRef.current.initialScale, widthScale);
        dragRef.current.currentX = clamped.x;
        dragRef.current.currentY = clamped.y;

        if (keyboardRef.current) {
          keyboardRef.current.style.transform = `translate3d(calc(-50% + ${clamped.x}px), ${clamped.y}px, 0)`;
        }
      } else if (isResizing) {
        const dy = e.clientY - dragRef.current.startY;
        // Dragging down makes it larger, up makes it smaller
        const newScale = Math.max(0.6, Math.min(1.4, dragRef.current.initialScale + (dy / 300)));
        setScale(newScale);
        localStorage.setItem('keyboard_scale', String(newScale));
      }
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      setIsResizing(false);
      // Save final position back to React state so it persists
      if (dragRef.current.currentX !== dragRef.current.initialX || dragRef.current.currentY !== dragRef.current.initialY) {
        const newPos = { x: dragRef.current.currentX, y: dragRef.current.currentY };
        setPosition(newPos);
        localStorage.setItem('keyboard_position', JSON.stringify(newPos));
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isDragging, isResizing, clampPosition, widthScale]);

  const handlePointerDown = (e: React.PointerEvent, type: 'drag' | 'resize') => {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: position.x,
      initialY: position.y,
      currentX: position.x,
      currentY: position.y,
      initialScale: scale
    };
    if (type === 'drag') setIsDragging(true);
    else setIsResizing(true);
  };

  // Auto-switch layout based on input type - Only on initial focus
  const prevInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (inputElement) {
      const isNewInput = inputElement !== prevInputRef.current;
      prevInputRef.current = inputElement;

      if (isNewInput && layout !== 'calculator') {
        if (inputElement.type === 'number' || inputElement.inputMode === 'numeric' || inputElement.inputMode === 'decimal') {
          setLayout('numeric');
        } else {
          setLayout('qwerty');
        }
      }
    }
  }, [inputElement, isOpen, layout]);

  const insertAtCursor = useCallback((char: string) => {
    if (calcHistoryExpr) {
      setCalcHistoryExpr('');
    }

    const input = calcInputRef.current;
    if (!input) {
      setCalcExpr(prev => prev + char);
      return;
    }

    const start = input.selectionStart ?? calcExpr.length;
    const end = input.selectionEnd ?? calcExpr.length;
    const val = calcExpr;
    const newVal = val.substring(0, start) + char + val.substring(end);

    setCalcExpr(newVal);

    const newPos = start + char.length;
    setTimeout(() => {
      input.focus();
      input.setSelectionRange(newPos, newPos);
    }, 0);
  }, [calcExpr, calcHistoryExpr]);

  const deleteAtCursor = useCallback(() => {
    if (calcHistoryExpr) {
      setCalcHistoryExpr('');
    }

    const input = calcInputRef.current;
    if (!input) {
      setCalcExpr(prev => prev.slice(0, -1));
      return;
    }

    const start = input.selectionStart ?? calcExpr.length;
    const end = input.selectionEnd ?? calcExpr.length;
    const val = calcExpr;

    let newVal = '';
    let newPos = start;

    if (start !== end) {
      newVal = val.substring(0, start) + val.substring(end);
      newPos = start;
    } else if (start > 0) {
      newVal = val.substring(0, start - 1) + val.substring(start);
      newPos = start - 1;
    } else {
      return;
    }

    setCalcExpr(newVal);

    setTimeout(() => {
      input.focus();
      input.setSelectionRange(newPos, newPos);
    }, 0);
  }, [calcExpr, calcHistoryExpr]);

  // Autofocus calculator input when layout is switched to calculator
  useEffect(() => {
    if (layout === 'calculator' && isOpen && !isFolded) {
      setTimeout(() => {
        if (calcInputRef.current) {
          calcInputRef.current.focus();
          const len = calcExpr.length;
          calcInputRef.current.setSelectionRange(len, len);
        }
      }, 100);
    }
  }, [layout, isOpen, isFolded]);

  if (!isOpen && !forceOpen && !isFolded) return null;

  const handleCalcClick = (key: string) => {
    play('keypress');

    // If we already evaluated a result, handle starting a new calc vs extending the result
    if (calcResult && calcResult !== 'Error') {
      if (['/', '*', '-', '+'].includes(key)) {
        setCalcHistoryExpr('');
        setCalcExpr(calcResult + key);
        setCalcResult('');
        setTimeout(() => {
          if (calcInputRef.current) {
            calcInputRef.current.focus();
            const len = calcResult.length + key.length;
            calcInputRef.current.setSelectionRange(len, len);
          }
        }, 0);
        return;
      } else if (key === '=') {
        return;
      } else if (key === 'BKSP') {
        setCalcHistoryExpr('');
        setCalcExpr('');
        setCalcResult('');
        setTimeout(() => {
          calcInputRef.current?.focus();
        }, 0);
        return;
      } else if (key === 'INSERT') {
        // Insert is handled below
      } else if (key !== 'C') {
        setCalcHistoryExpr('');
        setCalcExpr(key);
        setCalcResult('');
        setTimeout(() => {
          if (calcInputRef.current) {
            calcInputRef.current.focus();
            calcInputRef.current.setSelectionRange(1, 1);
          }
        }, 0);
        return;
      }
    }

    if (key === 'C') {
      setCalcExpr('');
      setCalcResult('');
      setCalcHistoryExpr('');
      setTimeout(() => {
        calcInputRef.current?.focus();
      }, 0);
    } else if (key === '=') {
      try {
        const sanitized = calcExpr.replace(/[^-()\d/*+.]/g, '');
        const res = new Function(`return ${sanitized || '0'}`)();
        setCalcHistoryExpr(calcExpr); // Save expression before calculating result
        setCalcResult(String(Number(res.toFixed(6))));
        play('enter');
      } catch {
        setCalcResult('Error');
      }
    } else if (key === 'BKSP') {
      play('delete');
      deleteAtCursor();
    } else if (key === 'INSERT') {
      play('enter');
      const textToInsert = calcResult || calcExpr;
      if (textToInsert) {
        for (const char of textToInsert) {
          onInput(char);
        }
        setLayout('numeric'); // Return to numeric after insert
      }
    } else {
      insertAtCursor(key);
    }
  };

  const handleCalcInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;

    if (calcHistoryExpr) {
      setCalcHistoryExpr('');
    }

    if (calcResult) {
      const lastChar = val.slice(-1);
      if (['+', '-', '*', '/'].includes(lastChar)) {
        setCalcExpr(calcResult + lastChar);
      } else {
        setCalcExpr(lastChar);
      }
      setCalcResult('');
      return;
    }

    let cleaned = val
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/−/g, '-')
      .replace(/[^0-9+\-*/().]/g, '');

    setCalcExpr(cleaned);
    setCalcResult('');
  };

  const handleCalcInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCalcClick('=');
    }
  };

  const handleCalcInputClick = () => {
    if (calcResult) {
      const input = calcInputRef.current;
      const pos = input ? (input.selectionStart ?? calcResult.length) : calcResult.length;

      setCalcExpr(calcResult);
      setCalcResult('');
      play('keypress');

      setTimeout(() => {
        if (calcInputRef.current) {
          calcInputRef.current.focus();
          calcInputRef.current.setSelectionRange(pos, pos);
        }
      }, 0);
    }
  };

  const handleKeyClick = (key: string) => {
    if (layout === 'calculator') {
      handleCalcClick(key);
      return;
    }

    if (key === 'BKSP') {
      play('delete');
      onBackspace();
    } else if (key === 'ENTER') {
      play('enter');
      setForceOpen(false);
      onEnter();
      setIsFolded(true); // Fold instead of disappear
    } else if (key === 'SPACE') {
      play('space');
      onInput(' ');
    } else if (key === 'ABC' || key === 'abc') {
      play('keypress');
      if (layout === 'symbols' || layout === 'numeric') {
        setLayout('qwerty');
      } else {
        setIsCaps(!isCaps);
      }
    } else if (key === '123') {
      play('keypress');
      setLayout('symbols');
    } else if (key === 'CLEAR') {
      play('delete');
      if (inputElement) {
        const prototype = inputElement instanceof HTMLTextAreaElement
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;

        const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        if (nativeSetter) {
          nativeSetter.call(inputElement, '');
        } else {
          inputElement.value = '';
        }

        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        inputElement.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else {
      play('keypress');
      onInput(isCaps ? key.toUpperCase() : key);
    }
  };

  const CALC_LAYOUT = [
    ['C', '(', ')', '/'],
    ['7', '8', '9', '*'],
    ['4', '5', '6', '-'],
    ['1', '2', '3', '+'],
    ['0', '.', 'BKSP', '=']
  ];

  const currentLayout = layout === 'calculator' ? CALC_LAYOUT : LAYOUTS[layout];

  return (
    <div
      ref={keyboardRef}
      className="fixed z-[9999]"
      style={{
        bottom: '8px',
        left: '50%',
        touchAction: 'none',
        transformOrigin: 'bottom center',
        willChange: 'transform',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden'
      }}
    >
      {/* Folded Bubble Icon */}
      <button
        className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-14 bg-primary hover:bg-primary text-white rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.3)] flex items-center justify-center origin-bottom transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${isFolded ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-[0.2] pointer-events-none'} ${isDragging && isFolded ? 'cursor-grabbing scale-95' : 'cursor-grab hover:scale-105 active:scale-90'}`}
        onClick={(e) => {
          e.stopPropagation();
          if (dragRef.current.initialX === position.x && dragRef.current.initialY === position.y) {
            setIsFolded(false);
            setForceOpen(true);
            play('info');
          }
        }}
        onPointerDown={(e) => {
          e.preventDefault();
          handlePointerDown(e, 'drag');
        }}
        onMouseDown={(e) => e.preventDefault()}
        aria-label="Expand keyboard"
      >
        <KeyboardIcon className="w-6 h-6" />
      </button>

      <div
        ref={innerRef}
        className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-[calc(100vw-1rem)] md:w-[700px] max-w-3xl rounded-[2.5rem] select-none flex flex-col origin-bottom ${!isDragging && !isResizing ? 'transition-[transform,opacity] duration-300 ease-out' : ''} ${!isFolded ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-[0.2] pointer-events-none pb-0'} ${isDragging && !isFolded ? 'cursor-grabbing scale-[0.98]' : (isResizing ? 'cursor-ns-resize' : 'cursor-default')}`}
        style={{
          transform: `translateX(-50%) scale(${widthScale * scale}, ${scale})`,
          transformOrigin: 'bottom center',
          willChange: 'transform, opacity',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden'
        }}
        onMouseDown={(e) => {
          if (e.target === calcInputRef.current) {
            return;
          }
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {/* Background & Shadow layer isolated to prevent Chromium rasterization shadow box glitch on repaint */}
        <div
          className="absolute inset-0 bg-white dark:bg-surface border border-gray-200 dark:border-white/10 shadow-[0_15px_30px_rgba(0,0,0,0.08)] dark:shadow-[0_15px_30px_rgba(0,0,0,0.4)] rounded-[2.5rem] pointer-events-none z-0"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            willChange: 'transform'
          }}
        />

        {/* Edge Grips for 4-way movement (Visible, styled grey by default, emerald green on hover) */}
        {/* Top Handle */}
        <div
          className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-28 h-5 bg-gray-300 dark:bg-zinc-700/85 rounded-full cursor-grab active:cursor-grabbing border-2 border-white dark:border-[#111] flex items-center justify-center z-[20] shadow-sm hover:bg-primary dark:hover:bg-primary hover:shadow-md transition-[background-color,box-shadow] duration-150 group"
          onPointerDown={(e) => {
            e.stopPropagation();
            handlePointerDown(e, 'drag');
          }}
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          title="Drag to move"
        >
          <div className="flex gap-1.5">
            <div className="w-1.5 h-1.5 bg-gray-500 dark:bg-zinc-400 group-hover:bg-white rounded-full transition-colors" />
            <div className="w-1.5 h-1.5 bg-gray-500 dark:bg-zinc-400 group-hover:bg-white rounded-full transition-colors" />
            <div className="w-1.5 h-1.5 bg-gray-500 dark:bg-zinc-400 group-hover:bg-white rounded-full transition-colors" />
          </div>
        </div>

        {/* Bottom Handle */}
        <div
          className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-28 h-5 bg-gray-300 dark:bg-zinc-700/85 rounded-full cursor-grab active:cursor-grabbing border-2 border-white dark:border-[#111] flex items-center justify-center z-[20] shadow-sm hover:bg-primary dark:hover:bg-primary hover:shadow-md transition-[background-color,box-shadow] duration-150 group"
          onPointerDown={(e) => {
            e.stopPropagation();
            handlePointerDown(e, 'drag');
          }}
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          title="Drag to move"
        >
          <div className="flex gap-1.5">
            <div className="w-1.5 h-1.5 bg-gray-500 dark:bg-zinc-400 group-hover:bg-white rounded-full transition-colors" />
            <div className="w-1.5 h-1.5 bg-gray-500 dark:bg-zinc-400 group-hover:bg-white rounded-full transition-colors" />
            <div className="w-1.5 h-1.5 bg-gray-500 dark:bg-zinc-400 group-hover:bg-white rounded-full transition-colors" />
          </div>
        </div>

        {/* Left Handle */}
        <div
          className="absolute top-1/2 -left-2.5 -translate-y-1/2 w-5 h-28 bg-gray-300 dark:bg-zinc-700/85 rounded-full cursor-grab active:cursor-grabbing border-2 border-white dark:border-[#111] flex flex-col items-center justify-center gap-1.5 z-[20] shadow-sm hover:bg-primary dark:hover:bg-primary hover:shadow-md transition-[background-color,box-shadow] duration-150 group"
          onPointerDown={(e) => {
            e.stopPropagation();
            handlePointerDown(e, 'drag');
          }}
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          title="Drag to move"
        >
          <div className="flex flex-col gap-1.5">
            <div className="w-1.5 h-1.5 bg-gray-500 dark:bg-zinc-400 group-hover:bg-white rounded-full transition-colors" />
            <div className="w-1.5 h-1.5 bg-gray-500 dark:bg-zinc-400 group-hover:bg-white rounded-full transition-colors" />
            <div className="w-1.5 h-1.5 bg-gray-500 dark:bg-zinc-400 group-hover:bg-white rounded-full transition-colors" />
          </div>
        </div>

        {/* Right Handle */}
        <div
          className="absolute top-1/2 -right-2.5 -translate-y-1/2 w-5 h-28 bg-gray-300 dark:bg-zinc-700/85 rounded-full cursor-grab active:cursor-grabbing border-2 border-white dark:border-[#111] flex flex-col items-center justify-center gap-1.5 z-[20] shadow-sm hover:bg-primary dark:hover:bg-primary hover:shadow-md transition-[background-color,box-shadow] duration-150 group"
          onPointerDown={(e) => {
            e.stopPropagation();
            handlePointerDown(e, 'drag');
          }}
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          title="Drag to move"
        >
          <div className="flex flex-col gap-1.5">
            <div className="w-1.5 h-1.5 bg-gray-500 dark:bg-zinc-400 group-hover:bg-white rounded-full transition-colors" />
            <div className="w-1.5 h-1.5 bg-gray-500 dark:bg-zinc-400 group-hover:bg-white rounded-full transition-colors" />
            <div className="w-1.5 h-1.5 bg-gray-500 dark:bg-zinc-400 group-hover:bg-white rounded-full transition-colors" />
          </div>
        </div>

        {/* Top Spacing */}
        <div className="w-full pt-3 pb-1 select-none pointer-events-none" />

        <div className="px-3 pb-4 lg:px-5 lg:pb-5 pt-1 relative z-10">
          {/* Header/Control bar */}
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  if (layout === 'qwerty') setLayout('numeric');
                  else if (layout === 'numeric') setLayout('symbols');
                  else setLayout('qwerty');
                }}
                className={`p-1.5 rounded-lg transition-colors ${layout !== 'calculator' ? 'bg-emerald-100/50 text-primary dark:bg-primary/20 dark:text-emerald-400' : 'bg-gray-100 dark:bg-white/5 text-gray-600 hover:text-primary'}`}
                title="Toggle Layout"
              >
                {layout === 'qwerty' ? <Hash className="w-4 h-4" /> : layout === 'symbols' ? <Type className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setLayout(layout === 'calculator' ? 'numeric' : 'calculator')}
                className={`p-1.5 rounded-lg transition-colors ${layout === 'calculator' ? 'bg-indigo-100/50 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400' : 'bg-gray-100 dark:bg-white/5 text-gray-600 hover:text-indigo-500'}`}
                title="Toggle Calculator"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="20" x="4" y="2" rx="2" /><line x1="8" x2="16" y1="6" y2="6" /><line x1="16" x2="16" y1="14" y2="18" /><path d="M16 10h.01" /><path d="M12 10h.01" /><path d="M8 10h.01" /><path d="M12 14h.01" /><path d="M8 14h.01" /><path d="M12 18h.01" /><path d="M8 18h.01" /></svg>
              </button>
              <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest leading-none">
                {layout === 'qwerty' ? 'Alpha' : layout === 'calculator' ? 'Calculator' : layout === 'symbols' ? 'Symbols' : 'Numeric'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const scales = [0.5, 0.6, 0.7, 0.8, 1.0, 1.2];
                  const currentIndex = scales.indexOf(scale);
                  const nextScale = scales[(currentIndex + 1) % scales.length];
                  setScale(nextScale);
                  localStorage.setItem('keyboard_scale', String(nextScale));
                  play('info');
                }}
                className="p-1.5 bg-gray-100 dark:bg-white/5 rounded-md text-gray-600 hover:text-primary transition-colors flex items-center gap-1"
                title="Change Size"
              >
                <div className="flex items-end gap-[1px] h-3">
                  <div className={`w-[2px] bg-current rounded-full ${scale >= 0.5 ? 'h-full' : 'h-1/4 opacity-30'}`} />
                  <div className={`w-[2px] bg-current rounded-full ${scale >= 0.6 ? 'h-full' : 'h-1/3 opacity-30'}`} />
                  <div className={`w-[2px] bg-current rounded-full ${scale >= 0.7 ? 'h-full' : 'h-1/2 opacity-30'}`} />
                  <div className={`w-[2px] bg-current rounded-full ${scale >= 0.8 ? 'h-full' : 'h-2/3 opacity-30'}`} />
                  <div className={`w-[2px] bg-current rounded-full ${scale >= 1.0 ? 'h-full' : 'h-3/4 opacity-30'}`} />
                  <div className={`w-[2px] bg-current rounded-full ${scale >= 1.2 ? 'h-full' : 'h-full opacity-30'}`} />
                </div>
              </button>
              <button
                onClick={() => {
                  const widths = [0.8, 0.9, 1.0, 1.1, 1.2];
                  const currentIndex = widths.indexOf(widthScale);
                  const nextWidth = widths[(currentIndex + 1) % widths.length];
                  setWidthScale(nextWidth);
                  localStorage.setItem('keyboard_width_scale', String(nextWidth));
                  play('info');
                }}
                className="p-1.5 bg-gray-100 dark:bg-white/5 rounded-md text-gray-600 hover:text-primary transition-colors flex items-center gap-1"
                title="Change Width"
              >
                <div className="flex items-center gap-[1px] w-3 h-3">
                  <div className={`h-[2px] bg-current rounded-full ${widthScale >= 0.8 ? 'w-full' : 'w-1/3 opacity-30'}`} />
                  <div className={`h-[2px] bg-current rounded-full ${widthScale >= 1.0 ? 'h-full' : 'w-2/3 opacity-30'}`} />
                  <div className={`h-[2px] bg-current rounded-full ${widthScale >= 1.2 ? 'w-full' : 'w-full opacity-30'}`} />
                </div>
              </button>
              {layout === 'calculator' && (
                <button
                  onClick={() => handleKeyClick('INSERT')}
                  className="mr-3 px-3 py-1 bg-primary hover:bg-primary text-white text-xs font-bold rounded-lg transition-colors"
                  title="Insert result into input"
                >
                  Insert
                </button>
              )}
              <button
                onClick={() => {
                  // Snap Logic (4 Sides)
                  const winW = window.innerWidth;
                  const winH = window.innerHeight;

                  // Sequence: Bottom Center -> Bottom Left -> Top Left -> Top Right -> Bottom Right
                  const presets = [
                    { x: 0, y: 0 }, // Bottom Center
                    { x: -winW, y: 0 }, // Bottom Left
                    { x: -winW, y: -winH }, // Top Left
                    { x: winW, y: -winH }, // Top Right
                    { x: winW, y: 0 }, // Bottom Right
                  ].map(p => clampPosition(p.x, p.y, scale, widthScale));

                  // Find next preset
                  const currentIdx = presets.findIndex(p => Math.abs(p.x - position.x) < 50 && Math.abs(p.y - position.y) < 50);
                  const nextPreset = presets[(currentIdx + 1) % presets.length];

                  setPosition(nextPreset);
                  localStorage.setItem('keyboard_position', JSON.stringify(nextPreset));
                  play('info');
                }}
                className="p-1.5 bg-gray-100 dark:bg-white/5 rounded-md text-gray-600 hover:text-primary transition-colors"
                title="Snap to Corners"
              >
                <GripHorizontal className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsFolded(true);
                  play('info');
                }}
                className="p-1.5 bg-gray-100 dark:bg-white/5 rounded-md text-gray-600 hover:text-primary transition-colors"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onClose();
                  setForceOpen(false);
                }}
                className="p-1.5 bg-gray-100 dark:bg-white/5 rounded-md text-gray-600 hover:text-red-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Calculator Display (Only shown if in calculator mode) */}
          {layout === 'calculator' && (
            <div className="mb-4 w-full bg-[#0D0E12] border border-gray-800 dark:border-white/5 rounded-3xl p-5 flex flex-col items-end shadow-inner ring-1 ring-white/5 h-28 justify-center relative overflow-hidden">
              <style dangerouslySetInnerHTML={{
                __html: `
              #calc-display-input {
                color: #ffffff !important;
              }
              #calc-display-input::placeholder {
                color: rgba(255, 255, 255, 0.3) !important;
              }
            `}} />
              {/* Subtle glow effect inside display */}
              <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/5 to-transparent pointer-events-none"></div>
              <div
                onClick={() => {
                  if (calcHistoryExpr) {
                    setCalcExpr(calcHistoryExpr);
                    setCalcHistoryExpr('');
                    setCalcResult('');
                    play('keypress');
                    setTimeout(() => {
                      if (calcInputRef.current) {
                        calcInputRef.current.focus();
                        const len = calcHistoryExpr.length;
                        calcInputRef.current.setSelectionRange(len, len);
                      }
                    }, 0);
                  }
                }}
                className={`text-emerald-400/80 text-sm font-mono tracking-widest min-h-[20px] font-bold z-10 w-full text-right truncate ${calcHistoryExpr ? 'cursor-pointer hover:text-emerald-300 transition-colors' : ''}`}
                title={calcHistoryExpr ? "Click to edit expression" : undefined}
              >
                {calcHistoryExpr
                  ? `${calcHistoryExpr
                    .replace(/\*/g, ' × ')
                    .replace(/\//g, ' ÷ ')
                    .replace(/\+/g, ' + ')
                    .replace(/-/g, ' − ')} =`
                  : ''}
              </div>
              <input
                ref={calcInputRef}
                id="calc-display-input"
                type="text"
                value={calcResult || calcExpr}
                onChange={handleCalcInputChange}
                onKeyDown={handleCalcInputKeyDown}
                onClick={handleCalcInputClick}
                onFocus={handleCalcInputClick}
                className="text-4xl font-black text-white font-mono w-full text-right bg-transparent outline-none border-none min-h-[40px] z-10 mt-1 tracking-tight caret-emerald-500 selection:bg-primary/30 select-text"
                placeholder="0"
              />
            </div>
          )}

          {/* Keyboard Body */}
          <div className="space-y-2 flex flex-col items-center">
            <div className={`w-full ${layout === 'calculator' ? 'max-w-md mx-auto space-y-2' : 'space-y-1.5'}`}>
              {currentLayout.map((row, rowIndex) => (
                <div key={rowIndex} className={`flex justify-center w-full ${layout === 'calculator' ? 'gap-2' : 'gap-1.5 lg:gap-1.5'}`}>
                  {row.map((key) => {
                    let width = 'flex-1';
                    let bg = 'bg-white dark:bg-white/5';
                    let textColor = 'text-gray-900 dark:text-gray-200';
                    let label: React.ReactNode = key;

                    if (layout === 'calculator') {
                      if (['/', '*', '-', '+'].includes(key)) {
                        bg = 'bg-orange-500 dark:bg-orange-600 text-white hover:bg-orange-400 dark:hover:bg-orange-500';
                        textColor = 'text-white font-black text-2xl';
                        if (key === '/') label = '÷';
                        if (key === '*') label = '×';
                        if (key === '-') label = '−';
                      } else if (key === '=') {
                        bg = 'bg-primary dark:bg-primary text-white hover:bg-emerald-400 dark:hover:bg-primary';
                        textColor = 'text-white font-black text-2xl';
                      } else if (key === 'C') {
                        bg = 'bg-rose-500 dark:bg-rose-600 text-white hover:bg-rose-400 dark:hover:bg-rose-500';
                        textColor = 'text-white font-black text-xl';
                      } else if (key === 'BKSP') {
                        bg = 'bg-gray-200 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-zinc-700';
                        textColor = 'text-gray-700 dark:text-gray-300';
                        label = <Backspace className="w-5 h-5" />;
                      } else if (['(', ')'].includes(key)) {
                        bg = 'bg-gray-200 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-zinc-700';
                        textColor = 'text-gray-700 dark:text-gray-300 font-black text-lg';
                      } else {
                        bg = 'bg-gray-100 dark:bg-[#222222] text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-[#2D2D2D]';
                        textColor = 'text-gray-900 dark:text-white font-bold text-xl';
                      }
                    } else {
                      if (key === 'SPACE') {
                        width = 'flex-[4]';
                        label = <Space className="w-5 h-5" />;
                      } else if (key === 'ENTER') {
                        width = 'flex-[2]';
                        bg = 'bg-primary text-white border-primary border-b-emerald-700';
                        textColor = 'text-white';
                        label = <CornerDownLeft className="w-5 h-5" />;
                      } else if (key === 'BKSP') {
                        width = 'flex-[1.5]';
                        bg = 'bg-gray-100 dark:bg-white/10 border-gray-200 border-b-gray-300 dark:border-white/10 dark:border-b-white/20';
                        label = <Backspace className="w-4 h-4" />;
                      } else if (key === 'ABC' || key === 'abc') {
                        width = 'flex-[1.5]';
                        bg = (layout === 'qwerty' && isCaps)
                          ? 'bg-primary/20 text-primary border-primary/30 border-b-emerald-500/40 shadow-inner'
                          : 'bg-gray-100 dark:bg-white/10 border-gray-200 dark:border-white/10';
                        label = <span className="text-[10px] font-black">ABC</span>;
                      } else if (key === '123') {
                        width = 'flex-[1.5]';
                        bg = layout === 'symbols'
                          ? 'bg-primary/20 text-primary border-primary/30 border-b-emerald-500/40 shadow-inner'
                          : 'bg-gray-100 dark:bg-white/10 border-gray-200 dark:border-white/10';
                        label = <span className="text-[10px] font-black">123</span>;
                      } else if (key === 'CLEAR') {
                        width = 'flex-[1.5]';
                        bg = 'bg-red-500/10 text-red-500 border-red-500/20 border-b-red-500/30';
                      } else if (/^[0-9]$/.test(key)) {
                        bg = 'bg-gray-50 dark:bg-zinc-900 border-gray-200 border-b-gray-200 dark:border-white/5 dark:border-b-white/10';
                        textColor = 'text-gray-600 dark:text-gray-400 font-bold';
                      } else {
                        bg = 'bg-white dark:bg-white/[0.08] border-gray-200 border-b-gray-300 dark:border-white/10 dark:border-b-white/20 shadow-sm';
                        textColor = 'text-gray-900 dark:text-white font-black';
                      }
                    }

                    const buttonClass = layout === 'calculator'
                      ? `${width} ${bg} ${textColor} h-12 lg:h-14 rounded-2xl font-black shadow-sm hover:scale-[1.03] active:scale-95 transition-all duration-100 flex items-center justify-center`
                      : `${width} ${bg} ${textColor} h-11 lg:h-14 rounded-xl lg:rounded-2xl font-black text-base border border-b-[4px] hover:-translate-y-0.5 hover:border-b-[6px] hover:brightness-105 active:translate-y-[2px] active:border-b-[0px] active:border-t-[4px] active:border-t-transparent active:brightness-95 transition-all duration-75 flex items-center justify-center`;

                    return (
                      <button
                        key={key}
                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onPointerDown={() => {
                          if (key === 'BKSP') {
                            hasAutoRepeated.current = false;
                            autoRepeatTimeoutRef.current = setTimeout(() => {
                              hasAutoRepeated.current = true;
                              autoRepeatIntervalRef.current = setInterval(() => {
                                handleKeyClick('BKSP');
                              }, 75);
                            }, 400);
                          }
                        }}
                        onPointerUp={() => { if (key === 'BKSP') clearAutoRepeat(); }}
                        onPointerLeave={() => { if (key === 'BKSP') clearAutoRepeat(); }}
                        onPointerCancel={() => { if (key === 'BKSP') clearAutoRepeat(); }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (key === 'BKSP' && hasAutoRepeated.current) {
                            return;
                          }
                          handleKeyClick(key);
                        }}
                        className={buttonClass}
                      >
                        {isCaps && key.length === 1 && layout === 'qwerty' ? key.toUpperCase() : label}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
