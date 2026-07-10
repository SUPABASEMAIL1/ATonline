import React, { createContext, useContext, useState, useEffect } from 'react';
import { User as SupabaseUser, Session } from '@supabase/supabase-js'
import { supabase, enableFullAuthInit } from '../lib/supabase'
import { User } from '../types'
import { usersService } from '../lib/services'
import { sonner } from '../lib/sonner'
import { localDb } from '../lib/localDb'

interface AuthContextType {
  user: SupabaseUser | null
  profile: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, name: string, username: string) => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (updates: Partial<User>) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  refreshProfile: () => Promise<void>
  isRecoveringPassword: boolean
  setIsRecoveringPassword: (value: boolean) => void
}
const AuthContext = createContext<AuthContextType | undefined>(undefined)

export async function hashPasswordString(password: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const msgBuffer = new TextEncoder().encode(password);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      console.warn('crypto.subtle.digest failed, using fallback hash');
    }
  }

  // Fallback for HTTP (non-secure context, e.g., local IP on tablet)
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return 'fb_' + Math.abs(hash).toString(16);
}

// Helper function to convert auth error messages to user-friendly text
function getAuthErrorMessage(errorMessage: string): string {
  if (errorMessage.includes('Invalid login credentials')) {
    return 'Invalid email or password. Please check your credentials and try again.'
  }
  if (errorMessage.includes('Email not confirmed')) {
    return 'Please check your email and click the confirmation link to activate your account.'
  }
  if (errorMessage.includes('User already registered')) {
    return 'An account with this email already exists. Please sign in instead.'
  }
  if (errorMessage.includes('Password should be at least')) {
    return 'Password must be at least 6 characters long.'
  }
  if (errorMessage.includes('Invalid email')) {
    return 'Please enter a valid email address.'
  }
  if (errorMessage.includes('Too many requests')) {
    return 'Too many attempts. Please wait a few minutes before trying again.'
  }
  if (errorMessage.includes('Network error') || errorMessage.includes('Failed to fetch') || errorMessage.includes('Load failed')) {
    return 'Network connection issue. Please check your internet connection.'
  }
  // Default fallback message
  return 'An unexpected error occurred. Please try again.'
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [profile, setProfile] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false)

  useEffect(() => {
    // ── Session Expiry: 7 days, ONLY at 5:00 AM ──────────────────────────
    // Prevents mid-shift logout. Expires on the first 5 AM >= 7 days after login.
    const checkSessionExpiry = () => {
      const loginTimestamp = localStorage.getItem('pos_session_start');
      if (!loginTimestamp) return;

      const loginDate = new Date(loginTimestamp);
      const now = new Date();
      const daysDiff = (now.getTime() - loginDate.getTime()) / (1000 * 60 * 60 * 24);

      // Only expire if 7+ days have passed AND it is currently 5:00 AM or later
      const sevenDaysPassed = daysDiff >= 7;
      const past5AM = now.getHours() >= 5;

      if (sevenDaysPassed && past5AM) {
        localStorage.removeItem('pos_session_start');
        localStorage.removeItem('pos_offline_profile');
        supabase.auth.signOut();
        sonner.error('Your weekly session has expired. Please sign in again.');
      }
    };

    checkSessionExpiry();
    // Check every 60 seconds to catch the 5 AM boundary accurately
    const expiryTimer = setInterval(checkSessionExpiry, 60_000);

    // ── PREVENT RETRY STORM ────────────────────────────────────────────────
    // ROOT CAUSE: gotrue-js's _initialize() always calls _recoverAndRefresh()
    // which calls _refreshAccessToken() → retryable() → infinite DNS retries.
    // stopAutoRefresh() only stops the TIMER ticker, NOT this initial flow.
    //
    // FIX: Mark the auth client as "already initialized" BEFORE getSession()
    // or onAuthStateChange() trigger _initialize(). This guarantees ZERO
    // network calls from the auth client — _initialize() returns immediately.
    // The session is read directly from localStorage instead.
    // Proper initialization happens reactively on first successful Supabase
    // response (loadProfile success, syncToCloud success).
    (supabase.auth as any)._initCalled = true;
    supabase.auth.stopAutoRefresh?.().catch(() => {});

    const AUTH_KEY = 'sb-zaynah-pos-auth-auth-token';
    function readStoredSession(): Session | null {
      try {
        const raw = localStorage.getItem(AUTH_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as Session;
      } catch { return null; }
    }

    // Get initial session — read from localStorage directly, ZERO network calls
    const initSession = () => {
      // OFFLINE FAST PATH: If offline and we have a cached profile, use it immediately
      if (!navigator.onLine) {
        const cached = localStorage.getItem('pos_offline_profile');
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed.lastLogin) parsed.lastLogin = new Date(parsed.lastLogin);
            console.log('⚡ Offline fast-path: restored profile from cache');
            setProfile(parsed);
            setUser({ id: parsed.id, email: parsed.email } as any);
            setLoading(false);
            return;
          } catch (e) {
            console.warn('Failed to parse offline cache, falling through to localStorage session');
          }
        }
      }

      // Read session from localStorage — guarantees zero network
      const storedSession = readStoredSession();
      setSession(storedSession ?? null);
      setUser(storedSession?.user ?? null);

      if (storedSession?.user) {
        loadProfile(storedSession.user.id);
        setLoading(false);
      } else {
        // No stored session — try the offline profile cache
        const cached = localStorage.getItem('pos_offline_profile');
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed.lastLogin) parsed.lastLogin = new Date(parsed.lastLogin);
            console.log('⏱️ No auth session — using cached profile');
            setProfile(parsed);
            setUser({ id: parsed.id, email: parsed.email } as any);
          } catch (e) { /* ignore parse errors */ }
        }
        setLoading(false);
      }
    };
    initSession();

    // Listen for auth changes (safe: _initCalled prevents retry storm)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveringPassword(true);
      }

      // SESSION GUARD: Preserve cached profile when the session refresh fails
      // (e.g. "Invalid Refresh Token" when project credentials changed, or DNS failure).
      // Prevents UI flicker while offline hash re-login runs.
      if (!session?.user) {
        const cached = localStorage.getItem('pos_offline_profile');
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed.lastLogin) parsed.lastLogin = new Date(parsed.lastLogin);
            console.log('[Auth] Session lost — keeping cached profile alive');
            setProfile(parsed);
            setUser({ id: parsed.id, email: parsed.email } as any);
            setSession(null);
            setLoading(false);
            return;
          } catch (e) { /* ignore parse errors */ }
        }
      }

      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    // OFFLINE/ONLINE EVENT LISTENERS: Stop/restart Supabase internal retry storms
    const handleOnline = () => {
      console.log('[Auth] Online — restoring auth init.');
      enableFullAuthInit();
    };
    const handleOffline = () => {
      console.log('[Auth] Offline — stopping auto-refresh to prevent retry storm.');
      supabase.auth.stopAutoRefresh?.().catch(() => {});
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      subscription.unsubscribe();
      clearInterval(expiryTimer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [])


  async function loadProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (error) throw error

      if (data) {
        if (data.active === false) {
          // Immediately block access and force sign out if account is deactivated
          await signOut();
          sonner.error('Your account has been deactivated by an administrator.');
          return;
        }

        const pData = data as any;
        const profileData: User = {
          id: pData.id,
          username: pData.username,
          name: pData.name,
          email: pData.email,
          role: pData.role as any,
          permissions: pData.permissions || [],
          canEditPrice: !!pData.can_edit_price,
          canGiveDiscount: !!pData.can_give_discount,
          canDeleteSale: !!pData.can_delete_sale,
          canViewProfit: !!pData.can_view_profit,
          canManageStock: !!pData.can_manage_stock,
          canManagePO: !!pData.can_manage_po,
          canViewRecords: !!pData.can_view_records,
          canEditSale: !!pData.can_edit_sale,
          active: pData.active ?? true,
          lastLogin: pData.last_login ? new Date(pData.last_login) : undefined,
          avatar: pData.avatar || undefined
        };

        setProfile(profileData);
        localStorage.setItem('pos_offline_profile', JSON.stringify(profileData));
        localDb.users.put(profileData).catch(() => { });
        // Supabase is reachable — re-enable proper auth init
        enableFullAuthInit();
      } else {
        // [STRICT CHECK] If online and no profile found in public.users, the user is likely deleted
        if (navigator.onLine) {
          console.warn(`[Auth] User ${userId} not found on server. Forcing logout.`);
          await signOut();
          sonner.error('Session Invalid', 'Your account no longer exists. Please sign in again.');
        } else {
          // Offline fallback is still okay if we were ALREADY logged in
          const cached = localStorage.getItem('pos_offline_profile');
          if (cached) {
            const parsed = JSON.parse(cached);
            setProfile(parsed);
          }
        }
      }
    } catch (error: any) {
      console.error('Error loading profile:', error)

      // OFFLINE FALLBACK:
      const isOfflineError = !navigator.onLine || error?.toString().includes('Failed to fetch');
      if (isOfflineError) {
        const cached = localStorage.getItem('pos_offline_profile');
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed.lastLogin) parsed.lastLogin = new Date(parsed.lastLogin);
            console.log('Restored profile from offline cache.');
            setProfile(parsed);
            setUser({ id: parsed.id, email: parsed.email } as any);
            return; // Successfully recovered!
          } catch (e) {
            console.error('Failed to parse offline profile cache.');
          }
        }
      }

      // TOKEN REFRESH: If the session token is stale, try refreshing before showing error
      const isNetworkError = !navigator.onLine || error?.toString().includes('Failed to fetch') || error?.toString().includes('ERR_NAME_NOT_RESOLVED');
      if (!isNetworkError) {
        try {
          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError && refreshData?.user) {
            const { data: retryData, error: retryError } = await supabase
              .from('users')
              .select('*')
              .eq('id', userId)
              .maybeSingle();
            if (!retryError && retryData) {
              const pData = retryData as any;
              const profileData: User = {
                id: pData.id, username: pData.username, name: pData.name, email: pData.email,
                role: pData.role as any, permissions: pData.permissions || [],
                canEditPrice: !!pData.can_edit_price, canGiveDiscount: !!pData.can_give_discount,
                canDeleteSale: !!pData.can_delete_sale, canViewProfit: !!pData.can_view_profit,
                canManageStock: !!pData.can_manage_stock, canManagePO: !!pData.can_manage_po,
                canViewRecords: !!pData.can_view_records, canEditSale: !!pData.can_edit_sale,
                active: pData.active ?? true, lastLogin: pData.last_login ? new Date(pData.last_login) : undefined,
                avatar: pData.avatar || undefined
              };
              setProfile(profileData);
              localStorage.setItem('pos_offline_profile', JSON.stringify(profileData));
              return;
            }
          }
        } catch (_) {
          // Refresh failed — fall through to cached profile
        }
      }

      // If offline, silently use cached profile without error toast
      if (isNetworkError) {
        const cached = localStorage.getItem('pos_offline_profile');
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed.lastLogin) parsed.lastLogin = new Date(parsed.lastLogin);
            console.log('[Auth] Offline — using cached profile silently.');
            setProfile(parsed);
            setUser({ id: parsed.id, email: parsed.email } as any);
            return;
          } catch (e) { /* ignore */ }
        }
        // No cached profile either — just warn silently, no toast
        console.warn('[Auth] Offline and no cached profile available.');
        return;
      }

      sonner.error('Failed to load user profile. Please try logging in again.');
    } finally {
      setLoading(false)
    }
  }

  async function signIn(identifier: string, password: string) {
    setLoading(true)
    try {
      const rawIdentifier = String(identifier || '').trim();
      let loginEmail = rawIdentifier;
      const normalizedIdentifier = rawIdentifier.toLowerCase();

      // Resolve Username to Email
      if (!rawIdentifier.includes('@')) {
        console.log(`[Auth] Resolving username: ${rawIdentifier}`);

        // Step 1: Check Local SQLite Cache (Fast & Offline-Ready)
        try {
          const allLocalUsers = await import('../lib/localDb').then(m => m.localDb.users.toArray());
          const matchedLocal = allLocalUsers.find(
            u => u.username?.toLowerCase() === normalizedIdentifier ||
              u.email?.toLowerCase() === normalizedIdentifier
          );
          if (matchedLocal?.email && matchedLocal.email.trim() !== '') {
            console.log('✅ Resolved from local cache:', matchedLocal.email);
            loginEmail = matchedLocal.email;
          } else {
            loginEmail = `${normalizedIdentifier}@zaynahs.local`;
          }
        } catch (e) {
          console.warn('Local resolution failed:', e);
          loginEmail = `${normalizedIdentifier}@zaynahs.local`;
        }

        // Step 2: Check Cloud for username->email mapping (policy-safe)
        if (navigator.onLine) {
          try {
            console.log(`[Auth] Attempting cloud resolution for: ${rawIdentifier}`);
            const { data: rpcEmail, error: rpcError } = await supabase
              .rpc('resolve_login_email', { p_username: rawIdentifier });

            if (!rpcError && rpcEmail) {
              console.log('✅ Resolved via RPC:', rpcEmail);
              loginEmail = rpcEmail;
            } else {
              console.warn('[Auth] RPC lookup failed or returned null. Trying fallback convention.');
              loginEmail = `${normalizedIdentifier}@zaynahs.local`;
            }
          } catch (lookupErr) {
            console.warn('[Auth] Cloud lookup crashed:', lookupErr);
            loginEmail = `${normalizedIdentifier}@zaynahs.local`;
          }
        }

        // We allow the dummy email to pass through so users can log in via username.
        // If it's incorrect, Supabase Auth will simply reject it with invalid credentials.
      }

      console.log(`[Auth] Final Login Email: ${loginEmail}`);

      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      })
      if (error) throw error

      // Calculate the hash and stash it so when profile loads / loadData seed runs, it propagates
      const hash = await hashPasswordString(password);
      console.log(`[Auth] Saving offline hash for ${loginEmail}`);
      localStorage.setItem(`offline_hash_${loginEmail}`, hash);

      try {
        if (authData.user) {
          // AGGRESSIVE SAVE: Even if the full profile isn't here yet, we save the ID + Email + Hash
          // This acts as a fallback so offline login works even before the first sync completes.
          await localDb.users.put({
            id: authData.user.id,
            email: loginEmail,
            name: loginEmail.split('@')[0], // Satisfy not-null constraint
            offlineHash: hash,
            role: 'cashier', // Default fallback
            active: true,
            username: loginEmail.split('@')[0]
          });
          console.log('✅ Offline credentials pre-seeded.');

          // Sync hash to remote for future "new device" offline support
          supabase.from('users').update({ offline_hash: hash }).eq('id', authData.user.id)
            .then(({ error }) => {
              if (error) console.warn('Failed to sync offline hash to cloud:', error);
              else console.log('✅ Cloud offline hash updated.');
            });
        }
      } catch (e) {
        console.error('Failed to pre-seed offline credentials:', e);
      }

      // Show success toast with our styled config
      sonner.success('Welcome back! You have successfully signed in.');
      // Store session start time for monthly expiry check
      if (!localStorage.getItem('pos_session_start')) {
        localStorage.setItem('pos_session_start', new Date().toISOString());
      }
    } catch (error: any) {
      // OFFLINE LOGIN FALLBACK
      const errorStr = error?.toString() || '';
      const isOfflineError = !navigator.onLine ||
        errorStr.includes('Failed to fetch') ||
        errorStr.includes('Load failed') ||
        error.message?.includes('network');

      if (isOfflineError) {
        console.warn('Network offline, attempting offline login via localDb...');
        try {
          const lowerIdentifier = identifier.toLowerCase();

          // No workspace mapping check needed for single tenant mode

          const allLocalUsers = await localDb.users.toArray();

          const matchedUser = allLocalUsers.find(
            u => u.email?.toLowerCase() === lowerIdentifier ||
              u.username?.toLowerCase() === lowerIdentifier
          );

          if (matchedUser) {
            if (matchedUser.active === false) {
              sonner.error('Account deactivated. Cannot login offline.');
              setLoading(false);
              return; // Return instead of throw to avoid double toast
            }

            // Validate Offline Password
            const enteredHash = await hashPasswordString(password);

            // Get stored hash from multiple sources for resilience
            let storedHash = (matchedUser as any).offlineHash;
            if (!storedHash) {
              // Fallback 1: Check localStorage by email
              storedHash = localStorage.getItem(`offline_hash_${matchedUser.email}`);
            }
            if (!storedHash) {
              // Fallback 2: Check localStorage by identifier (might be username)
              storedHash = localStorage.getItem(`offline_hash_${identifier}`);
            }

            if (!storedHash) {
              sonner.error('No offline credentials found. You must login online once to enable offline access.');
              setLoading(false);
              return;
            }

            if (storedHash !== enteredHash) {
              sonner.error('Wrong password. Please try again.');
              setLoading(false);
              return;
            }

            // Update the localDb entry with the hash if it was missing
            if (!(matchedUser as any).offlineHash && storedHash) {
              try {
                (matchedUser as any).offlineHash = storedHash;
                await localDb.users.put(matchedUser);
              } catch (e) { /* ignore */ }
            }

            setProfile(matchedUser as User);
            setUser({ id: matchedUser.id, email: matchedUser.email } as SupabaseUser);

            localStorage.setItem('pos_offline_profile', JSON.stringify(matchedUser));
            if (!localStorage.getItem('pos_session_start')) {
              localStorage.setItem('pos_session_start', new Date().toISOString());
            }

            setLoading(false);
            sonner.success('Offline Welcome! Logged in using local cache.');
            return;
          } else {
            // Fallback: Try pos_offline_profile from localStorage
            const cachedProfile = localStorage.getItem('pos_offline_profile');
            if (cachedProfile) {
              try {
                const parsed = JSON.parse(cachedProfile);
                const pEmail = (parsed.email || '').toLowerCase();
                const pUsername = (parsed.username || '').toLowerCase();
                if (pEmail === lowerIdentifier || pUsername === lowerIdentifier) {
                  const enteredHash = await hashPasswordString(password);
                  let sHash = parsed.offlineHash || localStorage.getItem(`offline_hash_${parsed.email}`);
                  if (sHash && sHash === enteredHash) {
                    if (parsed.lastLogin) parsed.lastLogin = new Date(parsed.lastLogin);
                    setProfile(parsed as User);
                    setUser({ id: parsed.id, email: parsed.email } as SupabaseUser);
                    localStorage.setItem('pos_session_start', new Date().toISOString());
                    setLoading(false);
                    sonner.success('Offline Welcome! Logged in from cached profile.');
                    return;
                  } else if (!sHash) {
                    sonner.error('No offline credentials found. You must login online once to enable offline access.');
                    setLoading(false);
                    return;
                  } else {
                    sonner.error('Wrong password. Please try again.');
                    setLoading(false);
                    return;
                  }
                }
              } catch (e) { /* ignore */ }
            }
            sonner.error('User not found in local cache. You must login online at least once on this machine.');
            setLoading(false);
            return;
          }
        } catch (localErr) {
          console.error('Offline login error:', localErr);
        }
      }

      setLoading(false)
      sonner.error(`Sign In Failed: ${getAuthErrorMessage(error.message || error.toString())}`);
      throw error
    }
  }

  async function signUp(email: string, password: string, name: string, username: string) {
    setLoading(true);
    try {
      // ── Step 1: Create Auth User ─────────────────────────────────────────
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name, username } }
      });

      // Real auth errors (not "email already exists" which Supabase handles silently)
      if (error) throw error;

      // ── Step 2: Email Confirmation Required ──────────────────────────────
      // When email confirmation is ON, session is null but user is created.
      // Show success, don't create profile yet (trigger handles it on confirm).
      if (data.user && !data.session) {
        setLoading(false);
        sonner.success(
          'Account created! ✅ Please check your email and click the confirmation link to activate your account.'
        );
        return; // Profile will be created after email confirmation via trigger/webhook
      }

      // ── Step 3: Immediate session (no email confirm needed) ─────────────
      if (data.user) {
        // Every sign-up account is treated as the workspace owner (Admin).
        const userRole = 'admin';

        const profilePayload: any = {
          id: data.user.id,
          username,
          name,
          email,
          role: userRole,
          permissions: ['pos_access', 'manage_products', 'manage_users', 'manage_settings', 'view_reports'],
          can_edit_price: true,
          can_give_discount: true,
          can_delete_sale: true,
          can_view_profit: true,
          can_manage_stock: true,
          can_manage_po: true,
          can_view_records: true,
          active: true,
        };

        // ── Step 4: Upsert profile (handles duplicate key gracefully) ──────
        const { data: profileData, error: profileError } = await supabase
          .from('users')
          .upsert(profilePayload, { onConflict: 'id' })
          .select()
          .maybeSingle();

        if (profileError) {
          // Not a hard failure — auth succeeded, profile may already exist
          console.warn('[Auth] Profile upsert warning (non-fatal):', profileError);
        }

        // ── Step 5: Cache offline credentials ────────────────────────────
        const pData = profileData || profilePayload;
        try {
          const hash = await hashPasswordString(password);
          localStorage.setItem(`offline_hash_${email}`, hash);
          (pData as any).offlineHash = hash;
          await localDb.users.put(pData);
        } catch (e) {
          console.warn('[Auth] Failed to cache offline credentials:', e);
        }

        // ── Step 6: Set profile in state ──────────────────────────────────
        if (pData) {
          setProfile({
            id: pData.id,
            username: pData.username,
            name: pData.name,
            email: pData.email,
            role: pData.role as any,
            permissions: pData.permissions || [],
            canEditPrice: !!pData.can_edit_price,
            canGiveDiscount: !!pData.can_give_discount,
            canDeleteSale: !!pData.can_delete_sale,
            canViewProfit: !!pData.can_view_profit,
            canManageStock: !!pData.can_manage_stock,
            canManagePO: !!pData.can_manage_po,
            canViewRecords: !!pData.can_view_records,
            active: pData.active ?? true,
            lastLogin: pData.last_login ? new Date(pData.last_login) : undefined,
            avatar: pData.avatar || undefined,
          });
          localStorage.setItem('pos_offline_profile', JSON.stringify(pData));
        }
        setLoading(false);
        sonner.success('Welcome! ✅ Account created successfully as Admin.');
        if (!localStorage.getItem('pos_session_start')) {
          localStorage.setItem('pos_session_start', new Date().toISOString());
        }
      }

      setLoading(false);
    } catch (error: any) {
      setLoading(false);
      // Translate to user-friendly messages
      const msg = error.message || error.toString();
      if (msg.includes('User already registered') || msg.includes('already been registered')) {
        sonner.error('This email is already registered. Please sign in instead.');
      } else if (msg.toLowerCase().includes('email')) {
        sonner.error('Please enter a valid email address.');
      } else {
        sonner.error(`Sign Up Failed: ${getAuthErrorMessage(msg)}`);
      }
      throw error;
    }
  }

  async function signOut() {
    setLoading(true);
    try {
      await supabase.auth.signOut();
    } catch (error: any) {
      console.warn('Network error during sign out, gracefully logging out locally:', error);
    } finally {
      // Always clear and redirect — works offline too
      localStorage.removeItem('pos_session_start');
      localStorage.removeItem('pos_offline_profile');

      // Clear Supabase's local auth token to ensure session is destroyed offline
      localStorage.removeItem('zaynahs-pos-auth');
      localStorage.removeItem('zaynahs-pos-admin-auth');

      const storageKeys = Object.keys(localStorage);
      storageKeys.forEach(key => {
        if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
          localStorage.removeItem(key);
        }
      });

      setSession(null);
      setUser(null);
      setProfile(null);
      setLoading(false);
      
      // Dismiss all previous notifications and show sign-out success
      sonner.dismissAll();
      sonner.success('Signed Out! You have been successfully signed out.');
    }
  }

  async function updateProfile(updates: Partial<User>) {
    if (!user) throw new Error('No user logged in')

    try {
      const updatedProfile = await usersService.update(user.id, updates)
      setProfile(updatedProfile)
    } catch (error) {
      throw error
    }
  }

  async function updatePassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error

    // Update offline hash in ALL stores
    if (profile?.email) {
      const hash = await hashPasswordString(password)
      localStorage.setItem(`offline_hash_${profile.email}`, hash)
      try {
        const localUser = await localDb.users.get(profile.id)
        if (localUser) {
          (localUser as any).offlineHash = hash
          await localDb.users.put(localUser)
        }
      } catch (e) {
        console.warn('Failed to update local offline hash:', e)
      }
      // Sync hash to cloud for new-device offline support
      supabase.from('users').update({ offline_hash: hash }).eq('id', profile.id)
        .then(({ error }) => {
          if (!error) console.log('✅ Cloud offline hash updated after password change.');
        });
    }
  }

  async function refreshProfile() {
    if (user?.id) {
      await loadProfile(user.id);
    }
  }

  const value = {
    user,
    profile,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    updateProfile,
    updatePassword,
    refreshProfile,
    isRecoveringPassword,
    setIsRecoveringPassword,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    return {
      user: null,
      profile: null,
      loading: false,
      isRecoveringPassword: false,
      setIsRecoveringPassword: () => {},
      signIn: async () => { throw new Error('Auth not ready'); },
      signOut: async () => { },
      updateProfile: async () => { },
      refreshProfile: async () => { }
    };
  }
  return context;
}
