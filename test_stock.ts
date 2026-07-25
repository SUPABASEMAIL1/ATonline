import { productsService, storeOrdersService, salesService } from './src/lib/services';
import { localDb } from './src/lib/localDb';

async function runTests() {
  console.log('--- STARTING LIVE TESTS (J-N) ---');
  
  // Create a dummy product
  const product = await productsService.create({
    name: 'Test Product ' + Date.now(),
    stock: 100,
    price: 10,
    cost: 5,
    trackInventory: true,
    categoryId: 'test-cat',
    status: 'active'
  } as any);

  console.log(`Initial Stock: ${product.stock} (Should be 100)`);

  // Test J: Create Online Order
  const order = await storeOrdersService.create({
    customerName: 'Test J',
    items: [{
      id: 'item1',
      productId: product.id,
      quantity: 5,
      price: 10,
      subtotal: 50,
      product: product
    }],
    total: 50,
    status: 'pending'
  } as any);

  const productAfterJ = await localDb.products.get(product.id);
  console.log(`Test J (Create Order): Stock is ${productAfterJ?.stock}. Delta: ${productAfterJ!.stock! - 100} (Expected: 0)`);

  // Test K: Accept Order
  await storeOrdersService.update(order.id, { status: 'accepted' });
  const productAfterK = await localDb.products.get(product.id);
  console.log(`Test K (Accept Order): Stock is ${productAfterK?.stock}. Delta: ${productAfterK!.stock! - 100} (Expected: 0)`);

  // Test M: Convert to POS Sale
  const sale = await salesService.create({
    invoiceNumber: 'INV-TEST-M',
    sourceOrderId: order.id,
    items: [{
      id: 'item1',
      productId: product.id,
      quantity: 5,
      price: 10,
      subtotal: 50,
      product: product
    }],
    total: 50,
    paymentMethod: 'cash',
    status: 'completed',
    cashier: 'System'
  } as any);

  await storeOrdersService.update(order.id, { status: 'converted', fulfilledSaleId: sale.id });

  const productAfterM = await localDb.products.get(product.id);
  console.log(`Test M (Convert to Sale): Stock is ${productAfterM?.stock}. Delta: ${productAfterM!.stock! - 100} (Expected: -5)`);

  // Verify Refund
  await salesService.returnSale(sale.id, {
    type: 'partial',
    items: [{
      index: 0,
      productId: product.id,
      qty: 2,
      refundAmount: 20
    }],
    totalRefundAmount: 20
  });

  const productAfterRefund = await localDb.products.get(product.id);
  console.log(`Refund 2 items: Stock is ${productAfterRefund?.stock}. Delta: ${productAfterRefund!.stock! - 100} (Expected: -3)`);

  // Verify Delete
  await salesService.delete(sale.id);
  const productAfterDelete = await localDb.products.get(product.id);
  console.log(`Delete Partially Refunded Sale: Stock is ${productAfterDelete?.stock}. Delta: ${productAfterDelete!.stock! - 100} (Expected: 0)`);

  console.log('--- END TESTS ---');
}

runTests().catch(console.error);
