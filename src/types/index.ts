export interface ProductVariant {
  name: string;      // e.g. "Size", "Color"
  options: string[]; // e.g. ["S", "M", "L"], ["Red", "Blue"]
  optionsRaw?: string; // transient raw input string to support smooth comma typing
}

export interface VariantData {
  id: string;
  option1: string; // e.g. "Size: 10 Inch"
  option2?: string; // e.g. "Color: Red"
  option3?: string; // e.g. "Material: Cotton"
  priceOverride?: number; // Sets exact price (Restaurant)
  priceDifference?: number; // Adjusts base price (+450)
  stock?: number; // Specific variant stock (Garments)
  trackInventory?: boolean; // Whether to independently track stock for this variant
  barcode?: string; // Variant barcode
  sku?: string;
  cardTitle?: string; // Display label for variant in UI (e.g. "10 Inch")
  cardSubtitle?: string; // Secondary display label (e.g. "Red")
  cost?: number; // Cost price of the specific variant
}

export interface ProductModifier {
  name: string;      // e.g. "Extra Cheese"
  price: number;     // e.g. 150
  variantName?: string; // e.g. "Size: 13 Inch" - Only applies to this variant
}

export interface Product {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  barcodeValue?: string;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
  targetStock?: number;
  category: string;
  supplier?: string;
  description: string;
  image?: string;
  taxable: boolean;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  isFeatured?: boolean;
  menuNumber?: number;
  highlightTag?: 'sunday' | 'crown';
  // New fields for advanced features
  isWeightBased?: boolean;
  pricePerUnit?: number; // For weight-based pricing (per kg, per lb, etc.)
  unit?: string; // kg, lb, piece, etc.
  batches?: ProductBatch[];
  trackInventory?: boolean; // Whether to track and manage inventory for this product
  variants?: ProductVariant[];
  variantData?: VariantData[]; // Advanced variant pricing, stock, barcodes
  modifiers?: ProductModifier[];
  productType?: 'simple' | 'variable' | 'variation';
  parentId?: string;
  isService?: boolean;
  requireSerial?: boolean;
  showInEstore?: boolean;
  estoreSortOrder?: number;
  estoreCategorySortOrder?: number;
  productAddons?: ProductAddon[]; // Inventory-tracked linked add-ons
}


export interface ProductBatch {
  id: string;
  batchNumber: string;
  batchType: 'opening' | 'purchase';
  manufacturingDate: Date;
  expiryDate: Date;
  quantity: number;
  qtyRemaining: number; // Important for FIFO tracking
  costPrice: number;
  salePrice: number; // Locked at batch creation
  supplierId?: string;
  supplierName?: string;
  poId?: string;
  createdAt: Date;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  priceTier: 'retail' | 'wholesale' | 'premium';
  creditLimit: number;
  creditUsed: number;
  totalPurchases: number;
  lastPurchase?: Date;
  createdAt: Date;
  updatedAt?: Date;
  preferredCategories?: string[]; // CRM: Track what they buy most
  notes?: string; // CRM: Special instructions, birthday, etc.
}


export interface Supplier {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  businessType: string;
  paymentTerms: string;
  openingBalance: number;
  rating: number;
  createdAt: Date;
  updatedAt?: Date;
}


export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  status: 'draft' | 'confirmed' | 'received' | 'cancelled';
  totalAmount: number;
  notes?: string;
  receivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  items?: PurchaseOrderItem[];
}

export interface PurchaseOrderItem {
  id: string;
  poId: string;
  productId: string;
  quantity: number;
  receivedQty: number;
  costPrice: number;
  created_at?: Date;
}

export interface SupplierTransaction {
  id: string;
  supplierId: string;
  type: 'purchase' | 'loan' | 'advance' | 'payment' | 'return' | 'opening_balance';
  amount: number;
  referenceId?: string;
  referenceType?: string;
  note?: string;
  balanceAfter?: number;
  createdAt: Date;
}

export interface Payment {
  id: string;
  supplierId?: string;
  customerId?: string;
  amount: number;
  paymentType?: string;
  method?: string;
  direction?: 'in' | 'out';
  note?: string;
  notes?: string;
  createdAt: Date;
}

export interface StockHistory {
  id: string;
  productId: string;
  changeQty: number;
  type: 'sale' | 'purchase' | 'return' | 'adjustment' | 'initial' | 'stock_in' | 'adjustment_out';
  referenceId?: string;
  note?: string;
  balanceAfter?: number;
  cashierId?: string;
  cashierName?: string;
  createdAt: Date;
  wasOversold?: boolean;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  active?: boolean;
  estoreSortOrder?: number;
  createdAt?: Date;
}

