import { formatCurrency } from '../../lib/currencies';
import { formatAppDate } from '../../lib/dateUtils';
import { AppSettings } from '../../types';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import { BarcodePreview } from '../common/BarcodePreview';

interface ReceiptPreviewProps { settings: AppSettings; }

export function ReceiptPreview({ settings }: ReceiptPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth - 32); // subtract padding
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const currency = settings.currency;
  const is58mm = settings.receiptPaperSize === '58mm';
  const isA4 = settings.receiptPaperSize === 'A4';

  // Real-world pixel widths from chart
  const paperWidthNumeric = is58mm ? 219 : isA4 ? 794 : 302;
  const paperWidthPx = `${paperWidthNumeric}px`;

  // Scale to fit container
  const fitScale = (containerWidth > 0 && containerWidth < paperWidthNumeric)
    ? containerWidth / paperWidthNumeric
    : 1;

  // Padding Support
  const padTop = settings.receiptPaddingTop || (isA4 ? 15 : 2);
  const padBottom = settings.receiptPaddingBottom || (isA4 ? 15 : 10);
  const padLeft = settings.receiptPaddingLeft || (isA4 ? 24 : 2);
  const padRight = settings.receiptPaddingRight || (isA4 ? 24 : 2);
  const offsetX = settings.receiptOffsetX || 0;

  const userScale = settings.receiptFontScale || 1;
  const scale = userScale * 1.0;
  const sz = (base: number) => Math.round(base * scale);

  const rawWeight = Number(settings.receiptFontWeight);
  const baseWeight = settings.receiptFontBold
    ? 700
    : ((!isNaN(rawWeight) && rawWeight > 0) ? rawWeight : (is58mm ? 400 : isA4 ? 600 : 500));
  const clamp = (w: number) => {
    const val = Number(w);
    if (isNaN(val)) return 400;
    return Math.max(100, Math.min(700, val));
  };

  const fs = {
    shopName: sz(is58mm ? 14 : isA4 ? 24 : 18),
    body: sz(is58mm ? 9 : isA4 ? 13 : 11),
    total: sz(is58mm ? 13 : isA4 ? 20 : 16),
    footer: sz(is58mm ? 8 : isA4 ? 12 : 10),
    meta: sz(is58mm ? 9 : isA4 ? 12 : 10),
  };

  const taxLabel = 'Tax';
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
      case 'bold': case 'compact': return '3px solid black';
      default: return '1px solid black';
    }
  })();

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

  const discountAmount = settings.receiptShowDiscount !== false ? 80 : 0;
  const taxRateVal = parseFloat(settings.taxRate?.toString() || '0') || 0;
  const subtotal = 1080;
  const taxAmount = settings.receiptShowTax ? (subtotal - discountAmount) * (taxRateVal / 100) : 0;
  const total = subtotal - discountAmount + taxAmount;

  return (
    <div ref={containerRef} className="bg-gray-100 dark:bg-app p-4 rounded-2xl border border-gray-200 dark:border-white/5 flex flex-col items-center overflow-auto min-h-[500px] w-full">
      <div
        className="shadow-lg transition-all duration-300"
        style={{
          width: paperWidthPx,
          backgroundColor: '#fff',
          color: '#000',
          transform: `scale(${fitScale})`,
          transformOrigin: 'top center',
          position: 'relative',
          // Global Offset X Shift (moves everything)
          left: `${settings.receiptOffsetX || 0}mm`,
          paddingTop: `${Math.max(0, padTop)}mm`,
          paddingBottom: `${Math.max(0, padBottom)}mm`,
          marginTop: padTop < 0 ? `${padTop}mm` : '0',
          marginBottom: `calc(-100% * (1 - ${fitScale}) + ${padBottom < 0 ? padBottom : 0}mm)`,
          fontFamily: fontFamily,
          fontSize: `${fs.body}px`,
          fontWeight: baseWeight,
          lineHeight: settings.receiptDensity === 'compact' ? '1.1' : settings.receiptDensity === 'comfortable' ? '1.6' : '1.3',
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
        }}
      >
        {template !== 'minimal' && <div style={dividerStyle} />}

        {/* Header Section (Independent Center) */}
        <div style={{
          textAlign: 'center',
          margin: '8px 0',
          color: 'black',
          position: 'relative',
          left: `${settings.receiptHeaderOffsetX || 0}mm`,
          width: '100%',
          display: 'block'
        }}>
          {(settings.receiptShowLogo && settings.storeLogo) ? (
            <img src={settings.storeLogo} alt="Logo" style={{ display: 'block', margin: '0 auto', maxHeight: '80px', maxWidth: '80%', objectFit: 'contain' }} />
          ) : (
            <div style={{ margin: '0 auto', marginBottom: '8px', width: '100%', textAlign: 'center' }}>
              <QRCodeSVG value="PREVIEW-123" size={80} level="M" style={{ margin: '0 auto' }} />
            </div>
          )}
          {settings.receiptShowStoreName && (
            <div style={{ fontWeight: clamp(baseWeight + 300), fontSize: `${fs.shopName}px`, marginTop: '8px', textTransform: 'uppercase' }}>
              {settings.storeName || 'ZAYNAHS POS'}
            </div>
          )}
          {settings.receiptShowStoreAddress && (
            <div style={{ marginTop: '4px' }}>{settings.storeAddress}</div>
          )}
          <div style={{ marginTop: '2px' }}>
            {settings.receiptShowStorePhone && <span>T: {settings.storePhone || '+92 300 0000000'}</span>}
            {settings.receiptShowStoreEmail && <span style={{ marginLeft: '6px' }}>E: {settings.storeEmail || 'contact@zaynahspos.com'}</span>}
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

          <TwoCol
            left={`INV#: ${settings.invoicePrefix || 'INV'}-001234`}
            right={`DATE: ${formatAppDate(new Date().toISOString(), settings.country).replace(/,/g, '')}`}
          />
          <TwoCol
            left={`TIME: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
            right={`OP: ADMIN`}
          />

          {settings.receiptShowCustomerName && (
            <TwoCol
              left="CUST: WALKIN CUSTOMER"
              right={settings.receiptShowCustomerPhone ? "PH: +92 300 0000000" : ""}
            />
          )}

          {template !== 'minimal' && <div style={subDividerStyle} />}

          <TwoCol left="ITEM" right="TOTAL" bold />

          {template !== 'minimal' && <div style={subDividerStyle} />}

          <div style={{ marginTop: '4px', marginBottom: '4px', color: 'black' }}>
            {[
              { name: 'Apple Juice (Fresh)', qty: 2, price: 450, subtotal: 900 },
              { name: 'Brown Bread 400g', qty: 1, price: 180, subtotal: 180 },
            ].map((item, index) => (
              <div key={index} style={{ marginBottom: '6px', textTransform: 'uppercase' }}>
                <div style={{ textAlign: 'left', wordWrap: 'break-word' }}>{item.name}</div>
                <TwoCol
                  left={`${item.qty} PCS x ${formatCurrency(item.price, settings.currency)}`}
                  right={formatCurrency(item.subtotal, settings.currency)}
                />
              </div>
            ))}
          </div>

          {template !== 'minimal' && <div style={dividerStyle} />}

          {settings.receiptShowDiscount !== false && (
            <TwoCol left="SUBTOTAL" right={formatCurrency(subtotal, settings.currency)} />
          )}
          {settings.receiptShowDiscount !== false && (
            <TwoCol left="DISCOUNT" right={`-${formatCurrency(discountAmount, settings.currency)}`} />
          )}
          {settings.receiptShowTax && (
            <TwoCol left={`${taxLabel} (${settings.taxRate}%)`} right={formatCurrency(taxAmount, settings.currency)} />
          )}

          {template !== 'minimal' && <div style={dividerStyle} />}
          <TwoCol left="TOTAL" right={formatCurrency(total, settings.currency)} bold lg style={{ padding: '4px 0' }} />
          {template !== 'minimal' && <div style={dividerStyle} />}

          <div style={{ marginTop: '4px', marginBottom: '4px', textTransform: 'uppercase', color: 'black' }}>
            <div style={{ textAlign: 'left' }}>PAID: CASH</div>
            <TwoCol left="CHG:" right={formatCurrency(0, settings.currency)} />
          </div>

          {settings.receiptShowNotes && (
            <div style={{
              border: '2px solid black',
              padding: '6px',
              textAlign: 'center',
              margin: '12px auto',
              width: '90%',
              wordWrap: 'break-word',
              textTransform: 'uppercase',
              fontWeight: clamp(baseWeight + 100),
              color: 'black'
            }}>
              OKAY: DELIVER ON TIME
            </div>
          )}

          {template !== 'minimal' && <div style={dividerStyle} />}
        </div>

        {/* Footer Section (Independent Center) */}
        <div style={{
          textAlign: 'center',
          marginTop: '16px',
          marginBottom: '24px',
          textTransform: 'uppercase',
          color: 'black',
          position: 'relative',
          left: `${settings.receiptFooterOffsetX || 0}mm`,
          width: '100%',
          display: 'block'
        }}>
          {settings.receiptShowBarcode !== false && (
            <div style={{ margin: '12px auto', display: 'flex', justifyContent: 'center' }}>
              <BarcodePreview
                value="INV-001234"
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
    </div>
  );
}
