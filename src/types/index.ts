export interface ProductVariant {
  name: string;      // e.g. "Size", "Color"
  options: string[]; // e.g. ["S", "M", "L"], ["Red", "Blue"]
  optionsRaw?: string; // transient raw input string to support smooth comma typing
}

export interface ProductModifier {
  name: string;      // e.g. "Extra Cheese"
  price: number;     // e.g. 150
}

export interface Product {
  id: string;
  workspaceId?: string;
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
  // New fields for advanced features
  isWeightBased?: boolean;
  pricePerUnit?: number; // For weight-based pricing (per kg, per lb, etc.)
  unit?: string; // kg, lb, piece, etc.
  batches?: ProductBatch[];
  trackInventory?: boolean; // Whether to track and manage inventory for this product
  variants?: ProductVariant[];
  modifiers?: ProductModifier[];
  isService?: boolean;
  requireSerial?: boolean;
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
  workspaceId?: string;
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
  workspaceId?: string;
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
  workspaceId?: string;
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
  createdAt?: Date;
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
  selectedVariant?: string; // e.g., "Size: M, Color: Red"
  selectedModifiers?: ProductModifier[];
  serialNumber?: string;
  // Bundle Deal fields
  bundleId?: string;   // Which bundle this item came from (for grouping in cart/receipt)
  bundleName?: string; // Display name of the bundle deal
  bundleHideItemPrices?: boolean; // When true, this item's original price is hidden; only deal total shown
}

export interface Discount {
  id: string;
  name: string;
  description: string;
  type: 'percentage' | 'fixed' | 'bogo' | 'free_gift';
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
  type: 'min_amount' | 'specific_products' | 'payment_method' | 'customer_tier' | 'card_type' | 'bank_name';
  value: any;
  operator?: 'equals' | 'greater_than' | 'less_than' | 'in_array';
  minQuantity?: number; // For specific_products condition - minimum quantity required
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
  status: 'pending' | 'completed' | 'refunded' | 'credit' | 'draft';
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
  workspace_id?: string;
  workspaceId?: string;
}

export interface AppSettings {
  id?: string;
  workspaceId?: string;
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
  workspaceId?: string;
  workspace_id?: string;
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

export interface Bundle {
  id: string;
  workspaceId?: string;
  name: string;
  description?: string;
  discountValue: number;
  discountType: 'percentage' | 'fixed';
  active: boolean;
  hideItemPrices?: boolean;  // When true, per-item original prices are hidden on receipt/POS; only deal final price shown
  items?: BundleItem[];   // Populated on fetch (joined from bundle_items)
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
