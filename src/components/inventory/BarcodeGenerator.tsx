import { useRef, useState, useEffect, useCallback } from 'react';
import JsBarcode from 'jsbarcode';
import { QRCodeSVG } from 'qrcode.react';
import { useReactToPrint } from 'react-to-print';
import { Printer, Minus, Plus, Save, X, ZoomIn, ZoomOut, Maximize2, Layout } from 'lucide-react';
import { SearchableSelect } from '../common/SearchableSelect';
import { sonner } from '../../lib/sonner';
import { settingsService } from '../../lib/services';
import { Product, AppSettings } from '../../types';
import { formatCurrency } from '../../lib/currencies';
import { useApp } from '../../context/SupabaseAppContext';
import { useTranslation } from '../../hooks/useTranslation';

interface BarcodeGeneratorProps {
    products: Product[];
    onClose: () => void;
    onProductsChange?: (nextProducts: Product[]) => void;
}

type PaperSize = 'A4' 
    | 'Thermal-50x25' 
    | 'Thermal-40x30' 
    | 'Thermal-50x30'
    | 'Thermal-50x40'
    | 'Thermal-60x40'
    | 'Thermal-80x40' 
    | 'Thermal-80x50';

interface BarcodeSVGProps {
    value: string;
    barWidth: number;
    height: number;
    barcodeScale: number;
    barcodeZoom: number;
}

function BarcodeSVG({ value, barWidth, height, barcodeScale, barcodeZoom }: BarcodeSVGProps) {
    const svgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        if (svgRef.current && value) {
            try {
                svgRef.current.innerHTML = '';
                JsBarcode(svgRef.current, value, {
                    format: 'CODE128',
                    width: barWidth * barcodeScale,
                    height: height,
                    displayValue: false,
                    margin: 0,
                    background: 'transparent',
                });
                const svgEl = svgRef.current;
                const w = svgEl.getAttribute('width');
                const h = svgEl.getAttribute('height');
                if (w && h) {
                    const widthVal = w.replace('px', '');
                    const heightVal = h.replace('px', '');
                    svgEl.setAttribute('viewBox', `0 0 ${widthVal} ${heightVal}`);
                }
            } catch (err) {
                console.error('[BarcodeSVG] Failed to render:', err);
            }
        }
    }, [value, barWidth, height, barcodeScale]);

    return (
        <svg 
            ref={svgRef} 
            style={{ 
                width: '100%', 
                height: '100%', 
                maxWidth: `${100 * barcodeZoom}%`, 
                maxHeight: '100%',
                display: 'block' 
            }} 
        />
    );
}

// A4 at 96 dpi = 794 × 1123 px
const A4_W = 794;
const A4_H = 1123;

export let persistedBarcodeProducts: Product[] = [];
export let persistedBarcodeQuantities: Record<string, number> = {};

export function clearPersistedBarcodeState() {
    persistedBarcodeProducts = [];
    persistedBarcodeQuantities = {};
}

