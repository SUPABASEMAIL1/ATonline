# 🔐 RLS Guide — Roman Urdu mein (Short & Easy)

---

## RLS kya hoti hai?

**RLS = Row Level Security**

Matlab — database ki **har row pe lock lagao** taake har user sirf **apna data** dekhe.

```
Bina RLS ke:   User A → sab ka data dekh sakta hai ❌
RLS ke saath:  User A → sirf apna data dekhe ✅
               User B → sirf apna data dekhe ✅
               Admin  → sab ka data dekhe ✅ (agar policy bani ho)
```

---

## Kaam kaise karta hai?

RLS **Policies** se kaam karta hai. Policy ek condition hoti hai jo har query pe automatically apply hoti hai.

**Misaal:**
```sql
-- Policy: har user sirf apna data dekhe
CREATE POLICY meri_policy ON "UsageLog"
  USING ("userId" = auth.uid()::text);
```

Jab User A query kare:
```sql
SELECT * FROM "UsageLog";
-- Supabase khud isko bana deta hai:
SELECT * FROM "UsageLog" WHERE "userId" = 'user-a-id';
```

> User ko pata bhi nahi chalta — database khud filter kar deta hai! 🤫

---

## Enable kab karo?

✅ **Hamesha enable karo jab:**
- Multi-user app ho (multiple users ka alag alag data ho)
- Supabase Anon Key frontend mein use ho rahi ho
- Sensitive data ho — API keys, orders, settings

> ⚠️ Supabase ki Anon Key browser mein visible hoti hai. RLS nahi hai toh koi bhi sab ka data nikal sakta hai!

---

## Disable kab karo?

❌ **Sirf tab disable karo jab:**
- Table sirf backend (service role) se access ho, kabhi frontend se nahi
- Public data ho — jaise city list jo sab ke liye same ho
- Sirf local testing kar rahe ho

> 🚫 Production mein kabhi disable mat karo sensitive tables par!

---

## Enable / Disable kaise karo?

```sql
-- Enable karo
ALTER TABLE "TableName" ENABLE ROW LEVEL SECURITY;

-- Disable karo
ALTER TABLE "TableName" DISABLE ROW LEVEL SECURITY;

-- Status check karo
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public';
```

---

## Policy banana — 4 common patterns

### 1. Apna data sirf apna (sabse zyada use)
```sql
CREATE POLICY own_data ON "TableName"
  USING (userid = auth.uid()::text)
  WITH CHECK (userid = auth.uid()::text);
```

### 2. Admin sab kuch dekhe
```sql
CREATE POLICY admin_read ON "TableName"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = auth.uid()::text AND u.role = 'admin'
    )
  );
```

### 3. Sab read kar sakein (public data)
```sql
CREATE POLICY public_read ON "TableName"
  FOR SELECT
  USING (true);
```

### 4. Policy delete karo
```sql
DROP POLICY IF EXISTS policy_name ON "TableName";
```

---

## Is project ki policies (summary)

| Table | Normal User | Admin |
|-------|------------|-------|
| `User` | Sab read ✅, sirf apna write 🔒 | Same |
| `UsageLog` | Sirf apna 🔒 | Sab read ✅ |
| `UserSettings` | Sirf apna 🔒 | Sirf apna 🔒 |
| `BookedHistory` | Sirf apna 🔒 | Sirf apna 🔒 |
| `Customer` | Sirf apna 🔒 | Sab read ✅ |

---

## Useful Commands

```sql
-- Sab policies dekho
SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname='public';

-- Kisi table ki policies dekho
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename='UsageLog';
```

---

## Naya Table banao — Checklist

```
[ ] SUPER_MASTER_SCHEMA.sql mein table banao
[ ] Management API (`sbp_` token) ke zariye SQL query push karo
[ ] RLS enable karo:  ALTER TABLE "NewTable" ENABLE ROW LEVEL SECURITY;
[ ] Own-data policy banao
[ ] Admin policy banao (agar admin ko sab chahiye)
[ ] 2 alag users se test karo
```

---

## Common Problems & Fix

| Problem | Wajah | Fix |
|---------|-------|-----|
| Admin ko sab data nahi mil raha | Policy strict hai | Admin ke liye alag SELECT policy banao |
| Data save nahi ho raha | WITH CHECK fail | userId column mein auth.uid() match karo |
| Supabase 404 error | RLS block kar raha hai | Console dekho, policy check karo |
| Sab users ka data dikh raha hai | RLS off hai | `ALTER TABLE ENABLE ROW LEVEL SECURITY` |

---

*Zaynahs Courier Manager — 2026*
