import { supabase } from './supabase';
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
  RefundRequest
} from '../types';
import { localDb, queueOp, generateId, SETTINGS_ID } from './localDb';
import { generateBarcodeValue } from '../utils/barcode';

/**
 * Standard Utility for ID generation
 */
export { generateId };

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
  const deviceId = getDeviceId();
  const nextCounter = settings.invoiceCounter + 1;
  return `${settings.invoicePrefix}-${deviceId}-${nextCounter.toString().padStart(6, '0')}`;
}

// Generate next invoice number and return data for updating settings
export function generateNextInvoiceNumber(settings: AppSettings): { invoiceNumber: string; newCounter: number } {
  const deviceId = getDeviceId();
  const newCounter = settings.invoiceCounter + 1;
  const invoiceNumber = `${settings.invoicePrefix}-${deviceId}-${newCounter.toString().padStart(6, '0')}`;
  return { invoiceNumber, newCounter };
}

/**
 * CUSTOMER CREDIT CALCULATION HELPERS
 */
export const getCustomerCreditStatus = (customer: Customer, newSaleTotal: number) => {
  const limit = Number(customer.creditLimit) || 0;
  const used = Number(customer.creditUsed) || 0;
  const available = limit - used;
  const afterSale = used + newSaleTotal;

  return {
    limit,
    used,
    available,
    afterSale,
    isUnlimited: limit === 0, // In this system, 0 usually means no limit set or blocked depending on context
    isBlocked: limit === -1, // Hard block
    willExceed: limit > 0 && afterSale > limit,
    usagePercent: limit > 0 ? (used / limit) * 100 : 0,
    isNearLimit: limit > 0 && (used / limit) >= 0.75
  };
};

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

export const mapCustomer = (item: any): Customer => ({
  ...item,
  priceTier: item.price_tier ?? item.priceTier,
  creditLimit: item.credit_limit ?? item.creditLimit,
  creditUsed: item.credit_used ?? item.creditUsed,
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
  if (sale.splitPayments && sale.splitPayments.length > 0) {
    return (sale.splitPayments || [])
      .filter((sp: any) => sp.method === method)
      .reduce((sum: number, sp: any) => sum + (Number(sp.amount) || 0), 0);
  }
  
  if (sale.paymentMethod === 'credit') {
    if (method === 'cash') return sale.receivedAmount || 0; // Advance paid in cash
    if (method === 'credit') return (Number(sale.total) || 0) - (sale.receivedAmount || 0); // Remaining debt
    return 0;
  }
  
  return sale.paymentMethod === method ? (Number(sale.total) || 0) : 0;
}

export const mapSale = (item: any): Sale => ({
  ...item,
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
  appliedDiscounts: item.applied_discounts ?? item.appliedDiscounts,
  freeGifts: item.free_gifts ?? item.freeGifts,
  saleDate: item.sale_date ?? item.saleDate,
  saleType: item.sale_type ?? item.saleType,
  extraCharges: item.extra_charges ?? item.extraCharges,
  splitPayments: item.split_payments ?? item.splitPayments,
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
    allowCreditOverLimit: s.allow_credit_over_limit ?? s.allowCreditOverLimit ?? true,

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
  if ('allowCreditOverLimit' in s) { remote.allow_credit_over_limit = s.allowCreditOverLimit; }
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
  costPrice: item.cost_price ? Number(item.cost_price) : 0,
  qtyRemaining: item.qty_remaining ?? item.qtyRemaining,
  date: item.date ? new Date(item.date) : new Date(),
  createdAt: item.created_at ? new Date(item.created_at) : new Date(item.createdAt),
  updatedAt: item.updated_at ? new Date(item.updated_at) : new Date(item.updatedAt)
});

export const mapProductBatch = (item: any): ProductBatch => ({
  ...item,
  productId: item.product_id ?? item.productId,
  batchNumber: item.batch_number ?? item.batchNumber,
  batchType: item.batch_type ?? item.batchType,
  qtyRemaining: item.qty_remaining ?? item.qtyRemaining,
  costPrice: item.cost_price ? Number(item.cost_price) : 0,
  salePrice: item.sale_price ? Number(item.sale_price) : 0,
  supplierId: item.supplier_id ?? item.supplierId,
  supplierName: item.supplier_name ?? item.supplierName,
  poId: item.po_id ?? item.poId,
  manufacturingDate: item.manufacturing_date ? new Date(item.manufacturing_date) : (item.manufacturingDate ? new Date(item.manufacturingDate) : undefined),
  expiryDate: item.expiry_date ? new Date(item.expiry_date) : (item.expiryDate ? new Date(item.expiryDate) : undefined),
  createdAt: item.created_at ? new Date(item.created_at) : new Date(item.createdAt),
  updatedAt: item.updated_at ? new Date(item.updated_at) : new Date(item.updatedAt)
});

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
  if ('createdAt' in p) { remote.created_at = p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt; delete remote.createdAt; }
  if ('updatedAt' in p) { remote.updated_at = p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt; delete remote.updatedAt; }
  if ('isService' in p) { remote.is_service = p.isService; delete remote.isService; }
  if ('requireSerial' in p) { remote.require_serial = p.requireSerial; delete remote.requireSerial; }
  if ('showInEstore' in p) { remote.show_in_estore = p.showInEstore; delete remote.showInEstore; }
  if ('estoreSortOrder' in p) { remote.estore_sort_order = p.estoreSortOrder; delete remote.estoreSortOrder; }
  if ('estoreCategorySortOrder' in p) { remote.estore_category_sort_order = p.estoreCategorySortOrder; delete remote.estoreCategorySortOrder; }
  if ('variantData' in p) { remote.variant_data = p.variantData; delete remote.variantData; }
  if ('menuNumber' in p) { remote.menu_number = p.menuNumber; delete remote.menuNumber; }
  if ('highlightTag' in p) { remote.highlight_tag = p.highlightTag; delete remote.highlightTag; }
  delete remote.batches;
  delete remote.product_batches;
  
  // Enforce NOT NULL constraint for sku
  if (!remote.sku) {
    remote.sku = p.id || remote.id || remote.barcode_value || `SKU-${Date.now()}`;
  }
  
  return remote;
};


