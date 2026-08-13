#!/bin/bash
SCHEMA_SQL=$(cat supabase/schema/SUPER_MASTER_SCHEMA.sql)
# Escape the JSON properly for curl
SCHEMA_JSON=$(python3 -c "import json,sys; print(json.dumps({'query': sys.stdin.read()}))" <<< "$SCHEMA_SQL")

for env_file in env_backups/*.env.local*; do
  if [ -f "$env_file" ]; then
    echo "Updating database for $env_file..."
    # Extract SUPABASE_REF and SUPABASE_MGMT_API_KEY from the file
    REF=$(grep "VITE_SUPABASE_URL" "$env_file" | awk -F'//' '{print $2}' | awk -F'.' '{print $1}')
    KEY=$(grep "SUPABASE_MGMT_API_KEY" "$env_file" | awk -F'=' '{print $2}' | tr -d '"')
    
    if [ -n "$REF" ] && [ -n "$KEY" ]; then
      curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
        -H "Authorization: Bearer $KEY" \
        -H "Content-Type: application/json" \
        -d "$SCHEMA_JSON" > /dev/null
      echo "Success for $REF"
    else
      echo "Could not find REF or KEY in $env_file"
    fi
  fi
done
