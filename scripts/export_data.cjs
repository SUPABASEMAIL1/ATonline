const fs = require('fs');
const https = require('https');

const SUPABASE_URL = 'https://mnxmkrzpvwyrcfwfsmpj.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ueG1rcnpwdnd5cmNmd2ZzbXBqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTg5MzY4MSwiZXhwIjoyMDg1NDY5NjgxfQ.rJyo8Dvs9ADfOcb9p91GEKH7yp6wQ6PxKKskBoOd124';

const TABLES = [
  'app_settings',
  'categories',
  'customers',
  'suppliers',
  'products',
  'product_batches',
  'discounts',
  'users',
  'sales',
  'sales_tabs',
  'expenses'
];

async function fetchData(table) {
  return new Promise((resolve, reject) => {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=*`;
    const options = {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Range': '0-999'
      }
    };

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(`Error parsing ${table}: ${data.substring(0, 100)}`);
        }
      });
    }).on('error', reject);
  });
}

function jsonToSql(table, rows) {
  if (!rows || rows.length === 0) return `-- No data for ${table}\n`;

  let sql = `-- Data for ${table} (${rows.length} rows)\n`;
  rows.forEach(row => {
    const keys = Object.keys(row);
    const values = keys.map(k => {
      let val = row[k];
      if (val === null) return 'NULL';
      if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
      if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
      return val;
    });
    sql += `INSERT INTO public.${table} (${keys.join(', ')}) VALUES (${values.join(', ')}) ON CONFLICT (id) DO UPDATE SET ${keys.map(k => `${k} = EXCLUDED.${k}`).join(', ')};\n`;
  });
  return sql + '\n';
}

async function main() {
  console.log('Starting data export via REST API...');
  let fullSql = `-- ZaynahsPos TOTAL BACKUP (Schema + Data)\n`;
  fullSql += `-- Generated: ${new Date().toISOString()}\n\n`;

  // 1. Add Schema (from existing file if possible)
  try {
    const schema = fs.readFileSync('complete_system_schema.sql', 'utf8');
    fullSql += schema + '\n\n';
  } catch (e) {
    console.error('Schema file not found, skipping DDL part.');
  }

  fullSql += `SET session_replication_role = 'replica';\n\n`;

  for (const table of TABLES) {
    try {
      console.log(`Fetching ${table}...`);
      const rows = await fetchData(table);
      fullSql += jsonToSql(table, rows);
    } catch (e) {
      console.error(`Failed to fetch ${table}:`, e);
    }
  }

  fullSql += `SET session_replication_role = 'origin';\n`;

  fs.writeFileSync('supabase_total_backup.sql', fullSql);
  console.log('Successfully created supabase_total_backup.sql');
}

main();
