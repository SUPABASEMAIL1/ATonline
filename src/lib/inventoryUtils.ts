// inventoryUtils.ts — DEPRECATED
// Batch/FIFO system has been removed. This file is kept as an empty stub
// to prevent import errors from any legacy code that may reference it.
// The calculateFIFOSplit function is no longer needed.

export interface FIFODeductionResult {
  totalCost: number;
  totalSaleValue: number;
  updatedBatches: any[];
  usedBatches: any[];
}

/**
 * @deprecated Batch system removed. Uses product.cost directly now.
 * Kept as stub for backward compatibility.
 */
export function calculateFIFOSplit(product: any, quantityToDeduct: number): FIFODeductionResult {
  const qty = Math.abs(quantityToDeduct);
  const cost = product.cost || 0;
  const price = product.price || 0;
  return {
    totalCost: qty * cost,
    totalSaleValue: qty * price,
    updatedBatches: [],
    usedBatches: [{
      batchId: 'legacy',
      quantity: qty,
      cost,
      salePrice: price
    }]
  };
}
