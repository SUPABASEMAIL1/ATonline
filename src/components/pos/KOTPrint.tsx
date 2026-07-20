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
  const isAutoPrint = settings.receiptPrinter;

  useEffect(() => {
    if (isPrintingRef.current) return;
    isPrintingRef.current = true;

    const delay = isAutoPrint ? 1500 : 500;
    const timer = setTimeout(() => {
      handlePrint();
    }, delay);

    return () => clearTimeout(timer);
  }, []);

  const handlePrint = () => {
    console.log('[KOTPrint] handlePrint triggered');
    const kotEl = document.getElementById(`kot-content-${sale.id}`);
    if (!kotEl) return;

    play('success');

    const totalItems = sale.items.reduce((sum, i) => sum + Math.abs(i.quantity), 0);

    const printHTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #fff !important; width: 100%; color: #000; font-family: 'Courier New', Courier, monospace; }
  @page { margin: 0 !important; size: 80mm auto; }
  #print-container {
    width: 72mm !important;
    max-width: 72mm !important;
    margin: 0 auto !important;
    padding: 3mm 4mm !important;
    font-size: 12px;
  }
  .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 6px; margin-bottom: 6px; }
  .store-name { font-size: 16px; font-weight: 900; margin-bottom: 2px; }
  .kot-badge { font-size: 22px; font-weight: 900; letter-spacing: 4px; margin: 4px 0; }
  .meta { margin-bottom: 8px; font-size: 11px; line-height: 1.4; }
  .meta-row { display: flex; justify-content: space-between; }
  .table-header { border-top: 2px dashed #000; border-bottom: 1px solid #000; padding: 4px 0; margin-top: 6px; display: flex; font-size: 10px; font-weight: 900; }
  .table-header-qty { width: 44px; text-align: center; }
  .table-header-item { flex: 1; }
  .table-row { display: flex; padding: 5px 0; border-bottom: 1px dotted #999; }
  .table-row-qty { width: 44px; text-align: center; font-size: 16px; font-weight: 900; padding-top: 2px; }
  .table-row-detail { flex: 1; }
  .table-row-name { font-size: 13px; font-weight: 900; }
  .table-row-meta { font-size: 10px; padding-left: 6px; margin-top: 2px; }
  .table-row-price { font-size: 10px; color: #555; margin-top: 1px; }
  .divider { border-top: 2px dashed #000; margin: 8px 0; }
  .footer { text-align: center; font-size: 11px; margin-top: 8px; padding-top: 6px; border-top: 2px dashed #000; }
  .bordered-note { border: 2px solid #000; padding: 4px; margin-top: 4px; font-size: 11px; text-align: center; }
</style>
</head>
<body>
  <div id="print-container">
    <div class="header">
      <div class="store-name">${settings.storeName || 'STORE'}</div>
      <div class="kot-badge">KOT</div>
      <div>#${sale.invoiceNumber}</div>
      <div>${formatAppDateTime(sale.timestamp, settings.country)}</div>
    </div>

    <div class="meta">
      <div class="meta-row">
        <span>TYPE: <strong>${(sale.saleType || 'RETAIL').toUpperCase()}</strong></span>
        <span>CASHIER: <strong>${sale.cashier?.split(' ')[0] || 'SYS'}</strong></span>
      </div>
      ${sale.customerName ? `<div class="meta-row"><span>CUSTOMER: <strong>${sale.customerName}</strong></span></div>` : ''}
      ${sale.customerPhone ? `<div class="meta-row"><span>PHONE: ${sale.customerPhone}</span></div>` : ''}
      <div class="meta-row"><span>ITEMS: <strong>${totalItems}</strong></span></div>
    </div>

    ${sale.notes ? `<div class="bordered-note">📝 NOTE: ${sale.notes}</div><div class="divider"></div>` : '<div class="divider"></div>'}

    <div class="table-header">
      <span class="table-header-qty">QTY</span>
      <span class="table-header-item">ITEM</span>
    </div>

    ${sale.items.map((item, idx) => {
      const itemTotal = Math.abs(item.quantity) * (item.discountedPrice ?? item.price ?? 0);
      const isFirstOfBundle = (item.bundleId || item.bundle_id) && item === sale.items.find((i: any) => (i.bundleId || i.bundle_id) === (item.bundleId || item.bundle_id));
      
      let bundleHeader = '';
      if (isFirstOfBundle) {
        bundleHeader = `
        <div class="table-row" style="padding-bottom: 2px; border-bottom: none;">
          <div class="table-row-detail">
            <div class="table-row-name" style="font-size: 14px;">🎁 ${item.bundleName || item.bundle_name || 'DEAL'}</div>
            ${item.toppings?.length ? `<div class="table-row-meta" style="font-size: 12px; margin-bottom: 4px;">+ ${item.toppings.map((t: any) => `${Math.abs(item.quantity) > 1 ? Math.abs(item.quantity) + 'x ' : ''}${t.name}`).join(', ')}</div>` : ''}
          </div>
        </div>`;
      }

      return `
    ${bundleHeader}
    <div class="table-row" ${isFirstOfBundle ? 'style="border-top: none; padding-top: 0;"' : ''}>
      <div class="table-row-qty">${Math.abs(item.quantity)}x</div>
      <div class="table-row-detail">
        <div class="table-row-name">${idx + 1}. ${item.product.name}</div>
        ${item.selectedVariant ? `<div class="table-row-meta">- ${item.selectedVariant}</div>` : ''}
        ${item.selectedModifiers?.length ? `<div class="table-row-meta">+ ${item.selectedModifiers.map((m: any) => `${Math.abs(item.quantity) > 1 ? Math.abs(item.quantity) + 'x ' : ''}${m.name}`).join(', ')}</div>` : ''}
        ${item.addonItems?.length ? `<div class="table-row-meta">+ Add-ons: ${item.addonItems.map((a: any) => `${a.addon?.name || a.name} ${a.quantity * Math.abs(item.quantity)}x`).join(', ')}</div>` : ''}
        ${!isFirstOfBundle && item.toppings?.length ? `<div class="table-row-meta">+ ${item.toppings.map((t: any) => `${Math.abs(item.quantity) > 1 ? Math.abs(item.quantity) + 'x ' : ''}${t.name}`).join(', ')}</div>` : ''}
        ${item.displayToppings?.length ? `<div class="table-row-meta">+ ${item.displayToppings.map((t: any) => `${Math.abs(item.quantity) > 1 ? Math.abs(item.quantity) + 'x ' : ''}${t.name}`).join(', ')}</div>` : ''}
      </div>
    </div>`;
    }).join('')}

    <div class="footer">
      *** END OF KOT ***
    </div>
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
      {/* Hidden content — print uses HTML string directly */}
    </div>
  );
}
