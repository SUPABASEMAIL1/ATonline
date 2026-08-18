import { supabase, adminUserAction } from './supabase';
import {
  Product,
  Customer,
  Sale,
  Discount,
  User,
  AppSettings,
  SalesTab,
  Expense,
  Category,
  Supplier,
  PurchaseRecord,
  ProductBatch,
  SupplierTransaction,
  StockHistory,
  Payment,
  PurchaseOrder,
  Bundle,
  BundleItem,
  CartItem,
  RefundRequest,
  Topping,
  ExtraTopping,
  VariantStockHistory,
  ProductAddon,
} from '../types';
import { localDb, queueOp, generateId, SETTINGS_ID } from './localDb';
import { generateBarcodeValue } from '../utils/barcode';

// Re-entrancy mutex for returnSale: local stock/refund mutations are NOT idempotent,
// so a concurrent double-click or retry could restore stock twice. The cloud RPC is
// idempotent, but the local writes need this lock for correctness.
const activeReturns = new Set<string>();

/**
 * Standard Utility for ID generation
 */
export { generateId };

// ============================================================================
// ATOMIC COMMIT HELPERS (Phase 1 — Online-authoritative + offline buffer)
// These wrap the server-side `commit_sale` / `apply_stock_movements` RPCs so a
// sale + ALL its stock movements are written in ONE Postgres transaction. This
// guarantees products.stock / variant_data can NEVER diverge from sales.
// Returns `true` only when the cloud write actually succeeded, so the caller can
// skip the legacy per-op queue path (idempotent ids prevent double writes).
// ============================================================================

export async function commitSaleAuthoritative(
  remoteSale: any,
  movements: any[]
): Promise<any> {
  try {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return null;
    // MASTER §5.2: reuse the sale id as the client-generated idempotency key so a
    // retry / offline replay of the SAME local sale is a no-op server-side, not a
    // second sale. Stable across retries because the local sale id never changes.
    const salePayload = { ...remoteSale, idempotency_key: remoteSale?.id };
    const { data, error } = await (supabase as any).rpc('commit_sale', {
      p_sale: salePayload,
      p_history: movements,
    });
    if (error) {
      console.error('[commit_sale] RPC error:', error.message);
      return null;
    }
    return data;
  } catch (e: any) {
    console.error('[commit_sale] exception:', e?.message || e);
    return null;
  }
}

// Revert a locally-written sale + restore local product stock when the cloud
// reports it was already fulfilled by another device (race on the same estore order).
async function revertLocalSaleStock(saleId: string, movements: any[]) {
  try {
    await localDb.sales.delete(saleId);
    for (const m of movements || []) {
      const pid = m?.product_id || m?.productId;
      if (!pid) continue;
      if (m?.variant_id || m?.variantId) continue;
      const p = await localDb.products.get(pid);
      if (p) {
        const qty = Number(m.change_qty ?? m.changeQty) || 0;
        // Sale movement change_qty is NEGATIVE (e.g. -5 sold). To RESTORE local stock
        // we must add the absolute amount: stock - change_qty = stock + 5.
        await localDb.products.update(pid, { stock: (p.stock || 0) - qty });
      }
    }
  } catch (e) {
    console.warn('[revertLocalSaleStock] failed:', e);
  }
}

export async function applyStockMovementsRemote(movements: any[]): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
    const { error } = await (supabase as any).rpc('apply_stock_movements', {
      p_history: movements,
    });
    if (error) {
      console.error('[apply_stock_movements] RPC error:', error.message);
      return false;
    }
    return true;
  } catch (e: any) {
    console.error('[apply_stock_movements] exception:', e?.message || e);
    return false;
  }
}

/**
 * Atomic sale delete: reverse stock (stock_history/variant_stock_history) AND
 * hard-delete the sale in ONE cloud transaction. Idempotent via RPC.
 * p_history may be [] for sales that need no stock reversal (e.g. drafts).
 */
export async function deleteSaleAtomic(saleId: string, movements: any[]): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
    if (movements.length === 0) {
      const { error } = await (supabase as any).rpc('delete_sale_atomic', {
        p_sale_id: saleId,
        p_history: [],
      });
      if (error) { console.error('[delete_sale_atomic] RPC error:', error.message); return false; }
      return true;
    }
    const { error } = await (supabase as any).rpc('delete_sale_atomic', {
      p_sale_id: saleId,
      p_history: movements,
    });
    if (error) { console.error('[delete_sale_atomic] RPC error:', error.message); return false; }
    return true;
  } catch (e: any) {
    console.error('[delete_sale_atomic] exception:', e?.message || e);
    return false;
  }
}

/**
 * Atomic refund: reverse stock AND update sale status/refunded_amount in ONE
 * cloud transaction. p_refunded_amount is the ABSOLUTE new total (idempotent on retry).
 */
export async function refundSaleAtomic(saleId: string, movements: any[], status: string, refundedAmount: number): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
    const { error } = await (supabase as any).rpc('refund_sale_atomic', {
      p_sale_id: saleId,
      p_history: movements,
      p_status: status,
      p_refunded_amount: refundedAmount,
    });
    if (error) { console.error('[refund_sale_atomic] RPC error:', error.message); return false; }
    return true;
  } catch (e: any) {
    console.error('[refund_sale_atomic] exception:', e?.message || e);
    return false;
  }
}

/**
 * Generic helper to fetch all rows across pagination limits (default 1000) for full cache initialization or delta sync.
 */
export async function fetchAllPages(queryFn: () => any, limit = 1000): Promise<any[]> {
  // SAFEGUARD: Supabase PostgREST default max_rows is 1000.
  // Passing a limit > 1000 will cause premature termination because data.length (1000) will be < limit,
  // making the loop think it has reached the last page.
  const actualLimit = Math.min(limit, 1000);

  let allData: any[] = [];
  let from = 0;
  let to = actualLimit - 1;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await queryFn().range(from, to);
    if (error) throw error;

    if (data && data.length > 0) {
      allData = [...allData, ...data];
      if (data.length < actualLimit) {
        hasMore = false;
      } else {
        from += actualLimit;
        to += actualLimit;
      }
    } else {
      hasMore = false;
    }
  }
  return allData;
}

/**
 * DEVICE IDENTIFICATION (Unique per browser/terminal)
 * Prevents invoice number collisions between multiple offline devices.
 */
export const getDeviceId = (): string => {
  const existing = localStorage.getItem('deviceId');
  if (existing) return existing;

  const newId = Math.random().toString(36).substring(2, 6).toUpperCase();
  localStorage.setItem('deviceId', newId);
  return newId;
};

// Generate invoice number utility
export function getNextInvoiceNumber(settings: AppSettings): string {
  const nextCounter = settings.invoiceCounter + 1;
  return `${settings.invoicePrefix}-${nextCounter.toString().padStart(6, '0')}`;
}

// Generate next invoice number and return data for updating settings
export function generateNextInvoiceNumber(settings: AppSettings): { invoiceNumber: string; newCounter: number } {
  const newCounter = settings.invoiceCounter + 1;
  const invoiceNumber = `${settings.invoicePrefix}-${newCounter.toString().padStart(6, '0')}`;
  return { invoiceNumber, newCounter };
}

/**
 * MAPPERS: Transitioning from snake_case (DB) to CamelCase (Frontend)
 * and ensuring Date objects are consistent.
 */

export const mapProduct = (item: any): Product => ({
  ...item,
  barcodeValue: item.barcode_value ?? item.barcodeValue ?? item.barcode,
  barcode: item.barcode ?? item.barcode_value ?? item.barcodeValue,
  isWeightBased: item.is_weight_based ?? item.isWeightBased,
  pricePerUnit: item.price_per_unit ?? item.pricePerUnit,
  trackInventory: item.track_inventory ?? item.trackInventory,
  isFeatured: item.is_featured ?? item.isFeatured,
  minStock: item.min_stock ?? item.minStock,
  targetStock: item.target_stock ?? item.targetStock,
  cost: item.cost ? Number(item.cost) : 0,
  price: item.price ? Number(item.price) : 0,
  variants: item.variants ?? [],
  variantData: item.variant_data ?? item.variantData ?? [],
  modifiers: item.modifiers ?? [],
  productType: item.product_type ?? item.productType ?? 'simple',
  parentId: item.parent_id ?? item.parentId,
  isService: item.is_service ?? item.isService ?? false,
  requireSerial: item.require_serial ?? item.requireSerial ?? false,
  showInEstore: item.show_in_estore ?? item.showInEstore ?? true,
  estoreSortOrder: item.estore_sort_order ?? item.estoreSortOrder ?? 0,
  estoreCategorySortOrder: item.estore_category_sort_order ?? item.estoreCategorySortOrder ?? 0,
  menuNumber: item.menu_number ?? item.menuNumber,
  highlightTag: item.highlight_tag ?? item.highlightTag,
  createdAt: item.created_at ? new Date(item.created_at) : new Date(item.createdAt),
  updatedAt: item.updated_at ? new Date(item.updated_at) : new Date(item.updatedAt)
});

export const mapSalesman = (item: any): any => ({
  ...item,
  createdAt: item.created_at || item.createdAt || new Date().toISOString(),
  updatedAt: item.updated_at || item.updatedAt,
});

export const mapCustomer = (item: any): Customer => ({
  ...item,
  priceTier: item.price_tier ?? item.priceTier,
  totalPurchases: item.total_purchases ?? item.totalPurchases,
  lastPurchase: item.last_purchase ? new Date(item.last_purchase) : (item.lastPurchase ? new Date(item.lastPurchase) : undefined),
  preferredCategories: item.preferred_categories ?? item.preferredCategories,
  createdAt: item.created_at ? new Date(item.created_at) : new Date(item.createdAt),
  updatedAt: item.updated_at ? new Date(item.updated_at) : new Date(item.updatedAt)
});

/**
 * Shared Financial Utilities
 */
export function getAmountByMethod(sale: any, method: string): number {
  const want = normalizePaymentMethod(method);
  const matches = (m: string) => {
    const nm = normalizePaymentMethod(m);
    if (want === 'online') return nm === 'online' || nm === 'digital';
    return nm === want;
  };
  if (sale.splitPayments && sale.splitPayments.length > 0) {
    return (sale.splitPayments || [])
      .filter((sp: any) => matches(sp.method))
      .reduce((sum: number, sp: any) => sum + (Number(sp.amount) || 0), 0);
  }

  return matches(sale.paymentMethod) ? (Number(sale.total) || 0) : 0;
}

export const mapSale = (item: any): Sale => ({
  ...item,
  sourceOrderId: item.source_order_id ?? item.sourceOrderId,
  invoiceNumber: item.invoice_number ?? item.invoiceNumber,
  customerId: item.customer_id ?? item.customerId,
  customerName: item.customer_name ?? item.customerName,
  customerPhone: item.customer_phone ?? item.customerPhone,
  discountAmount: item.discount_amount ?? item.discountAmount,
  taxAmount: item.tax_amount ?? item.taxAmount,
  billDiscountValue: item.bill_discount_value ?? item.billDiscountValue,
  billDiscountType: item.bill_discount_type ?? item.billDiscountType,
  paymentMethod: item.payment_method ?? item.paymentMethod,
  cardDetails: item.card_details ?? item.cardDetails,
  receiptNumber: item.receipt_number ?? item.receiptNumber,
  receivedAmount: item.received_amount ?? item.receivedAmount,
  changeAmount: item.change_amount ?? item.changeAmount,
  salesmanId: item.salesman_id ?? item.salesmanId,
  salesmanName: item.salesman_name ?? item.salesmanName,
  appliedDiscounts: item.applied_discounts ?? item.appliedDiscounts,
  freeGifts: item.free_gifts ?? item.freeGifts,
  saleDate: item.sale_date ?? item.saleDate,
  saleType: item.sale_type ?? item.saleType,
  extraCharges: item.extra_charges ?? item.extraCharges,
  splitPayments: item.split_payments ?? item.splitPayments,
  deletedAt: item.deleted_at ?? item.deletedAt,
  total: item.total ? Number(item.total) : 0,
  subtotal: item.subtotal ? Number(item.subtotal) : 0,
  estoreStatus: item.estore_status ?? item.estoreStatus,
  deliveryAddress: item.delivery_address ?? item.deliveryAddress,
  deliveryFee: item.delivery_fee ? Number(item.delivery_fee) : (item.deliveryFee ? Number(item.deliveryFee) : 0),
  deliveryLocationLat: item.delivery_location_lat ?? item.deliveryLocationLat,
  deliveryLocationLng: item.delivery_location_lng ?? item.deliveryLocationLng,
  customerNotes: item.customer_notes ?? item.customerNotes,
  timestamp: item.timestamp ? new Date(item.timestamp) : new Date(),
  createdAt: item.created_at ? new Date(item.created_at) : new Date(item.createdAt),
  updatedAt: item.updated_at ? new Date(item.updated_at) : new Date(item.updatedAt)
});

export const mapUser = (item: any): User => ({
  ...item,
  canEditPrice: item.can_edit_price ?? item.canEditPrice,
  canGiveDiscount: item.can_give_discount ?? item.canGiveDiscount,
  canDeleteSale: item.can_delete_sale ?? item.canDeleteSale,
  canViewProfit: item.can_view_profit ?? item.canViewProfit,
  canManageStock: item.can_manage_stock ?? item.canManageStock,
  canManagePO: item.can_manage_po ?? item.canManagePO,
  canViewRecords: item.can_view_records ?? item.canViewRecords,
  canEditSale: item.can_edit_sale ?? item.canEditSale ?? false,
  lastLogin: item.last_login ? new Date(item.last_login) : (item.lastLogin ? new Date(item.lastLogin) : undefined),
  offlineHash: item.offline_hash ?? item.offlineHash,
  createdAt: item.created_at ? new Date(item.created_at) : new Date(item.createdAt),
  updatedAt: item.updated_at ? new Date(item.updated_at) : new Date(item.updatedAt)
});

export const mapSettings = (item: any): AppSettings => {
  if (!item) return null as any;
  const s = item;
  return {
    id: s.id || SETTINGS_ID,
    // Core Identity
    storeName: s.store_name !== undefined ? s.store_name : s.storeName,
    storeAddress: s.store_address !== undefined ? s.store_address : s.storeAddress,
    storePhone: s.store_phone !== undefined ? s.store_phone : s.storePhone,
    storeEmail: s.store_email !== undefined ? s.store_email : s.storeEmail,
    storeLogo: s.store_logo !== undefined ? s.store_logo : s.storeLogo,
    storeWebsite: s.store_website !== undefined ? s.store_website : s.storeWebsite,

    // Finance & UI
    taxRate: s.tax_rate ?? s.taxRate ?? 0,
    currency: s.currency || 'PKR',
    interfaceMode: s.interface_mode ?? s.interfaceMode ?? 'touch',
    theme: s.theme || 'dark',

    // Receipt Settings
    receiptPaperSize: s.receipt_paper_size ?? s.receiptPaperSize ?? '80mm',
    receiptDensity: s.receipt_density ?? s.receiptDensity ?? 'normal',
    receiptHeader: s.receipt_header ?? s.receiptHeader,
    receiptFooter: s.receipt_footer ?? s.receiptFooter,
    receiptShowLogo: s.receipt_show_logo ?? s.receiptShowLogo ?? true,
    receiptShowFooter: s.receipt_show_footer ?? s.receiptShowFooter ?? true,
    receiptShowTax: s.receipt_show_tax ?? s.receiptShowTax ?? true,
    receiptShowDiscount: s.receipt_show_discount ?? s.receiptShowDiscount ?? true,
    receiptShowStoreName: s.receipt_show_store_name ?? s.receiptShowStoreName ?? true,
    receiptShowStoreAddress: s.receipt_show_store_address ?? s.receiptShowStoreAddress ?? true,
    receiptShowStorePhone: s.receipt_show_store_phone ?? s.receiptShowStorePhone ?? true,
    receiptShowStoreEmail: s.receipt_show_store_email ?? s.receiptShowStoreEmail ?? true,
    receiptShowCustomerName: s.receipt_show_customer_name ?? s.receiptShowCustomerName ?? true,
    receiptShowCustomerPhone: s.receipt_show_customer_phone ?? s.receiptShowCustomerPhone ?? true,
    receiptShowNotes: s.receipt_show_notes ?? s.receiptShowNotes ?? true,
    receiptShowDeliveryAddress: s.receipt_show_delivery_address ?? s.receiptShowDeliveryAddress ?? true,
    receiptShowQrCode: s.receipt_show_qr_code ?? s.receiptShowQrCode ?? true,
    receiptShowBarcode: s.receipt_show_barcode ?? s.receiptShowBarcode ?? true,
    receiptTemplate: s.receipt_template ?? s.receiptTemplate ?? 'modern',
    receiptFontScale: s.receipt_font_scale ?? s.receiptFontScale ?? 1.0,
    receiptFontBold: s.receipt_font_bold ?? s.receiptFontBold ?? false,
    receiptFontWeight: s.receipt_font_weight ?? s.receiptFontWeight ?? 400,

    // Receipt Calibration
    receiptPaddingTop: s.receipt_padding_top ?? s.receiptPaddingTop ?? 0,
    receiptPaddingBottom: s.receipt_padding_bottom ?? s.receiptPaddingBottom ?? 0,
    receiptPaddingLeft: s.receipt_padding_left ?? s.receiptPaddingLeft ?? 0,
    receiptPaddingRight: s.receipt_padding_right ?? s.receiptPaddingRight ?? 0,
    receiptOffsetX: s.receipt_offset_x ?? s.receiptOffsetX ?? 0,
    receiptHeaderOffsetX: s.receipt_header_offset_x ?? s.receiptHeaderOffsetX ?? 0,
    receiptFooterOffsetX: s.receipt_footer_offset_x ?? s.receiptFooterOffsetX ?? 0,

    // Barcode Settings
    barcodePaperSize: s.barcode_paper_size ?? s.barcodePaperSize ?? 'A4',
    barcodeA4Columns: s.barcode_a4_columns ?? s.barcodeA4Columns ?? 3,
    barcodeA4Rows: s.barcode_a4_rows ?? s.barcodeA4Rows ?? 10,
    barcodeShowPrice: s.barcode_show_price ?? s.barcodeShowPrice ?? true,
    barcodeShowName: s.barcode_show_name ?? s.barcodeShowName ?? true,
    barcodeShowSku: s.barcode_show_sku ?? s.barcodeShowSku ?? false,
    barcodeShowCategory: s.barcode_show_category ?? s.barcodeShowCategory ?? false,
    barcodeScale: s.barcode_scale ?? s.barcodeScale ?? 1.0,
    barcodeHeight: s.barcode_height ?? s.barcodeHeight ?? 30,
    barcodePadding: s.barcode_padding ?? s.barcodePadding ?? 8,
    barcodeBorder: s.barcode_border ?? s.barcodeBorder ?? true,
    barcodeType: s.barcode_type ?? s.barcodeType ?? 'BARCODE',
    barcodeNameLines: s.barcode_name_lines ?? s.barcodeNameLines ?? 1,
    barcodeFontSize: s.barcode_font_size ?? s.barcodeFontSize ?? 8,
    barcodeContentScale: Number(s.barcode_content_scale ?? s.barcodeContentScale ?? 1.0),
    barcodeMarginX: Number(s.barcode_margin_x ?? s.barcodeMarginX ?? 0),
    barcodeMarginY: Number(s.barcode_margin_y ?? s.barcodeMarginY ?? 0),
    barcodeGapX: Number(s.barcode_gap_x ?? s.barcodeGapX ?? 0),
    barcodeGapY: Number(s.barcode_gap_y ?? s.barcodeGapY ?? 0),
    barcodeBarWidth: Number(s.barcode_bar_width ?? s.barcodeBarWidth ?? 0.8),

    // Toggles & System
    retailEnabled: s.retail_enabled ?? s.retailEnabled ?? true,
    wholesaleEnabled: s.wholesale_enabled ?? s.wholesaleEnabled ?? false,
    estoreEnabled: s.estore_enabled ?? s.estoreEnabled ?? false,
    estoreThemeColor: s.estore_theme_color ?? s.estoreThemeColor ?? '#10b981',
    estorePrimaryColorHover: s.estore_primary_color_hover ?? s.estorePrimaryColorHover ?? '#059669',
    estoreBgColor: s.estore_bg_color ?? s.estoreBgColor ?? '#f9fafb',
    estoreTextColor: s.estore_text_color ?? s.estoreTextColor ?? '#111827',
    estoreCardBgColor: s.estore_card_bg_color ?? s.estoreCardBgColor ?? '#ffffff',
    estoreOrderTimerEnabled: s.estore_order_timer_enabled ?? s.estoreOrderTimerEnabled ?? false,
    estoreOrderTimerMinutes: s.estore_order_timer_minutes ?? s.estoreOrderTimerMinutes ?? 30,
    estoreDeliveryFee: s.estore_delivery_fee ?? s.estoreDeliveryFee ?? 0,
    estoreMinOrder: s.estore_min_order ?? s.estoreMinOrder ?? 0,
    estoreCodEnabled: s.estore_cod_enabled ?? s.estoreCodEnabled ?? true,
    estoreCustomPaymentEnabled: s.estore_custom_payment_enabled ?? s.estoreCustomPaymentEnabled ?? false,
    estoreCustomPaymentName: s.estore_custom_payment_name ?? s.estoreCustomPaymentName ?? '',
    estoreCustomPaymentDetail: s.estore_custom_payment_detail ?? s.estoreCustomPaymentDetail ?? '',
    estoreCustomPaymentNote: s.estore_custom_payment_note ?? s.estoreCustomPaymentNote ?? '',
    estoreLocationLat: s.estore_location_lat ?? s.estoreLocationLat,
    estoreLocationLng: s.estore_location_lng ?? s.estoreLocationLng,
    estoreDeliveryRadius: s.estore_delivery_radius ?? s.estoreDeliveryRadius ?? 5,
    estoreWhatsappEnabled: s.estore_whatsapp_enabled ?? s.estoreWhatsappEnabled ?? false,
    estoreWhatsappNumber: s.estore_whatsapp_number ?? s.estoreWhatsappNumber,
    estorePickupEnabled: s.estore_pickup_enabled ?? s.estorePickupEnabled ?? true,
    estoreDeliveryEnabled: s.estore_delivery_enabled ?? s.estoreDeliveryEnabled ?? true,
    storeType: s.store_type ?? s.storeType ?? 'both',
    storeLatitude: s.store_latitude ?? s.storeLatitude,
    storeLongitude: s.store_longitude ?? s.storeLongitude,
    shopOpenTime: s.shop_open_time ?? s.shopOpenTime,
    shopCloseTime: s.shop_close_time ?? s.shopCloseTime,
    deliveryStartTime: s.delivery_start_time ?? s.deliveryStartTime,
    deliveryEndTime: s.delivery_end_time ?? s.deliveryEndTime,
    pickupStartTime: s.pickup_start_time ?? s.pickupStartTime,
    pickupEndTime: s.pickup_end_time ?? s.pickupEndTime,
    defaultSaleType: s.default_sale_type ?? s.defaultSaleType ?? 'retail',
    language: s.language ?? s.language ?? 'en',
    touchKeyboardEnabled: s.touch_keyboard_enabled ?? s.touchKeyboardEnabled ?? false,
    soundEnabled: s.sound_enabled ?? s.soundEnabled ?? true,
    autoBackup: s.auto_backup ?? s.autoBackup ?? true,
    receiptPrinter: s.receipt_printer ?? s.receiptPrinter ?? false,

    invoicePrefix: s.invoice_prefix ?? s.invoicePrefix ?? 'INV',
    invoiceCounter: s.invoice_counter ?? s.invoiceCounter ?? 1000,

    country: s.country ?? s.country ?? 'PK',
    taxId: s.tax_id ?? s.taxId,
    businessType: s.business_type ?? s.businessType ?? 'general',

    // Offline & Sync
    offlineMode: s.offline_mode ?? s.offlineMode ?? true,
    autoSync: s.auto_sync ?? s.autoSync ?? true,

    // SaaS
    subscriptionTier: s.subscription_tier ?? s.subscriptionTier ?? 'free',
    isLocked: s.is_locked ?? s.isLocked ?? false,
    aiV2Enabled: s.ai_v2_enabled ?? s.aiV2Enabled ?? false,
    posGridColumns: s.pos_grid_columns ?? s.posGridColumns ?? 4,
    enableSplitPayment: s.enable_split_payment ?? s.enableSplitPayment ?? false,
    enableExtraCharges: s.enable_extra_charges ?? s.enableExtraCharges ?? false,
    enableKotPrinter: s.enable_kot_printer ?? s.enableKotPrinter ?? false,
    autoSaveReceiptPng: s.auto_save_receipt_png ?? s.autoSaveReceiptPng ?? false,

    // §4.2 MASTER: negative stock control (default true = current behavior)
    allowNegativeStock: s.allow_negative_stock ?? s.allowNegativeStock ?? true,

    createdAt: s.created_at ? new Date(s.created_at) : (s.createdAt ? new Date(s.createdAt) : new Date()),
    updatedAt: s.updated_at ? new Date(s.updated_at) : (s.updatedAt ? new Date(s.updatedAt) : new Date())
  } as AppSettings;
};

