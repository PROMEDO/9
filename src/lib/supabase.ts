/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;
let configPromise: Promise<{ url: string; anonKey: string } | null> | null = null;

export async function getSupabasePublicConfig(): Promise<{ url: string; anonKey: string } | null> {
  if (!configPromise) {
    configPromise = fetch('/api/auth/supabase-public-config', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json().catch(() => null)) as {
          configured?: boolean;
          url?: string;
          anonKey?: string;
        } | null;
        if (data?.configured && data.url && data.anonKey) {
          return { url: data.url, anonKey: data.anonKey };
        }
        return null;
      })
      .catch(() => null);
  }
  return configPromise;
}

export async function getSupabaseBrowserClient(): Promise<SupabaseClient | null> {
  if (cachedClient) return cachedClient;
  const cfg = await getSupabasePublicConfig();
  if (!cfg) return null;

  cachedClient = createClient(cfg.url, cfg.anonKey, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return cachedClient;
}

export async function signInWithGoogleOAuth(redirectPath = '/login'): Promise<{
  ok: boolean;
  error?: string;
}> {
  const supabase = await getSupabaseBrowserClient();
  if (!supabase) {
    return {
      ok: false,
      error:
        'تسجيل الدخول عبر Google يتطلب تفعيل Supabase Auth (إضافة SUPABASE_URL و SUPABASE_ANON_KEY).',
    };
  }

  const cleanRedirectPath = redirectPath.startsWith('/') ? redirectPath : `/${redirectPath}`;
  const redirectTo = `${window.location.origin}${cleanRedirectPath}`;

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
    },
  });

  if (error) {
    return { ok: false, error: error.message || 'تعذر بدء تسجيل الدخول عبر Google.' };
  }

  return { ok: true };
}
