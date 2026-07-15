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

### Create a new pages project

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

### Manual deploy (last commit se)

```bash
curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/my-project/deployments" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json"
```

### Specific branch deploy

```bash
curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/my-project/deployments" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"branch": "staging"}'
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

### Add custom domain

```bash
curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/my-project/domains" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "example.com"}'
```

### List domains

```bash
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/my-project/domains"
```

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

# 3. Trigger deploy
echo "Triggering deploy..."
curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$PROJECT_NAME/deployments" \
  -H "Authorization: Bearer $TOKEN"
echo "✓ Deploy started"

# 4. Wait and check status
sleep 10
DEP_ID=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$PROJECT_NAME/deployments" | \
  python3 -c "import json,sys; d=json.load(sys.stdin); print(d['result'][0]['id'] if d['result'] else '')")
echo "Deployment ID: $DEP_ID"
echo "Check status: curl .../deployments/$DEP_ID"
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

## 🚀 QUICK REFERENCE (Agent ke liye)

Jab bhi Cloudflare Pages operation karna ho:

1. **Env vars check karo:** `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` dono `.env.local` mein hain?
2. **Token verify karo** — Section 3
3. **Account ID verify karo** — Section 2 se nikal lo agar missing ho
4. **Operation select karo:**
   - Naya project? → Section 4 (Create)
   - Env vars update? → Section 5
   - Deploy? → Section 6
   - Build check? → Section 7
   - Config change? → Section 8
   - Domain? → Section 9
5. **Deploy ke baad akhri stage check karo** → Section 10
