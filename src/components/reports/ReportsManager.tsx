import { useState, useMemo, useEffect, useRef } from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line, ResponsiveContainer } from 'recharts';
import { TrendingUp, Wallet, Package, Users, DollarSign, Clock, FileText, PieChart as PieIcon, Truck, LayoutGrid, Store, BarChart3, RefreshCw, Zap, Coffee, Fuel, Home, Megaphone, Wrench, ShieldCheck, MoreHorizontal, ChevronLeft } from 'lucide-react';

import { useApp } from '../../context/SupabaseAppContext';
import { subDays, startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay } from 'date-fns';
import { formatCurrency, formatNumberWithPrecision } from '../../lib/currencies';
import { formatAppDate, formatAppDateTime, formatAppDateChart, getTimezone, getStartOfDayInTimezone, getEndOfDayInTimezone, getStartOfInputDayInTimezone, getEndOfInputDayInTimezone } from '../../lib/dateUtils';
import { EXPENSE_CATEGORIES, Sale, Expense } from '../../types';
import InventoryReportManager from '../inventory/InventoryReportManager';
import { localDb } from '../../lib/localDb';
import { supabase } from '../../lib/supabase';
import {
  salesService,
  expensesService,
  categoriesService,
  customersService,
  getAmountByMethod,
  mapPayment
} from '../../lib/services';
import { SearchableSelect } from '../common/SearchableSelect';
import { SalesReport } from './tabs/SalesReport';
import { ExpensesReport } from './tabs/ExpensesReport';
import { CustomersReport } from './tabs/CustomersReport';
import { FinancialReport } from './tabs/FinancialReport';
import { InventoryReport } from './tabs/InventoryReport';
import { SkeletonLoader } from '../common/SkeletonLoader';

import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from '../../hooks/useTranslation';

export const getItemCOGS = (item: any): { cost: number; isEstimated: boolean } => {
  // Priority 1: FIFO cost saved at sale time (most accurate)
  if (item.purchaseCost && item.purchaseCost > 0) {
    return { cost: item.purchaseCost, isEstimated: false };
  }

  // Priority 2: Current product cost (fallback, less accurate for old sales)
  if (item.product?.cost && item.product.cost > 0) {
    const qty = item.weight ? item.weight : (item.quantity || 1);
    return { cost: item.product.cost * qty, isEstimated: true };
  }

  // Priority 3: Missing cost — return 0 but don't spam console
  return { cost: 0, isEstimated: true };
};


export function getEffectiveTotal(sale: any): number {
  if (sale.status === 'refunded' || sale.status === 'deleted') return 0;
  if (sale.status === 'partially_refunded') return (sale.total || 0) - (sale.refundedAmount || 0);
  return sale.total || 0;
}

export function getItemRevenue(item: any, sale: Sale): number {
  const extraChargesTotal = (sale.extraCharges || []).reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  // Net Bill Total = Total - Tax - Extra Charges (This is the amount actually paid for products)
  const netBillTotal = (getEffectiveTotal(sale)) - (Number(sale.taxAmount) || 0) - extraChargesTotal;

  // Total of all item subtotals (price * qty - line_discount)
  const saleItemsSubtotal = sale.items?.reduce((sum, i) => sum + (Number(i.subtotal) || 0), 0) || 0;

  // Distribution ratio accounts for bill-level discounts
  const distributionRatio = saleItemsSubtotal > 0 ? netBillTotal / saleItemsSubtotal : 1;

  return (Number(item.subtotal) || 0) * distributionRatio;
}



const CATEGORY_ICONS: Record<string, any> = {
  'Utilities': Zap,
  'Food': Coffee,
  'Fuel': Fuel,
  'Rent': Home,
  'Salaries': Users,
  'Supplies': Package,
  'Marketing': Megaphone,
  'Maintenance': Wrench,
  'Insurance': ShieldCheck,
  'Taxes': FileText,
  'Other': MoreHorizontal
};

