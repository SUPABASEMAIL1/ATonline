import JsBarcode from 'jsbarcode';

export interface BarcodeOptions {
  width?: number;
  height?: number;
  fontSize?: number;
  displayValue?: boolean;
  font?: string;
  textAlign?: string;
  textPosition?: string;
  textMargin?: number;
  background?: string;
  lineColor?: string;
  margin?: number;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
}

/**
 * Generates a CODE128 compatible barcode value formatted as ZP-{5-digit padded ID}
 */
export function generateBarcodeValue(
  productNameOrId?: string | number,
  fallbackId?: string | number
): string {
  let namePart = '';
  let potentialName = '';

  if (typeof productNameOrId === 'string' && productNameOrId.trim() !== '') {
    const trimmed = productNameOrId.trim();
    // Check if it looks like a UUID or a purely numeric ID
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
    const isNumeric = !isNaN(Number(trimmed));
    if (!isUuid && !isNumeric) {
      potentialName = trimmed;
    }
  }

  if (potentialName) {
    // Extract first 2 alphanumeric characters
    const cleaned = potentialName.replace(/[^a-zA-Z0-9]/g, '');
    if (cleaned.length >= 2) {
      namePart = cleaned.substring(0, 2).toUpperCase();
    } else if (cleaned.length === 1) {
      namePart = (cleaned + 'X').toUpperCase();
    } else {
      namePart = 'PR';
    }
  } else {
    namePart = 'PR';
  }

  // Generate a random 4-digit number (1000 to 9999)
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `${namePart}${randomNum}`;
}

/**
 * Renders a CODE128 barcode onto an SVG or HTML element
 */
export function renderBarcodeSVG(
  value: string,
  elementOrId: string | SVGElement | HTMLElement,
  options?: BarcodeOptions
): void {
  try {
    if (!value) return;
    const target = typeof elementOrId === 'string'
      ? (elementOrId.startsWith('#') ? elementOrId : `#${elementOrId}`)
      : elementOrId;
      
    const safeValue = value ? value.replace(/[^\x20-\x7E]/g, '') : 'PR9999';
      
    JsBarcode(target, safeValue, {
      format: 'CODE128',
      width: 1.5,
      height: 60,
      fontSize: 12,
      displayValue: true,
      margin: 8,
      background: 'transparent',
      lineColor: 'currentColor',
      ...options
    });

    // Add viewBox dynamically for responsive scaling
    const svgEl = typeof elementOrId === 'string'
      ? (document.querySelector(target) as SVGSVGElement)
      : (elementOrId as SVGSVGElement);

    if (svgEl && svgEl.tagName && svgEl.tagName.toLowerCase() === 'svg') {
      const w = svgEl.getAttribute('width');
      const h = svgEl.getAttribute('height');
      if (w && h) {
        const widthVal = w.replace('px', '');
        const heightVal = h.replace('px', '');
        svgEl.setAttribute('viewBox', `0 0 ${widthVal} ${heightVal}`);
      }
    }
  } catch (err) {
    console.error('[Barcode] Failed to render SVG:', err);
  }
}

/**
 * Renders a CODE128 barcode to a PNG data URL
 */
export async function renderBarcodePNG(value: string, options?: BarcodeOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      if (!value) {
        return reject(new Error('No barcode value provided'));
      }
      const safeValue = value ? value.replace(/[^\x20-\x7E]/g, '') : 'PR9999';
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, safeValue, {
        format: 'CODE128',
        width: 1.5,
        height: 60,
        fontSize: 12,
        displayValue: true,
        margin: 10,
        background: '#ffffff',
        lineColor: '#000000',
        ...options
      });
      resolve(canvas.toDataURL('image/png'));
    } catch (err) {
      reject(err);
    }
  });
}
