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

let adminSupabaseInstance: SupabaseClient | null = null

export const getAdminSupabase = (): SupabaseClient => {
  if (!adminSupabaseInstance) {
    if (!import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase Service Role Key is missing in environment variables');
    }
    adminSupabaseInstance = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        }
      }
    )
  }
  return adminSupabaseInstance
}

export const supabase = getSupabase()
export const adminSupabase = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY ? getAdminSupabase() : null

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


