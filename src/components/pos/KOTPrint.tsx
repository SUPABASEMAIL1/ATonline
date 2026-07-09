import React, { useEffect, useRef } from 'react';
import { Sale } from '../../types';
import { useApp } from '../../context/SupabaseAppContext';
import { formatAppDateTime } from '../../lib/dateUtils';
import { useSoundFeedback } from '../../hooks/useSoundFeedback';

interface KOTPrintProps {
  sale: Sale;
}

export function KOTPrint({ sale }: KOTPrintProps) {
  const { state } = useApp();
  const settings = state.settings;
  const { play } = useSoundFeedback();

  const isPrintingRef = useRef(false);

  useEffect(() => {
    if (isPrintingRef.current) return;
    isPrintingRef.current = true;

    // Small delay to let ReceiptPrint trigger first if needed
    const timer = setTimeout(() => {
      handlePrint();
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  const handlePrint = () => {
    console.log('[KOTPrint] handlePrint triggered');
    const kotEl = document.getElementById(`kot-content-${sale.id}`);
    if (!kotEl) return;

    play('success');

    const printHTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #fff !important; width: 100%; color: #000; font-family: monospace; }
  @page { margin: 0 !important; size: 80mm auto; }
  #print-container {
    width: 72mm !important;
    max-width: 72mm !important;
    margin: 0 auto !important;
    padding: 4mm !important;
    font-size: 14px;
    font-weight: bold;
    text-transform: uppercase;
  }
  .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
  .meta { margin-bottom: 12px; font-size: 12px; }
  .item { margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px dotted #999; }
  .item-name { font-size: 16px; font-weight: 900; }
  .modifiers { padding-left: 12px; font-size: 12px; margin-top: 4px; }
</style>
</head>
<body>
  <div id="print-container">
    ${kotEl.innerHTML}
  </div>
</body>
</html>`;

    // @ts-ignore
    if (window.electronAPI && window.electronAPI.isElectron) {
      // @ts-ignore
      window.electronAPI.printHtml(printHTML);
    } else {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed; right:0; bottom:0; width:0; height:0; border:none; visibility:hidden; z-index:-1;';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(printHTML);
        doc.close();

        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (e) {
            console.error('KOT print failed:', e);
          }
          setTimeout(() => {
            if (document.body.contains(iframe)) document.body.removeChild(iframe);
          }, 2000);
        }, 500);
      }
    }
  };

  return (
    <div id={`kot-content-${sale.id}`} style={{ display: 'none' }}>
      <div className="header">
        <div style={{ fontSize: '24px', fontWeight: 900, marginBottom: '4px' }}>KOT</div>
        <div>ORDER: {sale.invoiceNumber}</div>
        <div>{formatAppDateTime(sale.timestamp, settings.country)}</div>
      </div>
      
      <div className="meta">
        <div>TYPE: {sale.saleType || 'RETAIL'}</div>
        <div>CASHIER: {sale.cashier?.split(' ')[0] || 'SYS'}</div>
        {sale.notes && <div style={{ border: '2px solid #000', padding: '4px', marginTop: '4px' }}>NOTE: {sale.notes}</div>}
      </div>

      <div style={{ borderTop: '2px dashed #000', margin: '8px 0' }} />

      <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ borderBottom: '2px solid #000', paddingBottom: '4px' }}>QTY</th>
            <th style={{ borderBottom: '2px solid #000', paddingBottom: '4px' }}>ITEM</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item, idx) => (
            <tr key={idx}>
              <td style={{ verticalAlign: 'top', paddingTop: '8px', fontSize: '18px', fontWeight: 900 }}>
                {Math.abs(item.quantity)}x
              </td>
              <td style={{ verticalAlign: 'top', paddingTop: '8px' }}>
                <div className="item-name">{item.product.name}</div>
                {item.selectedVariant && (
                  <div className="modifiers">- {item.selectedVariant}</div>
                )}
                {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                  <div className="modifiers">
                    + {item.selectedModifiers.map(m => m.name).join(', ')}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ borderTop: '2px dashed #000', marginTop: '16px', paddingTop: '8px', textAlign: 'center', fontSize: '12px' }}>
        *** END OF KOT ***
      </div>
    </div>
  );
}