export const toRemoteCustomer = (c: Partial<Customer>) => {
  const remote: any = { ...c };
  if ('priceTier' in c) { remote.price_tier = c.priceTier; delete remote.priceTier; }
  if ('creditLimit' in c) { remote.credit_limit = c.creditLimit; delete remote.creditLimit; }
  if ('creditUsed' in c) { remote.credit_used = c.creditUsed; delete remote.creditUsed; }
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
  if ('createdAt' in e) { remote.created_at = e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt; delete remote.createdAt; }
  if ('updatedAt' in e) { remote.updated_at = e.updatedAt instanceof Date ? e.updatedAt.toISOString() : e.updatedAt; delete remote.updatedAt; }
  return remote;
};




export const toRemoteSupplierTransaction = (t: any) => {
  const remote: any = { ...t };
  if ('id' in t && t.id) remote.id = t.id;
  if ('supplierId' in t && t.supplierId !== undefined) remote.supplier_id = t.supplierId;
  if ('type' in t && t.type !== undefined) remote.type = t.type;
  if ('amount' in t && t.amount !== undefined) remote.amount = t.amount;
  if ('referenceId' in t && t.referenceId !== undefined) remote.reference_id = t.referenceId;
  if ('referenceType' in t && t.referenceType !== undefined) remote.reference_type = t.referenceType;
  if ('note' in t && t.note !== undefined) remote.note = t.note;
  if ('balanceAfter' in t && t.balanceAfter !== undefined) remote.balance_after = t.balanceAfter;
  if ('createdAt' in t && t.createdAt !== undefined) remote.created_at = t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt;
  if ('updatedAt' in t && t.updatedAt !== undefined) remote.updated_at = t.updatedAt instanceof Date ? t.updatedAt.toISOString() : t.updatedAt;
  return remote;
};


