import fs from 'fs';
import path from 'path';

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
  return result;
}

// Product name → high-quality Unsplash image URL (1200×1200, specific photo IDs)
const PRODUCT_IMAGES = {
  'Samsung 65" 4K Smart TV':
    'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=800&q=80&fit=crop',
  'Wireless Bluetooth Earbuds Pro':
    'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800&q=80&fit=crop',
  'USB-C GaN Fast Charger 65W':
    'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=800&q=80&fit=crop',
  "Men's Oxford Dress Shirt":
    'https://images.unsplash.com/photo-1620012253295-c15cc3e65df4?w=800&q=80&fit=crop',
  "Women's Embroidered Lawn Suit 3pc":
    'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=800&q=80&fit=crop',
  'Kids Slim Denim Jeans':
    'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=800&q=80&fit=crop',
  'Super Kernel Basmati Rice 5KG':
    'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=800&q=80&fit=crop',
  'Sunflower Cooking Oil 5 Litre':
    'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=800&q=80&fit=crop',
  'Tapal Organic Green Tea 100 Bags':
    'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=800&q=80&fit=crop',
  'Moisturizing Face Cream SPF50':
    'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&q=80&fit=crop',
  'Biotin Hair Growth Serum 100ml':
    'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=800&q=80&fit=crop',
  'Vitamin C Brightening Face Wash':
    'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=800&q=80&fit=crop',
  'Stainless Steel Pressure Cooker 7L':
    'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=800&q=80&fit=crop',
  'Non-Stick Frying Pan Set 3pcs':
    'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80&fit=crop',
  '20000mAh Slim Power Bank':
    'https://images.unsplash.com/photo-1609592806596-b81d0e6ec1cb?w=800&q=80&fit=crop',
};

async function main() {
  console.log('🔌 Connecting to Supabase API...');
  console.log('✅ Setup Done!\n');

  let updated = 0;
  let skipped = 0;

  for (const [name, imageUrl] of Object.entries(PRODUCT_IMAGES)) {
    try {
      const result = await runQuery(
        `UPDATE products SET image = $1, updated_at = NOW()
         WHERE name = $2 AND (image IS NULL OR image = '')`,
        [imageUrl, name]
      );

      // Result of query execution is usually a JSON array or row status
      // We can also check by selecting the product
      const check = await runQuery(
        `SELECT id, image FROM products WHERE name = $1`, [name]
      );

      if (check && check.length > 0) {
        if (check[0].image === imageUrl) {
          console.log(`  ✅ ${name} updated`);
          updated++;
        } else {
          // Force update
          await runQuery(
            `UPDATE products SET image = $1, updated_at = NOW() WHERE name = $2`,
            [imageUrl, name]
          );
          console.log(`  🔄 ${name} (force updated)`);
          updated++;
        }
      } else {
        console.log(`  ⚠️  Not found: ${name}`);
        skipped++;
      }
    } catch (err) {
      console.error(`  ❌ Error [${name}]: ${err.message}`);
      skipped++;
    }
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 Images Updated!
   Updated : ${updated} products
   Skipped : ${skipped} products
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👉 Refresh POS app to see product images!
`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
