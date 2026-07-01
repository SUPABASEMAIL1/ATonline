import { Sale } from '../../types';
import { useApp } from '../../context/SupabaseAppContext';
import { useAuth } from '../../context/AuthContext';
import { MessageCircle, Printer, X, ShieldAlert, Check, Share2 } from 'lucide-react';
import { formatCurrency } from '../../lib/currencies';
import { getCountryByCode } from '../../lib/countries';
import { formatAppDate, formatAppDateTime } from '../../lib/dateUtils';
import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { BarcodePreview } from '../common/BarcodePreview';
import { Modal } from '../common/Modal';
import { useTouchKeyboard } from '@/providers/TouchKeyboardProvider';
import { useSoundFeedback } from '../../hooks/useSoundFeedback';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { sonner } from '../../lib/sonner';

interface ReceiptPrintProps {
  sale: Sale;
  onClose: () => void;
}

export function ReceiptPrint({ sale, onClose }: ReceiptPrintProps) {
  const { state } = useApp();
  const { profile } = useAuth();
  const settings = state.settings;
  const { play } = useSoundFeedback();

  const showDiscount = settings.receiptShowDiscount !== false && 
    !(sale.items || []).some((item: any) => item.bundleHideItemPrices === true || item.bundle_hide_item_prices === true);

  const isAutoPrint = settings.receiptPrinter;

  // ── Paper & sizing ──
  const is58mm = settings.receiptPaperSize === '58mm';
  const isA4 = settings.receiptPaperSize === 'A4';
  const paperWidthPx = is58mm ? '219px' : isA4 ? '794px' : '302px';
  const pageSizeCSS = is58mm ? '58mm auto' : isA4 ? 'A4' : '80mm auto';

  // ── Font scaling ──
  const scale = settings.receiptFontScale || 1;
  const sz = (base: number) => Math.round(base * scale);

  // ── Font weight (default per paper size) ──
  const rawWeight = Number(settings.receiptFontWeight);
  const baseWeight = settings.receiptFontBold
    ? 700
    : ((!isNaN(rawWeight) && rawWeight > 0) ? rawWeight : (is58mm ? 400 : isA4 ? 600 : 500));
  const clamp = (w: number) => {
    const val = Number(w);
    if (isNaN(val)) return 400;
    return Math.max(100, Math.min(700, val));
  };

  // ── Font sizes per paper ──
  const fs = {
    shopName: sz(is58mm ? 14 : isA4 ? 24 : 18),
    body: sz(is58mm ? 9 : isA4 ? 13 : 11),
    total: sz(is58mm ? 13 : isA4 ? 20 : 16),
    footer: sz(is58mm ? 8 : isA4 ? 12 : 10),
    meta: sz(is58mm ? 9 : isA4 ? 12 : 10),
  };

  // ── Template config ──
  const template = settings.receiptTemplate || 'modern';

  const fontFamily = (() => {
    switch (template) {
      case 'classic': return "'Courier New', Courier, monospace";
      case 'professional': return "'Georgia', 'Times New Roman', serif";
      default: return "'Helvetica', 'Arial', sans-serif";
    }
  })();

  const headerBorder = (() => {
    switch (template) {
      case 'classic': return '1px dashed black';
      case 'professional': return '3px double black';
      case 'minimal': return 'none';
      case 'bold': case 'compact': return '2px solid black';
      default: return '1px solid black';
    }
  })();

  const totalBorder = (() => {
    switch (template) {
      case 'classic': return '1px dashed black';
      case 'professional': return '3px double black';
      case 'minimal': return 'none';
      case 'bold': case 'compact': return '3px solid black';
      default: return '1px solid black';
    }
  })();

  const tracking = (() => {
    switch (template) {
      case 'classic': return '3px';
      case 'professional': return '2px';
      case 'minimal': return '1px';
      case 'bold': case 'compact': return '0px';
      default: return '2px';
    }
  })();

  // ── Print position calibration from settings ──
  const padTop = typeof settings.receiptPaddingTop === 'number' ? settings.receiptPaddingTop : (isA4 ? 15 : 2);
  const padBottom = typeof settings.receiptPaddingBottom === 'number' ? settings.receiptPaddingBottom : (isA4 ? 15 : 10);
  const padLeft = typeof settings.receiptPaddingLeft === 'number' ? settings.receiptPaddingLeft : (isA4 ? 24 : 2);
  const padRight = typeof settings.receiptPaddingRight === 'number' ? settings.receiptPaddingRight : (isA4 ? 24 : 2);
  const offsetX = settings.receiptOffsetX || 0;
  const currencyCode = settings.currency || 'PKR';

  // ── Helpers ──
  const currentCountry = getCountryByCode(settings.country || 'PK');
  const taxLabel = currentCountry?.taxLabel || 'Tax';

  // ── Print handler ──
  const isPrintingRef = useRef(false);
  const handlePrint = async () => {
    console.log('[ReceiptPrint] handlePrint triggered');
    if (isPrintingRef.current) {
      console.log('[ReceiptPrint] Already printing, skipping');
      return;
    }
    isPrintingRef.current = true;

    // Reset printing state after a delay
    setTimeout(() => {
      isPrintingRef.current = false;
    }, 3000);

    play('receipt');
    // Ensure the element is rendered and captured correctly
    const receiptEl = document.getElementById('receipt-content');
    if (!receiptEl) {
      console.warn('[ReceiptPrint] Element not found, retrying in 500ms...');
      setTimeout(handlePrint, 500);
      return;
    }

    // We use a safe width for thermal printers (printable area is usually ~72mm for 80mm rolls)
    const thermalWidth = is58mm ? '48mm' : '72mm';
    const finalWidth = isA4 ? '100%' : thermalWidth;

    // Create a version of the receipt that only includes the necessary hardware-aligned bits
    const printHTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #fff !important; width: 100%; }
  @page { margin: 0 !important; size: ${pageSizeCSS}; }
  #print-container {
    width: ${finalWidth} !important;
    max-width: ${finalWidth} !important;
    margin: 0 !important;
    padding: 0 !important;
    position: relative !important;
    /* Manual calibration offsets from your settings */
    left: ${settings.receiptOffsetX || 0}mm !important;
    background: #fff !important;
    color: #000 !important;
    display: block !important;
    word-wrap: break-word;
    font-family: ${fontFamily};
  }
  .header-segment { 
    text-align: center !important; 
    position: relative !important; 
    left: ${settings.receiptHeaderOffsetX || 0}mm !important; 
    width: 100% !important;
    display: block !important;
  }
  .footer-segment { 
    text-align: center !important; 
    position: relative !important; 
    left: ${settings.receiptFooterOffsetX || 0}mm !important; 
    width: 100% !important;
    display: block !important;
  }
  .body-segment {
    width: 100% !important;
    display: block !important;
  }
  /* Remove visual noise for thermal */
  * { background: transparent !important; color: #000 !important; box-shadow: none !important; }
</style>
</head>
<body>
  <div id="print-container">
    ${receiptEl.innerHTML}
  </div>
</body>
</html>`;

    // @ts-ignore
    if (window.electronAPI && window.electronAPI.isElectron) {
      console.log('[ReceiptPrint] Using Electron print');
      try {
        // @ts-ignore
        await window.electronAPI.printHtml(printHTML);
      } catch (error) {
        console.error('Electron print failed:', error);
      }
    } else {
      console.log('[ReceiptPrint] Using browser iframe print');
      // Create hidden iframe
      const iframe = document.createElement('iframe');
      iframe.style.cssText = `
        position: fixed;
        right: 0;
        bottom: 0;
        width: 0;
        height: 0;
        border: none;
        visibility: hidden;
        z-index: -1;
      `;
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(printHTML);
        doc.close();

        // Wait for resources (images, fonts) to load if any
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            console.log('[ReceiptPrint] Browser print triggered');
          } catch (e) {
            console.error('iframe print failed:', e);
          }

          // Cleanup
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 2000);
        }, 500);
      } else {
        console.error('[ReceiptPrint] Could not access iframe document');
      }
    }
  };

  // ── Auto-print ──
  const autoPrintStartedRef = useRef(false);

  useEffect(() => {
    // Prevent background scroll when modal is open
    document.body.classList.add('modal-open');
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, []);

  useEffect(() => {
    if (isAutoPrint && !autoPrintStartedRef.current) {
      autoPrintStartedRef.current = true;
      console.log('[ReceiptPrint] Auto-print initialized');
      // Delay to ensure DOM is ready and animations finish
      const timer = setTimeout(() => {
        handlePrint().then(() => {
          // Success or attempt finished, close after a reasonable buffer
          setTimeout(() => {
            console.log('[ReceiptPrint] Auto-closing after print attempt');
            onClose();
          }, 3000); // Increased to 3s for slower print dialogs
        }).catch(err => {
          console.error('[ReceiptPrint] Print failed:', err);
          // Don't close automatically on error so user can see what happened
        });
      }, 1500); // 1.5s initial delay
      return () => clearTimeout(timer);
    }
  }, [isAutoPrint]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard Shortcuts ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent manual shortcuts from interfering if an auto-print is starting up
      if (isAutoPrint && autoPrintStartedRef.current) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        const printBtn = document.getElementById('receipt-print-btn');
        if (printBtn) printBtn.click();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        const shareBtn = document.getElementById('receipt-share-btn');
        if (shareBtn) shareBtn.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        const closeBtn = document.getElementById('receipt-close-btn');
        if (closeBtn) closeBtn.click();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAutoPrint]);

  // ── WhatsApp ──
  const handleWhatsAppRedirect = () => {
    if (!sale.customerPhone) return;
    const cleanPhone = sale.customerPhone.replace(/\D/g, '');
    const itemsList = sale.items
      .map(item => `- ${item.product.name} (x${item.quantity}): ${formatCurrency(item.product.price, currencyCode)}`)
      .join('\n');

    let message = `*${settings.storeName} - Digital Receipt*\n\n` +
      `Hello ${sale.customerName || 'Customer'},\n` +
      `Thank you for your purchase! Here is your invoice details:\n\n` +
      `*Invoice:* ${sale.invoiceNumber}\n` +
      `*Date:* ${formatAppDate(sale.timestamp, settings.country)}\n\n` +
      `*Items:*\n${itemsList}\n\n`;

    if (showDiscount) {
      message += `*Subtotal: ${formatCurrency(sale.subtotal, currencyCode)}*\n`;
      if (sale.discountAmount > 0) {
        message += `*Discount: -${formatCurrency(sale.discountAmount, currencyCode)}*\n`;
      }
    }
    if (sale.taxAmount > 0) {
      message += `*Tax: ${formatCurrency(sale.taxAmount, currencyCode)}*\n`;
    }

    message += `\n*Total: ${formatCurrency(sale.total, currencyCode)}*\n\n` +
      `_Software by Zaynah Developers_`;
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  // ── Share PDF ──
  const [isSharing, setIsSharing] = useState(false);

  const handleShareReceipt = async () => {
    const receiptEl = document.getElementById('receipt-content');
    if (!receiptEl || isSharing) return;

    setIsSharing(true);
    try {
      // Temporarily cleanup for capture
      const originalStyle = receiptEl.style.cssText;
      receiptEl.style.boxShadow = 'none';
      receiptEl.style.height = 'auto';
      receiptEl.style.overflow = 'visible';

      const canvas = await html2canvas(receiptEl, {
        scale: 2, // Balanced quality/size
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        width: receiptEl.offsetWidth,
        height: receiptEl.scrollHeight,
        windowHeight: receiptEl.scrollHeight,
        y: 0,
        scrollX: 0,
        scrollY: 0
      });

      receiptEl.style.cssText = originalStyle;

      canvas.toBlob(async (blob) => {
        setIsSharing(false);
        if (!blob) {
          sonner.error('Could not generate receipt image');
          return;
        }

        const fileName = `Receipt_${sale.invoiceNumber}.jpg`;
        const file = new File([blob], fileName, { type: 'image/jpeg' });

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              title: `Receipt ${sale.invoiceNumber}`,
              files: [file],
            });
          } catch (shareErr: any) {
            if (shareErr.name !== 'AbortError') {
              console.error('Share failed:', shareErr);
              // Fallback to download if share is blocked by OS
              triggerDownload(blob, fileName);
            }
          }
        } else {
          triggerDownload(blob, fileName);
        }
      }, 'image/jpeg', 0.8); // Smaller file size
    } catch (err) {
      setIsSharing(false);
      console.error('Capture failed:', err);
      sonner.error('Receipt capture failed');
    }
  };

  const triggerDownload = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    sonner.success('Receipt saved to downloads');
  };

  // ═══════════════════════════════════════════════════
  //  RECEIPT BODY — FULLY CENTERED MONOSPACE LAYOUT
  // ═══════════════════════════════════════════════════
  const renderReceiptBody = () => {
    // Dynamic border stylings based on template instead of raw strings
    const dividerStyle = {
      borderTop: headerBorder,
      width: '100%',
      margin: '6px 0',
    };

    const subDividerStyle = {
      borderTop: template === 'classic' ? '1px dashed black' : '1px solid black',
      width: '100%',
      margin: '4px 0',
    };

    // Helper component for perfectly aligned two-column rows that NEVER break in generic printer drivers
    const TwoCol = ({ left, right, bold = false, lg = false, style = {} }: any) => (
      <table style={{ width: '100%', borderCollapse: 'collapse', fontWeight: bold ? clamp(baseWeight + 200) : baseWeight, fontSize: lg ? `${fs.total}px` : 'inherit', margin: '2px 0', ...style }} cellPadding={0} cellSpacing={0}>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left', textTransform: 'uppercase', padding: 0, verticalAlign: 'top' }}>{left}</td>
            <td style={{ textAlign: 'right', textTransform: 'uppercase', padding: 0, verticalAlign: 'top' }}>{right}</td>
          </tr>
        </tbody>
      </table>
    );

    return (
      <div
        id="receipt-content"
        style={{
          width: paperWidthPx,
          maxWidth: paperWidthPx,
          margin: '0 auto',
          position: 'relative',
          paddingTop: `${Math.max(0, padTop)}mm`,
          paddingBottom: `${Math.max(0, padBottom)}mm`,
          paddingLeft: `${Math.max(0, padLeft)}mm`,
          paddingRight: `${Math.max(0, padRight)}mm`,
          // Global Offset X Shift (moves everything)
          left: `${settings.receiptOffsetX || 0}mm`,
          marginTop: padTop < 0 ? `${padTop}mm` : '0',
          marginBottom: padBottom < 0 ? `${padBottom}mm` : '0',
          fontFamily: fontFamily,
          fontSize: `${fs.body}px`,
          fontWeight: baseWeight,
          color: '#000',
          background: '#fff',
          lineHeight: '1.4',
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
        }}
      >
        {/* Refund Watermark / Header */}
        {sale.status === 'refunded' && (
          <div style={{
            border: '2px solid black',
            padding: '8px',
            textAlign: 'center',
            margin: '10px 0',
            fontWeight: clamp(baseWeight + 300),
            fontSize: `${fs.shopName}px`,
            textTransform: 'uppercase'
          }}>
            *** REFUNDED ***
          </div>
        )}

        {template !== 'minimal' && <div style={dividerStyle} />}

        {/* Header Section (Independent Center) */}
        <div style={{
          textAlign: 'center',
          margin: '8px 0',
          position: 'relative',
          left: `${settings.receiptHeaderOffsetX || 0}mm`,
          width: '100%',
          display: 'block'
        }}>
          {(settings.receiptShowLogo && settings.storeLogo) ? (
            <img src={settings.storeLogo} alt="" style={{ display: 'block', margin: '0 auto', maxHeight: '80px', maxWidth: '80%', objectFit: 'contain' }} />
          ) : (
            <div style={{ margin: '0 auto', marginBottom: '8px', width: '100%', textAlign: 'center' }}>
              <QRCodeSVG value={sale.invoiceNumber} size={80} level="M" aria-hidden="true" style={{ margin: '0 auto' }} />
            </div>
          )}
          {settings.receiptShowStoreName && (
            <div style={{ fontWeight: clamp(baseWeight + 300), fontSize: `${fs.shopName}px`, marginTop: '8px', textTransform: 'uppercase' }}>
              {settings.storeName}
            </div>
          )}
          {settings.receiptShowStoreAddress && (
            <div style={{ marginTop: '4px' }}>{settings.storeAddress}</div>
          )}
          <div style={{ marginTop: '2px' }}>
            {settings.receiptShowStorePhone && <span>T: {settings.storePhone}</span>}
            {settings.receiptShowStoreEmail && <span style={{ marginLeft: '6px' }}>E: {settings.storeEmail}</span>}
          </div>
          {settings.receiptHeader && (
            <div style={{ marginTop: '4px', whiteSpace: 'pre-wrap', fontWeight: clamp(baseWeight + 100) }}>
              {settings.receiptHeader}
            </div>
          )}
        </div>

        {/* Padded Body Section (Respects Pad Left/Right) */}
        <div style={{
          paddingLeft: `${Math.max(0, padLeft)}mm`,
          paddingRight: `${Math.max(0, padRight)}mm`,
          position: 'relative',
          // Combine negative padding into position for overflow prevention
          left: `${(padLeft < 0 ? padLeft : 0) - (padRight < 0 ? padRight : 0)}mm`,
        }}>
          {template !== 'minimal' && <div style={dividerStyle} />}

          {/* Meta Section */}
          <TwoCol
            left={`INV#: ${(sale.invoiceNumber || sale.receiptNumber || sale.id.slice(-6).toUpperCase()).replace(settings.invoicePrefix || 'INV', '')}`}
            right={`DATE: ${formatAppDate(sale.timestamp, settings.country).replace(/,/g, '')}`}
          />
          <TwoCol
            left={`TIME: ${new Date(sale.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
            right={`OP: ${sale.cashier?.split(' ')[0] || profile?.name?.split(' ')[0] || 'SYS'}`}
          />

          {sale.dcNumber && (
            <TwoCol left={`DC#: ${sale.dcNumber}`} right="" />
          )}

          {settings.receiptShowCustomerName && sale.customerName && (
            <TwoCol
              left={`CUST: ${sale.customerName}`}
              right={settings.receiptShowCustomerPhone && sale.customerPhone ? `PH: ${sale.customerPhone}` : ""}
            />
          )}

          {template !== 'minimal' && <div style={subDividerStyle} />}

          {/* Table Header */}
          <TwoCol left="ITEM" right="TOTAL" bold />

          {template !== 'minimal' && <div style={subDividerStyle} />}

          {/* Items List — Grouped by Bundle Deals */}
          <div style={{ marginTop: '4px', marginBottom: '4px' }}>
            {(() => {
              const groupItems = (items: any[]) => {
                const bundlesMap = new Map<string, any>();
                const standaloneItems: any[] = [];
                items.forEach(item => {
                  const bundleId = item.bundleId || item.bundle_id;
                  const bundleName = item.bundleName || item.bundle_name;
                  if (bundleId) {
                    if (!bundlesMap.has(bundleId)) {
                      bundlesMap.set(bundleId, {
                        bundleId,
                        bundleName,
                        items: [],
                        totalOriginal: 0,
                        totalDiscount: 0,
                        totalSubtotal: 0
                      });
                    }
                    const b = bundlesMap.get(bundleId)!;
                    b.items.push(item);
                    const itemPrice = item.product?.price || ((item.subtotal + item.discount) / (item.quantity || 1));
                    const original = itemPrice * item.quantity;
                    b.totalOriginal += original;
                    b.totalDiscount += (item.discount || 0);
                    b.totalSubtotal += (item.subtotal || 0);
                  } else {
                    standaloneItems.push(item);
                  }
                });
                return {
                  bundles: Array.from(bundlesMap.values()),
                  standaloneItems
                };
              };

              const { bundles, standaloneItems } = groupItems(sale.items);

              const renderedBundlesElements = bundles.map((b, bIdx) => {
                // Check if any item in this bundle has hideItemPrices flag
                const hideItemPrices = b.items.some((item: any) => item.bundleHideItemPrices === true);

                return (
                <div key={`bundle-${b.bundleId}`} style={{
                  marginBottom: '10px',
                  border: '1px dashed rgba(0,0,0,0.15)',
                  borderRadius: '6px',
                  padding: '6px',
                  backgroundColor: 'rgba(0,0,0,0.01)'
                }}>
                  {/* Bundle Header */}
                  <div style={{
                    fontSize: `${Math.max(7, fs.body - 2)}px`,
                    fontWeight: clamp(baseWeight + 300),
                    opacity: 0.9,
                    marginBottom: '4px',
                    textTransform: 'uppercase'
                  }}>
                    🎁 BUNDLE: {b.bundleName}
                  </div>

                  {/* Bundle Items (Tree-like) */}
                  <div style={{ paddingLeft: '8px', borderLeft: '1px dotted rgba(0,0,0,0.2)' }}>
                    {b.items.map((item: any, iIdx: number) => {
                      const isLast = iIdx === b.items.length - 1;
                      const prefix = isLast ? '└── ' : '├── ';
                      return (
                        <div key={`bi-${iIdx}`} style={{ marginBottom: '4px', textTransform: 'uppercase', fontSize: `${Math.max(8, fs.body - 1)}px` }}>
                          <div style={{ textAlign: 'left', wordWrap: 'break-word' }}>
                            {prefix}{item.product?.name || 'Item'}
                          </div>
                          {item.selectedVariant && (
                            <div style={{ textAlign: 'left', fontSize: `${Math.max(8, fs.body - 2)}px`, opacity: 0.8, paddingLeft: '20px' }}>{item.selectedVariant}</div>
                          )}
                          {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                            <div style={{ textAlign: 'left', fontSize: `${Math.max(8, fs.body - 2)}px`, opacity: 0.8, paddingLeft: '20px' }}>+ {item.selectedModifiers.map((m: any) => m.name).join(', ')}</div>
                          )}
                          {item.serialNumber && (
                            <div style={{ textAlign: 'left', fontSize: `${Math.max(8, fs.body - 2)}px`, opacity: 0.8, paddingLeft: '20px' }}>SN: {item.serialNumber}</div>
                          )}
                          {!hideItemPrices && (
                            <TwoCol
                              left={`   ${item.quantity} PCS x ${formatCurrency(item.subtotal / item.quantity, currencyCode)}`}
                              right={formatCurrency(item.subtotal, currencyCode)}
                              style={{ opacity: 0.8, fontSize: `${Math.max(8, fs.body - 2)}px` }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Bundle Financial Summary */}
                  <div style={{ marginTop: '6px', paddingTop: '4px', borderTop: '1px dashed rgba(0,0,0,0.1)' }}>
                    {showDiscount ? (
                      <>
                        <TwoCol
                          left="   DEAL SUBTOTAL"
                          right={formatCurrency(b.totalOriginal, currencyCode)}
                          style={{ fontSize: `${Math.max(8, fs.body - 2)}px`, opacity: 0.7 }}
                        />
                        {b.totalDiscount > 0 && (
                          <TwoCol
                            left="   🎁 DEAL DISCOUNT"
                            right={`-${formatCurrency(b.totalDiscount, currencyCode)}`}
                            style={{ fontSize: `${Math.max(8, fs.body - 2)}px`, color: '#dc2626', fontWeight: 'bold' }}
                          />
                        )}
                        <TwoCol
                          left="   DEAL PRICE"
                          right={formatCurrency(b.totalSubtotal, currencyCode)}
                          style={{ fontSize: `${Math.max(8, fs.body - 1)}px`, fontWeight: 'bold' }}
                        />
                      </>
                    ) : (
                      <TwoCol
                        left="   DEAL PRICE"
                        right={formatCurrency(b.totalSubtotal, currencyCode)}
                        style={{ fontSize: `${Math.max(8, fs.body - 1)}px`, fontWeight: 'bold' }}
                      />
                    )}
                  </div>
                </div>
                );
              });


              const renderedStandaloneElements = standaloneItems.map((item, index) => (
                <div key={`standalone-${index}`} style={{ marginBottom: '6px', textTransform: 'uppercase' }}>
                  <div style={{ textAlign: 'left', wordWrap: 'break-word' }}>{item.product?.name || 'Item'}</div>
                  {item.selectedVariant && (
                    <div style={{ textAlign: 'left', fontSize: `${Math.max(8, fs.body - 2)}px`, opacity: 0.8 }}>{item.selectedVariant}</div>
                  )}
                  {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                    <div style={{ textAlign: 'left', fontSize: `${Math.max(8, fs.body - 2)}px`, opacity: 0.8 }}>+ {item.selectedModifiers.map((m: any) => m.name).join(', ')}</div>
                  )}
                  {item.serialNumber && (
                    <div style={{ textAlign: 'left', fontSize: `${Math.max(8, fs.body - 2)}px`, opacity: 0.8 }}>SN: {item.serialNumber}</div>
                  )}
                  <TwoCol
                    left={`${item.quantity} PCS x ${formatCurrency(item.subtotal / item.quantity, currencyCode)}`}
                    right={formatCurrency(item.subtotal, currencyCode)}
                  />
                  {showDiscount && item.discount > 0 && (
                    <TwoCol
                      left={`DISCOUNT ${item.discountType === 'percentage' && item.discountValue ? `(${item.discountValue}%)` : ''}`}
                      right={`-${formatCurrency(item.discount, currencyCode)}`}
                      style={{ fontSize: `${Math.max(8, fs.body - 2)}px`, opacity: 0.8, marginTop: '2px' }}
                    />
                  )}
                </div>
              ));

              return (
                <>
                  {renderedBundlesElements}
                  {renderedStandaloneElements}
                </>
              );
            })()}
          </div>


          {template !== 'minimal' && <div style={dividerStyle} />}

          {/* Totals Section */}
          {showDiscount && (
            <TwoCol left="SUBTOTAL" right={formatCurrency(sale.subtotal, currencyCode)} />
          )}
          {showDiscount && (() => {
            if (!(sale.discountAmount > 0)) return null;

            let dealDiscount = 0;
            let itemDiscount = 0;
            (sale.items || []).forEach((item: any) => {
              const isBundle = item.bundleId || item.bundle_id;
              if (isBundle) {
                dealDiscount += (item.discount || 0);
              } else {
                itemDiscount += (item.discount || 0);
              }
            });

            // Bill discount is the remainder
            const billDiscount = Math.max(0, (sale.discountAmount || 0) - dealDiscount - itemDiscount);
            
            // Check if we have more than one type of discount to show a breakdown
            const typesCount = [dealDiscount > 0, itemDiscount > 0, billDiscount > 0].filter(Boolean).length;

            if (typesCount > 1) {
              return (
                <>
                  {dealDiscount > 0 && (
                    <TwoCol 
                      left="  DEAL DISCOUNT" 
                      right={`-${formatCurrency(dealDiscount, currencyCode)}`} 
                      style={{ fontSize: `${Math.max(8, fs.body - 1)}px`, opacity: 0.8 }}
                    />
                  )}
                  {itemDiscount > 0 && (
                    <TwoCol 
                      left="  ITEM DISCOUNT" 
                      right={`-${formatCurrency(itemDiscount, currencyCode)}`} 
                      style={{ fontSize: `${Math.max(8, fs.body - 1)}px`, opacity: 0.8 }}
                    />
                  )}
                  {billDiscount > 0 && (
                    <TwoCol 
                      left="  BILL DISCOUNT" 
                      right={`-${formatCurrency(billDiscount, currencyCode)}`} 
                      style={{ fontSize: `${Math.max(8, fs.body - 1)}px`, opacity: 0.8 }}
                    />
                  )}
                  <TwoCol left="TOTAL DISCOUNT" right={`-${formatCurrency(sale.discountAmount, currencyCode)}`} />
                </>
              );
            } else {
              let label = "DISCOUNT";
              if (dealDiscount > 0) label = "DEAL DISCOUNT";
              else if (itemDiscount > 0) label = "ITEM DISCOUNT";
              else if (billDiscount > 0) label = "BILL DISCOUNT";
              
              return (
                <TwoCol left={label} right={`-${formatCurrency(sale.discountAmount, currencyCode)}`} />
              );
            }
          })()}
          {sale.extraCharges && sale.extraCharges.length > 0 && sale.extraCharges.map((charge: any, idx: number) => (
            <TwoCol key={idx} left={charge.name || "OTHER"} right={formatCurrency(charge.amount, currencyCode)} />
          ))}
          {settings.receiptShowTax && (
            <TwoCol left={`${taxLabel} (${settings.taxRate}%)`} right={formatCurrency(sale.taxAmount, currencyCode)} />
          )}

          {template !== 'minimal' && <div style={dividerStyle} />}

          <TwoCol left="TOTAL" right={formatCurrency(sale.total, currencyCode)} bold lg style={{ padding: '4px 0' }} />

          {template !== 'minimal' && <div style={dividerStyle} />}

          {/* Payment Section */}
          <div style={{ marginTop: '4px', marginBottom: '4px', textTransform: 'uppercase' }}>
            {sale.paymentMethod === 'split' && sale.splitPayments ? (
              <div style={{ marginBottom: '4px' }}>
                <div style={{ textAlign: 'left', fontWeight: clamp(baseWeight + 200) }}>SPLIT PAYMENT:</div>
                {sale.splitPayments.map((p, i) => (
                  <TwoCol key={i} left={p.method} right={formatCurrency(p.amount, currencyCode)} />
                ))}
              </div>
            ) : sale.paymentMethod === 'credit' ? (
              <div style={{ marginBottom: '4px' }}>
                <div style={{ textAlign: 'left', fontWeight: clamp(baseWeight + 200) }}>PAID: CREDIT</div>
                {sale.receivedAmount && sale.receivedAmount > 0 ? (
                  <>
                    <TwoCol left="ADVANCE PAID:" right={formatCurrency(sale.receivedAmount, currencyCode)} />
                    <TwoCol left="ADDED TO DEBT:" right={formatCurrency(sale.total - sale.receivedAmount, currencyCode)} />
                  </>
                ) : null}
              </div>
            ) : (
              <div style={{ textAlign: 'left' }}>PAID: {sale.paymentMethod}</div>
            )}
            <TwoCol left="CHG:" right={formatCurrency(sale.changeAmount || 0, currencyCode)} />
          </div>

          {/* Notes / "OKAY" Box */}
          {settings.receiptShowNotes && sale.notes && (
            <div style={{
              border: '2px solid black',
              padding: '6px',
              textAlign: 'center',
              margin: '12px auto',
              width: '90%',
              wordWrap: 'break-word',
              textTransform: 'uppercase',
              fontWeight: clamp(baseWeight + 100),
            }}>
              {sale.notes}
            </div>
          )}
        </div>

        {/* Footer Section (Independent Center) */}
        <div style={{
          textAlign: 'center',
          marginTop: '16px',
          marginBottom: '24px',
          textTransform: 'uppercase',
          position: 'relative',
          left: `${settings.receiptFooterOffsetX || 0}mm`,
          width: '100%',
          display: 'block'
        }}>
          {settings.receiptShowBarcode !== false && (
            <div style={{ margin: '12px auto', display: 'flex', justifyContent: 'center' }}>
              <BarcodePreview
                value={sale.invoiceNumber}
                height={40}
                showValue={true}
                options={{ width: is58mm ? 1.1 : 1.4, margin: 4 }}
              />
            </div>
          )}
          {settings.receiptShowFooter !== false && (
            <>
              {settings.receiptFooter && (
                <div style={{ marginBottom: '8px' }}>{settings.receiptFooter}</div>
              )}
              <div style={{ marginTop: '4px' }}>WWW.ZAYNAHSPOS.COM</div>
            </>
          )}
        </div>

        {template !== 'minimal' && <div style={dividerStyle} />}
      </div>
    );
  };

  if (isAutoPrint) {
    return (
      <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/80 p-4">
        <div className="bg-white dark:bg-surface rounded-[2rem] p-8 max-w-sm w-full shadow-2xl border border-white/5 flex flex-col items-center text-center gap-6 animate-in zoom-in-95 duration-300">
          <div className="relative">
            <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center border border-primary/20">
              <Printer className="w-10 h-10 text-primary animate-pulse" />
            </div>
            <div className="absolute -top-2 -right-2 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center shadow-lg animate-bounce">
              <Check className="w-5 h-5" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white uppercase tracking-widest">Printing Bill</h3>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 font-medium">Please wait while your receipt is being processed...</p>
          </div>
          <div className="w-full bg-gray-100 dark:bg-white/5 h-1.5 rounded-full overflow-hidden">
            <div className="bg-primary h-full animate-progress" />
          </div>
          <div className="flex flex-col gap-2 w-full">
            <button onClick={() => handlePrint()} className="w-full py-3 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 active:scale-95 transition-all">
              Print Manually
            </button>
            <button onClick={onClose} className="text-[10px] font-black text-gray-600 uppercase tracking-widest hover:text-gray-900 dark:hover:text-white transition-colors">
              Tap to close
            </button>
          </div>
        </div>
        {/* Hidden area for actual print logic */}
        <div style={{ position: 'fixed', left: '-9999px', top: '-9999px', pointerEvents: 'none' }}>
          {renderReceiptBody()}
        </div>
      </div>
    );
  }

  // ── Manual print: modal ──
  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="PRINT CHECKOUT"
      subtitle="Zaynahs POS • Monochrome"
      maxWidth={isA4 ? 'lg' : 'sm'}
      headerActions={
        <div>
          {sale.customerPhone && (
            <button
              onClick={handleWhatsAppRedirect}
              className="btn btn-md btn-primary w-10 h-10"
              title="Send via WhatsApp"
            >
              <MessageCircle className="w-5 h-5" />
            </button>
          )}
        </div>
      }
      footer={
        <div className="flex flex-col w-full gap-4">
          <div className="flex justify-center">
            <div className="bg-yellow-50 dark:bg-yellow-500/10 text-yellow-800 dark:text-yellow-400 text-[10px] font-black px-4 py-2 rounded-full flex items-center gap-2 border border-yellow-200 dark:border-yellow-500/20 uppercase tracking-widest">
              <ShieldAlert className="w-3.5 h-3.5" /> In print dialog: disable Headers & Footers
            </div>
          </div>
          <div className="flex flex-row items-center gap-3 w-full">
            <button
              id="receipt-close-btn"
              onClick={onClose}
              className="btn btn-md group flex-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white border border-emerald-200 dark:border-primary/20 dark:bg-surface dark:text-emerald-400 dark:hover:bg-primary dark:hover:text-white transition-all"
            >
              <span>NEW SALE</span>
              <span className="hidden sm:inline-flex items-center ml-1.5 px-1 py-0.5 text-[8px] tracking-normal font-bold bg-primary/10 group-hover:bg-white/20 rounded-md">ESC</span>
            </button>
            <button
              id="receipt-share-btn"
              onClick={handleShareReceipt}
              disabled={isSharing}
              className="group flex-1 py-3.5 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-full font-black transition-all shadow-lg shadow-blue-500/20 text-[10px] uppercase tracking-widest active:scale-95 flex items-center justify-center gap-2"
            >
              {isSharing ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Share2 className="w-4 h-4" /> 
                  <span className="flex items-center">
                    SHARE
                    <span className="hidden sm:inline-flex items-center ml-1.5 px-1.5 py-0.5 text-[8px] tracking-normal font-bold bg-white/20 rounded-md">S</span>
                  </span>
                </>
              )}
            </button>
            <button
              id="receipt-print-btn"
              onClick={handlePrint}
              className="btn btn-md btn-primary group flex-[1.5]"
            >
              <Printer className="w-4 h-4" /> 
              <span className="flex items-center">
                PRINT BILL
                <span className="hidden sm:inline-flex items-center ml-1.5 px-1 py-0.5 text-[8px] tracking-normal font-bold bg-white/20 rounded-md">ENTER</span>
              </span>
            </button>
          </div>
        </div>
      }
      
    >
      <div className="w-full flex justify-center py-4 sm:py-8 bg-gray-100/50 dark:bg-white/5 min-h-full">
        <div className="shadow-2xl bg-white p-1" style={{ width: 'auto', maxWidth: '95%' }}>
          {renderReceiptBody()}
        </div>
      </div>
    </Modal>
  );
}