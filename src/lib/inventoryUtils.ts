import { Product, ProductBatch, CartItem } from '../types';

export interface FIFODeductionResult {
  totalCost: number;
  totalSaleValue: number; // For batch-wise pricing
  updatedBatches: ProductBatch[];
  usedBatches: {
    batchId: string;
    quantity: number;
    cost: number;
    salePrice: number;
  }[];
}

/**
 * Calculates FIFO split for a sale.
 * Returns which batches should be used and at what price.
 */
export function calculateFIFOSplit(product: Product, quantityToDeduct: number): FIFODeductionResult {
  // Sort batches by arrival order (FIFO)
  const batches = [...(product.batches || [])].sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return timeA - timeB;
  });

  let remainingToDeduct = Math.abs(quantityToDeduct);
  let totalCost = 0;
  let totalSaleValue = 0;
  const usedBatches: FIFODeductionResult['usedBatches'] = [];
  const updatedBatches: ProductBatch[] = [...batches];

  // If no batches exist, fallback to product's current cost/price
  if (batches.length === 0) {
    return {
      totalCost: remainingToDeduct * (product.cost || 0),
      totalSaleValue: remainingToDeduct * (product.price || 0),
      updatedBatches: [],
      usedBatches: [{
        batchId: 'opening',
        quantity: remainingToDeduct,
        cost: product.cost || 0,
        salePrice: product.price || 0
      }]
    };
  }

  for (let i = 0; i < updatedBatches.length; i++) {
    const batch = updatedBatches[i];
    const qtyLeft = batch.qtyRemaining !== undefined ? batch.qtyRemaining : batch.quantity;
    if (qtyLeft <= 0) continue;

    const amountFromThisBatch = Math.min(qtyLeft, remainingToDeduct);
    
    totalCost += amountFromThisBatch * batch.costPrice;
    totalSaleValue += amountFromThisBatch * batch.salePrice;
    remainingToDeduct -= amountFromThisBatch;
    
    // Update batch qtyRemaining
    const newQtyRemaining = qtyLeft - amountFromThisBatch;
    updatedBatches[i] = {
      ...batch,
      qtyRemaining: newQtyRemaining,
      quantity: batch.quantity // Keep original quantity as IN qty
    };

    usedBatches.push({
      batchId: batch.id,
      quantity: amountFromThisBatch,
      cost: batch.costPrice,
      salePrice: batch.salePrice
    });

    if (remainingToDeduct === 0) break;
  }

  // If there's still quantity remaining (sold more than in batches), 
  // use the last batch's price or product price
  if (remainingToDeduct > 0) {
    const fallbackCost = product.cost || (batches.length > 0 ? batches[batches.length - 1].costPrice : 0);
    const fallbackPrice = product.price || (batches.length > 0 ? batches[batches.length - 1].salePrice : 0);
    
    totalCost += remainingToDeduct * fallbackCost;
    totalSaleValue += remainingToDeduct * fallbackPrice;
    
    usedBatches.push({
      batchId: 'overflow',
      quantity: remainingToDeduct,
      cost: fallbackCost,
      salePrice: fallbackPrice
    });
  }

  return {
    totalCost,
    totalSaleValue,
    updatedBatches,
    usedBatches
  };
}

export function getCartItemCost(product: Product, quantity: number): number {
  const result = calculateFIFOSplit(product, quantity);
  return result.totalCost;
}
