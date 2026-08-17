#!/bin/bash
set -e

source .env.local

QUERY_URL="https://api.supabase.com/v1/projects/$SUPABASE_REF/database/query"
HEADERS=(-H "Authorization: Bearer $SUPABASE_MGMT_API_KEY" -H "Content-Type: application/json")

run_query() {
  local query="$1"
  local json_payload=$(python3 -c "import json,sys; print(json.dumps({'query': sys.argv[1]}))" "$query")
  
  curl -s -X POST "$QUERY_URL" "${HEADERS[@]}" -d "$json_payload"
}

echo "=== Running reconcile_now() ==="
run_query "SELECT reconcile_now();"

echo -e "\n=== Checking invariant_violations view (I1, I2, I5) ==="
run_query "SELECT * FROM invariant_violations;"

echo -e "\n=== Checking I4: sale <=> stock exactly once ==="
run_query "select id from sales s where (select count(*) from stock_history where type='sale' and reference_id=s.id) != jsonb_array_length(s.items);"

echo -e "\n=== Checking I6: online order stock effect is zero until converted ==="
run_query "select id from store_orders where status != 'converted' and id in (select reference_id from stock_history where type='store_order');"
