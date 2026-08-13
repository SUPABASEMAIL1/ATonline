import os
import json
import urllib.request
import urllib.parse

# Get JeanZone credentials
env_file = "env_backups/1_jeanzone.env.local"
with open(env_file, "r") as f:
    lines = f.readlines()

mgmt_key = None
ref = None
for line in lines:
    if line.startswith("SUPABASE_MGMT_API_KEY="):
        mgmt_key = line.strip().split("=")[1].strip('"').strip("'")
    if line.startswith("SUPABASE_REF="):
        ref = line.strip().split("=")[1].strip('"').strip("'")

def run_query(query):
    url = f"https://api.supabase.com/v1/projects/{ref}/database/query"
    headers = {
        "Authorization": f"Bearer {mgmt_key}",
        "Content-Type": "application/json"
    }
    data = json.dumps({"query": query}).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as response:
            res = json.loads(response.read().decode("utf-8"))
            return res
    except urllib.error.HTTPError as e:
        print(f"Error: {e.read().decode('utf-8')}")
        return None

# 1. Total Public Tables
tables = run_query("SELECT tablename FROM pg_tables WHERE schemaname = 'public';")
total_tables = len(tables)
table_names = [t["tablename"] for t in tables]

# 2. Realtime Tables
realtime_tables = run_query("SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';")
realtime_table_names = [t["tablename"] for t in realtime_tables]

# 3. RLS Enabled Tables
rls_tables = run_query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true;")
rls_table_names = [t["tablename"] for t in rls_tables]

# 4. List of Policies
policies = run_query("SELECT tablename, policyname, roles, cmd FROM pg_policies WHERE schemaname = 'public';")

print(f"--- DB ANALYSIS REPORT ---")
print(f"Total Public Tables: {total_tables}")
print(f"Realtime Enabled Tables: {len(realtime_table_names)} out of {total_tables}")
print(f"Non-Realtime Tables: {total_tables - len(realtime_table_names)}")
print(f"RLS Enabled Tables: {len(rls_table_names)} out of {total_tables}")
print(f"Total Policies: {len(policies)}")
print("\n--- Realtime Tables ---")
for t in realtime_table_names:
    print(f"- {t}")

print("\n--- Non-Realtime Tables ---")
for t in table_names:
    if t not in realtime_table_names:
        print(f"- {t}")

print("\n--- RLS Status ---")
for t in table_names:
    status = "ON" if t in rls_table_names else "OFF"
    pol_count = len([p for p in policies if p["tablename"] == t])
    print(f"- {t}: RLS {status} ({pol_count} policies)")