export const toRemotePurchaseRecord = (r: any) => {
  const remote: any = { ...r };
  if ('productId' in r) { remote.product_id = r.productId; delete remote.productId; }
  if ('productName' in r) { remote.product_name = r.productName; delete remote.productName; }
  if ('supplierId' in r) { remote.supplier_id = r.supplierId; delete remote.supplierId; }
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


export const toRemoteProductBatch = (b: any) => {
  const remote: any = { ...b };
  if ('productId' in b) { remote.product_id = b.productId; delete remote.productId; }
  if ('batchNumber' in b) { remote.batch_number = b.batchNumber; delete remote.batchNumber; }
  if ('batchType' in b) { remote.batch_type = b.batchType; delete remote.batchType; }
  if ('qtyRemaining' in b) { remote.qty_remaining = b.qtyRemaining; delete remote.qtyRemaining; }
  if ('costPrice' in b) { remote.cost_price = b.costPrice; delete remote.costPrice; }
  if ('salePrice' in b) { remote.sale_price = b.salePrice; delete remote.salePrice; }
  if ('supplier' in b) { remote.supplier_name = b.supplier; delete remote.supplier; }
  if ('supplierId' in b) { remote.supplier_id = b.supplierId; delete remote.supplierId; }
  if ('supplierName' in b) { remote.supplier_name = b.supplierName; delete remote.supplierName; }
  if ('supplierInfo' in b) { remote.supplier_info = b.supplierInfo; delete remote.supplierInfo; }
  if ('poId' in b) { remote.po_id = b.poId; delete remote.poId; }
  if ('expiryDate' in b) { remote.expiry_date = b.expiryDate instanceof Date ? b.expiryDate.toISOString() : b.expiryDate; delete remote.expiryDate; }
  if ('manufacturingDate' in b) { remote.manufacturing_date = b.manufacturingDate instanceof Date ? b.manufacturingDate.toISOString() : b.manufacturingDate; delete remote.manufacturingDate; }
  if ('createdAt' in b) { remote.created_at = b.createdAt instanceof Date ? b.createdAt.toISOString() : b.createdAt; delete remote.createdAt; }
  if ('updatedAt' in b) { remote.updated_at = b.updatedAt instanceof Date ? b.updatedAt.toISOString() : b.updatedAt; delete remote.updatedAt; }
  if ('source' in remote) { delete remote.source; }
  return remote;
};


export const toRemoteSale = (s: Partial<Sale>) => {
  const remote: any = { ...s };
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
  if ('appliedDiscounts' in s) { remote.applied_discounts = s.appliedDiscounts; delete remote.appliedDiscounts; }
  if ('freeGifts' in s) { remote.free_gifts = s.freeGifts; delete remote.freeGifts; }
  if ('saleDate' in s) { remote.sale_date = s.saleDate; delete remote.saleDate; }
  if ('saleType' in s) { remote.sale_type = s.saleType; delete remote.saleType; }
  if ('billDiscountValue' in s) { remote.bill_discount_value = s.billDiscountValue; delete remote.billDiscountValue; }
  if ('billDiscountType' in s) { remote.bill_discount_type = s.billDiscountType; delete remote.billDiscountType; }
  if ('extraCharges' in s) { remote.extra_charges = s.extraCharges; delete remote.extraCharges; }
  if ('splitPayments' in s) { remote.split_payments = s.splitPayments; delete remote.splitPayments; }
  if ('estoreStatus' in s) { remote.estore_status = s.estoreStatus; delete remote.estoreStatus; }
  if ('deliveryAddress' in s) { remote.delivery_address = s.deliveryAddress; delete remote.deliveryAddress; }
  if ('deliveryFee' in s) { remote.delivery_fee = s.deliveryFee; delete remote.deliveryFee; }
  if ('deliveryLocationLat' in s) { remote.delivery_location_lat = s.deliveryLocationLat; delete remote.deliveryLocationLat; }
  if ('deliveryLocationLng' in s) { remote.delivery_location_lng = s.deliveryLocationLng; delete remote.deliveryLocationLng; }
  if ('customerNotes' in s) { remote.customer_notes = s.customerNotes; delete remote.customerNotes; }
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
export const productsService = {
  async getAll(): Promise<Product[]> {
    const items = await localDb.products.toArray();
    return items.sort((a, b) => a.name.localeCompare(b.name));
  },

  async fetchRemote(): Promise<Product[]> {
    const { data, error } = await supabase.from('products').select('*');
    if (error) throw error;
    return (data || []).map(mapProduct);
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
    await queueOp('products', 'create', id, toRemoteProduct(newProduct));

    // 3. Queue Batches/History (if tracking enabled)
    if (product.trackInventory && product.stock > 0) {
      const batchId = generateId();
      const initialQty = Number(product.stock) || 0;
      const initialBatch = {
        id: batchId,
        productId: id,
        batchNumber: `B-OPEN-${now.getTime()}`,
        batchType: 'opening',
        quantity: initialQty,
        qtyRemaining: initialQty,
        costPrice: product.cost,
        salePrice: product.price,
        source: 'direct',
        active: true,
        createdAt: now,
        updatedAt: now
      };

      await localDb.productBatches.add(initialBatch as any);
      await queueOp('product_batches', 'create', batchId, toRemoteProductBatch(initialBatch));

      // Also log stock history
      const logId = generateId();
      const stockLog = {
        id: logId,
        productId: id,
        type: 'initial',
        changeQty: initialQty,
        balanceAfter: initialQty,
        referenceId: batchId,
        note: 'Initial opening stock',
        createdAt: now
      };
      await localDb.stockHistory.add(stockLog as any);
      await queueOp('stock_history', 'create', logId, toRemoteStockHistory(stockLog));

      newProduct.batches = [initialBatch];
      await localDb.products.update(id, { batches: [initialBatch] });
    }

    return newProduct;
  },

  async update(id: string, updates: Partial<Product>): Promise<Product> {
    const existing = await localDb.products.get(id);
    if (!existing) throw new Error('Product not found');

    const now = new Date();
    const updated = { ...existing, ...updates, updatedAt: now };

    // 1. Local Update
    await localDb.products.put(updated);

    // 2. Queue for Sync
    await queueOp('products', 'update', id, toRemoteProduct({ ...updates, updatedAt: now }));

    return updated;
  },

  async delete(id: string): Promise<void> {
    await localDb.products.delete(id);
    queueOp('products', 'delete', id, {});
  },

  async bulkDelete(ids: string[]): Promise<void> {
    await localDb.products.bulkDelete(ids);
    for (const id of ids) {
      queueOp('products', 'delete', id, {});
    }
  },

  async bulkUpdate(ids: string[], updates: Partial<Product>): Promise<void> {
    const now = new Date();
    await localDb.products.where('id').anyOf(ids).modify({ ...updates, updatedAt: now });
    for (const id of ids) {
      await queueOp('products', 'update', id, toRemoteProduct({ ...updates, updatedAt: now }));
    }
  },

  async adjustStock(id: string, delta: number, note: string = 'Adjustment'): Promise<void> {
    const product = await localDb.products.get(id);
    if (!product) return;

    const newStock = (product.stock || 0) + delta;
    await this.update(id, { stock: newStock });

    // Log History — type MUST be one of: sale, purchase, return, adjustment, initial
    const histId = generateId();
    const historyEntry = {
      id: histId,
      productId: id,
      changeQty: delta,
      type: 'adjustment',
      note,
      balanceAfter: newStock,
      createdAt: new Date()
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

  async fetchRemote(): Promise<Customer[]> {
    const { data, error } = await supabase.from('customers').select('*');
    if (error) throw error;
    return (data || []).map(mapCustomer);
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

  async recordPayment(customerId: string, amount: number, method: string, notes: string): Promise<Customer> {
    const customer = await localDb.customers.get(customerId);
    if (!customer) throw new Error('Customer not found');

    const newCreditUsed = Math.max(0, (customer.creditUsed || 0) - amount);
    const updatedCustomer = await this.update(customerId, { creditUsed: newCreditUsed });

    // Log Customer Payment to payments table for history
    const payId = generateId();
    const payment = {
      id: payId,
      customerId,
      amount,
      method,
      notes,
      createdAt: new Date(),
    };
    await localDb.payments.add(payment);
    await queueOp('payments', 'create', payId, toRemotePayment(payment));

    return updatedCustomer;
  },

  async getCustomerPayments(customerId: string): Promise<any[]> {
    const all = await localDb.payments.toArray();
    return all
      .map(mapPayment)
      .filter((p: any) => p.customerId === customerId)
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
};


/**
 * Users Service
 */
export const usersService = {
  async getAll(): Promise<User[]> {
    return await localDb.users.toArray();
  },

  async fetchRemote(): Promise<User[]> {
    const { data, error } = await supabase.from('users').select('*');
    if (error) throw error;
    return (data || []).map(mapUser);
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
  }
};

/**
 * Sales Service
 * Implements atomic-like stock logic and local-first persistence
 */
export const salesService = {
  async getAll(): Promise<Sale[]> {
    const sales = await localDb.sales.toArray();
    return sales.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  },

  async fetchRemote(): Promise<Sale[]> {
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5000);
    if (error) throw error;
    return (data || []).map(mapSale);
  },

  async searchSales(filters: {
    startDate?: Date,
    endDate?: Date,
    invoiceNumber?: string,
    customerId?: string,
    paymentMethod?: string,
    status?: string,
    cashier?: string,
    saleType?: string
  }): Promise<Sale[]> {
    try {
      let query = supabase
        .from('sales')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

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

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(mapSale);
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
      if (filters.saleType) sales = sales.filter(s => s.saleType === filters.saleType);
      
      return sales.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 200);
    }
  },

  async create(sale: Omit<Sale, 'id'>): Promise<Sale> {
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
    for (let i = 0; i < newSale.items.length; i++) {
      const item = newSale.items[i];
      const product = await localDb.products.get(item.product.id);

      if (product && product.trackInventory) {
        const qty = item.weight || item.quantity;
        // RULE: Allow negative stock — never block a sale on stock level
        const newStock = (product.stock || 0) - qty;
        if (newStock < 0) anyOversold = true;

        // --- START BATCH-LEVEL FIFO REDUCTION & COSTING ---
        const batches = await localDb.productBatches
          .where('productId').equals(product.id)
          .toArray();

        const sortedBatches = batches
          .filter(b => (b.qtyRemaining || 0) > 0)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        let remainingToDeduct = qty;
        // Fallback cost: use product.cost if no batches available
        let totalPurchaseCost = 0;
        const fifoDetails: { batchId: string; quantity: number; cost: number; salePrice: number }[] = [];
        const updatedBatchesForProduct = [...(product.batches || [])];

        for (const batch of sortedBatches) {
          if (remainingToDeduct <= 0) break;

          const deductFromThisBatch = Math.min(batch.qtyRemaining, remainingToDeduct);
          const newQtyRemaining = batch.qtyRemaining - deductFromThisBatch;
          remainingToDeduct -= deductFromThisBatch;

          // Calculate exact cost for this deduction chunk
          const batchCost = Number(batch.costPrice) || Number(product.cost) || 0;
          totalPurchaseCost += (deductFromThisBatch * batchCost);

          fifoDetails.push({
            batchId: batch.id,
            quantity: deductFromThisBatch,
            cost: batchCost,
            salePrice: Number(batch.salePrice) || Number(product.price) || 0
          });

          // Update individual batch
          await localDb.productBatches.update(batch.id, { qtyRemaining: newQtyRemaining });
          await queueOp('product_batches', 'update', batch.id, { qty_remaining: newQtyRemaining }, { batchId: id });

          const batchIndex = updatedBatchesForProduct.findIndex(b => b.id === batch.id);
          if (batchIndex !== -1) {
            updatedBatchesForProduct[batchIndex] = { ...updatedBatchesForProduct[batchIndex], qtyRemaining: newQtyRemaining };
          }
        }

        // If batches were exhausted but qty still needed — deficit sale (negative stock)
        // Add fallback cost for remaining deficit units using product.cost
        if (remainingToDeduct > 0) {
          const fallbackCost = Number(product.cost) || 0;
          totalPurchaseCost += remainingToDeduct * fallbackCost;
        }

        // Inject FIFO cost back into the line item for accurate profit reporting
        // Always use product.cost as fallback if no FIFO data available
        const effectivePurchaseCost = totalPurchaseCost > 0
          ? totalPurchaseCost
          : (Number(product.cost) || 0) * qty;

        newSale.items[i] = {
          ...item,
          purchaseCost: effectivePurchaseCost,
          fifoDetails
        };
        // --- END BATCH-LEVEL FIFO REDUCTION ---

        // Update Product — allow negative stock
        await localDb.products.update(product.id, {
          stock: newStock,
          batches: updatedBatchesForProduct,
          updatedAt: now
        });

        await queueOp('products', 'update', product.id, toRemoteProduct({
          ...product,
          stock: newStock,
          batches: updatedBatchesForProduct,
          updatedAt: now
        }), { batchId: id });

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
        await queueOp('stock_history', 'create', histId, toRemoteStockHistory(histEntry), { batchId: id });
      } else if (product && !product.trackInventory) {
        // Non-tracked product: still inject purchaseCost from product.cost for accurate reporting
        newSale.items[i] = {
          ...item,
          purchaseCost: (Number(product.cost) || 0) * (item.weight || item.quantity),
          fifoDetails: []
        };
      }
    }

    // 1. Local Write (Now contains precise purchaseCost per item)
    await localDb.sales.add(newSale);

    // 2. Queue for Sync (Uses Server RPC 'process_sale' for atomicity)
    await queueOp('sales', 'create', id, toRemoteSale(newSale), { batchId: id });

    // 3. Update Customer Credit/Stats if identified
    if (newSale.customerId) {
      const customer = await localDb.customers.get(newSale.customerId);
      if (customer) {
        const isCreditSale = newSale.paymentMethod === 'credit' || newSale.status === 'credit';
        const netCreditDebt = isCreditSale ? getAmountByMethod(newSale, 'credit') : 0;
        
        const updatedCustomer = {
          ...customer,
          creditUsed: (customer.creditUsed || 0) + netCreditDebt,
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

    // 1. Reverse Stock (Only restore what has not been refunded/returned yet)
    // E-store pending sales never deducted stock initially, so we don't restore it.
    if (sale.status === 'completed' || sale.status === 'credit') {
      for (const item of sale.items) {
        const product = await localDb.products.get(item.product.id);
      if (product && product.trackInventory) {
        const qty = (item.weight || item.quantity) - (item.refundedQuantity || 0);
        if (qty <= 0) continue;
        const newStock = (product.stock || 0) + qty;

        // --- START EXACT BATCH-LEVEL RESTORATION (Reverse FIFO) ---
        const batches = await localDb.productBatches
          .where('productId').equals(product.id)
          .toArray();

        const updatedBatchesForProduct = [...(product.batches || [])];

        if (item.fifoDetails && item.fifoDetails.length > 0) {
          // Restore exact quantities to the exact batches they were deducted from
          for (const detail of item.fifoDetails) {
            const batchToRestore = batches.find(b => b.id === detail.batchId);
            if (batchToRestore) {
              const newQtyRemaining = (batchToRestore.qtyRemaining || 0) + detail.quantity;
              await localDb.productBatches.update(batchToRestore.id, { qtyRemaining: newQtyRemaining });
              await queueOp('product_batches', 'update', batchToRestore.id, { qty_remaining: newQtyRemaining });

              const batchIndex = updatedBatchesForProduct.findIndex(b => b.id === batchToRestore.id);
              if (batchIndex !== -1) {
                updatedBatchesForProduct[batchIndex] = { ...updatedBatchesForProduct[batchIndex], qtyRemaining: newQtyRemaining };
              }
            }
          }
        } else if (batches.length > 0) {
          // Fallback for legacy sales without fifoDetails: Add returned quantity to the LATEST batch
          const newestBatch = batches.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
          const newQtyRemaining = (newestBatch.qtyRemaining || 0) + qty;

          await localDb.productBatches.update(newestBatch.id, { qtyRemaining: newQtyRemaining });
          await queueOp('product_batches', 'update', newestBatch.id, { qty_remaining: newQtyRemaining });

          const batchIndex = updatedBatchesForProduct.findIndex(b => b.id === newestBatch.id);
          if (batchIndex !== -1) {
            updatedBatchesForProduct[batchIndex] = { ...updatedBatchesForProduct[batchIndex], qtyRemaining: newQtyRemaining };
          }
        }
        // --- END EXACT BATCH-LEVEL RESTORATION ---

        // Update Local Product
        await localDb.products.update(product.id, {
          stock: newStock,
          batches: updatedBatchesForProduct,
          updatedAt: now
        });
        const updatedProduct = { ...product, stock: newStock, batches: updatedBatchesForProduct, updatedAt: now };
        affectedProducts.push(updatedProduct);

        // Queue Product Sync
        await queueOp('products', 'update', product.id, toRemoteProduct(updatedProduct));

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
        await queueOp('stock_history', 'create', histId, toRemoteStockHistory(historyEntry));
      } else if (product) {
        affectedProducts.push(product);
      }
    }
    }

    // 2. Local Delete
    await localDb.sales.delete(id);

    // 3. Queue Sync for Sale Deletion
    await queueOp('sales', 'delete', id, {});

    // 4. Reverse Customer Credit/Stats if it was a credit sale (RULE: Ensure data parity on delete)
    if (sale.customerId) {
      const customer = await localDb.customers.get(sale.customerId);
      if (customer) {
        const isCreditSale = sale.paymentMethod === 'credit' || sale.status === 'credit';
        const remainingTotal = sale.total - (sale.refundedAmount || 0);
        const updatedCustomer = {
          ...customer,
          creditUsed: isCreditSale ? Math.max(0, (customer.creditUsed || 0) - remainingTotal) : (customer.creditUsed || 0),
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
        new Date(s.timestamp) >= startDate &&
        new Date(s.timestamp) <= endDate
      )
      .reverse()
      .sortBy('timestamp');
  },

  async getReportSales(startDate: Date, endDate: Date): Promise<Sale[]> {
    try {
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .neq('status', 'refunded')
        .neq('status', 'deleted')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []).map(mapSale);
    } catch (e) {
      console.warn('getReportSales: fallback to localDb'); // fallback to localDb
      return await localDb.sales
        .filter(s =>
          s.status !== 'refunded' &&
          s.status !== 'deleted' &&
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
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .in('status', ['refunded', 'partially_refunded'])
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

      if (error) throw error;
      return (data || []).map(mapSale);
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
    const sale = await localDb.sales.get(id);
    if (!sale) throw new Error('Sale not found');

    const now = new Date();
    
    const isFullRefund = !request || request.type === 'full';
    
    const itemsToReverse = isFullRefund ? sale.items.map((item, index) => ({
      index,
      productId: item.product.id,
      qty: item.weight || item.quantity,
      refundAmount: item.total || item.subtotal || 0
    })) : (request?.items || []);

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

        // --- START EXACT BATCH-LEVEL RESTORATION (Reverse FIFO) ---
        const batches = await localDb.productBatches
          .where('productId').equals(product.id)
          .toArray();

        const updatedBatchesForProduct = [...(product.batches || [])];

        if (item.fifoDetails && item.fifoDetails.length > 0) {
          // Restore exact quantities to the exact batches they were deducted from
          // For partial refunds, we restore from the most recently deducted batch (last in fifoDetails)
          let qtyToRestore = qty;
          for (let i = item.fifoDetails.length - 1; i >= 0; i--) {
            if (qtyToRestore <= 0) break;
            const detail = item.fifoDetails[i];
            
            // Only restore up to what was deducted from this batch
            const restoreAmount = Math.min(qtyToRestore, detail.quantity);
            qtyToRestore -= restoreAmount;
            
            const batchToRestore = batches.find(b => b.id === detail.batchId);
            if (batchToRestore) {
              const newQtyRemaining = (batchToRestore.qtyRemaining || 0) + restoreAmount;
              await localDb.productBatches.update(batchToRestore.id, { qtyRemaining: newQtyRemaining });
              await queueOp('product_batches', 'update', batchToRestore.id, { qty_remaining: newQtyRemaining }, { batchId: id });

              const batchIndex = updatedBatchesForProduct.findIndex(b => b.id === batchToRestore.id);
              if (batchIndex !== -1) {
                updatedBatchesForProduct[batchIndex] = { ...updatedBatchesForProduct[batchIndex], qtyRemaining: newQtyRemaining };
              }
            }
          }
        } else if (batches.length > 0) {
          // Fallback for legacy sales without fifoDetails: Add returned quantity to the LATEST batch
          const newestBatch = batches.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
          const newQtyRemaining = (newestBatch.qtyRemaining || 0) + qty;

          await localDb.productBatches.update(newestBatch.id, { qtyRemaining: newQtyRemaining });
          await queueOp('product_batches', 'update', newestBatch.id, { qty_remaining: newQtyRemaining }, { batchId: id });

          const batchIndex = updatedBatchesForProduct.findIndex(b => b.id === newestBatch.id);
          if (batchIndex !== -1) {
            updatedBatchesForProduct[batchIndex] = { ...updatedBatchesForProduct[batchIndex], qtyRemaining: newQtyRemaining };
          }
        }
        // --- END EXACT BATCH-LEVEL RESTORATION ---

        await localDb.products.update(product.id, {
          stock: newStock,
          batches: updatedBatchesForProduct,
          updatedAt: now
        });
        await queueOp('products', 'update', product.id, toRemoteProduct({
          ...product,
          stock: newStock,
          batches: updatedBatchesForProduct,
          updatedAt: now
        }), { batchId: id });

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
        await queueOp('stock_history', 'create', retHistId, toRemoteStockHistory(retHistEntry), { batchId: id });
      }
    }
    
    // 2. Update sale record
    const newRefundedAmount = (sale.refundedAmount || 0) + totalRefundAmount;
    
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
      status: finalStatus as any,
      updatedAt: now
    };
    
    await localDb.sales.put(returnUpdate); // use put instead of update to overwrite fully

    // 3. Queue RPC Sync
    await queueOp('sales', 'update', id, {
      ...toRemoteSale(returnUpdate),
      status: finalStatus,
      updated_at: now.toISOString()
    }, { batchId: id });

    // 4. Reverse Customer Credit/Stats
    if (sale.customerId && totalRefundAmount > 0) {
      const customer = await localDb.customers.get(sale.customerId);
      if (customer) {
        const isCreditSale = sale.paymentMethod === 'credit' || sale.status === 'credit';
        const updatedCustomer = {
          ...customer,
          creditUsed: isCreditSale ? Math.max(0, (customer.creditUsed || 0) - totalRefundAmount) : (customer.creditUsed || 0),
          totalPurchases: Math.max(0, (customer.totalPurchases || 0) - totalRefundAmount),
          updatedAt: now
        };
        await localDb.customers.put(updatedCustomer);
        await queueOp('customers', 'update', customer.id, toRemoteCustomer(updatedCustomer), { batchId: id });
      }
    }

    // 5. Create reversing payment record for audit trail
    if (totalRefundAmount > 0) {
      const refundPayId = generateId();
      const refundPayment = {
        id: refundPayId,
        customerId: sale.customerId || undefined,
        amount: totalRefundAmount,
        method: sale.paymentMethod === 'split' ? 'cash' : (sale.paymentMethod || 'cash'),
        direction: 'out' as const,
        note: `${isFullRefund ? 'Full' : 'Partial'} Refund for sale ${sale.invoiceNumber || id}`,
        createdAt: now,
      };
      await localDb.payments.add(refundPayment);
      await queueOp('payments', 'create', refundPayId, toRemotePayment(refundPayment), { batchId: id });
    }
  },

  async patchLegacySales(): Promise<number> {
    const allSales = await localDb.sales.toArray();
    let patchedCount = 0;

    for (const sale of allSales) {
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
        const updatedSale = { ...sale, items: updatedItems, updatedAt: new Date() };
        await localDb.sales.put(updatedSale);
        // We only queue if it's not a draft and looks valid
        if (!sale.invoiceNumber?.startsWith('DRAFT-')) {
          await queueOp('sales', 'update', sale.id, toRemoteSale(updatedSale));
        }
        patchedCount++;
      }
    }
    return patchedCount;
  }
};



/**
 * Categories & Suppliers
 */
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
  async fetchRemote(): Promise<Category[]> {
    const { data, error } = await supabase.from('categories').select('*');
    if (error) throw error;
    return (data || []).map(item => ({
      ...item,
      estoreSortOrder: item.estore_sort_order ?? 0,
      active: item.active ?? true,
      createdAt: item.created_at ? new Date(item.created_at) : new Date(item.createdAt),
      updatedAt: item.updated_at ? new Date(item.updated_at) : new Date(item.updatedAt)
    }));
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
    let query = localDb.supplierTransactions.where('supplierId').equals(supplierId);

    let txs = await query.toArray();

    // Sort and paginate manually for now if Dexie query is complex
    txs = txs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const paginated = txs.slice(offset, offset + limit);

    return paginated.map(tx => ({
      id: tx.id,
      date: tx.createdAt,
      type: tx.type,
      detail: tx.note || tx.referenceType || 'Transaction',
      debit: (tx.type === 'payment' || tx.type === 'return') ? tx.amount : 0,
      credit: (tx.type === 'purchase' || tx.type === 'opening_balance' || tx.type === 'loan') ? tx.amount : 0,
    }));
  },

  async recordPayment(data: { supplier_id: string; amount: number; payment_type: string; note?: string }) {
    const id = generateId();
    const tx: any = {
      id,
      supplierId: data.supplier_id,
      type: 'payment',
      amount: data.amount,
      note: data.note,
      paymentType: data.payment_type,
      createdAt: new Date()
    };
    await localDb.supplierTransactions.add(tx);
    await queueOp('supplier_transactions', 'create', id, toRemoteSupplierTransaction(tx));
    return tx;

  },

  async recordBill(data: { supplierId: string; amount: number; note?: string; referenceId?: string }) {
    const id = generateId();
    const tx: any = {
      id,
      supplierId: data.supplierId,
      type: data.note === 'Opening Balance' ? 'opening_balance' : 'purchase',
      amount: data.amount,
      note: data.note,
      referenceId: data.referenceId,
      createdAt: new Date()
    };
    await localDb.supplierTransactions.add(tx);
    await queueOp('supplier_transactions', 'create', id, toRemoteSupplierTransaction(tx));
    return tx;
  },

  async deleteTransaction(id: string) {
    await localDb.supplierTransactions.delete(id);
    queueOp('supplier_transactions', 'delete', id, {});
  },

  async fetchRemote(): Promise<Supplier[]> {
    const { data, error } = await supabase.from('suppliers').select('*');
    if (error) throw error;
    return (data || []).map(item => ({
      ...item,
      creditLimit: item.credit_limit ?? item.creditLimit,
      openingBalance: item.opening_balance ?? item.openingBalance,
      createdAt: item.created_at ? new Date(item.created_at) : new Date(item.createdAt)
    }));
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
  async fetchRemote(): Promise<AppSettings | null> {
    const { data, error } = await supabase
      .from('app_settings')
      .select('*')
      .eq('id', SETTINGS_ID)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return mapSettings(data);
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
    return newExp;
  },

  async update(id: string, updates: Partial<Expense>): Promise<Expense> {
    const existing = await localDb.expenses.get(id);
    if (!existing) throw new Error('Expense not found');
    const updated = { ...existing, ...updates, updatedAt: new Date() } as Expense;
    await localDb.expenses.put(updated);
    await queueOp('expenses', 'update', id, toRemoteExpense(updated));
    return updated;
  },

  async delete(id: string): Promise<void> {
    await localDb.expenses.delete(id);
    await queueOp('expenses', 'delete', id, {});
  },

  async fetchRemote(): Promise<Expense[]> {
    const { data, error } = await supabase.from('expenses').select('*');
    if (error) throw error;
    return (data || []).map(mapExpense);
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
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .gte('date', startDate.toISOString())
        .lte('date', endDate.toISOString())
        .order('date', { ascending: false });

      if (error) throw error;
      return (data || []).map(mapExpense);
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
    await queueOp('discounts', 'create', id, {
      ...discount,
      valid_from: discount.validFrom.toISOString(),
      valid_to: discount.validTo.toISOString(),
      is_auto_apply: discount.isAutoApply
    });
  },

  async fetchRemote(): Promise<Discount[]> {
    const { data, error } = await supabase.from('discounts').select('*');
    if (error) throw error;
    return (data || []).map(mapDiscount);
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
        // For non-Adjustment records: create batch, update stock, log stock_history
        if (record.quantity < 0) {
          // --- BATCH-LEVEL FIFO REDUCTION FOR SUPPLIER RETURNS ---
          const batches = await localDb.productBatches
            .where('productId').equals(product.id)
            .toArray();

          const sortedBatches = batches
            .filter(b => (b.qtyRemaining || 0) > 0)
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

          let remainingToDeduct = Math.abs(record.quantity);
          const updatedBatchesForProduct = [...(product.batches || [])];

          for (const batch of sortedBatches) {
            if (remainingToDeduct <= 0) break;

            const deductFromThisBatch = Math.min(batch.qtyRemaining, remainingToDeduct);
            const newQtyRemaining = batch.qtyRemaining - deductFromThisBatch;
            remainingToDeduct -= deductFromThisBatch;

            await localDb.productBatches.update(batch.id, { qtyRemaining: newQtyRemaining });
            await queueOp('product_batches', 'update', batch.id, { qty_remaining: newQtyRemaining });

            const batchIndex = updatedBatchesForProduct.findIndex(b => b.id === batch.id);
            if (batchIndex !== -1) {
              updatedBatchesForProduct[batchIndex] = {
                ...updatedBatchesForProduct[batchIndex],
                qtyRemaining: newQtyRemaining
              };
            }
          }
          await localDb.products.update(product.id, { batches: updatedBatchesForProduct });
          await queueOp('products', 'update', product.id, toRemoteProduct(
            { ...product, batches: updatedBatchesForProduct, updatedAt: now }
          ));
        } else {
          // --- STOCK IN: CREATE NEW BATCH — batch_number NEVER null ---
          const batchId = generateId();
          const newBatch = {
            id: batchId,
            productId: record.productId,
            batchNumber: `B-${now.getTime()}-${batchId.substr(0, 6).toUpperCase()}`,
            quantity: record.quantity,
            qtyRemaining: record.quantity,
            costPrice: record.costPrice,
            salePrice: (record as any).retailPrice || product.price,
            supplier: record.supplier || 'DIRECT ENTRY',
            createdAt: now
          };

          // Save to separate productBatches table
          await localDb.productBatches.add(newBatch as any);
          await queueOp('product_batches', 'create', batchId, toRemoteProductBatch(newBatch));

          // ALSO update the embedded product.batches array — THIS is what the UI reads
          const existingBatches: any[] = product.batches || [];
          const updatedBatches = [...existingBatches, newBatch];
          await localDb.products.update(product.id, { batches: updatedBatches });
          // Queue product sync so cloud has updated batches
          await queueOp('products', 'update', product.id, toRemoteProduct(
            { ...product, batches: updatedBatches, updatedAt: now }
          ));
        }

        // Log stock movement to stock_history for full audit trail
        const newStock = (product.stock || 0) + record.quantity;
        await localDb.products.update(product.id, { stock: newStock });
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
        await queueOp('stock_history', 'create', histId, toRemoteStockHistory(histEntry));
      }
    }

    // Save Record Locally + Queue sync
    await localDb.purchaseRecords.add(newRecord);
    await queueOp('purchase_records', 'create', id, toRemotePurchaseRecord(newRecord));
    return newRecord;
  },

  async fetchRemote(): Promise<PurchaseRecord[]> {
    const { data, error } = await supabase.from('purchase_records').select('*');
    if (error) throw error;
    return (data || []).map(mapPurchaseRecord);
  },

  async delete(id: string): Promise<void> {
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

  // Strip known non-DB fields or those that cause 400 errors
  delete remote.selectedCustomer;
  delete remote.selectedCustomerId;

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
  async fetchRemote(): Promise<SupplierTransaction[]> {
    const { data, error } = await supabase.from('supplier_transactions').select('*');
    if (error) throw error;
    return (data || []).map((item: any) => ({
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
  async fetchRemote(): Promise<StockHistory[]> {
    const { data, error } = await supabase.from('stock_history').select('*');
    if (error) throw error;
    return (data || []).map(mapStockHistory);
  }
};

/**
 * Payment Modes Service
 */
export const paymentModesService = {
  async fetchRemote(): Promise<Payment[]> {
    const { data, error } = await supabase.from('payments').select('*');
    if (error) throw error;
    return (data || []).map((item: any) => ({
      ...item,
      createdAt: item.created_at ? new Date(item.created_at) : new Date(item.createdAt),
    }));
  }
};



/**
 * Stock Integrity Audit (RULE F8)
 * Calls the audit_stock_integrity() RPC and returns products where
 * products.stock != SUM(product_batches.qty_remaining).
 * Zero rows = healthy system. Call from admin panel.
 */
export const auditStockIntegrity = async (): Promise<Array<{
  product_id: string;
  name: string;
  stock: number;
  batch_sum: number;
  diff: number;
}>> => {
  const { data, error } = await supabase.rpc('audit_stock_integrity');
  if (error) throw error;
  return (data || []) as Array<{
    product_id: string;
    name: string;
    stock: number;
    batch_sum: number;
    diff: number;
  }>;
};

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
  items: (row.bundle_items || []).map((bi: any): BundleItem => ({
    id: bi.id,
    bundleId: bi.bundle_id,
    productId: bi.product_id,
    quantity: Number(bi.quantity) || 1,
    createdAt: bi.created_at ? new Date(bi.created_at) : new Date(),
  })),
  isCombo: row.is_combo === true,
  highlightTag: row.highlight_tag ?? row.highlightTag,
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
    highlightTag?: 'sunday' | 'crown';
    scheduleType?: 'always' | 'scheduled';
    startDate?: string;
    endDate?: string;
    repeatDays?: string[];
    startTime?: string;
    endTime?: string;
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
    scheduleType?: 'always' | 'scheduled';
    startDate?: string;
    endDate?: string;
    repeatDays?: string[];
    startTime?: string;
    endTime?: string;
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
    if (data.scheduleType !== undefined) updates.schedule_type = data.scheduleType;
    if (data.startDate !== undefined) updates.start_date = data.startDate || null;
    if (data.endDate !== undefined) updates.end_date = data.endDate || null;
    if (data.repeatDays !== undefined) updates.repeat_days = data.repeatDays || null;
    if (data.startTime !== undefined) updates.start_time = data.startTime || null;
    if (data.endTime !== undefined) updates.end_time = data.endTime || null;

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
    if (data.scheduleType !== undefined) localUpdates.scheduleType = data.scheduleType;
    if (data.startDate !== undefined) localUpdates.startDate = data.startDate || null;
    if (data.endDate !== undefined) localUpdates.endDate = data.endDate || null;
    if (data.repeatDays !== undefined) localUpdates.repeatDays = data.repeatDays || null;
    if (data.startTime !== undefined) localUpdates.startTime = data.startTime || null;
    if (data.endTime !== undefined) localUpdates.endTime = data.endTime || null;

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
  getBundleCartItems(bundle: Bundle, products: Product[]): CartItem[] {
    if (!bundle.items || bundle.items.length === 0) return [];

    // Build line items with resolved product data
    const lines: { product: Product; quantity: number; linePrice: number }[] = [];
    for (const bi of bundle.items) {
      const product = products.find(p => p.id === bi.productId);
      if (!product) continue;
      lines.push({
        product,
        quantity: bi.quantity,
        linePrice: product.price * bi.quantity,
      });
    }

    if (lines.length === 0) return [];

    const totalBundlePrice = lines.reduce((sum, l) => sum + l.linePrice, 0);

    // Calculate total discount amount
    const totalDiscountAmount = bundle.discountType === 'percentage'
      ? (totalBundlePrice * bundle.discountValue) / 100
      : Math.min(bundle.discountValue, totalBundlePrice);

    // Apply proportional discount to each line
    return lines.map(line => {
      const proportion = totalBundlePrice > 0 ? line.linePrice / totalBundlePrice : 0;
      const lineDiscount = Math.round(totalDiscountAmount * proportion * 100) / 100;
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

