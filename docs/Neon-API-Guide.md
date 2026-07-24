# Neon API Guide — Zero to Hero

> Kisi bhi Neon project ko control karo bina Console mein click kiye — sirf **2 credentials** se: `NEON_API_KEY` (infra ke liye) + **connection string** (data/schema ke liye).
> Ye guide project create se le kar Auth, Storage, Data API, Functions aur AI Gateway tak — sab cover karti hai.

⚠️ **Beta warning:** Object Storage, Functions, aur AI Gateway abhi **Public Beta** mein hain aur sirf **AWS US East — Ohio (`aws-us-east-2`)** region mein available hain. Naya project isi region mein banao agar ye services use karni hain. Postgres + Data API + Auth har region mein kaam karte hain.

---

## 📌 Core Concept

Neon mein Supabase jaisa **1 hi token sab kuch** wala system nahi hai — 2 alag cheezen hain:

| Credential | Kya control karta hai | Kahan milta hai |
|---|---|---|
| **`NEON_API_KEY`** | Project, Branch, Auth on/off, Storage bucket, Data API on/off, Functions, AI Gateway — yani **infrastructure** | Console → API keys |
| **Connection String** (`postgresql://...`) | Table create/alter/drop, columns, INSERT/UPDATE/DELETE/SELECT — yani **actual schema aur data** | Project create karte hi milti hai |
| **JWT Token** (Auth se) | Data API ke through row-level CRUD (frontend/agent se) | Auth sign-in/sign-up response se |
| **S3 Access Key + Secret** | Storage bucket mein files upload/download | Bucket create karte waqt auto-inject hoti hai |

> Yaad rakho: **`NEON_API_KEY` se raw SQL nahi chal sakta.** Table banane/alter karne ke liye hamesha connection string + Postgres client (psql, `pg`, Drizzle, Prisma) chahiye hoga.

---

## 1. TOKEN LENA (API Key)

