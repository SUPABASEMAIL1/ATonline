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
    const manualItemDiscountTotal = roundTo2(cart.reduce((sum, item) => sum + (item.discount || 0), 0));
    const subtotalAfterItemDiscounts = roundTo2(cart.reduce((sum, item) => sum + (item.subtotal || 0), 0));
    const subtotal = roundTo2(subtotalAfterItemDiscounts + manualItemDiscountTotal);

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
        } else if (discount.type === 'mix_and_match') {
          const mmCond = discount.conditions.find(c => c.type === 'category' || c.type === 'specific_products');
          if (mmCond && mmCond.targetQuantity) {
            let eligibleItems: { index: number; price: number; qty: number; }[] = [];
            cart.forEach((item, index) => {
              // Note: item.product.price represents base price. For items with variants/modifiers,
              // we calculate subtotal/quantity to get the effective unit price.
              const unitPrice = item.subtotal / (Math.abs(item.quantity) || 1);
              if (mmCond.type === 'category' && mmCond.value.includes(item.product.category)) {
                eligibleItems.push({ index, price: unitPrice, qty: item.quantity });
              } else if (mmCond.type === 'specific_products' && mmCond.value.includes(item.product.id)) {
                eligibleItems.push({ index, price: unitPrice, qty: item.quantity });
              }
            });

            let unrolled: { index: number; price: number }[] = [];
            eligibleItems.forEach(item => {
              for (let i = 0; i < item.qty; i++) unrolled.push({ index: item.index, price: item.price });
            });

            // Sort descending to give customer the best deal on their most expensive qualifying items
            unrolled.sort((a, b) => b.price - a.price);

            const sets = Math.floor(unrolled.length / mmCond.targetQuantity);
            if (sets > 0) {
              let dealDiscount = 0;
              for (let s = 0; s < sets; s++) {
                const bundle = unrolled.slice(s * mmCond.targetQuantity, (s + 1) * mmCond.targetQuantity);
                const bundleOriginalTotal = bundle.reduce((sum, item) => sum + item.price, 0);
                
                if (mmCond.rewardType === 'fixed_total') {
                  const bundleDiscount = bundleOriginalTotal - (mmCond.rewardValue || 0);
                  if (bundleDiscount > 0) dealDiscount += bundleDiscount;
                } else if (mmCond.rewardType === 'percentage_off_all') {
                  dealDiscount += bundleOriginalTotal * (mmCond.rewardValue || 0) / 100;
                } else if (mmCond.rewardType === 'cheapest_free') {
                  const cheapest = bundle[bundle.length - 1];
                  dealDiscount += cheapest.price;
                }
              }

              if (dealDiscount > 0) {
                autoPromotionAmount = roundTo2(autoPromotionAmount + dealDiscount);
                activePromotions.push({
                  discountId: discount.id,
                  discountName: discount.name,
                  discountAmount: roundTo2(dealDiscount),
                  type: 'mix_and_match'
                });
              }
            }
          }
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
      let itemCost = 0;
      if (item.product.trackInventory) {
        const split = calculateFIFOSplit(item.product, item.quantity);
        itemCost += split.totalCost;
        
        // Add addon costs only if tracking inventory because calculateFIFOSplit ignores the patched product.cost
        // and only looks at the base product's batches.
        if (item.addonItems && item.addonItems.length > 0) {
          item.addonItems.forEach(addonItem => {
            const addonProd = products.find(p => p.id === addonItem.addon.addonProductId);
            if (addonProd) {
              if (addonProd.trackInventory) {
                 const split = calculateFIFOSplit(addonProd, addonItem.quantity * item.quantity);
                 itemCost += split.totalCost;
              } else {
                 itemCost += (addonProd.cost || 0) * addonItem.quantity * item.quantity;
              }
            }
          });
        }
      } else {
        // POSTerminal overrides `item.product.cost` to ALREADY include addon costs.
        // So we just use it directly without adding addon costs again.
        itemCost += (item.product.cost * item.quantity);
      }

      return sum + itemCost;
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
