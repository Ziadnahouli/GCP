import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { validateFile } from '@/lib/storage/upload';

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
    delete process.env.TAURI_SERVICE_URL;
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

    it('fails closed and returns 404 when candidate voice channel is nonexistent in nexus-voice prefix', async () => {
      mockGetUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: 'user123@nexus.gg',
          },
        },
        error: null,
      });

      // Channel lookup returns null
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      });

      const { POST } = await import('@/app/api/calls/token/route');

      const req = new Request('http://localhost:3000/api/calls/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: 'nexus-voice-33333333-3333-3333-3333-333333333333',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toContain('Voice channel not found');
    });

    it('fails closed and returns 400 when malformed non-UUID is passed in nexus-dm prefix', async () => {
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
          roomName: 'nexus-dm-invalid_not_uuid',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Conversation ID must be a valid UUID');
    });

    it('fails closed and returns 403 on custom unverified room names', async () => {
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
          roomName: 'unauthorized-custom-lounge',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Custom unverified room names are not permitted');
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



  describe('4. File Upload & Storage Abuse Hardening', () => {
    it('blocks executable and script files (.exe, .bat, .sh, .cmd, .msi, .jar)', () => {
      const exeFile = new File(['binary content'], 'virus.exe', { type: 'application/x-msdownload' });
      const batFile = new File(['echo hello'], 'script.bat', { type: 'text/plain' });
      const shFile = new File(['#!/bin/bash'], 'exploit.sh', { type: 'text/x-sh' });

      expect(validateFile(exeFile).valid).toBe(false);
      expect(validateFile(batFile).valid).toBe(false);
      expect(validateFile(shFile).valid).toBe(false);
    });

    it('strictly blocks SVG files to prevent stored SVG XSS attacks', () => {
      const svgFile = new File(['<svg><script>alert(1)</script></svg>'], 'image.svg', { type: 'image/svg+xml' });
      const res = validateFile(svgFile);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('SVG image files are strictly disallowed');
    });

    it('detects and blocks double extension attacks (e.g. exploit.png.exe, payload.pdf.bat)', () => {
      const doubleExt = new File(['exploit'], 'invoice.pdf.exe', { type: 'application/pdf' });
      const res = validateFile(doubleExt);
      expect(res.valid).toBe(false);
    });

    it('blocks filenames containing path traversal characters', () => {
      const traversalFile = new File(['data'], '../../evil.png', { type: 'image/png' });
      const res = validateFile(traversalFile);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('path traversal');
    });

    it('accepts legitimate images, audio, video, and documents', () => {
      const validPng = new File(['png-data'], 'screenshot.png', { type: 'image/png' });
      const validJpg = new File(['jpg-data'], 'photo.jpg', { type: 'image/jpeg' });
      const validPdf = new File(['pdf-data'], 'manual.pdf', { type: 'application/pdf' });
      const validMp4 = new File(['video-data'], 'clip.mp4', { type: 'video/mp4' });

      expect(validateFile(validPng).valid).toBe(true);
      expect(validateFile(validJpg).valid).toBe(true);
      expect(validateFile(validPdf).valid).toBe(true);
      expect(validateFile(validMp4).valid).toBe(true);
    });
  });

  describe('5. Desktop Telemetry Endpoint Hardening', () => {
    it('rejects unauthenticated GET request with 401 Unauthorized', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'No session' } });

      const { GET } = await import('@/app/api/desktop-telemetry/route');
      const req = new Request('http://localhost:3000/api/desktop-telemetry');
      const res = await GET(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain('Unauthorized');
    });

    it('never leaks internal serviceUrl to response when service is offline', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      const { GET } = await import('@/app/api/desktop-telemetry/route');
      const req = new Request('http://localhost:3000/api/desktop-telemetry');
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.serviceUrl).toBeUndefined();
      expect(json.status).toBe('offline');
    });
  });
});