export function BarcodeGenerator({ products, onClose, onProductsChange }: BarcodeGeneratorProps) {
    const { state, dispatch } = useApp();
    const { t } = useTranslation();
    const componentRef = useRef<HTMLDivElement>(null);
    const previewAreaRef = useRef<HTMLDivElement>(null);

    const [localProducts, setLocalProductsState] = useState<Product[]>(() => {
        const merged = [...persistedBarcodeProducts];
        products.forEach(p => {
            if (!merged.find(m => m.id === p.id)) merged.push(p);
        });
        persistedBarcodeProducts = merged;
        return merged;
    });

    /* ─── Quantities State (Moved up to prevent TDZ reference issues) ─── */
    const [quantities, setQuantitiesState] = useState<Record<string, number>>(() => {
        let init = { ...persistedBarcodeQuantities };
        
        try {
            const saved = localStorage.getItem('barcode_selected_quantities');
            if (saved) {
                const parsed = JSON.parse(saved);
                init = { ...parsed, ...init };
            }
        } catch (e) {
            console.error('Error loading barcode_selected_quantities:', e);
        }

        localProducts.forEach(p => {
            if (init[p.id] === undefined) init[p.id] = 1;
        });
        
        persistedBarcodeQuantities = init;
        return init;
    });

    const setQuantities = (val: React.SetStateAction<Record<string, number>>) => {
        setQuantitiesState(prev => {
            const next = typeof val === 'function' ? val(prev) : val;
            persistedBarcodeQuantities = next;
            localStorage.setItem('barcode_selected_quantities', JSON.stringify(next));
            return next;
        });
    };

    const setLocalProducts = (next: Product[]) => {
        persistedBarcodeProducts = next;
        setLocalProductsState(next);
        const ids = next.map(p => p.id);
        localStorage.setItem('barcode_selected_product_ids', JSON.stringify(ids));
        
        // Clean up quantities map for removed products
        setQuantities(q => {
            const nextQ = { ...q };
            Object.keys(nextQ).forEach(key => {
                if (!ids.includes(key)) {
                    delete nextQ[key];
                }
            });
            return nextQ;
        });

        onProductsChange?.(next);
    };

    // Synchronize localProducts when products prop changes (e.g. parent hydration)
    useEffect(() => {
        const localIds = localProducts.map(p => p.id).join(',');
        const propIds = products.map(p => p.id).join(',');
        if (localIds !== propIds) {
            setLocalProductsState(products);
            persistedBarcodeProducts = products;
        }
    }, [products, localProducts]);

    // Ensure default quantity of 1 for any newly added products
    useEffect(() => {
        setQuantitiesState(prev => {
            let hasChanges = false;
            const next = { ...prev };
            localProducts.forEach(p => {
                if (next[p.id] === undefined) {
                    next[p.id] = 1;
                    hasChanges = true;
                }
            });
            if (hasChanges) {
                persistedBarcodeQuantities = next;
                localStorage.setItem('barcode_selected_quantities', JSON.stringify(next));
                return next;
            }
            return prev;
        });
    }, [localProducts]);

    /* ─── Settings ────────────────────────────────────────────────── */
    const [paperSize, setPaperSize] = useState<PaperSize>((state.settings.barcodePaperSize as PaperSize) || 'A4');
    const [a4Columns, setA4Columns] = useState<number>(state.settings.barcodeA4Columns || 4);
    const [a4Rows, setA4Rows] = useState<number>(state.settings.barcodeA4Rows || 10);
    const [showPrice, setShowPrice] = useState(state.settings.barcodeShowPrice ?? true);
    const [showName, setShowName] = useState(state.settings.barcodeShowName ?? true);
    const [showSku, setShowSku] = useState(state.settings.barcodeShowSku ?? false);
    const [showCategory, setShowCategory] = useState(state.settings.barcodeShowCategory ?? false);
    const [barcodeScale, setBarcodeScale] = useState<number>(state.settings.barcodeScale || 1.0);
    const [barcodeHeight, setBarcodeHeight] = useState<number>(state.settings.barcodeHeight || 30);
    const [labelPadding, setLabelPadding] = useState<number>(state.settings.barcodePadding || 8);
    const [labelBorder, setLabelBorder] = useState(state.settings.barcodeBorder ?? true);
    const [barcodeType, setBarcodeType] = useState<'BARCODE' | 'QR'>((state.settings.barcodeType as 'BARCODE' | 'QR') || 'BARCODE');
    const [nameLines, setNameLines] = useState<1 | 2>((state.settings.barcodeNameLines as 1 | 2) || 1);
    const [barcodeFontSize, setBarcodeFontSize] = useState<number>(state.settings.barcodeFontSize || 8);
    const [contentScale, setContentScale] = useState<number>(state.settings.barcodeContentScale || 1.0);
    const [marginX, setMarginX] = useState<number>(state.settings.barcodeMarginX || 0);
    const [marginY, setMarginY] = useState<number>(state.settings.barcodeMarginY || 0);
    const [gapX, setGapX] = useState<number>(state.settings.barcodeGapX || 0);
    const [gapY, setGapY] = useState<number>(state.settings.barcodeGapY || 0);
    const [barcodeBarWidth, setBarcodeBarWidth] = useState<number>(state.settings.barcodeBarWidth || 0.8);
    const [barcodeZoom, setBarcodeZoom] = useState<number>(1.0);
    const [isSaving, setIsSaving] = useState(false);

    /* ─── Auto-fit preview scale (ResizeObserver) ─────────────────── */
    const [autoScale, setAutoScale] = useState(0.55);
    const [zoomDelta, setZoomDelta] = useState(0);   // user +/- on top of autoScale
    const previewScale = Math.max(0.2, Math.min(2, autoScale + zoomDelta));

    const calcAutoScale = useCallback(() => {
        if (!previewAreaRef.current) return;
        const { clientWidth, clientHeight } = previewAreaRef.current;
        const sw = (clientWidth - 40) / A4_W;
        const sh = (clientHeight - 120) / A4_H;
        setAutoScale(Math.min(sw, sh, 1));
        setZoomDelta(0); // reset manual zoom on resize
    }, []);

    useEffect(() => {
        calcAutoScale();
        const ro = new ResizeObserver(calcAutoScale);
        if (previewAreaRef.current) ro.observe(previewAreaRef.current);
        return () => ro.disconnect();
    }, [calcAutoScale]);

    /* ─── Save settings ───────────────────────────────────────────── */
    const saveAsDefault = async () => {
        try {
            setIsSaving(true);
            const s: Partial<AppSettings> = {
                barcodePaperSize: paperSize, barcodeA4Columns: a4Columns, barcodeA4Rows: a4Rows,
                barcodeShowPrice: showPrice, barcodeShowName: showName, barcodeShowSku: showSku,
                barcodeShowCategory: showCategory, barcodeScale, barcodeHeight,
                barcodePadding: labelPadding, barcodeBorder: labelBorder, barcodeType,
                barcodeNameLines: nameLines, barcodeFontSize, barcodeContentScale: contentScale,
                barcodeMarginX: marginX,
                barcodeMarginY: marginY,
                barcodeGapX: gapX,
                barcodeGapY: gapY,
                barcodeBarWidth: barcodeBarWidth,
            };
            await settingsService.update(s);
            const prev = JSON.parse(localStorage.getItem('pos_advanced_settings') || '{}');
            localStorage.setItem('pos_advanced_settings', JSON.stringify({ ...prev, ...s }));
            dispatch({ type: 'SET_SETTINGS', payload: s });
            sonner.success('Settings saved as default!');
        } catch { sonner.error('Failed to save settings'); }
        finally { setIsSaving(false); }
    };

    // Quantities state was moved higher up in the component definition.

    const updateQty = (id: string, d: number) =>
        setQuantities(q => ({ ...q, [id]: Math.max(0, Math.min(999, (q[id] || 0) + d)) }));
    const setGlobalQty = (v: number) => {
        const c = Math.max(0, Math.min(999, v));
        setQuantities(localProducts.reduce((a, p) => ({ ...a, [p.id]: c }), {}));
    };

    const labelsPerPage = a4Columns * a4Rows;
    const totalLabels = Object.values(quantities).reduce((a, b) => a + b, 0);
    const chunkArr = <T,>(arr: T[], n: number) =>
        Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

    const allLabels = localProducts
        .flatMap(p => Array.from({ length: quantities[p.id] || 0 }).map((_, i) => ({ product: p, id: `${p.id}-${i}` })))
        .slice(0, 1000);
    const pages = chunkArr(allLabels, labelsPerPage);

    /* ─── Print ───────────────────────────────────────────────────── */
    const handlePrint = useReactToPrint({
        contentRef: componentRef,
        documentTitle: `Zaynahs_POS_Labels_${new Date().toLocaleDateString('en-CA')}`,
        pageStyle: paperSize === 'A4' ? `
            @page { size: 210mm 297mm; margin: 0mm !important; }
            @media print {
                * { box-sizing:border-box !important; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
                html,body { margin:0 !important; padding:0 !important; width:210mm !important; background:white !important; }
                .page-indicator { display:none !important; }
                .print-page {
                    transform:none !important; margin-bottom:0 !important;
                    width:210mm !important; height:297mm !important; padding:5mm !important;
                    display:grid !important; box-shadow:none !important;
                    page-break-after:always !important; break-after:page !important;
                    overflow:hidden !important; align-content:stretch !important;
                }
            }` : (() => {
                const [w, h] = paperSize.split('-')[1].split('x');
                return `
                @page { size: ${w}mm ${h}mm; margin: 0mm !important; }
                @media print {
                    * { box-sizing:border-box !important; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
                    html,body { margin:0 !important; padding:0 !important; width:${w}mm !important; height:${h}mm !important; background:white !important; overflow:hidden !important; }
                    .label-to-print {
                        width:${w}mm !important;
                        height:${h}mm !important;
                        margin:0 !important;
                        padding:0 !important;
                        transform:none !important;
                        margin-bottom:0 !important;
                        page-break-after:always !important;
                        break-after:page !important;
                        overflow:hidden !important;
                        display:flex !important;
                        align-items:center !important;
                        justify-content:center !important;
                    }
                }
                `;
            })(),
        onAfterPrint: () => {
            persistedBarcodeProducts = [];
            persistedBarcodeQuantities = {};
            onClose();
        },
    });

    /* ─── Auto-size calculations ──────────────────────────────────── */
    const isThermal = paperSize.startsWith('Thermal');
    let cellW = 0; let cellH = 0;
    if (isThermal) {
        // Approximate px for layout logic (1mm ≈ 3.78px at 96dpi)
        const [w, h] = paperSize.split('-')[1].split('x');
        cellW = parseFloat(w) * 3.78;
        cellH = parseFloat(h) * 3.78;
    } else {
        // Cell size in px at 96dpi layout (A4 794×1123 minus 38px ≈ 10mm padding)
        cellW = (A4_W - 38) / a4Columns;
        cellH = (A4_H - 38) / a4Rows;
    }

    // Ratio relative to comfortable baseline (10 rows, 3 cols) * contentScale
    const ratio = Math.min(cellH / 108, cellW / 220, 1.4) * contentScale;

    const fs = {
        name: Math.max(6, Math.round(11 * ratio)),
        price: Math.max(7, Math.round(14 * ratio)),
        sku: Math.max(5, Math.round(9 * ratio)),
        cat: Math.max(5, Math.round(9 * ratio)),
        nameLH: Math.max(8, Math.round(15 * ratio)),
    };
    const barH = Math.max(14, Math.round(barcodeHeight * ratio));
    const barSc = Math.max(0.45, barcodeScale * ratio);
    const qrSz = Math.max(26, Math.round(80 * ratio));
    const pad = Math.max(0, Math.round(labelPadding * ratio)); // allows 0 padding

    /* ─── Render one label cell ───────────────────────────────────── */
    const renderLabel = (product: Product, key: string) => {
        const valRaw = product.barcodeValue || product.barcode || product.sku || '';
        const val = valRaw.toUpperCase().replace(/[^A-Z0-9\-\.\ \$\/\+\%]/g, '');

        const innerContent = (
            <div style={{
                width: '100%', height: '100%',
                padding: `${pad}px`,
                border: labelBorder && !isThermal ? '1px solid #e5e7eb' : 'none',
                backgroundColor: 'white', overflow: 'hidden', boxSizing: 'border-box',
                transform: `translate(${marginX}px, ${marginY}px)`,
            }}>
                <div style={{
                    width: '100%', height: '100%',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    gap: `${Math.max(2, Math.round(4 * ratio))}px`,
                }}>
                    {/* Name — 1 or 2 lines, never hidden */}
                    {showName && (
                        <p style={{
                            fontSize: `${fs.name}px`, fontWeight: 900,
                            lineHeight: `${fs.nameLH}px`, textTransform: 'uppercase',
                            color: '#111827', wordBreak: 'break-word', textAlign: 'center',
                            width: '100%', margin: 0, flexShrink: 0,
                            display: '-webkit-box',
                            WebkitLineClamp: nameLines,
                            WebkitBoxOrient: 'vertical' as const,
                            overflow: 'hidden',
                        }}>{product.name}</p>
                    )}

                    {/* Price + Category */}
                    {(showPrice || showCategory) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0, justifyContent: 'center', flexWrap: 'wrap', maxWidth: '100%' }}>
                            {showPrice && <p style={{ fontSize: `${fs.price}px`, fontWeight: 900, color: '#059669', margin: 0, whiteSpace: 'nowrap' }}>{formatCurrency(product.price, state.settings.currency)}</p>}
                            {showCategory && <p style={{ fontSize: `${fs.cat}px`, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{product.category}</p>}
                        </div>
                    )}

                    {/* SKU - Controlled by Toggle */}
                    {showSku && product.sku && (
                        <p style={{ fontSize: `${fs.sku}px`, color: '#9ca3af', fontFamily: 'monospace', margin: 0, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                            SKU: {product.sku}
                        </p>
                    )}

                    {/* Barcode / QR */}
                    {val ? (
                        <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', minHeight: 0 }}>
                            {barcodeType === 'BARCODE' ? (
                                <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '100%',
                                    minHeight: 0,
                                    flex: 1,
                                    overflow: 'hidden'
                                }}>
                                    <div style={{ 
                                        display: 'flex', 
                                        flexDirection: 'column', 
                                        alignItems: 'center', 
                                        justifyContent: 'center', 
                                        width: '100%',
                                        height: `${barH * barcodeZoom}px`,
                                        maxHeight: '75%',
                                        minHeight: 0,
                                        overflow: 'hidden'
                                    }}>
                                        <BarcodeSVG 
                                            value={val} 
                                            barWidth={barcodeBarWidth} 
                                            height={barH}
                                            barcodeScale={barcodeScale}
                                            barcodeZoom={barcodeZoom}
                                        />
                                    </div>
                                    <p style={{
                                        fontSize: `${Math.max(5, Math.round(barcodeFontSize * ratio))}px`,
                                        fontFamily: 'monospace',
                                        fontWeight: 750,
                                        color: '#000000',
                                        margin: 0,
                                        marginTop: `${Math.max(1, Math.round(2 * ratio))}px`,
                                        textTransform: 'uppercase',
                                        textAlign: 'center',
                                        width: '100%',
                                        letterSpacing: '0.05em',
                                        flexShrink: 0,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {val}
                                    </p>
                                </div>
                            ) : (
                                <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '100%',
                                    minHeight: 0,
                                    flex: 1,
                                    overflow: 'hidden'
                                }}>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: '100%',
                                        height: `${Math.max(20, Math.round(qrSz * barcodeZoom * barcodeScale))}px`,
                                        maxHeight: '80%',
                                        minHeight: 0,
                                        overflow: 'hidden'
                                    }}>
                                        <QRCodeSVG 
                                            value={val} 
                                            size={Math.max(20, Math.round(qrSz * barcodeZoom * barcodeScale))} 
                                            level="L" 
                                            includeMargin={false} 
                                            style={{
                                                width: 'auto',
                                                height: '100%',
                                                maxWidth: '100%',
                                                maxHeight: '100%',
                                                aspectRatio: '1/1',
                                                display: 'block'
                                            }}
                                        />
                                    </div>
                                    <p style={{
                                        fontSize: `${Math.max(5, Math.round(barcodeFontSize * ratio))}px`,
                                        fontFamily: 'monospace',
                                        fontWeight: 750,
                                        color: '#000000',
                                        margin: 0,
                                        marginTop: `${Math.max(1, Math.round(2 * ratio))}px`,
                                        textTransform: 'uppercase',
                                        textAlign: 'center',
                                        width: '100%',
                                        letterSpacing: '0.05em',
                                        flexShrink: 0,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {val}
                                    </p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <p style={{ fontSize: `${Math.max(6, Math.round(8 * ratio))}px`, color: '#ef4444', fontWeight: 700, fontStyle: 'italic', margin: 0, textAlign: 'center' }}>No Code Data</p>
                        </div>
                    )}
                </div>
            </div>
        );

        if (isThermal) {
            const [w, h] = paperSize.split('-')[1].split('x');
            return (
                <div key={key} data-capture-id={key}
                    className="label-to-print print:break-after-page shadow-md print:shadow-none bg-white border border-gray-200 dark:border-white/5 print:border-none"
                    style={{
                        width: `${cellW}px`,
                        height: `${cellH}px`,
                        transform: `scale(${previewScale})`,
                        transformOrigin: 'top center',
                        marginBottom: `${(cellH * previewScale) - cellH + (12 * previewScale)}px`,
                        overflow: 'hidden',
                        marginRight: 'auto',
                        marginLeft: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'white',
                        flexShrink: 0
                    }}>
                    {innerContent}
                </div>
            );
        }

        return (
            <div key={key} data-capture-id={key} style={{ width: '100%', height: '100%' }}>
                {innerContent}
            </div>
        );
    };

    /* ─── Sidebar section helper ──────────────────────────────────── */
    const SectionTitle = ({ children }: { children: React.ReactNode }) => (
        <p className="text-[9px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest mb-2.5">{children}</p>
    );

    const SliderRow = ({ label, disp, min, max, step, val, set }: {
        label: string; disp: string; min: number; max: number; step: number; val: number; set: (v: number) => void;
    }) => {
        const handleAdjust = (dir: number) => {
            const precision = step.toString().split('.')[1]?.length || 0;
            const next = parseFloat((val + (dir * step)).toFixed(precision));
            set(Math.max(min, Math.min(max, next)));
        };

        return (
            <div className="space-y-1">
                <div className="flex justify-between items-center px-1">
                    <span className="text-[9px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest leading-none">{label}</span>
                    <span className="text-[10px] font-black text-blue-600 min-w-[32px] text-right leading-none">{disp}</span>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        type="button"
                        onClick={() => handleAdjust(-1)}
                        className="w-6 h-6 flex items-center justify-center rounded-lg bg-gray-50 dark:bg-white/5 text-gray-500 hover:text-gray-900 dark:hover:text-white transition-all active:scale-90 border border-gray-200/50 dark:border-white/5"
                    >
                        <Minus className="h-2.5 w-2.5" />
                    </button>

                    <input type="range" min={min} max={max} step={step} value={val}
                        onChange={e => set(parseFloat(e.target.value))}
                        className="flex-1 h-1 bg-gray-200 dark:bg-white/10 rounded-full appearance-none cursor-pointer accent-blue-600" />

                    <button 
                        type="button"
                        onClick={() => handleAdjust(1)}
                        className="w-6 h-6 flex items-center justify-center rounded-lg bg-gray-50 dark:bg-white/5 text-gray-500 hover:text-gray-900 dark:hover:text-white transition-all active:scale-90 border border-gray-200/50 dark:border-white/5"
                    >
                        <Plus className="h-2.5 w-2.5" />
                    </button>
                </div>
            </div>
        );
    };

    /* ═══════════════════════════════════════════════════════════════ */
    return (
        <div className="flex flex-col h-full min-h-[600px] w-full bg-white dark:bg-surface overflow-hidden relative border-t border-gray-100 dark:border-white/5">

            {/* ══════════════════ HEADER ══════════════════ */}
            <div className="flex-shrink-0 flex items-center justify-between gap-2 px-3 md:px-5 py-2.5 border-b border-gray-200 dark:border-white/5 bg-gray-50/60 dark:bg-white/[0.02] flex-wrap">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-1.5 bg-blue-600/10 rounded-lg flex-shrink-0">
                        <Printer className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-sm font-black text-gray-900 dark:text-white leading-none truncate">{t('barcode_print_engine')}</h2>
                        <p className="hidden sm:block text-[9px] text-gray-600 mt-0.5 truncate">{t('barcode_print_engine_sub')}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`hidden sm:inline-flex px-2.5 py-1 rounded-lg text-[9px] font-bold border whitespace-nowrap
                        ${totalLabels === 0
                            ? 'bg-gray-50 dark:bg-white/5 text-gray-600 border-gray-200 dark:border-white/5'
                            : 'bg-blue-50 dark:bg-blue-600/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900/30'}`}>
                        {t('labels_pages_count').replace('{totalLabels}', totalLabels.toString()).replace('{pages}', pages.length.toString())}
                    </span>
                    <button onClick={handlePrint} disabled={totalLabels === 0}
                        className="btn btn-md btn-primary h-9 px-4 flex items-center gap-1.5 disabled:opacity-40 text-[10px] font-black uppercase tracking-widest shadow-md shadow-blue-500/20 active:scale-95 transition-all whitespace-nowrap">
                        <Printer className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="hidden xs:inline">{t('print_and_save')}</span>
                        <span className="xs:hidden">{t('print')}</span>
                    </button>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-gray-600 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
                        <X className="h-4.5 w-4.5" />
                    </button>
                </div>
            </div>

            {/* ══════════════════ BODY ══════════════════ */}
            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">

                {/* ══════ SIDEBAR ══════ */}
                <div className="
                    w-full lg:w-72 xl:w-80
                    flex flex-col
                    bg-white dark:bg-surface
                    border-t lg:border-t-0 lg:border-r border-gray-200 dark:border-white/5
                    order-2 lg:order-1
                    overflow-hidden
                    flex-1 lg:flex-none lg:h-full
                    "
                >
                    {/* Scrollable settings */}
                    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 scrollbar-hide min-h-0">

                        {/* ── Layout Config ── */}
                        <section>
                            <SectionTitle>{t('layout_configuration')}</SectionTitle>
                            <div className="space-y-3">

                                {/* Symbol type */}
                                <div>
                                    <span className="text-[9px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">{t('symbol_type')}</span>
                                    <div className="flex bg-gray-100 dark:bg-white/[0.05] p-0.5 rounded-xl mt-1">
                                        {(['BARCODE', 'QR'] as const).map(t => (
                                            <button key={t} onClick={() => setBarcodeType(t)}
                                                className={`flex-1 py-1.5 text-[9px] font-bold rounded-[10px] transition-all ${barcodeType === t ? 'bg-white dark:bg-primary shadow-sm text-primary dark:text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}>
                                                {t}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Paper type */}
                                <div>
                                    <span className="text-[9px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">{t('paper_type')}</span>
                                    <div className="mt-1 relative z-30">
                                        <SearchableSelect
                                            options={[
                                                { id: 'A4', label: t('standard_a4_sheet') },
                                                { id: 'Thermal-50x25', label: t('thermal_50x25') },
                                                { id: 'Thermal-40x30', label: t('thermal_40x30') },
                                                { id: 'Thermal-50x30', label: t('thermal_50x30') },
                                                { id: 'Thermal-50x40', label: t('thermal_50x40') },
                                                { id: 'Thermal-60x40', label: t('thermal_60x40') },
                                                { id: 'Thermal-80x40', label: t('thermal_80x40') },
                                                { id: 'Thermal-80x50', label: t('thermal_80x50') }
                                            ]}
                                            value={paperSize}
                                            onChange={(val) => setPaperSize(val as PaperSize)}
                                            placeholder={t('select_size')}
                                            icon={Layout}
                                        />
                                    </div>
                                </div>

                                {/* Columns + Rows — A4 only */}
                                {paperSize === 'A4' && <>
                                    <div>
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-[9px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">{t('columns')}</span>
                                            <span className="text-[10px] font-black text-blue-600">{a4Columns}</span>
                                        </div>
                                        <div className="flex bg-gray-100 dark:bg-white/[0.05] p-0.5 rounded-xl">
                                            {[2, 3, 4, 5, 6].map(n => (
                                                <button key={n} onClick={() => setA4Columns(n)}
                                                    className={`flex-1 py-1.5 text-xs font-bold rounded-[10px] transition-all ${a4Columns === n ? 'bg-white dark:bg-blue-600 shadow-sm text-blue-600 dark:text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}>
                                                    {n}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <SliderRow label={t('rows_per_page')} disp={String(a4Rows)} min={3} max={20} step={1} val={a4Rows} set={v => setA4Rows(Math.round(v))} />
                                    <p className="text-[8px] text-gray-600 dark:text-gray-500 italic -mt-1">{t('labels_auto_scale_desc')}</p>
                                </>}
                            </div>
                        </section>

                        {/* ── Print Quantities ── */}
                        <section className="border-t border-gray-200 dark:border-white/5 pt-3">
                            <div className="flex items-center justify-between mb-2">
                                <SectionTitle>{t('print_quantities')}</SectionTitle>
                                <div className="flex gap-1 -mt-2.5">
                                    <button onClick={() => {
                                        // Reset Quantities
                                        const resetQties = localProducts.reduce((a, p) => ({ ...a, [p.id]: 1 }), {});
                                        setQuantities(resetQties);

                                        // Reset ALL settings to absolute defaults
                                        setBarcodeScale(1.0);
                                        setBarcodeHeight(30);
                                        setLabelPadding(8);
                                        setBarcodeFontSize(8);
                                        setBarcodeBarWidth(0.8);
                                        setContentScale(1.0);
                                        setMarginX(0);
                                        setMarginY(0);
                                        setGapX(0);
                                        setGapY(0);
                                        setNameLines(1);
                                        setPaperSize('A4');
                                        setA4Columns(3);
                                        setA4Rows(10);
                                        setShowPrice(true);
                                        setShowName(true);
                                        setShowSku(false);
                                        setShowCategory(false);
                                        setLabelBorder(true);
                                        setBarcodeType('BARCODE');
                                    }}
                                        className="text-[8px] font-bold bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 px-2 py-1 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">{t('reset_all')}</button>
                                    <button onClick={() => { const v = prompt('Copies for all:', '5'); if (v) { const n = parseInt(v); if (!isNaN(n)) setGlobalQty(n); } }}
                                        className="text-[8px] font-bold bg-blue-600 text-white px-2 py-1 rounded-lg hover:bg-blue-700 transition-colors shadow-sm active:scale-95">{t('set_all')}</button>
                                </div>
                            </div>
                            <div className="space-y-1 max-h-32 overflow-y-auto pr-0.5 custom-scrollbar">
                                {localProducts.map(p => (
                                    <div key={p.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-xl border border-gray-200 dark:border-white/5 bg-gray-50/50 dark:bg-white/[0.02] hover:bg-white dark:hover:bg-white/[0.05] transition-all group/item">
                                        <button onClick={() => setLocalProducts(localProducts.filter(x => x.id !== p.id))} className="text-gray-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 p-1.5 rounded-lg transition-colors">
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[9px] font-bold text-gray-900 dark:text-white truncate uppercase leading-tight">{p.name}</p>
                                            <p className="text-[8px] text-gray-600 font-mono leading-tight">{p.barcodeValue || p.barcode || p.sku || 'NO-SKU'}</p>
                                        </div>
                                        <div className="flex items-center bg-white dark:bg-[#1C1C1C] rounded-lg border border-gray-200 dark:border-white/10 p-0.5 shadow-sm flex-shrink-0">
                                            <button onClick={() => updateQty(p.id, -1)} className="w-6 h-6 rounded-md text-gray-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center transition-colors active:scale-90"><Minus className="h-2.5 w-2.5" /></button>
                                            <input type="text" inputMode="numeric" value={quantities[p.id] !== undefined ? quantities[p.id] : 0}
                                                onChange={e => {
                                                    let str = e.target.value.replace(/^0+/, '');
                                                    if (str === '') str = '0';
                                                    const v = Math.max(0, Math.min(999, parseInt(str) || 0));
                                                    setQuantities(q => ({ ...q, [p.id]: v }));
                                                }}
                                                className="w-14 text-center text-[11px] font-black bg-transparent border-none focus:ring-0 text-gray-900 dark:text-white p-0 [appearance:textfield]" />
                                            <button onClick={() => updateQty(p.id, 1)} className="w-6 h-6 rounded-md text-gray-600 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 flex items-center justify-center transition-colors active:scale-90"><Plus className="h-2.5 w-2.5" /></button>
                                        </div>
                                    </div>
                                ))}
                                {localProducts.length === 0 && (
                                    <div className="text-center py-4 text-gray-600 text-[10px] font-black uppercase tracking-widest">
                                        {t('no_products_selected')}
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* ── Content Options ── */}
                        <section className="border-t border-gray-200 dark:border-white/5 pt-3">
                            <SectionTitle>{t('content_options')}</SectionTitle>
                            <div className="grid grid-cols-3 gap-1.5">
                                {([
                                    { label: t('name'), val: showName, set: setShowName },
                                    { label: t('price'), val: showPrice, set: setShowPrice },
                                    { label: t('sku'), val: showSku, set: setShowSku },
                                    { label: t('category'), val: showCategory, set: setShowCategory },
                                    { label: t('border'), val: labelBorder, set: setLabelBorder },
                                ] as const).map(({ label, val, set }) => (
                                    <button key={label} onClick={() => (set as any)(!val)}
                                        className={`py-1.5 rounded-xl border text-[8px] font-bold transition-all ${val
                                            ? 'bg-blue-50 dark:bg-blue-600/10 border-blue-200 dark:border-blue-900/30 text-blue-700 dark:text-blue-400'
                                            : 'bg-white dark:bg-white/[0.02] border-gray-200 dark:border-white/5 text-gray-600 dark:text-gray-500 hover:border-gray-200 dark:hover:border-white/10'}`}>
                                        {label}
                                    </button>
                                ))}
                            </div>

                            {/* Name lines control */}
                            {showName && (
                                <div className="mt-2">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-[9px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">{t('name_lines')}</span>
                                        <span className="text-[10px] font-black text-blue-600">{nameLines} {nameLines > 1 ? t('lines_plural') : t('line_singular')}</span>
                                    </div>
                                    <div className="flex bg-gray-100 dark:bg-white/[0.05] p-0.5 rounded-xl">
                                        {([1, 2] as const).map(n => (
                                            <button key={n} onClick={() => setNameLines(n)}
                                                className={`flex-1 py-1.5 text-[9px] font-bold rounded-[10px] transition-all ${nameLines === n ? 'bg-white dark:bg-blue-600 shadow-sm text-blue-600 dark:text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}>
                                                {n} {n > 1 ? t('lines_plural') : t('line_singular')}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </section>

                        {/* ── Barcode Dimension ── */}
                        <section className="border-t border-gray-200 dark:border-white/5 pt-3 pb-1">
                            <SectionTitle>{t('barcode_dimensions')}</SectionTitle>
                            <div className="space-y-3">
                                <SliderRow label={t('overall_content_scale')} disp={contentScale.toFixed(2) + 'x'} min={0.3} max={3.0} step={0.05} val={contentScale} set={setContentScale} />
                                <SliderRow label={t('barcode_size_zoom')} disp={barcodeZoom.toFixed(2) + 'x'} min={0.5} max={3.0} step={0.05} val={barcodeZoom} set={setBarcodeZoom} />
                                <SliderRow label={t('barcode_width')} disp={barcodeScale.toFixed(1) + 'x'} min={0.5} max={3} step={0.1} val={barcodeScale} set={setBarcodeScale} />
                                <SliderRow label={t('barcode_height')} disp={barcodeHeight + 'px'} min={15} max={80} step={5} val={barcodeHeight} set={v => setBarcodeHeight(Math.round(v))} />
                                <SliderRow label={t('number_size')} disp={barcodeFontSize + 'px'} min={5} max={30} step={1} val={barcodeFontSize} set={v => setBarcodeFontSize(Math.round(v))} />
                                <SliderRow label={t('cell_padding')} disp={labelPadding + 'px'} min={0} max={20} step={1} val={labelPadding} set={v => setLabelPadding(Math.round(v))} />
                                <SliderRow label={t('margin_x')} disp={marginX + 'px'} min={-50} max={50} step={1} val={marginX} set={v => setMarginX(Math.round(v))} />
                                <SliderRow label={t('margin_y')} disp={marginY + 'px'} min={-50} max={50} step={1} val={marginY} set={v => setMarginY(Math.round(v))} />
                                <SliderRow label={t('gap_x')} disp={gapX + 'px'} min={0} max={50} step={1} val={gapX} set={v => setGapX(Math.round(v))} />
                                <SliderRow label={t('gap_y')} disp={gapY + 'px'} min={0} max={50} step={1} val={gapY} set={v => setGapY(Math.round(v))} />
                                <SliderRow label={t('bar_thickness')} disp={barcodeBarWidth.toFixed(1)} min={0.5} max={5.0} step={0.1} val={barcodeBarWidth} set={setBarcodeBarWidth} />
                            </div>
                        </section>
                    </div>

                    {/* ══ SAVE — always pinned at BOTTOM of sidebar ══ */}
                    <div className="flex-shrink-0 relative z-10 px-4 py-3 bg-white dark:bg-surface border-t border-gray-200 dark:border-white/5 pb-[max(env(safe-area-inset-bottom,12px),12px)] lg:pb-3 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.1)]">
                        <button onClick={saveAsDefault} disabled={isSaving}
                            className="w-full btn btn-md btn-secondary h-12 lg:h-10 flex items-center justify-center gap-2 text-[10px] lg:text-[11px] font-black uppercase tracking-widest active:scale-[0.98] transition-transform">
                            {isSaving
                                ? <div className="h-4 w-4 lg:h-3.5 lg:w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                : <Save className="h-4 w-4 lg:h-3.5 lg:w-3.5" />}
                            {isSaving ? t('saving') : t('save_settings')}
                        </button>
                    </div>
                </div>

                {/* ══════ PREVIEW ══════ */}
                <div ref={previewAreaRef}
                    className="h-[35vh] lg:h-full lg:flex-1 flex-shrink-0 bg-gray-100 dark:bg-[#0f0f0f] flex flex-col overflow-hidden order-1 lg:order-2 relative min-h-0"
                >

                    {/* Sticky top bar with zoom controls */}
                    <div className="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-2 bg-gray-100/95 dark:bg-[#0f0f0f]/95 border-b border-gray-200/50 dark:border-white/5 flex-wrap gap-y-1.5">
                        {/* Info pills */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <div className="flex items-center gap-1.5 bg-white/80 dark:bg-white/5 py-1 px-2.5 rounded-full border border-gray-200 dark:border-white/5 shadow-sm">
                                <span className="text-[8px] font-bold text-gray-600 uppercase tracking-widest whitespace-nowrap hidden sm:inline">{t('simulation')}</span>
                                <div className="hidden sm:block h-2 w-px bg-gray-300 dark:bg-white/10" />
                                <span className="text-[9px] font-black text-blue-600 uppercase">{paperSize}</span>
                                <div className="h-2 w-px bg-gray-300 dark:bg-white/10" />
                                <span className="text-[9px] font-black text-primary">{pages.length}pg</span>
                                <div className="h-2 w-px bg-gray-300 dark:bg-white/10" />
                                <span className="text-[9px] font-black text-gray-600">{a4Columns}×{a4Rows}</span>
                            </div>
                            <div className="bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[8px] font-black uppercase px-2.5 py-1 rounded-full border border-amber-500/20 whitespace-nowrap hidden sm:block">
                                ⚠ {t('margins_none')}
                            </div>
                        </div>

                        {/* Zoom controls */}
                        <div className="flex items-center gap-2 bg-white dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10 p-1.5 px-3 shadow-sm">
                            <button 
                                onClick={() => setZoomDelta(d => Math.max(d - 0.05, -autoScale + 0.1))}
                                className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors active:scale-90"
                            >
                                <Minus className="h-3 w-3" />
                            </button>
                            
                            <input 
                                type="range"
                                min={-autoScale + 0.1}
                                max={2.5 - autoScale}
                                step={0.01}
                                value={zoomDelta}
                                onChange={(e) => setZoomDelta(parseFloat(e.target.value))}
                                className="w-20 sm:w-32 h-1 bg-gray-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />

                            <button 
                                onClick={() => setZoomDelta(d => Math.min(d + 0.05, 2.5 - autoScale))}
                                className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors active:scale-90"
                            >
                                <Plus className="h-3 w-3" />
                            </button>

                            <div className="w-px h-4 bg-gray-200 dark:bg-white/10 mx-1" />

                            <button 
                                onClick={() => { setZoomDelta(0); }}
                                className="px-1.5 flex items-center justify-center rounded-lg text-[9px] font-black text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-600/10 transition-colors whitespace-nowrap min-w-[32px]"
                            >
                                {Math.round(previewScale * 100)}%
                            </button>
                            
                            <div className="w-px h-4 bg-gray-200 dark:bg-white/10 mx-1" />
                            
                            <button onClick={calcAutoScale} title={t('fit_to_window')}
                                className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors active:scale-90">
                                <Maximize2 className="h-3 w-3" />
                            </button>
                        </div>
                    </div>

                    {/* Scrollable pages area */}
                    <div className="flex-1 overflow-auto">
                        <div className="flex flex-col items-center py-4 px-2 min-h-full">
                            <div ref={componentRef} className="print:bg-transparent flex flex-col items-center">
                                {paperSize === 'A4' ? (
                                    pages.map((page, pi) => (
                                        <div key={`pw-${pi}`} className="flex flex-col items-center">
                                            {/* Page divider — screen only */}
                                            <div className="page-indicator print:hidden flex items-center gap-2 my-2.5"
                                                style={{ width: `${A4_W * previewScale}px`, maxWidth: 'calc(100vw - 32px)' }}>
                                                <div className="h-px flex-1 bg-gray-300 dark:bg-white/10" />
                                                <span className="flex items-center gap-1.5 text-[8px] font-black text-gray-600 uppercase tracking-widest px-2.5 py-1 rounded-full bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 shadow-sm whitespace-nowrap">
                                                    <span className="text-blue-500">●</span> {t('page')} {pi + 1} / {pages.length}
                                                </span>
                                                <div className="h-px flex-1 bg-gray-300 dark:bg-white/10" />
                                            </div>

                                            {/* A4 sheet */}
                                            <div className="print-page bg-white shadow-2xl print:shadow-none"
                                                data-capture-id={`page-${pi}`}
                                                style={{
                                                    width: `${A4_W}px`,
                                                    height: `${A4_H}px`,
                                                    transform: `scale(${previewScale})`,
                                                    transformOrigin: 'top center',
                                                    marginBottom: `${(A4_H * previewScale) - A4_H + 16}px`,
                                                    display: 'grid',
                                                    gridTemplateColumns: `repeat(${a4Columns},1fr)`,
                                                    gridTemplateRows: `repeat(${a4Rows},1fr)`,
                                                    alignContent: 'stretch',
                                                    gap: `${gapY}px ${gapX}px`,
                                                    padding: '19px',
                                                    boxSizing: 'border-box',
                                                    backgroundColor: 'white',
                                                    overflow: 'hidden',
                                                    flexShrink: 0,
                                                }}>
                                                {page.map(item => renderLabel(item.product, item.id))}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="flex flex-col items-center pt-3 print:pt-0">
                                        {allLabels.map(item => renderLabel(item.product, item.id))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Print-only resets */}
                    <style>{`
                        @media print {
                            .print-page {
                                transform: none !important;
                                margin-bottom: 0 !important;
                                width: 210mm !important;
                                height: 297mm !important;
                                padding: 5mm !important;
                            }
                            .label-to-print {
                                transform: none !important;
                                margin-bottom: 0 !important;
                                border: none !important;
                                box-shadow: none !important;
                            }
                            .page-indicator { display: none !important; }
                        }
                    `}</style>
                </div>
            </div>
        </div>
    );
}