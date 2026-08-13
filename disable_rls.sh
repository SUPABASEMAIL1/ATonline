#!/bin/bash
QUERY_JSON='{"query": "DROP POLICY IF EXISTS \"Allow public read on stock_history\" ON stock_history; DROP POLICY IF EXISTS \"Allow authenticated insert on stock_history\" ON stock_history; DROP POLICY IF EXISTS \"Allow service_role ALL on stock_history\" ON stock_history; ALTER TABLE stock_history DISABLE ROW LEVEL SECURITY; DROP POLICY IF EXISTS \"Allow public read on variant_stock_history\" ON variant_stock_history; DROP POLICY IF EXISTS \"Allow authenticated insert on variant_stock_history\" ON variant_stock_history; DROP POLICY IF EXISTS \"Allow service_role ALL on variant_stock_history\" ON variant_stock_history; ALTER TABLE variant_stock_history DISABLE ROW LEVEL SECURITY; DROP POLICY IF EXISTS \"Allow public read on row_tombstones\" ON row_tombstones; DROP POLICY IF EXISTS \"Allow service_role insert on row_tombstones\" ON row_tombstones; ALTER TABLE row_tombstones DISABLE ROW LEVEL SECURITY;"}'

for env_file in env_backups/*.env.local*; do
  if [ -f "$env_file" ]; then
    echo "Disabling RLS for $env_file..."
    REF=$(grep "VITE_SUPABASE_URL" "$env_file" | awk -F'//' '{print $2}' | awk -F'.' '{print $1}')
    KEY=$(grep "SUPABASE_MGMT_API_KEY" "$env_file" | awk -F'=' '{print $2}' | tr -d '"')
    
    if [ -n "$REF" ] && [ -n "$KEY" ]; then
      curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
        -H "Authorization: Bearer $KEY" \
        -H "Content-Type: application/json" \
        -d "$QUERY_JSON" > /dev/null
      echo "Success for $REF"
    fi
  fi
done
