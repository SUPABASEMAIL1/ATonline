import React, { createContext, useContext, useReducer, useEffect, useState, useRef } from 'react';
import {
  Product, Customer, Sale, User, Discount, CartItem, AppSettings, SalesTab, DiscountCondition, Expense, PurchaseRecord,
  Category, Supplier, ProductBatch, PurchaseOrder, SupplierTransaction, Payment, StockHistory, Bundle
} from '../types';
import { useAuth } from './AuthContext';
import {
  productsService,
  customersService,
  salesService,
  discountsService,
  usersService,
  suppliersService,
  expensesService,
  purchaseRecordsService,
  categoriesService,
  settingsService,
  salesTabsService,
  purchaseOrdersService,
  supplierTransactionsService,
  paymentModesService,
  stockHistoryService,
  bundlesService,
  mapProduct,
  mapCustomer,
  mapSale,
  mapUser,
  mapSettings,
  mapExpense,
  mapDiscount,
  mapPurchaseRecord,
  mapPayment,
  getNextInvoiceNumber,
  generateNextInvoiceNumber
} from '../lib/services';
import { localDb, seedLocalDb, isPendingDelete, SETTINGS_ID } from '../lib/localDb';
import { supabase } from '../lib/supabase';
import { isSyncEngineBusy } from '../lib/syncEngine';

interface AppState {
  products: Product[];
  customers: Customer[];
  sales: Sale[];
  users: User[];
  discounts: Discount[];
  cart: CartItem[];
  currentUser: User | null;
  settings: AppSettings;
  selectedCustomer: Customer | null;
  salesTabs: SalesTab[];
  activeSalesTab: string;
  billDiscountValue: number;
  billDiscountType: 'percentage' | 'fixed';
  expenses: Expense[];
  purchaseRecords: PurchaseRecord[];
  categories: Category[];
  suppliers: Supplier[];
  productBatches: ProductBatch[];
  purchaseOrders: PurchaseOrder[];
  supplierTransactions: SupplierTransaction[];
  payments: Payment[];
  stockHistory: StockHistory[];
  bundles: Bundle[];
  notes: string;
  editingSaleId: string | null;
  inventoryActiveTab: string;
  inventoryActiveCategory: string;
  lastProductHubId: string | null;
  pendingReturnTab: string | null;
  pendingReturnSaleId: string | null;
  pendingSearch: string | null;
  inventoryPurchasesPage: number;
  loading: boolean;
  error: string | null;
  syncProgress: {
    status: string;
    current: number;
    total: number;
    size?: string;
  } | null;
}

type AppAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_PRODUCTS'; payload: Product[] }
  | { type: 'ADD_PRODUCT'; payload: Product }
  | { type: 'UPDATE_PRODUCT'; payload: Product }
  | { type: 'DELETE_PRODUCT'; payload: string }
  | { type: 'SET_CUSTOMERS'; payload: Customer[] }
  | { type: 'ADD_CUSTOMER'; payload: Customer }
  | { type: 'UPDATE_CUSTOMER'; payload: Customer }
  | { type: 'DELETE_CUSTOMER'; payload: string }
  | { type: 'SET_CART'; payload: CartItem[] }
  | { type: 'ADD_TO_CART'; payload: CartItem }
  | { type: 'UPDATE_CART_ITEM'; payload: { index: number; item: CartItem } }
  | { type: 'REMOVE_FROM_CART'; payload: number }
  | { type: 'CLEAR_CART' }
  | { type: 'SET_CURRENT_USER'; payload: User | null }
  | { type: 'SET_SELECTED_CUSTOMER'; payload: Customer | null }
  | { type: 'SET_SALES'; payload: Sale[] }
  | { type: 'ADD_SALE'; payload: Sale }
  | { type: 'DELETE_SALE'; payload: string }
  | { type: 'SET_USERS'; payload: User[] }
  | { type: 'SET_SETTINGS'; payload: Partial<AppSettings> }
  | { type: 'INCREMENT_INVOICE_COUNTER'; payload: number }
  | { type: 'SET_DISCOUNTS'; payload: Discount[] }
  | { type: 'ADD_DISCOUNT'; payload: Discount }
  | { type: 'UPDATE_DISCOUNT'; payload: Discount }
  | { type: 'DELETE_DISCOUNT'; payload: string }
  | { type: 'ADD_SALES_TAB'; payload: SalesTab }
  | { type: 'UPDATE_SALES_TAB'; payload: { id: string; updates: Partial<SalesTab> } }
  | { type: 'REMOVE_SALES_TAB'; payload: string }
  | { type: 'SET_ACTIVE_SALES_TAB'; payload: string }
  | { type: 'SET_SALES_TABS'; payload: SalesTab[] }
  | { type: 'SET_EXPENSES'; payload: Expense[] }
  | { type: 'ADD_EXPENSE'; payload: Expense }
  | { type: 'UPDATE_EXPENSE'; payload: Expense }
  | { type: 'DELETE_EXPENSE'; payload: string }
  | { type: 'SET_PURCHASE_RECORDS'; payload: PurchaseRecord[] }
  | { type: 'ADD_PURCHASE_RECORD'; payload: PurchaseRecord }
  | { type: 'UPDATE_PURCHASE_RECORD'; payload: PurchaseRecord }
  | { type: 'DELETE_PURCHASE_RECORD'; payload: string }
  | { type: 'SET_CATEGORIES'; payload: Category[] }
  | { type: 'SET_SUPPLIERS'; payload: Supplier[] }
  | { type: 'SET_PRODUCT_BATCHES'; payload: ProductBatch[] }
  | { type: 'SET_PURCHASE_ORDERS'; payload: PurchaseOrder[] }
  | { type: 'SET_SUPPLIER_TRANSACTIONS'; payload: SupplierTransaction[] }
  | { type: 'SET_PAYMENTS'; payload: Payment[] }
  | { type: 'SET_STOCK_HISTORY'; payload: StockHistory[] }
  | { type: 'SET_BUNDLES'; payload: Bundle[] }
  | { type: 'ADD_BUNDLE'; payload: Bundle }
  | { type: 'UPDATE_BUNDLE'; payload: Bundle }
  | { type: 'DELETE_BUNDLE'; payload: string }
  | { type: 'SET_BILL_DISCOUNT'; payload: { value: number; type: 'percentage' | 'fixed' } }
  | { type: 'SET_PENDING_RETURN_TAB'; payload: string | null }
  | { type: 'SET_PENDING_RETURN_SALE_ID'; payload: string | null }
  | { type: 'SET_PENDING_SEARCH'; payload: string | null }
  | { type: 'SET_INVENTORY_PURCHASES_PAGE'; payload: number }
  | { type: 'SET_NOTES'; payload: string }
  | { type: 'SET_EDITING_SALE_ID'; payload: string | null }
  | { type: 'SET_INVENTORY_TAB'; payload: string }
  | { type: 'SET_INVENTORY_CATEGORY'; payload: string }
  | { type: 'SET_LAST_PRODUCT_HUB'; payload: string | null }
  | { type: 'APPEND_SALES'; payload: Sale[] }
  | { type: 'ADD_PRODUCTS_BULK'; payload: Product[] }
  | { type: 'SET_SYNC_PROGRESS'; payload: AppState['syncProgress'] };


