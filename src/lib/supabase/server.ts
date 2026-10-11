import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Database } from '../types/database';
import { getSupabaseConfig } from './config';

export function createClient() {
  const cookieStore = cookies();
  const config = getSupabaseConfig();

  const url = config.isConfigured ? config.url : 'https://placeholder-project.supabase.co';
  const anonKey = config.isConfigured ? config.anonKey : 'placeholder-anon-key';

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // The `set` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing sessions.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // The `delete` method was called from a Server Component.
        }
      },
    },
  });
}
