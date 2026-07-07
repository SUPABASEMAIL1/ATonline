import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { CartItem, Bundle } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
