import { createClient, SupabaseClient } from '@supabase/supabase-js'

let supabaseInstance: SupabaseClient | null = null

export const getSupabase = (): SupabaseClient => {
  if (!supabaseInstance) {
    supabaseInstance = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          storageKey: 'zaynah-pos-auth',
        },
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
        global: {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
          },
        },
      }
    )
  }
  return supabaseInstance
}

export const supabase = getSupabase()

/**
 * Server-side admin user operations are handled by the `admin-users` Edge Function
 * (supabase/functions/admin-users). The service-role key lives ONLY on the server
 * (Deno.env) and is NEVER shipped to the browser bundle. Client code must call this
 * helper — never instantiate an admin client with VITE_SUPABASE_SERVICE_ROLE_KEY.
 */
export async function adminUserAction(action: string, payload: any): Promise<any> {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action, payload },
  })
  if (error) throw new Error(error.message || 'Admin user action failed');
  return (data as any)?.data
}

// ── Refresh token management (prevents retry storm on DNS failure) ─────────
const AUTH_KEY = 'sb-zaynah-pos-auth-auth-token';
const AUTH_BACKUP_KEY = 'sb-zaynah-pos-auth-auth-token-backup';

export function restoreRefreshToken() {
  const backup = localStorage.getItem(AUTH_BACKUP_KEY);
  if (backup) {
    localStorage.setItem(AUTH_KEY, backup);
    localStorage.removeItem(AUTH_BACKUP_KEY);
    console.log('[Auth] Restored refresh token from backup');
    return true;
  }
  return false;
}

export function isRefreshTokenBackedUp(): boolean {
  return !!localStorage.getItem(AUTH_BACKUP_KEY);
}

/** Re-enables full Supabase auth initialization (undoes the retry-storm guard). */
export function enableFullAuthInit() {
  delete (supabase.auth as any)._initCalled;
  restoreRefreshToken();
  supabase.auth.getSession().catch(() => {});
  supabase.auth.startAutoRefresh?.().catch(() => {});
}