export const toRemoteSettings = (s: Partial<AppSettings>) => {
  const remote: any = {};

  // Mapping logic: Send ONLY snake_case to Supabase to prevent 400 errors
  // for columns that do not exist in camelCase format.

  if ('storeName' in s) { remote.store_name = s.storeName ?? null; }
  if ('storeAddress' in s) { remote.store_address = s.storeAddress ?? null; }
  if ('storePhone' in s) { remote.store_phone = s.storePhone ?? null; }
  if ('storeEmail' in s) { remote.store_email = s.storeEmail ?? null; }
  if ('storeLogo' in s) { remote.store_logo = s.storeLogo ?? null; }
  if ('storeWebsite' in s) { remote.store_website = s.storeWebsite ?? null; }

  if ('taxRate' in s) { remote.tax_rate = s.taxRate; }
  if ('currency' in s) { remote.currency = s.currency; }
  if ('interfaceMode' in s) { remote.interface_mode = s.interfaceMode; }
  if ('theme' in s) { remote.theme = s.theme; }
  if ('autoBackup' in s) { remote.auto_backup = s.autoBackup; }
  if ('receiptPrinter' in s) { remote.receipt_printer = s.receiptPrinter; }
  if ('invoicePrefix' in s) { remote.invoice_prefix = s.invoicePrefix; }
  if ('invoiceCounter' in s) { remote.invoice_counter = s.invoiceCounter; }

  if ('receiptPaperSize' in s) { remote.receipt_paper_size = s.receiptPaperSize; }
  if ('receiptDensity' in s) { remote.receipt_density = s.receiptDensity; }
  if ('receiptTemplate' in s) { remote.receipt_template = s.receiptTemplate; }
  if ('receiptHeader' in s) { remote.receipt_header = s.receiptHeader ?? null; }
  if ('receiptFooter' in s) { remote.receipt_footer = s.receiptFooter ?? null; }

  if ('receiptShowLogo' in s) { remote.receipt_show_logo = s.receiptShowLogo; }
  if ('receiptShowFooter' in s) { remote.receipt_show_footer = s.receiptShowFooter; }
  if ('receiptShowTax' in s) { remote.receipt_show_tax = s.receiptShowTax; }
  if ('receiptShowDiscount' in s) { remote.receipt_show_discount = s.receiptShowDiscount; }
  if ('receiptShowStoreName' in s) { remote.receipt_show_store_name = s.receiptShowStoreName; }
  if ('receiptShowStoreAddress' in s) { remote.receipt_show_store_address = s.receiptShowStoreAddress; }
  if ('receiptShowStorePhone' in s) { remote.receipt_show_store_phone = s.receiptShowStorePhone; }
  if ('receiptShowStoreEmail' in s) { remote.receipt_show_store_email = s.receiptShowStoreEmail; }
  if ('receiptShowCustomerName' in s) { remote.receipt_show_customer_name = s.receiptShowCustomerName; }
  if ('receiptShowCustomerPhone' in s) { remote.receipt_show_customer_phone = s.receiptShowCustomerPhone; }
  if ('receiptShowNotes' in s) { remote.receipt_show_notes = s.receiptShowNotes; }
  if ('receiptShowDeliveryAddress' in s) { remote.receipt_show_delivery_address = s.receiptShowDeliveryAddress; }
  if ('receiptShowQrCode' in s) { remote.receipt_show_qr_code = s.receiptShowQrCode; }

  if ('receiptFontScale' in s) { remote.receipt_font_scale = s.receiptFontScale; }
  if ('receiptFontBold' in s) { remote.receipt_font_bold = s.receiptFontBold; }
  if ('receiptFontWeight' in s) { remote.receipt_font_weight = String(s.receiptFontWeight); }

  if ('receiptPaddingTop' in s) { remote.receipt_padding_top = s.receiptPaddingTop; }
  if ('receiptPaddingBottom' in s) { remote.receipt_padding_bottom = s.receiptPaddingBottom; }
  if ('receiptPaddingLeft' in s) { remote.receipt_padding_left = s.receiptPaddingLeft; }
  if ('receiptPaddingRight' in s) { remote.receipt_padding_right = s.receiptPaddingRight; }
  if ('receiptOffsetX' in s) { remote.receipt_offset_x = s.receiptOffsetX; }
  if ('receiptHeaderOffsetX' in s) { remote.receipt_header_offset_x = s.receiptHeaderOffsetX; }
  if ('receiptFooterOffsetX' in s) { remote.receipt_footer_offset_x = s.receiptFooterOffsetX; }

  if ('barcodePaperSize' in s) { remote.barcode_paper_size = s.barcodePaperSize; }
  if ('barcodeA4Columns' in s) { remote.barcode_a4_columns = s.barcodeA4Columns; }
  if ('barcodeA4Rows' in s) { remote.barcode_a4_rows = s.barcodeA4Rows; }
  if ('barcodeShowPrice' in s) { remote.barcode_show_price = s.barcodeShowPrice; }
  if ('barcodeShowName' in s) { remote.barcode_show_name = s.barcodeShowName; }
  if ('barcodeShowSku' in s) { remote.barcode_show_sku = s.barcodeShowSku; }
  if ('barcodeShowCategory' in s) { remote.barcode_show_category = s.barcodeShowCategory; }
  if ('barcodeScale' in s) { remote.barcode_scale = s.barcodeScale; }
  if ('barcodeHeight' in s) { remote.barcode_height = s.barcodeHeight; }
  if ('barcodePadding' in s) { remote.barcode_padding = s.barcodePadding; }
  if ('barcodeBorder' in s) { remote.barcode_border = s.barcodeBorder; }
  if ('barcodeType' in s) { remote.barcode_type = s.barcodeType; }
  if ('barcodeNameLines' in s) { remote.barcode_name_lines = s.barcodeNameLines; }
  if ('barcodeFontSize' in s) { remote.barcode_font_size = s.barcodeFontSize; }
  if ('barcodeContentScale' in s) { remote.barcode_content_scale = s.barcodeContentScale; }
  if ('barcodeMarginX' in s) { remote.barcode_margin_x = s.barcodeMarginX; }
  if ('barcodeMarginY' in s) { remote.barcode_margin_y = s.barcodeMarginY; }
  if ('barcodeGapX' in s) { remote.barcode_gap_x = s.barcodeGapX; }
  if ('barcodeGapY' in s) { remote.barcode_gap_y = s.barcodeGapY; }

  if ('retailEnabled' in s) { remote.retail_enabled = s.retailEnabled; }
  if ('wholesaleEnabled' in s) { remote.wholesale_enabled = s.wholesaleEnabled; }
  if ('estoreEnabled' in s) { remote.estore_enabled = s.estoreEnabled; }
  if ('estoreThemeColor' in s) { remote.estore_theme_color = s.estoreThemeColor; }
  if ('estorePrimaryColorHover' in s) { remote.estore_primary_color_hover = s.estorePrimaryColorHover; }
  if ('estoreBgColor' in s) { remote.estore_bg_color = s.estoreBgColor; }
  if ('estoreTextColor' in s) { remote.estore_text_color = s.estoreTextColor; }
  if ('estoreCardBgColor' in s) { remote.estore_card_bg_color = s.estoreCardBgColor; }
  if ('estoreOrderTimerEnabled' in s) { remote.estore_order_timer_enabled = s.estoreOrderTimerEnabled; }
  if ('estoreOrderTimerMinutes' in s) { remote.estore_order_timer_minutes = s.estoreOrderTimerMinutes; }
  if ('estoreDeliveryFee' in s) {
    remote.estore_delivery_fee = s.estoreDeliveryFee === '' || s.estoreDeliveryFee === null || s.estoreDeliveryFee === undefined ? 0 : Number(s.estoreDeliveryFee);
  }
  if ('estoreMinOrder' in s) {
    remote.estore_min_order = s.estoreMinOrder === '' || s.estoreMinOrder === null || s.estoreMinOrder === undefined ? 0 : Number(s.estoreMinOrder);
  }
  if ('estoreCodEnabled' in s) { remote.estore_cod_enabled = s.estoreCodEnabled; }
  if ('estoreCustomPaymentEnabled' in s) { remote.estore_custom_payment_enabled = s.estoreCustomPaymentEnabled; }
  if ('estoreCustomPaymentName' in s) { remote.estore_custom_payment_name = s.estoreCustomPaymentName; }
  if ('estoreCustomPaymentDetail' in s) { remote.estore_custom_payment_detail = s.estoreCustomPaymentDetail; }
  if ('estoreCustomPaymentNote' in s) { remote.estore_custom_payment_note = s.estoreCustomPaymentNote; }
  if ('estoreLocationLat' in s) {
    remote.estore_location_lat = s.estoreLocationLat === '' || s.estoreLocationLat === null || s.estoreLocationLat === undefined ? null : Number(s.estoreLocationLat);
  }
  if ('estoreLocationLng' in s) {
    remote.estore_location_lng = s.estoreLocationLng === '' || s.estoreLocationLng === null || s.estoreLocationLng === undefined ? null : Number(s.estoreLocationLng);
  }
  if ('estoreDeliveryRadius' in s) {
    remote.estore_delivery_radius = s.estoreDeliveryRadius === '' || s.estoreDeliveryRadius === null || s.estoreDeliveryRadius === undefined ? null : Number(s.estoreDeliveryRadius);
  }
  if ('estoreWhatsappEnabled' in s) { remote.estore_whatsapp_enabled = s.estoreWhatsappEnabled; }
  if ('estoreWhatsappNumber' in s) { remote.estore_whatsapp_number = s.estoreWhatsappNumber; }
  if ('estorePickupEnabled' in s) { remote.estore_pickup_enabled = s.estorePickupEnabled; }
  if ('estoreDeliveryEnabled' in s) { remote.estore_delivery_enabled = s.estoreDeliveryEnabled; }
  if ('storeType' in s) { remote.store_type = s.storeType; }
  if ('storeLatitude' in s) { remote.store_latitude = s.storeLatitude === '' || s.storeLatitude === null || s.storeLatitude === undefined ? null : Number(s.storeLatitude); }
  if ('storeLongitude' in s) { remote.store_longitude = s.storeLongitude === '' || s.storeLongitude === null || s.storeLongitude === undefined ? null : Number(s.storeLongitude); }
  if ('shopOpenTime' in s) { remote.shop_open_time = s.shopOpenTime || null; }
  if ('shopCloseTime' in s) { remote.shop_close_time = s.shopCloseTime || null; }
  if ('deliveryStartTime' in s) { remote.delivery_start_time = s.deliveryStartTime || null; }
  if ('deliveryEndTime' in s) { remote.delivery_end_time = s.deliveryEndTime || null; }
  if ('pickupStartTime' in s) { remote.pickup_start_time = s.pickupStartTime || null; }
  if ('pickupEndTime' in s) { remote.pickup_end_time = s.pickupEndTime || null; }
  if ('defaultSaleType' in s) { remote.default_sale_type = s.defaultSaleType; }
  if ('language' in s) { remote.language = s.language; }

  if ('touchKeyboardEnabled' in s) { remote.touch_keyboard_enabled = s.touchKeyboardEnabled; }
  if ('soundEnabled' in s) { remote.sound_enabled = s.soundEnabled; }
  if ('offlineMode' in s) { remote.offline_mode = s.offlineMode; }
  if ('autoSync' in s) { remote.auto_sync = s.autoSync; }
  if ('country' in s) { remote.country = s.country; }
  if ('taxId' in s) { remote.tax_id = s.taxId ?? null; }
  if ('businessType' in s) { remote.business_type = s.businessType; }
  if ('subscriptionTier' in s) { remote.subscription_tier = s.subscriptionTier; }
  if ('isLocked' in s) { remote.is_locked = s.isLocked; }
  if ('aiV2Enabled' in s) { remote.ai_v2_enabled = s.aiV2Enabled; }
  if ('posGridColumns' in s) { remote.pos_grid_columns = s.posGridColumns; }
  if ('enableSplitPayment' in s) { remote.enable_split_payment = s.enableSplitPayment; }
  if ('enableExtraCharges' in s) { remote.enable_extra_charges = s.enableExtraCharges; }
  if ('enableKotPrinter' in s) { remote.enable_kot_printer = s.enableKotPrinter; }
  if ('autoSaveReceiptPng' in s) { remote.auto_save_receipt_png = s.autoSaveReceiptPng; }
  if ('allowNegativeStock' in s) { remote.allow_negative_stock = s.allowNegativeStock; }

  if ('updatedAt' in s) {
    remote.updated_at = s.updatedAt instanceof Date ? s.updatedAt.toISOString() : s.updatedAt;
  }

  return remote;
};

export const mapExpense = (item: any): Expense => ({
  ...item,
  paymentMethod: item.payment_method ?? item.paymentMethod,
  amount: item.amount ? Number(item.amount) : 0,
  date: item.date ? new Date(item.date) : new Date(),
  storeType: item.store_type ?? item.storeType,
  addedBy: item.added_by ?? item.addedBy,
  createdAt: item.created_at ? new Date(item.created_at) : new Date(item.createdAt),
  updatedAt: item.updated_at ? new Date(item.updated_at) : new Date(item.updatedAt)
});

export const mapStockHistory = (item: any): StockHistory => ({
  ...item,
  productId: item.product_id ?? item.productId,
  changeQty: item.change_qty ?? item.changeQty,
  referenceId: item.reference_id ?? item.referenceId,
  balanceAfter: item.balance_after ?? item.balanceAfter,
  cashierId: item.cashier_id ?? item.cashierId,
  cashierName: item.cashier_name ?? item.cashierName,
  createdAt: item.created_at ? new Date(item.created_at) : new Date(item.createdAt),
});



export const mapVariantStockHistory = (item: any): VariantStockHistory => ({
  ...item,
  productId: item.product_id ?? item.productId,
  variantId: item.variant_id ?? item.variantId,
  variantLabel: item.variant_label ?? item.variantLabel,
  changeQty: item.change_qty ?? item.changeQty,
  referenceId: item.reference_id ?? item.referenceId,
  balanceAfter: item.balance_after ?? item.balanceAfter,
  cashierName: item.cashier_name ?? item.cashierName,
  createdAt: item.created_at ? new Date(item.created_at) : new Date(item.createdAt),
});

export const toRemoteVariantStockHistory = (h: any) => {
  const remote: any = { ...h };
  if ('productId' in h) { remote.product_id = h.productId; delete remote.productId; }
  if ('variantId' in h) { remote.variant_id = h.variantId; delete remote.variantId; }
  if ('variantLabel' in h) { remote.variant_label = h.variantLabel; delete remote.variantLabel; }
  if ('changeQty' in h) { remote.change_qty = h.changeQty; delete remote.changeQty; }
  if ('referenceId' in h) { remote.reference_id = h.referenceId; delete remote.referenceId; }
  if ('balanceAfter' in h) { remote.balance_after = h.balanceAfter; delete remote.balanceAfter; }
  if ('cashierName' in h) { remote.cashier_name = h.cashierName; delete remote.cashierName; }
  if ('createdAt' in h) { remote.created_at = h.createdAt instanceof Date ? h.createdAt.toISOString() : h.createdAt; delete remote.createdAt; }
  return remote;
};

export const mapProductAddon = (item: any): ProductAddon => ({
  ...item,
  productId: item.product_id ?? item.productId,
  addonProductId: item.addon_product_id ?? item.addonProductId,
  maxQty: item.max_qty ?? item.maxQty,
  createdAt: item.created_at ? new Date(item.created_at) : new Date(item.createdAt),
});

export const toRemoteProductAddon = (a: any) => {
  const remote: any = { ...a };
  if ('productId' in a) { remote.product_id = a.productId; delete remote.productId; }
  if ('addonProductId' in a) { remote.addon_product_id = a.addonProductId; delete remote.addonProductId; }
  if ('maxQty' in a) { remote.max_qty = a.maxQty; delete remote.maxQty; }
  if ('createdAt' in a) { remote.created_at = a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt; delete remote.createdAt; }
  return remote;
};

export const mapDiscount = (item: any): Discount => ({
  ...item,
  validFrom: item.valid_from ? new Date(item.valid_from) : new Date(item.validFrom),
  validTo: item.valid_to ? new Date(item.valid_to) : new Date(item.validTo),
  validDays: item.valid_days ?? item.validDays,
  isAutoApply: item.is_auto_apply ?? item.isAutoApply,
  createdAt: item.created_at ? new Date(item.created_at) : new Date(item.createdAt),
  updatedAt: item.updated_at ? new Date(item.updated_at) : new Date(item.updatedAt)
});

export const mapPurchaseRecord = (item: any): PurchaseRecord => ({
  ...item,
  productId: item.product_id ?? item.productId,
  supplierId: item.supplier_id ?? item.supplierId,
  variantId: item.variant_id ?? item.variantId,
  variantLabel: item.variant_label ?? item.variantLabel,
  costPrice: item.cost_price ? Number(item.cost_price) : 0,
  qtyRemaining: item.qty_remaining ?? item.qtyRemaining,
  date: item.date ? new Date(item.date) : new Date(),
  createdAt: item.created_at ? new Date(item.created_at) : new Date(item.createdAt),
  updatedAt: item.updated_at ? new Date(item.updated_at) : new Date(item.updatedAt)
});

// mapProductBatch removed — batch system deprecated
// toRemoteProductBatch removed — batch system deprecated

/**
 * REVERSE MAPPERS: CamelCase (Frontend) -> snake_case (Remote DB)
 */

export const toRemoteProduct = (p: Partial<Product>) => {
  const remote: any = { ...p };
  if ('barcodeValue' in p) { remote.barcode_value = p.barcodeValue; delete remote.barcodeValue; }
  if ('isWeightBased' in p) { remote.is_weight_based = p.isWeightBased; delete remote.isWeightBased; }
  if ('pricePerUnit' in p) { remote.price_per_unit = p.pricePerUnit; delete remote.pricePerUnit; }
  if ('trackInventory' in p) { remote.track_inventory = p.trackInventory; delete remote.trackInventory; }
  if ('isFeatured' in p) { remote.is_featured = p.isFeatured; delete remote.isFeatured; }
  if ('minStock' in p) { remote.min_stock = p.minStock; delete remote.minStock; }
  if ('targetStock' in p) { remote.target_stock = p.targetStock; delete remote.targetStock; }
  if ('parentCategoryId' in p) { remote.parent_category_id = p.parentCategoryId; delete remote.parentCategoryId; }
  if ('productAddons' in p) { delete remote.productAddons; }
  if ('createdAt' in p) { remote.created_at = p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt; delete remote.createdAt; }
  if ('updatedAt' in p) { remote.updated_at = p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt; delete remote.updatedAt; }
  if ('isService' in p) { remote.is_service = p.isService; delete remote.isService; }
  if ('requireSerial' in p) { remote.require_serial = p.requireSerial; delete remote.requireSerial; }
  if ('showInEstore' in p) { remote.show_in_estore = p.showInEstore; delete remote.showInEstore; }
  if ('estoreSortOrder' in p) { remote.estore_sort_order = p.estoreSortOrder; delete remote.estoreSortOrder; }
  if ('estoreCategorySortOrder' in p) { remote.estore_category_sort_order = p.estoreCategorySortOrder; delete remote.estoreCategorySortOrder; }
  if ('variantData' in p) { remote.variant_data = p.variantData; delete remote.variantData; }
  if ('menuNumber' in p) { remote.menu_number = p.menuNumber; delete remote.menuNumber; }
  if ('productType' in p) { remote.product_type = p.productType; delete remote.productType; }
  if ('parentId' in p) { remote.parent_id = p.parentId; delete remote.parentId; }
  if ('highlightTag' in p) { remote.highlight_tag = p.highlightTag; delete remote.highlightTag; }
  delete remote.batches;
  delete remote.product_batches;
  delete remote.productBatches;

  // Enforce NOT NULL constraint for sku
  if (!remote.sku) {
    remote.sku = p.id || remote.id || remote.barcode_value || `SKU-${Date.now()}`;
  }

  return remote;
};


export const toRemoteCustomer = (c: Partial<Customer>) => {
  const remote: any = { ...c };
  if ('priceTier' in c) { remote.price_tier = c.priceTier; delete remote.priceTier; }
  if ('totalPurchases' in c) { remote.total_purchases = c.totalPurchases; delete remote.totalPurchases; }
  if ('lastPurchase' in c) { remote.last_purchase = c.lastPurchase instanceof Date ? c.lastPurchase.toISOString() : c.lastPurchase; delete remote.lastPurchase; }
  if ('preferredCategories' in c) { remote.preferred_categories = c.preferredCategories; delete remote.preferredCategories; }
  if ('createdAt' in c) { remote.created_at = c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt; delete remote.createdAt; }
  if ('updatedAt' in c) { remote.updated_at = c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt; delete remote.updatedAt; }
  return remote;
};


export const toRemoteSupplier = (s: Partial<Supplier>) => {
  const remote: any = { ...s };
  if ('paymentTerms' in s) { remote.payment_terms = s.paymentTerms; delete remote.paymentTerms; }
  if ('openingBalance' in s) { remote.opening_balance = s.openingBalance; delete remote.openingBalance; }
  if ('businessType' in s) { remote.business_type = s.businessType; delete remote.businessType; }
  if ('createdAt' in s) { remote.created_at = s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt; delete remote.createdAt; }
  if ('updatedAt' in s) { remote.updated_at = s.updatedAt instanceof Date ? s.updatedAt.toISOString() : s.updatedAt; delete remote.updatedAt; }
  return remote;
};


export const toRemoteExpense = (e: Partial<Expense>) => {
  const remote: any = { ...e };
  if ('paymentMethod' in e) { remote.payment_method = e.paymentMethod; delete remote.paymentMethod; }
  if ('storeType' in e) { remote.store_type = e.storeType; delete remote.storeType; }
  if ('addedBy' in e) { remote.added_by = (e as any).addedBy; delete remote.addedBy; }
  if ('isManualOverride' in e) { remote.is_manual_override = e.isManualOverride; delete remote.isManualOverride; }
  if ('overrideBy' in e) { remote.override_by = e.overrideBy; delete remote.overrideBy; }
  if ('createdAt' in e) { remote.created_at = e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt; delete remote.createdAt; }
  if ('updatedAt' in e) { remote.updated_at = e.updatedAt instanceof Date ? e.updatedAt.toISOString() : e.updatedAt; delete remote.updatedAt; }
  return remote;
};




export const toRemoteSupplierTransaction = (t: any) => {
  const remote: any = { ...t };
  if ('id' in t && t.id) remote.id = t.id;
  if ('supplierId' in t && t.supplierId !== undefined) remote.supplier_id = t.supplierId;
  if ('type' in t && t.type !== undefined) remote.type = t.type;
  if ('sourceType' in t && t.sourceType !== undefined) remote.source_type = t.sourceType;
  if ('amount' in t && t.amount !== undefined) remote.amount = t.amount;
  if ('referenceId' in t && t.referenceId !== undefined) remote.reference_id = t.referenceId;
  if ('referenceType' in t && t.referenceType !== undefined) remote.reference_type = t.referenceType;
  if ('note' in t && t.note !== undefined) remote.note = t.note;
  if ('balanceAfter' in t && t.balanceAfter !== undefined) remote.balance_after = t.balanceAfter;
  if ('isManualOverride' in t && t.isManualOverride !== undefined) remote.is_manual_override = t.isManualOverride;
  if ('overrideBy' in t && t.overrideBy !== undefined) remote.override_by = t.overrideBy;
  if ('createdAt' in t && t.createdAt !== undefined) remote.created_at = t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt;
  if ('updatedAt' in t && t.updatedAt !== undefined) remote.updated_at = t.updatedAt instanceof Date ? t.updatedAt.toISOString() : t.updatedAt;
  return remote;
};


export const toRemotePurchaseRecord = (r: any) => {
  const remote: any = { ...r };
  if ('productId' in r) { remote.product_id = r.productId; delete remote.productId; }
  if ('productName' in r) { remote.product_name = r.productName; delete remote.productName; }
  if ('supplierId' in r) { remote.supplier_id = r.supplierId; delete remote.supplierId; }
  if ('variantId' in r) { remote.variant_id = r.variantId; delete remote.variantId; }
  if ('variantLabel' in r) { remote.variant_label = r.variantLabel; delete remote.variantLabel; }
  if ('costPrice' in r) { remote.cost_price = r.costPrice; delete remote.costPrice; }
  if ('retailPrice' in r) { remote.retail_price = r.retailPrice; delete remote.retailPrice; }
  if ('totalAmount' in r) { remote.total_amount = r.totalAmount; delete remote.totalAmount; }
  if ('addedBy' in r) { remote.added_by = r.addedBy; delete remote.addedBy; }
  if ('qtyRemaining' in r) { remote.qty_remaining = r.qtyRemaining; delete remote.qtyRemaining; }
  if ('date' in r) { remote.date = r.date instanceof Date ? r.date.toISOString() : r.date; delete remote.date; }
  if ('createdAt' in r) { remote.created_at = r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt; delete remote.createdAt; }
  if ('updatedAt' in r) { remote.updated_at = r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt; delete remote.updatedAt; }
  return remote;
};


