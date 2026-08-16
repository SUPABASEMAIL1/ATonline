// Supabase Edge Function — server-side admin user operations.
// The service-role key lives ONLY here (Deno.env), never in the browser bundle.
// Client calls this via supabase.functions.invoke('admin-users', ...) — see src/lib/supabase.ts.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const url = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { action, payload } = await req.json()

    let result: any
    if (action === 'deleteUser') {
      result = await admin.auth.admin.deleteUser(payload.id)
    } else if (action === 'createUser') {
      result = await admin.auth.admin.createUser(payload)
    } else if (action === 'updateUser') {
      result = await admin.auth.admin.updateUserById(payload.id, payload.updates)
    } else {
      return new Response(JSON.stringify({ error: 'unknown action: ' + action }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    if (result.error) {
      return new Response(JSON.stringify({ error: result.error.message }), {
        status: 400,
        headers: corsHeaders,
      })
    }
    return new Response(JSON.stringify({ data: result.data }), {
      status: 200,
      headers: corsHeaders,
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || String(e) }), {
      status: 500,
      headers: corsHeaders,
    })
  }
})
