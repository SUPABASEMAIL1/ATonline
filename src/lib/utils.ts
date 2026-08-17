import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { CartItem, Bundle } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Symmetric half-away-from-zero rounding to 2 decimals — kills float drift
 * (e.g. 1.005 -> 1.01, not 1.00). SINGLE source of money rounding (MASTER §10).
 * Imported by both POS (useCartCalculations) and E-store (StoreCheckout) so tax
 * parity is guaranteed. Never use raw Math.round/toFixed for money.
 */
export function roundTo2(num: number): number {
  const n = Number(num);
  const eps = n >= 0 ? Number.EPSILON : -Number.EPSILON;
  return Math.round((n + eps) * 100) / 100;
}

export function getDealCountBreakdown(items: CartItem[], bundles?: Bundle[]): {
  totalItems: number;
  dealsCount: number;
  standaloneCount: number;
  totalPcs: number;
  dealsQty: number;
  standaloneQty: number;
  label: string;
} {
  let standaloneQty = 0;
  let dealsCount = 0;

  const bundlesMap = new Map<string, {
    bundleId: string;
    items: CartItem[];
  }>();

  items.forEach(i => {
    const bId = i.bundleId || i.bundle_id;
    if (bId) {
      if (!bundlesMap.has(bId)) {
        bundlesMap.set(bId, { bundleId: bId, items: [] });
      }
      bundlesMap.get(bId)!.items.push(i);
    } else {
      standaloneQty += (i.quantity || 1);
    }
  });

  bundlesMap.forEach((b) => {
    const bundleDef = bundles?.find(x => x.id === b.bundleId);
    let bundleQty = 1;
    if (bundleDef && bundleDef.items && bundleDef.items.length > 0) {
      const firstBi = bundleDef.items[0];
      const cartItem = b.items.find(x => x.product.id === firstBi.productId);
      if (cartItem) {
        bundleQty = Math.round(cartItem.quantity / firstBi.quantity);
      }
    } else if (b.items.length > 0) {
      bundleQty = b.items[0].quantity;
    }
    dealsCount += bundleQty;
  });

  const totalPcs = items.reduce((s, i) => s + (i.quantity || 1), 0);
  const dealsQty = totalPcs - standaloneQty;
  const standaloneCount = items.filter(i => !i.bundleId && !i.bundle_id).length;
  const totalItems = dealsCount + standaloneCount;

  let label = '';
  if (dealsCount > 0 && standaloneCount > 0) {
    label = `DEALS x${dealsCount} + ITEMS x${standaloneCount}`;
  } else if (dealsCount > 0) {
    label = `TOTAL DEALS x${dealsCount}`;
  } else {
    label = `${totalItems} ITEMS`;
  }

  return { totalItems, dealsCount, standaloneCount, totalPcs, dealsQty, standaloneQty, label };
}

export interface DiscountInfo {
  flatAmount: number;
  percent: number;
  isValid: boolean;
}

export function calculateDiscount(originalPrice: number, discountedPrice: number): DiscountInfo {
  if (originalPrice == null || discountedPrice == null || originalPrice <= 0 || discountedPrice >= originalPrice) {
    return { flatAmount: 0, percent: 0, isValid: false };
  }
  const flatAmount = originalPrice - discountedPrice;
  const percent = Math.round((flatAmount / originalPrice) * 100);
  return { flatAmount, percent, isValid: percent > 0 };
}
