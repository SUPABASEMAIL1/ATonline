# Cloudflare Pages API Guide

> Cloudflare Pages ko API se fully control karo — project banayein, deploy karein, env vars set karein, build logs dekhein.
> Sirf **API Token (`cfut_...`)** + **Account ID** + **curl**. Dashboard ki zaroorat nahi.

---

## 📌 Core Concept

Cloudflare ke paas 2 APIs hain Pages ke liye:

| API | Token Required | Use Case |
|---|---|---|
| **Cloudflare API** | `cfut_...` token | Pages project CRUD, deploy, env vars, logs |
| **Pages SDK** | Same `cfut_...` token | Wrangler CLI ke bina sab kuch |

> Ek baar token le lo — us se **project banao, deploy karo, env vars set karo, build dekho, sab kuch**.

---

## 1. TOKEN LENA

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → My Profile → API Tokens
2. "Create Token" → "Custom Token"
3. Token name do
4. Ye **minimum permissions** lagao:

| Resource | Permission |
|----------|-----------|
| Account → Cloudflare Pages | **Edit** |
| Account → Account Settings | **Read** (zaroori — account ID lene ke liye) |
| Zone → DNS Settings | **Edit** (optional, custom domain ke liye) |
| User → API Tokens | **Edit** (optional) |

5. Token generate karo → `cfut_...` milega
6. Env mein dalo: `CLOUDFLARE_API_TOKEN=cfut_...`

---

## 2. ACCOUNT ID NIKALNA

```bash
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts" | \
  python3 -c "import json,sys; d=json.load(sys.stdin); [print(f'ID: {i[\"id\"]}  Name: {i[\"name\"]}') for i in d['result']]"
```

Response mein `id` field milega — yeh Account ID hai. Save karo:

```env
CLOUDFLARE_ACCOUNT_ID=43039ad79a149f127dc1c61725163ca6
```

---

## 3. TOKEN VERIFY KARNA

```bash
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/user/tokens/verify" | \
  python3 -c "import json,sys; d=json.load(sys.stdin); print('Valid' if d['success'] else 'Invalid')"
```

---

## 4. PAGES PROJECTS — LIST / CREATE / DELETE

### List all pages projects

```bash
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects" | \
  python3 -c "
import json,sys
d=json.load(sys.stdin)
for p in d['result']:
    print(f\"Name: {p['name']}  Subdomain: {p.get('sub_domain','N/A')}  Created: {p.get('created_on','N/A')}\")
"
```

### Create a new pages project (with env vars)

```bash
# GitHub se connect karna hai — pehle GitHub access token dena hoga
curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-project",
    "production_branch": "main",
    "build_config": {
      "build_command": "npm run build",
      "destination_dir": "dist",
      "root_dir": ""
    },
    "deployment_configs": {
      "production": {
        "env_vars": {
          "VITE_SUPABASE_URL": { "value": "https://xxx.supabase.co", "type": "plain_text" },
          "VITE_SUPABASE_ANON_KEY": { "value": "eyJ...", "type": "secret_text" }
        }
      },
      "preview": {
        "env_vars": {}
      }
    }
  }'
```

### Get project details

```bash
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/my-project"
```

### Delete project

```bash
curl -s -X DELETE "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/my-project" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
```

---

## 5. ENV VARS SET KARNA (Production)

### Update production env vars

```bash
curl -s -X PATCH "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/my-project" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "deployment_configs": {
      "production": {
        "env_vars": {
          "VITE_SUPABASE_URL": { "value": "https://xxx.supabase.co", "type": "plain_text" },
          "VITE_SUPABASE_ANON_KEY": { "value": "eyJ...", "type": "secret_text" },
          "VITE_SUPABASE_SERVICE_ROLE_KEY": { "value": "eyJ...", "type": "secret_text" }
        }
      }
    }
  }'
```

> **Type options:** `plain_text` (normal), `secret_text` (encrypted — hidden in dashboard)

### Bulk env vars set karna (from .env.local)

```bash
ENV_JSON=$(python3 -c "
import json
env = {}
with open('.env.local') as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        k = k.strip()
        v = v.strip()
        if k in ('VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','VITE_SUPABASE_SERVICE_ROLE_KEY','SUPABASE_MGMT_API_KEY','SUPABASE_REF','CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','GITHUB_REPO_URL','GITHUB_PAT','GITHUB_TOKEN'):
            env[k] = {'value': v, 'type': 'secret_text' if 'KEY' in k or 'TOKEN' in k or 'PAT' in k else 'plain_text'}
print(json.dumps({'deployment_configs': {'production': {'env_vars': env}}}))
")

curl -s -X PATCH "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/my-project" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$ENV_JSON"
```

