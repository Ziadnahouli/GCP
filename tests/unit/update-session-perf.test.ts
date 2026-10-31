import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetSession = vi.fn();
const mockGetUser = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getSession: mockGetSession,
      getUser: mockGetUser,
    },
  })),
}));

vi.mock('@/lib/supabase/config', () => ({
  getSupabaseConfig: vi.fn(() => ({
    isConfigured: true,
    url: 'https://test.supabase.co',
    anonKey: 'test-anon-key',
  })),
}));

import { updateSession } from '@/lib/supabase/middleware';

describe('S3: updateSession Local Verification vs Network Reduction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses local session when valid and avoids calling getUser() over the network', async () => {
    const validExpiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour in future
    mockGetSession.mockResolvedValueOnce({
      data: {
        session: {
          user: { id: 'usr-123', email: 'fast@nexus.gg' },
          expires_at: validExpiry,
        },
      },
    });

    const req = new NextRequest('http://localhost:3000/', {
      headers: new Headers(),
    });
    const { user } = await updateSession(req);

    expect(mockGetSession).toHaveBeenCalledTimes(1);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(user?.id).toBe('usr-123');
  });

  it('calls getUser() only when session is near expiry (<= 60s)', async () => {
    const nearExpiry = Math.floor(Date.now() / 1000) + 30; // 30s remaining
    mockGetSession.mockResolvedValueOnce({
      data: {
        session: {
          user: { id: 'usr-123', email: 'expiring@nexus.gg' },
          expires_at: nearExpiry,
        },
      },
    });
    mockGetUser.mockResolvedValueOnce({
      data: {
        user: { id: 'usr-123', email: 'refreshed@nexus.gg' },
      },
    });

    const req = new NextRequest('http://localhost:3000/', {
      headers: new Headers(),
    });
    const { user } = await updateSession(req);

    expect(mockGetSession).toHaveBeenCalledTimes(1);
    expect(mockGetUser).toHaveBeenCalledTimes(1);
    expect(user?.email).toBe('refreshed@nexus.gg');
  });

  it('skips getUser() network call when no session exists in cookies', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: null },
    });

    const req = new NextRequest('http://localhost:3000/login', {
      headers: new Headers(),
    });
    const { user } = await updateSession(req);

    expect(mockGetSession).toHaveBeenCalledTimes(1);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(user).toBeNull();
  });
});
