const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const envBackupsDir = path.join(__dirname, '../env_backups');
const envFiles = [
  '.env.local.pizza-milano.20260708_202548',
  'ATOLINE-ENV',
  'jeanzone.env.local',
  'minimahal-pos.env.local'
];

const masterSchemaPath = path.join(__dirname, '../supabase/schema/SUPER_MASTER_SCHEMA.sql');
const cleanupSchemaPath = path.join(__dirname, '../supabase/migrations/20260725120000_remove_batch_system.sql');
const masterSchema = fs.readFileSync(masterSchemaPath, 'utf8');
const cleanupSchema = fs.readFileSync(cleanupSchemaPath, 'utf8');

function parseEnv(content) {
  const env = {};
  content.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const idx = line.indexOf('=');
      if (idx !== -1) {
        env[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
      }
    }
  });
  return env;
}

function run(cmd, env = process.env) {
  console.log(`\n> ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit', env });
  } catch (err) {
    console.error(`Command failed: ${cmd}`);
    throw err;
  }
}

async function main() {
  for (const filename of envFiles) {
    console.log(`\n======================================================`);
    console.log(`🚀 PROCESSING: ${filename}`);
    console.log(`======================================================`);

    const envPath = path.join(envBackupsDir, filename);
    const content = fs.readFileSync(envPath, 'utf8');
    const envVars = parseEnv(content);

    // 1. Copy to .env.local
    fs.copyFileSync(envPath, path.join(__dirname, '../.env.local'));
    fs.copyFileSync(envPath, path.join(__dirname, '../.env'));
    
    // 2. Extract info
    const supabaseRef = envVars['SUPABASE_REF'];
    const mgmtKey = envVars['SUPABASE_MGMT_API_KEY'];
    const repoUrl = envVars['GITHUB_REPO_URL'];
    const pat = envVars['GITHUB_PAT'];

    if (!supabaseRef || !mgmtKey || !repoUrl || !pat) {
      console.warn(`⚠️  Missing credentials in ${filename}. Skipping.`);
      continue;
    }

    // Extract project name from Github URL: https://github.com/org/repo
    const parts = repoUrl.replace('.git', '').split('/');
    const projectName = parts[parts.length - 1].toLowerCase();
    
    // 3. Run Master Schema
    console.log(`\n📦 Applying Master Schema to ${supabaseRef}...`);
    try {
      // Run Master Schema
      const payload1 = JSON.stringify({ query: masterSchema });
      const res1 = execSync(`curl -s -X POST "https://api.supabase.com/v1/projects/${supabaseRef}/database/query" \\
        -H "Authorization: Bearer ${mgmtKey}" \\
        -H "Content-Type: application/json" \\
        -d @-`, { input: payload1 }).toString();
      const resJson1 = JSON.parse(res1);
      if (resJson1.error) console.error('❌ Master Schema Error:', resJson1.error);
      else console.log('✅ Master Schema Applied.');

      // Run Cleanup Schema (Drops product_batches etc)
      const payload2 = JSON.stringify({ query: cleanupSchema });
      const res2 = execSync(`curl -s -X POST "https://api.supabase.com/v1/projects/${supabaseRef}/database/query" \\
        -H "Authorization: Bearer ${mgmtKey}" \\
        -H "Content-Type: application/json" \\
        -d @-`, { input: payload2 }).toString();
      const resJson2 = JSON.parse(res2);
      if (resJson2.error) console.error('❌ Cleanup Schema Error:', resJson2.error);
      else console.log('✅ Cleanup Schema Applied.');
    } catch (e) {
      console.error('❌ Failed to run schema curl:', e.message);
    }

    // 4. Build Project
    console.log(`\n🏗️  Building project for ${projectName}...`);
    run('npm run build');

    // 5. Deploy to Cloudflare
    console.log(`\n☁️  Deploying to Cloudflare Pages project: ${projectName}...`);
    try {
      run(`npx wrangler pages deploy dist --project-name ${projectName}`);
    } catch (e) {
      console.warn('⚠️  Cloudflare deployment may have failed or project might not exist. Check logs.');
    }

    // 6. Push to GitHub
    console.log(`\n🐙 Pushing to GitHub repo: ${repoUrl}...`);
    try {
      // Avoid committing the .env files
      run('git add .');
      run('git restore --staged .env .env.local env_backups/ 2>/dev/null || true');
      run(`git commit -m "chore: sync schema, apply tooltips fix, deploy" || true`);
      
      // Setup authenticated URL
      const authUrl = repoUrl.replace('https://', `https://${pat}@`);
      const remoteName = `remote_${projectName}`;
      
      try { run(`git remote remove ${remoteName} 2>/dev/null || true`); } catch(e){}
      run(`git remote add ${remoteName} ${authUrl}`);
      run(`git push ${remoteName} main || git push ${remoteName} master`);
      run(`git remote remove ${remoteName}`);
    } catch (e) {
      console.warn('⚠️  Failed to push to GitHub:', e.message);
    }
  }

  // Restore original jeanzone env when done so the dev server uses the right one
  console.log(`\n♻️  Restoring default environment (jeanzone)...`);
  const jzEnv = path.join(envBackupsDir, 'jeanzone.env.local');
  fs.copyFileSync(jzEnv, path.join(__dirname, '../.env.local'));
  fs.copyFileSync(jzEnv, path.join(__dirname, '../.env'));
  
  console.log(`\n🎉 ALL DONE!`);
}

main();