// toRemoteProductBatch removed — batch system deprecated


export const toRemoteSale = (s: Partial<Sale>) => {
  const remote: any = { ...s };
  if ('sourceOrderId' in s) { remote.source_order_id = s.sourceOrderId; delete remote.sourceOrderId; }
  if ('invoiceNumber' in s) { remote.invoice_number = s.invoiceNumber; delete remote.invoiceNumber; }
  if ('customerId' in s) { remote.customer_id = s.customerId; delete remote.customerId; }
  if ('customerName' in s) { remote.customer_name = s.customerName; delete remote.customerName; }
  if ('customerPhone' in s) { remote.customer_phone = s.customerPhone; delete remote.customerPhone; }
  if ('discountAmount' in s) { remote.discount_amount = s.discountAmount; delete remote.discountAmount; }
  if ('taxAmount' in s) { remote.tax_amount = s.taxAmount; delete remote.taxAmount; }
  if ('paymentMethod' in s) { remote.payment_method = s.paymentMethod; delete remote.paymentMethod; }
  if ('cardDetails' in s) { remote.card_details = s.cardDetails; delete remote.cardDetails; }
  if ('receiptNumber' in s) { remote.receipt_number = s.receiptNumber; delete remote.receiptNumber; }
  if ('receivedAmount' in s) { remote.received_amount = s.receivedAmount; delete remote.receivedAmount; }
  if ('changeAmount' in s) { remote.change_amount = s.changeAmount; delete remote.changeAmount; }
  if ('salesmanId' in s) { remote.salesman_id = s.salesmanId; delete remote.salesmanId; }
  if ('salesmanName' in s) { remote.salesman_name = s.salesmanName; delete remote.salesmanName; }
  if ('appliedDiscounts' in s) { remote.applied_discounts = s.appliedDiscounts; delete remote.appliedDiscounts; }
  if ('freeGifts' in s) { remote.free_gifts = s.freeGifts; delete remote.freeGifts; }
  if ('saleDate' in s) { remote.sale_date = s.saleDate; delete remote.saleDate; }
  if ('saleType' in s) { remote.sale_type = s.saleType; delete remote.saleType; }
  if ('billDiscountValue' in s) { remote.bill_discount_value = s.billDiscountValue; delete remote.billDiscountValue; }
  if ('billDiscountType' in s) { remote.bill_discount_type = s.billDiscountType; delete remote.billDiscountType; }
  if ('extraCharges' in s) { remote.extra_charges = s.extraCharges; delete remote.extraCharges; }
  if ('splitPayments' in s) { remote.split_payments = s.splitPayments; delete remote.splitPayments; }
  if ('deletedAt' in s) { remote.deleted_at = s.deletedAt; delete remote.deletedAt; }
  if ('estoreStatus' in s) { remote.estore_status = s.estoreStatus; delete remote.estoreStatus; }
  if ('deliveryAddress' in s) { remote.delivery_address = s.deliveryAddress; delete remote.deliveryAddress; }
  if ('deliveryFee' in s) { remote.delivery_fee = s.deliveryFee; delete remote.deliveryFee; }
  if ('deliveryLocationLat' in s) { remote.delivery_location_lat = s.deliveryLocationLat; delete remote.deliveryLocationLat; }
  if ('deliveryLocationLng' in s) { remote.delivery_location_lng = s.deliveryLocationLng; delete remote.deliveryLocationLng; }
  if ('customerNotes' in s) { remote.customer_notes = s.customerNotes; delete remote.customerNotes; }
  if ('salesmanId' in s) { remote.salesman_id = s.salesmanId; delete remote.salesmanId; }
  if ('salesmanName' in s) { remote.salesman_name = s.salesmanName; delete remote.salesmanName; }
  if ('cashierRole' in s) { remote.cashier_role = s.cashierRole; delete remote.cashierRole; }
  if ('createdAt' in s) { remote.created_at = s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt; delete remote.createdAt; }
  if ('updatedAt' in s) { remote.updated_at = s.updatedAt instanceof Date ? s.updatedAt.toISOString() : s.updatedAt; delete remote.updatedAt; }
  if ('timestamp' in s) {
    remote.timestamp = s.timestamp instanceof Date ? s.timestamp.toISOString() : s.timestamp;
  }
  return remote;
};


export const toRemoteStockHistory = (h: any) => {
  const remote: any = { ...h };
  if ('productId' in h) { remote.product_id = h.productId; delete remote.productId; }
  if ('changeQty' in h) { remote.change_qty = h.changeQty; delete remote.changeQty; }
  if ('referenceId' in h) { remote.reference_id = h.referenceId; delete remote.referenceId; }
  if ('balanceAfter' in h) { remote.balance_after = h.balanceAfter; delete remote.balanceAfter; }
  if ('createdAt' in h) { remote.created_at = h.createdAt instanceof Date ? h.createdAt.toISOString() : h.createdAt; delete remote.createdAt; }
  if ('cashierId' in h) { remote.cashier_id = h.cashierId; delete remote.cashierId; }
  if ('cashierName' in h) { remote.cashier_name = h.cashierName; delete remote.cashierName; }
  // Strip bad properties
  if ('note' in h) { remote.note = h.note; delete remote.note; } else if ('notes' in h) { remote.note = h.notes; delete remote.notes; }
  if ('quantity' in remote) { if (!remote.change_qty) remote.change_qty = remote.quantity; delete remote.quantity; }
  if ('newStock' in remote) { if (!remote.balance_after) remote.balance_after = remote.newStock; delete remote.newStock; }
  if ('previousStock' in remote) delete remote.previousStock;
  delete remote.wasOversold; // local-only flag, not a DB column
  return remote;
};

export const toRemotePayment = (p: any) => {
  const remote: any = {};
  if ('id' in p) remote.id = p.id;
  if ('customerId' in p) remote.customer_id = p.customerId;
  if ('customer_id' in p) remote.customer_id = p.customer_id;
  if ('supplierId' in p) remote.supplier_id = p.supplierId;
  if ('supplier_id' in p) remote.supplier_id = p.supplier_id;
  if ('amount' in p) remote.amount = Number(p.amount);
  if ('method' in p) remote.payment_type = p.method;
  if ('paymentType' in p) remote.payment_type = p.paymentType;
  if ('payment_type' in p) remote.payment_type = p.payment_type;
  if ('notes' in p) remote.note = p.notes;
  if ('note' in p) remote.note = p.note;

  if ('direction' in p) {
    remote.direction = p.direction;
  } else if (p.customerId || p.customer_id) {
    remote.direction = 'in';
  } else if (p.supplierId || p.supplier_id) {
    remote.direction = 'out';
  }

  if ('createdAt' in p) {
    remote.created_at = p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt;
  } else if ('created_at' in p) {
    remote.created_at = p.created_at instanceof Date ? p.created_at.toISOString() : p.created_at;
  }
  return remote;
};

export const mapPayment = (item: any): any => ({
  id: item.id,
  customerId: item.customer_id ?? item.customerId,
  supplierId: item.supplier_id ?? item.supplierId,
  amount: Number(item.amount),
  method: item.payment_type ?? item.method ?? item.paymentType,
  paymentType: item.payment_type ?? item.paymentType ?? item.method,
  direction: item.direction,
  notes: item.note ?? item.notes,
  note: item.note ?? item.notes,
  createdAt: item.created_at ? new Date(item.created_at) : (item.createdAt ? new Date(item.createdAt) : new Date())
});


/**
 * Products Service
 * Reads from Dexie, Writes to Dexie + Queues for Supabase
 */
// ════════════════════════════════════════════════════════════════
// PAYMENT MODES / WALLETS  (per-method authoritative balances)
// ════════════════════════════════════════════════════════════════
export const DEFAULT_PAYMENT_MODES = [
  { id: 'cash', name: 'Cash', icon: 'cash', isActive: true },
  { id: 'card', name: 'Card', icon: 'credit-card', isActive: true },
  { id: 'online', name: 'Online Wallet', icon: 'globe', isActive: true },
];

/** Normalize legacy 'digital'/'wallet' methods to 'online' wallet. */
export const normalizePaymentMethod = (m: string): string => (m === 'digital' || m === 'wallet' ? 'online' : m);

export const mapPaymentMode = (item: any) => ({
  id: item.id,
  name: item.name,
  icon: item.icon,
  balance: Number(item.balance || 0),
  isActive: item.is_active ?? item.isActive ?? true,
  updatedAt: item.updated_at ? new Date(item.updated_at) : new Date(),
});

export const toRemotePaymentMode = (m: any) => ({
  id: m.id,
  name: m.name,
  icon: m.icon,
  balance: m.balance,
  is_active: m.isActive ?? true,
  updated_at: m.updatedAt instanceof Date ? m.updatedAt.toISOString() : m.updatedAt,
});

/** Idempotent seed: ensures default wallets exist locally + in cloud, and
 *  removes legacy/extra modes (e.g. 'wallet') merging any balance into 'online'. */
export const seedPaymentModes = async () => {
  const defaultIds = new Set(DEFAULT_PAYMENT_MODES.map(m => m.id));
  const existing = await localDb.paymentModes.toArray();
  const existingIds = new Set(existing.map((m: any) => m.id));
  for (const m of DEFAULT_PAYMENT_MODES) {
    if (!existingIds.has(m.id)) {
      await localDb.paymentModes.put({ ...m, balance: 0, updatedAt: new Date() });
    } else {
      // Reconcile display name (e.g. 'Online' → 'Online Wallet') without touching balance
      const cur = existing.find((x: any) => x.id === m.id);
      if (cur && cur.name !== m.name) {
        await localDb.paymentModes.update(m.id, { name: m.name, updatedAt: new Date() });
      }
    }
  }
  // Cleanup legacy modes (transfer any balance → online, then delete)
  for (const m of existing) {
    if (!defaultIds.has(m.id)) {
      const bal = Number(m.balance || 0);
      if (bal !== 0) {
        const onlineMode = await localDb.paymentModes.get('online');
        if (onlineMode) {
          await localDb.paymentModes.update('online', {
            balance: Number(onlineMode.balance || 0) + bal,
            updatedAt: new Date(),
          });
        }
      }
      await localDb.paymentModes.delete(m.id);
    }
  }
  try {
    if (typeof navigator === 'undefined' || navigator.onLine) {
      const cloud = await localDb.paymentModes.toArray();
      await supabase.from('payment_modes').upsert(cloud.map(toRemotePaymentMode), { onConflict: 'id', ignoreDuplicates: true });
      const legacy = existing.filter(m => !defaultIds.has(m.id)).map((m: any) => m.id);
      if (legacy.length) {
        await supabase.from('payment_modes').delete().in('id', legacy);
      }
    } else {
      for (const m of await localDb.paymentModes.toArray()) {
        await queueOp('payment_modes', 'upsert', m.id, toRemotePaymentMode(m));
      }
    }
  } catch (e) { console.warn('[paymentModes] cloud seed failed', e); }
};

export const getPaymentModes = async () => {
  const modes = await localDb.paymentModes.toArray();
  if (modes.length === 0) { await seedPaymentModes(); return localDb.paymentModes.toArray(); }
  return modes;
};

/**
 * Atomically adjust per-method wallet balances.
 * moves: { id, modeId, delta, referenceId?, note? }
 * - Optimistically updates local Dexie (instant UI).
 * - Online: applies via idempotent RPC (payment_movements ledger).
 * - Offline/failed: queued for syncEngine to flush via the same RPC.
 */
export const adjustPaymentBalances = async (moves: any[], opts?: any) => {
  if (!moves || moves.length === 0) return;
  for (const mv of moves) {
    const mode = await localDb.paymentModes.get(mv.modeId);
    if (mode) {
      await localDb.paymentModes.update(mv.modeId, {
        balance: Number(mode.balance || 0) + Number(mv.delta),
        updatedAt: new Date(),
      });
    }
  }
  const remoteMoves = moves.map(mv => ({
    id: mv.id || generateId(),
    mode_id: mv.modeId,
    delta: Number(mv.delta),
    reference_id: mv.referenceId || null,
    note: mv.note || null,
  }));
  const online = typeof navigator === 'undefined' || navigator.onLine;
  if (online) {
    try {
      await supabase.rpc('apply_payment_movements', { p_moves: remoteMoves as any });
      return;
    } catch (e) { console.warn('[paymentModes] rpc failed, queueing', e); }
  }
  await queueOp('payment_movements', 'apply', opts?.batchId || generateId(), remoteMoves, opts);
};

/** Build wallet moves for a completed sale (handles split + single method). */
export const buildSalePaymentMoves = (sale: any): any[] => {
  const ref = sale.id;
  if (sale.paymentMethod === 'split' && sale.splitPayments?.length) {
    return sale.splitPayments.map((p: any) => ({
      id: generateId(),
      modeId: normalizePaymentMethod(p.method),
      delta: Number(p.amount || 0),
      referenceId: ref,
      note: `Sale ${sale.invoiceNumber || ref}`,
    }));
  }
  return [{
    id: generateId(),
    modeId: normalizePaymentMethod(sale.paymentMethod),
    delta: Number(sale.total || 0),
    referenceId: ref,
    note: `Sale ${sale.invoiceNumber || ref}`,
  }];
};

/** Build reverse wallet moves (used on refund / delete). */
export const buildReversePaymentMoves = (sale: any, ratio = 1): any[] => {
  const ref = sale.id;
  if (sale.paymentMethod === 'split' && sale.splitPayments?.length) {
    return sale.splitPayments.map((p: any) => ({
      id: generateId(),
      modeId: normalizePaymentMethod(p.method),
      delta: -Number(p.amount || 0) * ratio,
      referenceId: ref,
      note: `Reverse ${sale.invoiceNumber || ref}`,
    }));
  }
  return [{
    id: generateId(),
    modeId: normalizePaymentMethod(sale.paymentMethod),
    delta: -Number(sale.total || 0) * ratio,
    referenceId: ref,
    note: `Reverse ${sale.invoiceNumber || ref}`,
  }];
};

export const productsService = {
  async getAll(): Promise<Product[]> {
    const items = await localDb.products.toArray();
    return items.sort((a, b) => a.name.localeCompare(b.name));
  },

  async fetchRemote(lastSyncTime?: Date): Promise<Product[]> {
    const queryFn = () => {
      let q = supabase.from('products').select('*');
      if (lastSyncTime) q = q.gte('updated_at', lastSyncTime.toISOString());
      return q;
    };
    const data = await fetchAllPages(queryFn);
    return data.map(mapProduct);
  },

  async getById(id: string): Promise<Product | null> {
    return await localDb.products.get(id) || null;
  },

  async create(product: Omit<Product, 'id'>): Promise<Product> {
    // DUPLICATE PREVENTION (RULE F1) — check Supabase before any local write
    let existing = null;
    if (navigator.onLine) {
      try {
        const { data } = await supabase
          .from('products')
          .select('id, name, stock')
          .ilike('name', product.name.trim())
          .maybeSingle();
        existing = data;
      } catch (err) {
        console.warn('[ProductsService] Supabase duplicate check failed, checking local database:', err);
      }
    }

    if (!existing) {
      // Fallback: Check local IndexedDB database for duplicate name (case-insensitive)
      const localExisting = await localDb.products
        .filter(p => p.name.trim().toLowerCase() === product.name.trim().toLowerCase())
        .first();

      if (localExisting) {
        existing = {
          id: localExisting.id,
          name: localExisting.name,
          stock: localExisting.stock
        };
      }
    }

    if (existing) {
      throw new Error(
        `Product "${product.name}" already exists (ID: ${existing.id}, Stock: ${existing.stock}). ` +
        `Update its stock instead of creating a duplicate.`
      );
    }

    // DUPLICATE BARCODE PREVENTION (RULE F1) — a duplicate barcode causes a 23505
    // unique-constraint failure on sync, which would block the product from ever
    // reaching the cloud. Guard both remote and local.
    if (product.barcode && product.barcode.trim()) {
      const bc = product.barcode.trim();
      if (navigator.onLine) {
        try {
          const { data: barcodeDup } = await supabase
            .from('products')
            .select('id, name, barcode')
            .eq('barcode', bc)
            .maybeSingle();
          if (barcodeDup) {
            throw new Error(
              `Barcode "${bc}" already assigned to product "${barcodeDup.name}". Use a unique barcode.`
            );
          }
        } catch (err: any) {
          if (err?.message?.includes('already assigned')) throw err;
          console.warn('[ProductsService] Barcode duplicate check failed:', err);
        }
      }
      const localDup = await localDb.products
        .filter(p => p.barcode && p.barcode.trim().toLowerCase() === bc.toLowerCase())
        .first();
      if (localDup) {
        throw new Error(
          `Barcode "${bc}" already assigned to product "${localDup.name}". Use a unique barcode.`
        );
      }
    }

    const id = generateId();
    const now = new Date();
    const barcodeVal = product.barcodeValue || product.barcode || generateBarcodeValue(product.name || id);

    const newProduct = {
      ...product,
      id,
      barcodeValue: barcodeVal,
      barcode: barcodeVal,
      batches: [],
      createdAt: now,
      updatedAt: now
    } as Product;

    // 1. Local Write
    await localDb.products.add(newProduct);

    // 2. Queue Parent Product FIRST (to satisfy FK constraints in cloud)
    // STRIP stock ONLY when an 'initial' history entry will apply it via trigger
    // (absolute stock + trigger insert would double-count). Non-tracked products
    // (no history entry) must keep their absolute stock value (999999 infinity mode).
    const remoteCreateProduct = toRemoteProduct(newProduct);
    if (product.trackInventory && product.stock > 0) {
      delete remoteCreateProduct.stock;
    }
    await queueOp('products', 'create', id, remoteCreateProduct);

    // 3. Queue History (if tracking enabled)
    if (product.trackInventory && product.stock > 0) {
      const initialQty = Number(product.stock) || 0;

      // Also log stock history
      const logId = generateId();
      const stockLog = {
        id: logId,
        productId: id,
        type: 'initial',
        changeQty: initialQty,
        balanceAfter: initialQty,
        referenceId: generateId(),
        note: 'Initial opening stock',
        createdAt: now
      };
      await localDb.stockHistory.add(stockLog as any);
      await queueOp('stock_history', 'create', logId, toRemoteStockHistory(stockLog));
    }

    // 4. Create child variations if productType is 'variable'
    if (newProduct.productType === 'variable' && newProduct.variantData && newProduct.variantData.length > 0) {
      for (const vd of newProduct.variantData) {
        const childId = (vd.id && vd.id.length > 10) ? vd.id : generateId();
        const childName = `${newProduct.name} - ${vd.option1}${vd.option2 ? ` / ${vd.option2}` : ''}`;

        // Prevent duplicate child creation error
        const existingChild = await localDb.products.where('name').equalsIgnoreCase(childName.trim()).first();

        if (!existingChild) {
          const childProduct: Product = {
            ...newProduct,
            id: childId,
            name: childName,
            sku: vd.barcode || `${newProduct.sku}-${childId.substring(0, 4)}`,
            barcode: vd.barcode || undefined,
            barcodeValue: vd.barcode || undefined,
            productType: 'variation',
            parentId: id,
            price: vd.priceOverride ?? newProduct.price,
            cost: vd.cost ?? newProduct.cost,
            stock: vd.stock ?? 0,
            variants: [],
            variantData: [],
            modifiers: [],
            productAddons: [],
            batches: [],
            trackInventory: true
          };

          await productsService.create(childProduct);
        }
      }
    }

    return newProduct;
  },

  async update(id: string, updates: Partial<Product>): Promise<Product> {
    const existing = await localDb.products.get(id);
    if (!existing) throw new Error('Product not found');

    const now = new Date();
    const updated = { ...existing, ...updates, updatedAt: now };

    // Keep LOCAL stock (scalar + per-variant) intact. Stock is ledger-driven via
    // stock_history / variant_stock_history triggers on the CLOUD, and the remote
    // payload below is already stripped of stock (remotePayload.stock / remoteV.stock
    // deleted), so the cloud ledger stays authoritative while the local cache keeps
    // its real on-device count (fixes A2: local stock was being wiped to undefined).

    // 1. Local Update
    await localDb.products.put(updated);

    // 2. Queue for Sync — send FULL product except stock (stock is handled by stock_history triggers)
    const remotePayload = toRemoteProduct(updated);
    delete remotePayload.stock;
    delete remotePayload.variant_data; // Let variant_stock_history triggers handle variant stock

    // We must re-include variant_data WITHOUT stock fields if we want to sync other variant properties (like price/cost)
    if (updated.variantData) {
      remotePayload.variant_data = updated.variantData.map(v => {
        const remoteV = { ...v };
        delete remoteV.stock; // strip stock to prevent overwriting trigger
        return remoteV;
      });
    }

    await queueOp('products', 'update', id, remotePayload);

    // 3. Update/Create child variations if productType is 'variable'
    if (updated.productType === 'variable' && updated.variantData) {
      const existingChildren = await localDb.products.where('parentId').equals(id).toArray();
      const childNamesKeep = new Set();

      for (const vd of updated.variantData) {
        const childName = `${updated.name} - ${vd.option1}${vd.option2 ? ` / ${vd.option2}` : ''}`;
        childNamesKeep.add(childName);

        // Find existing child by ID or Name
        const existingChild = existingChildren.find(c => c.id === vd.id || c.name === childName);

        if (existingChild) {
          // Update child (don't override stock directly here, stock is managed by stock history)
          await productsService.update(existingChild.id, {
            name: childName,
            sku: vd.barcode || existingChild.sku,
            barcode: vd.barcode || existingChild.barcode,
            barcodeValue: vd.barcode || existingChild.barcodeValue,
            price: vd.priceOverride ?? updated.price,
            cost: vd.cost ?? updated.cost,
            trackInventory: true
          });
        } else {
          // Create new child
          const childId = (vd.id && vd.id.length > 10) ? vd.id : generateId();
          const childProduct: Product = {
            ...updated,
            id: childId,
            name: childName,
            sku: vd.barcode || `${updated.sku}-${childId.substring(0, 4)}`,
            barcode: vd.barcode || undefined,
            barcodeValue: vd.barcode || undefined,
            productType: 'variation',
            parentId: id,
            price: vd.priceOverride ?? updated.price,
            cost: vd.cost ?? updated.cost,
            stock: vd.stock ?? 0,
            variants: [],
            variantData: [],
            modifiers: [],
            productAddons: [],
            batches: [],
            trackInventory: true
          };

          await productsService.create(childProduct);
        }
      }

      // Delete removed variations
      for (const child of existingChildren) {
        if (!childNamesKeep.has(child.name)) {
          await productsService.delete(child.id);
        }
      }
    }

    return updated;
  },

  async delete(id: string): Promise<void> {
    await localDb.productBatches.where('productId').equals(id).delete();
    await localDb.stockHistory.where('productId').equals(id).delete();
    await localDb.productAddons.where('productId').equals(id).delete();
    await localDb.productAddons.where('addonProductId').equals(id).delete();
    await localDb.products.delete(id);
    queueOp('products', 'delete', id, {});
  },

  async bulkDelete(ids: string[]): Promise<void> {
    for (const id of ids) {
      await localDb.productBatches.where('productId').equals(id).delete();
      await localDb.stockHistory.where('productId').equals(id).delete();
      await localDb.productAddons.where('productId').equals(id).delete();
      await localDb.productAddons.where('addonProductId').equals(id).delete();
    }
    await localDb.products.bulkDelete(ids);
    for (const id of ids) {
      queueOp('products', 'delete', id, {});
    }
  },

  async bulkUpdate(ids: string[], updates: Partial<Product>): Promise<void> {
    const now = new Date();

    // Log per-product price-change history if price is being changed
    if (updates.price !== undefined) {
      const products = await localDb.products.where('id').anyOf(ids).toArray();
      for (const product of products) {
        if (product.price !== updates.price) {
          const histId = generateId();
          const histEntry = {
            id: histId,
            productId: product.id,
            changeQty: 0,
            type: 'adjustment' as const,
            note: `Batch Price Change: ${product.price} → ${updates.price}`,
            balanceAfter: product.stock || 0,
            cashierName: 'Bulk Edit',
            createdAt: now
          };
          await localDb.stockHistory.add(histEntry);
          await queueOp('stock_history', 'create', histId, toRemoteStockHistory(histEntry));
        }
      }
    }

    await localDb.products.where('id').anyOf(ids).modify({ ...updates, updatedAt: now });
    for (const id of ids) {
      await queueOp('products', 'update', id, toRemoteProduct({ ...updates, updatedAt: now }));
    }
  },

  async adjustStock(id: string, delta: number, note: string = 'Adjustment'): Promise<void> {
    const product = await localDb.products.get(id);
    if (!product) return;

    const newStock = (product.stock || 0) + delta;
    const now = new Date();

    await localDb.products.put({ ...product, stock: newStock, updatedAt: now });
    // STRIP stock — cloud stock is updated ONLY via stock_history trigger (avoids double-count)
    const remoteAdjustPayload = toRemoteProduct({ stock: newStock, updatedAt: now });
    delete remoteAdjustPayload.stock;
    await queueOp('products', 'update', id, remoteAdjustPayload);

    const histId = generateId();
    const historyEntry = {
      id: histId,
      productId: id,
      changeQty: delta,
      type: 'adjustment',
      note,
      balanceAfter: newStock,
      createdAt: now
    };
    await localDb.stockHistory.add(historyEntry);
    await queueOp('stock_history', 'create', histId, toRemoteStockHistory(historyEntry));
  }
};

