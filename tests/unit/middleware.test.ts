import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Mock updateSession
vi.mock('@/lib/supabase/middleware', () => ({
  updateSession: vi.fn(),
}));

vi.mock('@/lib/supabase/config', () => ({
  getSupabaseConfig: vi.fn(() => ({
    isConfigured: true,
    url: 'https://example.supabase.co',
    anonKey: 'anon-key',
  })),
}));

import { updateSession } from '@/lib/supabase/middleware';
import { middleware } from '@/lib/middleware';

describe('A1: Root middleware route protection and session refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects unauthenticated user from protected route to /login', async () => {
    const mockResponse = NextResponse.next();
    vi.mocked(updateSession).mockResolvedValue({
      response: mockResponse,
      user: null,
    });

    const req = new NextRequest('http://localhost:3000/');
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/login');
  });

  it('redirects unauthenticated user from deep protected route and preserves redirectTo parameter', async () => {
    const mockResponse = NextResponse.next();
    vi.mocked(updateSession).mockResolvedValue({
      response: mockResponse,
      user: null,
    });

    const req = new NextRequest('http://localhost:3000/channels/123');
    const res = await middleware(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location') || '';
    expect(location).toContain('/login');
    expect(location).toContain('redirectTo=%2Fchannels%2F123');
  });

  it('allows authenticated user to access protected route', async () => {
    const mockResponse = NextResponse.next();
    vi.mocked(updateSession).mockResolvedValue({
      response: mockResponse,
      user: { id: 'user-123', email: 'test@example.com' } as any,
    });

    const req = new NextRequest('http://localhost:3000/');
    const res = await middleware(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('redirects authenticated user away from /login to home', async () => {
    const mockResponse = NextResponse.next();
    vi.mocked(updateSession).mockResolvedValue({
      response: mockResponse,
      user: { id: 'user-123', email: 'test@example.com' } as any,
    });

    const req = new NextRequest('http://localhost:3000/login');
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/');
  });

  it('redirects authenticated user away from /register to home', async () => {
    const mockResponse = NextResponse.next();
    vi.mocked(updateSession).mockResolvedValue({
      response: mockResponse,
      user: { id: 'user-123', email: 'test@example.com' } as any,
    });

    const req = new NextRequest('http://localhost:3000/register');
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/');
  });

  it('preserves refreshed session cookies when updateSession renews tokens', async () => {
    const mockResponse = NextResponse.next();
    mockResponse.cookies.set('sb-access-token', 'new-token', { path: '/' });
    mockResponse.cookies.set('sb-refresh-token', 'new-refresh', { path: '/' });

    vi.mocked(updateSession).mockResolvedValue({
      response: mockResponse,
      user: { id: 'user-123', email: 'test@example.com' } as any,
    });

    const req = new NextRequest('http://localhost:3000/');
    const res = await middleware(req);

    expect(res.cookies.get('sb-access-token')?.value).toBe('new-token');
    expect(res.cookies.get('sb-refresh-token')?.value).toBe('new-refresh');
  });

  it('allows access in unconfigured demo mode without redirecting', async () => {
    const { getSupabaseConfig } = await import('@/lib/supabase/config');
    vi.mocked(getSupabaseConfig).mockReturnValueOnce({
      isConfigured: false,
      url: '',
      anonKey: '',
    });

    const mockResponse = NextResponse.next();
    vi.mocked(updateSession).mockResolvedValue({
      response: mockResponse,
      user: null,
    });

    const req = new NextRequest('http://localhost:3000/');
    const res = await middleware(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });
});