---

## 6. DEPLOY TRIGGER KARNA

### GitHub-connected project deploy

Agar project GitHub se connected hai (OAuth through dashboard), to sirf trigger karo:

```bash
curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/my-project/deployments" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json"
```

### Direct Upload — build karo aur files upload karo (recommended)

> **⚠️ Sabse fast tarika.** CURL multipart se direct upload karte waqt 404 aata hai (Cloudflare ka bug/manifest format issue).
> **Isliye hamesha Wrangler CLI use karo:**

```bash
# 1. Pehle build karo
npm run build

# 2. Wrangler se deploy (yeh API token auto-detect karega)
npx wrangler pages deploy dist --project-name my-project

# Ya specific branch ke saath
npx wrangler pages deploy dist --project-name my-project --branch main
```

> Wrangler CLI automatically `CLOUDFLARE_API_TOKEN` ko `.env.local` se pick karega.
> Agar nahi, to `CLOUDFLARE_API_TOKEN` env set karo.

### Specific branch deploy (upload via wrangler)

```bash
npx wrangler pages deploy dist --project-name my-project --branch staging
```

---

## 7. DEPLOYMENTS LIST / LOGS / CANCEL

### List all deployments

```bash
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/my-project/deployments" | \
  python3 -c "
import json,sys
d=json.load(sys.stdin)
for dep in d['result']:
    print(f\"{dep['id']} | {dep['environment']} | {dep['state']} | {dep.get('created_on','')})
"
```

### Get deployment details + build logs

```bash
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/my-project/deployments/DEPLOYMENT_ID"
```

### Cancel deployment

```bash
curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/my-project/deployments/DEPLOYMENT_ID/cancel" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
```

### Retry deployment

```bash
curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/my-project/deployments/DEPLOYMENT_ID/retry" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
```

---

## 8. BUILD CONFIG UPDATE

```bash
curl -s -X PATCH "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/my-project" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "build_config": {
      "build_command": "npm run build",
      "destination_dir": "dist",
      "root_dir": "",
      "web_analytics_tag": null,
      "web_analytics_token": null
    }
  }'
```

---

## 9. CUSTOM DOMAIN — ADD / REMOVE

### Via API (Agent automatic)

```bash
curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/my-project/domains" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "subdomain.yourdomain.com"}'
```

### Via Dashboard (Manual)

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → project name
2. **Custom domains** tab → **Set up a custom domain**
3. Domain likho → **Continue**
4. Cloudflare auto-verify karega

### DNS Setup (Both Methods)

| Scenario | DNS Record |
|----------|-----------|
| Domain **same Cloudflare account** pe hai | Auto — kuch nahi karna |
| Domain **doosre Cloudflare account** pe hai | CNAME `subdomain` → `project-name.pages.dev` manually dalo |
| Domain **kisi aur registrar** pe hai (GoDaddy, Namecheap) | Pehle nameservers Cloudflare ke change karo, phir CNAME auto |

### Important: Agent Action Rule

Jab bhi domain add karo:

1. **API se domain add karo** (upar wala curl)
2. **User ko batao** exact CNAME record jo dalna hai:

```
   🔴 Action Required:
   Doosre Cloudflare account mein DNS mein CNAME record add karo:
   Type: CNAME
   Name: <subdomain>
   Target: <project-name>.pages.dev
```

3. **Status check karo:**
   ```bash
   curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/my-project/domains"
   ```
   - `active` → ✅ ready
   - `pending` → ⏳ wait + DNS verify
   - `initializing` → ⏳ processing

4. **Verify site reachable:**
   ```bash
   curl -sI "https://subdomain.yourdomain.com"
   ```
   HTTP 200 milna chahiye.

### Remove domain

```bash
curl -s -X DELETE "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/my-project/domains/example.com" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
```

---

## 10. CHECK DEPLOY LOGS (Last Deploy Output)

```bash
# Pehle last deployment ka ID lo
DEP_ID=$(curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/my-project/deployments" | \
  python3 -c "import json,sys; d=json.load(sys.stdin); print(d['result'][0]['id'] if d['result'] else '')")

# Phir us deployment ka stage log lo
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/my-project/deployments/$DEP_ID/history" | \
  python3 -c "
import json,sys
d=json.load(sys.stdin)
for stage in d.get('result',[]):
    print(f'Stage: {stage.get(\"name\",\"\")}  Status: {stage.get(\"status\",\"\")}')
    print(stage.get('output','')[:2000])
"
```

---

## 11. FULL AUTOMATION SCRIPT