/**
 * Customers Service
 */
export const customersService = {
  async getAll(): Promise<Customer[]> {
    return await localDb.customers.toArray();
  },

  async fetchRemote(lastSyncTime?: Date): Promise<Customer[]> {
    const queryFn = () => {
      let q = supabase.from('customers').select('*');
      if (lastSyncTime) q = q.gte('updated_at', lastSyncTime.toISOString());
      return q;
    };
    const data = await fetchAllPages(queryFn);
    return data.map(mapCustomer);
  },

  async create(customer: Omit<Customer, 'id'>): Promise<Customer> {
    const id = generateId();
    const now = new Date();
    const newCustomer = { ...customer, id, createdAt: now } as Customer;

    await localDb.customers.add(newCustomer);
    await queueOp('customers', 'create', id, toRemoteCustomer(newCustomer));

    return newCustomer;
  },

  async update(id: string, updates: Partial<Customer>): Promise<Customer> {
    const existing = await localDb.customers.get(id);
    if (!existing) throw new Error('Customer not found');

    const updated = { ...existing, ...updates, updatedAt: new Date() };
    await localDb.customers.put(updated);
    await queueOp('customers', 'update', id, toRemoteCustomer({ ...updates, updatedAt: updated.updatedAt }));

    return updated;
  },

  async delete(id: string): Promise<void> {
    await localDb.customers.delete(id);
    queueOp('customers', 'delete', id, {});
  },

  async getCustomerPayments(customerId: string): Promise<any[]> {
    const all = await localDb.payments.toArray();
    return all
      .map(mapPayment)
      .filter((p: any) => p.customerId === customerId)
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
};

export const salesmenService = {
  async getAll() {
    return await localDb.salesmen.toArray();
  },
  async fetchRemote(lastSyncTime?: Date): Promise<any[]> {
    const queryFn = () => {
      let q = supabase.from('salesmen').select('*');
      if (lastSyncTime) q = q.gte('updated_at', lastSyncTime.toISOString());
      return q;
    };
    const data = await fetchAllPages(queryFn);
    return data.map(mapSalesman);
  },
  async create(salesman: any) {
    const id = generateId();
    const newSalesman = {
      ...salesman,
      id,
      active: salesman.active ?? true,
      createdAt: new Date(),
    };
    const remote = {
      id,
      name: salesman.name,
      phone: salesman.phone,
      active: salesman.active,
      created_at: newSalesman.createdAt.toISOString()
    };
    await localDb.salesmen.put(newSalesman);
    await queueOp('salesmen', 'create', id, remote);
    return newSalesman;
  },
  async update(id: string, updates: any) {
    const remote: any = {};
    if ('name' in updates) remote.name = updates.name;
    if ('phone' in updates) remote.phone = updates.phone;
    if ('active' in updates) remote.active = updates.active;

    await localDb.salesmen.update(id, { ...updates, updatedAt: new Date() });
    await queueOp('salesmen', 'update', id, remote);
    const updated = await localDb.salesmen.get(id);
    return updated;
  },
  async delete(id: string) {
    await localDb.salesmen.delete(id);
    await queueOp('salesmen', 'delete', id, {});
  }
};

/**
 * Users Service
 */
export const usersService = {
  async getAll(): Promise<User[]> {
    return await localDb.users.toArray();
  },

  async fetchRemote(lastSyncTime?: Date): Promise<User[]> {
    const queryFn = () => {
      let q = supabase.from('users').select('*');
      if (lastSyncTime) q = q.gte('updated_at', lastSyncTime.toISOString());
      return q;
    };
    const data = await fetchAllPages(queryFn);
    return data.map(mapUser);
  },

  async update(id: string, updates: Partial<User>): Promise<User> {
    const existing = await localDb.users.get(id);
    if (!existing) throw new Error('User not found');

    const updated = { ...existing, ...updates, updatedAt: new Date() };
    await localDb.users.put(updated);

    const syncPayload: any = {
      id: updated.id,
      username: updated.username || updated.email?.split('@')[0] || 'user',
      name: updated.name || 'Unknown',
      email: updated.email,
      role: updated.role,
      active: updated.active,
      permissions: updated.permissions,
      can_edit_price: updated.canEditPrice,
      can_give_discount: updated.canGiveDiscount,
      can_delete_sale: updated.canDeleteSale,
      can_view_profit: updated.canViewProfit,
      can_manage_stock: updated.canManageStock,
      can_manage_po: updated.canManagePO,
      can_view_records: updated.canViewRecords,
      can_edit_sale: updated.canEditSale,
      avatar: updated.avatar || null,
      updated_at: new Date().toISOString()
    };

    await queueOp('users', 'update', id, syncPayload);
    return updated;
  },

  async delete(id: string): Promise<void> {
    await localDb.users.delete(id);
    queueOp('users', 'delete', id, {});
    // Also remove the underlying auth user so a "deleted" login can never be used again.
    // Routed through the server-side admin-users Edge Function (key never in browser).
    try {
      await adminUserAction('deleteUser', { id });
    } catch (err) {
      console.warn('[usersService] Could not delete auth user via edge function:', err);
    }
  }
};

// ── Store Order Mapper ──
export const mapStoreOrder = (item: any): StoreOrder => ({
  ...item,
  invoiceNumber: item.invoice_number ?? item.invoiceNumber,
  customerId: item.customer_id ?? item.customerId,
  customerName: item.customer_name ?? item.customerName,
  customerPhone: item.customer_phone ?? item.customerPhone,
  discountAmount: item.discount_amount ?? item.discountAmount,
  taxAmount: item.tax_amount ?? item.taxAmount,
  deliveryFee: item.delivery_fee ? Number(item.delivery_fee) : (item.deliveryFee ? Number(item.deliveryFee) : 0),
  paymentMethod: item.payment_method ?? item.paymentMethod,
  deliveryAddress: item.delivery_address ?? item.deliveryAddress,
  deliveryLocationLat: item.delivery_location_lat ?? item.deliveryLocationLat,
  deliveryLocationLng: item.delivery_location_lng ?? item.deliveryLocationLng,
  customerNotes: item.customer_notes ?? item.customerNotes,
  fulfilledSaleId: item.fulfilled_sale_id ?? item.fulfilledSaleId,
  total: item.total ? Number(item.total) : 0,
  subtotal: item.subtotal ? Number(item.subtotal) : 0,
  createdAt: item.created_at ? new Date(item.created_at) : new Date(item.createdAt),
  updatedAt: item.updated_at ? new Date(item.updated_at) : new Date(item.updatedAt)
});

export const toRemoteStoreOrder = (s: Partial<StoreOrder>) => {
  const remote: any = { ...s };
  if ('invoiceNumber' in s) { remote.invoice_number = s.invoiceNumber; delete remote.invoiceNumber; }
  if ('customerId' in s) { remote.customer_id = s.customerId; delete remote.customerId; }
  if ('customerName' in s) { remote.customer_name = s.customerName; delete remote.customerName; }
  if ('customerPhone' in s) { remote.customer_phone = s.customerPhone; delete remote.customerPhone; }
  if ('discountAmount' in s) { remote.discount_amount = s.discountAmount; delete remote.discountAmount; }
  if ('taxAmount' in s) { remote.tax_amount = s.taxAmount; delete remote.taxAmount; }
  if ('deliveryFee' in s) { remote.delivery_fee = s.deliveryFee; delete remote.deliveryFee; }
  if ('paymentMethod' in s) { remote.payment_method = s.paymentMethod; delete remote.paymentMethod; }
  if ('deliveryAddress' in s) { remote.delivery_address = s.deliveryAddress; delete remote.deliveryAddress; }
  if ('deliveryLocationLat' in s) { remote.delivery_location_lat = s.deliveryLocationLat; delete remote.deliveryLocationLat; }
  if ('deliveryLocationLng' in s) { remote.delivery_location_lng = s.deliveryLocationLng; delete remote.deliveryLocationLng; }
  if ('customerNotes' in s) { remote.customer_notes = s.customerNotes; delete remote.customerNotes; }
  if ('fulfilledSaleId' in s) { remote.fulfilled_sale_id = s.fulfilledSaleId; delete remote.fulfilledSaleId; }
  if ('createdAt' in s) { remote.created_at = s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt; delete remote.createdAt; }
  if ('updatedAt' in s) { remote.updated_at = s.updatedAt instanceof Date ? s.updatedAt.toISOString() : s.updatedAt; delete remote.updatedAt; }
  return remote;
};

/**
 * Store Orders Service
 */
export const storeOrdersService = {
  async getAll(): Promise<StoreOrder[]> {
    const orders = await localDb.storeOrders.toArray();
    return orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async fetchRemote(lastSyncTime?: Date): Promise<StoreOrder[]> {
    if (lastSyncTime) {
      const queryFn = () => supabase.from('store_orders').select('*').gte('updated_at', lastSyncTime.toISOString());
      const data = await fetchAllPages(queryFn);
      return data.map(mapStoreOrder);
    } else {
      const queryFn = () => supabase.from('store_orders').select('*').order('created_at', { ascending: false });
      const data = await fetchAllPages(queryFn);
      return data.map(mapStoreOrder);
    }
  },

  async create(order: Omit<StoreOrder, 'id'>): Promise<StoreOrder> {
    const id = crypto.randomUUID();
    const newOrder = { ...order, id, createdAt: new Date(), updatedAt: new Date() } as StoreOrder;
    await localDb.storeOrders.add(newOrder);
    await queueOp('store_orders', 'create', id, toRemoteStoreOrder(newOrder));
    return newOrder;
  },

  async update(id: string, updates: Partial<StoreOrder>): Promise<StoreOrder> {
    const existing = await localDb.storeOrders.get(id);
    if (!existing) throw new Error('Store order not found');
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    await localDb.storeOrders.put(updated);
    await queueOp('store_orders', 'update', id, toRemoteStoreOrder(updated));
    return updated;
  },

  async delete(id: string): Promise<void> {
    await localDb.storeOrders.delete(id);
    await queueOp('store_orders', 'delete', id, {});
  },
};


/**
 * Sales Service
 * Implements atomic-like stock logic and local-first persistence
 */
export const salesService = {
  async getAll(): Promise<Sale[]> {
    const sales = await localDb.sales.filter(s => s.status !== 'deleted').toArray();
    return sales.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  },

  async fetchRemote(lastSyncTime?: Date): Promise<Sale[]> {
    if (lastSyncTime) {
      const queryFn = () => supabase
        .from('sales')
        .select('*')
        .is('deleted_at', null)
        .gte('updated_at', lastSyncTime.toISOString());
      const data = await fetchAllPages(queryFn);
      return data.map(mapSale);
    } else {
      // FULL pull. sales is the heavy table (45MB — items jsonb ~35KB/row), so
      // paginate in SMALL pages (200): a 1000-row page = ~35MB single response
      // → PostgREST statement timeout (57014 "canceling statement due to
      // statement timeout", 8s Supabase default).
      // Exclude soft-deleted sales (deleted_at set) — they are audit-only rows
      // and must never re-surface locally (tombstones remove them too).
      const queryFn = () => supabase
        .from('sales')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      const data = await fetchAllPages(queryFn, 200);
      return (data || []).map(mapSale);
    }
  },

  async searchSales(filters: {
    startDate?: Date,
    endDate?: Date,
    invoiceNumber?: string,
    customerId?: string,
    paymentMethod?: string,
    status?: string,
    cashier?: string,
    salesman?: string,
    saleType?: string
  }): Promise<Sale[]> {
    try {
      let query = supabase
        .from('sales')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters.startDate) query = query.gte('created_at', filters.startDate.toISOString());
      if (filters.endDate) query = query.lte('created_at', filters.endDate.toISOString());
      if (filters.invoiceNumber) {
        query = query.or(`invoice_number.ilike.%${filters.invoiceNumber}%,receipt_number.ilike.%${filters.invoiceNumber}%,customer_name.ilike.%${filters.invoiceNumber}%`);
      }
      if (filters.customerId) query = query.eq('customer_id', filters.customerId);
      if (filters.paymentMethod) query = query.eq('payment_method', filters.paymentMethod);
      if (filters.status) query = query.eq('status', filters.status);
      if (filters.cashier) query = query.eq('cashier', filters.cashier);
      if (filters.saleType) query = query.eq('sale_type', filters.saleType);
      if (filters.salesman) query = query.eq('salesman_name', filters.salesman);

      const data = await fetchAllPages(query);
      return data.map(mapSale);
    } catch (e) {
      console.warn("Cloud search failed, falling back to localDb", e);
      let sales = await localDb.sales.toArray();

      if (filters.startDate) sales = sales.filter(s => new Date(s.timestamp).getTime() >= filters.startDate!.getTime());
      if (filters.endDate) sales = sales.filter(s => new Date(s.timestamp).getTime() <= filters.endDate!.getTime());
      if (filters.invoiceNumber) {
        const query = filters.invoiceNumber.toLowerCase();
        sales = sales.filter(s =>
          (s.invoiceNumber || '').toLowerCase().includes(query) ||
          (s.receiptNumber || '').toLowerCase().includes(query) ||
          (s.customerName || '').toLowerCase().includes(query)
        );
      }
      if (filters.customerId) sales = sales.filter(s => s.customerId === filters.customerId);
      if (filters.paymentMethod) sales = sales.filter(s => s.paymentMethod === filters.paymentMethod);
      if (filters.status) sales = sales.filter(s => s.status === filters.status);
      if (filters.cashier) sales = sales.filter(s => s.cashier === filters.cashier);
      if (filters.salesman) sales = sales.filter(s => s.salesmanName === filters.salesman);
      if (filters.saleType) sales = sales.filter(s => s.saleType === filters.saleType);

      return sales.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 200);
    }
  },

  async create(sale: Omit<Sale, 'id'>): Promise<Sale> {
    if (!sale.invoiceNumber || String(sale.invoiceNumber).trim() === '' || sale.invoiceNumber === 'undefined') {
      console.error("[FATAL] Attempted to create a sale without a valid invoiceNumber:", sale);
      throw new Error("Cannot create a sale without a valid invoice number. This prevents ghost records.");
    }
    const id = generateId();
    const now = new Date();
    const newSale = {
      ...sale,
      id,
      timestamp: now,
      createdAt: now
    } as Sale;

    // We must process items FIRST to calculate true FIFO cost before saving the sale
    let anyOversold = false;
    // DRAFT RULE: pending drafts must NEVER touch stock or revenue.
    // A draft is only a saved cart — it deducts stock ONLY when it is completed.
    // ESTORE RULE (2026-08-12): an online order has NO stock effect until the
    // POS bills it. Fulfilling (creating this sale with sourceOrderId) is the
    // bill — so stock IS deducted here, exactly once, via the normal sale path.
    const isDraftSale = sale.status === 'pending' || !!sale.notes?.includes('DRAFT_SALE');
    const skipStockEffects = isDraftSale;

    // Phase 1: collect stock movements so the sale + all of them can be committed
    // to the cloud atomically via `commit_sale` (no per-op queue → no divergence).
    const movements: any[] = [];
    const historyQueue: Array<{ entity: string; histId: string; remote: any; opts: any }> = [];

    for (let i = 0; i < newSale.items.length; i++) {
      const item = newSale.items[i];
      const product = await localDb.products.get(item.product.id);

      if (product && product.trackInventory) {
        const qty = item.weight || item.quantity;
        // RULE: Allow negative stock — never block a sale on stock level
        const newStock = (product.stock || 0) - qty;
        if (newStock < 0) anyOversold = true;

        // Find variant cost fallback if applicable
        let baseCostFallback = Number(product.cost) || 0;
        if (item.selectedVariantId && product.variantData) {
          const variant = product.variantData.find(v => v.id === item.selectedVariantId);
          if (variant && variant.cost !== undefined && variant.cost > 0) {
            baseCostFallback = Number(variant.cost);
          }
        }

        // Calculate total Add-on costs
        let addonCostTotal = 0;
        if (item.addonItems && item.addonItems.length > 0) {
          for (const addonItem of item.addonItems) {
            const addonProduct = await localDb.products.get(addonItem.addon.addonProductId);
            if (addonProduct) {
              addonCostTotal += (Number(addonProduct.cost) || 0) * addonItem.quantity * Math.abs(qty);
            }
          }
        }

        // Simple cost calculation (no FIFO)
        const effectivePurchaseCost = (baseCostFallback * qty) + addonCostTotal;

        newSale.items[i] = {
          ...item,
          purchaseCost: effectivePurchaseCost,
          fifoDetails: [] // Kept for backward compatibility but always empty now
        };

        // --- STOCK DEDUCTION ---
        if (!skipStockEffects) {
          // Update Product locally (cloud is updated via stock_history trigger)
          await localDb.products.update(product.id, {
            stock: newStock,
            updatedAt: now
          });

          // Log Stock History
          const histId = generateId();
          const histEntry: StockHistory = {
            id: histId,
            productId: product.id,
            changeQty: -qty,
            type: 'sale' as const,
            referenceId: id,
            note: `Sale ${sale.invoiceNumber}`,
            balanceAfter: newStock,
            cashierName: sale.cashier || 'System',
            createdAt: now,
            ...(newStock < 0 ? { wasOversold: true } : {}),
          };
          await localDb.stockHistory.add(histEntry);
          movements.push({
            id: histId,
            product_id: product.id,
            change_qty: -qty,
            type: 'sale',
            note: `Sale ${sale.invoiceNumber}`,
            variant_id: '',
            variant_label: '',
            cashier_name: sale.cashier || 'System',
          });
          historyQueue.push({ entity: 'stock_history', histId, remote: toRemoteStockHistory(histEntry), opts: { batchId: id } });
        }

        // --- VARIANT-LEVEL STOCK DEDUCTION ---
        if (item.selectedVariantId && product.variantData) {
          const variant = product.variantData.find(v => v.id === item.selectedVariantId);
          if (variant) {
            const newVariantStock = (variant.stock || 0) - qty;

            {
              // Update local variant data (cloud handled by variant_stock_history trigger)
              const updatedVariantData = product.variantData.map(v =>
                v.id === variant.id ? { ...v, stock: newVariantStock } : v
              );

              await localDb.products.update(product.id, {
                variantData: updatedVariantData,
                updatedAt: now
              });

              // Log variant stock history
              const vHistId = generateId();
              const vHistEntry: VariantStockHistory = {
                id: vHistId,
                productId: product.id,
                variantId: item.selectedVariantId,
                variantLabel: item.selectedVariantLabel || variant.cardTitle || variant.option1,
                changeQty: -qty,
                type: 'sale',
                referenceId: id,
                note: `Sale ${sale.invoiceNumber}`,
                balanceAfter: newVariantStock,
                cashierName: sale.cashier || 'System',
                createdAt: now,
              };
              await localDb.variantStockHistory.add(vHistEntry);
              movements.push({
                id: vHistId,
                product_id: product.id,
                change_qty: -qty,
                type: 'sale',
                note: `Sale ${sale.invoiceNumber}`,
                variant_id: item.selectedVariantId,
                variant_label: item.selectedVariantLabel || variant.cardTitle || variant.option1,
                cashier_name: sale.cashier || 'System',
              });
              historyQueue.push({ entity: 'variant_stock_history', histId: vHistId, remote: toRemoteVariantStockHistory(vHistEntry), opts: { batchId: id } });
            }
          }
        }

        // --- ADD-ON STOCK DEDUCTION ---
        if (item.addonItems && item.addonItems.length > 0) {
          for (const addonItem of item.addonItems) {
            const addonProduct = await localDb.products.get(addonItem.addon.addonProductId);
            if (addonProduct && addonProduct.trackInventory) {
              const addonQty = addonItem.quantity * Math.abs(item.quantity);
              const newAddonStock = (addonProduct.stock || 0) - addonQty;

              if (!skipStockEffects) {
                await localDb.products.update(addonProduct.id, { stock: newAddonStock, updatedAt: now });

                const aHistId = generateId();
                const aHistEntry: StockHistory = {
                  id: aHistId,
                  productId: addonProduct.id,
                  changeQty: -addonQty,
                  type: 'sale',
                  referenceId: id,
                  note: `Add-on for Sale ${sale.invoiceNumber} (${addonItem.addon.name})`,
                  balanceAfter: newAddonStock,
                  cashierName: sale.cashier || 'System',
                  createdAt: now,
                };
                await localDb.stockHistory.add(aHistEntry);
                movements.push({
                  id: aHistId,
                  product_id: addonProduct.id,
                  change_qty: -addonQty,
                  type: 'sale',
                  note: `Add-on for Sale ${sale.invoiceNumber} (${addonItem.addon.name})`,
                  variant_id: '',
                  variant_label: '',
                  cashier_name: sale.cashier || 'System',
                });
                historyQueue.push({ entity: 'stock_history', histId: aHistId, remote: toRemoteStockHistory(aHistEntry), opts: { batchId: id } });
              }
            }
          }
        }
      } else if (product && !product.trackInventory) {
        // Find variant cost fallback if applicable
        let baseCostFallback = Number(product.cost) || 0;
        if (item.selectedVariantId && product.variantData) {
          const variant = product.variantData.find(v => v.id === item.selectedVariantId);
          if (variant && variant.cost !== undefined && variant.cost > 0) {
            baseCostFallback = Number(variant.cost);
          }
        }

        // Calculate total Add-on costs
        let addonCostTotal = 0;
        if (item.addonItems && item.addonItems.length > 0) {
          for (const addonItem of item.addonItems) {
            const addonProduct = await localDb.products.get(addonItem.addon.addonProductId);
            if (addonProduct) {
              addonCostTotal += (Number(addonProduct.cost) || 0) * addonItem.quantity * Math.abs(item.weight || item.quantity);
            }
          }
        }

        // Non-tracked product: still inject purchaseCost from product.cost (or variant cost) + addons for accurate reporting
        newSale.items[i] = {
          ...item,
          purchaseCost: (baseCostFallback * (item.weight || item.quantity)) + addonCostTotal,
          fifoDetails: []
        };
      }
    }

    // --- FREE GIFT STOCK DEDUCTION (A6) ---
    // Free-gift items live on sale.freeGifts (NOT sale.items), so previously they never
    // deducted stock → phantom inventory drain + profit overstated by gift cost.
    // Deduct them here and record their cost for accurate COGS reporting.
    if (!skipStockEffects && newSale.freeGifts && newSale.freeGifts.length > 0) {
      for (const gift of newSale.freeGifts) {
        const gProduct = await localDb.products.get(gift.product?.id);
        if (!gProduct || !gProduct.trackInventory) continue;
        const gQty = Math.abs(gift.quantity || 1);
        const gNewStock = (gProduct.stock || 0) - gQty;
        if (gNewStock < 0) anyOversold = true;

        (gift as any).purchaseCost = (Number(gProduct.cost) || 0) * gQty;

        await localDb.products.update(gProduct.id, { stock: gNewStock, updatedAt: now });
        const gHistId = generateId();
        const gHistEntry: StockHistory = {
          id: gHistId,
          productId: gProduct.id,
          changeQty: -gQty,
          type: 'sale' as const,
          referenceId: id,
          note: `Free Gift — Sale ${newSale.invoiceNumber}`,
          balanceAfter: gNewStock,
          cashierName: newSale.cashier || 'System',
          createdAt: now,
          ...(gNewStock < 0 ? { wasOversold: true } : {}),
        };
        await localDb.stockHistory.add(gHistEntry);
        movements.push({
          id: gHistId,
          product_id: gProduct.id,
          change_qty: -gQty,
          type: 'sale',
          note: `Free Gift — Sale ${newSale.invoiceNumber}`,
          variant_id: '',
          variant_label: '',
          cashier_name: newSale.cashier || 'System',
        });
        historyQueue.push({ entity: 'stock_history', histId: gHistId, remote: toRemoteStockHistory(gHistEntry), opts: { batchId: id } });
      }
    }

    // 1. Local Write (Now contains precise purchaseCost per item)
    await localDb.sales.add(newSale);

    // 2. Atomic cloud commit (online) OR legacy per-op queue fallback.
    // Phase 1: commit the sale + ALL stock movements in ONE transaction via the
    // `commit_sale` RPC so products.stock / variant_data can NEVER diverge from
    // sales. If the RPC succeeds, the legacy 'sales' + 'stock_history' queue ops
    // are SKIPPED (ids are idempotent, so any retry/fallback insert is ignored).
    const onlineNow = typeof navigator === 'undefined' || navigator.onLine;
    let cloudCommitted = false;
    if (onlineNow && !skipStockEffects && !isDraftSale && movements.length > 0) {
      const commitRes = await commitSaleAuthoritative(toRemoteSale(newSale), movements);
      if (commitRes && commitRes.already_fulfilled) {
        await revertLocalSaleStock(newSale.id, movements);
        cloudCommitted = true;
      } else if (commitRes) {
        cloudCommitted = true;
      }
    }
    if (!cloudCommitted) {
      await queueOp('sales', 'create', id, toRemoteSale(newSale), { batchId: id });
      for (const q of historyQueue) {
        await queueOp(q.entity, 'create', q.histId, q.remote, q.opts);
      }
    }

    // 3. Update Customer Stats if identified (NEVER for drafts — drafts are not revenue)
    if (newSale.customerId && !isDraftSale) {
      const customer = await localDb.customers.get(newSale.customerId);
      if (customer) {
        const updatedCustomer = {
          ...customer,
          totalPurchases: (customer.totalPurchases || 0) + newSale.total,
          lastPurchase: newSale.timestamp,
          updatedAt: now
        };
        await localDb.customers.put(updatedCustomer);
        await queueOp('customers', 'update', customer.id, toRemoteCustomer(updatedCustomer), { batchId: id });
      }
    }

    (newSale as any).wasOversold = anyOversold;
    return newSale;
  },

  async update(id: string, updates: Partial<Sale>): Promise<Sale> {
    const existing = await localDb.sales.get(id);
    if (!existing) throw new Error('Sale not found');

    const updated = { ...existing, ...updates, updatedAt: new Date() };
    await localDb.sales.put(updated);

    // Process status changes for stock restoration if needed
    if (updates.status === 'refunded' && existing.status !== 'refunded') {
      // Stock restoration is handled in returnSale, but this handles direct updates
    }

    await queueOp('sales', 'update', id, toRemoteSale(updated));
    return updated;
  },

  async delete(id: string, currentCashierName?: string): Promise<Product[]> {
    const sale = await localDb.sales.get(id);
    if (!sale) return [];

    const now = new Date();
    const affectedProducts: Product[] = [];

    // Phase 1: collect reverse-stock movements so they commit atomically via
    // `apply_stock_movements` (no per-op queue → no divergence on deletes/returns).
    const returnMovements: any[] = [];
    const returnQueue: Array<{ entity: string; histId: string; remote: any; opts: any }> = [];

    // 1. Reverse Stock (Only restore what has not been refunded/returned yet)
    // E-store pending sales never deducted stock initially, so we don't restore it.
    // DRAFT RULE: pending drafts never deducted stock either — deleting a draft must
    // NOT restore anything (that would create a phantom +Q in the ledger).
    const isDraftSale = sale.status === 'pending' || !!sale.notes?.includes('DRAFT_SALE');
    if (!isDraftSale && (sale.status === 'completed' || sale.status === 'partially_refunded' || sale.status === 'cancelled')) {
      for (const item of sale.items) {
        const product = await localDb.products.get(item.product.id);
        if (product && product.trackInventory) {
          const qty = (item.weight || item.quantity) - (item.refundedQuantity || 0);
          if (qty <= 0) continue;
          const newStock = (product.stock || 0) + qty;

          // Update Local Product
          await localDb.products.update(product.id, {
            stock: newStock,
            updatedAt: now
          });
          const updatedProduct = { ...product, stock: newStock, updatedAt: now };
          affectedProducts.push(updatedProduct);

          // Queue Product Sync — STRIP stock: cloud stock is updated ONLY via stock_history trigger
          // (absolute stock here would double-count with the trigger on the history insert below)
          const remoteDeleteProduct = toRemoteProduct(updatedProduct);
          delete remoteDeleteProduct.stock;
          await queueOp('products', 'update', product.id, remoteDeleteProduct);

          // Log stock restoration as 'return' (delete is treated same as return for stock)
          const histId = generateId();
          const historyEntry = {
            id: histId,
            productId: product.id,
            changeQty: qty,
            type: 'return' as const,
            referenceId: id,
            note: `Sale #${sale.invoiceNumber} Deleted`,
            balanceAfter: newStock,
            cashierName: currentCashierName || sale.cashier || 'System',
            createdAt: now
          };
          await localDb.stockHistory.add(historyEntry);
          returnMovements.push({
            id: histId,
            product_id: product.id,
            change_qty: qty,
            type: 'return',
            note: `Sale #${sale.invoiceNumber} Deleted`,
            variant_id: '',
            variant_label: '',
            cashier_name: currentCashierName || sale.cashier || 'System',
          });
          returnQueue.push({ entity: 'stock_history', histId, remote: toRemoteStockHistory(historyEntry), opts: undefined });

          // --- VARIANT-LEVEL STOCK RESTORATION (mirror of sale deduction; cloud handled by variant trigger) ---
          if (item.selectedVariantId && product.variantData) {
            const variant = product.variantData.find(v => v.id === item.selectedVariantId);
            if (variant) {
              const newVariantStock = (variant.stock || 0) + qty;
              const updatedVariantData = product.variantData.map(v =>
                v.id === variant.id ? { ...v, stock: newVariantStock } : v
              );
              await localDb.products.update(product.id, {
                variantData: updatedVariantData,
                updatedAt: now
              });
              const vHistId = generateId();
              const vHistEntry: VariantStockHistory = {
                id: vHistId,
                productId: product.id,
                variantId: item.selectedVariantId,
                variantLabel: item.selectedVariantLabel || variant.cardTitle || variant.option1,
                changeQty: qty,
                type: 'return',
                referenceId: id,
                note: `Sale #${sale.invoiceNumber} Deleted (Variant)`,
                balanceAfter: newVariantStock,
                cashierName: currentCashierName || sale.cashier || 'System',
                createdAt: now,
              };
              await localDb.variantStockHistory.add(vHistEntry);
              returnMovements.push({
                id: vHistId,
                product_id: product.id,
                change_qty: qty,
                type: 'return',
                note: `Sale #${sale.invoiceNumber} Deleted (Variant)`,
                variant_id: item.selectedVariantId,
                variant_label: item.selectedVariantLabel || variant.cardTitle || variant.option1,
                cashier_name: currentCashierName || sale.cashier || 'System',
              });
              returnQueue.push({ entity: 'variant_stock_history', histId: vHistId, remote: toRemoteVariantStockHistory(vHistEntry), opts: undefined });
            }
          }
        } else if (product) {
          affectedProducts.push(product);
        }

        // --- ADD-ON STOCK RESTORATION ---
        if (item.addonItems && item.addonItems.length > 0) {
          for (const addonItem of item.addonItems) {
            const addonProduct = await localDb.products.get(addonItem.addon.addonProductId);
            if (addonProduct && addonProduct.trackInventory) {
              const addonQty = (addonItem.quantity * item.quantity) - (item.refundedQuantity ? addonItem.quantity * item.refundedQuantity : 0);
              if (addonQty <= 0) continue;

              const newAddonStock = (addonProduct.stock || 0) + addonQty;

              await localDb.products.update(addonProduct.id, {
                stock: newAddonStock,
                updatedAt: now
              });
              const updatedAddonProduct = { ...addonProduct, stock: newAddonStock, updatedAt: now };
              affectedProducts.push(updatedAddonProduct);
              // STRIP stock — cloud stock is updated ONLY via stock_history trigger (avoids double-count)
              const remoteDeleteAddon = toRemoteProduct(updatedAddonProduct);
              delete remoteDeleteAddon.stock;
              await queueOp('products', 'update', addonProduct.id, remoteDeleteAddon);

              const aHistId = generateId();
              const aHistoryEntry = {
                id: aHistId,
                productId: addonProduct.id,
                changeQty: addonQty,
                type: 'return' as const,
                referenceId: id,
                note: `Sale #${sale.invoiceNumber} Deleted (Add-on)`,
                balanceAfter: newAddonStock,
                cashierName: currentCashierName || sale.cashier || 'System',
                createdAt: now
              };
              await localDb.stockHistory.add(aHistoryEntry);
              returnMovements.push({
                id: aHistId,
                product_id: addonProduct.id,
                change_qty: addonQty,
                type: 'return',
                note: `Sale #${sale.invoiceNumber} Deleted (Add-on)`,
                variant_id: '',
                variant_label: '',
                cashier_name: currentCashierName || sale.cashier || 'System',
              });
              returnQueue.push({ entity: 'stock_history', histId: aHistId, remote: toRemoteStockHistory(aHistoryEntry), opts: undefined });
            }
          }
        }
      }
    }

    // 1b. Atomic cloud commit: reverse stock + hard-delete sale in ONE tx (online).
    const onlineDel = typeof navigator === 'undefined' || navigator.onLine;
    let deleteCommitted = false;
    if (onlineDel) {
      deleteCommitted = await deleteSaleAtomic(id, returnMovements);
    }
    if (!deleteCommitted) {
      // Fallback: reverse stock via RPC-or-queue, then queue the sale hard-delete.
      if (returnMovements.length > 0) {
        const stockOk = await applyStockMovementsRemote(returnMovements);
        if (!stockOk) {
          for (const q of returnQueue) {
            await queueOp(q.entity, 'create', q.histId, q.remote, q.opts);
          }
        }
      }
      await queueOp('sales', 'delete', id, {});
    }

    // 1c. Reverse wallet balances for the un-refunded portion (split-aware)
    if (!isDraftSale && (sale.status === 'completed' || sale.status === 'partially_refunded' || sale.status === 'cancelled')) {
      const delRatio = sale.total > 0 ? (sale.total - (sale.refundedAmount || 0)) / sale.total : 0;
      await adjustPaymentBalances(buildReversePaymentMoves(sale, delRatio), { batchId: id });
    }

    // 2. Hard-Delete: Permanently remove from local database
    await localDb.sales.delete(id);

    // 4. Reverse Customer Credit/Stats if it was a credit sale (Only if not already deleted)
    //    Drafts never touched customer stats, so they must not be reversed either.
    if (sale.customerId && sale.status !== 'deleted' && !isDraftSale) {
      const customer = await localDb.customers.get(sale.customerId);
      if (customer) {
        const remainingTotal = sale.total - (sale.refundedAmount || 0);
        const updatedCustomer = {
          ...customer,
          totalPurchases: Math.max(0, (customer.totalPurchases || 0) - remainingTotal),
          updatedAt: now
        };
        await localDb.customers.put(updatedCustomer);
        await queueOp('customers', 'update', customer.id, toRemoteCustomer(updatedCustomer));
      }
    }

    return affectedProducts;
  },

  async getReportSalesLocal(startDate: Date, endDate: Date): Promise<Sale[]> {
    return await localDb.sales
      .filter(s =>
        s.status !== 'refunded' &&
        s.status !== 'deleted' &&
        s.status !== 'pending' &&
        !s.notes?.includes('DRAFT_SALE') &&
        new Date(s.timestamp) >= startDate &&
        new Date(s.timestamp) <= endDate
      )
      .reverse()
      .sortBy('timestamp');
  },

  async getReportSales(startDate: Date, endDate: Date): Promise<Sale[]> {
    try {
      const all = await fetchAllPages(() => supabase
        .from('sales')
        .select('*')
        .neq('status', 'refunded')
        .neq('status', 'deleted')
        .neq('status', 'pending')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at', { ascending: false }));

      if (!all || all.length === 0) return [];
      return (all as any[]).map(mapSale);
    } catch (e) {
      console.warn('getReportSales: fallback to localDb'); // fallback to localDb
      return await localDb.sales
        .filter(s =>
          s.status !== 'refunded' &&
          s.status !== 'deleted' &&
          s.status !== 'pending' &&
          !s.notes?.includes('DRAFT_SALE') &&
          new Date(s.timestamp) >= startDate &&
          new Date(s.timestamp) <= endDate
        )
        .reverse()
        .sortBy('timestamp');
    }
  },

  async getReportRefundsLocal(startDate: Date, endDate: Date): Promise<Sale[]> {
    return await localDb.sales
      .filter(s =>
        (s.status === 'refunded' || s.status === 'partially_refunded') &&
        new Date(s.timestamp) >= startDate &&
        new Date(s.timestamp) <= endDate
      )
      .toArray();
  },

  async getReportRefunds(startDate: Date, endDate: Date): Promise<Sale[]> {
    try {
      const all = await fetchAllPages(() => supabase
        .from('sales')
        .select('*')
        .in('status', ['refunded', 'partially_refunded'])
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString()));

      if (!all || all.length === 0) return [];
      return (all as any[]).map(mapSale);
    } catch (e) {
      console.warn('getReportRefunds: fallback to localDb'); // fallback to localDb
      return await localDb.sales
        .filter(s =>
          (s.status === 'refunded' || s.status === 'partially_refunded') &&
          new Date(s.timestamp) >= startDate &&
          new Date(s.timestamp) <= endDate
        )
        .toArray();
    }
  },

  async returnSale(id: string, request?: RefundRequest, currentCashierName?: string): Promise<void> {
    if (activeReturns.has(id)) {
      console.warn(`[returnSale] Duplicate call for ${id} ignored (already in progress).`);
      return;
    }
    const sale = await localDb.sales.get(id);
    if (!sale) throw new Error('Sale not found');
    // Already fully refunded → nothing left to reverse (also guards sequential re-calls)
    if (sale.status === 'refunded') {
      console.warn(`[returnSale] Sale ${id} already fully refunded — no-op.`);
      return;
    }

    activeReturns.add(id);
    try {
    const now = new Date();

    // Phase 1: collect reverse-stock movements for atomic cloud commit.
    const returnMovements: any[] = [];
    const returnQueue: Array<{ entity: string; histId: string; remote: any; opts: any }> = [];

    const isFullRefund = !request || request.type === 'full';
    const itemsToReverse = isFullRefund ? sale.items.map((item, index) => {
      const originalQty = item.weight || item.quantity;
      const alreadyRefunded = item.refundedQuantity || 0;
      return {
        index,
        productId: item.product.id,
        qty: Math.max(0, originalQty - alreadyRefunded),
        refundAmount: item.total || item.subtotal || 0
      };
    }) : (request?.items || []);

    const totalRefundAmount = isFullRefund ? sale.total : (request?.totalRefundAmount || 0);

    // 1. Reverse Stock Locally & Update Sale Items
    for (const reqItem of itemsToReverse) {
      if (reqItem.qty <= 0) continue;

      const item = sale.items[reqItem.index];
      if (!item) continue;

      // Update item's refunded quantity
      item.refundedQuantity = (item.refundedQuantity || 0) + reqItem.qty;

      const product = await localDb.products.get(item.product.id);
      if (product && product.trackInventory) {
        const qty = reqItem.qty;
        const newStock = (product.stock || 0) + qty;

        await localDb.products.update(product.id, {
          stock: newStock,
          updatedAt: now
        });

        // Log Return in History + Queue cloud sync
        const retHistId = generateId();
        const retHistEntry = {
          id: retHistId,
          productId: product.id,
          changeQty: qty,
          type: 'return' as const,
          referenceId: id,
          balanceAfter: newStock,
          cashierName: currentCashierName || sale.cashier || 'System',
          createdAt: now
        };
        await localDb.stockHistory.add(retHistEntry);
        returnMovements.push({
          id: retHistId,
          product_id: product.id,
          change_qty: qty,
          type: 'return',
          note: `Sale #${sale.invoiceNumber} Refunded`,
          variant_id: '',
          variant_label: '',
          cashier_name: currentCashierName || sale.cashier || 'System',
        });
        returnQueue.push({ entity: 'stock_history', histId: retHistId, remote: toRemoteStockHistory(retHistEntry), opts: { batchId: id } });

        // --- VARIANT-LEVEL STOCK RESTORATION (mirror of sale deduction) ---
        if (item.selectedVariantId && product.variantData) {
          const variant = product.variantData.find(v => v.id === item.selectedVariantId);
          if (variant) {
            const newVariantStock = (variant.stock || 0) + reqItem.qty;
            const updatedVariantData = product.variantData.map(v =>
              v.id === variant.id ? { ...v, stock: newVariantStock } : v
            );
            await localDb.products.update(product.id, {
              variantData: updatedVariantData,
              updatedAt: now
            });
            const vRetHistId = generateId();
            const vRetHistEntry: VariantStockHistory = {
              id: vRetHistId,
              productId: product.id,
              variantId: item.selectedVariantId,
              variantLabel: item.selectedVariantLabel || variant.cardTitle || variant.option1,
              changeQty: reqItem.qty,
              type: 'return',
              referenceId: id,
              note: `Sale #${sale.invoiceNumber} Refunded (Variant)`,
              balanceAfter: newVariantStock,
              cashierName: currentCashierName || sale.cashier || 'System',
              createdAt: now,
            };
            await localDb.variantStockHistory.add(vRetHistEntry);
            returnMovements.push({
              id: vRetHistId,
              product_id: product.id,
              change_qty: reqItem.qty,
              type: 'return',
              note: `Sale #${sale.invoiceNumber} Refunded (Variant)`,
              variant_id: item.selectedVariantId,
              variant_label: item.selectedVariantLabel || variant.cardTitle || variant.option1,
              cashier_name: currentCashierName || sale.cashier || 'System',
            });
            returnQueue.push({ entity: 'variant_stock_history', histId: vRetHistId, remote: toRemoteVariantStockHistory(vRetHistEntry), opts: { batchId: id } });
          }
        }
      }

      // --- ADD-ON STOCK RESTORATION ---
      if (item.addonItems && item.addonItems.length > 0) {
        for (const addonItem of item.addonItems) {
          const addonProduct = await localDb.products.get(addonItem.addon.addonProductId);
          if (addonProduct && addonProduct.trackInventory) {
            const addonQtyToRestore = reqItem.qty * addonItem.quantity;
            if (addonQtyToRestore <= 0) continue;

            const newAddonStock = (addonProduct.stock || 0) + addonQtyToRestore;
            await localDb.products.update(addonProduct.id, {
              stock: newAddonStock,
              updatedAt: now
            });
            // STRIP stock — cloud stock is updated ONLY via stock_history trigger (avoids double-count)
            const remoteRefundAddon = toRemoteProduct({ ...addonProduct, stock: newAddonStock, updatedAt: now });
            delete remoteRefundAddon.stock;
            await queueOp('products', 'update', addonProduct.id, remoteRefundAddon, { batchId: id });

            const aHistId = generateId();
            const aHistoryEntry = {
              id: aHistId,
              productId: addonProduct.id,
              changeQty: addonQtyToRestore,
              type: 'return' as const,
              referenceId: id,
              note: `Sale #${sale.invoiceNumber} Refunded (Add-on)`,
              balanceAfter: newAddonStock,
              cashierName: currentCashierName || sale.cashier || 'System',
              createdAt: now
            };
            await localDb.stockHistory.add(aHistoryEntry);
            returnMovements.push({
              id: aHistId,
              product_id: addonProduct.id,
              change_qty: addonQtyToRestore,
              type: 'return',
              note: `Sale #${sale.invoiceNumber} Refunded (Add-on)`,
              variant_id: '',
              variant_label: '',
              cashier_name: currentCashierName || sale.cashier || 'System',
            });
            returnQueue.push({ entity: 'stock_history', histId: aHistId, remote: toRemoteStockHistory(aHistoryEntry), opts: { batchId: id } });
          }
        }
      }
    }

    // (stock + status are committed atomically further below, after finalStatus is known)

    // 2. Update sale record
    const newRefundedAmount = (sale.refundedAmount || 0) + totalRefundAmount;

    // Reverse the proportional tax so tax liability stays accurate on partial/full refund (B2)
    const taxRatio = sale.total > 0 ? totalRefundAmount / sale.total : 0;
    const baseTax = Number(sale.taxAmount || 0);
    const newTaxAmount = Math.max(0, Math.round((baseTax - baseTax * taxRatio) * 100) / 100);

    // Check if fully refunded
    let allItemsFullyRefunded = true;
    for (const item of sale.items) {
      const totalQty = item.weight || item.quantity;
      if ((item.refundedQuantity || 0) < totalQty) {
        allItemsFullyRefunded = false;
        break;
      }
    }

    const finalStatus = allItemsFullyRefunded ? 'refunded' : 'partially_refunded';

    const returnUpdate = {
      ...sale,
      items: sale.items, // updated with refundedQuantity
      refundedAmount: newRefundedAmount,
      taxAmount: newTaxAmount,
      status: finalStatus as any,
      updatedAt: now
    };

    await localDb.sales.put(returnUpdate); // use put instead of update to overwrite fully

    // 1b. Atomic cloud commit: reverse stock + update status in ONE tx (online).
    const onlineRet = typeof navigator === 'undefined' || navigator.onLine;
    let returnsCommitted = false;
    if (onlineRet) {
      returnsCommitted = await refundSaleAtomic(id, returnMovements, finalStatus, newRefundedAmount);
    }
    if (!returnsCommitted) {
      if (returnMovements.length > 0) {
        const stockOk = await applyStockMovementsRemote(returnMovements);
        if (!stockOk) {
          for (const q of returnQueue) {
            await queueOp(q.entity, 'create', q.histId, q.remote, q.opts);
          }
        }
      }
    }

    // 3. Queue RPC Sync (legacy fallback only — atomic refund already handled cloud)
    if (!returnsCommitted) {
      await queueOp('sales', 'update', id, {
        ...toRemoteSale(returnUpdate),
        status: finalStatus,
        updated_at: now.toISOString()
      }, { batchId: id });
    }

    // 4. Reverse Customer Stats
    if (sale.customerId && totalRefundAmount > 0) {
      const customer = await localDb.customers.get(sale.customerId);
      if (customer) {
        const updatedCustomer = {
          ...customer,
          totalPurchases: Math.max(0, (customer.totalPurchases || 0) - totalRefundAmount),
          updatedAt: now
        };
        await localDb.customers.put(updatedCustomer);
        await queueOp('customers', 'update', customer.id, toRemoteCustomer(updatedCustomer), { batchId: id });
      }
    }

    // 5. Create reversing payment record for audit trail
    if (totalRefundAmount > 0) {
      const refundMethod = (request?.method && ['cash', 'card', 'digital', 'online'].includes(request.method))
        ? request.method
        : (sale.paymentMethod === 'split' ? 'cash' : (sale.paymentMethod || 'cash'));
      const refundPayId = generateId();
      const refundPayment = {
        id: refundPayId,
        customerId: sale.customerId || undefined,
        amount: totalRefundAmount,
        method: refundMethod,
        direction: 'out' as const,
        note: `${isFullRefund ? 'Full' : 'Partial'} Refund for sale ${sale.invoiceNumber || id}${request?.reason ? ` — ${request.reason}` : ''}`,
        createdAt: now,
      };
      await localDb.payments.add(refundPayment);
      await queueOp('payments', 'create', refundPayId, toRemotePayment(refundPayment), { batchId: id });
      // Reverse wallet balances proportionally for the refunded amount (split-aware)
      await adjustPaymentBalances(buildReversePaymentMoves(sale, taxRatio), { batchId: id });
    }
    } finally {
      activeReturns.delete(id);
    }
  },

  async patchLegacySales(onProgress?: (percent: number) => void): Promise<number> {
    const allSales = await localDb.sales.toArray();
    const toUpdate: any[] = [];

    for (let i = 0; i < allSales.length; i++) {
      const sale = allSales[i];
      let needsPatch = false;
      const updatedItems = sale.items.map(item => {
        if (!item.purchaseCost || item.purchaseCost <= 0) {
          needsPatch = true;
          // Fallback to current product cost for legacy records
          const productCost = Number(item.product?.cost) || 0;
          const qty = item.weight || item.quantity;
          return {
            ...item,
            purchaseCost: productCost * qty
          };
        }
        return item;
      });

      if (needsPatch) {
        toUpdate.push({ ...sale, items: updatedItems, updatedAt: new Date() });
      }
    }

    if (toUpdate.length === 0) {
      if (onProgress) onProgress(100);
      return 0;
    }

    // Process in chunks to avoid overwhelming the database and UI
    const CHUNK_SIZE = 50;
    for (let i = 0; i < toUpdate.length; i += CHUNK_SIZE) {
      const chunk = toUpdate.slice(i, i + CHUNK_SIZE);
      await localDb.sales.bulkPut(chunk);

      const remoteChunk = chunk
        .filter(sale => !sale.invoiceNumber?.startsWith('DRAFT-'))
        .map(toRemoteSale);

      if (remoteChunk.length > 0) {
        // Bulk upsert to Supabase to avoid 5000+ pending ops crashing the sync engine
        const { error } = await supabase.from('sales').upsert(remoteChunk, { onConflict: 'id' });
        if (error) console.error('Bulk sync failed for chunk:', error);
      }

      if (onProgress) {
        onProgress(Math.floor(((i + chunk.length) / toUpdate.length) * 100));
      }

      // Add a small delay to allow UI to breathe
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Clear any stuck pending ops for sales updates to recover browsers that got locked up in previous repair attempts
    const pendingSalesUpdates = await localDb.pendingOps
      .filter(op => op.table === 'sales' && op.action === 'update')
      .primaryKeys();
    if (pendingSalesUpdates.length > 0) {
      await localDb.pendingOps.bulkDelete(pendingSalesUpdates);
    }

    if (onProgress) onProgress(100);
    return toUpdate.length;
  }
};



/**
 * Categories & Suppliers
 */
export const mapCategory = (item: any): Category => ({
  ...item,
  estoreSortOrder: item.estore_sort_order ?? item.estoreSortOrder,
  createdAt: item.created_at ? new Date(item.created_at) : (item.createdAt ? new Date(item.createdAt) : undefined)
});

export const mapSupplier = (item: any): Supplier => ({
  id: item.id,
  name: item.name || '',
  email: item.email || '',
  phone: item.phone || '',
  address: item.address || '',
  businessType: item.business_type || item.businessType || '',
  paymentTerms: item.payment_terms || item.paymentTerms || '',
  openingBalance: Number(item.opening_balance ?? item.openingBalance ?? 0),
  rating: Number(item.rating ?? 0),
  createdAt: item.created_at ? new Date(item.created_at) : (item.createdAt ? new Date(item.createdAt) : new Date()),
  updatedAt: item.updated_at ? new Date(item.updated_at) : (item.updatedAt ? new Date(item.updatedAt) : undefined)
});

export const categoriesService = {
  async getAll() { return await localDb.categories.toArray(); },
  async create(nameOrObj: string | Category) {
    const id = typeof nameOrObj === 'object' ? (nameOrObj.id || generateId()) : generateId();
    const name = typeof nameOrObj === 'object' ? nameOrObj.name : nameOrObj;
    const description = typeof nameOrObj === 'object' ? nameOrObj.description : undefined;
    const cat = { id, name, description, active: true, createdAt: new Date() };
    await localDb.categories.add(cat);
    await queueOp('categories', 'create', id, {
      id,
      name,
      description,
      active: true,
      created_at: new Date().toISOString()
    });
    return cat;
  },
  async update(id: string, updates: Partial<Category>): Promise<void> {
    await localDb.categories.where('id').equals(id).modify(updates);
    const local = await localDb.categories.get(id);
    const remote: any = {};
    if (local) {
      remote.name = local.name;
      remote.description = local.description || null;
      remote.active = local.active ?? true;
      remote.estore_sort_order = local.estoreSortOrder ?? 0;
    } else {
      if ('estoreSortOrder' in updates) remote.estore_sort_order = updates.estoreSortOrder;
      if ('name' in updates) remote.name = updates.name;
      if ('description' in updates) remote.description = updates.description;
      if ('active' in updates) remote.active = updates.active;
    }
    await queueOp('categories', 'update', id, remote);
  },
  async fetchRemote(lastSyncTime?: Date): Promise<Category[]> {
    const queryFn = () => {
      let q = supabase.from('categories').select('*');
      if (lastSyncTime) q = q.gte('updated_at', lastSyncTime.toISOString());
      return q;
    };
    const data = await fetchAllPages(queryFn);
    return data.map(mapCategory);
  }
};

export const suppliersService = {
  async getAll(): Promise<Supplier[]> {
    return await localDb.suppliers.toArray();
  },

  async getById(id: string): Promise<Supplier | null> {
    return await localDb.suppliers.get(id) || null;
  },

  async create(data: Omit<Supplier, 'id' | 'createdAt'>): Promise<Supplier> {
    const id = generateId();
    const sup = { ...data, id, createdAt: new Date() } as Supplier;
    await localDb.suppliers.add(sup);
    await queueOp('suppliers', 'create', id, toRemoteSupplier(sup));

    // Create opening balance transaction if needed
    if (data.openingBalance && data.openingBalance > 0) {
      await this.recordBill({
        supplierId: id,
        amount: data.openingBalance,
        note: 'Opening Balance'
      });
    }

    return sup;
  },

  async update(id: string, updates: Partial<Supplier>): Promise<Supplier> {
    const existing = await this.getById(id);
    if (!existing) throw new Error('Supplier not found');
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    await localDb.suppliers.put(updated);
    await queueOp('suppliers', 'update', id, toRemoteSupplier({ ...updates, updatedAt: updated.updatedAt }));
    return updated;
  },

  async delete(id: string): Promise<void> {
    await localDb.suppliers.delete(id);
    queueOp('suppliers', 'delete', id, {});
    // Cleanup transactions?
    await localDb.supplierTransactions.where('supplierId').equals(id).delete();
  },

  async getBalance(supplierId: string): Promise<number> {
    const txs = await localDb.supplierTransactions.where('supplierId').equals(supplierId).toArray();
    return txs.reduce((sum, tx) => {
      if (tx.type === 'payment' || tx.type === 'return') {
        return sum - (tx.amount || 0);
      }
      return sum + (tx.amount || 0);
    }, 0);
  },

  async getLedger(supplierId: string, limit: number = 50, offset: number = 0, manualOnly: boolean = false) {
    const query = localDb.supplierTransactions.where('supplierId').equals(supplierId);

    let txs = await query.toArray();

    // Sort and paginate manually for now if Dexie query is complex
    txs = txs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const paginated = txs.slice(offset, offset + limit);

    return paginated.map(tx => ({
      id: tx.id,
      date: tx.createdAt,
      type: tx.type,
      sourceType: tx.sourceType || (tx.type === 'opening_balance' ? 'opening_balance' : tx.type === 'payment' ? 'payment' : 'manual_bill'),
      detail: tx.note || tx.referenceType || 'Transaction',
      debit: (tx.type === 'payment' || tx.type === 'return') ? tx.amount : 0,
      credit: (tx.type === 'purchase' || tx.type === 'opening_balance' || tx.type === 'loan') ? tx.amount : 0,
      isManualOverride: tx.isManualOverride || false,
      overrideBy: tx.overrideBy || null,
    }));
  },

  async recordPayment(data: { supplier_id: string; amount: number; payment_type: string; note?: string; isManualOverride?: boolean; overrideBy?: string; expenseId?: string }) {
    const id = generateId();
    const tx: any = {
      id,
      supplierId: data.supplier_id,
      type: 'payment',
      sourceType: 'payment' as const,
      amount: data.amount,
      note: data.note,
      paymentType: data.payment_type,
      isManualOverride: data.isManualOverride || false,
      overrideBy: data.overrideBy || undefined,
      expenseId: data.expenseId,
      createdAt: new Date()
    };
    await localDb.supplierTransactions.add(tx);
    await queueOp('supplier_transactions', 'create', id, toRemoteSupplierTransaction(tx));
    return tx;
  },

  async recordBill(data: { supplierId: string; amount: number; note?: string; referenceId?: string; sourceType?: 'auto_purchase' | 'manual_bill' | 'opening_balance'; isManualOverride?: boolean; overrideBy?: string }) {
    // X9 GUARD: never create a second supplier bill for the same stock-in / purchase record.
    // Both PurchaseOrderSystem & BatchStockInSystem (and ProductDetailHub) funnel through
    // commitStockInToInventory → recordBill with referenceId = purchase record id. Without this
    // guard a re-run / double receive of the same delivery would double-count the payable.
    if (data.referenceId) {
      const existing = (await localDb.supplierTransactions.toArray())
        .find(t => t.referenceId === data.referenceId);
      if (existing) return existing;
    }
    const id = generateId();
    const inferredType = data.note === 'Opening Balance' ? 'opening_balance' : 'purchase';
    const inferredSourceType = data.sourceType || (inferredType === 'opening_balance' ? 'opening_balance' : 'manual_bill');
    const tx: any = {
      id,
      supplierId: data.supplierId,
      type: inferredType,
      sourceType: inferredSourceType,
      amount: data.amount,
      note: data.note,
      referenceId: data.referenceId,
      isManualOverride: data.isManualOverride || false,
      overrideBy: data.overrideBy || undefined,
      createdAt: new Date()
    };
    await localDb.supplierTransactions.add(tx);
    await queueOp('supplier_transactions', 'create', id, toRemoteSupplierTransaction(tx));
    return tx;
  },

  async deleteTransaction(id: string) {
    // Cascade: a supplier PAYMENT also creates a linked expense row.
    // Delete the orphaned expense too, otherwise expense totals stay inflated.
    try {
      const tx: any = await localDb.supplierTransactions.get(id);
      if (tx?.expenseId) {
        await localDb.expenses.delete(tx.expenseId);
        queueOp('expenses', 'delete', tx.expenseId, {});
      }
    } catch (e) {
      console.warn('deleteTransaction: failed to cascade expense cleanup', e);
    }
    await localDb.supplierTransactions.delete(id);
    queueOp('supplier_transactions', 'delete', id, {});
  },

  async fetchRemote(lastSyncTime?: Date): Promise<Supplier[]> {
    const queryFn = () => {
      let q = supabase.from('suppliers').select('*');
      if (lastSyncTime) q = q.gte('updated_at', lastSyncTime.toISOString());
      return q;
    };
    const data = await fetchAllPages(queryFn);
    return data.map(mapSupplier);
  }
};


/**
 * Purchase Orders Service
 */
export const purchaseOrdersService = {
  async getAll(): Promise<PurchaseOrder[]> {
    return await localDb.purchaseOrders.toArray();
  },

  async getById(id: string): Promise<PurchaseOrder | null> {
    return await localDb.purchaseOrders.get(id) || null;
  },

  async create(po: Omit<PurchaseOrder, 'id'>): Promise<PurchaseOrder> {
    const id = generateId();
    const now = new Date();
    const newPO = { ...po, id, createdAt: now, updatedAt: now } as PurchaseOrder;
    await localDb.purchaseOrders.add(newPO);
    queueOp('purchase_orders', 'create', id, {
      id,
      po_number: po.poNumber,
      supplier_id: po.supplierId,
      status: po.status || 'draft',
      total_amount: po.totalAmount || 0,
      notes: po.notes,
      received_at: po.receivedAt ? po.receivedAt.toISOString() : null,
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    });
    return newPO;
  }
};

/**
 * Settings Service
 */
export const settingsService = {
  async get(): Promise<AppSettings | null> {
    const local = await localDb.appSettings.get(SETTINGS_ID);
    if (local) return local;
    return await this.fetchRemote();
  },
  async fetchRemote(lastSyncTime?: Date): Promise<AppSettings | null> {
    const queryFn = () => {
      let q = supabase.from('app_settings').select('*').eq('id', SETTINGS_ID);
      if (lastSyncTime) q = q.gte('updated_at', lastSyncTime.toISOString());
      return q;
    };
    const data = await fetchAllPages(queryFn);
    if (!data || data.length === 0) return null;
    return mapSettings(data[0]);
  },
  async update(updates: Partial<AppSettings>): Promise<void> {
    const existing = await this.get();
    const now = new Date();
    const updated = {
      ...(existing || {}),
      ...updates,
      id: SETTINGS_ID,
      updatedAt: now
    } as AppSettings;

    // Safety: ensure timestamps are updated
    if (!updated.createdAt) updated.createdAt = now;

    // 1. Update local cache immediately
    await localDb.appSettings.put(updated);

    // 2. Map for remote sync
    const remotePayload = toRemoteSettings(updated);
    remotePayload.id = SETTINGS_ID;

    // 3. Queue for cloud sync
    await queueOp('app_settings', 'update', SETTINGS_ID, remotePayload);
  }
};

/**
 * Expenses Service
 */
export const expensesService = {
  async getAll(): Promise<Expense[]> {
    return await localDb.expenses.toArray();
  },
  async create(expense: Omit<Expense, 'id'>): Promise<Expense> {
    const id = generateId();
    const newExp = { ...expense, id, createdAt: new Date() } as Expense;
    await localDb.expenses.add(newExp);
    await queueOp('expenses', 'create', id, toRemoteExpense(newExp));
    // Wallet ledger: expense is money OUT (MASTER §6 — every movement leaves
    // a trace in payment_movements, not just payment_modes.balance).
    await adjustPaymentBalances([{
      id,
      modeId: normalizePaymentMethod(newExp.paymentMethod || 'cash'),
      delta: -Number(newExp.amount || 0),
      referenceId: id,
      note: `Expense ${newExp.description || 'Expense'}`,
    }], { batchId: `exp_${id}` });
    return newExp;
  },

  async update(id: string, updates: Partial<Expense>): Promise<Expense> {
    const existing = await localDb.expenses.get(id);
    if (!existing) throw new Error('Expense not found');
    const updated = { ...existing, ...updates, updatedAt: new Date() } as Expense;
    await localDb.expenses.put(updated);
    await queueOp('expenses', 'update', id, toRemoteExpense(updated));
    // Reverse the old amount from the wallet, then apply the new amount.
    await adjustPaymentBalances([
      {
        id: generateId(),
        modeId: normalizePaymentMethod(existing.paymentMethod || 'cash'),
        delta: Number(existing.amount || 0),
        referenceId: id,
        note: `Expense reverse (update) ${existing.description || ''}`,
      },
      {
        id: generateId(),
        modeId: normalizePaymentMethod(updated.paymentMethod || 'cash'),
        delta: -Number(updated.amount || 0),
        referenceId: id,
        note: `Expense ${updated.description || 'Expense'}`,
      },
    ], { batchId: `exp_upd_${id}` });
    return updated;
  },

  async delete(id: string): Promise<void> {
    const existing = await localDb.expenses.get(id);
    await localDb.expenses.delete(id);
    await queueOp('expenses', 'delete', id, {});
    if (existing) {
      // Reverse the expense from the wallet (money back IN).
      await adjustPaymentBalances([{
        id: generateId(),
        modeId: normalizePaymentMethod(existing.paymentMethod || 'cash'),
        delta: Number(existing.amount || 0),
        referenceId: id,
        note: `Expense reverse (delete) ${existing.description || ''}`,
      }], { batchId: `exp_del_${id}` });
    }
  },

  async fetchRemote(lastSyncTime?: Date): Promise<Expense[]> {
    const queryFn = () => {
      let q = supabase.from('expenses').select('*');
      if (lastSyncTime) q = q.gte('updated_at', lastSyncTime.toISOString());
      return q;
    };
    const data = await fetchAllPages(queryFn);
    return data.map(mapExpense);
  },

  async getReportExpensesLocal(startDate: Date, endDate: Date): Promise<Expense[]> {
    return await localDb.expenses
      .filter(e =>
        new Date(e.date) >= startDate &&
        new Date(e.date) <= endDate
      )
      .toArray();
  },

  async getReportExpenses(startDate: Date, endDate: Date): Promise<Expense[]> {
    try {
      // NEVER truncate: paginate to completion (fetchAllPages)
      const all = await fetchAllPages(() => supabase
        .from('expenses')
        .select('*')
        .gte('date', startDate.toISOString())
        .lte('date', endDate.toISOString())
        .order('date', { ascending: false }));

      if (!all || all.length === 0) return [];
      return (all as any[]).map(mapExpense);
    } catch (e) {
      console.warn('getReportExpenses: fallback to localDb'); // fallback to localDb
      return await localDb.expenses
        .filter(e =>
          new Date(e.date || e.createdAt) >= startDate &&
          new Date(e.date || e.createdAt) <= endDate
        )
        .reverse()
        .sortBy('date');
    }
  }
};

/**
 * Discounts Service
 */
export const discountsService = {
  async getAll(): Promise<Discount[]> {
    return await localDb.discounts.toArray();
  },
  async create(data: any) {
    const id = generateId();
    const discount = { ...data, id };
    await localDb.discounts.add(discount);
    const remote: any = {
      ...discount,
      min_amount: discount.minAmount,
      max_discount: discount.maxDiscount,
      free_gift_products: discount.freeGiftProducts || [],
      valid_days: discount.validDays || [],
      valid_from: discount.validFrom.toISOString(),
      valid_to: discount.validTo.toISOString(),
      is_auto_apply: discount.isAutoApply,
      created_at: discount.createdAt instanceof Date ? discount.createdAt.toISOString() : (discount.createdAt || new Date().toISOString()),
      updated_at: discount.updatedAt instanceof Date ? discount.updatedAt.toISOString() : (discount.updatedAt || new Date().toISOString()),
    };
    delete remote.minAmount;
    delete remote.maxDiscount;
    delete remote.freeGiftProducts;
    delete remote.validDays;
    delete remote.validFrom;
    delete remote.validTo;
    delete remote.isAutoApply;
    delete remote.createdAt;
    delete remote.updatedAt;
    await queueOp('discounts', 'create', id, remote);
  },

  async fetchRemote(lastSyncTime?: Date): Promise<Discount[]> {
    const queryFn = () => {
      let q = supabase.from('discounts').select('*');
      if (lastSyncTime) q = q.gte('updated_at', lastSyncTime.toISOString());
      return q;
    };
    const data = await fetchAllPages(queryFn);
    return data.map(mapDiscount);
  },

  async update(id: string, updates: Partial<Discount>): Promise<Discount> {
    const existing = await localDb.discounts.get(id);
    if (!existing) throw new Error('Discount not found');
    const updated = { ...existing, ...updates, id, updatedAt: new Date() } as Discount;
    await localDb.discounts.put(updated);
    const remote: any = { ...updated };
    remote.min_amount = updated.minAmount;
    remote.max_discount = updated.maxDiscount;
    remote.free_gift_products = updated.freeGiftProducts || [];
    remote.valid_days = updated.validDays || [];
    if (updated.validFrom) remote.valid_from = (updated.validFrom as Date).toISOString();
    if (updated.validTo) remote.valid_to = (updated.validTo as Date).toISOString();
    remote.is_auto_apply = updated.isAutoApply;
    remote.updated_at = updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : (updated.updatedAt || new Date().toISOString());
    delete remote.minAmount;
    delete remote.maxDiscount;
    delete remote.freeGiftProducts;
    delete remote.validDays;
    delete remote.validFrom;
    delete remote.validTo;
    delete remote.isAutoApply;
    delete remote.createdAt;
    delete remote.updatedAt;
    await queueOp('discounts', 'update', id, remote);
    return updated;
  },

  async delete(id: string): Promise<void> {
    await localDb.discounts.delete(id);
    await queueOp('discounts', 'delete', id, {});
  }
};
/**
 * Purchase Records & Stock IN
 */
export const purchaseRecordsService = {
  async getAll(): Promise<PurchaseRecord[]> {
    return await localDb.purchaseRecords.toArray();
  },

  async create(record: Omit<PurchaseRecord, 'id'>): Promise<PurchaseRecord> {
    const id = generateId();
    const now = new Date();
    const newRecord = { ...record, id, createdAt: now } as PurchaseRecord;

    // Update product stock + batches if productId provided
    // NOTE: Stock update is intentionally performed HERE so that callers that don't
    // manage inventory themselves (PurchaseHistory quick-entry) get correct counts.
    // Callers that ALREADY manage stock (BatchStockInSystem) must NOT call this path.
    if (record.productId) {
      const product = await localDb.products.get(record.productId);
      if (product && record.type !== 'Adjustment') {
        const newStock = (product.stock || 0) + record.quantity;

        // If it's a stock-in purchase, update the product's last cost price
        const costUpdate = record.quantity > 0 && record.costPrice > 0
          ? { cost: record.costPrice }
          : {};

        await localDb.products.update(product.id, {
          stock: newStock,
          ...costUpdate,
          updatedAt: now
        });

        if (Object.keys(costUpdate).length > 0) {
          // STRIP stock — cloud stock is updated ONLY via stock_history trigger (avoids double-count)
          const remotePurchaseCostPayload = toRemoteProduct(
            { ...product, ...costUpdate, updatedAt: now }
          );
          delete remotePurchaseCostPayload.stock;
          await queueOp('products', 'update', product.id, remotePurchaseCostPayload);
        }

        // Log stock movement to stock_history for full audit trail (local first, always)
        const histId = generateId();
        const histEntry = {
          id: histId,
          productId: product.id,
          changeQty: record.quantity,
          type: record.quantity > 0 ? 'stock_in' as const : 'adjustment_out' as const,
          referenceId: id,
          note: `${record.type || 'Stock In'}: ${record.supplier || 'Direct'}`,
          balanceAfter: newStock,
          cashierName: record.addedBy || 'System',
          createdAt: now
        };
        await localDb.stockHistory.add(histEntry);

        // (B) HARDENING: commit the stock movement atomically via RPC when online
        // (trigger updates cloud product.stock). Falls back to the reliable queue
        // when offline / RPC unavailable. Idempotent ids make any re-apply a no-op.
        const onlinePurchase = typeof navigator === 'undefined' || navigator.onLine;
        if (onlinePurchase) {
          const committed = await applyStockMovementsRemote([{
            id: histId,
            product_id: product.id,
            change_qty: record.quantity,
            type: record.quantity > 0 ? 'stock_in' : 'adjustment_out',
            note: histEntry.note,
            variant_id: '',
            variant_label: '',
            cashier_name: record.addedBy || 'System',
          }]);
          if (!committed) {
            await queueOp('stock_history', 'create', histId, toRemoteStockHistory(histEntry));
          }
        } else {
          await queueOp('stock_history', 'create', histId, toRemoteStockHistory(histEntry));
        }
      }

      // F22 — VARIANT-TARGETED RESTOCK: mirror the same change at variant level.
      // One signed movement per variant → variant_stock_history trigger updates
      // cloud products.variant_data[].stock; local updated here in the same call.
      if (record.variantId) {
        await applyVariantStockMovement({
          product,
          variantId: record.variantId,
          variantLabel: record.variantLabel,
          changeQty: record.quantity,
          type: 'purchase',
          referenceId: id,
          note: `Stock In: ${record.supplier || 'Direct'}${record.variantLabel ? ` (${record.variantLabel})` : ''}`,
          cashierName: record.addedBy || 'System',
          createdAt: now
        });
      }
    }

    // Save Record Locally + Queue sync
    await localDb.purchaseRecords.add(newRecord);
    await queueOp('purchase_records', 'create', id, toRemotePurchaseRecord(newRecord));
    return newRecord;
  },

  async fetchRemote(lastSyncTime?: Date): Promise<PurchaseRecord[]> {
    const queryFn = () => {
      let q = supabase.from('purchase_records').select('*');
      if (lastSyncTime) q = q.gte('updated_at', lastSyncTime.toISOString());
      return q;
    };
    const data = await fetchAllPages(queryFn);
    return data.map(mapPurchaseRecord);
  },

  async delete(id: string): Promise<void> {
    const record = await localDb.purchaseRecords.get(id);
    if (record && record.productId) {
      const product = await localDb.products.get(record.productId);
      if (product) {
        // UNIVERSAL single-reversal: deleting ANY purchase record (Stock IN, Adjustment, etc.)
        // reverses its signed stock effect exactly once and logs an audit entry.
        // Callers MUST NOT reverse again outside this service.
        const now = new Date();
        const newStock = (product.stock || 0) - (record.quantity || 0);

        await localDb.products.update(product.id, {
          stock: newStock,
          updatedAt: now
        });

        const histId = generateId();
        const histEntry = {
          id: histId,
          productId: product.id,
          changeQty: -(record.quantity || 0),
          type: 'adjustment_out' as const,
          referenceId: id,
          note: `Deleted Purchase Record (${record.type || 'Stock IN'}): ${record.supplier || 'Direct'}`,
          balanceAfter: newStock,
          cashierName: 'System',
          createdAt: now
        };
        await localDb.stockHistory.add(histEntry);
        await queueOp('stock_history', 'create', histId, toRemoteStockHistory(histEntry));

        // F22 — VARIANT reversal (single reversal, F12): the stock-in that targeted
        // a variant is reversed exactly once at variant level too.
        if (record.variantId) {
          await applyVariantStockMovement({
            product,
            variantId: record.variantId,
            variantLabel: record.variantLabel,
            changeQty: -(record.quantity || 0),
            type: 'adjustment',
            referenceId: id,
            note: `Deleted Purchase Record (${record.type || 'Stock IN'}): ${record.supplier || 'Direct'} (${record.variantLabel || 'variant'})`,
            cashierName: 'System',
            createdAt: now
          });
        }
      }
    }

    await localDb.purchaseRecords.delete(id);
    await queueOp('purchase_records', 'delete', id, {});
  },
};

export const toRemoteSalesTab = (tab: Partial<SalesTab>) => {
  const remote: any = { ...tab };
  if ('userId' in tab) { remote.user_id = tab.userId; delete remote.userId; }
  if ('billDiscountValue' in tab) { remote.bill_discount_value = tab.billDiscountValue; delete remote.billDiscountValue; }
  if ('billDiscountType' in tab) { remote.bill_discount_type = tab.billDiscountType; delete remote.billDiscountType; }
  if ('createdAt' in tab) { remote.created_at = tab.createdAt; delete remote.createdAt; }
  if ('editingSaleId' in tab) { remote.editing_sale_id = tab.editingSaleId ?? null; delete remote.editingSaleId; }

  // Extract only the customer ID for the DB column
  if (tab.selectedCustomer) {
    remote.selected_customer_id = tab.selectedCustomer.id;
  } else if ('selectedCustomer' in tab) {
    remote.selected_customer_id = null;
  }

  // Strip full customer object (not a DB column, reconstructed from ID on load)
  delete remote.selectedCustomer;

  return remote;
};

/**
 * Sales Tabs
 */
export const salesTabsService = {
  async getByUserId(userId: string): Promise<SalesTab[]> {
    return await localDb.salesTabs.where('userId').equals(userId).toArray();
  },
  async create(userId: string, tab: Omit<SalesTab, 'id' | 'createdAt'>): Promise<SalesTab> {
    const id = generateId();
    const now = new Date();
    const newTab = { ...tab, id, userId, createdAt: now } as SalesTab;
    await localDb.salesTabs.add(newTab);
    await queueOp('sales_tabs', 'create', id, toRemoteSalesTab(newTab));
    return newTab;
  },
  async update(id: string, updates: Partial<SalesTab>): Promise<void> {
    const existing = await localDb.salesTabs.get(id);
    const updated = { ...(existing || {}), ...updates, id } as SalesTab;
    await localDb.salesTabs.put(updated);

    // Use 'update' opType so syncEngine uses .update() instead of .upsert()
    // This prevents overwriting other columns (like 'name') with null if they are missing from updates.
    await queueOp('sales_tabs', 'update', id, toRemoteSalesTab(updates));
  },
  async delete(id: string): Promise<void> {
    await localDb.salesTabs.delete(id);
    queueOp('sales_tabs', 'delete', id, {});
  }
};

/**
 * Supplier Transactions Service
 */
export const supplierTransactionsService = {
  async fetchRemote(lastSyncTime?: Date): Promise<SupplierTransaction[]> {
    const queryFn = () => {
      let q = supabase.from('supplier_transactions').select('*');
      if (lastSyncTime) q = q.gte('updated_at', lastSyncTime.toISOString());
      return q;
    };
    let data;
    try {
      data = await fetchAllPages(queryFn);
    } catch {
      // Fallback: fetch all if updated_at column doesn't exist
      console.warn('[supplierTransactions] Delta sync failed, fetching all');
      data = await fetchAllPages(() => supabase.from('supplier_transactions').select('*'));
    }
    return data.map((item: any) => ({
      ...item,
      supplierId: item.supplier_id ?? item.supplierId,
      referenceId: item.reference_id ?? item.referenceId,
      referenceType: item.reference_type ?? item.referenceType,
      balanceAfter: item.balance_after ?? item.balanceAfter,
      paymentMethod: item.payment_method ?? item.paymentMethod,
      createdAt: item.created_at ? new Date(item.created_at) : new Date(item.createdAt),
    }));
  }
};

/**
 * Stock History Service
 */
export const stockHistoryService = {
  async getAll(): Promise<StockHistory[]> {
    const items = await localDb.stockHistory.toArray();
    return items.map(mapStockHistory).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },
  async fetchRemote(lastSyncTime?: Date): Promise<StockHistory[]> {
    const queryFn = () => {
      let q = supabase.from('stock_history').select('*');
      if (lastSyncTime) q = q.gte('updated_at', lastSyncTime.toISOString());
      return q;
    };
    let data;
    try {
      data = await fetchAllPages(queryFn);
    } catch {
      // Fallback: fetch all if updated_at column doesn't exist
      console.warn('[stockHistory] Delta sync failed, fetching all');
      data = await fetchAllPages(() => supabase.from('stock_history').select('*'));
    }
    return data.map(mapStockHistory);
  }
};

/**
 * VARIANT MOVEMENT LEDGER (F22 — UNIVERSAL single source of truth)
 * Applies a variant-level stock change: updates local products.variantData[].stock
 * and appends ONE variant_stock_history row (cloud variant_data[].stock is updated
 * by the variant_stock_history trigger).
 *
 * Callers: purchaseRecordsService.create/delete (variant restock), sales/returns
 * (existing sale path mirrors this pattern), ProductDetailHub (variant stock edit).
 */
export async function applyVariantStockMovement(params: {
  product: Product;
  variantId: string;
  variantLabel?: string;
  changeQty: number;
  type: 'sale' | 'return' | 'adjustment' | 'initial' | 'purchase';
  referenceId?: string;
  note?: string;
  cashierName?: string;
  createdAt?: Date;
}): Promise<void> {
  const { product, variantId, changeQty } = params;
  const now = params.createdAt || new Date();

  const variant = (product.variantData || []).find(v => v.id === variantId);
  if (!variant) return;

  const newVariantStock = (variant.stock || 0) + changeQty;

  // Local product variantData update (cloud handled by variant_stock_history trigger)
  const updatedVariantData = (product.variantData || []).map(v =>
    v.id === variantId ? { ...v, stock: newVariantStock } : v
  );
  // Read fresh product so we never clobber concurrent field edits
  const fresh = (await localDb.products.get(product.id)) || product;
  await localDb.products.update(product.id, {
    variantData: fresh.variantData ? fresh.variantData.map(v =>
      v.id === variantId ? { ...v, stock: newVariantStock } : v
    ) : updatedVariantData,
    updatedAt: now
  });

  const vHistId = generateId();
  const vHistEntry: VariantStockHistory = {
    id: vHistId,
    productId: product.id,
    variantId,
    variantLabel: params.variantLabel || variant.cardTitle || variant.option1,
    changeQty,
    type: params.type,
    referenceId: params.referenceId,
    note: params.note,
    balanceAfter: newVariantStock,
    cashierName: params.cashierName || 'System',
    createdAt: now,
  };
  await localDb.variantStockHistory.add(vHistEntry);
  await queueOp('variant_stock_history', 'create', vHistId, toRemoteVariantStockHistory(vHistEntry));
}

/**
 * Variant Stock History Service
 */
export const variantStockHistoryService = {
  async getByProduct(productId: string): Promise<VariantStockHistory[]> {
    const items = await localDb.variantStockHistory
      .where('productId').equals(productId)
      .toArray();
    return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async getByVariant(productId: string, variantId: string): Promise<VariantStockHistory[]> {
    const items = await localDb.variantStockHistory
      .where('productId').equals(productId)
      .toArray();
    return items
      .filter(h => h.variantId === variantId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async create(entry: Omit<VariantStockHistory, 'id' | 'createdAt'>): Promise<VariantStockHistory> {
    const id = generateId();
    const now = new Date();
    const newEntry = { ...entry, id, createdAt: now } as VariantStockHistory;
    await localDb.variantStockHistory.add(newEntry);
    await queueOp('variant_stock_history', 'create', id, toRemoteVariantStockHistory(newEntry));
    return newEntry;
  },

  async fetchRemote(lastSyncTime?: Date): Promise<VariantStockHistory[]> {
    const queryFn = () => {
      let q = supabase.from('variant_stock_history').select('*');
      if (lastSyncTime) q = q.gte('updated_at', lastSyncTime.toISOString());
      return q;
    };
    const data = await fetchAllPages(queryFn);
    return data.map((item: any) => ({
      ...item,
      productId: item.product_id ?? item.productId,
      variantId: item.variant_id ?? item.variantId,
      changeQty: item.change_qty ?? item.changeQty,
      balanceAfter: item.balance_after ?? item.balanceAfter,
      referenceId: item.reference_id ?? item.referenceId,
      createdAt: item.created_at ? new Date(item.created_at) : new Date(item.createdAt),
    }));
  }
};

/**
 * Product Addons Service
 */
export const productAddonsService = {
  async getByProduct(productId: string): Promise<ProductAddon[]> {
    const items = await localDb.productAddons
      .where('productId').equals(productId)
      .toArray();
    return items.filter(a => a.active);
  },

  async create(addon: Omit<ProductAddon, 'id' | 'createdAt'>): Promise<ProductAddon> {
    const id = generateId();
    const now = new Date();
    const newAddon = { ...addon, id, createdAt: now } as ProductAddon;
    await localDb.productAddons.add(newAddon);
    await queueOp('product_addons', 'create', id, toRemoteProductAddon(newAddon));
    return newAddon;
  },

  async update(id: string, updates: Partial<ProductAddon>): Promise<void> {
    await localDb.productAddons.update(id, updates);
    await queueOp('product_addons', 'update', id, toRemoteProductAddon({ ...updates, id }));
  },

  async delete(id: string): Promise<void> {
    await localDb.productAddons.delete(id);
    await queueOp('product_addons', 'delete', id, {});
  },

  async fetchRemote(lastSyncTime?: Date): Promise<ProductAddon[]> {
    const queryFn = () => {
      let q = supabase.from('product_addons').select('*');
      if (lastSyncTime) q = q.gte('updated_at', lastSyncTime.toISOString());
      return q;
    };
    const data = await fetchAllPages(queryFn);
    return data.map((item: any) => ({
      ...item,
      productId: item.product_id ?? item.productId,
      createdAt: item.created_at ? new Date(item.created_at) : new Date(item.createdAt),
    }));
  }
};

/**
 * Payment Modes Service
 */
export const paymentModesService = {
  async fetchRemote(lastSyncTime?: Date): Promise<Payment[]> {
    const queryFn = () => {
      let q = supabase.from('payments').select('*');
      if (lastSyncTime) q = q.gte('updated_at', lastSyncTime.toISOString());
      return q;
    };
    let data;
    try {
      data = await fetchAllPages(queryFn);
    } catch {
      // Fallback: fetch all if updated_at column doesn't exist
      console.warn('[payments] Delta sync failed, fetching all');
      data = await fetchAllPages(() => supabase.from('payments').select('*'));
    }
    return data.map((item: any) => ({
      ...item,
      createdAt: item.created_at ? new Date(item.created_at) : new Date(item.createdAt),
    }));
  }
};



// auditStockIntegrity removed — batch system deprecated
/**
 * Barcode Seeding / Population (RULE F1 / CODE 128)
 * Fetches existing products where barcode_value is null or empty,
 * generates a ZP-{5-digit} barcode for each, and updates cloud and local database.
 */
export const seedMissingBarcodes = async (): Promise<{ count: number; updated: string[] }> => {
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, barcode, barcode_value')
    .or('barcode_value.is.null,barcode_value.eq.""');

  if (error) throw error;
  if (!products || products.length === 0) {
    return { count: 0, updated: [] };
  }

  const updatedNames: string[] = [];
  for (const prod of products) {
    const val = prod.barcode || generateBarcodeValue(prod.name || prod.id);
    await supabase.from('products').update({ barcode_value: val }).eq('id', prod.id);
    await localDb.products.where('id').equals(prod.id).modify({ barcodeValue: val, barcode: val });
    updatedNames.push(prod.name);
  }

  return { count: updatedNames.length, updated: updatedNames };
};

// ─────────────────────────────────────────────────────────────────────────────
// BUNDLE / DEAL SERVICE
// ─────────────────────────────────────────────────────────────────────────────

/** Map from Supabase row → Bundle object */
export const mapBundle = (row: any): Bundle => ({
  id: row.id,
  name: row.name || '',
  description: row.description || '',
  discountValue: Number(row.discount_value) || 0,
  discountType: row.discount_type || 'percentage',
  active: row.active !== false,
  scheduleType: row.schedule_type || 'always',
  startDate: row.start_date || undefined,
  endDate: row.end_date || undefined,
  repeatDays: row.repeat_days || undefined,
  startTime: row.start_time || undefined,
  endTime: row.end_time || undefined,
  hideItemPrices: row.hide_item_prices === true,
  image: row.image,
  extraToppings: (row.extra_toppings as any) || [],
  items: (row.bundle_items || []).map((bi: any): BundleItem => ({
    id: bi.id,
    bundleId: bi.bundle_id,
    productId: bi.product_id,
    quantity: Number(bi.quantity) || 1,
    createdAt: bi.created_at ? new Date(bi.created_at) : new Date(),
  })),
  isCombo: row.is_combo === true,
  dealCategory: row.deal_category || 'pizza',
  overridePrice: row.override_price ? Number(row.override_price) : undefined,
  highlightTag: row.highlight_tag ?? row.highlightTag,
  badgeEnabled: row.badge_enabled === true,
  badgeText: row.badge_text || undefined,
  badgeIcon: row.badge_icon || undefined,
  badgeBgColor: row.badge_bg_color || undefined,
  badgeTextColor: row.badge_text_color || undefined,
  slots: (row.bundle_slots || []).map((s: any) => ({
    id: s.id,
    bundleId: s.bundle_id,
    name: s.name,
    requiredQuantity: s.required_quantity,
    orderIndex: s.order_index,
    options: (s.bundle_slot_options || [])
      .map((o: any) => ({
        id: o.id,
        slotId: o.slot_id,
        productId: o.product_id,
        sortOrder: o.sort_order ?? 0,
      }))
      .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
  })),
  estoreSortOrder: row.estore_sort_order ?? row.estoreSortOrder ?? 0,
  createdAt: row.created_at ? new Date(row.created_at) : new Date(),
  updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
});

function _isNetworkError(e: any): boolean {
  if (!navigator.onLine) return true;
  const msg = (e?.message || e?.error_description || '').toLowerCase();
  return !e?.code || // No status code = didn't reach server
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('dns') ||
    msg.includes('eai_again') ||
    msg.includes('enotfound') ||
    msg.includes('getaddrinfo') ||
    msg.includes('failed, reason') ||
    msg.includes('load resource') ||
    msg.includes('quic') ||
    msg.includes('disconnected') ||
    msg.includes('timeout') ||
    msg.includes('abort');
}

export const bundlesService = {
  /** Fetch all active bundles with their items */
  async getAll(forceRemote: boolean = false): Promise<Bundle[]> {
    // Try local first if not forcing remote
    if (!forceRemote) {
      try {
        const local = await localDb.bundles.toArray();
        if (local.length > 0) {
          const localItems = await localDb.bundleItems.toArray();
          const localSlots = await localDb.bundleSlots.toArray();
          const localSlotOptions = await localDb.bundleSlotOptions.toArray();

          return local.map((b: any): Bundle => {
            const bundleSlots = localSlots
              .filter((s: any) => s.bundleId === b.id)
              .map((s: any) => ({
                ...s,
                options: localSlotOptions
                  .filter((opt: any) => opt.slotId === s.id)
                  .map((opt: any) => ({
                    id: opt.id,
                    slotId: opt.slotId,
                    productId: opt.productId,
                    sortOrder: opt.sortOrder ?? 0,
                  }))
                  .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
              }));

            return {
              id: b.id,
              name: b.name || '',
              description: b.description || '',
              discountValue: Number(b.discountValue) || 0,
              discountType: b.discountType || 'percentage',
              active: b.active !== false,
              hideItemPrices: b.hideItemPrices === true,
              image: b.image,
              isCombo: b.isCombo === true || b.is_combo === true,
              items: localItems.filter((bi: any) => bi.bundleId === b.id).map((bi: any): BundleItem => ({
                id: bi.id,
                bundleId: bi.bundleId,
                productId: bi.productId,
                quantity: Number(bi.quantity) || 1,
              })),
              slots: bundleSlots,
              estoreSortOrder: b.estoreSortOrder ?? b.estore_sort_order ?? 0,
              createdAt: b.createdAt ? new Date(b.createdAt) : new Date(),
              updatedAt: b.updatedAt ? new Date(b.updatedAt) : new Date(),
            };
          });
        }
      } catch (e) {
        console.warn('[bundlesService.getAll] Local fetch failed, trying cloud', e);
      }
    }

    // Cloud fetch
    const { data, error } = await supabase
      .from('bundles')
      .select('*, bundle_items(*), bundle_slots(*, bundle_slot_options(*))')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const bundles = (data || []).map(mapBundle);

    // Hydrate local db - clear first to handle deletions from other devices
    try {
      await localDb.transaction('rw', localDb.bundles, localDb.bundleItems, localDb.bundleSlots, localDb.bundleSlotOptions, async () => {
        await localDb.bundles.clear();
        await localDb.bundleItems.clear();
        await localDb.bundleSlots.clear();
        await localDb.bundleSlotOptions.clear();

        if (bundles.length > 0) {
          await localDb.bundles.bulkPut(bundles.map((b: Bundle) => ({
            id: b.id,
            name: b.name,
            description: b.description,
            discountValue: b.discountValue,
            discountType: b.discountType,
            active: b.active,
            hideItemPrices: b.hideItemPrices || false,
            isCombo: b.isCombo || false,
            image: b.image,
            createdAt: b.createdAt,
            updatedAt: b.updatedAt,
          })));

          const allItems = bundles.reduce((acc: any[], b: Bundle) => {
            if (b.items && b.items.length > 0) {
              acc.push(...b.items.map((bi: BundleItem) => ({
                id: bi.id,
                bundleId: bi.bundleId,
                productId: bi.productId,
                quantity: bi.quantity,
              })));
            }
            return acc;
          }, []);

          const allSlots = bundles.reduce((acc: any[], b: Bundle) => {
            if (b.slots && b.slots.length > 0) {
              acc.push(...b.slots.map((s: any) => ({
                id: s.id,
                bundleId: s.bundleId,
                name: s.name,
                requiredQuantity: s.requiredQuantity,
                orderIndex: s.orderIndex,
              })));
            }
            return acc;
          }, []);

          const allSlotOptions = bundles.reduce((acc: any[], b: Bundle) => {
            if (b.slots && b.slots.length > 0) {
              b.slots.forEach(s => {
                if (s.options && s.options.length > 0) {
                  acc.push(...s.options.map((opt: any) => ({
                    id: opt.id,
                    slotId: opt.slotId,
                    productId: opt.productId,
                    sortOrder: opt.sortOrder ?? 0,
                  })));
                }
              });
            }
            return acc;
          }, []);

          if (allItems.length > 0) await localDb.bundleItems.bulkPut(allItems);
          if (allSlots.length > 0) await localDb.bundleSlots.bulkPut(allSlots);
          if (allSlotOptions.length > 0) await localDb.bundleSlotOptions.bulkPut(allSlotOptions);

        }
      });
    } catch (e) {
      console.warn('[bundlesService.getAll] Failed to update local cache:', e);
    }

    return bundles;
  },

  /** Create a new bundle with its items (offline-first) */
  async create(data: {
    name: string;
    description?: string;
    discountValue: number;
    discountType: 'percentage' | 'fixed';
    items?: { productId: string; quantity: number }[];
    slots?: { name: string; requiredQuantity: number; orderIndex: number; options: { productId: string; sortOrder?: number }[] }[];
    hideItemPrices?: boolean;
    isCombo?: boolean;
    dealCategory?: 'pizza' | 'burger' | 'beverage' | 'single_item';
    overridePrice?: number;
    highlightTag?: 'sunday' | 'crown';
    badgeEnabled?: boolean;
    badgeText?: string;
    badgeIcon?: string;
    badgeBgColor?: string;
    badgeTextColor?: string;
    scheduleType?: 'always' | 'scheduled';
    startDate?: string;
    endDate?: string;
    repeatDays?: string[];
    startTime?: string;
    endTime?: string;
    extraToppings?: ExtraTopping[];
  }): Promise<Bundle> {
    const id = generateId();
    const now = new Date().toISOString();

    const itemRows = (data.items || []).map(item => ({
      id: generateId(),
      bundle_id: id,
      product_id: item.productId,
      quantity: item.quantity,
      created_at: now,
    }));

    const slotRows: any[] = [];
    const optionRows: any[] = [];

    if (data.slots) {
      data.slots.forEach(slot => {
        const slotId = generateId();
        slotRows.push({
          id: slotId,
          bundle_id: id,
          name: slot.name,
          required_quantity: slot.requiredQuantity,
          order_index: slot.orderIndex,
          created_at: now,
        });
        slot.options.forEach((opt, optIdx) => {
          optionRows.push({
            id: generateId(),
            slot_id: slotId,
            product_id: opt.productId,
            sort_order: opt.sortOrder ?? optIdx,
            created_at: now,
          });
        });
      });
    }

    // 1. Persist locally FIRST (offline-first)
    const bundleLocal = {
      id,
      name: data.name.trim(),
      description: data.description || '',
      discountValue: data.discountValue,
      discountType: data.discountType,
      scheduleType: data.scheduleType || 'always',
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      repeatDays: data.repeatDays || null,
      startTime: data.startTime || null,
      endTime: data.endTime || null,
      hideItemPrices: data.hideItemPrices || false,
      isCombo: data.isCombo || false,
      extraToppings: data.extraToppings || [],
      badgeEnabled: data.badgeEnabled || false,
      badgeText: data.badgeText || undefined,
      badgeIcon: data.badgeIcon || undefined,
      badgeBgColor: data.badgeBgColor || undefined,
      badgeTextColor: data.badgeTextColor || undefined,
      active: true,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
    await localDb.bundles.put(bundleLocal);

    if (itemRows.length > 0) {
      await localDb.bundleItems.bulkPut(itemRows.map(r => ({
        id: r.id,
        bundleId: id,
        productId: r.product_id,
        quantity: r.quantity,
      })));
    }

    if (slotRows.length > 0) {
      await localDb.bundleSlots.bulkPut(slotRows.map(r => ({
        id: r.id,
        bundleId: id,
        name: r.name,
        requiredQuantity: r.required_quantity,
        orderIndex: r.order_index,
      })));
      await localDb.bundleSlotOptions.bulkPut(optionRows.map(r => ({
        id: r.id,
        slotId: r.slot_id,
        productId: r.product_id,
        sortOrder: r.sort_order ?? 0,
      })));
    }

    // 2. Try cloud sync (best-effort)
    try {
      const { error } = await supabase.from('bundles').insert({
        id,
        name: data.name.trim(),
        description: data.description || '',
        discount_value: data.discountValue,
        discount_type: data.discountType,
        schedule_type: data.scheduleType || 'always',
        start_date: data.startDate || null,
        end_date: data.endDate || null,
        repeat_days: data.repeatDays || null,
        start_time: data.startTime || null,
        end_time: data.endTime || null,
        hide_item_prices: data.hideItemPrices || false,
        is_combo: data.isCombo || false,
        deal_category: data.dealCategory || 'pizza',
        override_price: data.overridePrice || null,
        badge_enabled: data.badgeEnabled || false,
        badge_text: data.badgeText || null,
        badge_icon: data.badgeIcon || null,
        badge_bg_color: data.badgeBgColor || null,
        badge_text_color: data.badgeTextColor || null,
        extra_toppings: data.extraToppings || [],
        active: true,
        created_at: now,
        updated_at: now,
      });
      if (error) throw error;

      if (itemRows.length > 0) {
        const { error: itemError } = await supabase.from('bundle_items').insert(itemRows);
        if (itemError) throw itemError;
      }
      if (slotRows.length > 0) {
        const { error: slotError } = await supabase.from('bundle_slots').insert(slotRows);
        if (slotError) throw slotError;
        if (optionRows.length > 0) {
          const { error: optError } = await supabase.from('bundle_slot_options').insert(optionRows);
          if (optError) throw optError;
        }
      }
    } catch (e: any) {
      // 3. Network failed — queue sync op
      console.warn('[bundlesService.create] Cloud save failed, queuing for sync:', e.message);
      if (_isNetworkError(e)) {
        await queueOp('bundles', 'create', id, {
          id,
          name: data.name.trim(),
          description: data.description || '',
          discount_value: data.discountValue,
          discount_type: data.discountType,
          schedule_type: data.scheduleType || 'always',
          start_date: data.startDate || null,
          end_date: data.endDate || null,
          repeat_days: data.repeatDays || null,
          start_time: data.startTime || null,
          end_time: data.endTime || null,
          hide_item_prices: data.hideItemPrices || false,
          is_combo: data.isCombo || false,
          deal_category: data.dealCategory || 'pizza',
          override_price: data.overridePrice || null,
          badge_enabled: data.badgeEnabled || false,
          badge_text: data.badgeText || null,
          badge_icon: data.badgeIcon || null,
          badge_bg_color: data.badgeBgColor || null,
          badge_text_color: data.badgeTextColor || null,
          extra_toppings: data.extraToppings || [],
          active: true,
          created_at: now,
          updated_at: now,
        });
        for (const item of itemRows) await queueOp('bundle_items', 'create', item.id, item);
        for (const slot of slotRows) await queueOp('bundle_slots', 'create', slot.id, slot);
        for (const opt of optionRows) await queueOp('bundle_slot_options', 'create', opt.id, opt);
      } else {
        throw e; // Re-throw real errors
      }
    }

    return {
      ...bundleLocal,
      items: itemRows.map(r => ({ id: r.id, bundleId: id, productId: r.product_id, quantity: r.quantity })),
      slots: slotRows.map(r => ({
        id: r.id, bundleId: id, name: r.name, requiredQuantity: r.required_quantity, orderIndex: r.order_index,
        options: optionRows.filter(o => o.slot_id === r.id).map(o => ({ id: o.id, slotId: r.id, productId: o.product_id, sortOrder: o.sort_order ?? 0 }))
      })),
    };
  },

  /** Update bundle (replaces all items and slots) (offline-first) */
  async update(bundleId: string, data: {
    name?: string;
    description?: string;
    discountValue?: number;
    discountType?: 'percentage' | 'fixed';
    hideItemPrices?: boolean;
    active?: boolean;
    items?: { productId: string; quantity: number }[];
    slots?: { name: string; requiredQuantity: number; orderIndex: number; options: { productId: string; sortOrder?: number }[] }[];
    isCombo?: boolean;
    estoreSortOrder?: number;
    image?: string;
    highlightTag?: 'sunday' | 'crown';
    badgeEnabled?: boolean;
    badgeText?: string;
    badgeIcon?: string;
    badgeBgColor?: string;
    badgeTextColor?: string;
    scheduleType?: 'always' | 'scheduled';
    startDate?: string;
    endDate?: string;
    repeatDays?: string[];
    startTime?: string;
    endTime?: string;
    extraToppings?: ExtraTopping[];
  }): Promise<void> {
    const now = new Date().toISOString();
    const updates: any = { updated_at: now };
    if (data.name !== undefined) updates.name = data.name.trim();
    if (data.description !== undefined) updates.description = data.description;
    if (data.discountValue !== undefined) updates.discount_value = data.discountValue;
    if (data.discountType !== undefined) updates.discount_type = data.discountType;
    if (data.hideItemPrices !== undefined) updates.hide_item_prices = data.hideItemPrices;
    if (data.isCombo !== undefined) updates.is_combo = data.isCombo;
    if (data.active !== undefined) updates.active = data.active;
    if (data.estoreSortOrder !== undefined) updates.estore_sort_order = data.estoreSortOrder;
    if (data.image !== undefined) updates.image = data.image;
    if (data.highlightTag !== undefined) updates.highlight_tag = data.highlightTag;
    if (data.badgeEnabled !== undefined) updates.badge_enabled = data.badgeEnabled;
    if (data.badgeText !== undefined) updates.badge_text = data.badgeText;
    if (data.badgeIcon !== undefined) updates.badge_icon = data.badgeIcon;
    if (data.badgeBgColor !== undefined) updates.badge_bg_color = data.badgeBgColor;
    if (data.badgeTextColor !== undefined) updates.badge_text_color = data.badgeTextColor;
    if (data.dealCategory !== undefined) updates.deal_category = data.dealCategory;
    if (data.overridePrice !== undefined) updates.override_price = data.overridePrice;
    if (data.scheduleType !== undefined) updates.schedule_type = data.scheduleType;
    if (data.startDate !== undefined) updates.start_date = data.startDate || null;
    if (data.endDate !== undefined) updates.end_date = data.endDate || null;
    if (data.repeatDays !== undefined) updates.repeat_days = data.repeatDays || null;
    if (data.startTime !== undefined) updates.start_time = data.startTime || null;
    if (data.endTime !== undefined) updates.end_time = data.endTime || null;
    if (data.extraToppings !== undefined) updates.extra_toppings = data.extraToppings;

    // Update local FIRST (offline-first)
    const localUpdates: any = { updatedAt: new Date(now) };
    if (data.name !== undefined) localUpdates.name = data.name.trim();
    if (data.description !== undefined) localUpdates.description = data.description;
    if (data.discountValue !== undefined) localUpdates.discountValue = data.discountValue;
    if (data.discountType !== undefined) localUpdates.discountType = data.discountType;
    if (data.hideItemPrices !== undefined) localUpdates.hideItemPrices = data.hideItemPrices;
    if (data.isCombo !== undefined) localUpdates.isCombo = data.isCombo;
    if (data.active !== undefined) localUpdates.active = data.active;
    if (data.estoreSortOrder !== undefined) localUpdates.estoreSortOrder = data.estoreSortOrder;
    if (data.image !== undefined) localUpdates.image = data.image;
    if (data.highlightTag !== undefined) localUpdates.highlightTag = data.highlightTag;
    if (data.badgeEnabled !== undefined) localUpdates.badgeEnabled = data.badgeEnabled;
    if (data.badgeText !== undefined) localUpdates.badgeText = data.badgeText;
    if (data.badgeIcon !== undefined) localUpdates.badgeIcon = data.badgeIcon;
    if (data.badgeBgColor !== undefined) localUpdates.badgeBgColor = data.badgeBgColor;
    if (data.badgeTextColor !== undefined) localUpdates.badgeTextColor = data.badgeTextColor;
    if (data.dealCategory !== undefined) localUpdates.dealCategory = data.dealCategory;
    if (data.overridePrice !== undefined) localUpdates.overridePrice = data.overridePrice;
    if (data.scheduleType !== undefined) localUpdates.scheduleType = data.scheduleType;
    if (data.startDate !== undefined) localUpdates.startDate = data.startDate || null;
    if (data.endDate !== undefined) localUpdates.endDate = data.endDate || null;
    if (data.repeatDays !== undefined) localUpdates.repeatDays = data.repeatDays || null;
    if (data.startTime !== undefined) localUpdates.startTime = data.startTime || null;
    if (data.endTime !== undefined) localUpdates.endTime = data.endTime || null;
    if (data.extraToppings !== undefined) localUpdates.extraToppings = data.extraToppings;

    await localDb.bundles.where('id').equals(bundleId).modify(localUpdates);

    // Replace items locally
    const itemRows = data.items ? data.items.map(item => ({
      id: generateId(),
      bundleId: bundleId,
      productId: item.productId,
      quantity: item.quantity,
    })) : undefined;

    if (itemRows !== undefined) {
      await localDb.bundleItems.where('bundleId').equals(bundleId).delete();
      if (itemRows.length > 0) await localDb.bundleItems.bulkPut(itemRows);
    }

    // Replace slots locally
    let slotRows: any[] | undefined = undefined;
    let optionRows: any[] | undefined = undefined;
    if (data.slots !== undefined) {
      slotRows = [];
      optionRows = [];
      data.slots.forEach(slot => {
        const slotId = generateId();
        slotRows!.push({
          id: slotId,
          bundleId: bundleId,
          name: slot.name,
          requiredQuantity: slot.requiredQuantity,
          orderIndex: slot.orderIndex,
        });
        slot.options.forEach((opt, optIdx) => {
          optionRows!.push({
            id: generateId(),
            slotId: slotId,
            productId: opt.productId,
            sortOrder: opt.sortOrder ?? optIdx,
          });
        });
      });

      await localDb.bundleSlots.where('bundleId').equals(bundleId).delete();
      const oldSlots = await localDb.bundleSlots.where('bundleId').equals(bundleId).toArray();
      for (const oldSlot of oldSlots) {
        await localDb.bundleSlotOptions.where('slotId').equals(oldSlot.id).delete();
      }

      if (slotRows.length > 0) {
        await localDb.bundleSlots.bulkPut(slotRows);
        await localDb.bundleSlotOptions.bulkPut(optionRows);
      }
    }

    // Try cloud sync (best-effort)
    try {
      if (Object.keys(updates).length > 1) {
        const { error } = await supabase.from('bundles').update(updates).eq('id', bundleId);
        if (error) throw error;
      }

      if (itemRows !== undefined) {
        const { error: delError } = await supabase.from('bundle_items').delete().eq('bundle_id', bundleId);
        if (delError) throw delError;
        if (itemRows.length > 0) {
          const insertItemRows = itemRows.map(r => ({
            id: r.id, bundle_id: r.bundleId, product_id: r.productId, quantity: r.quantity, created_at: now
          }));
          const { error: insErr } = await supabase.from('bundle_items').insert(insertItemRows);
          if (insErr) throw insErr;
        }
      }

      if (slotRows !== undefined && optionRows !== undefined) {
        const { error: delSlotsError } = await supabase.from('bundle_slots').delete().eq('bundle_id', bundleId);
        if (delSlotsError) throw delSlotsError;

        if (slotRows.length > 0) {
          const insertSlotRows = slotRows.map(r => ({
            id: r.id, bundle_id: r.bundleId, name: r.name, required_quantity: r.requiredQuantity, order_index: r.orderIndex, created_at: now
          }));
          const { error: insSlotsErr } = await supabase.from('bundle_slots').insert(insertSlotRows);
          if (insSlotsErr) throw insSlotsErr;

          if (optionRows.length > 0) {
            const insertOptRows = optionRows.map(r => ({
              id: r.id, slot_id: r.slotId, product_id: r.productId, sort_order: r.sortOrder ?? 0, created_at: now
            }));
            const { error: insOptsErr } = await supabase.from('bundle_slot_options').insert(insertOptRows);
            if (insOptsErr) throw insOptsErr;
          }
        }
      }
    } catch (e: any) {
      console.warn('[bundlesService.update] Cloud save failed, queuing for sync:', e.message);
      if (_isNetworkError(e)) {
        if (Object.keys(updates).length > 1) {
          await queueOp('bundles', 'update', bundleId, updates);
        }

        if (itemRows !== undefined) {
          console.warn('Nested arrays (items) update offline may cause duplicates upon sync if not carefully handled.');
          for (const item of itemRows) {
            await queueOp('bundle_items', 'create', item.id, {
              id: item.id, bundle_id: bundleId, product_id: item.productId, quantity: item.quantity, created_at: now
            });
          }
        }
        if (slotRows !== undefined && optionRows !== undefined) {
          for (const slot of slotRows) {
            await queueOp('bundle_slots', 'create', slot.id, {
              id: slot.id, bundle_id: bundleId, name: slot.name, required_quantity: slot.requiredQuantity, order_index: slot.orderIndex, created_at: now
            });
          }
          for (const opt of optionRows) {
            await queueOp('bundle_slot_options', 'create', opt.id, {
              id: opt.id, slot_id: opt.slotId, product_id: opt.productId, sort_order: opt.sortOrder ?? 0, created_at: now
            });
          }
        }
      } else {
        throw e;
      }
    }
  },

  /** Delete bundle and all its items (offline-first) */
  async delete(bundleId: string): Promise<void> {
    // Optimistic local delete
    await localDb.bundleItems.where('bundleId').equals(bundleId).delete();
    const oldSlots = await localDb.bundleSlots.where('bundleId').equals(bundleId).toArray();
    for (const oldSlot of oldSlots) {
      await localDb.bundleSlotOptions.where('slotId').equals(oldSlot.id).delete();
    }
    await localDb.bundleSlots.where('bundleId').equals(bundleId).delete();
    await localDb.bundles.delete(bundleId);

    // Try cloud sync
    try {
      const { error: itemsError } = await supabase.from('bundle_items').delete().eq('bundle_id', bundleId);
      if (itemsError) throw itemsError;
      const { error } = await supabase.from('bundles').delete().eq('id', bundleId);
      if (error) throw error;
    } catch (e: any) {
      console.warn('[bundlesService.delete] Cloud delete failed, queuing for sync:', e.message);
      if (_isNetworkError(e)) {
        await queueOp('bundles', 'delete', bundleId, {});
      } else {
        throw e;
      }
    }
  },

  /**
   * Converts a bundle into CartItems with PROPORTIONAL discount (Option A).
   * Each product's discount is proportional to its price share of the bundle total.
   */
   getBundleCartItems(bundle: Bundle, products: Product[], variantTier?: number): CartItem[] {
    if (!bundle.items || bundle.items.length === 0) return [];

    // Build line items with resolved product data.
    // E3: when a size tier is selected (e.g. Large), use the variant priceOverride instead of
    // the base product.price — otherwise the cart charged the Small price while the modal showed
    // the Large price, over-charging the customer. variantTier is optional so POS (which prices
    // bundles at base) is unaffected when omitted.
    const lines: { product: Product; quantity: number; linePrice: number }[] = [];
    for (const bi of bundle.items) {
      const product = products.find(p => p.id === bi.productId);
      if (!product) continue;
      const tierPrice = (typeof variantTier === 'number' && product.variantData && product.variantData.length > variantTier)
        ? (product.variantData[variantTier].priceOverride ?? product.price)
        : product.price;
      lines.push({
        product,
        quantity: bi.quantity,
        linePrice: tierPrice * bi.quantity,
      });
    }

    if (lines.length === 0) return [];

    const totalBundlePrice = lines.reduce((sum, l) => sum + l.linePrice, 0);

    // Calculate total discount amount. If the bundle has a fixed overridePrice, the
    // effective discount is the difference between the summed item price and that
    // override (P1: previously overridePrice was ignored, so the cart charged the
    // items-minus-discount total instead of the advertised fixed price).
    const overridePrice = typeof bundle.overridePrice === 'number' && bundle.overridePrice >= 0
      ? bundle.overridePrice
      : null;
    const totalDiscountAmount = overridePrice !== null
      ? Math.max(0, Math.round((totalBundlePrice - overridePrice) * 100) / 100)
      : (bundle.discountType === 'percentage'
        ? (totalBundlePrice * bundle.discountValue) / 100
        : Math.min(bundle.discountValue, totalBundlePrice));

    // Apply proportional discount to each line
    const lineDiscounts = lines.map(line => {
      const proportion = totalBundlePrice > 0 ? line.linePrice / totalBundlePrice : 0;
      return Math.round(totalDiscountAmount * proportion * 100) / 100;
    });
    // Fix per-line rounding drift so Σ lineDiscount === totalDiscountAmount exactly (B4),
    // otherwise the realised bundle discount leaks/over-charges by up to a few cents.
    const discountSum = lineDiscounts.reduce((s, d) => s + d, 0);
    const drift = Math.round((totalDiscountAmount - discountSum) * 100) / 100;
    if (drift !== 0 && lineDiscounts.length > 0) {
      lineDiscounts[lineDiscounts.length - 1] = Math.round((lineDiscounts[lineDiscounts.length - 1] + drift) * 100) / 100;
    }

    return lines.map((line, idx) => {
      const lineDiscount = lineDiscounts[idx];
      const subtotal = line.linePrice - lineDiscount;

      return {
        product: line.product,
        quantity: line.quantity,
        discount: lineDiscount,
        discountValue: bundle.discountValue,
        discountType: bundle.discountType,
        subtotal,
        bundleId: bundle.id,
        bundleName: bundle.name,
        bundleHideItemPrices: bundle.hideItemPrices || false,
      } as CartItem;
    });
  },
};

// ────────────────────────────────────────────────────────────────
// TOPPINGS SERVICE
// ────────────────────────────────────────────────────────────────

export const mapTopping = (row: any): Topping => ({
  id: row.id,
  name: row.name,
  priceSmall: parseFloat(row.price_small) || 0,
  priceMedium: parseFloat(row.price_medium) || 0,
  priceLarge: parseFloat(row.price_large) || 0,
  createdAt: row.created_at ? new Date(row.created_at) : new Date(),
});

export const toRemoteTopping = (topping: Partial<Topping>): any => ({
  id: topping.id,
  name: topping.name,
  price_small: topping.priceSmall,
  price_medium: topping.priceMedium,
  price_large: topping.priceLarge,
});

export const toppingsService = {
  async fetchAll(): Promise<Topping[]> {
    const { data, error } = await supabase
      .from('toppings')
      .select('*')
      .order('name');
    if (error) throw error;
    return (data || []).map(mapTopping);
  },

  async create(topping: Partial<Topping>): Promise<Topping> {
    const { data, error } = await supabase
      .from('toppings')
      .insert(toRemoteTopping(topping))
      .select()
      .single();
    if (error) throw error;
    return mapTopping(data);
  },

  async update(id: string, topping: Partial<Topping>): Promise<Topping> {
    const { data, error } = await supabase
      .from('toppings')
      .update(toRemoteTopping(topping))
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return mapTopping(data);
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from('toppings')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },
};

// ────────────────────────────────────────────────────────────────
// PRODUCT / SLOT TOPPINGS JOIN SERVICES
// ────────────────────────────────────────────────────────────────

export const productToppingsService = {
  async getByProduct(productId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('product_toppings')
      .select('topping_id')
      .eq('product_id', productId);
    if (error) throw error;
    return (data || []).map(r => r.topping_id);
  },

  async setByProduct(productId: string, toppingIds: string[]): Promise<void> {
    const { error: delErr } = await supabase
      .from('product_toppings')
      .delete()
      .eq('product_id', productId);
    if (delErr) throw delErr;
    if (toppingIds.length === 0) return;
    const rows = toppingIds.map(toppingId => ({ product_id: productId, topping_id: toppingId }));
    const { error: insErr } = await supabase
      .from('product_toppings')
      .insert(rows);
    if (insErr) throw insErr;
  },
};


// ────────────────────────────────────────────────────────────────
// STOCK RECONCILE TOOL (RULE F11 — PERMANENT)
// ────────────────────────────────────────────────────────────────

export interface ReconcileResult {
  ok: boolean;
  mismatches: { productId: string; variantId?: string; name: string; expected: number; actual: number; diff: number }[];
  totalChecked: number;
  fixed: number;
}

/**
 * REAL AUDIT — computes expected stock from the append-only stock_history ledger
 * (Σ change_qty per product) and compares against products.stock (remote truth).
 * Optionally writes corrective adjustment history entries (autoFix).
 */
export async function reconcileAllStock(autoFix = false): Promise<ReconcileResult> {
  const { localDb, queueOp, generateId } = await import('./localDb');

  // 1. Fetch FULL cloud ledger — scalar + variant (append-only, never the trimmed local cache)
  const { data: historyRows, error } = await supabase
    .from('stock_history')
    .select('product_id, change_qty');
  if (error) throw new Error(`Cannot fetch stock_history for audit: ${error.message}`);

  const { data: vHistoryRows, error: vErr } = await supabase
    .from('variant_stock_history')
    .select('product_id, variant_id, change_qty');
  if (vErr) throw new Error(`Cannot fetch variant_stock_history for audit: ${vErr.message}`);

  if ((!historyRows || historyRows.length === 0) && (!vHistoryRows || vHistoryRows.length === 0)) {
    return { ok: true, mismatches: [], totalChecked: 0, fixed: 0 };
  }

  // 2. Compute expected = Σ change_qty per product (scalar) and per (product|variant)
  const expectedByProduct = new Map<string, number>();
  for (const row of historyRows || []) {
    const qty = Number(row.change_qty) || 0;
    expectedByProduct.set(row.product_id, (expectedByProduct.get(row.product_id) || 0) + qty);
  }
  const expectedByVariant = new Map<string, number>();
  for (const row of vHistoryRows || []) {
    const qty = Number(row.change_qty) || 0;
    const key = `${row.product_id}::${row.variant_id}`;
    expectedByVariant.set(key, (expectedByVariant.get(key) || 0) + qty);
  }

  // 3. Fetch cloud products (with variant_data so we can audit variant stock too)
  const { data: productRows, error: pErr } = await supabase
    .from('products')
    .select('id, name, stock, variant_data')
    .eq('track_inventory', true);
  if (pErr) throw new Error(`Cannot fetch products for audit: ${pErr.message}`);

  const mismatches: ReconcileResult['mismatches'] = [];
  let fixed = 0;

  for (const prod of productRows || []) {
    // 3a. Scalar stock
    const expected = expectedByProduct.get(prod.id) ?? 0;
    const actual = Number(prod.stock) || 0;
    if (expected !== actual) {
      mismatches.push({ productId: prod.id, name: prod.name || 'Unknown', expected, actual, diff: expected - actual });
    }
    // 3b. Variant stock (F22 — variant ledger must be reconciled independently)
    const variantData: any[] = prod.variant_data || [];
    for (const v of variantData) {
      const key = `${prod.id}::${v.id}`;
      const vExpected = expectedByVariant.get(key) ?? 0;
      const vActual = Number(v.stock) || 0;
      if (vExpected !== vActual) {
        mismatches.push({
          productId: prod.id,
          variantId: v.id,
          name: `${prod.name || 'Unknown'} / ${v.cardTitle || v.option1 || v.id}`,
          expected: vExpected,
          actual: vActual,
          diff: vExpected - vActual,
        });
      }
    }
  }

  // 4. Auto-fix: write ONE corrective adjustment entry per mismatch. The cloud triggers align
  //    products.stock (scalar) and variant_data[].stock (variant) = expected. Each fix is itself a
  //    history entry → the ledger stays append-only and self-consistent (offline-safe via queue).
  if (autoFix && mismatches.length > 0) {
    const now = new Date();
    // Valid UUID for reference_id (column is UUID type, nullable) — the RECONCILE context
    // already lives in the `note` field, so a generated UUID satisfies the constraint.
    const reconcileRef = generateId();
    for (const m of mismatches) {
      const changeQty = m.expected - m.actual;
      if (changeQty === 0) continue;

      if (m.variantId) {
        // Variant correction
        const histId = generateId();
        const remoteEntry = {
          id: histId,
          product_id: m.productId,
          variant_id: m.variantId,
          variant_label: m.name,
          change_qty: changeQty,
          type: 'adjustment',
          reference_id: reconcileRef,
          note: `[RECONCILE] variant auto-fix: expected ${m.expected}, was ${m.actual}`,
          cashier_name: 'System',
          created_at: now.toISOString(),
        };
        const localEntry = {
          id: histId,
          productId: m.productId,
          variantId: m.variantId,
          variantLabel: m.name,
          changeQty,
          type: 'adjustment' as const,
          referenceId: reconcileRef,
          note: `[RECONCILE] variant auto-fix: expected ${m.expected}, was ${m.actual}`,
          balanceAfter: m.expected,
          cashierName: 'System',
          createdAt: now,
        };
        await localDb.variantStockHistory.add(localEntry);
        await queueOp('variant_stock_history', 'create', histId, remoteEntry);
        const localProd = await localDb.products.get(m.productId);
        if (localProd && localProd.variantData) {
          const updatedVD = localProd.variantData.map(v =>
            v.id === m.variantId ? { ...v, stock: m.expected, updatedAt: now } : v
          );
          await localDb.products.update(m.productId, { variantData: updatedVD, updatedAt: now });
        }
      } else {
        // Scalar correction
        const histId = generateId();
        const remoteEntry = {
          id: histId,
          product_id: m.productId,
          change_qty: changeQty,
          type: 'adjustment',
          reference_id: reconcileRef,
          note: `[RECONCILE] auto-fix: expected ${m.expected}, was ${m.actual}`,
          balance_after: m.expected,
          cashier_name: 'System',
          created_at: now.toISOString(),
        };
        const localEntry = {
          id: histId,
          productId: m.productId,
          changeQty,
          type: 'adjustment' as const,
          referenceId: reconcileRef,
          note: `[RECONCILE] auto-fix: expected ${m.expected}, was ${m.actual}`,
          balanceAfter: m.expected,
          cashierName: 'System',
          createdAt: now,
        };
        await localDb.stockHistory.add(localEntry);
        await queueOp('stock_history', 'create', histId, remoteEntry);
        const localProd = await localDb.products.get(m.productId);
        if (localProd) {
          await localDb.products.update(m.productId, { stock: m.expected, updatedAt: now });
        }
      }
      fixed++;
    }
  }

  return {
    ok: mismatches.length === 0 || (autoFix && fixed === mismatches.length),
    mismatches,
    totalChecked: productRows?.length || 0,
    fixed,
  };
}

/**
 * M18 — Local↔Cloud inventory drift detection (non-destructive).
 * `reconcileAllStock` audits CLOUD self-consistency (stock vs stock_history ledger only).
 * This detects drift BETWEEN the local IndexedDB cache and the cloud `products` table,
 * which can appear after a partial/failed sync or a conflicting offline edit.
 * Returns mismatches only — never mutates data. Wire to a "Diagnose" button in Inventory.
 */
export async function detectInventoryDrift(): Promise<{
  ok: boolean;
  totalChecked: number;
  mismatches: Array<{
    productId: string;
    name: string;
    local: number;
    cloud: number;
    diff: number;
    variantId?: string;
  }>;
}> {
  const { localDb } = await import('./localDb');
  const { data: cloudRows, error } = await supabase
    .from('products')
    .select('id, name, stock, variant_data');
  if (error) throw new Error(`detectInventoryDrift cloud fetch failed: ${error.message}`);

  const localProducts = await localDb.products.toArray();
  const localMap = new Map(localProducts.map((p) => [p.id, p as any]));

  const mismatches: Array<{
    productId: string;
    name: string;
    local: number;
    cloud: number;
    diff: number;
    variantId?: string;
  }> = [];

  for (const c of (cloudRows as any[]) || []) {
    const local = localMap.get(c.id);
    if (!local) continue; // cloud-only row: not a stock mismatch

    const cloudStock = Number(c.stock) || 0;
    const localStock = Number(local.stock) || 0;
    if (cloudStock !== localStock) {
      mismatches.push({
        productId: c.id,
        name: c.name || 'Unknown',
        local: localStock,
        cloud: cloudStock,
        diff: localStock - cloudStock,
      });
    }

    const cloudVariants: any[] = c.variant_data || [];
    const localVariants: any[] = local.variantData || [];
    for (const cv of cloudVariants) {
      const lv = localVariants.find((v) => v.id === cv.id);
      const lvs = lv ? Number(lv.stock) || 0 : 0;
      const cvs = Number(cv.stock) || 0;
      if (lvs !== cvs) {
        mismatches.push({
          productId: c.id,
          variantId: cv.id,
          name: `${c.name || 'Unknown'} / ${cv.cardTitle || cv.option1 || cv.id}`,
          local: lvs,
          cloud: cvs,
          diff: lvs - cvs,
        });
      }
    }
  }

  return { ok: mismatches.length === 0, totalChecked: cloudRows?.length || 0, mismatches };
}
