#!/usr/bin/env bash
# Apply the §2.1.4 signed-token permission migrations to the jeanzone DB.
# PREREQUISITE: unpause the Supabase project (Dashboard) — DB is currently PAUSED (544).
set -euo pipefail
cd "$(dirname "$0")"

REF="genmpxcnmdcfwwymjibd"
# Read the Management API token from .env.local (SUPABASE_MGMT_API_KEY=sbp_...)
SB="$(grep -E '^SUPABASE_MGMT_API_KEY=' .env.local | head -1 | cut -d= -f2-)"
[ -z "$SB" ] && { echo "SUPABASE_MGMT_API_KEY not found in .env.local"; exit 1; }

URL="https://api.supabase.com/v1/projects/${REF}/database/query"

apply() {
  local f="$1"
  echo "==> Applying $f"
  # Wrap SQL as a single JSON query string.
  local body
  body="$(jq -Rs --arg q "$(cat "$f")" '{query: $q}')"
  local resp
  resp="$(curl -s -m 60 -w "\nHTTP_STATUS:%{http_code}" "$URL" \
    -H "Authorization: Bearer $SB" \
    -H "Content-Type: application/json" \
    -d "$body")"
  echo "$resp"
  if echo "$resp" | grep -q "HTTP_STATUS:5\|HTTP_STATUS:4"; then
    echo "!! FAILED on $f — aborting. Fix and re-run."; exit 1
  fi
}

# Order matters: 2000 defines guard functions + guarded RPCs, 2001 guards table writes.
apply "supabase/migrations/20260820000000_rpc_action_guard.sql"
apply "supabase/migrations/20260820010000_table_write_guard.sql"
echo "DONE — §2.1.4 permission system applied."
