import React, { useEffect, useRef } from 'react';
import { renderBarcodeSVG, BarcodeOptions } from '../../utils/barcode';

interface BarcodePreviewProps {
  value: string;
  options?: BarcodeOptions;
  className?: string;
  inline?: boolean;
  height?: number;
  showValue?: boolean;
}

export const BarcodePreview = React.memo(
  ({
    value,
    options,
    className,
    inline = false,
    height,
    showValue
  }: BarcodePreviewProps) => {
    const svgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
      if (value && svgRef.current) {
        renderBarcodeSVG(value, svgRef.current, {
          height: height !== undefined ? height : (inline ? 12 : 28),
          width: inline ? 0.75 : 0.9,
          fontSize: 0,
          displayValue: false,
          margin: 2,
          ...options
        });
      }
    }, [value, inline, options, height, showValue]);

    if (!value) {
      return inline ? (
        <span className="text-[11px] font-medium text-gray-600 dark:text-gray-500">No Barcode</span>
      ) : null;
    }
    const containerStyle: React.CSSProperties = inline
      ? {
          display: 'inline-flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          height: '44px',
          backgroundColor: '#ffffff',
          padding: '2px 8px',
          borderRadius: '8px',
          border: '1px solid #f3f4f6',
          verticalAlign: 'middle',
        }
      : {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: '8px',
          padding: '12px',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          width: '100%',
          maxWidth: '240px',
          margin: '8px auto',
        };

    const svgStyle: React.CSSProperties = {
      display: 'block',
      margin: '0 auto',
      maxWidth: '100%',
      height: height !== undefined ? `${height}px` : (inline ? '16px' : '32px'),
    };

    const textStyle: React.CSSProperties = {
      display: 'block',
      margin: inline ? '2px auto 0 auto' : '6px auto 0 auto',
      textAlign: 'center',
      fontFamily: 'monospace',
      fontWeight: '900',
      color: '#000000',
      fontSize: inline ? '9px' : '11px',
      letterSpacing: '0.05em',
      wordBreak: 'break-all',
      whiteSpace: 'nowrap',
    };

    return (
      <div
        className={
          inline
            ? `flex flex-col items-center justify-center overflow-hidden h-[44px] bg-white px-2 py-0.5 rounded-lg border border-gray-100 ${className || ''}`
            : `mt-2 p-3 bg-white rounded-2xl border border-gray-100 flex flex-col items-center justify-center shadow-sm ${className || ''}`
        }
        style={containerStyle}
      >
        <svg
          ref={svgRef}
          className={`${height !== undefined ? '' : (inline ? 'h-[16px]' : 'h-[32px]')} w-auto text-black`}
          style={svgStyle}
        />
        {value && (
          <span
            className={inline ? "text-[9px] font-mono font-black mt-0.5 text-black leading-none select-all tracking-wider" : "text-[11px] font-mono font-black mt-1.5 text-black select-all tracking-wider"}
            style={textStyle}
          >
            {value}
          </span>
        )}
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.value === nextProps.value &&
      prevProps.inline === nextProps.inline &&
      prevProps.height === nextProps.height &&
      prevProps.showValue === nextProps.showValue &&
      prevProps.className === nextProps.className &&
      JSON.stringify(prevProps.options) === JSON.stringify(nextProps.options)
    );
  }
);

