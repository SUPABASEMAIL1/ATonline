# Supabase API Guide — Zero to Hero

> Kisi bhi Supabase project se kaam karo bina psql / Dashboard / DB password ke.
> Sirf **Management API token (`sbp_`)** + **curl**. Har project, har environment.

---

## 📌 Core Concept

Supabase ke paas 2 APIs hain:

| API | Token Required | Use Case |
|---|---|---|
| **Management API** | `sbp_...` token | Project create, SQL run, config, keys nikalo |
| **Service API** | `service_role` key | Storage, Auth admin, Realtime |

> `sbp_` token ek baar lelo — us se **project bhi banao, keys bhi nikalo, SQL bhi chalao, sab kuch**.

---

## 1. TOKEN LENA

1. [Supabase Dashboard](https://supabase.com/dashboard/account/tokens) → Settings → Access Tokens
2. "Generate New Token" → name do → `sbp_...` milega
3. Is token ko env mein dalo: `SUPABASE_MGMT_TOKEN=sbp_...`

---

## 2. ORGANIZATION SLUG NIKALNA

```bash
curl -s "https://api.supabase.com/v1/organizations" \
  -H "Authorization: Bearer $SUPABASE_MGMT_TOKEN"
```

Response mein `slug` field milega — copy karo.

---

## 3. NAYA PROJECT BANANA

```bash
curl -X POST "https://api.supabase.com/v1/projects" \
  -H "Authorization: Bearer $SUPABASE_MGMT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Project Name",
    "organization_slug": "your-org-slug",
    "db_pass": "YourStrongPass@123",
    "region_selection": {"type": "smartGroup", "code": "apac"}
  }'
```

Response mein `ref` milega (e.g. `rjxzjdfflupgbjerpevj`) — yeh project ka unique ID hai. Save karo.

**Region options:** `americas`, `emea`, `apac`

---

## 4. API KEYS NIKALNA (anon + service_role)

```bash
curl -s "https://api.supabase.com/v1/projects/{ref}/api-keys?reveal=true" \
  -H "Authorization: Bearer $SUPABASE_MGMT_TOKEN"
```

Response:
```json
[
  {"name": "anon", "api_key": "eyJ..."},
  {"name": "service_role", "api_key": "eyJ..."}
]
```

Inhe env mein set karo:
```env
SUPABASE_URL=https://{ref}.supabase.co
SUPABASE_ANON_KEY=eyJ...         # anon wali
SUPABASE_SERVICE_KEY=eyJ...      # service_role wali
```

---

## 5. DATABASE — SQL Run

### Single Query
```bash
curl -X POST "https://api.supabase.com/v1/projects/{ref}/database/query" \
  -H "Authorization: Bearer $SUPABASE_MGMT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT table_name FROM information_schema.tables WHERE table_schema='\''public'\'';"}'
```

### Bulk Schema File
```bash
SCHEMA_SQL=$(cat schema.sql)
SCHEMA_JSON=$(python3 -c "import json,sys; print(json.dumps({'query': sys.stdin.read()}))" <<< "$SCHEMA_SQL")

curl -X POST "https://api.supabase.com/v1/projects/{ref}/database/query" \
  -H "Authorization: Bearer $SUPABASE_MGMT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$SCHEMA_JSON"
```

### Common SQL Examples
```bash
# List tables
curl -s ... -d '{"query": "SELECT table_name FROM information_schema.tables WHERE table_schema='\''public'\'' AND table_type='\''BASE TABLE'\'';"}'

# Insert
curl -s ... -d '{"query": "INSERT INTO users (name) VALUES ('\''John'\'');"}'

# Drop table
curl -s ... -d '{"query": "DROP TABLE IF EXISTS old_table CASCADE;"}'
```

> **Note:** `sbp_` token se hi SQL chalta hai. DB password, anon key, service_role key nahi chahiye.

---

## 6. STORAGE — Buckets

**Uses service_role key, not sbp_ token.**

```bash
# Create bucket
curl -X POST "$SUPABASE_URL/storage/v1/bucket" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-bucket",
    "public": true,
    "file_size_limit": 5242880,
    "allowed_mime_types": ["image/jpeg", "image/png", "application/pdf"]
  }'

# List buckets
curl -s "$SUPABASE_URL/storage/v1/bucket" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY"

# Delete bucket
curl -X DELETE "$SUPABASE_URL/storage/v1/bucket/my-bucket" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY"
```

---

## 7. AUTH — User Management

**Uses service_role key + anon key (as apikey header).**

```bash
# Create user (auto-confirmed)
curl -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@email.com",
    "password": "Pass@123",
    "email_confirm": true,
    "user_metadata": {"full_name": "User Name", "role": "super_admin"}
  }'

# List users
curl -s "$SUPABASE_URL/auth/v1/admin/users" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "apikey: $SUPABASE_ANON_KEY"

# Delete user
curl -X DELETE "$SUPABASE_URL/auth/v1/admin/users/{user_id}" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "apikey: $SUPABASE_ANON_KEY"
```

---

## 8. FULL AUTOMATION SCRIPT (Any Project)

```bash
#!/bin/bash
set -e

MGMT_TOKEN="sbp_..."
ORG_SLUG="your-org-slug"
PROJECT_NAME="My App"

# 1. Create project
echo "Creating project..."
RESULT=$(curl -s -X POST "https://api.supabase.com/v1/projects" \
  -H "Authorization: Bearer $MGMT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"$PROJECT_NAME\", \"organization_slug\": \"$ORG_SLUG\", \"db_pass\": \"StrongPass@123\", \"region_selection\": {\"type\": \"smartGroup\", \"code\": \"apac\"}}")
REF=$(echo $RESULT | python3 -c "import json,sys; print(json.load(sys.stdin)['ref'])")
echo "Project ref: $REF"

# 2. Wait for project to become active
sleep 30

# 3. Get API keys
KEYS=$(curl -s "https://api.supabase.com/v1/projects/$REF/api-keys?reveal=true" \
  -H "Authorization: Bearer $MGMT_TOKEN")
ANON=$(echo $KEYS | python3 -c "import json,sys; keys=json.load(sys.stdin); print([k['api_key'] for k in keys if k['name']=='anon'][0])")
SERVICE=$(echo $KEYS | python3 -c "import json,sys; keys=json.load(sys.stdin); print([k['api_key'] for k in keys if k['name']=='service_role'][0])")
SUPABASE_URL="https://$REF.supabase.co"

# 4. Run schema
echo "Running schema..."
SQL=$(cat schema.sql)
SQL_JSON=$(python3 -c "import json,sys; print(json.dumps({'query': sys.stdin.read()}))" <<< "$SQL")
curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $MGMT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$SQL_JSON"
echo "Schema done"

# 5. Create storage buckets
echo "Creating buckets..."
for bucket in assets uploads media; do
  curl -s -X POST "$SUPABASE_URL/storage/v1/bucket" \
    -H "Authorization: Bearer $SERVICE" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"$bucket\", \"public\": true}"
done
echo "Buckets done"

# 6. Create admin user
echo "Creating admin user..."
curl -s -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "Authorization: Bearer $SERVICE" \
  -H "apikey: $ANON" \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@email.com", "password": "Admin@123", "email_confirm": true}'
echo "Admin done"

echo "=== ENV for .env.local ==="
echo "SUPABASE_URL=$SUPABASE_URL"
echo "SUPABASE_ANON_KEY=$ANON"
echo "SUPABASE_SERVICE_KEY=$SERVICE"
```

---

## 📌 TOKEN SUMMARY

| Token | Kahan se milega | Kya kar sakta hai |
|---|---|---|
| `sbp_...` | Dashboard → Access Tokens | Project CRUD, SQL, config, keys |
| `service_role` | API keys endpoint (sbp_ se nikal lo) | Storage, Auth admin, Functions |
| `anon` | API keys endpoint (sbp_ se nikal lo) | Frontend public access |

> **⚠️ Rule:** `service_role` key kabhi frontend ya client-side code mein mat dalo.
> Sirf backend / API calls / CI/CD mein use karo.

---

## 🔗 Important Links

| Cheez | Link |
|---|---|
| Access Tokens generate | https://supabase.com/dashboard/account/tokens |
| Management API Docs | https://api.supabase.com/api/v1 |
| Supabase Docs | https://supabase.com/docs/reference/api/introduction |
| Storage API | `POST {url}/storage/v1/bucket` |
| Auth Admin API | `POST {url}/auth/v1/admin/users` |
