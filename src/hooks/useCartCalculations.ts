import { useMemo } from 'react';
import { useApp, checkDiscountEligibility } from '../context/SupabaseAppContext';
import { calculateCart } from '../lib/calculateCart';

/**
 * POS cart calculations hook — delegates to the shared pure `calculateCart()`
 * function (MASTER §10: one pricing engine, no second implementation anywhere).
 */
export function useCartCalculations(paymentMethod: string = 'cash', cardDetails?: any) {
  const { state } = useApp();
  const { cart, discounts, selectedCustomer, settings, billDiscountValue, billDiscountType, products } = state;

  return useMemo(() => {
    return calculateCart({
      cart,
      discounts,
      taxRate: settings.taxRate || 0,
      billDiscountValue: billDiscountValue || 0,
      billDiscountType: billDiscountType || 'fixed',
      paymentMethod,
      cardDetails,
      selectedCustomer,
      products,
      checkEligibility: checkDiscountEligibility,
    });
  }, [cart, discounts, selectedCustomer, settings, billDiscountValue, billDiscountType, paymentMethod, cardDetails, products]);
}
