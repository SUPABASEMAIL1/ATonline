/**
 * ============================================================================
 * calculateCart — SINGLE SOURCE OF TRUTH for cart math (MASTER §10)
 * ============================================================================
 * Pure function (no hooks, no React). Called identically by:
 *   - useCartCalculations (POS)
 *   - StoreCheckout (E-store)
 *
 * Order: Line Total → Line Discount → Auto Promotions → Manual Bill Discount
 *        → Taxable Extra/Service Charges → Tax → Final Total.
 *
 * §10 mandate: one function, no second implementation anywhere.
 * ============================================================================
 */

import { roundTo2 } from './utils';
import { CartItem, AppliedDiscount } from '../types';

export interface CartCalculationInput {
  cart: CartItem[];
  /** Discounts list — optional (E-store may pass empty) */
  discounts?: any[];
  taxRate?: number;
  billDiscountValue?: number;
  billDiscountType?: 'percentage' | 'fixed';
  /** Extra charges: each item has amount + taxable flag */
  extraCharges?: Array<{ amount: number; taxable?: boolean }>;
  paymentMethod?: string;
  cardDetails?: any;
  selectedCustomer?: any;
  products?: CartItem['product'][];
  /** Injected eligibility checker to avoid circular dep */
  checkEligibility?: (d: any, cart: CartItem[], customer: any, pm: string, subtotal: number, cd: any) => boolean;
}

export interface CartCalculationResult {
  subtotal: number;
  manualItemDiscountTotal: number;
  autoPromotionAmount: number;
  billDiscountAmount: number;
  totalDiscount: number;
  taxableBase: number;
  taxAmount: number;
  total: number;
  totalCost: number;
  isBelowCost: boolean;
  activePromotions: AppliedDiscount[];
  freeGifts: CartItem[];
}

export function calculateCart(input: CartCalculationInput): CartCalculationResult {
  const {
    cart,
    discounts = [],
    taxRate = 0,
    billDiscountValue = 0,
    billDiscountType = 'fixed',
    extraCharges = [],
    paymentMethod = 'cash',
    cardDetails,
    selectedCustomer,
    products = [],
    checkEligibility,
  } = input;

  const manualItemDiscountTotal = roundTo2(cart.reduce((sum, item) => sum + (item.discount || 0), 0));
  const subtotalAfterItemDiscounts = roundTo2(cart.reduce((sum, item) => sum + (item.subtotal || 0), 0));
  const subtotal = roundTo2(subtotalAfterItemDiscounts + manualItemDiscountTotal);

  // Auto-promotions
  const activePromotions: AppliedDiscount[] = [];
  const freeGifts: CartItem[] = [];
  let autoPromotionAmount = 0;

  if (checkEligibility) {
    discounts.forEach(discount => {
      if (!checkEligibility(discount, cart, selectedCustomer, paymentMethod, subtotal, cardDetails)) return;
      if (discount.isAutoApply === false) return;

      if (discount.type === 'free_gift' && discount.freeGiftProducts) {
        discount.freeGiftProducts.forEach((productId: string) => {
          const product = products.find(p => p.id === productId);
          if (product) {
            freeGifts.push({ product, quantity: 1, discount: 0, discountType: 'fixed', subtotal: 0 });
          }
        });
        activePromotions.push({ discountId: discount.id, discountName: discount.name, discountAmount: 0, type: 'free_gift' });

      } else if (discount.type === 'mix_and_match') {
        const mmCond = discount.conditions?.find((c: any) => c.type === 'category' || c.type === 'specific_products');
        if (mmCond && mmCond.targetQuantity) {
          const eligibleItems: { index: number; price: number; qty: number }[] = [];
          cart.forEach((item, index) => {
            const unitPrice = item.product.price || (item.subtotal / (Math.abs(item.quantity) || 1));
            if (mmCond.type === 'category' && mmCond.value?.includes(item.product.category)) {
              eligibleItems.push({ index, price: unitPrice, qty: item.quantity });
            } else if (mmCond.type === 'specific_products' && mmCond.value?.includes(item.product.id)) {
              eligibleItems.push({ index, price: unitPrice, qty: item.quantity });
            }
          });
          const unrolled: { index: number; price: number }[] = [];
          eligibleItems.forEach(item => {
            for (let i = 0; i < item.qty; i++) unrolled.push({ index: item.index, price: item.price });
          });
          unrolled.sort((a, b) => b.price - a.price);

          const sets = Math.floor(unrolled.length / mmCond.targetQuantity);
          if (sets > 0) {
            let dealDiscount = 0;
            for (let s = 0; s < sets; s++) {
              const bundle = unrolled.slice(s * mmCond.targetQuantity, (s + 1) * mmCond.targetQuantity);
              const bundleTotal = bundle.reduce((sum, item) => sum + item.price, 0);
              if (mmCond.rewardType === 'fixed_total') {
                const bd = bundleTotal - (mmCond.rewardValue || 0);
                if (bd > 0) dealDiscount += bd;
              } else if (mmCond.rewardType === 'percentage_off_all') {
                dealDiscount += bundleTotal * (mmCond.rewardValue || 0) / 100;
              } else if (mmCond.rewardType === 'cheapest_free') {
                dealDiscount += bundle[bundle.length - 1].price;
              }
            }
            if (dealDiscount > 0) {
              autoPromotionAmount = roundTo2(autoPromotionAmount + dealDiscount);
              activePromotions.push({ discountId: discount.id, discountName: discount.name, discountAmount: roundTo2(dealDiscount), type: 'mix_and_match' });
            }
          }
        }
      } else {
        let amount = 0;
        if (discount.type === 'percentage') {
          amount = roundTo2((subtotalAfterItemDiscounts * discount.value) / 100);
          if (discount.maxDiscount) amount = Math.min(amount, discount.maxDiscount);
        } else if (discount.type === 'fixed') {
          amount = discount.value;
        }
        if (amount > 0) {
          autoPromotionAmount = roundTo2(autoPromotionAmount + amount);
          activePromotions.push({ discountId: discount.id, discountName: discount.name, discountAmount: amount, type: discount.type });
        }
      }
    });
  }

  // Manual bill discount
  const billDiscountAmount = roundTo2(
    billDiscountType === 'percentage'
      ? (subtotalAfterItemDiscounts * (billDiscountValue || 0)) / 100
      : (billDiscountValue || 0)
  );

  // Totals
  const totalDiscount = roundTo2(manualItemDiscountTotal + autoPromotionAmount + billDiscountAmount);
  const taxableExtraTotal = roundTo2(extraCharges.filter(c => c.taxable !== false).reduce((s, c) => s + c.amount, 0));
  const nonTaxableExtraTotal = roundTo2(extraCharges.filter(c => c.taxable === false).reduce((s, c) => s + c.amount, 0));
  const taxableBase = roundTo2(subtotal - totalDiscount + taxableExtraTotal);
  const taxAmount = roundTo2(taxableBase * (taxRate / 100));
  const total = roundTo2(taxableBase + taxAmount + nonTaxableExtraTotal);

  const totalCost = roundTo2(
    cart.reduce((sum, item) => sum + ((item.product.cost || 0) * item.quantity), 0) +
    freeGifts.reduce((sum, g) => sum + ((g.product.cost || 0) * g.quantity), 0)
  );

  return {
    subtotal,
    manualItemDiscountTotal,
    autoPromotionAmount,
    billDiscountAmount,
    totalDiscount,
    taxableBase,
    taxAmount,
    total,
    totalCost,
    isBelowCost: total < totalCost,
    activePromotions,
    freeGifts,
  };
}