1. [Neon Console](https://console.neon.tech/app) khol lo (top pe yehi link use karo login/dashboard ke liye)
2. Top-right **user menu** (profile icon) → **Account settings** → **API keys**
3. **"Create new API key"** → naam do → **Create**
4. Token sirf **ek baar** dikhega — turant copy karke env mein daal do:

```env
NEON_API_KEY=neon_api_key_xxxxxxxxxxxxx
```

> Organization ke through kaam kar rahe ho to: Org switch karo → **Settings → API keys** (org-scoped key milega, `org_id` param nahi lagana padta).

Test karo:
```bash
curl "https://console.neon.tech/api/v2/projects" \
  -H "Authorization: Bearer $NEON_API_KEY" | jq
```

---

## 2. NAYA PROJECT BANANA

```bash
curl -X POST "https://console.neon.tech/api/v2/projects" \
  -H "Authorization: Bearer $NEON_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "project": {
      "name": "My App",
      "region_id": "aws-us-east-2",
      "pg_version": 17
    }
  }'
```

Response mein milega:
- `project.id` → e.g. `purple-shape-411361` (isko `{project_id}` ki jagah use karoge aage)
- `connection_uris[0].connection_uri` → **connection string** (isko save kar lo)
- `branches[0].id` → default branch ka `{branch_id}` (usually naam `production` ya `main`)

**Region options:** `aws-us-east-2` (Storage/Functions/AI Gateway ke liye zaroori), `aws-ap-southeast-1`, `aws-eu-west-2`, `aws-us-west-2`, waghera.

---

## 3. CONNECTION STRING NIKALNA (agar dobara chahiye)

```bash
curl "https://console.neon.tech/api/v2/projects/{project_id}/connection_uri?database_name=neondb&role_name=neondb_owner" \
  -H "Authorization: Bearer $NEON_API_KEY"
```

```env
DATABASE_URL=postgresql://neondb_owner:PASSWORD@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require
```

> Password reset karna ho: **Console → Branches → Roles → Reset password**, ya API se `POST /projects/{project_id}/branches/{branch_id}/roles/{role_name}/reset_password`

---

## 4. BRANCH — Create / List / Delete

Neon ka sabse bada feature: **instant Git-jaisi branching** (copy-on-write, poora data + schema clone milta hai).

```bash
# Create branch
curl -X POST "https://console.neon.tech/api/v2/projects/{project_id}/branches" \
  -H "Authorization: Bearer $NEON_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"branch": {"name": "dev-branch"}}'

# List branches
curl "https://console.neon.tech/api/v2/projects/{project_id}/branches" \
  -H "Authorization: Bearer $NEON_API_KEY"

# Delete branch
curl -X DELETE "https://console.neon.tech/api/v2/projects/{project_id}/branches/{branch_id}" \
  -H "Authorization: Bearer $NEON_API_KEY"
```

---

## 5. DATABASE — Table / Column / Data (CREATE, ALTER, DELETE, UPDATE)

**Ye sab kaam `NEON_API_KEY` se NAHI hota — connection string chahiye.**

### Terminal se (psql)
```bash
psql "$DATABASE_URL" -c "CREATE TABLE users (id serial primary key, name text, age int);"
psql "$DATABASE_URL" -c "ALTER TABLE users ADD COLUMN email text;"
psql "$DATABASE_URL" -c "ALTER TABLE users DROP COLUMN age;"
psql "$DATABASE_URL" -c "DROP TABLE users;"
```

### Schema file se (bulk)
```bash
psql "$DATABASE_URL" -f schema.sql
```

### Node.js se (`@neondatabase/serverless`)
```js
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

// Create
await sql`CREATE TABLE posts (id serial primary key, title text, body text)`;

// Alter — column add/drop
await sql`ALTER TABLE posts ADD COLUMN published boolean DEFAULT false`;
await sql`ALTER TABLE posts DROP COLUMN body`;

// Insert / Update / Delete
await sql`INSERT INTO posts (title) VALUES (${'Hello World'})`;
await sql`UPDATE posts SET published = true WHERE id = 1`;
await sql`DELETE FROM posts WHERE id = 1`;

// Select
const rows = await sql`SELECT * FROM posts`;
```

---

## 6. DATA API — Frontend/Agent se direct HTTP query (Supabase Auto-REST jaisa)

Data API kaam karne ke liye **Auth pehle enabled honi chahiye** (JWT verify karne ke liye) — warna `neon.ts` compile error dega.

### Enable karna
```bash
curl -X PATCH "https://console.neon.tech/api/v2/projects/{project_id}/branches/{branch_id}/data-api/{database_name}" \
  -H "Authorization: Bearer $NEON_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### RLS policy lagao (zaroori — warna sab locked/open reh jayega)
```sql
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own posts"
ON posts FOR SELECT
USING (auth.user_id() = user_id);
```

### JWT lo (Managed Better Auth se)
```bash
curl -X POST "https://{your-auth-url}/sign-in/email" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "yourpass"}'
# Set-Auth-Jwt header mein JWT milega
```

### PostgREST-style query (JWT ke sath)
```bash
# Select
curl "https://{data-api-endpoint}/rest/v1/posts?select=*" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Insert
curl -X POST "https://{data-api-endpoint}/rest/v1/posts" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "New Post"}'

# Update
curl -X PATCH "https://{data-api-endpoint}/rest/v1/posts?id=eq.1" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{"title": "Updated"}'

# Delete
curl -X DELETE "https://{data-api-endpoint}/rest/v1/posts?id=eq.1" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

> Note: Ye **table-based REST calls** hain (PostgREST-compatible) — raw arbitrary SQL nahi chalta yahan, bas filters/select/insert/update/delete syntax.

---

## 7. AUTH (Managed Better Auth) — Users, Sign-up, Sign-in

**Uses `NEON_API_KEY` for setup, phir apna khud ka Auth URL use hota hai.**

### Enable karna
```bash
curl -X POST "https://console.neon.tech/api/v2/projects/{project_id}/branches/{branch_id}/auth" \
  -H "Authorization: Bearer $NEON_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"auth_provider": "better_auth"}'
```

Response mein milega: `pub_client_key`, `secret_server_key`, `jwks_url`, `base_url` — **ye ek hi baar dikhte hain, save kar lo.**

