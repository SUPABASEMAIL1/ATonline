const fs = require('fs');
const path = require('path');
const https = require('https');

// Load environment variables from .env.local
const envPath = path.join(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        env[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
});

const SUPABASE_URL = env['VITE_SUPABASE_URL'];
const SERVICE_ROLE_KEY = env['VITE_SUPABASE_SERVICE_ROLE_KEY'];

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('Error: VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_ROLE_KEY not found in .env.local');
    process.exit(1);
}

// Table List (in order of relations)
const TABLES = [
    'users',
    'app_settings',
    'categories',
    'suppliers',
    'products',
    'product_batches',
    'customers',
    'discounts',
    'sales',
    'expenses',
    'sales_tabs'
];

const fetchTableData = (tableName) => {
    return new Promise((resolve, reject) => {
        const url = `${SUPABASE_URL}/rest/v1/${tableName}?select=*`;
        const options = {
            headers: {
                'apikey': SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
            }
        };

        https.get(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(JSON.parse(data));
                } else {
                    reject(new Error(`Failed to fetch ${tableName}: ${res.statusCode} ${data}`));
                }
            });
        }).on('error', (err) => reject(err));
    });
};

const formatVal = (v) => {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
    if (typeof v === 'number') return v.toString();
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'object') {
        return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
    }
    return `'${v.toString().replace(/'/g, "''")}'`;
};

const generateInserts = (tableName, rows) => {
    if (!rows || rows.length === 0) return `-- No data for ${tableName}\n\n`;
    
    // Dynamically get columns from first row
    const columns = Object.keys(rows[0]);
    let output = `-- Data for ${tableName} (${rows.length} rows)\n`;
    
    rows.forEach(row => {
        const values = columns.map(col => formatVal(row[col]));
        output += `INSERT INTO public.${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')}) ON CONFLICT (id) DO UPDATE SET ${columns.filter(c => c !== 'id').map(c => `${c} = EXCLUDED.${c}`).join(', ')};\n`;
    });
    return output + '\n';
};

async function run() {
    console.log('--- Database Master Export Started ---');
    
    // 1. Get Master Schema
    let masterSchemaContent = '';
    try {
        const schemaPath = path.join(process.cwd(), 'src/lib/masterSchema.ts');
        const content = fs.readFileSync(schemaPath, 'utf8');
        // Extract content between backticks (assume it's the MASTER_SCHEMA variable)
        const match = content.match(/const\s+MASTER_SCHEMA\s+=\s+`([\s\S]*)`;/);
        masterSchemaContent = match ? match[1] : content;
    } catch (e) {
        console.warn('Could not read MASTER_SCHEMA from src/lib/masterSchema.ts. Proceeding with data only.');
    }

    let finalSql = `-- TotVogue MASTER BACKUP (DDL + DML)
-- Generated: ${new Date().toLocaleString()}
-- Source: Supabase REST API (Terminal Export)

${masterSchemaContent}

-- ================================================================
-- DATA INJECTION (9/9)
-- ================================================================

SET session_replication_role = 'replica';

`;

    // 2. Fetch and append data for all tables
    for (const table of TABLES) {
        try {
            console.log(`Fetching data for ${table}...`);
            const rows = await fetchTableData(table);
            finalSql += generateInserts(table, rows);
        } catch (e) {
            console.error(`Error processing table ${table}: ${e.message}`);
        }
    }

    finalSql += `
SET session_replication_role = 'origin';

-- BACKUP COMPLETE
`;

    // 3. Write to file
    const outputPath = path.join(process.cwd(), 'all projects schema.SQL');
    fs.writeFileSync(outputPath, finalSql);
    
    console.log(`\n✅ Database master export saved to: ${outputPath}`);
}

run();