export interface VariantStockHistory {
  id: string;
  productId: string;
  variantId: string;
  variantLabel?: string;
  changeQty: number;
  type: 'sale' | 'return' | 'adjustment' | 'initial' | 'purchase';
  referenceId?: string;
  note?: string;
  balanceAfter?: number;
  cashierName?: string;
  createdAt: Date;
}

export interface ProductAddon {
  id: string;
  productId: string;
  addonProductId: string;
  name: string;
  price: number;
  maxQty: number;
  active: boolean;
  createdAt: Date;
}

export interface CartAddonItem {
  addon: ProductAddon;
  quantity: number;
  subtotal: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
  weight?: number; // For weight-based products
  discount: number; // Calculated amount
  discountValue?: number; // Raw input (e.g. 10 for 10%)
  discountType: 'percentage' | 'fixed';
  subtotal: number;
  batchId?: string; // For batch tracking
  purchaseCost?: number; // Total purchase cost for this line item (FIFO calculated)
  originalPrice?: number; // The original retail price before any manual edits
  // FIFO Tracking info added for reporting
  fifoDetails?: {
    batchId: string;
    quantity: number;
    cost: number;
    salePrice: number;
  }[];
  selectedVariant?: string; // e.g., "Size: M, Color: Red" (legacy — kept for backward compat)
  selectedVariantId?: string; // The VariantData.id for per-variant stock tracking
  selectedVariantLabel?: string; // Human-readable label for display (e.g., "10 Inch, Red")
  selectedModifiers?: ProductModifier[];
  addonItems?: CartAddonItem[]; // Inventory-tracked addon products selected by customer
  serialNumber?: string;
  // Bundle Deal fields
  bundleId?: string;   // Which bundle this item came from (for grouping in cart/receipt)
  bundleName?: string; // Display name of the bundle deal
  bundleHideItemPrices?: boolean; // When true, this item's original price is hidden; only deal total shown
  refundedQuantity?: number; // Quantity of this item that was refunded
  toppings?: CartItemTopping[]; // Extra toppings added to this item
  displayToppings?: CartItemTopping[]; // Toppings mapped for visual display under nested deal items without charging
  dealSize?: string; // Selected deal size (e.g. 'large', 'medium')
}

export interface Discount {
  id: string;
  name: string;
  description: string;
  type: 'percentage' | 'fixed' | 'bogo' | 'free_gift' | 'mix_and_match';
  value: number;
  conditions: DiscountCondition[];
  freeGiftProducts?: string[]; // Product IDs for free gifts
  minAmount?: number;
  maxDiscount?: number;
  validFrom: Date;
  validTo: Date;
  validDays?: number[]; // 0-6 (Sunday-Saturday)
  active: boolean;
  isAutoApply: boolean;
  createdAt: Date;
}

export interface DiscountCondition {
  type: 'min_amount' | 'specific_products' | 'payment_method' | 'customer_tier' | 'card_type' | 'bank_name' | 'category';
  value: any;
  operator?: 'equals' | 'greater_than' | 'less_than' | 'in_array';
  minQuantity?: number; // For specific_products or category condition - minimum quantity required
  // For Mix & Match Deals
  targetQuantity?: number; // e.g., Buy 2
  rewardType?: 'fixed_total' | 'percentage_off_all' | 'cheapest_free';
  rewardValue?: number; // e.g., 2000 (Fixed Total)
}

export interface SplitPayment {
  method: 'cash' | 'card' | 'digital' | 'credit' | 'cheque';
  amount: number;
  reference?: string;
}

export interface Sale {
  id: string;
  invoiceNumber: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  items: CartItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  billDiscountValue?: number;
  billDiscountType?: 'percentage' | 'fixed';
  paymentMethod: 'cash' | 'card' | 'digital' | 'credit' | 'cheque' | 'split';
  cardDetails?: CardDetails;
  status: 'pending' | 'completed' | 'refunded' | 'partially_refunded' | 'credit' | 'draft';
  cashier: string;
  timestamp: Date;
  receiptNumber: string;
  notes?: string;
  appliedDiscounts?: AppliedDiscount[];
  freeGifts?: CartItem[];
  receivedAmount?: number;   // Cash received from customer
  changeAmount?: number;    // Change given back
  saleDate?: string; // YYYY-MM-DD
  saleType?: 'retail' | 'wholesale' | 'estore';
  // New features
  extraCharges?: { name: string; amount: number }[];
  splitPayments?: SplitPayment[];
  refundedAt?: string;
  refundedAmount?: number; // Total amount refunded from this sale
  // E-Store features
  estoreStatus?: 'pending' | 'accepted' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled';
  deliveryAddress?: string;
  deliveryFee?: number;
  deliveryLocationLat?: number;
  deliveryLocationLng?: number;
  customerNotes?: string;
}