const initialState: AppState = {
  products: [],
  customers: [],
  sales: [],
  users: [],
  discounts: [],
  cart: [],
  currentUser: null,
  selectedCustomer: null,
  settings: {
    storeName: 'ZaynahsPos',
    storeAddress: 'Sample Address, City, Country',
    storePhone: '',
    storeEmail: 'zaynahspos@gmail.com',
    storeWebsite: 'https://www.zaynahspos.com',
    storeLogo: undefined,
    taxRate: 0,
    currency: 'PKR',
    interfaceMode: 'traditional',
    autoBackup: true,
    receiptPrinter: true,
    theme: 'dark',
    invoicePrefix: 'INV',
    invoiceCounter: 1000,
    receiptPaperSize: '80mm',
    receiptDensity: 'normal',
    receiptShowLogo: true,
    receiptShowTax: true,
    receiptShowDiscount: true,
    receiptShowStoreName: true,
    receiptShowStoreAddress: true,
    receiptShowStorePhone: true,
    receiptShowStoreEmail: true,
    receiptShowCustomerName: true,
    receiptShowCustomerPhone: true,
    receiptShowNotes: true,
    receiptTemplate: 'modern',
    receiptFontScale: 1,
    receiptFontBold: false,
    receiptFontWeight: 400,
    receiptHeader: 'Official Sales Receipt',
    receiptFooter: 'Thank you for shopping with us!',
    barcodePaperSize: 'A4',
    barcodeA4Columns: 3,
    barcodeA4Rows: 10,
    barcodeShowPrice: true,
    barcodeShowName: true,
    barcodeShowSku: false,
    barcodeShowCategory: false,
    barcodeScale: 1.0,
    barcodeHeight: 30,
    barcodePadding: 8,
    barcodeBorder: true,
    barcodeType: 'BARCODE',
    barcodeFontSize: 8,
    barcodeBarWidth: 0.8,
    country: 'PK',
    taxId: '',
    businessType: 'general',
    retailEnabled: true,
    wholesaleEnabled: false,
    estoreEnabled: false,
    defaultSaleType: 'retail',
    language: 'en',
    touchKeyboardEnabled: false,
    soundEnabled: true,
    receiptPaddingTop: 0,
    receiptPaddingBottom: 0,
    receiptPaddingLeft: 0,
    receiptPaddingRight: 0,
    receiptOffsetX: 0,
    receiptHeaderOffsetX: 0,
    receiptFooterOffsetX: 0,
    offlineMode: true,
    autoSync: true,
    subscriptionTier: 'free',
    isLocked: false,
    aiV2Enabled: false,
    posGridColumns: 4,
    enableSplitPayment: false,
    enableExtraCharges: false,
  },
  salesTabs: [],
  activeSalesTab: '',
  billDiscountValue: 0,
  billDiscountType: 'percentage',
  expenses: [],
  purchaseRecords: [],
  categories: [],
  suppliers: [],
  productBatches: [],
  purchaseOrders: [],
  supplierTransactions: [],
  payments: [],
  stockHistory: [],
  bundles: [],
  notes: '',
  editingSaleId: null,
  inventoryActiveTab: localStorage.getItem('pos_inventory_active_tab') || 'inventory',
  inventoryActiveCategory: 'All',
  lastProductHubId: null,
  pendingReturnTab: null,
  pendingReturnSaleId: null,
  pendingSearch: null,
  inventoryPurchasesPage: 1,
  loading: false,
  error: null,
  syncProgress: null,
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_SYNC_PROGRESS':
      return { ...state, syncProgress: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_PRODUCTS':
      return { ...state, products: action.payload };
    case 'ADD_PRODUCTS_BULK':
      return { ...state, products: [...state.products, ...action.payload] };

    case 'ADD_PRODUCT':
      if (state.products.some(p => p.id === action.payload.id)) {
        return state;
      }
      return { ...state, products: [...state.products, action.payload] };
    case 'UPDATE_PRODUCT':
      if (!action.payload?.id) return state;
      return {
        ...state,
        products: (state.products || []).map(p => (p && p.id === action.payload.id) ? action.payload : p),
      };
    case 'DELETE_PRODUCT':
      return {
        ...state,
        products: state.products.filter(p => p.id !== action.payload),
        purchaseRecords: state.purchaseRecords.filter(r => r.productId !== action.payload),
      };
    case 'SET_CUSTOMERS':
      return { ...state, customers: action.payload };
    case 'ADD_CUSTOMER':
      if (state.customers.some(c => c.id === action.payload.id)) {
        return state;
      }
      return { ...state, customers: [...state.customers, action.payload] };
    case 'UPDATE_CUSTOMER':
      if (!action.payload?.id) return state;
      return {
        ...state,
        customers: (state.customers || []).map(c => (c && c.id === action.payload.id) ? action.payload : c),
      };
    case 'DELETE_CUSTOMER':
      return {
        ...state,
        customers: state.customers.filter(c => c.id !== action.payload),
      };
    case 'SET_CART':
      return {
        ...state,
        cart: action.payload,
        salesTabs: state.salesTabs.map(tab =>
          tab.id === state.activeSalesTab ? { ...tab, cart: action.payload } : tab
        )
      };
    case 'ADD_TO_CART': {
      const newCart = [...state.cart, action.payload];
      return {
        ...state,
        cart: newCart,
        salesTabs: state.salesTabs.map(tab =>
          tab.id === state.activeSalesTab ? { ...tab, cart: newCart } : tab
        )
      };
    }
    case 'UPDATE_CART_ITEM': {
      const newCart = state.cart.map((item, index) =>
        index === action.payload.index ? action.payload.item : item
      );
      return {
        ...state,
        cart: newCart,
        salesTabs: state.salesTabs.map(tab =>
          tab.id === state.activeSalesTab ? { ...tab, cart: newCart } : tab
        )
      };
    }
    case 'REMOVE_FROM_CART': {
      const newCart = state.cart.filter((_, index) => index !== action.payload);
      return {
        ...state,
        cart: newCart,
        salesTabs: state.salesTabs.map(tab =>
          tab.id === state.activeSalesTab ? { ...tab, cart: newCart } : tab
        )
      };
    }
    case 'CLEAR_CART':
      return {
        ...state,
        cart: [],
        selectedCustomer: null,
        billDiscountValue: 0,
        billDiscountType: 'percentage',
        notes: '',
        editingSaleId: null,
        salesTabs: state.salesTabs.map(tab =>
          tab.id === state.activeSalesTab ? { ...tab, cart: [], selectedCustomer: null, billDiscountValue: 0, billDiscountType: 'percentage', notes: '', editingSaleId: null } : tab
        )
      };
    case 'SET_CURRENT_USER':
      return { ...state, currentUser: action.payload };
    case 'SET_SELECTED_CUSTOMER':
      return {
        ...state,
        selectedCustomer: action.payload,
        salesTabs: state.salesTabs.map(tab =>
          tab.id === state.activeSalesTab ? { ...tab, selectedCustomer: action.payload } : tab
        )
      };
    case 'SET_SALES':
      return { ...state, sales: action.payload };
    case 'ADD_SALE': {
      // Guard against duplicates from Realtime
      if (state.sales.some(s => s.id === action.payload.id)) {
        return state; // already exists, ignore
      }
      const sale = action.payload;
      let updatedCustomers = state.customers;
      let updatedProducts = [...state.products];

      // If it's a customer sale, update their stats locally in memory
      if (sale.customerId) {
        const isCreditSale = sale.status === 'credit' || sale.paymentMethod === 'credit';
        updatedCustomers = state.customers.map(c => {
          if (c.id === sale.customerId) {
            return {
              ...c,
              creditUsed: isCreditSale ? (c.creditUsed || 0) + sale.total : (c.creditUsed || 0),
              totalPurchases: (c.totalPurchases || 0) + sale.total,
              lastPurchase: sale.total > 0 ? sale.timestamp : c.lastPurchase,
              updatedAt: new Date()
            };
          }
          return c;
        });
      }

      // Update inventory locally immediately for UI
      if (sale.status === 'completed' || sale.status === 'credit') {
        const isReturn = sale.total < 0 || sale.id.startsWith('RET-') || sale.notes?.includes('RETURN');

        sale.items.forEach(item => {
          const productIdx = updatedProducts.findIndex(p => p.id === item.product.id);
          if (productIdx >= 0 && updatedProducts[productIdx].trackInventory !== false) {
            const qtyToDeduct = item.weight || item.quantity;
            const updatedProduct = { ...updatedProducts[productIdx] };
            // Mathematically correct: positive qty deducts stock, negative qty (return) adds stock
            updatedProduct.stock = (updatedProduct.stock || 0) - qtyToDeduct;
            updatedProducts[productIdx] = updatedProduct;
          }
        });
      }

      return {
        ...state,
        sales: [...state.sales, sale],
        customers: updatedCustomers,
        products: updatedProducts,
      };
    }
    case 'DELETE_SALE': {
      const saleId = action.payload;
      const saleToDelete = state.sales.find(s => s.id === saleId);
      let updatedCustomers = state.customers;
      let updatedProducts = [...state.products];

      if (saleToDelete && saleToDelete.customerId) {
        const isCreditSale = saleToDelete.status === 'credit' || saleToDelete.paymentMethod === 'credit';
        updatedCustomers = state.customers.map(c => {
          if (c.id === saleToDelete.customerId) {
            return {
              ...c,
              creditUsed: isCreditSale ? Math.max(0, (c.creditUsed || 0) - saleToDelete.total) : (c.creditUsed || 0),
              totalPurchases: Math.max(0, (c.totalPurchases || 0) - saleToDelete.total),
              updatedAt: new Date()
            };
          }
          return c;
        });
      }

      // ── RESTORE STOCK IN MEMORY (RULE F2) ──
      if (saleToDelete && (saleToDelete.status === 'completed' || saleToDelete.status === 'credit')) {
        const isReturn = saleToDelete.total < 0 || saleToDelete.id.startsWith('RET-') || saleToDelete.notes?.includes('RETURN');

        saleToDelete.items.forEach(item => {
          const productIdx = updatedProducts.findIndex(p => p.id === item.product.id);
          if (productIdx >= 0 && updatedProducts[productIdx].trackInventory !== false) {
            const qty = item.weight || item.quantity;
            const updatedProduct = { ...updatedProducts[productIdx] };
            // Mathematically correct: deleting a sale restores stock (+qty), deleting a return reverses it (-qty)
            updatedProduct.stock = (updatedProduct.stock || 0) + qty;
            updatedProducts[productIdx] = updatedProduct;
          }
        });
      }

      return {
        ...state,
        sales: state.sales.filter(sale => sale.id !== saleId),
        customers: updatedCustomers,
        products: updatedProducts
      };
    }
    case 'SET_USERS':
      return { ...state, users: action.payload };
    case 'SET_SETTINGS':
      // Recovery Logic: Ensure at least one sale type is enabled if settings are stripped
      const newSettings = { ...state.settings, ...action.payload };
      if (newSettings.retailEnabled === false && newSettings.wholesaleEnabled === false && newSettings.estoreEnabled === false) {
        newSettings.retailEnabled = true;
      }
      return { ...state, settings: newSettings };
    case 'INCREMENT_INVOICE_COUNTER':
      return {
        ...state,
        settings: {
          ...state.settings,
          invoiceCounter: action.payload
        }
      };
    case 'SET_DISCOUNTS':
      return { ...state, discounts: action.payload };
    case 'ADD_DISCOUNT':
      if (state.discounts.some(d => d.id === action.payload.id)) {
        return state;
      }
      return { ...state, discounts: [...state.discounts, action.payload] };
    case 'UPDATE_DISCOUNT':
      if (!action.payload?.id) return state;
      return {
        ...state,
        discounts: (state.discounts || []).map(d => (d && d.id === action.payload.id) ? action.payload : d),
      };
    case 'DELETE_DISCOUNT':
      return {
        ...state,
        discounts: state.discounts.filter(d => d.id !== action.payload),
      };
    case 'ADD_SALES_TAB':
      if (state.salesTabs.length >= 3) return state;
      return {
        ...state,
        salesTabs: [...state.salesTabs, action.payload],
        activeSalesTab: action.payload.id,
        cart: action.payload.cart || [],
        selectedCustomer: action.payload.selectedCustomer || null,
        billDiscountValue: action.payload.billDiscountValue || 0,
        billDiscountType: action.payload.billDiscountType || 'percentage',
        notes: action.payload.notes || '',
        editingSaleId: action.payload.editingSaleId || null,
      };
    case 'UPDATE_SALES_TAB': {
      const updatedTabs = state.salesTabs.map(tab =>
        tab.id === action.payload.id ? { ...tab, ...action.payload.updates } : tab
      );

      // If updating the active tab, also sync the root state properties
      if (action.payload.id === state.activeSalesTab) {
        return {
          ...state,
          salesTabs: updatedTabs,
          cart: action.payload.updates.cart ?? state.cart,
          selectedCustomer: action.payload.updates.selectedCustomer !== undefined
            ? action.payload.updates.selectedCustomer
            : state.selectedCustomer,
          billDiscountValue: action.payload.updates.billDiscountValue !== undefined
            ? action.payload.updates.billDiscountValue
            : state.billDiscountValue,
          billDiscountType: action.payload.updates.billDiscountType !== undefined
            ? action.payload.updates.billDiscountType
            : state.billDiscountType,
          notes: action.payload.updates.notes !== undefined
            ? action.payload.updates.notes
            : state.notes,
          editingSaleId: action.payload.updates.editingSaleId !== undefined
            ? action.payload.updates.editingSaleId
            : state.editingSaleId,
        };
      }

      return {
        ...state,
        salesTabs: updatedTabs,
      };
    }
    case 'REMOVE_SALES_TAB': {
      const { id, nextTabId } = typeof action.payload === 'string'
        ? { id: action.payload, nextTabId: null }
        : action.payload;

      const remainingTabs = state.salesTabs.filter(tab => tab.id !== id);
      const isCurrentActiveRemoved = state.activeSalesTab === id;
      const targetTabId = nextTabId || (remainingTabs.length > 0 ? remainingTabs[0].id : '');

      const newState = {
        ...state,
        salesTabs: remainingTabs,
        activeSalesTab: isCurrentActiveRemoved ? targetTabId : state.activeSalesTab,
      };

      // If we switched tabs, we MUST also update the cart/customer/etc. immediately
      if (isCurrentActiveRemoved && targetTabId) {
        const nextTab = remainingTabs.find(t => t.id === targetTabId);
        return {
          ...newState,
          cart: nextTab?.cart || [],
          selectedCustomer: nextTab?.selectedCustomer || null,
          billDiscountValue: nextTab?.billDiscountValue || 0,
          billDiscountType: nextTab?.billDiscountType || 'percentage',
          notes: nextTab?.notes || '',
          editingSaleId: nextTab?.editingSaleId || null,
        };
      }
      return newState;
    }
    case 'SET_ACTIVE_SALES_TAB':
      const activeTab = state.salesTabs.find(tab => tab.id === action.payload);
      return {
        ...state,
        activeSalesTab: action.payload,
        cart: activeTab?.cart || [],
        selectedCustomer: activeTab?.selectedCustomer || null,
        billDiscountValue: activeTab?.billDiscountValue || 0,
        billDiscountType: activeTab?.billDiscountType || 'percentage',
        notes: activeTab?.notes || '',
        editingSaleId: activeTab?.editingSaleId || null,
      };
    case 'SET_SALES_TABS':
      return { ...state, salesTabs: action.payload.slice(0, 3) };
    case 'SET_EXPENSES':
      return { ...state, expenses: action.payload };
    case 'ADD_EXPENSE':
      if (state.expenses.some(e => e.id === action.payload.id)) {
        return state;
      }
      return { ...state, expenses: [action.payload, ...state.expenses] };
    case 'UPDATE_EXPENSE':
      if (!action.payload?.id) return state;
      return {
        ...state,
        expenses: (state.expenses || []).map(e => (e && e.id === action.payload.id) ? action.payload : e),
      };
    case 'DELETE_EXPENSE':
      return {
        ...state,
        expenses: state.expenses.filter(e => e.id !== action.payload),
      };
    case 'SET_PURCHASE_RECORDS':
      return { ...state, purchaseRecords: action.payload };
    case 'ADD_PURCHASE_RECORD': {
      if (state.purchaseRecords.some(r => r.id === action.payload.id)) {
        return state;
      }
      let updatedProducts = [...state.products];
      const productId = action.payload.productId;
      if (!productId) {
        console.warn('[Reducer] ADD_PURCHASE_RECORD missing productId, skipping stock update');
      } else {
        const productIdx = updatedProducts.findIndex(p => p.id === productId);
        if (productIdx >= 0 && updatedProducts[productIdx].trackInventory !== false) {
          const updatedProduct = { ...updatedProducts[productIdx] };
          updatedProduct.stock = (updatedProduct.stock || 0) + (action.payload.quantity || 0);
          updatedProducts[productIdx] = updatedProduct;
        }
      }
      return {
        ...state,
        purchaseRecords: [action.payload, ...state.purchaseRecords],
        products: updatedProducts
      };
    }
    case 'UPDATE_PURCHASE_RECORD':
      if (!action.payload?.id) return state;
      return {
        ...state,
        purchaseRecords: (state.purchaseRecords || []).map(r => (r && r.id === action.payload.id) ? action.payload : r),
      };
    case 'DELETE_PURCHASE_RECORD':
      return {
        ...state,
        purchaseRecords: state.purchaseRecords.filter(r => r.id !== action.payload),
      };
    case 'SET_CATEGORIES':
      return { ...state, categories: action.payload };
    case 'SET_SUPPLIERS':
      return { ...state, suppliers: action.payload };
    case 'SET_PRODUCT_BATCHES':
      return { ...state, productBatches: action.payload };
    case 'SET_PURCHASE_ORDERS':
      return { ...state, purchaseOrders: action.payload };
    case 'SET_SUPPLIER_TRANSACTIONS':
      return { ...state, supplierTransactions: action.payload };
    case 'SET_PAYMENTS':
      return { ...state, payments: action.payload };
    case 'SET_STOCK_HISTORY':
      return { ...state, stockHistory: action.payload };
    case 'SET_BUNDLES':
      return { ...state, bundles: action.payload };
    case 'ADD_BUNDLE':
      if (state.bundles.some(b => b.id === action.payload.id)) {
        return state;
      }
      return { ...state, bundles: [action.payload, ...state.bundles] };
    case 'UPDATE_BUNDLE':
      if (!action.payload?.id) return state;
      return {
        ...state,
        bundles: state.bundles.map(b => b.id === action.payload.id ? action.payload : b),
      };
    case 'DELETE_BUNDLE':
      return {
        ...state,
        bundles: state.bundles.filter(b => b.id !== action.payload),
      };
    case 'SET_BILL_DISCOUNT':
      return { ...state, billDiscountValue: action.payload.value, billDiscountType: action.payload.type };
    case 'SET_PENDING_RETURN_TAB':
      return { ...state, pendingReturnTab: action.payload };
    case 'SET_PENDING_RETURN_SALE_ID':
      return { ...state, pendingReturnSaleId: action.payload };
    case 'SET_PENDING_SEARCH':
      return { ...state, pendingSearch: action.payload };
    case 'SET_INVENTORY_PURCHASES_PAGE':
      return { ...state, inventoryPurchasesPage: action.payload };
    case 'SET_NOTES':
      return {
        ...state,
        notes: action.payload,
        salesTabs: state.salesTabs.map(tab =>
          tab.id === state.activeSalesTab ? { ...tab, notes: action.payload } : tab
        )
      };
    case 'SET_EDITING_SALE_ID':
      return {
        ...state,
        editingSaleId: action.payload,
        salesTabs: state.salesTabs.map(tab =>
          tab.id === state.activeSalesTab ? { ...tab, editingSaleId: action.payload } : tab
        )
      };
    case 'SET_INVENTORY_TAB':
      localStorage.setItem('pos_inventory_active_tab', action.payload);
      return { ...state, inventoryActiveTab: action.payload };
    case 'SET_INVENTORY_CATEGORY':
      return { ...state, inventoryActiveCategory: action.payload };
    case 'SET_LAST_PRODUCT_HUB':
      return { ...state, lastProductHubId: action.payload };
    case 'APPEND_SALES': {
      const existingIds = new Set(state.sales.map(s => s.id));
      const newSales = action.payload.filter(s => !existingIds.has(s.id));
      return {
        ...state,
        sales: [...state.sales, ...newSales].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      };
    }
    default:
      return state;
  }
}

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  loadData: (silent?: boolean) => Promise<void>;
  loadMoreSales: (offset: number, limit?: number) => Promise<boolean>;
  searchSales: (term: string) => Promise<void>;
} | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const { user, profile } = useAuth();
  const [initialized, setInitialized] = useState(false);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);

  // 💾 POS State Persistence: Load from localStorage on mount
  useEffect(() => {
    const savedCart = localStorage.getItem('pos_cart');
    const savedEditId = localStorage.getItem('pos_editing_id');
    const savedCustomer = localStorage.getItem('pos_selected_customer');

    if (savedCart) {
      try {
        const parsedCart = JSON.parse(savedCart);
        if (parsedCart.length > 0) dispatch({ type: 'SET_CART', payload: parsedCart });
      } catch (e) {
        console.error('[Persistence] Failed to parse cart', e);
      }
    }

    if (savedEditId) {
      dispatch({ type: 'SET_EDITING_SALE_ID', payload: savedEditId });
    }

    if (savedCustomer) {
      try {
        const parsedCustomer = JSON.parse(savedCustomer);
        dispatch({ type: 'SET_SELECTED_CUSTOMER', payload: parsedCustomer });
      } catch (e) {
        console.error('[Persistence] Failed to parse customer', e);
      }
    }
  }, []);

  // 💾 POS State Persistence: Save to localStorage on change
  useEffect(() => {
    localStorage.setItem('pos_cart', JSON.stringify(state.cart));
    if (state.editingSaleId) {
      localStorage.setItem('pos_editing_id', state.editingSaleId);
    } else {
      localStorage.removeItem('pos_editing_id');
    }
    if (state.selectedCustomer) {
      localStorage.setItem('pos_selected_customer', JSON.stringify(state.selectedCustomer));
    } else {
      localStorage.removeItem('pos_selected_customer');
    }
  }, [state.cart, state.editingSaleId, state.selectedCustomer]);

  // Load data from Supabase when user is authenticated
  useEffect(() => {
    if (user && profile && !initialized) {
      loadData().catch(err => console.error('[loadData] unhandled rejection on login:', err));
      setInitialized(true);
    } else if (!user) {
      // Reset state when user logs out
      dispatch({ type: 'SET_PRODUCTS', payload: [] });
      dispatch({ type: 'SET_CUSTOMERS', payload: [] });
      dispatch({ type: 'SET_SALES', payload: [] });
      dispatch({ type: 'SET_USERS', payload: [] });
      dispatch({ type: 'SET_DISCOUNTS', payload: [] });
      dispatch({ type: 'SET_SALES_TABS', payload: [] });
      dispatch({ type: 'SET_EXPENSES', payload: [] });
      dispatch({ type: 'SET_PURCHASE_RECORDS', payload: [] });
      dispatch({ type: 'SET_CATEGORIES', payload: [] });
      dispatch({ type: 'SET_SUPPLIERS', payload: [] });
      dispatch({ type: 'SET_PRODUCT_BATCHES', payload: [] });
      dispatch({ type: 'CLEAR_CART' });
      dispatch({ type: 'SET_CURRENT_USER', payload: null });
      setInitialized(false);
    }
  }, [user, profile, initialized]);

  // Auto-Pull on Reconnect
  useEffect(() => {
    const handleOnline = () => {
      if (user && profile) {
        console.log('[App] Reconnected to internet. Pulling latest data...');
        // Wait 2 seconds to let the syncEngine push any offline queue items first
        setTimeout(() => {
          loadData(true).catch(err => console.error('[loadData] unhandled rejection on reconnect:', err));
        }, 2000);
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [user, profile]);

  // Mirror theme to localStorage for zero-flash loading in index.html
  useEffect(() => {
    localStorage.setItem('theme', state.settings.theme || 'dark');
  }, [state.settings.theme]);





  // Set current user from auth profile and keep it synced with users list (for deactivation)
  useEffect(() => {
    if (profile) {
      // Find the most up-to-date version of this user from our synced users list
      const latestUserRecord = state.users.find(u => u.id === profile.id);
      dispatch({ type: 'SET_CURRENT_USER', payload: latestUserRecord || profile });
    }
  }, [profile, state.users]);

  const subscriptionRef = useRef<any>(null);
  const subscriptionsInitialized = useRef(false);

  // Disconnect/reconnect realtime WebSocket on offline/online to prevent ERR_NAME_NOT_RESOLVED storm
  useEffect(() => {
    const handleOffline = () => {
      console.log('[Realtime] Offline — disconnecting WebSocket.');
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current).catch(() => { });
        subscriptionRef.current = null;
        subscriptionsInitialized.current = false;
      }
    };
    const handleOnline = () => {
      console.log('[Realtime] Online — tearing down stale subscription for re-init.');
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current).catch(() => { });
        subscriptionRef.current = null;
      }
      subscriptionsInitialized.current = false;
      setReconnectTrigger(prev => prev + 1);
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  // 🔄 REALTIME SYNC: Workspace-filtered subscriptions
  useEffect(() => {
    if (!user || !profile) return;

    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    // Clean up any stale channel before re-init (e.g. after online reconnect)
    if (subscriptionRef.current) {
      supabase.removeChannel(subscriptionRef.current).catch(() => { });
      subscriptionRef.current = null;
    }

    if (subscriptionsInitialized.current) return;
    subscriptionsInitialized.current = true;

    const channel = supabase
      .channel('db-changes-global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, async (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          // Guard: Ignore updates for items pending local deletion
          if (await isPendingDelete('products', payload.new.id)) {
            console.log(`[Realtime] Ignoring update for pending-delete product: ${payload.new.id}`);
            return;
          }
          const mapped = mapProduct(payload.new);
          await localDb.products.put(mapped);
          dispatch({ type: payload.eventType === 'INSERT' ? 'ADD_PRODUCT' : 'UPDATE_PRODUCT', payload: mapped });
        } else if (payload.eventType === 'DELETE') {
          await localDb.products.delete(payload.old.id);
          dispatch({ type: 'DELETE_PRODUCT', payload: payload.old.id });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, async (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          if (await isPendingDelete('customers', payload.new.id)) return;
          const mapped = mapCustomer(payload.new);
          await localDb.customers.put(mapped);
          dispatch({ type: payload.eventType === 'INSERT' ? 'ADD_CUSTOMER' : 'UPDATE_CUSTOMER', payload: mapped });
        } else if (payload.eventType === 'DELETE') {
          await localDb.customers.delete(payload.old.id);
          dispatch({ type: 'DELETE_CUSTOMER', payload: payload.old.id });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, async (payload) => {
        if (payload.eventType === 'INSERT') {
          if (await isPendingDelete('sales', payload.new.id)) {
            console.log(`[Realtime] Blocking ghost sale: ${payload.new.id}`);
            return;
          }
          const mapped = mapSale(payload.new);
          await localDb.sales.put(mapped);
          const exists = state.sales.some(s => s.id === mapped.id);
          if (!exists) {
            dispatch({ type: 'ADD_SALE', payload: mapped });
          }
        } else if (payload.eventType === 'DELETE') {
          await localDb.sales.delete(payload.old.id);
          dispatch({ type: 'DELETE_SALE', payload: payload.old.id });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, async (payload) => {
        if (payload.eventType === 'UPDATE') {
          if (payload.new.id !== SETTINGS_ID) return; // Only process our singleton settings row
          const mapped = mapSettings(payload.new);
          await localDb.appSettings.put(mapped);
          dispatch({ type: 'SET_SETTINGS', payload: mapped });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_batches' }, async (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          if (await isPendingDelete('product_batches', payload.new.id)) return;
          await localDb.productBatches.put(payload.new);
          // Product batches are usually handled inside product state, but we can refresh batches state
          const allBatch = await localDb.productBatches.toArray();
          dispatch({ type: 'SET_PRODUCT_BATCHES', payload: allBatch });
        } else if (payload.eventType === 'DELETE') {
          await localDb.productBatches.delete(payload.old.id);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, async (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          if (await isPendingDelete('expenses', payload.new.id)) return;
          const mapped = mapExpense(payload.new);
          await localDb.expenses.put(mapped);
          const all = await localDb.expenses.toArray();
          dispatch({ type: 'SET_EXPENSES', payload: all });
        } else if (payload.eventType === 'DELETE') {
          await localDb.expenses.delete(payload.old.id);
          const all = await localDb.expenses.toArray();
          dispatch({ type: 'SET_EXPENSES', payload: all });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, async (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          if (await isPendingDelete('categories', payload.new.id)) return;
          await localDb.categories.put(payload.new);
          const all = await localDb.categories.toArray();
          dispatch({ type: 'SET_CATEGORIES', payload: all });
        } else if (payload.eventType === 'DELETE') {
          await localDb.categories.delete(payload.old.id);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, async (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          if (await isPendingDelete('suppliers', payload.new.id)) return;
          await localDb.suppliers.put(payload.new);
          const all = await localDb.suppliers.toArray();
          dispatch({ type: 'SET_SUPPLIERS', payload: all });
        } else if (payload.eventType === 'DELETE') {
          await localDb.suppliers.delete(payload.old.id);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'discounts' }, async (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          if (await isPendingDelete('discounts', payload.new.id)) return;
          const mapped = mapDiscount(payload.new);
          await localDb.discounts.put(mapped);
          const all = await localDb.discounts.toArray();
          dispatch({ type: 'SET_DISCOUNTS', payload: all });
        } else if (payload.eventType === 'DELETE') {
          await localDb.discounts.delete(payload.old.id);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_records' }, async (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          if (await isPendingDelete('purchase_records', payload.new.id)) return;
          const mapped = mapPurchaseRecord(payload.new);
          await localDb.purchaseRecords.put(mapped);
          const all = await localDb.purchaseRecords.toArray();
          dispatch({ type: 'SET_PURCHASE_RECORDS', payload: all });
        } else if (payload.eventType === 'DELETE') {
          await localDb.purchaseRecords.delete(payload.old.id);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders' }, async (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          if (await isPendingDelete('purchase_orders', payload.new.id)) return;
          await localDb.purchaseOrders.put(payload.new);
          const all = await localDb.purchaseOrders.toArray();
          dispatch({ type: 'SET_PURCHASE_ORDERS', payload: all });
        } else if (payload.eventType === 'DELETE') {
          await localDb.purchaseOrders.delete(payload.old.id);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'supplier_transactions' }, async (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          if (await isPendingDelete('supplier_transactions', payload.new.id)) return;
          await localDb.supplierTransactions.put(payload.new);
          const all = await localDb.supplierTransactions.toArray();
          dispatch({ type: 'SET_SUPPLIER_TRANSACTIONS', payload: all });
        } else if (payload.eventType === 'DELETE') {
          await localDb.supplierTransactions.delete(payload.old.id);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, async (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          if (await isPendingDelete('payments', payload.new.id)) return;
          await localDb.payments.put(mapPayment(payload.new));
          const all = (await localDb.payments.toArray()).map(mapPayment);
          dispatch({ type: 'SET_PAYMENTS', payload: all });
        } else if (payload.eventType === 'DELETE') {
          await localDb.payments.delete(payload.old.id);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_history' }, async (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          if (await isPendingDelete('stock_history', payload.new.id)) return;
          await localDb.stockHistory.put(payload.new);
          const all = await localDb.stockHistory.toArray();
          dispatch({ type: 'SET_STOCK_HISTORY', payload: all });
        } else if (payload.eventType === 'DELETE') {
          await localDb.stockHistory.delete(payload.old.id);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, async (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          if (await isPendingDelete('users', payload.new.id)) return;
          await localDb.users.put(payload.new);
          const all = await localDb.users.toArray();
          dispatch({ type: 'SET_USERS', payload: all });
        } else if (payload.eventType === 'DELETE') {
          await localDb.users.delete(payload.old.id);
          const all = await localDb.users.toArray();
          dispatch({ type: 'SET_USERS', payload: all });
        }
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.log(`[Realtime] Subscription status: ${status} — will retry in 5s.`);
          subscriptionsInitialized.current = false;
          subscriptionRef.current = null;
          retryTimer = setTimeout(() => {
            if (user && profile && !subscriptionsInitialized.current && !subscriptionRef.current) {
              setReconnectTrigger(prev => prev + 1);
            }
          }, 5000);
        } else if (status === 'SUBSCRIBED') {
          console.log(`[Realtime] Subscription active (single-tenant).`);
        }
      });

    subscriptionRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      subscriptionRef.current = null;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [user, profile, reconnectTrigger]);

  // AUTO-PERSIST ACTIVE TAB TO DB
  useEffect(() => {
    const activeTab = state.salesTabs.find(t => t.id === state.activeSalesTab);
    if (activeTab && user) {
      salesTabsService.update(activeTab.id, activeTab).catch(err => {
        console.error('Error background-saving sales tab:', err);
      });
    }
  }, [state.cart, state.selectedCustomer, state.billDiscountValue, state.billDiscountType, state.activeSalesTab, user]);

  async function loadData(silent: boolean = false) {
    // BUG 2: Wait for sync engine to finish if busy
    let waitLoops = 0;
    while (isSyncEngineBusy() && waitLoops < 40) { // 40 * 200ms = 8 seconds
      await new Promise(r => setTimeout(r, 200));
      waitLoops++;
    }
    const syncEngineWasBusy = waitLoops >= 40;
    if (syncEngineWasBusy) {
      console.warn('[SupabaseAppContext] loadData mutex timeout — sync engine still busy, skipping destructive local write');
    }

    if (!silent) {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({
        type: 'SET_SYNC_PROGRESS',
        payload: { status: 'Preparing local database...', current: 0, total: 10 }
      });
    }

    // ── Clear old SW caches to prevent stale data ──
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k.startsWith('supabase-api-cache')).map(k => caches.delete(k)));
      }
    } catch (_) { /* SW cache clear is best-effort */ }

    // ── STEP 1: Load from local IndexedDB first ──
    try {
      if (!silent) dispatch({ type: 'SET_SYNC_PROGRESS', payload: { status: 'Reading local cache...', current: 1, total: 10 } });
      const [
        localProducts,
        localCustomers,
        localSales,
        localDiscounts,
        localUsers,
        localSalesTabs,
        localExpenses,
        localPurchaseRecords,
        localSettingsArr,
        localCategories,
        localSuppliers
      ] =
        await Promise.all([
          localDb.products.toArray(),
          localDb.customers.toArray(),
          localDb.sales.toArray(),
          localDb.discounts.toArray(),
          localDb.users.toArray(),
          localDb.salesTabs.toArray(),
          localDb.expenses.toArray(),
          localDb.purchaseRecords.toArray(),
          localDb.appSettings.toArray(),
          localDb.categories.toArray(),
          localDb.suppliers.toArray(),
        ]);

      // NOTE: SET_PRODUCTS is dispatched below after batch hydration to avoid "NO BATCHES" flash
      if (localCustomers.length > 0) dispatch({ type: 'SET_CUSTOMERS', payload: localCustomers });
      // Load the most recent 1000 sales into memory to keep the app snappy
      const recentSales = localSales
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 1000);

      dispatch({ type: 'SET_SALES', payload: recentSales });
      if (localDiscounts.length > 0) dispatch({ type: 'SET_DISCOUNTS', payload: localDiscounts });
      if (localUsers.length > 0) dispatch({ type: 'SET_USERS', payload: localUsers });
      if (localSalesTabs.length > 0) dispatch({ type: 'SET_SALES_TABS', payload: localSalesTabs.slice(0, 3) });
      if (localExpenses.length > 0) dispatch({ type: 'SET_EXPENSES', payload: localExpenses });
      if (localPurchaseRecords.length > 0) dispatch({ type: 'SET_PURCHASE_RECORDS', payload: localPurchaseRecords });
      if (localCategories.length > 0) dispatch({ type: 'SET_CATEGORIES', payload: localCategories });
      if (localSuppliers.length > 0) dispatch({ type: 'SET_SUPPLIERS', payload: localSuppliers });

      // Load bundles from local cache
      try {
        const localBundles = await localDb.bundles.toArray();
        const localBundleItems = await localDb.bundleItems.toArray();
        const localBundleSlots = await localDb.bundleSlots.toArray();
        const localBundleSlotOptions = await localDb.bundleSlotOptions.toArray();
        if (localBundles.length > 0) {
          const bundlesWithItems = localBundles.map((b: any) => ({
            ...b,
            items: localBundleItems.filter((bi: any) => bi.bundleId === b.id),
            slots: localBundleSlots.filter((s: any) => s.bundleId === b.id).map(s => ({
              ...s,
              options: localBundleSlotOptions.filter((o: any) => o.slotId === s.id)
            }))
          }));
          dispatch({ type: 'SET_BUNDLES', payload: bundlesWithItems });
        }
      } catch (e) {
        console.warn('[AppContext] Bundle local load failed', e);
      }

      const localSettings = localSettingsArr.find(s => s.id === SETTINGS_ID) || localSettingsArr[0];
      if (localSettings) {
        dispatch({ type: 'SET_SETTINGS', payload: { ...initialState.settings, ...localSettings } });
      }

      // Re-hydrate product.batches from productBatches store for initial UI display
      const localBatchRecords = await localDb.productBatches.toArray();

      // ── STARTUP REPAIR: Auto-fix null batchNumber values ──
      let repairedCount = 0;
      for (const batch of localBatchRecords) {
        if (!batch.batchNumber) {
          const repairedNum = `B-REPAIR-${batch.id.substr(0, 8).toUpperCase()}`;
          await localDb.productBatches.update(batch.id, { batchNumber: repairedNum });
          (batch as any).batchNumber = repairedNum;
          repairedCount++;
        }
      }
      if (repairedCount > 0) {
        console.log(`[AppContext] Auto-repaired ${repairedCount} null batchNumber(s) in local DB`);
      }

      if (localBatchRecords.length > 0) {
        const batchMap = localBatchRecords.reduce((acc: Record<string, any[]>, b: any) => {
          const pid = b.productId || b.product_id;
          if (pid) { (acc[pid] = acc[pid] || []).push(b); }
          return acc;
        }, {} as Record<string, any[]>);
        // Patch products in-state with their batches
        const hydratedProducts = localProducts.map((p: any) => ({
          ...p,
          batches: batchMap[p.id] || p.batches || []
        }));
        if (hydratedProducts.length > 0) dispatch({ type: 'SET_PRODUCTS', payload: hydratedProducts });
        const localBatches = localBatchRecords as ProductBatch[];
        dispatch({ type: 'SET_PRODUCT_BATCHES', payload: localBatches });
      } else {
        // No batches — dispatch products as-is
        if (localProducts.length > 0) dispatch({ type: 'SET_PRODUCTS', payload: localProducts });
        const localBatches = localProducts.reduce((acc: ProductBatch[], p: any) => [...acc, ...(p.batches || [])], [] as ProductBatch[]);
        if (localBatches.length > 0) dispatch({ type: 'SET_PRODUCT_BATCHES', payload: localBatches });
      }

      if (localProducts.length > 0 || localSettingsArr.length > 0) {
        dispatch({ type: 'SET_LOADING', payload: false });
      } else if (!navigator.onLine) {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    } catch (localErr) {
      console.warn('Local DB read failed:', localErr);
    }

    if (!navigator.onLine) {
      dispatch({ type: 'SET_SYNC_PROGRESS', payload: null });
      return;
    }

    const fetchBackgroundData = async () => {
      try {
        let totalBytes = 0;
        const totalSteps = 10;
        let currentStep = 2;

        const updateStatus = (status: string, count: number) => {
          const estimatedSize = (totalBytes / 1024).toFixed(1);
          dispatch({
            type: 'SET_SYNC_PROGRESS',
            payload: {
              status,
              current: currentStep++,
              total: totalSteps,
              size: estimatedSize + ' KB'
            }
          });
          // Heuristic size increase based on count
          totalBytes += count * 450;
        };

        if (!silent) dispatch({ type: 'SET_SYNC_PROGRESS', payload: { status: 'Connecting to cloud...', current: currentStep, total: totalSteps } });

        // Phase 1
        const [settings, categoriesData] = await Promise.all([
          settingsService.fetchRemote(),
          categoriesService.fetchRemote()
        ]);
        if (settings) {
          // CRITICAL: Don't overwrite local settings if we have a pending sync operation
          const pending = await localDb.pendingOps
            .where('[entity+entityId]')
            .equals(['app_settings', SETTINGS_ID])
            .first();

          const local = await localDb.appSettings.get(SETTINGS_ID);

          // Only overwrite if no pending ops AND remote is strictly newer or local is missing
          const remoteTs = settings.updatedAt ? new Date(settings.updatedAt).getTime() : 0;
          const localTs = local?.updatedAt ? new Date(local.updatedAt).getTime() : 0;
          const remoteIsNewer = !local || (remoteTs > localTs + 2000);

          if (!pending && remoteIsNewer) {
            console.log(`[Handshake] Updating settings from cloud (Remote: ${remoteTs} vs Local: ${localTs})`);
            dispatch({ type: 'SET_SETTINGS', payload: settings });
            await localDb.appSettings.put(settings);
          } else {
            console.log(`[Handshake] Preserving local settings. Reason: ${pending ? 'Sync Pending' : 'Local is newer/same'}`);
          }
        }
        if (categoriesData) {
          dispatch({ type: 'SET_CATEGORIES', payload: categoriesData });
          await localDb.categories.bulkPut(categoriesData);
        }
        updateStatus('Cloud handshake complete...', (categoriesData?.length || 0) + 1);

        // Phase 2: Sequential fetch from Supabase to seed local cache
        const products = await productsService.fetchRemote();
        updateStatus(`Fetched ${products.length} products...`, products.length);

        const customers = await customersService.fetchRemote();
        updateStatus(`Fetched ${customers.length} customers...`, customers.length);

        const sales = await salesService.fetchRemote();
        updateStatus(`Fetched ${sales.length} sales records...`, sales.length);

        const [discounts, usersList, expenses, purchaseRecords, suppliersData] = await Promise.all([
          discountsService.fetchRemote(),
          usersService.fetchRemote(),
          expensesService.fetchRemote(),
          purchaseRecordsService.fetchRemote(),
          suppliersService.fetchRemote()
        ]);
        updateStatus('Syncing marketing and procurement data...', discounts.length + usersList.length + expenses.length + purchaseRecords.length + suppliersData.length);

        // Fetch sales tabs, supplier transactions, product batches, stock history, payments
        const [salesTabsData, supplierTxData, remoteBatches, remoteStockHistory, remotePayments] = await Promise.all([
          supabase.from('sales_tabs').select('*').eq('user_id', user.id),
          supplierTransactionsService.fetchRemote().catch(() => []),
          supabase.from('product_batches').select('*').then(r => (r.data || []).map((b: any) => ({
            ...b,
            productId: b.product_id ?? b.productId,
            batchNumber: b.batch_number ?? b.batchNumber,
            qtyRemaining: b.qty_remaining ?? b.qtyRemaining,
            costPrice: b.cost_price ?? b.costPrice,
            salePrice: b.sale_price ?? b.salePrice,
            createdAt: b.created_at ? new Date(b.created_at) : new Date(),
          }))).catch(() => []),
          stockHistoryService.fetchRemote().catch(() => []),
          supabase.from('payments').select('*').then(r => (r.data || []).map(mapPayment)).catch(() => [])
        ]);
        const salesTabs = (salesTabsData.data || []).map(t => ({ ...t, userId: t.user_id, selectedCustomerId: t.selected_customer_id }));

        // Seed remote batches into local productBatches table so batch hydration works
        if (remoteBatches.length > 0) {
          await localDb.productBatches.bulkPut(remoteBatches).catch(() => { });
        }
        // Seed remote stock history
        if (remoteStockHistory.length > 0) {
          await localDb.stockHistory.bulkPut(remoteStockHistory).catch(() => { });
        }

        // ── FIELD-LEVEL SMART MERGE ──
        // CRITICAL FIX: The old filterPending would completely exclude fresh remote data
        // for any entity with ANY pending op (even unrelated fields like stock).
        // This caused stale prices/names to persist forever.
        //
        // NEW: Remote data is always the BASE. Only the specific pending op fields are overlaid.
        // Additionally, offline-only records (created locally, not yet synced) are included.
        const allPendingOps = await localDb.pendingOps.toArray();

        const smartMerge = async (entity: string, remoteItems: any[], localTable: any) => {
          const entityOps = allPendingOps.filter(op => op.entity === entity);

          // Build map: entityId -> merged pending payload (for updates/creates/upserts)
          const pendingPayloadMap = new Map<string, Record<string, any>>();
          const pendingDeleteIds = new Set<string>();
          const pendingCreateIds = new Set<string>();

          for (const op of entityOps) {
            if (op.opType === 'delete') {
              pendingDeleteIds.add(op.entityId);
              continue;
            }
            if (op.opType === 'create') {
              pendingCreateIds.add(op.entityId);
            }
            const existing = pendingPayloadMap.get(op.entityId) || {};
            pendingPayloadMap.set(op.entityId, { ...existing, ...op.payload });
          }

          const remoteIds = new Set(remoteItems.map(item => item.id));

          // 1. Start with remote items, applying field-level overlay for pending ops
          const merged = remoteItems
            .filter(item => !pendingDeleteIds.has(item.id)) // Remove deleted items
            .map(item => {
              const pendingFields = pendingPayloadMap.get(item.id);
              if (!pendingFields) return item; // No pending ops — pure fresh remote
              // Use remote as base, overlay ONLY the pending local fields
              return { ...item, ...pendingFields };
            });

          // 2. Add offline-only records (pending creates not in remote set)
          const offlineOnlyIds = [...pendingCreateIds].filter(id => !remoteIds.has(id));
          if (offlineOnlyIds.length > 0) {
            const offlineRecords = await localTable.where('id').anyOf(offlineOnlyIds).toArray();
            merged.push(...offlineRecords);
          }

          return merged;
        };

        // ── PRODUCTS (with batch hydration) ──
        const rawMergedProducts = await smartMerge('products', products, localDb.products);

        // Re-hydrate product.batches from the separate productBatches table.
        const allLocalBatches = await localDb.productBatches.toArray();
        const batchesByProductId = allLocalBatches.reduce((acc: Record<string, any[]>, b: any) => {
          const pid = b.productId || b.product_id;
          if (pid) { (acc[pid] = acc[pid] || []).push(b); }
          return acc;
        }, {} as Record<string, any[]>);

        const mergedProducts = rawMergedProducts.map((p: any) => ({
          ...p,
          batches: batchesByProductId[p.id] || p.batches || []
        }));

        // ── OTHER ENTITIES ──
        const mergedCustomers = await smartMerge('customers', customers, localDb.customers);

        const allSales = await smartMerge('sales', sales, localDb.sales);
        const mergedSales = allSales
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 1000);

        const mergedDiscounts = await smartMerge('discounts', discounts, localDb.discounts);
        const mergedUsers = await smartMerge('users', usersList, localDb.users);
        const mergedSuppliers = await smartMerge('suppliers', suppliersData, localDb.suppliers);
        const mergedExpenses = (await smartMerge('expenses', expenses, localDb.expenses))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const mergedPurchaseRecords = (await smartMerge('purchase_records', purchaseRecords, localDb.purchaseRecords))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const mergedPayments = await smartMerge('payments', remotePayments, localDb.payments);

        const allBatches = mergedProducts.reduce((acc, p) => [...acc, ...(p.batches || [])], [] as ProductBatch[]);
        const mergedSalesTabs = (await smartMerge('sales_tabs', salesTabs as SalesTab[], localDb.salesTabs)).slice(0, 3);

        dispatch({ type: 'SET_PRODUCTS', payload: mergedProducts });
        dispatch({ type: 'SET_CUSTOMERS', payload: mergedCustomers });
        dispatch({ type: 'SET_SALES', payload: mergedSales });
        dispatch({ type: 'SET_DISCOUNTS', payload: mergedDiscounts });
        dispatch({ type: 'SET_USERS', payload: mergedUsers });
        dispatch({ type: 'SET_SALES_TABS', payload: mergedSalesTabs as SalesTab[] });
        dispatch({ type: 'SET_SUPPLIERS', payload: mergedSuppliers });
        dispatch({ type: 'SET_PRODUCT_BATCHES', payload: allBatches });
        dispatch({ type: 'SET_EXPENSES', payload: mergedExpenses });
        dispatch({ type: 'SET_PURCHASE_RECORDS', payload: mergedPurchaseRecords });
        dispatch({ type: 'SET_PAYMENTS', payload: mergedPayments });

        // ── DESTRUCTIVE LOCAL WRITE (skipped if sync engine was busy) ──
        let remoteBundles: Bundle[] = [];
        if (!syncEngineWasBusy) {
          await localDb.transaction(
            'rw',
            localDb.products,
            localDb.customers,
            localDb.sales,
            localDb.discounts,
            localDb.users,
            localDb.suppliers,
            localDb.expenses,
            localDb.purchaseRecords,
            localDb.productBatches,
            localDb.stockHistory,
            localDb.payments,
            localDb.pendingOps,
            async () => {
              // Helper for smart deletion to prevent race condition data loss
              const processDeletions = async (table: any, mergedItems: any[], entityName: string) => {
                const localItems = await table.toArray();
                const mergedIds = new Set(mergedItems.map(i => i.id));
                const pendingOps = await localDb.pendingOps.where('entity').equals(entityName).toArray();
                const pendingIds = new Set(pendingOps.map(op => op.entityId));
                const now = Date.now();
                const fiveMinutes = 5 * 60 * 1000;

                const idsToDelete = localItems.filter((local: any) => {
                  const isAbsentFromRemote = !mergedIds.has(local.id);
                  const isAbsentFromPending = !pendingIds.has(local.id);

                  // Parse createdAt / updatedAt safely
                  let lastModifiedTs = 0;
                  if (local.updatedAt) lastModifiedTs = new Date(local.updatedAt).getTime();
                  else if (local.createdAt) lastModifiedTs = new Date(local.createdAt).getTime();
                  else if (local.updated_at) lastModifiedTs = new Date(local.updated_at).getTime();
                  else if (local.created_at) lastModifiedTs = new Date(local.created_at).getTime();

                  // If it doesn't have a timestamp, assume it's old enough, or if it's strictly older than 5 mins
                  const isOlderThan5Mins = lastModifiedTs === 0 || (now - lastModifiedTs > fiveMinutes);

                  return isAbsentFromRemote && isAbsentFromPending && isOlderThan5Mins;
                }).map((local: any) => local.id);

                if (idsToDelete.length > 0) {
                  console.log(`[loadData] Smart deleting ${idsToDelete.length} obsolete ${entityName} records`);
                  await table.bulkDelete(idsToDelete);
                }
              };

              await processDeletions(localDb.products, mergedProducts, 'products');
              if (mergedProducts.length > 0) await localDb.products.bulkPut(mergedProducts);

              await processDeletions(localDb.customers, mergedCustomers, 'customers');
              if (mergedCustomers.length > 0) await localDb.customers.bulkPut(mergedCustomers);

              await processDeletions(localDb.sales, mergedSales, 'sales');
              if (mergedSales.length > 0) await localDb.sales.bulkPut(mergedSales);

              await processDeletions(localDb.discounts, mergedDiscounts, 'discounts');
              if (mergedDiscounts.length > 0) await localDb.discounts.bulkPut(mergedDiscounts);

              await processDeletions(localDb.users, mergedUsers, 'users');
              if (mergedUsers.length > 0) await localDb.users.bulkPut(mergedUsers);

              await processDeletions(localDb.suppliers, mergedSuppliers, 'suppliers');
              if (mergedSuppliers.length > 0) await localDb.suppliers.bulkPut(mergedSuppliers);

              await processDeletions(localDb.expenses, mergedExpenses, 'expenses');
              if (mergedExpenses.length > 0) await localDb.expenses.bulkPut(mergedExpenses);

              await processDeletions(localDb.purchaseRecords, mergedPurchaseRecords, 'purchase_records');
              if (mergedPurchaseRecords.length > 0) await localDb.purchaseRecords.bulkPut(mergedPurchaseRecords);

              await processDeletions(localDb.productBatches, allBatches, 'product_batches');
              if (allBatches.length > 0) await localDb.productBatches.bulkPut(allBatches);

              await processDeletions(localDb.stockHistory, remoteStockHistory, 'stock_history');
              if (remoteStockHistory.length > 0) await localDb.stockHistory.bulkPut(remoteStockHistory);

              await processDeletions(localDb.payments, mergedPayments, 'payments');
              if (mergedPayments.length > 0) await localDb.payments.bulkPut(mergedPayments);
            }
          );
          if (supplierTxData.length > 0) {
            dispatch({ type: 'SET_SUPPLIER_TRANSACTIONS', payload: supplierTxData });
            await localDb.supplierTransactions.bulkPut(supplierTxData).catch(() => { });
          }

          // Load bundles from cloud
          try {
            remoteBundles = await bundlesService.getAll(true);
            dispatch({ type: 'SET_BUNDLES', payload: remoteBundles });
            console.log(`[AppContext] Loaded ${remoteBundles.length} bundles from cloud`);
          } catch (e) {
            console.warn('[AppContext] Bundle cloud load failed, using local', e);
          }

          await seedLocalDb({
            products, customers, sales, discounts, users: usersList,
            salesTabs: salesTabs as SalesTab[], settings,
            expenses, purchaseRecords, categories: categoriesData,
            suppliers: suppliersData, productBatches: allBatches,
            supplierTransactions: supplierTxData,
            bundles: remoteBundles,
            bundleItems: remoteBundles.reduce((acc: any[], b: Bundle) => {
              if (b.items) acc.push(...b.items);
              return acc;
            }, []),
            bundleSlots: remoteBundles.reduce((acc: any[], b: Bundle) => {
              if (b.slots) acc.push(...b.slots);
              return acc;
            }, []),
            bundleSlotOptions: remoteBundles.reduce((acc: any[], b: Bundle) => {
              if (b.slots) b.slots.forEach((s: any) => { if (s.options) acc.push(...s.options); });
              return acc;
            }, []),
          });
        } // end if (!syncEngineWasBusy)

        // ── ADDITIVE RECONCILIATION: Only add offline-created records that weren't in the cloud set ──
        // CRITICAL FIX: The old reconciliation re-read ALL of IndexedDB and dispatched it to React state.
        // This OVERWROTE the fresh cloud data (just dispatched above) with stale IndexedDB data.
        // New behavior: we only look for records in IndexedDB that are NOT in the merged sets (offline-only creates)
        // and ADD them to state without overwriting the fresh cloud data.
        try {
          const mergedProductIds = new Set(mergedProducts.map((p: any) => p.id));
          const mergedCustomerIds = new Set(mergedCustomers.map((c: any) => c.id));

          // Find orphaned local records that the smart merge missed (edge case: created during sync)
          const localProducts = await localDb.products.toArray();
          const localCustomers = await localDb.customers.toArray();
          const orphanProducts = localProducts.filter(p => !mergedProductIds.has(p.id));
          const orphanCustomers = localCustomers.filter(c => !mergedCustomerIds.has(c.id));

          if (orphanProducts.length > 0) {
            console.log(`[loadData] Adding ${orphanProducts.length} orphan local products to state`);
            dispatch({ type: 'ADD_PRODUCTS_BULK', payload: orphanProducts });
          }
          if (orphanCustomers.length > 0) {
            console.log(`[loadData] Adding ${orphanCustomers.length} orphan local customers to state`);
            for (const c of orphanCustomers) {
              dispatch({ type: 'ADD_CUSTOMER', payload: c });
            }
          }
        } catch (reconErr) {
          console.error('[loadData] Additive reconciliation failed (non-fatal):', reconErr);
        }

          if (!silent) {
            const bundleStatus = remoteBundles.length > 0
              ? ` | ${remoteBundles.length} bundles restored`
              : '';
            dispatch({
              type: 'SET_SYNC_PROGRESS',
              payload: {
                status: `System ready!${bundleStatus}`,
                current: totalSteps,
                total: totalSteps,
                size: (totalBytes / 1024).toFixed(1) + ' KB'
              }
            });
            setTimeout(() => dispatch({ type: 'SET_SYNC_PROGRESS', payload: null }), 1000);
          }
          const remainingAfterFetch = await localDb.pendingOps.count();
          if (remainingAfterFetch === 0) {
            console.log(`✅ Full Sync Complete. ${remoteBundles.length > 0 ? `${remoteBundles.length} bundles restored` : ''}`);
        } else {
          console.log(`📋 Background fetch done (${remainingAfterFetch} pending ops still in queue).`);
        }
      } catch (err) {
        console.error('❌ Sync Failed:', err);
        dispatch({ type: 'SET_SYNC_PROGRESS', payload: null });
      }
    };

    try {
      await fetchBackgroundData();
      dispatch({ type: 'SET_ERROR', payload: null });
    } catch (error) {
      console.error('[loadData] fetchBackgroundData failed:', error);
      dispatch({ type: 'SET_ERROR', payload: null });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }

  async function loadMoreSales(offset: number, limit: number = 100) {
    try {
      const moreLocal = await localDb.sales
        .orderBy('timestamp')
        .reverse()
        .offset(offset)
        .limit(limit)
        .toArray();

      if (moreLocal.length > 0) {
        dispatch({ type: 'APPEND_SALES', payload: moreLocal });
        return true;
      }
      return false;
    } catch (e) {
      console.error("Load more sales failed:", e);
      return false;
    }
  }

  async function searchSales(term: string) {
    if (!term || term.length < 2) return;

    try {
      // 1. Search Local Dexie
      const localMatches = await localDb.sales
        .filter(s =>
          (s.receiptNumber || '').toLowerCase().includes(term.toLowerCase()) ||
          (s.invoiceNumber || '').toLowerCase().includes(term.toLowerCase()) ||
          (s.customerName || '').toLowerCase().includes(term.toLowerCase())
        )
        .limit(50)
        .toArray();

      if (localMatches.length > 0) {
        dispatch({ type: 'APPEND_SALES', payload: localMatches });
      }

      // 2. If online, search Supabase
      if (navigator.onLine) {
        const { data, error } = await supabase
          .from('sales')
          .select('*')
          .or(`receipt_number.ilike.%${term}%,invoice_number.ilike.%${term}%,customer_name.ilike.%${term}%`)
          .limit(20);

        if (data && data.length > 0) {
          const mapped = data.map(mapSale);
          dispatch({ type: 'APPEND_SALES', payload: mapped });
          // Save to local for future offline use
          await localDb.sales.bulkPut(mapped);
        }
      }
    } catch (e) {
      console.warn("Sales search failed:", e);
    }
  }

  return (
    <AppContext.Provider value={{ state, dispatch, loadData, loadMoreSales, searchSales }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    return {
      state: {
        loading: false,
        products: [],
        categories: [],
        customers: [],
        cart: [],
        selectedCustomer: null,
        settings: {},
        errors: {},
        syncProgress: null,
        currentUser: null,
      },
      dispatch: () => { },
      loadData: async () => { }
    };
  }
  return context;
}

// Utility function to check if discounts apply
export function checkDiscountEligibility(
  discount: Discount,
  cart: CartItem[],
  customer: Customer | null,
  paymentMethod: string,
  total: number,
  cardDetails?: { cardType?: string; bankName?: string }
): boolean {
  // Check if discount is active and within valid period
  if (!discount.active) return false;

  const now = new Date();
  if (now < discount.validFrom || now > discount.validTo) return false;

  // Check valid days
  if (discount.validDays && discount.validDays.length > 0) {
    const currentDay = now.getDay();
    if (!discount.validDays.includes(currentDay)) return false;
  }

  // Check conditions
  for (const condition of discount.conditions) {
    if (!checkCondition(condition, cart, customer, paymentMethod, total, cardDetails)) {
      return false;
    }
  }

  return true;
}

function checkCondition(
  condition: DiscountCondition,
  cart: CartItem[],
  customer: Customer | null,
  paymentMethod: string,
  total: number,
  cardDetails?: { cardType?: string; bankName?: string }
): boolean {
  switch (condition.type) {
    case 'min_amount':
      return total >= condition.value;

    case 'specific_products':
      if (!Array.isArray(condition.value)) return false;
      const requiredProducts = condition.value;
      const minQuantity = condition.minQuantity || 1;

      for (const productId of requiredProducts) {
        const cartItem = cart.find(item => item.product.id === productId);
        if (!cartItem || cartItem.quantity < minQuantity) {
          return false;
        }
      }
      return true;

    case 'payment_method':
      return paymentMethod === condition.value;

    case 'customer_tier':
      return customer?.priceTier === condition.value;

    case 'card_type':
      return paymentMethod === 'card' && cardDetails?.cardType === condition.value;

    case 'bank_name':
      return paymentMethod === 'card' && cardDetails?.bankName === condition.value;

    default:
      return true;
  }
}

// Generate invoice number and automatically update counter in state
export function useInvoiceGeneration() {
  const { state, dispatch } = useApp();

  return async () => {
    // 1. Immediately calculate the new invoice number and counter
    const { invoiceNumber, newCounter } = generateNextInvoiceNumber(state.settings);

    // 2. Dispatch to local React state INSTANTLY so the UI knows the counter increased
    dispatch({ type: 'INCREMENT_INVOICE_COUNTER', payload: newCounter });

    // 3. Fire-and-forget the database settings update (don't await it, don't block checkouts)
    settingsService.update({ invoiceCounter: newCounter }).catch(error => {
      console.error('Error background-syncing invoice counter:', error);
    });

    // 4. Return the brand new invoice immediately
    return invoiceNumber;
  };
}

// Utility functions for invoice counter management
export function resetInvoiceCounter(dispatch: any, newCounter: number = 0) {
  dispatch({ type: 'INCREMENT_INVOICE_COUNTER', payload: newCounter });
}

export function setInvoicePrefix(dispatch: any, prefix: string) {
  dispatch({ type: 'SET_SETTINGS', payload: { invoicePrefix: prefix } });
}

// Hook for invoice statistics
export function useInvoiceStats() {
  const { state } = useApp();

  return () => {
    const totalInvoices = state.sales.length;
    const currentCounter = state.settings.invoiceCounter;
    const prefix = state.settings.invoicePrefix;
    const nextInvoiceNumber = getNextInvoiceNumber(state.settings);

    return {
      totalInvoices,
      currentCounter,
      prefix,
      nextInvoiceNumber,
    };
  };
}
