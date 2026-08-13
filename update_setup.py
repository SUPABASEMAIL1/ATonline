import re

with open("docs/setup.md", "r") as f:
    content = f.read()

# Replace the Realtime section
old_realtime = r"### 2. Supabase Realtime \(WebSockets\).*?### 3. Row-Level Security \(RLS\) & Permissions"
new_realtime = """### 2. Supabase Realtime (WebSockets)
POS multi-device support (e.g. 5 cashiers ek sath) ke liye **Supabase Realtime** use karta hai.
- **Client Side:** `syncEngine.ts` mein Supabase JS SDK ke zariye `.channel('public:*').on('postgres_changes', ...).subscribe()` setup kiya gaya hai.
- **Flow:** Jaise hi kisi device se koi row insert/update/delete hoti hai, cloud baqi sabhi connected devices ko milliseconds mein event push kar deta hai, jise local IndexedDB (Dexie) mein save karke React state update kar di jati hai.

> ⚠️ **MANDATORY REALTIME AUDIT RULE (For AI Agents):**
> Har naye clone/project setup ke baad, yeh verification lazmi hai:
> - **Total Tables:** 29 (in public schema)
> - **Realtime ENABLED (24 Tables):** `app_settings`, `categories`, `customers`, `suppliers`, `products`, `discounts`, `users`, `sales`, `expenses`, `sales_tabs`, `purchase_records`, `purchase_orders`, `purchase_order_items`, `supplier_transactions`, `payments`, `stock_history`, `bundles`, `bundle_items`, `bundle_slots`, `bundle_slot_options`, `variant_stock_history`, `product_addons`, `store_orders`, `salesmen`.
> - **Realtime DISABLED (5 Tables):** `product_batches`, `toppings`, `product_toppings`, `bundle_slot_toppings`, `row_tombstones`.
> - *Strict Rule:* Naya agent lazmi Management API se `pg_publication_tables` query kar ke check kare ke exact 24 tables `supabase_realtime` publication mein available hain.

### 3. Row-Level Security (RLS) & Permissions"""

content = re.sub(old_realtime, new_realtime, content, flags=re.DOTALL)

# Replace the RLS section
old_rls = r"### 3. Row-Level Security \(RLS\) & Permissions.*?### 4. The F21/F22 Tombstone Architecture"
new_rls = """### 3. Row-Level Security (RLS) & Permissions
Kyunke Zaynahs POS ek **single-tenant** system hai (1 clone = 1 shop), hum complex Auth/RLS rules par rely nahi karte.
- **Access Level:** Har table par `GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;` run kiya jata hai. Default tor par saari tables par RLS off hai.

> ⚠️ **MANDATORY RLS AUDIT RULE (For AI Agents):**
> System ke F21/F22 rules (Financial Integrity) ke tahat, 29 tables mein se strictly sirf **3 tables** par RLS Policies ACTIVE honi chahiye:
> 1. `stock_history`
> 2. `variant_stock_history`
> 3. `row_tombstones`
>
> **Policy Logic for these 3 tables:**
> - `Public / Anon`: Sirf `SELECT` (Read) allowed hai.
> - `Authenticated / Anon`: `INSERT` allowed hai.
> - `Service_Role`: `ALL` (CRUD) operations allowed hain.
> - *Strict Rule:* In 3 tables par koi device/client kabhi `UPDATE` ya `DELETE` nahi kar sakta. Agar naya clone deploy ho raha hai, toh AI agent Management API se `pg_tables` mein `rowsecurity = true` verify kare. Agar 3 ke ilawa kisi table par RLS active mila toh connection errors ayenge.

### 4. The F21/F22 Tombstone Architecture"""

content = re.sub(old_rls, new_rls, content, flags=re.DOTALL)

with open("docs/setup.md", "w") as f:
    f.write(content)

print("setup.md updated successfully")