export interface RefundRequest {
  type: 'full' | 'partial';
  items: {
    index: number;
    productId: string;
    qty: number;
    refundAmount: number;
  }[];
  totalRefundAmount: number;
}

export interface AppliedDiscount {
  discountId: string;
  discountName: string;
  discountAmount: number;
  type: 'percentage' | 'fixed' | 'bogo' | 'free_gift';
}

export interface SalesTab {
  id: string;
  name: string;
  cart: CartItem[];
  selectedCustomer: Customer | null;
  billDiscountValue?: number;
  billDiscountType?: 'percentage' | 'fixed';
  notes?: string;
  editingSaleId?: string | null;
  createdAt: Date;
}

export interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'cashier';
  permissions: string[];
  canEditPrice: boolean;
  canGiveDiscount: boolean;
  canDeleteSale: boolean;
  canViewProfit: boolean;
  canManageStock: boolean;
  canManagePO: boolean;
  canViewRecords: boolean;
  canEditSale: boolean;
  active: boolean;
  lastLogin?: Date;
  avatar?: string;
  offlineHash?: string;
}

export interface AppSettings {
  id?: string;
  storeName: string;
  storeAddress: string;
  storePhone?: string;
  storeEmail?: string;
  storeWebsite?: string;
  storeLogo?: string;
  taxRate: number;
  currency: string;
  interfaceMode: 'touch' | 'traditional';
  autoBackup: boolean;
  receiptPrinter: boolean;
  theme: 'light' | 'dark' | 'auto';
  invoicePrefix: string;
  invoiceCounter: number;
  // Receipt & Printer Settings
  receiptPaperSize: '58mm' | '80mm' | 'A4';
  receiptDensity: 'draft' | 'normal' | 'detailed';
  enableKotPrinter?: boolean; // Kitchen Order Ticket printer toggle
  // Receipt Print Position Adjustments
  receiptPaddingTop: number;
  receiptPaddingBottom: number;
  receiptPaddingLeft: number;
  receiptPaddingRight: number;
  receiptOffsetX: number;
  receiptHeaderOffsetX?: number;
  receiptFooterOffsetX?: number;
  receiptShowFooter: boolean;
  receiptHeader?: string;
  receiptFooter?: string;
  receiptShowLogo: boolean;
  receiptShowTax: boolean;
  receiptShowDiscount: boolean;
  receiptShowStoreName: boolean;
  receiptShowStoreAddress: boolean;
  receiptShowStorePhone: boolean;
  receiptShowStoreEmail: boolean;
  receiptShowCustomerName: boolean;
  receiptShowCustomerPhone: boolean;
  receiptShowNotes: boolean;
  receiptShowBarcode?: boolean;
  receiptShowDeliveryAddress: boolean;
  receiptShowQrCode: boolean;
  receiptTemplate: 'modern' | 'minimal' | 'classic' | 'professional' | 'compact' | 'ultra_compact'
    | 'horizontal_header' | 'centered_flow' | 'left_grid' | 'split_columns' | 'floating_totals'
    | 'offset_logo' | 'boxed_sections' | 'tear_off' | 'vertical_line' | 'emphasized_total';
  receiptFontScale: number;
  receiptFontBold: boolean;
  receiptFontWeight?: number;
  // Barcode Print Settings
  barcodePaperSize?: 'A4' | 'Thermal-50x25' | 'Thermal-40x30' | 'Thermal-80x40';
  barcodeA4Columns?: number;
  barcodeA4Rows?: number;
  barcodeShowPrice?: boolean;
  barcodeShowName?: boolean;
  barcodeShowSku?: boolean;
  barcodeShowCategory?: boolean;
  barcodeScale?: number;
  barcodeHeight?: number;
  barcodePadding?: number;
  barcodeBorder?: boolean;
  barcodeType?: string;
  barcodeNameLines?: number;
  barcodeFontSize?: number;
  barcodeContentScale?: number;
  barcodeMarginX?: number;
  barcodeMarginY?: number;
  barcodeGapX?: number;
  barcodeGapY?: number;
  barcodeBarWidth?: number;
  // Offline & Sync Settings
  offlineMode?: boolean;
  autoSync?: boolean;
  // Global Localization & Industry
  country: string;
  taxId?: string;
  businessType: 'fashion' | 'grocery' | 'clothing' | 'shoes' | 'restaurant' | 'tech' | 'mobile' | 'general';
  // New System Toggles
  retailEnabled: boolean;
  wholesaleEnabled: boolean;
  estoreEnabled: boolean;
  estoreThemeColor?: string;
  estorePrimaryColorHover?: string;
  estoreBgColor?: string;
  estoreTextColor?: string;
  estoreCardBgColor?: string;
  estoreOrderTimerEnabled?: boolean;
  estoreOrderTimerMinutes?: number;
  estoreCustomPaymentEnabled?: boolean;
  estoreCustomPaymentName?: string;
  estoreCustomPaymentDetail?: string;
  estoreCustomPaymentNote?: string;
  estoreDeliveryFee?: number;
  estoreMinOrder?: number;
  estoreCodEnabled?: boolean;
  estoreLocationLat?: number;
  estoreLocationLng?: number;
  estoreDeliveryRadius?: number;
  estoreWhatsappEnabled?: boolean;
  estoreWhatsappNumber?: string;
  estorePickupEnabled?: boolean;
  estoreDeliveryEnabled?: boolean;
  storeType?: 'physical' | 'online' | 'both';
  storeLatitude?: number;
  storeLongitude?: number;
  shopOpenTime?: string;      // HH:mm
  shopCloseTime?: string;     // HH:mm
  deliveryStartTime?: string; // HH:mm
  deliveryEndTime?: string;   // HH:mm
  pickupStartTime?: string;   // HH:mm
  pickupEndTime?: string;     // HH:mm
  defaultSaleType?: 'retail' | 'wholesale' | 'estore';
  language?: string;
  touchKeyboardEnabled: boolean;
  soundEnabled: boolean;
  // SaaS / Subscription
  subscriptionTier?: 'free' | 'starter' | 'business';
  isLocked?: boolean;
  aiV2Enabled?: boolean;
  posGridColumns?: number;
  allowCreditOverLimit: boolean;
  enableSplitPayment: boolean;
  enableExtraCharges: boolean;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: Date;
  paymentMethod: 'cash' | 'card' | 'digital';
  storeType?: 'retail' | 'wholesale' | 'estore';
  notes?: string;
  createdAt: Date;
  updatedAt?: Date;
  addedBy?: string;
}

