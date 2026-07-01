/**
 * seed_demo_products.mjs
 * Inserts 15 demo products across 5 categories directly via PostgreSQL (bypasses RLS).
 * Run: node scripts/seed_demo_products.mjs
 */

import pkg from 'pg';
const { Client } = pkg;
import { randomUUID } from 'crypto';

const WORKSPACE_ID = 'ffda4d2d-b837-4b24-84d1-675640533745';

const client = new Client({
  connectionString: 'postgresql://postgres.goiizgrcvogovvwclrym:s7vrablMBTlwX0HY@aws-1-ap-south-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

const now = new Date().toISOString();

const DEMO_PRODUCTS = [
  // ── Electronics (3) ──────────────────────────────────────────────────────
  { name: 'Samsung 65" 4K Smart TV', sku: 'EL-TV-001', category: 'Electronics', supplier: 'Samsung Pakistan', cost: 95000, price: 115000, stock: 8, barcode: '8801643127003', description: 'Samsung Crystal UHD 65" 4K Smart TV with Tizen OS' },
  { name: 'Wireless Bluetooth Earbuds Pro', sku: 'EL-EP-002', category: 'Electronics', supplier: 'TechZone Wholesale', cost: 1800, price: 2999, stock: 45, barcode: '6923452679014', description: 'True wireless stereo earbuds with 24hr battery life, ANC' },
  { name: 'USB-C GaN Fast Charger 65W', sku: 'EL-CH-003', category: 'Electronics', supplier: 'TechZone Wholesale', cost: 650, price: 1200, stock: 80, barcode: '4895200341089', description: 'GaN 65W USB-C fast charger, PD 3.0 compatible' },

  // ── Clothing (3) ─────────────────────────────────────────────────────────
  { name: "Men's Oxford Dress Shirt", sku: 'CL-SH-001', category: 'Clothing', supplier: 'Al-Karam Textiles', cost: 850, price: 1599, stock: 60, barcode: '8902872100012', description: 'Premium cotton Oxford dress shirt, slim fit, white' },
  { name: "Women's Embroidered Lawn Suit 3pc", sku: 'CL-LW-002', category: 'Clothing', supplier: 'Gul Ahmed', cost: 2200, price: 3800, stock: 35, barcode: '8901234567890', description: 'Embroidered 3-piece lawn suit, summer 2025 collection' },
  { name: 'Kids Slim Denim Jeans', sku: 'CL-JN-003', category: 'Clothing', supplier: 'Outfitters Wholesale', cost: 500, price: 999, stock: 50, barcode: '6942765432100', description: 'Slim fit denim jeans for kids aged 5-12' },

  // ── Groceries (3) ────────────────────────────────────────────────────────
  { name: 'Super Kernel Basmati Rice 5KG', sku: 'GR-RC-001', category: 'Groceries', supplier: 'National Foods', cost: 950, price: 1299, stock: 120, barcode: '8901200005001', description: 'Super Kernel Basmati Rice, 5KG premium bag, aged grain' },
  { name: 'Sunflower Cooking Oil 5 Litre', sku: 'GR-OL-002', category: 'Groceries', supplier: 'Dalda Foods', cost: 1750, price: 2100, stock: 85, barcode: '8901234500012', description: 'Refined sunflower cooking oil, 5 litre bottle' },
  { name: 'Tapal Organic Green Tea 100 Bags', sku: 'GR-GT-003', category: 'Groceries', supplier: 'Tapal Tea', cost: 320, price: 499, stock: 200, barcode: '8900987654321', description: 'Organic green tea bags, 100 count, antioxidant rich' },

  // ── Health & Beauty (3) ──────────────────────────────────────────────────
  { name: 'Moisturizing Face Cream SPF50', sku: 'HB-FC-001', category: 'Health & Beauty', supplier: 'Neutrogena PK', cost: 780, price: 1399, stock: 40, barcode: '7050000035002', description: 'Daily moisturizing face cream with SPF50 broad-spectrum protection' },
  { name: 'Biotin Hair Growth Serum 100ml', sku: 'HB-HR-002', category: 'Health & Beauty', supplier: 'OGX Cosmetics', cost: 1100, price: 1899, stock: 30, barcode: '6901234561234', description: 'Biotin hair growth serum, 100ml, dermatologist tested' },
  { name: 'Vitamin C Brightening Face Wash', sku: 'HB-FW-003', category: 'Health & Beauty', supplier: 'Neutrogena PK', cost: 420, price: 799, stock: 70, barcode: '7050000098765', description: 'Vitamin C face wash for glowing skin, 150ml' },

  // ── Home & Kitchen (3) ───────────────────────────────────────────────────
  { name: 'Stainless Steel Pressure Cooker 7L', sku: 'HK-PC-001', category: 'Home & Kitchen', supplier: 'Prestige Pakistan', cost: 2500, price: 4200, stock: 20, barcode: '8901797005003', description: '7 litre stainless steel pressure cooker with safety valve and lid' },
  { name: 'Non-Stick Frying Pan Set 3pcs', sku: 'HK-FP-002', category: 'Home & Kitchen', supplier: 'Prestige Pakistan', cost: 1400, price: 2499, stock: 18, barcode: '8901797008900', description: 'Non-stick frying pan set: 20cm, 24cm, 28cm with glass lids' },
  { name: '20000mAh Slim Power Bank', sku: 'HK-PB-003', category: 'Home & Kitchen', supplier: 'TechZone Wholesale', cost: 1800, price: 3200, stock: 25, barcode: '6934177703102', description: 'Slim 20000mAh portable charger, dual USB + Type-C, LED indicator' },
];

async function main() {
  console.log('🔌 Connecting to Supabase PostgreSQL...');
  await client.connect();
  console.log('✅ Connected!\n');

  let insertedCount = 0;
  let batchCount = 0;
  let historyCount = 0;

  for (const p of DEMO_PRODUCTS) {
    const productId = randomUUID();
    const batchId = randomUUID();
    const historyId = randomUUID();

    try {
      // ── Insert product ──────────────────────────────────────────────────
      await client.query(`
        INSERT INTO products (
          id, workspace_id, name, sku, category, supplier,
          cost, price, stock, description, barcode,
          active, track_inventory, is_weight_based,
          min_stock, target_stock,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          true, true, false,
          5, $12,
          NOW(), NOW()
        )
        ON CONFLICT (id) DO NOTHING
      `, [
        productId, WORKSPACE_ID, p.name, p.sku, p.category, p.supplier,
        p.cost, p.price, p.stock, p.description, p.barcode,
        p.stock * 2
      ]);
      insertedCount++;
      console.log(`  ✅ [${p.category}] ${p.name} — PKR ${p.price} | Stock: ${p.stock}`);

      // ── Insert product batch (FIFO) ─────────────────────────────────────
      try {
        await client.query(`
          INSERT INTO product_batches (
            id, product_id, workspace_id, batch_number,
            qty_remaining, cost_price, sale_price,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
          ON CONFLICT (id) DO NOTHING
        `, [
          batchId, productId, WORKSPACE_ID,
          `INIT-${productId.slice(0, 6).toUpperCase()}`,
          p.stock, p.cost, p.price
        ]);
        batchCount++;
      } catch (batchErr) {
        console.warn(`    ⚠️  Batch skipped: ${batchErr.message}`);
      }

      // ── Insert stock history (Rule F2) ──────────────────────────────────
      try {
        await client.query(`
          INSERT INTO stock_history (
            id, product_id, workspace_id,
            change_qty, balance_after, type,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, 'initial', NOW())
          ON CONFLICT (id) DO NOTHING
        `, [historyId, productId, WORKSPACE_ID, p.stock, p.stock]);
        historyCount++;
      } catch (histErr) {
        console.warn(`    ⚠️  History skipped: ${histErr.message}`);
      }

    } catch (err) {
      console.error(`  ❌ Failed [${p.name}]: ${err.message}`);
    }
  }

  await client.end();

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 Seeding Complete!
   Products inserted : ${insertedCount} / ${DEMO_PRODUCTS.length}
   FIFO batches      : ${batchCount}
   Stock history     : ${historyCount}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👉 Refresh your POS app to see all products!
`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  client.end();
  process.exit(1);
});