export function ReportsManager() {
  const navigate = useNavigate();
  const { subTab } = useParams();
  const { state } = useApp();
  const { t } = useTranslation();

  // Safety check to prevent black screen if settings haven't loaded yet
  if (!state?.settings) {
    return (
      <div className="p-6 bg-gray-50 dark:bg-transparent">
        <SkeletonLoader type="list" count={6} />
      </div>
    );
  }

  const [dateRange, setDateRange] = useState('today');
  const [selectedReportTab, setSelectedReportTab] = useState('summary');
  const userRole = state.currentUser?.role;
  const userPerms = state.currentUser?.permissions || [];
  const hasFullAccess = userRole === 'admin' || userRole === 'manager' || userPerms.includes('access_reports');

  const validReportTypes = ['sales', 'inventory', 'customers', 'expenses', 'financial'] as const;
  type ReportType = typeof validReportTypes[number];
  const reportType = (validReportTypes.includes(subTab as ReportType) ? subTab : 'sales') as ReportType;
  const [repairing, setRepairing] = useState(false);

  const handleRepairData = async () => {
    if (!window.confirm('This will audit all legacy sales and backfill missing cost data for precise reporting. Proceed?')) return;
    setRepairing(true);
    try {
      const count = await salesService.patchLegacySales();
      alert(`Data Audit Complete! Patched ${count} legacy sales records.`);
      window.location.reload();
    } catch (error) {
      console.error('Repair failed:', error);
      alert('Failed to repair data. Check console for details.');
    } finally {
      setRepairing(false);
    }
  };

  const isDraftSale = (sale: any) =>
    sale.invoiceNumber?.startsWith('DRAFT-') ||
    sale.notes?.includes('Draft sale') ||
    sale.notes?.includes('DRAFT_SALE');

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      const hasOverflow = scrollWidth > clientWidth + 1;
      setCanScrollLeft(hasOverflow && scrollLeft > 2);
      setCanScrollRight(hasOverflow && scrollLeft + clientWidth < scrollWidth - 2);
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [reportType]);

  const scrollTabs = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 200;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
      setTimeout(checkScroll, 300);
    }
  };
  const [startDateInput, setStartDateInput] = useState('');
  const [endDateInput, setEndDateInput] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState('All');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedCashier, setSelectedCashier] = useState('All');


  const [currentPageReport, setCurrentPageReport] = useState(1);
  const ITEMS_PER_PAGE_REPORT = 10;
  const [selectedSaleType, setSelectedSaleType] = useState<'all' | 'retail' | 'wholesale' | 'estore'>('all');
  const [selectedPayment, setSelectedPayment] = useState('All');

  // Performance: Defer heavy content to prevent navigation jitter
  const [isRendered, setIsRendered] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setIsRendered(true), 150);
    return () => clearTimeout(timer);
  }, []);

  const { validStartDate, validEndDate } = useMemo(() => {
    const timezone = getTimezone(state.settings.country);
    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    if (dateRange === 'custom') {
      startDate = startDateInput
        ? new Date(getStartOfInputDayInTimezone(startDateInput, timezone).getTime())
        : new Date(getStartOfDayInTimezone(now, timezone).getTime());
      endDate = endDateInput
        ? new Date(getEndOfInputDayInTimezone(endDateInput, timezone).getTime())
        : new Date(getEndOfDayInTimezone(now, timezone).getTime());
    } else if (dateRange === 'today') {
      startDate = getStartOfDayInTimezone(now, timezone);
      endDate = getEndOfDayInTimezone(now, timezone);
    } else if (dateRange === 'yesterday') {
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      startDate = getStartOfDayInTimezone(yesterday, timezone);
      endDate = getEndOfDayInTimezone(yesterday, timezone);
    } else if (dateRange === 'last7') {
      const last7 = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      startDate = getStartOfDayInTimezone(last7, timezone);
      endDate = getEndOfDayInTimezone(now, timezone);
    } else if (dateRange === 'thisMonth') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      startDate = getStartOfDayInTimezone(startOfMonth, timezone);
      endDate = getEndOfDayInTimezone(now, timezone);
    } else if (dateRange === 'lastMonth') {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      startDate = getStartOfDayInTimezone(lm, timezone);
      endDate = getEndOfDayInTimezone(lmEnd, timezone);
    } else if (dateRange === 'all') {
      startDate = new Date(Date.UTC(2000, 0, 1));
      endDate = getEndOfDayInTimezone(now, timezone);
    } else {
      // Fallback
      startDate = getStartOfDayInTimezone(now, timezone);
      endDate = getEndOfDayInTimezone(now, timezone);
    }

    return { validStartDate: startDate, validEndDate: endDate };
  }, [dateRange, startDateInput, endDateInput, state.settings.country]);

  // Report-specific data (fetched from localDb based on range)
  const [reportSales, setReportSales] = useState<Sale[]>([]);
  const [reportRefunds, setReportRefunds] = useState<Sale[]>([]);
  const [reportExpenses, setReportExpenses] = useState<Expense[]>([]);
  const [reportPayments, setReportPayments] = useState<any[]>([]); // credit collections received
  const [isDataLoading, setIsDataLoading] = useState(false);

  // Performance: Cache report data to avoid redundant fetches
  const reportCache = useRef<Record<string, { sales: any[], refunds: any[], expenses: any[], timestamp: number }>>({});
  const [reportRefreshKey, setReportRefreshKey] = useState(0);

  // Invalidate cache on sync events so reports reflect latest data
  useEffect(() => {
    const handleSync = () => {
      reportCache.current = {};
      setReportRefreshKey(k => k + 1);
    };
    window.addEventListener('pendingops-changed', handleSync);
    return () => window.removeEventListener('pendingops-changed', handleSync);
  }, []);

  useEffect(() => {
    const fetchReportData = async () => {
      const cacheKey = `${validStartDate.toISOString()}-${validEndDate.toISOString()}`;

      // 1. Check Memory Cache (Instant)
      if (reportCache.current[cacheKey] && Date.now() - reportCache.current[cacheKey].timestamp < 30000) {
        console.log('[Reports] Using cached data for range:', cacheKey);
        setReportSales(reportCache.current[cacheKey].sales);
        setReportRefunds(reportCache.current[cacheKey].refunds);
        setReportExpenses(reportCache.current[cacheKey].expenses);
        return;
      }

      // 2. Try Local DB Load (Instant-ish, unblocks UI)
      try {
        const [lSales, lRefunds, lExpenses] = await Promise.all([
          salesService.getReportSalesLocal(validStartDate, validEndDate),
          salesService.getReportRefundsLocal(validStartDate, validEndDate),
          expensesService.getReportExpensesLocal(validStartDate, validEndDate)
        ]);

        setReportSales(lSales);
        setReportRefunds(lRefunds);
        setReportExpenses(lExpenses);
      } catch (e) {
        console.warn('[Reports] Local fetch failed:', e);
      }

      // 3. Background Sync (Remote fetch)
      setIsDataLoading(true);
      try {
        const [sales, refunds, expenses] = await Promise.all([
          salesService.getReportSales(validStartDate, validEndDate),
          salesService.getReportRefunds(validStartDate, validEndDate),
          expensesService.getReportExpenses(validStartDate, validEndDate)
        ]);

        // Update cache
        reportCache.current[cacheKey] = {
          sales,
          refunds,
          expenses,
          timestamp: Date.now()
        };

        setReportSales(sales);
        setReportRefunds(refunds);
        setReportExpenses(expenses);
      } catch (e) {
        console.error("Report data fetch failed:", e);
      } finally {
        setIsDataLoading(false);
      }
    };
    fetchReportData();
  }, [validStartDate, validEndDate, state.sales.length, state.expenses.length, reportRefreshKey]);

  // Fetch credit collections (payments received from customers) for the selected date range
  useEffect(() => {
    const fetchPayments = async () => {
      try {
        const timezone = getTimezone(state.settings.country);
        const startTs = getStartOfDayInTimezone(validStartDate, timezone).getTime();
        const endTs = getEndOfDayInTimezone(validEndDate, timezone).getTime();
        const all = (await localDb.payments.toArray()).map(mapPayment);
        const inRange = all.filter((p: any) => {
          if (!p.customerId) return false;
          const d = new Date(p.createdAt).getTime();
          return d >= startTs && d <= endTs;
        });
        setReportPayments(inRange);
      } catch (e) {
        setReportPayments([]);
      }
    };
    fetchPayments();
  }, [validStartDate, validEndDate, state.settings.country]);

  useEffect(() => {
    const missingCostItems = reportSales
      .flatMap(s => s.items || [])
      .filter(i => !i.purchaseCost || i.purchaseCost === 0);

    if (missingCostItems.length > 0) {
      console.warn(
        `[COGS] ${missingCostItems.length} items using fallback cost. ` +
        `These are pre-FIFO sales — cost accuracy is estimated.`
      );
    }
  }, [reportSales]);

  const cashiers = useMemo(() => {
    const userNames = state.users.map(u => u.name).filter(Boolean);
    const saleCashiers = reportSales.map(s => s.cashier).filter(Boolean);
    const combined = new Set([...userNames, ...saleCashiers]);
    if (state.currentUser?.name) combined.add(state.currentUser.name);
    return ['All', ...Array.from(combined).sort()];
  }, [reportSales, state.users, state.currentUser]);

  const suppliers = useMemo(() => {
    // Show all registered suppliers to ensure visibility, even if no products are assigned yet
    const registeredSuppliers = state.suppliers.map(s => s.name).filter(Boolean);
    const productSuppliers = state.products.map(p => p.supplier).filter(Boolean);
    return ['All', ...Array.from(new Set([...registeredSuppliers, ...productSuppliers])).sort()];
  }, [state.suppliers, state.products]);

  const categories = useMemo(() => {
    if (reportType === 'expenses') {
      return ['All', ...EXPENSE_CATEGORIES];
    }

    // For Sales report, only show categories that have actually been sold
    if (reportType === 'sales') {
      const soldCategories = new Set<string>();
      reportSales.forEach(sale => {
        sale.items?.forEach(item => {
          if (item.product?.category) soldCategories.add(item.product.category);
        });
      });
      return ['All', ...Array.from(soldCategories).sort()];
    }

    // For other reports (Inventory/Suppliers), show categories that have products
    const activeProductCategories = new Set(state.products.map(p => p.category).filter(Boolean));
    return ['All', ...Array.from(activeProductCategories).sort()];
  }, [state.products, reportSales, reportType]);

  const paymentMethods = useMemo(() => {
    const methods = new Set<string>(['cash', 'card', 'digital']);
    reportSales.forEach(s => { if (s.paymentMethod) methods.add(s.paymentMethod) });
    reportExpenses.forEach(e => { if (e.paymentMethod) methods.add(e.paymentMethod) });
    return ['All', ...Array.from(methods).sort()];
  }, [reportSales, reportExpenses]);

  const filteredSales = useMemo(() => {
    const allSalesRaw = [...reportSales, ...reportRefunds];
    
    // Unroll addonItems into separate line items for accurate reporting
    const allSales = allSalesRaw.map(sale => {
      if (!sale || !sale.items) return sale;
      let hasAddons = false;
      
      const unrolledItems = sale.items.flatMap(item => {
        if (!item.addonItems || item.addonItems.length === 0) return [item];
        hasAddons = true;
        
        let addonSubtotalSum = 0;
        let addonCostSum = 0;
        
        const addonsAsItems = item.addonItems.map(addon => {
          const addonSubtotal = (addon.price || 0) * (addon.quantity || 1) * (item.quantity || 1);
          addonSubtotalSum += addonSubtotal;
          
          const actualAddonProd = state.products.find(p => p.id === addon.addon.addonProductId);
          const addonCost = (actualAddonProd?.cost || 0) * (addon.quantity || 1) * (item.quantity || 1);
          addonCostSum += addonCost;
          
          return {
            id: `${item.id}-addon-${addon.addon.id}`,
            product: actualAddonProd || { id: addon.addon.addonProductId, name: addon.name, category: 'Add-ons' },
            quantity: (addon.quantity || 1) * (item.quantity || 1),
            subtotal: addonSubtotal,
            purchaseCost: addonCost, // Approximate fallback cost
            isAddon: true
          };
        });
        
        return [
          {
            ...item,
            subtotal: Math.max(0, (item.subtotal || 0) - addonSubtotalSum),
            purchaseCost: Math.max(0, (item.purchaseCost || 0) - addonCostSum)
          },
          ...addonsAsItems
        ];
      });
      
      if (hasAddons) {
        return { ...sale, items: unrolledItems };
      }
      return sale;
    });

    return allSales.filter(sale => {
      if (!sale || !sale.items || isDraftSale(sale)) return false;

      if (selectedSupplier !== 'All') {
        const hasSupplier = sale.items.some(item => item.product?.supplier === selectedSupplier);
        if (!hasSupplier) return false;
      }

      if (selectedCategory !== 'All') {
        const hasCategory = sale.items.some(item => item.product?.category === selectedCategory);
        if (!hasCategory) return false;
      }

      if (selectedCashier !== 'All') {
        if (sale.cashier !== selectedCashier) return false;
      }

      if (selectedSaleType !== 'all') {
        const type = sale.saleType || 'retail';
        if (type !== selectedSaleType) return false;
      }

      if (selectedPayment !== 'All') {
        if (sale.paymentMethod !== selectedPayment.toLowerCase()) return false;
      }

      return true;
    });
  }, [reportSales, reportRefunds, selectedSupplier, selectedCategory, selectedCashier, selectedSaleType, selectedPayment, state.products]);

  const filteredExpenses = useMemo(() => {
    return reportExpenses.filter(expense => {
      if (selectedCategory !== 'All' && expense.category !== selectedCategory) return false;

      if (selectedPayment !== 'All') {
        if (expense.paymentMethod !== selectedPayment.toLowerCase()) return false;
      }

      if (selectedSaleType !== 'all') {
        if (expense.storeType !== selectedSaleType) return false;
      }

      if (selectedCashier !== 'All') {
        const cashierUser = state.users.find(u => u.name === selectedCashier || u.username === selectedCashier);
        const expenseUserId = (expense as any).userId || (expense as any).cashierId || (expense as any).addedBy;
        if (expenseUserId !== selectedCashier && expenseUserId !== cashierUser?.id) return false;
      }

      return true;
    });
  }, [reportExpenses, selectedCategory, selectedPayment, selectedSaleType, selectedCashier, state.users]);

  // Sales Analytics
  const salesData = useMemo(() => {
    const salesByDay: Record<string, { date: string; sales: number; transactions: number }> = {};
    const days = parseInt(dateRange) || 1;

    for (let i = days - 1; i >= 0; i--) {
      const date = formatAppDateChart(subDays(validEndDate, i), state.settings?.country);
      salesByDay[date] = { date, sales: 0, transactions: 0 };
    }

    filteredSales.filter(s => s.status === 'completed' || s.status === 'credit').forEach(sale => {
      if (!sale?.timestamp) return;
      const saleDate = new Date(sale.timestamp);
      if (isNaN(saleDate.getTime())) return;
      const date = formatAppDateChart(saleDate, state.settings?.country);
      if (salesByDay[date]) {
        salesByDay[date].sales += getEffectiveTotal(sale);
        // Count returns as negative transactions or just don't increment as a positive sale
        salesByDay[date].transactions += (sale.total < 0 ? -1 : 1);
      }
    });


    return Object.values(salesByDay);
  }, [filteredSales, dateRange, validEndDate]);

  // Top Products
  const topProducts = useMemo(() => {
    const productSales: Record<string, { name: string; quantity: number; revenue: number }> = {};

    filteredSales.filter(s => s.status === 'completed' || s.status === 'credit').forEach(sale => {
      sale.items.forEach(item => {
        const productId = item.product?.id || 'deleted';
        if (!productSales[productId]) {
          productSales[productId] = {
            name: item.product?.name || 'Deleted Product',
            quantity: 0,
            revenue: 0,
          };
        }
        productSales[productId].quantity += item.quantity;
        productSales[productId].revenue += getItemRevenue(item, sale);
      });
    });

    return Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [filteredSales]);

  // Feature Analytics (Services, Modifiers, Variants)
  const featureAnalytics = useMemo(() => {
    let serviceRevenue = 0;
    let productRevenue = 0;
    let modifiersRevenue = 0;
    const variantSales: Record<string, { name: string; quantity: number; revenue: number }> = {};

    filteredSales.filter(s => s.status === 'completed' || s.status === 'credit').forEach(sale => {
      sale.items.forEach(item => {
        const itemRev = getItemRevenue(item, sale);
        
        if (item.product?.isService) {
          serviceRevenue += itemRev;
        } else {
          productRevenue += itemRev;
        }

        if (item.selectedModifiers && item.selectedModifiers.length > 0) {
           item.selectedModifiers.forEach(mod => {
              const modRev = (mod.price || 0) * item.quantity;
              modifiersRevenue += modRev;
           });
        }
        if (item.addonItems && item.addonItems.length > 0) {
           item.addonItems.forEach(addon => {
              const modRev = addon.subtotal || 0;
              modifiersRevenue += modRev;
           });
        }
        if (item.toppings && item.toppings.length > 0) {
           item.toppings.forEach(topping => {
              const modRev = (topping.price || 0) * item.quantity;
              modifiersRevenue += modRev;
           });
        }

        if (item.selectedVariant) {
           const varKey = `${item.product?.name} (${item.selectedVariant})`;
           if (!variantSales[varKey]) {
             variantSales[varKey] = { name: varKey, quantity: 0, revenue: 0 };
           }
           variantSales[varKey].quantity += item.quantity;
           variantSales[varKey].revenue += itemRev; 
        }
      });
    });

    return {
      serviceRevenue,
      productRevenue,
      modifiersRevenue,
      topVariants: Object.values(variantSales).sort((a,b) => b.revenue - a.revenue).slice(0, 5)
    };
  }, [filteredSales]);

  // Category Distribution
  const categoryData = useMemo(() => {
    const categories: Record<string, { name: string; value: number }> = {};

    filteredSales.filter(s => s.status === 'completed' || s.status === 'credit').forEach(sale => {
      sale.items.forEach(item => {
        const category = item.product?.category || 'Uncategorized';
        if (!categories[category]) {
          categories[category] = { name: category, value: 0 };
        }
        categories[category].value += item.subtotal;
      });
    });

    return Object.values(categories);
  }, [filteredSales]);

  // Sale Type Distribution (New)
  const saleTypeData = useMemo(() => {
    const types: Record<string, { name: string; value: number }> = {
      retail: { name: 'Retail', value: 0 },
      wholesale: { name: 'Wholesale', value: 0 },
      estore: { name: 'E-Store', value: 0 }
    };

    filteredSales.filter(s => s.status === 'completed' || s.status === 'credit').forEach(sale => {
      if (!sale) return;
      const type = sale.saleType || 'retail';
      if (types[type]) {
        types[type].value += getEffectiveTotal(sale);
      }
    });

    const retailEnabled = state.settings.retailEnabled ?? true;
    const wholesaleEnabled = state.settings.wholesaleEnabled ?? false;
    const estoreEnabled = state.settings.estoreEnabled ?? false;

    return Object.values(types).filter(t => {
      if (t.name === 'Retail' && !retailEnabled) return false;
      if (t.name === 'Wholesale' && !wholesaleEnabled) return false;
      if (t.name === 'E-Store' && !estoreEnabled) return false;
      return t.value > 0;
    });
  }, [filteredSales, state.settings]);

  // Expense Analytics
  const expensesTrendData = useMemo(() => {
    const expensesByDay: Record<string, { date: string; amount: number; count: number }> = {};
    const days = parseInt(dateRange) || 1;

    for (let i = days - 1; i >= 0; i--) {
      const date = formatAppDateChart(subDays(validEndDate, i), state.settings.country);
      expensesByDay[date] = { date, amount: 0, count: 0 };
    }

    filteredExpenses.forEach(expense => {
      const date = formatAppDateChart(expense.date, state.settings.country);
      if (expensesByDay[date]) {
        expensesByDay[date].amount += Number(expense.amount);
        expensesByDay[date].count += 1;
      }
    });

    return Object.values(expensesByDay);
  }, [filteredExpenses, dateRange, validEndDate]);

  const expenseCategoryData = useMemo(() => {
    const categories: Record<string, { name: string; value: number }> = {};

    filteredExpenses.forEach(expense => {
      const category = expense.category;
      if (!categories[category]) {
        categories[category] = { name: category, value: 0 };
      }
      categories[category].value += Number(expense.amount);
    });

    return Object.values(categories);
  }, [filteredExpenses]);

  // Top Expenses
  const topExpensesList = useMemo(() => {
    return [...filteredExpenses]
      .sort((a, b) => Number(b.amount) - Number(a.amount))
      .slice(0, 5);
  }, [filteredExpenses]);

  // Summary Stats - Net Revenue (Completed minus Refunds)
  const totalRevenue = filteredSales.reduce((sum, s) => {
    if (s.status === 'completed') return sum + s.total;   // cash/card sales
    if (s.status === 'refunded') return sum - (s.total || 0);
    if (s.status === 'partially_refunded') return sum - (s.refundedAmount || 0);
    return sum; // credit sales NOT counted as received cash
  }, 0);

  // Credit sales made in this period (money still owed)
  const creditSalesTotal = filteredSales
    .filter(s => s.status === 'credit' || s.paymentMethod === 'credit')
    .reduce((sum, s) => sum + s.total, 0);
  const creditSalesCount = filteredSales.filter(s => s.status === 'credit' || s.paymentMethod === 'credit').length;

  // Credit payments COLLECTED in this period (money actually received)
  const creditCollectedTotal = reportPayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
  const creditCollectedCount = reportPayments.length;

  const totalTransactions = filteredSales.filter(s => s.status === 'completed').length;
  const averageTransaction = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;


  // Profit Analytics
  const totalCostOfGoods = useMemo(() => {
    return filteredSales.filter(s => s.status === 'completed' || s.status === 'credit').reduce((sum, sale) => {
      return sum + sale.items.reduce((itemSum, item) => {
        const { cost } = getItemCOGS(item);
        return itemSum + cost;
      }, 0);
    }, 0);
  }, [filteredSales]);

  const grossProfit = totalRevenue - totalCostOfGoods;
  const totalExpenseAmount = filteredExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const netProfit = grossProfit - totalExpenseAmount;

  const walletStats = useMemo(() => {
    return ['cash', 'card', 'digital'].map(method => {
      // Amount from regular sales
      const sales = filteredSales.filter(s => s.status === 'completed' || s.status === 'credit').reduce((a, x) => a + getAmountByMethod(x, method), 0);
      
      // Breakdown of sales by type
      const retailSales = filteredSales.filter(s => (s.status === 'completed' || s.status === 'credit') && (!s.saleType || s.saleType === 'retail')).reduce((a, x) => a + getAmountByMethod(x, method), 0);
      const wholesaleSales = filteredSales.filter(s => (s.status === 'completed' || s.status === 'credit') && s.saleType === 'wholesale').reduce((a, x) => a + getAmountByMethod(x, method), 0);
      const estoreSales = filteredSales.filter(s => (s.status === 'completed' || s.status === 'credit') && s.saleType === 'estore').reduce((a, x) => a + getAmountByMethod(x, method), 0);

      // Amount from credit collections (payments received)
      const collections = reportPayments.filter(p => p.method === method).reduce((a, p) => a + (p.amount || 0), 0);
      
      const expenses = filteredExpenses.filter(e => e.paymentMethod === method).reduce((a, x) => a + Number(x.amount), 0);
      const refunds = filteredSales.reduce((a, x) => {
        if (x.status === 'refunded') return a + getAmountByMethod(x, method);
        if (x.status === 'partially_refunded') {
          // Approximate proportional refund for split, or direct for others
          if (x.paymentMethod === 'split') {
            const ratio = getAmountByMethod(x, method) / (x.total || 1);
            return a + (x.refundedAmount || 0) * ratio;
          } else if (x.paymentMethod === method || (!x.paymentMethod && method === 'cash')) {
            return a + (x.refundedAmount || 0);
          }
        }
        return a;
      }, 0);
      
      return {
        method,
        sales: sales + collections, // Combine them for the net balance
        collections,
        expenses,
        refunds,
        net: (sales + collections) - refunds - expenses,
        retailSales,
        wholesaleSales,
        estoreSales
      };
    });
  }, [filteredSales, filteredExpenses, reportPayments]);

  const totalExpenseTransactions = filteredExpenses.length;
  const averageExpense = totalExpenseTransactions > 0 ? totalExpenseAmount / totalExpenseTransactions : 0;

  // Customer Analytics
  const customerData = useMemo(() => {
    const customerStats: Record<string, {
      id: string;
      name: string;
      totalSpent: number;
      periodSpent: number;
      lifetimeSpent: number;
      totalTransactions: number;
      totalItems: number;
      avgTransactionValue: number;
      lastPurchase: Date;
    }> = {};

    // Add all customers first to include those with no purchases
    state.customers.forEach(customer => {
      customerStats[customer.id] = {
        id: customer.id,
        name: customer.name,
        totalSpent: 0,
        periodSpent: 0,
        lifetimeSpent: customer.totalPurchases || 0,
        creditLimit: customer.creditLimit || 0,
        creditUsed: customer.creditUsed || 0,
        totalTransactions: 0,
        totalItems: 0,
        avgTransactionValue: 0,
        lastPurchase: new Date(customer.createdAt)
      };
    });

    // Add walk-in customers
    customerStats['walk-in'] = {
      id: 'walk-in',
      name: 'Walk-in Customers',
      totalSpent: 0,
      periodSpent: 0,
      lifetimeSpent: 0,
      totalTransactions: 0,
      totalItems: 0,
      avgTransactionValue: 0,
      lastPurchase: new Date()
    };

    filteredSales.filter(s => s.status === 'completed' || s.status === 'credit').forEach(sale => {
      if (!sale) return;
      const customerId = sale.customerId || 'walk-in';
      if (customerStats[customerId]) {
        customerStats[customerId].totalSpent += getEffectiveTotal(sale);
        customerStats[customerId].periodSpent += getEffectiveTotal(sale);
        customerStats[customerId].totalTransactions += 1;
        customerStats[customerId].totalItems += (sale.items || []).reduce((sum: number, item: any) => sum + (item.quantity || 0), 0);
        const sTime = new Date(sale.timestamp);
        if (!isNaN(sTime.getTime())) {
          customerStats[customerId].lastPurchase = sTime;
        }
      }
    });

    // Calculate average transaction value
    Object.values(customerStats).forEach(customer => {
      customer.avgTransactionValue = customer.totalTransactions > 0
        ? customer.totalSpent / customer.totalTransactions
        : 0;
    });

    return Object.values(customerStats).sort((a, b) => b.totalSpent - a.totalSpent);
  }, [filteredSales, state.customers]);

  const paginatedSales = useMemo(() => {
    return filteredSales.slice(0, currentPageReport * ITEMS_PER_PAGE_REPORT);
  }, [filteredSales, currentPageReport]);
  const totalSalesPages = Math.ceil(filteredSales.length / ITEMS_PER_PAGE_REPORT);



  // Reset sub-type when main report type changes
  useEffect(() => {
    if (reportType !== 'sales') {
      setSelectedSaleType('all');
    }
  }, [reportType]);

  // Inventory Analytics
  const inventoryData = useMemo(() => {
    let productsToProcess = state.products;

    if (selectedSupplier !== 'All') {
      productsToProcess = productsToProcess.filter(p =>
        p.supplier?.toLowerCase().trim() === selectedSupplier.toLowerCase().trim()
      );
    }

    if (selectedCategory !== 'All') {
      productsToProcess = productsToProcess.filter(p => p.category === selectedCategory);
    }

    const inventoryStats = productsToProcess.map(product => {
      const soldQuantity = filteredSales
        .filter(s => s.status === 'completed' || s.status === 'credit')
        .reduce((sum, sale) => {
          return sum + sale.items
            .filter(item => item.product?.id === product.id)
            .reduce((itemSum, item) => itemSum + item.quantity, 0);
        }, 0);

      const revenue = filteredSales
        .filter(s => s.status === 'completed' || s.status === 'credit')
        .reduce((sum, sale) => {
          return sum + sale.items
            .filter(item => item.product?.id === product.id)
            .reduce((itemSum, item) => itemSum + getItemRevenue(item, sale), 0);
        }, 0);

      const isInfinite = product.trackInventory === false || product.stock >= 990000;

      const batchQtySum = (product.batches || []).reduce((sum, b) => sum + (b.qtyRemaining || 0), 0);
      const isBatchSyncOk = batchQtySum === product.stock;

      const stockValue = isInfinite
        ? 0
        : ((product.batches && product.batches.length > 0 && isBatchSyncOk)
          ? product.batches.reduce((sum, b) => sum + ((b.qtyRemaining || 0) * b.costPrice), 0)
          : (product.stock * (product.cost || 0)));

      const potentialRevenue = isInfinite
        ? 0
        : (product.stock * (product.isWeightBased ? (product.pricePerUnit || 0) : product.price));

      const turnoverRatio = (!isInfinite && product.stock > 0) ? soldQuantity / product.stock : 0;

      return {
        id: product.id,
        name: product.name,
        sku: product.sku,
        category: product.category,
        currentStock: isInfinite ? '∞' : product.stock,
        minStock: product.minStock,
        stockStatus: isInfinite ? 'Infinity Mode' : (product.stock <= 0 ? 'Out of Stock' :
          product.stock <= (product.minStock || 5) ? 'Low Stock' : 'In Stock'),
        isInfinite,
        costPrice: product.cost || 0,
        sellingPrice: product.isWeightBased ? (product.pricePerUnit || 0) : product.price,
        stockValue: stockValue,
        potentialRevenue: potentialRevenue,
        soldQuantity: soldQuantity,
        revenue: revenue,
        turnoverRatio: turnoverRatio,
        profitMargin: product.cost ? (
          product.isWeightBased
            ? (((product.pricePerUnit || 0) - product.cost) / (product.pricePerUnit || 1) * 100)
            : ((product.price - product.cost) / product.price * 100)
        ) : 0,
        active: product.active
      };
    });

    return inventoryStats.sort((a, b) => {
      if (reportType === 'inventory') {
        // Sort by stock status (out of stock first, then low stock)
        if (a.stockStatus !== b.stockStatus) {
          const statusOrder = { 'Out of Stock': 0, 'Low Stock': 1, 'In Stock': 2 };
          return statusOrder[a.stockStatus as keyof typeof statusOrder] - statusOrder[b.stockStatus as keyof typeof statusOrder];
        }
      }
      return b.revenue - a.revenue;
    });
  }, [state.products, filteredSales, reportType, selectedSupplier, selectedCategory]);

  const COLORS = ['#2563EB', '#059669', '#D97706', '#DC2626', '#7C3AED', '#EC4899'];

  const exportReport = () => {
    const currency = state.settings.currency;
    const headerSuffix = ` (${currency})`;
    const isAdmin = userRole === 'admin';
    let csvHeader = '';
    let csvData = '';
    let fileName = '';

    const clean = (val: any) => {
      if (val === undefined || val === null) return '';
      return String(val).replace(/"/g, '""');
    };

    if (reportType === 'sales') {
      csvHeader = 'Date,Time,Invoice Number,Receipt Number,Customer Name,Customer Phone,Cashier,Cashier @Username,Items List,Total Items Qty,Sale Type,Payment Method,Subtotal,Discount,Tax,Total Revenue';
      if (isAdmin) csvHeader += `,Cost of Goods,Gross Profit`;
      csvHeader += '\n';

      csvData = filteredSales.map(sale => {
        const customer = sale.customerId ? state.customers.find(c => c.id === sale.customerId) : null;
        const customerName = clean(customer?.name || sale.customerName || 'Walk-in Customer');
        const customerPhone = clean(customer?.phone || '');
        const cashierUser = state.users.find(u => u.name === sale.cashier || u.email === sale.cashier);
        const cashierName = clean(sale.cashier || 'System');
        const cashierAt = cashierUser?.username ? `@${cashierUser.username}` : '';

        const itemsList = sale.items.map(item => {
          const sku = item.product?.sku ? ` [${item.product.sku}]` : '';
          return `${item.product?.name || 'Item'}${sku} x ${item.quantity} @ ${formatNumberWithPrecision(item.product?.price || 0)}`;
        }).join('; ');

        const totalQty = sale.items.reduce((sum, item) => sum + item.quantity, 0);
        const dateObj = new Date(sale.timestamp);
        const formattedDate = formatAppDate(dateObj, state.settings.country);
        const formattedTime = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const totalCostLocal = sale.items.reduce((sum, item) => {
          const { cost } = getItemCOGS(item);
          return sum + cost;
        }, 0);

        let row = `"${formattedDate}","${formattedTime}","${clean(sale.invoiceNumber)}","${clean(sale.receiptNumber)}","${customerName}","${customerPhone}","${cashierName}","${cashierAt}","${clean(itemsList)}",${totalQty},"${clean(sale.saleType || 'retail')}","${clean(sale.paymentMethod)}",${formatNumberWithPrecision(sale.subtotal)},${formatNumberWithPrecision(sale.discountAmount)},${formatNumberWithPrecision(sale.taxAmount)},${formatNumberWithPrecision(sale.total)}`;

        if (isAdmin) {
          row += `,${formatNumberWithPrecision(totalCostLocal)},${formatNumberWithPrecision(getEffectiveTotal(sale) - totalCostLocal)}`;
        }
        return row;
      }).join('\n');

      fileName = `sales-detailed-report-${formatAppDate(new Date(), state.settings.country)}.csv`;
    }
    else if (reportType === 'inventory') {
      csvHeader = 'Product Name,SKU,Category,Supplier,Stock,Min Stock,Status,Unit Cost,Unit Sale Price,Stock Value (at Cost),Potential Revenue,Sold Qty,Period Revenue,Period Profit,Period Margin %,Active\n';
      csvData = inventoryData.map(item => {
        const prod = state.products.find(p => p.id === item.id);
        const costVal = (item.stockValue || 0);
        const potentialRev = (item.potentialRevenue || 0);
        return `"${clean(item.name)}","${clean(item.sku)}","${clean(item.category)}","${clean(prod?.supplier || '')}",${item.currentStock},${item.minStock},"${clean(item.stockStatus)}",${formatNumberWithPrecision(item.costPrice)},${formatNumberWithPrecision(item.sellingPrice)},${formatNumberWithPrecision(costVal)},${formatNumberWithPrecision(potentialRev)},${item.soldQuantity},${formatNumberWithPrecision(item.revenue)},${formatNumberWithPrecision(item.revenue - (item.soldQuantity * item.costPrice))},${formatNumberWithPrecision(item.profitMargin)},"${item.active ? 'Yes' : 'No'}"`;
      }).join('\n');

      fileName = `inventory-detailed-report-${formatAppDate(new Date(), state.settings.country)}.csv`;
    }
    else {
      // Fallback for Financial
      csvHeader = 'Metric,Value\n';
      if (reportType === 'financial') {
        const totalSalesVal = filteredSales.reduce((s, x) => s + x.total, 0);
        const totalExpVal = filteredExpenses.reduce((s, x) => s + Number(x.amount), 0);
        csvData = `"Total Revenue","${formatNumberWithPrecision(totalSalesVal)}"\n"Total Expenses","${formatNumberWithPrecision(totalExpVal)}"\n"Net Flow","${formatNumberWithPrecision(totalSalesVal - totalExpVal)}"`;
      } else {
        csvData = `"Report Type","${clean(reportType)}"\n"Status","Not directly exportable as detail grid"`;
      }
      fileName = `report-${clean(reportType)}-${formatAppDate(new Date(), state.settings.country)}.csv`;
    }

    const fullCsv = csvHeader + csvData;
    const blob = new Blob(['\ufeff', fullCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', url);
    linkElement.setAttribute('download', fileName);
    linkElement.click();
    URL.revokeObjectURL(url);
  };
  if (!isRendered) {
    return (
      <div className="main-content-scroll p-1 lg:p-6 space-y-6 bg-gray-50/50 dark:bg-app min-h-full max-w-[1400px] mx-auto">
        <div className="flex flex-col gap-6 animate-pulse">
          <div className="h-10 w-64 bg-gray-200 dark:bg-white/5 rounded-xl"></div>
          <div className="flex gap-4">
            <div className="h-12 w-full bg-gray-200 dark:bg-white/5 rounded-2xl"></div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-28 bg-gray-200 dark:bg-white/5 rounded-3xl"></div>)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="main-content-scroll p-1 lg:p-6 bg-gray-50/50 dark:bg-app space-y-4 lg:space-y-6 max-w-[1400px] mx-auto">

      {/* Premium Header Layout */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6">
        <div className="flex flex-col md:flex-row md:items-center gap-4 sm:gap-6 xl:gap-10">
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'pos' }))}
              className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl text-gray-600 dark:text-gray-400 active:scale-95 transition-all flex items-center gap-1 mr-1"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline text-[8px] font-black uppercase tracking-widest">{t("back", "Back")}</span>
            </button>
            <div className="h-6 w-px bg-gray-200 dark:bg-white/10 mx-1 hidden sm:block" />

            {userRole === 'admin' && (
              <button
                onClick={handleRepairData}
                disabled={repairing}
                className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-lg border border-rose-500/20 transition-all active:scale-95 disabled:opacity-50 group"
                title="Repair legacy sales data (Audit cost/profit)"
              >
                <RefreshCw className={`h-3 w-3 ${repairing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
                <span className="text-[8px] font-black uppercase tracking-widest hidden sm:inline">
                  {repairing ? 'Auditing...' : 'Repair Data'}
                </span>
              </button>
            )}

            <div className="h-6 w-px bg-gray-200 dark:bg-white/10 mx-1 hidden sm:block" />
            <div className="h-8 w-8 bg-primary/10 rounded-lg flex items-center justify-center shadow-inner border border-primary/10">
              <PieIcon className="h-4 w-4 text-primary" />
            </div>
            <div className="shrink-0 flex items-center gap-3">
              <div>
                <h1 className="text-base font-black text-gray-900 dark:text-white uppercase tracking-tighter leading-none">{t("reports", "Intelligence")}</h1>
                <p className="hidden sm:block text-gray-600 dark:text-gray-400 text-[7px] font-black uppercase tracking-[0.2em] mt-0.5 opacity-60">
                  {formatAppDate(validStartDate, state.settings?.country)} - {formatAppDate(validEndDate, state.settings?.country)}
                </p>
              </div>
              {isDataLoading && (
                <div className="flex items-center gap-2 px-2 py-1 bg-primary/10 border border-primary/20 rounded-lg animate-in fade-in zoom-in duration-300">
                  <RefreshCw className="h-2.5 w-2.5 text-primary animate-spin" />
                  <span className="text-[8px] font-black text-primary uppercase tracking-widest">Live Sync</span>
                </div>
              )}
            </div>
          </div>

          <div className="chip-nav-container flex-1 lg:flex-none">
            {[
              { id: 'sales', label: t("dashboard", "DASHBOARD"), icon: TrendingUp, color: 'bg-primary', show: true },
              { id: 'inventory', label: t("inventory", "INVENTORY"), icon: Package, color: 'bg-blue-600', show: true },
              { id: 'customers', label: t("customers", "CUSTOMERS"), icon: Users, color: 'bg-teal-600', show: true },
              { id: 'expenses', label: t("expenses", "EXPENSES"), icon: FileText, color: 'bg-rose-600', show: true },
              { id: 'financial', label: t("payments", "PAYMENTS"), icon: DollarSign, color: 'bg-indigo-600', show: true },
            ].filter(tab => {
              const role = state.currentUser?.role;
              const perms = state.currentUser?.permissions || [];
              const hasFullAccess = role === 'admin' || role === 'manager' || perms.includes('access_reports');
              if (tab.id === 'closing') return false;
              return hasFullAccess;
            }).map(tab => {
              const isActive = reportType === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => navigate('/reports/' + tab.id)}
                  className={`chip-nav-item ${isActive ? `${tab.color} text-white shadow-lg` : 'text-gray-600'}`}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

      </div>

      {/* Layer 2: Filter Toolbar (Smart Context) */}
      <div className="relative z-30 bg-white/50 dark:bg-black/20 p-2 lg:p-3 rounded-2xl border border-gray-200/50 dark:border-white/5 shadow-xl ring-1 ring-black/5 dark:ring-white/5">
        <div className="flex flex-col xl:flex-row gap-4">
          {/* Date Selector Row */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1 sm:flex-none min-w-[200px]">
              <SearchableSelect
                label={t("range", "RANGE")}
                options={[
                  { id: 'today', label: t("today", "TODAY") },
                  { id: 'yesterday', label: t("yesterday", "YESTERDAY") },
                  { id: 'last7', label: t("last7", "LAST 7 DAYS") },
                  { id: 'thisMonth', label: t("this_month", "THIS MONTH") },
                  { id: 'lastMonth', label: t("last_month", "PREVIOUS MONTH") },
                  { id: 'custom', label: t("custom", "CUSTOM RANGE") },
                  { id: 'all', label: t("all", "ALL TIME") }
                ]}
                value={dateRange}
                onChange={setDateRange}
                icon={TrendingUp}
              />
            </div>

            {dateRange === 'custom' && (
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center w-full p-2 bg-white/30 dark:bg-black/75 rounded-xl border border-gray-200/50 dark:border-white/5 animate-in slide-in-from-top-2 sm:slide-in-from-left-4 duration-300">
                <input
                  type="date"
                  value={startDateInput}
                  onChange={(e) => setStartDateInput(e.target.value)}
                  className="w-full sm:flex-1 px-3 py-2 text-[10px] font-black bg-white dark:bg-zinc-800 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white uppercase shadow-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <span className="hidden sm:block text-gray-600 dark:text-gray-400 font-black text-[10px] uppercase tracking-tighter px-1">TO</span>
                <input
                  type="date"
                  value={endDateInput}
                  onChange={(e) => setEndDateInput(e.target.value)}
                  className="w-full sm:flex-1 px-3 py-2 text-[10px] font-black bg-white dark:bg-zinc-800 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white uppercase shadow-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            )}
          </div>

          <div className="hidden xl:block h-8 w-px bg-gray-200 dark:bg-white/10" />

          {/* Contextual Selectors Grid/Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:flex xl:items-center gap-1.5 lg:gap-2">
            {reportType !== 'customers' && (
              <>
                <SearchableSelect
                  label={t("supplier", "SUPPLIER")}
                  options={[{ id: 'All', label: t("all", "ALL") }, ...suppliers.filter(s => s !== 'All').map(s => ({ id: s, label: s }))]}
                  value={selectedSupplier}
                  onChange={setSelectedSupplier}
                  icon={Truck}
                />

                <SearchableSelect
                  label={t("category", "CATEGORY")}
                  options={[{ id: 'All', label: t("all", "ALL") }, ...categories.filter(c => c !== 'All').map(c => ({ id: c, label: c }))]}
                  value={selectedCategory}
                  onChange={setSelectedCategory}
                  icon={LayoutGrid}
                />

                <SearchableSelect
                  label={t("cashier", "CASHIER")}
                  options={[{ id: 'All', label: t("all", "ALL") }, ...cashiers.filter(c => c !== 'All').map(c => ({ id: c, label: c }))]}
                  value={selectedCashier}
                  onChange={setSelectedCashier}
                  icon={Users}
                />

                <SearchableSelect
                  label={t("payment", "PAYMENT")}
                  options={[{ id: 'All', label: t("all", "ALL") }, ...paymentMethods.filter(m => m !== 'All').map(m => ({ id: m, label: t(m, m).toUpperCase() }))]}
                  value={selectedPayment}
                  onChange={setSelectedPayment}
                  icon={Wallet}
                  align="right"
                />

                <SearchableSelect
                  label={t("store", "STORE")}
                  options={[
                    { id: 'all', label: t("all", "ALL") },
                    { id: 'retail', label: t("retail", "RETAIL"), enabled: state.settings.retailEnabled },
                    { id: 'wholesale', label: t("wholesale", "WHOLESALE"), enabled: state.settings.wholesaleEnabled },
                    { id: 'estore', label: t("estore", "E-STORE"), enabled: state.settings.estoreEnabled }
                  ].filter(o => o.id === 'all' || o.enabled)}
                  value={selectedSaleType}
                  onChange={setSelectedSaleType}
                  icon={Store}
                  align="right"
                />
              </>
            )}
          </div>
        </div>
      </div>
      {/* Premium Dashboard summary row */}
      {reportType === 'sales' && (
        <div className="relative z-20 mt-2 sm:mt-4">
        <SalesReport
            filteredSales={filteredSales}
            paginatedSales={paginatedSales}
            salesData={salesData}
            categoryData={categoryData}
            saleTypeData={saleTypeData}
            topProducts={topProducts}
            featureAnalytics={featureAnalytics}
            totalRevenue={totalRevenue}
            totalTransactions={totalTransactions}
            averageTransaction={averageTransaction}
            totalCostOfGoods={totalCostOfGoods}
            grossProfit={grossProfit}
            totalExpenseAmount={totalExpenseAmount}
            netProfit={netProfit}
            walletStats={walletStats}
            currency={state.settings.currency}
            theme={state.settings.theme}
            country={state.settings.country}
            users={state.users}
            retailEnabled={state.settings.retailEnabled ?? true}
            wholesaleEnabled={state.settings.wholesaleEnabled}
            estoreEnabled={state.settings.estoreEnabled}
            onLoadMore={() => setCurrentPageReport(p => p + 1)}
            creditSalesTotal={creditSalesTotal}
            creditSalesCount={creditSalesCount}
            creditCollectedTotal={creditCollectedTotal}
            creditCollectedCount={creditCollectedCount}
          />
        </div>
      )}



      {reportType === 'customers' && (
        <div className="relative z-20 mt-2 sm:mt-4">
          <CustomersReport
            customerData={customerData}
            currency={state.settings.currency}
            theme={state.settings.theme}
            country={state.settings.country}
          />
        </div>
      )}

      {reportType === 'expenses' && (
        <div className="relative z-20 mt-2 sm:mt-4">
          <ExpensesReport
            filteredExpenses={filteredExpenses}
            expensesTrendData={expensesTrendData}
            expenseCategoryData={expenseCategoryData}
            totalExpenseAmount={totalExpenseAmount}
            currentPage={currentPageReport}
            itemsPerPage={ITEMS_PER_PAGE_REPORT}
            currency={state.settings.currency}
            theme={state.settings.theme}
            country={state.settings.country}
            onLoadMore={() => setCurrentPageReport(p => p + 1)}
          />
        </div>
      )}

      {reportType === 'financial' && (
        <div className="relative z-20 mt-2 sm:mt-4">
          <FinancialReport
            totalRevenue={totalRevenue}
            totalTransactions={totalTransactions}
            totalCostOfGoods={totalCostOfGoods}
            grossProfit={grossProfit}
            totalExpenseAmount={totalExpenseAmount}
            filteredExpensesCount={filteredExpenses.length}
            netProfit={netProfit}
            walletStats={walletStats}
            currency={state.settings.currency}
          />
        </div>
      )}


      {reportType === 'inventory' && (
        <div className="relative z-20 mt-2 sm:mt-4">
          <InventoryReport
            startDate={validStartDate}
            endDate={validEndDate}
            globalSupplier={selectedSupplier}
            globalCategory={selectedCategory}
            globalStore={selectedSaleType}
            sales={filteredSales}
          />
        </div>
      )}

    </div>
  );
}