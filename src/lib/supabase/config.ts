/**
 * Supabase Environment Configuration Helper
 * Validates whether Supabase credentials have been provided.
 */

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  isConfigured: boolean;
}

export function getSupabaseConfig(): SupabaseConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    '';

  const isConfigured = Boolean(
    url &&
      anonKey &&
      !url.includes('your-project') &&
      !anonKey.includes('your-supabase') &&
      (url.startsWith('https://') || url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost'))
  );

  return {
    url,
    anonKey,
    isConfigured,
  };
}
