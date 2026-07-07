  async returnSale(id: string, request?: RefundRequest, currentCashierName?: string): Promise<void> {
    const sale = await localDb.sales.get(id);
    if (!sale) throw new Error('Sale not found');

    const now = new Date();
    
    const isFullRefund = !request || request.type === 'full';
    
    const itemsToReverse = isFullRefund ? sale.items.map((item, index) => ({
      index,
      productId: item.product.id,
      qty: item.weight || item.quantity,
      refundAmount: item.total || item.subtotal || 0
    })) : (request?.items || []);

    const totalRefundAmount = isFullRefund ? sale.total : (request?.totalRefundAmount || 0);

    // 1. Reverse Stock Locally & Update Sale Items
    for (const reqItem of itemsToReverse) {
      if (reqItem.qty <= 0) continue;
      
      const item = sale.items[reqItem.index];
      if (!item) continue;
      
      // Update item's refunded quantity
      item.refundedQuantity = (item.refundedQuantity || 0) + reqItem.qty;

      const product = await localDb.products.get(item.product.id);
      if (product && product.trackInventory) {
        const qty = reqItem.qty;
        const newStock = (product.stock || 0) + qty;

        // --- START EXACT BATCH-LEVEL RESTORATION (Reverse FIFO) ---
        const batches = await localDb.productBatches
          .where('productId').equals(product.id)
          .toArray();

        const updatedBatchesForProduct = [...(product.batches || [])];

        if (item.fifoDetails && item.fifoDetails.length > 0) {
          // Restore exact quantities to the exact batches they were deducted from
          // For partial refunds, we restore from the most recently deducted batch (last in fifoDetails)
          let qtyToRestore = qty;
          for (let i = item.fifoDetails.length - 1; i >= 0; i--) {
            if (qtyToRestore <= 0) break;
            const detail = item.fifoDetails[i];
            
            // Only restore up to what was deducted from this batch
            const restoreAmount = Math.min(qtyToRestore, detail.quantity);
            qtyToRestore -= restoreAmount;
            
            const batchToRestore = batches.find(b => b.id === detail.batchId);
            if (batchToRestore) {
              const newQtyRemaining = (batchToRestore.qtyRemaining || 0) + restoreAmount;
              await localDb.productBatches.update(batchToRestore.id, { qtyRemaining: newQtyRemaining });
              await queueOp('product_batches', 'update', batchToRestore.id, { qty_remaining: newQtyRemaining }, { batchId: id });

              const batchIndex = updatedBatchesForProduct.findIndex(b => b.id === batchToRestore.id);
              if (batchIndex !== -1) {
                updatedBatchesForProduct[batchIndex] = { ...updatedBatchesForProduct[batchIndex], qtyRemaining: newQtyRemaining };
              }
            }
          }
        } else if (batches.length > 0) {
          // Fallback for legacy sales without fifoDetails: Add returned quantity to the LATEST batch
          const newestBatch = batches.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
          const newQtyRemaining = (newestBatch.qtyRemaining || 0) + qty;

          await localDb.productBatches.update(newestBatch.id, { qtyRemaining: newQtyRemaining });
          await queueOp('product_batches', 'update', newestBatch.id, { qty_remaining: newQtyRemaining }, { batchId: id });

          const batchIndex = updatedBatchesForProduct.findIndex(b => b.id === newestBatch.id);
          if (batchIndex !== -1) {
            updatedBatchesForProduct[batchIndex] = { ...updatedBatchesForProduct[batchIndex], qtyRemaining: newQtyRemaining };
          }
        }
        // --- END EXACT BATCH-LEVEL RESTORATION ---

        await localDb.products.update(product.id, {
          stock: newStock,
          batches: updatedBatchesForProduct,
          updatedAt: now
        });
        await queueOp('products', 'update', product.id, toRemoteProduct({
          ...product,
          stock: newStock,
          batches: updatedBatchesForProduct,
          updatedAt: now
        }), { batchId: id });

        // Log Return in History + Queue cloud sync
        const retHistId = generateId();
        const retHistEntry = {
          id: retHistId,
          productId: product.id,
          changeQty: qty,
          type: 'return' as const,
          referenceId: id,
          balanceAfter: newStock,
          cashierName: currentCashierName || sale.cashier || 'System',
          createdAt: now
        };
        await localDb.stockHistory.add(retHistEntry);
        await queueOp('stock_history', 'create', retHistId, toRemoteStockHistory(retHistEntry), { batchId: id });
      }
    }
    
    // 2. Update sale record
    const newRefundedAmount = (sale.refundedAmount || 0) + totalRefundAmount;
    
    // Check if fully refunded
    let allItemsFullyRefunded = true;
    for (const item of sale.items) {
      const totalQty = item.weight || item.quantity;
      if ((item.refundedQuantity || 0) < totalQty) {
        allItemsFullyRefunded = false;
        break;
      }
    }
    
    const finalStatus = allItemsFullyRefunded ? 'refunded' : 'partially_refunded';
    
    const returnUpdate = {
      ...sale,
      items: sale.items, // updated with refundedQuantity
      refundedAmount: newRefundedAmount,
      status: finalStatus as any,
      updatedAt: now
    };
    
    await localDb.sales.put(returnUpdate); // use put instead of update to overwrite fully

    // 3. Queue RPC Sync
    await queueOp('sales', 'update', id, {
      ...toRemoteSale(returnUpdate),
      status: finalStatus,
      updated_at: now.toISOString()
    }, { batchId: id });

    // 4. Reverse Customer Credit/Stats
    if (sale.customerId && totalRefundAmount > 0) {
      const customer = await localDb.customers.get(sale.customerId);
      if (customer) {
        const isCreditSale = sale.paymentMethod === 'credit' || sale.status === 'credit';
        const updatedCustomer = {
          ...customer,
          creditUsed: isCreditSale ? Math.max(0, (customer.creditUsed || 0) - totalRefundAmount) : (customer.creditUsed || 0),
          totalPurchases: Math.max(0, (customer.totalPurchases || 0) - totalRefundAmount),
          updatedAt: now
        };
        await localDb.customers.put(updatedCustomer);
        await queueOp('customers', 'update', customer.id, toRemoteCustomer(updatedCustomer), { batchId: id });
      }
    }

    // 5. Create reversing payment record for audit trail
    if (totalRefundAmount > 0) {
      const refundPayId = generateId();
      const refundPayment = {
        id: refundPayId,
        customerId: sale.customerId || undefined,
        amount: totalRefundAmount,
        method: sale.paymentMethod === 'split' ? 'cash' : (sale.paymentMethod || 'cash'),
        direction: 'out' as const,
        note: `${isFullRefund ? 'Full' : 'Partial'} Refund for sale ${sale.invoiceNumber || id}`,
        createdAt: now,
      };
      await localDb.payments.add(refundPayment);
      await queueOp('payments', 'create', refundPayId, toRemotePayment(refundPayment), { batchId: id });
    }
  },