### Config dekhna
```bash
curl "https://console.neon.tech/api/v2/projects/{project_id}/branches/{branch_id}/auth" \
  -H "Authorization: Bearer $NEON_API_KEY"
```

### User sign-up (frontend/agent se, Auth base_url pe)
```bash
curl -X POST "https://{your-auth-url}/sign-up/email" \
  -H "Content-Type: application/json" \
  -d '{"email": "user@email.com", "password": "Pass@123", "name": "User Name"}'
```

### Sign-in
```bash
curl -X POST "https://{your-auth-url}/sign-in/email" \
  -H "Content-Type: application/json" \
  -d '{"email": "user@email.com", "password": "Pass@123"}'
```

### Session/JWT lena
```bash
curl "https://{your-auth-url}/get-session" \
  -H "Cookie: <session-cookie-from-signin>"
```

> Users apne aap `neon_auth.users_sync` table mein sync ho jate hain tumhare hi Postgres database ke andar — koi alag auth database nahi.

---

## 8. STORAGE — S3-Compatible Buckets (Beta, sirf us-east-2)

### Bucket banana (CLI se — sabse aasan)
```bash
neon bucket create --name uploads --project-id {project_id} --access private
neon bucket list --project-id {project_id}
neon bucket delete --name uploads --project-id {project_id}
```

### Ya `neon.ts` (Infra-as-Code) se — production ke liye recommended
```ts
// neon.ts
import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  auth: true,
  dataApi: true,
  preview: {
    buckets: {
      uploads: {},                              // private by default
      "public-assets": { access: "public_read" },
    },
  },
});
```
```bash
neon deploy   # bucket provision + S3 credentials auto .env.local mein inject
```

Ye inject ho jayenge: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`

### Upload/Download (koi bhi S3 SDK se)
```ts
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({ forcePathStyle: true });
const bucket = "uploads";
const key = "files/hello.txt";

await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: "Hello World!" }));

const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 3600 });
console.log(`[view] ${url}`);
```

> Har **branch ka apna isolated bucket-snapshot** hota hai — jaise database branching, waise hi storage bhi copy-on-write branch karta hai.

---

## 9. FUNCTIONS — Serverless Node.js (Beta)

```ts
// neon.ts
export default defineConfig({
  preview: {
    functions: {
      api: {
        name: "API",
        source: "./functions/api.ts",
      },
    },
  },
});
```

```bash
neon deploy          # deploy to branch
neon dev             # local hot-reload dev
```

Functions branch ke sath hi deploy hote hain — koi timeout limit nahi (request/response + streaming/SSE dono support).

---

## 10. AI GATEWAY — Ek credential, sab models (Beta, paid plan required)

### Credential banana
```bash
curl -X POST "https://console.neon.tech/api/v2/projects/{project_id}/branches/{branch_id}/credentials" \
  -H "Authorization: Bearer $NEON_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"scopes": ["ai_gateway:invoke"], "principal_type": "user"}'
```

### Chat completion call (OpenAI-compatible endpoint, koi bhi model)
```bash
curl -X POST "https://{ai-gateway-host}/v1/chat/completions" \
  -H "Authorization: Bearer $NEON_AI_GATEWAY_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic/claude-sonnet-4-6",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

Anthropic, OpenAI, Google, Meta, Databricks, Alibaba — sab models isi ek credential se accessible.

---

## 11. 🔥 PRO TIP: `neon.ts` — Sab Kuch Ek File Mein (Full Automation)

Ye Neon ka sabse powerful part hai — Terraform jaisa IaC lekin TypeScript mein:

```ts
// neon.ts
import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  auth: true,
  dataApi: true,
  preview: {
    aiGateway: true,
    buckets: { uploads: {} },
    functions: {
      api: { name: "API", source: "./functions/api.ts" },
    },
  },
  branch: (branch) => {
    if (branch.isDefault) {
      return { protected: true };
    }
    return { ttl: "7d" }; // preview branches 7 din mein auto-expire
  },
});
```

