import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSupabaseConfig } from '@/lib/supabase/config';

describe('Supabase Config Helper', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('detects unconfigured credentials when empty', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    const config = getSupabaseConfig();
    expect(config.isConfigured).toBe(false);
  });

  it('detects unconfigured credentials with placeholder values', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://your-project.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'your-supabase-anon-key';

    const config = getSupabaseConfig();
    expect(config.isConfigured).toBe(false);
  });

  it('identifies properly configured credentials', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://xyzprodtest.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'eyJhGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.realtoken';

    const config = getSupabaseConfig();
    expect(config.isConfigured).toBe(true);
    expect(config.url).toBe('https://xyzprodtest.supabase.co');
    expect(config.anonKey).toBe('eyJhGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.realtoken');
  });
});