```bash
#!/bin/bash
set -e

TOKEN="cfut_..."
ACCOUNT_ID="your-account-id"
PROJECT_NAME="my-project"

# 1. Check token
echo "Verifying token..."
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.cloudflare.com/client/v4/user/tokens/verify" | \
  python3 -c "import json,sys; d=json.load(sys.stdin); sys.exit(0 if d['success'] else 1)"
echo "✓ Token valid"

# 2. Create project if not exists
echo "Creating project..."
curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"$PROJECT_NAME\",
    \"production_branch\": \"main\",
    \"build_config\": {
      \"build_command\": \"npm run build\",
      \"destination_dir\": \"dist\"
    },
    \"deployment_configs\": {
      \"production\": {
        \"env_vars\": {
          \"VITE_SUPABASE_URL\": { \"value\": \"https://xxx.supabase.co\", \"type\": \"plain_text\" },
          \"VITE_SUPABASE_ANON_KEY\": { \"value\": \"eyJ...\", \"type\": \"secret_text\" }
        }
      }
    }
  }"
echo "✓ Project created"

# 3. Build + Deploy via Wrangler (recommended — avoids 404 bug)
echo "Building..."
npm run build
echo "Deploying via Wrangler..."
npx wrangler pages deploy dist --project-name "$PROJECT_NAME"

# 4. Ya sirf API trigger (agar GitHub connected ho)
# echo "Triggering deploy..."
# curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$PROJECT_NAME/deployments" \
#   -H "Authorization: Bearer $TOKEN"
echo "✓ Deploy initiated"
```

---

## 📌 TOKEN SUMMARY

| Token | Kahan se milega | Permissions needed |
|---|---|---|
| `cfut_...` | Dashboard → My Profile → API Tokens | Cloudflare Pages: Edit, Account: Read |
| `CLOUDFLARE_ACCOUNT_ID` | API se nikal lo (Section 2) | N/A (identifier hai) |

> **⚠️ Rule:** Token kabhi frontend / client-side code mein mat dalo.
> Sirf `.env.local`, CI/CD, ya API calls mein use karo.

---

## 🔗 Important Links

| Cheez | Link |
|---|---|
| API Tokens create | https://dash.cloudflare.com/profile/api-tokens |
| Cloudflare API Docs | https://api.cloudflare.com |
| Pages API Reference | https://developers.cloudflare.com/api/operations/pages-project-create |
| Cloudflare Dashboard | https://dash.cloudflare.com |

---

---

## ⚠️ GOTCHAS — TIME-SAVING TIPS (Zaroor Padho)

### ❌ CURL direct upload se 404 aata hai

Cloudflare Pages ka Direct Upload API (`curl -F manifest=...`) deploy to success dikhata hai, lekin site 404 return karti hai. **Yeh Cloudflare ka internal bug hai — manifest multipart format sahi se parse nahi hota.**

**✅ Fix:** Hamesha **Wrangler CLI** use karo deploy ke liye:
```bash
npx wrangler pages deploy dist --project-name my-project
```
Wrangler internally sahi API call karta hai, files properly upload hoti hain, aur site 200 deti hai.

### ❌ Git-connected project bina OAuth ke nahi bana sakte

Project create karte waqt `source` field mein GitHub repo nahi daal sakte bina OAuth ke. **Pehle dashboard se GitHub connect karo, phir API use karo.**

### ✅ Jo kaam API se seedha hota hai:

| Kaam | Status |
|------|--------|
| Project create (bina git) | ✅ |
| Env vars set karna | ✅ |
| Build config update | ✅ |
| Direct upload deploy | ❌ (404 bug — wrangler use karo) |
| List deployments | ✅ |
| Cancel / retry deploy | ✅ |
| Custom domain add/remove | ✅ |

### ✅ Jo kaam API se nahi hota:

| Kaam | Solution |
|------|----------|
| GitHub repo connect karna | Dashboard se karo (OAuth) |
| SSL/TLS settings | Dashboard ya Zone API |
| Workers routes | Workers API se (alag hai) |

---

## 🚀 QUICK REFERENCE (Agent ke liye)

Jab bhi Cloudflare Pages operation karna ho:

1. **Env vars check karo:** `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` dono `.env.local` mein hain?
2. **Token verify karo** — Section 3
3. **Account ID verify karo** — Section 2 se nikal lo agar missing ho
4. **Operation select karo:**
   - Naya project? → Section 4 (Create)
   - Env vars update? → Section 5
   - Deploy? → Section 6 (hamesha wrangler use karo, NOT curl multipart)
   - Build check? → Section 7
   - Config change? → Section 8
   - Domain? → Section 9 (API add karo + user ko CNAME batao)
   - Domain status check? → `curl .../domains` — `active` = ready
5. **Deploy ke baad akhri stage check karo** → Section 10
