const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '../supabase/schema/SUPER_MASTER_SCHEMA.sql');
let schema = fs.readFileSync(schemaPath, 'utf8');

// Helper to remove lines between start string and end string
function removeBlock(startStr, endStr) {
  const startIdx = schema.indexOf(startStr);
  if (startIdx !== -1) {
    const endIdx = schema.indexOf(endStr, startIdx);
    if (endIdx !== -1) {
      schema = schema.substring(0, startIdx) + schema.substring(endIdx + endStr.length);
      console.log(`Removed block starting with: ${startStr.substring(0, 50)}...`);
    }
  }
}

// 1. Remove product_batches table creation
removeBlock('CREATE TABLE IF NOT EXISTS product_batches (', 'ALTER TABLE product_batches REPLICA IDENTITY FULL;\n');

// 2. Remove product_batches indexes
removeBlock('-- Product Batches\nCREATE INDEX IF NOT EXISTS idx_product_batches_product_id', 'CREATE INDEX IF NOT EXISTS idx_product_batches_batch_number ON product_batches(batch_number);\n');

// 3. Remove trigger
schema = schema.replace(/DO \$\$ BEGIN CREATE TRIGGER update_product_batches_updated_at.*?\n/g, '');

// 4. Remove audit_stock_integrity function
removeBlock('-- ── Stock Integrity Audit ──\n-- Returns products where products.stock', '$$;\n');

// 5. Remove reconcile_stock_with_batches function (if present)
removeBlock('CREATE OR REPLACE FUNCTION reconcile_stock_with_batches(auto_fix boolean DEFAULT false)', '$$;\n');

// 6. Remove backfill
removeBlock('-- Backfill product_batches for tracked products with stock but no batches\nINSERT INTO product_batches', 'HAVING COUNT(pb.id) = 0;\n');
removeBlock('-- Backfill for negative stock products', 'HAVING COUNT(pb.id) = 0;\n');

// 7. Remove product_batches from publication
schema = schema.replace(/\s*product_batches,/g, '');

// 8. Remove batches column from products table
schema = schema.replace(/\s*batches\s+JSONB\s+DEFAULT\s+'\[\]',/g, '');

fs.writeFileSync(schemaPath, schema);
console.log('Schema cleaned.');
