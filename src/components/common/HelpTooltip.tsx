import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

interface HelpTooltipProps {
  content: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  tooltipClassName?: string;
  position?: 'top' | 'bottom';
}

export function HelpTooltip({ content, icon, className, tooltipClassName, position = 'top' }: HelpTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [arrowStyle, setArrowStyle] = useState<React.CSSProperties>({});
  const [activePosition, setActivePosition] = useState<'top' | 'bottom'>(position);

  // Close tooltip on scroll or click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleScrollOrClick = () => {
      setIsOpen(false);
    };

    window.addEventListener('scroll', handleScrollOrClick, { capture: true });
    window.addEventListener('click', handleScrollOrClick, { capture: true });
    window.addEventListener('resize', handleScrollOrClick);

    return () => {
      window.removeEventListener('scroll', handleScrollOrClick, { capture: true });
      window.removeEventListener('click', handleScrollOrClick, { capture: true });
      window.removeEventListener('resize', handleScrollOrClick);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const measureAndPosition = () => {
        if (!triggerRef.current) return;
        const triggerRect = triggerRef.current.getBoundingClientRect();
        const tooltipEl = tooltipRef.current;
        
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // w-64 defaults to 256px
        const tooltipWidth = tooltipEl ? tooltipEl.offsetWidth : 256;
        const tooltipHeight = tooltipEl ? tooltipEl.offsetHeight : 80;
        const margin = 6;
        
        // 1. Determine Vertical Position (Flip if overflows top/bottom)
        let newPosition = position;
        if (position === 'top' && triggerRect.top - tooltipHeight - margin < 8) {
          newPosition = 'bottom';
        } else if (position === 'bottom' && triggerRect.bottom + tooltipHeight + margin > viewportHeight - 8) {
          newPosition = 'top';
        }
        setActivePosition(newPosition);
        
        // 2. Determine Horizontal Position
        const triggerCenter = triggerRect.left + triggerRect.width / 2;
        let left = triggerCenter - tooltipWidth / 2;
        
        const screenMargin = 12;
        if (left < screenMargin) {
          left = screenMargin;
        } else if (left + tooltipWidth > viewportWidth - screenMargin) {
          left = viewportWidth - screenMargin - tooltipWidth;
        }
        
        // 3. Set Fixed coordinates relative to screen viewport
        let top = 0;
        if (newPosition === 'top') {
          top = triggerRect.top - tooltipHeight - margin;
        } else {
          top = triggerRect.bottom + margin;
        }
        
        setTooltipStyle({
          position: 'fixed',
          top: `${top}px`,
          left: `${left}px`,
          width: `${tooltipWidth}px`,
        });
        
        // 4. Align arrow pointer with the trigger icon center
        const arrowLeft = triggerCenter - left;
        setArrowStyle({
          left: `${arrowLeft}px`,
        });
      };
      
      measureAndPosition();
      const frameId = requestAnimationFrame(measureAndPosition);
      return () => cancelAnimationFrame(frameId);
    }
  }, [isOpen, position, content]);

  return (
    <>
      <button 
        ref={triggerRef}
        type="button" 
        className={cn("text-gray-400 hover:text-primary active:scale-95 transition-colors p-0.5 rounded-full focus:outline-none ml-1.5", className)}
        aria-label="More information"
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
      >
        {icon || <HelpCircle className="w-3.5 h-3.5" />}
      </button>

      {isOpen && createPortal(
        <div 
          ref={tooltipRef}
          className={cn(
            "fixed z-[9999] w-64 p-3 bg-gray-950 dark:bg-zinc-900 text-white text-[11px] leading-relaxed font-bold rounded-2xl shadow-2xl border border-white/15 animate-in fade-in zoom-in-95 duration-200 pointer-events-none text-left tracking-normal normal-case",
            tooltipClassName
          )}
          style={tooltipStyle}
        >
          {activePosition === 'top' ? (
            <div 
              className="absolute top-full -mt-1 border-4 border-transparent border-t-gray-950 dark:border-t-zinc-900 -translate-x-1/2"
              style={arrowStyle}
            />
          ) : (
            <div 
              className="absolute bottom-full -mb-1 border-4 border-transparent border-b-gray-950 dark:border-b-zinc-900 -translate-x-1/2"
              style={arrowStyle}
            />
          )}
          {content}
        </div>,
        document.body
      )}
    </>
  );
}