export const EXPENSE_CATEGORIES = [
  'Utilities',
  'Food',
  'Fuel',
  'Rent',
  'Salaries',
  'Supplies',
  'Marketing',
  'Maintenance',
  'Insurance',
  'Taxes',
  'Other'
];

export interface LoginCredentials {
  username: string;
  password: string;
}

// ─── Bundle / Deal Types ───────────────────────────────────────────────────
export interface BundleItem {
  id: string;
  bundleId: string;
  productId: string;
  quantity: number;   // How many units of this product are in the bundle
  createdAt?: Date;
}

export interface BundleSlotOption {
  id: string;
  slotId: string;
  productId: string;
  sortOrder?: number;
  createdAt?: Date;
}

export interface BundleSlot {
  id: string;
  bundleId: string;
  name: string;
  requiredQuantity: number;
  orderIndex: number;
  options?: BundleSlotOption[];
  createdAt?: Date;
}

export type ScheduleType = 'always' | 'scheduled';

export interface Bundle {
  id: string;
  name: string;
  description?: string;
  discountValue: number;
  discountType: 'percentage' | 'fixed';
  active: boolean;
  scheduleType?: ScheduleType;
  startDate?: string;
  endDate?: string;
  repeatDays?: string[];
  startTime?: string;
  endTime?: string;
  hideItemPrices?: boolean;
  isCombo?: boolean;
  dealCategory?: 'pizza' | 'burger' | 'beverage' | 'single_item';
  overridePrice?: number;
  items?: BundleItem[];
  slots?: BundleSlot[];
  highlightTag?: 'sunday' | 'crown';
  badgeEnabled?: boolean;
  badgeText?: string;
  badgeIcon?: string;
  badgeBgColor?: string;
  badgeTextColor?: string;
  estoreSortOrder?: number;
  image?: string;
  extraToppings?: ExtraTopping[];
  createdAt: Date;
  updatedAt: Date;
}
// ────────────────────────────────────────────────────────────────────────────

export interface PurchaseRecord {
  id: string;
  type: 'Opening' | 'Stock IN' | 'Sale' | 'Adjustment' | 'Transfer'; // New type field
  productId?: string;
  productName: string;
  sku?: string;
  quantity: number;
  costPrice: number;
  retailPrice?: number;
  totalAmount: number;
  supplier: string;
  date: Date;
  addedBy: string;
  notes?: string;
}

export interface Topping {
  id: string;
  name: string;
  priceSmall: number;
  priceMedium: number;
  priceLarge: number;
  createdAt: Date;
}

export interface CartItemTopping {
  toppingId: string;
  name: string;
  price: number;
}

export interface ProductTopping {
  id: string;
  productId: string;
  toppingId: string;
}

export interface BundleSlotTopping {
  id: string;
  slotId: string;
  toppingId: string;
}

export interface ExtraTopping {
  id: string;
  name: string;
  priceSmall: number;
  priceMedium: number;
  priceLarge: number;
  active: boolean;
}
