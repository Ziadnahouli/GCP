import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock Supabase Server Client for API route testing
const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
  }),
}));

describe('Security & Authorization Audit Regression Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;
    delete process.env.LIVEKIT_URL;
    delete process.env.NEXT_PUBLIC_LIVEKIT_URL;
  });

  describe('1. Call Token API Route (/api/calls/token) Security Controls', () => {
    it('rejects invalid request payload with 400 Bad Request (does not fall back to raw input)', async () => {
      const { POST } = await import('@/app/api/calls/token/route');

      // Request with invalid conversationId (not a UUID)
      const req = new Request('http://localhost:3000/api/calls/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: 'malicious-string-not-uuid',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Validation failed');
    });

    it('rejects unauthenticated request with 401 Unauthorized', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'No session' } });

      const { POST } = await import('@/app/api/calls/token/route');

      const req = new Request('http://localhost:3000/api/calls/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: 'nexus-voice-lounge',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain('Unauthorized');
    });

    it('rejects identity spoofing with 403 Forbidden when client supplies another user ID', async () => {
      // Authenticated user is 'user-123'
      mockGetUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: 'user123@nexus.gg',
            user_metadata: { display_name: 'LegitUser' },
          },
        },
        error: null,
      });

      const { POST } = await import('@/app/api/calls/token/route');

      // Client attempts to spoof 'victim-456'
      const req = new Request('http://localhost:3000/api/calls/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'victim-456',
          roomName: 'nexus-voice-lounge',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Cannot request call token for another user identity');
    });

    it('rejects token request with 403 Forbidden when user is not a conversation member', async () => {
      mockGetUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: 'user123@nexus.gg',
          },
        },
        error: null,
      });

      // Conversation membership lookup returns empty (user is not a member)
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      });

      const { POST } = await import('@/app/api/calls/token/route');

      const req = new Request('http://localhost:3000/api/calls/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: '11111111-1111-1111-1111-111111111111',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('You are not a member of this conversation');
    });

    it('rejects token request with 403 Forbidden when user is not a server member', async () => {
      mockGetUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: 'user123@nexus.gg',
          },
        },
        error: null,
      });

      // Server membership lookup returns empty
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      });

      const { POST } = await import('@/app/api/calls/token/route');

      const req = new Request('http://localhost:3000/api/calls/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverId: '22222222-2222-2222-2222-222222222222',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('You are not a member of this server');
    });

    it('fails closed when LiveKit server credentials are missing (no hardcoded secrets)', async () => {
      mockGetUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: 'user123@nexus.gg',
          },
        },
        error: null,
      });

      const { POST } = await import('@/app/api/calls/token/route');

      const req = new Request('http://localhost:3000/api/calls/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: 'nexus-voice-lounge',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      // Must fail closed with isConfigured = false and mode = p2p
      expect(json.isConfigured).toBe(false);
      expect(json.mode).toBe('p2p');
      expect(json.token).toBeUndefined();
    });
  });

  describe('2. Supabase Migration 00012 Policy Verification', () => {
    const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/00012_security_and_voice_overhaul.sql');
    let migrationSql: string;

    beforeEach(() => {
      migrationSql = fs.readFileSync(migrationPath, 'utf8');
    });

    it('drops the conversation self-join policy ("Users can join conversations")', () => {
      expect(migrationSql).toContain('DROP POLICY IF EXISTS "Users can join conversations" ON public.conversation_members');
    });

    it('restricts message UPDATE policy strictly to authors (auth.uid() = sender_id)', () => {
      expect(migrationSql).toContain('DROP POLICY IF EXISTS "Members can update messages" ON public.messages');
      expect(migrationSql).toContain('CREATE POLICY "Authors can update their own messages"');
      expect(migrationSql).toContain('USING (auth.uid() = sender_id)');
      expect(migrationSql).toContain('WITH CHECK (auth.uid() = sender_id)');
    });

    it('defines secure pin_conversation_message RPC function with membership check', () => {
      expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.pin_conversation_message');
      expect(migrationSql).toContain('SECURITY DEFINER');
      expect(migrationSql).toContain('SET search_path = public');
      expect(migrationSql).toContain('public.is_conversation_member');
    });

    it('drops open friendships insert policy preventing unilateral friend creation', () => {
      expect(migrationSql).toContain('DROP POLICY IF EXISTS "Users can insert friendships" ON public.friendships');
    });

    it('restricts friend_requests update to receiver only for pending requests', () => {
      expect(migrationSql).toContain('DROP POLICY IF EXISTS "Parties can update their friend requests" ON public.friend_requests');
      expect(migrationSql).toContain('CREATE POLICY "Receivers can update friend requests"');
      expect(migrationSql).toContain("USING (auth.uid() = receiver_id AND status = 'pending')");
      expect(migrationSql).toContain("WITH CHECK (auth.uid() = receiver_id AND status IN ('accepted', 'rejected'))");
    });

    it('guarantees accept_friend_request and create_or_get_direct_conversation have SET search_path = public', () => {
      expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.accept_friend_request');
      expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.create_or_get_direct_conversation');
      const searchPathCount = (migrationSql.match(/SET search_path = public/g) || []).length;
      expect(searchPathCount).toBeGreaterThanOrEqual(3);
    });
  });
});