```bash
neon config plan     # dry-run diff dekho
neon config apply    # ya seedha:
neon deploy           # sab provision + .env.local auto-fill
```

Ek command se: **DB + Auth + Data API + Storage + Functions + AI Gateway** — sab provision, aur credentials seedha `.env.local` mein.

---

## 12. FULL AUTOMATION SCRIPT (Bash, kisi bhi naye project ke liye)

```bash
#!/bin/bash
set -e

NEON_API_KEY="neon_api_key_..."
PROJECT_NAME="My App"

# 1. Create project
echo "Creating project..."
RESULT=$(curl -s -X POST "https://console.neon.tech/api/v2/projects" \
  -H "Authorization: Bearer $NEON_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"project\": {\"name\": \"$PROJECT_NAME\", \"region_id\": \"aws-us-east-2\"}}")

PROJECT_ID=$(echo $RESULT | python3 -c "import json,sys; print(json.load(sys.stdin)['project']['id'])")
BRANCH_ID=$(echo $RESULT | python3 -c "import json,sys; print(json.load(sys.stdin)['branches'][0]['id'])")
DATABASE_URL=$(echo $RESULT | python3 -c "import json,sys; print(json.load(sys.stdin)['connection_uris'][0]['connection_uri'])")
echo "Project: $PROJECT_ID"

# 2. Run schema (via real Postgres connection — NOT management API)
echo "Running schema..."
psql "$DATABASE_URL" -f schema.sql
echo "Schema done"

# 3. Enable Auth
echo "Enabling Auth..."
AUTH_RESULT=$(curl -s -X POST "https://console.neon.tech/api/v2/projects/$PROJECT_ID/branches/$BRANCH_ID/auth" \
  -H "Authorization: Bearer $NEON_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"auth_provider": "better_auth"}')
echo "Auth done"

# 4. Enable Data API
echo "Enabling Data API..."
curl -s -X PATCH "https://console.neon.tech/api/v2/projects/$PROJECT_ID/branches/$BRANCH_ID/data-api/neondb" \
  -H "Authorization: Bearer $NEON_API_KEY" -d '{}'
echo "Data API done"

# 5. Create storage bucket
echo "Creating bucket..."
neon bucket create --name uploads --project-id $PROJECT_ID
echo "Bucket done"

echo "=== ENV for .env.local ==="
echo "DATABASE_URL=$DATABASE_URL"
echo "NEON_API_KEY=$NEON_API_KEY"
```

---

## 📌 CREDENTIAL SUMMARY

| Credential | Kahan se milta hai | Kya kar sakta hai |
|---|---|---|
| `NEON_API_KEY` | Console → Account settings → API keys | Project/Branch/Auth/Storage/Data API/Functions/AI Gateway — sab **infra** control |
| Connection String | Project create response, ya `/connection_uri` endpoint | Table/Column create-alter-drop, saara data CRUD (SQL) |
| JWT Token | Auth sign-in/sign-up response | Data API se row-level CRUD (frontend/agent, RLS ke sath) |
| S3 Access Key + Secret | Bucket create pe auto-inject | Storage upload/download/delete |
| AI Gateway Credential | `/credentials` endpoint (scope: `ai_gateway:invoke`) | Chat completions / model calls |

> **⚠️ Rule:** `NEON_API_KEY` aur `secret_server_key` (Auth) kabhi frontend/client-side code mein mat dalna — sirf backend/CI-CD mein.

---

## 🔗 Important Links

| Cheez | Link |
|---|---|
| Neon Console (login/dashboard/API keys) | https://console.neon.tech/app |
| API Reference | https://api-docs.neon.tech/reference |
| Neon Docs | https://neon.com/docs/introduction |
| Data API Docs | https://neon.com/docs/data-api/overview |
| Auth Docs | https://neon.com/docs/auth/overview |
| Storage Docs | https://neon.com/docs/storage/overview |
| Functions Docs | https://neon.com/docs/reference/neon-ts |
| AI Gateway Docs | https://neon.com/docs/ai-gateway/overview |
| CLI (`neonctl`) | https://github.com/neondatabase/neonctl |
