import { useMemo } from 'react';
import { useApp, checkDiscountEligibility } from '../context/SupabaseAppContext';
import { AppliedDiscount, CartItem } from '../types';
import { calculateFIFOSplit } from '../lib/inventoryUtils';

/**
 * Ensures 100% mathematical accuracy by rounding to the nearest cent/decimal.
 * Prevents floating point errors (e.g. 0.00000001) that cause mismatches.
 */
const roundTo2 = (num: number) => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

export function useCartCalculations(paymentMethod: string = 'cash', cardDetails?: any) {
  const { state } = useApp();
  const { cart, discounts, selectedCustomer, settings, billDiscountValue, billDiscountType, products } = state;

  return useMemo(() => {
    const subtotal = roundTo2(cart.reduce((sum, item) => {
      const price = item.product.price;
      return sum + (price * item.quantity);
    }, 0));

    const manualItemDiscountTotal = roundTo2(cart.reduce((sum, item) => sum + (item.discount || 0), 0));
    const subtotalAfterItemDiscounts = roundTo2(subtotal - manualItemDiscountTotal);

    // 2. Identify Applicable Automatic Discounts
    const activePromotions: AppliedDiscount[] = [];
    const gifts: CartItem[] = [];
    let autoPromotionAmount = 0;

    discounts.forEach(discount => {
      if (checkDiscountEligibility(
        discount,
        cart,
        selectedCustomer,
        paymentMethod,
        subtotal,
        cardDetails
      ) && (discount.isAutoApply !== false)) {
        if (discount.type === 'free_gift' && discount.freeGiftProducts) {
          discount.freeGiftProducts.forEach(productId => {
            const product = products.find(p => p.id === productId);
            if (product) {
              gifts.push({
                product,
                quantity: 1,
                discount: 0,
                discountType: 'fixed',
                subtotal: 0,
              });
            }
          });

          activePromotions.push({
            discountId: discount.id,
            discountName: discount.name,
            discountAmount: 0,
            type: 'free_gift',
          });
        } else {
          let amount = 0;
          if (discount.type === 'percentage') {
            amount = roundTo2((subtotal * discount.value) / 100);
            if (discount.maxDiscount) amount = Math.min(amount, discount.maxDiscount);
          } else if (discount.type === 'fixed') {
            amount = discount.value;
          }

          if (amount > 0) {
            autoPromotionAmount = roundTo2(autoPromotionAmount + amount);
            activePromotions.push({
              discountId: discount.id,
              discountName: discount.name,
              discountAmount: amount,
              type: discount.type,
            });
          }
        }
      }
    });

    // 3. Calculate Manual Bill Discount
    const billDiscountAmount = roundTo2(billDiscountType === 'percentage'
      ? (subtotalAfterItemDiscounts * (billDiscountValue || 0)) / 100
      : (billDiscountValue || 0));

    // 4. Final Totals with precision rounding
    const totalDiscount = roundTo2(manualItemDiscountTotal + autoPromotionAmount + billDiscountAmount);
    const taxRate = settings.taxRate || 0;
    const taxAmount = roundTo2((subtotal - totalDiscount) * (taxRate / 100));
    const total = roundTo2(subtotal - totalDiscount + taxAmount);

    // 5. Profitability check (Using FIFO Cost)
    const totalCost = roundTo2(cart.reduce((sum, item) => {
      if (item.product.trackInventory) {
        const split = calculateFIFOSplit(item.product, item.quantity);
        return sum + split.totalCost;
      }
      return sum + (item.product.cost * item.quantity);
    }, 0));
    const isBelowCost = total < totalCost;

    return {
      subtotal,
      manualItemDiscountTotal,
      autoPromotionAmount,
      billDiscountAmount,
      totalDiscount,
      taxAmount,
      total,
      activePromotions,
      freeGifts: gifts,
      isBelowCost,
      totalCost
    };
  }, [cart, discounts, selectedCustomer, settings, billDiscountValue, billDiscountType, paymentMethod, cardDetails, products]);
}
