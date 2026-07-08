/**
 * seed_large_db.mjs
 * Seeds a comprehensive list of products across 7 core categories:
 * Beauty, Accessories, Grocery, Tech, Garments, Shoes, Cafe & Restaurant.
 * Maintains strict financial & stock integrity:
 * 1. Checks for duplicate product names (case-insensitive, trimmed) (Rule F1)
 * 2. Writes initial stock changes to stock_history (Rule F2)
 * 3. Keeps products.stock and product_batches.qty_remaining synced (Rule F3)
 * 
 * Run: node scripts/seed_large_db.mjs
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

// Load environment variables from .env.local
const envPath = path.join(process.cwd(), '.env.local');
const env = {};
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      env[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
  });
}

const SUPABASE_REF = env['SUPABASE_REF'];
const SUPABASE_MGMT_KEY = env['SUPABASE_MGMT_API_KEY'];

if (!SUPABASE_REF || !SUPABASE_MGMT_KEY) {
  console.error('❌ Error: SUPABASE_REF or SUPABASE_MGMT_API_KEY not found in .env.local');
  process.exit(1);
}

function formatSql(sql, params) {
  if (!params || params.length === 0) return sql;
  let index = 1;
  return sql.replace(/\$\d+/g, () => {
    const val = params[index - 1];
    index++;
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
    if (typeof val === 'number') return val.toString();
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    return `'${val.toString().replace(/'/g, "''")}'`;
  });
}

async function runQuery(sql, params = []) {
  const formattedSql = formatSql(sql, params);
  const response = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_MGMT_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: formattedSql })
  });

  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch (e) {
    throw new Error(`Failed to parse API response: ${text}`);
  }

  if (!response.ok) {
    throw new Error(result.message || `Query failed: ${text}`);
  }
  return { rows: result };
}

const client = {
  connect: async () => {
    console.log('🔌 Connecting to Supabase API...');
  },
  query: runQuery,
  end: async () => {
    console.log('🔌 Disconnected from Supabase API.');
  }
};

const CATEGORIES = [
  { name: 'Health & Beauty', description: 'Cosmetics, skincare, perfumes, and personal care products' },
  { name: 'Accessories', description: 'Watches, sunglasses, belts, wallets, and styling additions' },
  { name: 'Groceries', description: 'Daily essential food items, beverages, and household groceries' },
  { name: 'Electronics', description: 'Tech gadgets, charging accessories, headphones, and hardware devices' },
  { name: 'Clothing', description: 'Menswear, womenswear, hoodies, t-shirts, and apparel' },
  { name: 'Shoes', description: 'Sneakers, formal leather shoes, athletic footwear, and sandals' },
  { name: 'Cafe & Restaurant', description: 'Freshly brewed coffees, hot beverages, gourmet burgers, pizza, and snacks' }
];

const SUPPLIERS = [
  { name: 'Glamour Beauty Wholesalers', email: 'sales@glamourbeauty.com', phone: '+923001234567', address: 'Cosmetics Market, Karachi', business_type: 'Wholesale' },
  { name: 'Classic Trend Distributors', email: 'info@classictrends.pk', phone: '+923129876543', address: 'Accessories Hub, Lahore', business_type: 'Distributor' },
  { name: 'United Metro Foods', email: 'procurement@unitedfoods.com', phone: '+923334567890', address: 'Grain Market, Multan', business_type: 'Wholesale' },
  { name: 'Apex Tech Logistics', email: 'bulk@apextech.com', phone: '+923215554321', address: 'Hall Road, Lahore', business_type: 'Importer' },
  { name: 'Elite Apparel Mills', email: 'wholesale@eliteapparel.com', phone: '+923456667777', address: 'Faisalabad Industrial Area', business_type: 'Manufacturer' },
  { name: 'Fresh Harvest & Bakery Supplies', email: 'supplies@freshharvest.pk', phone: '+923011112222', address: 'Gulberg Cafe Block, Lahore', business_type: 'Distributor' }
];

const PRODUCTS = [
  // ── Health & Beauty ──
  {
    name: 'Matte Velvet Lipstick Red',
    sku: 'BE-LIP-001',
    barcode: 'BE-LIP-001',
    price: 1200,
    cost: 500,
    stock: 40,
    category: 'Health & Beauty',
    supplier: 'Glamour Beauty Wholesalers',
    description: 'Luxurious matte finish lipstick with intense pigmentation and long-lasting hydration.',
    image: '/images/products/matte_lipstick.webp',
    track_inventory: true
  },
  {
    name: 'Hydrating Face Serum',
    sku: 'BE-SRM-002',
    barcode: 'BE-SRM-002',
    price: 1800,
    cost: 800,
    stock: 35,
    category: 'Health & Beauty',
    supplier: 'Glamour Beauty Wholesalers',
    description: 'Advanced hydration formula with hyaluronic acid and niacinamide for glowing skin.',
    image: '/images/products/face_serum.webp',
    track_inventory: true
  },
  {
    name: 'Luxury Oud Perfume 100ml',
    sku: 'BE-PRF-003',
    barcode: 'BE-PRF-003',
    price: 5500,
    cost: 2500,
    stock: 20,
    category: 'Health & Beauty',
    supplier: 'Glamour Beauty Wholesalers',
    description: 'Premium oriental oud fragrance with notes of cedar, incense, and sweet amber.',
    image: '/images/products/perfume.webp',
    track_inventory: true
  },

  // ── Accessories ──
  {
    name: 'Minimalist Leather Watch',
    sku: 'AC-WTC-001',
    barcode: 'AC-WTC-001',
    price: 3999,
    cost: 1800,
    stock: 15,
    category: 'Accessories',
    supplier: 'Classic Trend Distributors',
    description: 'Sleek and minimalist watch with premium genuine black leather strap.',
    image: '/images/products/leather_watch.webp',
    track_inventory: true
  },
  {
    name: 'Polarized Sunglasses Classic',
    sku: 'AC-SUN-002',
    barcode: 'AC-SUN-002',
    price: 2200,
    cost: 900,
    stock: 30,
    category: 'Accessories',
    supplier: 'Classic Trend Distributors',
    description: 'Classic polarized sunglasses with UV400 protection and scratch-resistant lenses.',
    image: '/images/products/matte_lipstick.webp',
    track_inventory: true
  },
  {
    name: 'Leather Bifold Wallet',
    sku: 'AC-WLT-003',
    barcode: 'AC-WLT-003',
    price: 1500,
    cost: 600,
    stock: 50,
    category: 'Accessories',
    supplier: 'Classic Trend Distributors',
    description: 'Handcrafted slim bifold leather wallet with RFID blocking technology.',
    image: '/images/products/face_serum.webp',
    track_inventory: true
  },

  // ── Groceries ──
  {
    name: 'Organic Extra Virgin Olive Oil 1L',
    sku: 'GR-OIL-001',
    barcode: 'GR-OIL-001',
    price: 2100,
    cost: 1500,
    stock: 25,
    category: 'Groceries',
    supplier: 'United Metro Foods',
    description: 'Cold-pressed extra virgin olive oil from organic Mediterranean estate.',
    image: '/images/products/olive_oil.webp',
    track_inventory: true
  },
  {
    name: 'Super Kernel Basmati Rice 5kg',
    sku: 'GR-RCE-002',
    barcode: 'GR-RCE-002',
    price: 1450,
    cost: 1100,
    stock: 80,
    category: 'Groceries',
    supplier: 'United Metro Foods',
    description: 'Extra long grain, aged kernel basmati rice with exquisite aroma.',
    image: '/images/products/olive_oil.webp',
    track_inventory: true
  },
  {
    name: 'Organic Green Tea 100 Bags',
    sku: 'GR-TEA-003',
    barcode: 'GR-TEA-003',
    price: 420,
    cost: 250,
    stock: 150,
    category: 'Groceries',
    supplier: 'United Metro Foods',
    description: 'Pure organic green tea bags packed with healthy antioxidants.',
    image: '/images/products/olive_oil.webp',
    track_inventory: true
  },

  // ── Electronics ──
  {
    name: 'Wireless Over-Ear Headphones',
    sku: 'TC-HPH-001',
    barcode: 'TC-HPH-001',
    price: 6800,
    cost: 3200,
    stock: 18,
    category: 'Electronics',
    supplier: 'Apex Tech Logistics',
    description: 'Active noise-cancelling wireless headphones with 40-hour battery life.',
    image: '/images/products/headphones.webp',
    track_inventory: true
  },
  {
    name: 'Mechanical RGB Keyboard',
    sku: 'TC-KBD-002',
    barcode: 'TC-KBD-002',
    price: 3500,
    cost: 1900,
    stock: 12,
    category: 'Electronics',
    supplier: 'Apex Tech Logistics',
    description: 'Tactile brown switch mechanical keyboard with customizable RGB backlighting.',
    image: '/images/products/headphones.webp',
    track_inventory: true
  },
  {
    name: 'Slim 10000mAh Power Bank',
    sku: 'TC-PBK-003',
    barcode: 'TC-PBK-003',
    price: 1800,
    cost: 800,
    stock: 40,
    category: 'Electronics',
    supplier: 'Apex Tech Logistics',
    description: 'Ultra-thin fast charging power bank with dual USB ports and USB-C input.',
    image: '/images/products/headphones.webp',
    track_inventory: true
  },

  // ── Clothing ──
  {
    name: 'Classic White Cotton T-Shirt',
    sku: 'GM-TST-001',
    barcode: 'GM-TST-001',
    price: 950,
    cost: 400,
    stock: 100,
    category: 'Clothing',
    supplier: 'Elite Apparel Mills',
    description: 'Premium heavy cotton t-shirt in cream-white, regular fit.',
    image: '/images/products/tshirt.webp',
    track_inventory: true
  },
  {
    name: 'Premium Slim Denim Jacket',
    sku: 'GM-JKT-002',
    barcode: 'GM-JKT-002',
    price: 2990,
    cost: 1200,
    stock: 25,
    category: 'Clothing',
    supplier: 'Elite Apparel Mills',
    description: 'Classic washed denim jacket with high-quality buttons and slim tailoring.',
    image: '/images/products/tshirt.webp',
    track_inventory: true
  },
  {
    name: 'Casual Black Hoodie',
    sku: 'GM-HUD-003',
    barcode: 'GM-HUD-003',
    price: 2100,
    cost: 900,
    stock: 45,
    category: 'Clothing',
    supplier: 'Elite Apparel Mills',
    description: 'Warm fleece-lined oversized hoodie with drawstrings and front pocket.',
    image: '/images/products/tshirt.webp',
    track_inventory: true
  },

  // ── Shoes ──
  {
    name: 'White Minimalist Sneakers',
    sku: 'SH-SNK-001',
    barcode: 'SH-SNK-001',
    price: 4500,
    cost: 2200,
    stock: 30,
    category: 'Shoes',
    supplier: 'Elite Apparel Mills',
    description: 'Modern minimalist white leather sneakers with memory foam insoles.',
    image: '/images/products/sneakers.webp',
    track_inventory: true
  },
  {
    name: 'Classic Brown Loafers',
    sku: 'SH-LOF-002',
    barcode: 'SH-LOF-002',
    price: 5200,
    cost: 2500,
    stock: 15,
    category: 'Shoes',
    supplier: 'Elite Apparel Mills',
    description: 'Premium genuine leather penny loafers with comfortable rubber soles.',
    image: '/images/products/sneakers.webp',
    track_inventory: true
  },
  {
    name: 'Trail Running Shoes',
    sku: 'SH-RUN-003',
    barcode: 'SH-RUN-003',
    price: 3800,
    cost: 1800,
    stock: 22,
    category: 'Shoes',
    supplier: 'Elite Apparel Mills',
    description: 'High-traction lightweight trail running shoes for all terrains.',
    image: '/images/products/sneakers.webp',
    track_inventory: true
  },

  // ── Cafe & Restaurant ──
  {
    name: 'Gourmet Beef Burger',
    sku: 'CF-BGR-001',
    barcode: 'CF-BGR-001',
    price: 750,
    cost: 320,
    stock: 0,
    category: 'Cafe & Restaurant',
    supplier: 'Fresh Harvest & Bakery Supplies',
    description: 'Angus beef patty, cheddar cheese, fresh greens on a brioche bun.',
    image: '/images/products/burger.webp',
    track_inventory: false,
    is_service: true
  },
  {
    name: 'Cappuccino Latte Art',
    sku: 'CF-CAP-002',
    barcode: 'CF-CAP-002',
    price: 320,
    cost: 110,
    stock: 0,
    category: 'Cafe & Restaurant',
    supplier: 'Fresh Harvest & Bakery Supplies',
    description: 'Double shot espresso with creamy steamed milk and custom art.',
    image: '/images/products/cappuccino.webp',
    track_inventory: false,
    is_service: true
  },
  {
    name: 'Pepperoni Pizza Slice',
    sku: 'CF-PZA-003',
    barcode: 'CF-PZA-003',
    price: 350,
    cost: 150,
    stock: 0,
    category: 'Cafe & Restaurant',
    supplier: 'Fresh Harvest & Bakery Supplies',
    description: 'Classic wood-fired pizza slice with premium pepperoni.',
    image: '/images/products/burger.webp',
    track_inventory: false,
    is_service: true
  }
];

async function main() {
  await client.connect();
  console.log('✅ Connected to database.');

  // 1. Resolve workspace_id
  const userRes = await client.query("SELECT workspace_id FROM public.users WHERE role = 'admin' LIMIT 1;");
  let workspaceId = '9497bf1f-f8d9-4a37-b1e6-d3b007943035'; // Fallback
  if (userRes.rows.length > 0 && userRes.rows[0].workspace_id) {
    workspaceId = userRes.rows[0].workspace_id;
    console.log(`📍 Found admin workspace_id: ${workspaceId}`);
  } else {
    console.log(`📍 Using fallback workspace_id: ${workspaceId}`);
  }

  // 2. Seed Categories
  console.log('🌱 Seeding Categories...');
  const categoryIds = {};
  for (const cat of CATEGORIES) {
    const checkCat = await client.query("SELECT id FROM public.categories WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))", [cat.name]);
    if (checkCat.rows.length > 0) {
      categoryIds[cat.name] = checkCat.rows[0].id;
      console.log(`  Category already exists: ${cat.name}`);
    } else {
      const catId = randomUUID();
      await client.query(`
        INSERT INTO public.categories (id, workspace_id, name, description, active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, true, NOW(), NOW())
      `, [catId, workspaceId, cat.name, cat.description]);
      categoryIds[cat.name] = catId;
      console.log(`  ➕ Added category: ${cat.name}`);
    }
  }

  // 3. Seed Suppliers
  console.log('🌱 Seeding Suppliers...');
  const supplierIds = {};
  for (const sup of SUPPLIERS) {
    const checkSup = await client.query("SELECT id FROM public.suppliers WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))", [sup.name]);
    if (checkSup.rows.length > 0) {
      supplierIds[sup.name] = checkSup.rows[0].id;
      console.log(`  Supplier already exists: ${sup.name}`);
    } else {
      const supId = randomUUID();
      await client.query(`
        INSERT INTO public.suppliers (id, workspace_id, name, email, phone, address, business_type, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      `, [supId, workspaceId, sup.name, sup.email, sup.phone, sup.address, sup.business_type]);
      supplierIds[sup.name] = supId;
      console.log(`  ➕ Added supplier: ${sup.name}`);
    }
  }

  // 4. Seed Products (Rule F1 - Duplicate prevention)
  console.log('🌱 Seeding Products...');
  let productsCount = 0;
  let batchCount = 0;
  let historyCount = 0;

  for (const prod of PRODUCTS) {
    // Trim and lower name check
    const checkProd = await client.query("SELECT id FROM public.products WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))", [prod.name]);
    if (checkProd.rows.length > 0) {
      console.log(`  ⚠️ Skipping duplicate product: "${prod.name}" (already exists in database)`);
      continue;
    }

    // SKU check
    const checkSku = await client.query("SELECT id FROM public.products WHERE sku = $1", [prod.sku]);
    if (checkSku.rows.length > 0) {
      console.log(`  ⚠️ Skipping duplicate SKU product: "${prod.name}" with SKU: ${prod.sku}`);
      continue;
    }

    const productId = randomUUID();
    const barcodeVal = prod.barcode_value || prod.barcode || `ZP-${Math.floor(10000 + Math.random() * 90000)}`;

    await client.query(`
      INSERT INTO public.products (
        id, workspace_id, name, sku, barcode, barcode_value, price, cost, stock,
        min_stock, target_stock, category, supplier, description, image,
        track_inventory, active, created_at, updated_at, is_service, require_serial
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 5, $10, $11, $12, $13, $14, $15, true, NOW(), NOW(), $16, false)
    `, [
      productId,
      workspaceId,
      prod.name,
      prod.sku,
      prod.barcode,
      barcodeVal,
      prod.price,
      prod.cost,
      prod.stock,
      prod.stock * 2,
      prod.category,
      prod.supplier,
      prod.description,
      prod.image,
      prod.track_inventory,
      prod.is_service || false
    ]);

    productsCount++;
    console.log(`  ➕ Added product: ${prod.name} (SKU: ${prod.sku})`);

    // 5. Seed Product Batch & Stock History if tracking inventory is true and stock > 0
    if (prod.track_inventory && prod.stock > 0) {
      const batchId = randomUUID();
      const supId = supplierIds[prod.supplier] || null;

      // product_batches row
      await client.query(`
        INSERT INTO public.product_batches (
          id, workspace_id, product_id, batch_number, batch_type, quantity, qty_remaining,
          cost_price, sale_price, supplier_id, supplier_name, active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, 'opening', $5, $6, $7, $8, $9, $10, true, NOW(), NOW())
      `, [
        batchId,
        workspaceId,
        productId,
        `B-OPEN-${productId.substring(0, 6).toUpperCase()}`,
        prod.stock,
        prod.stock,
        prod.cost,
        prod.price,
        supId,
        prod.supplier
      ]);
      batchCount++;

      // stock_history row (Rule F2)
      await client.query(`
        INSERT INTO public.stock_history (
          id, workspace_id, product_id, change_qty, balance_after, type, reference_id, note, created_at
        ) VALUES ($1, $2, $3, $4, $5, 'initial', $6, 'Initial opening stock', NOW())
      `, [
        randomUUID(),
        workspaceId,
        productId,
        prod.stock,
        prod.stock,
        batchId
      ]);
      historyCount++;
    }
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 Seeding Complete!
   Categories verified/added: ${CATEGORIES.length}
   Suppliers verified/added : ${SUPPLIERS.length}
   Products inserted        : ${productsCount}
   FIFO batches created     : ${batchCount}
   Stock history logs       : ${historyCount}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);

  await client.end();
}

main().catch(err => {
  console.error('❌ Fatal seeding error:', err);
  client.end();
  process.exit(1);
});
