import { createBrowserClient } from '@supabase/ssr';
import { Database } from '../types/database';
import { getSupabaseConfig } from './config';

export function createClient() {
  const config = getSupabaseConfig();

  // If not configured, use placeholder credentials to avoid throwing during initialization
  const url = config.isConfigured ? config.url : 'https://placeholder-project.supabase.co';
  const anonKey = config.isConfigured ? config.anonKey : 'placeholder-anon-key';

  return createBrowserClient<Database>(url, anonKey);
}

// Singleton browser client instance
let browserClient: ReturnType<typeof createClient> | null = null;

export function getBrowserClient() {
  if (typeof window === 'undefined') {
    return createClient();
  }
  if (!browserClient) {
    browserClient = createClient();
  }
  return browserClient;
}

export const supabase = typeof window !== 'undefined' ? getBrowserClient() : (null as unknown as ReturnType<typeof createClient>);
