import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  DEFAULT_RTC_CONFIG,
  cleanIceCandidate,
  isZeroTierCandidate,
  getIceServers,
  unmaskCandidate,
  synthesizeZeroTierCandidate,
  getLocalZeroTierIp,
  setLocalZeroTierIp,
  getPeerZeroTierIp,
  setPeerZeroTierIp,
} from '@/lib/webrtc/ice-config';

const callTokenRequestSchema = z.object({
  conversationId: z.string().min(1, { message: 'Conversation ID required' }),
  roomName: z
    .string()
    .min(1)
    .regex(/^nexus-room-[a-zA-Z0-9_-]+$/, {
      message: 'Invalid room name format',
    }),
});

describe('LiveKit WebRTC Call Validation', () => {
  describe('callTokenRequestSchema', () => {
    it('accepts valid room name and conversation ID', () => {
      const result = callTokenRequestSchema.safeParse({
        conversationId: 'conv-12345',
        roomName: 'nexus-room-conv-12345',
      });
      expect(result.success).toBe(true);
    });

    it('rejects malformed room name prefixes', () => {
      const result = callTokenRequestSchema.safeParse({
        conversationId: 'conv-12345',
        roomName: 'illegal-room-conv-12345',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty conversation ID', () => {
      const result = callTokenRequestSchema.safeParse({
        conversationId: '',
        roomName: 'nexus-room-123',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('WebRTC ICE & NAT Traversal Configuration', () => {
    it('includes OpenRelay TURN servers for Symmetric NAT and firewall bypass', () => {
      const servers = getIceServers();
      expect(servers.length).toBeGreaterThan(5);

      // Verify STUN
      const hasStun = servers.some((s) =>
        Array.isArray(s.urls) ? s.urls.some((u) => u.startsWith('stun:')) : s.urls?.startsWith('stun:')
      );
      expect(hasStun).toBe(true);

      // Verify TURN relay
      const turnServer = servers.find((s) => s.username === 'openrelay' && s.credential === 'openrelay');
      expect(turnServer).toBeDefined();
      expect(turnServer?.urls).toContain('turn:openrelay.metered.ca:443?transport=tcp');
    });

    it('DEFAULT_RTC_CONFIG pre-gathers candidate pool and bundles media', () => {
      expect(DEFAULT_RTC_CONFIG.iceCandidatePoolSize).toBe(10);
      expect(DEFAULT_RTC_CONFIG.bundlePolicy).toBe('max-bundle');
      expect(DEFAULT_RTC_CONFIG.rtcpMuxPolicy).toBe('require');
    });

    it('cleanIceCandidate filters out empty candidates and strips whitespace', () => {
      expect(cleanIceCandidate(null)).toBeNull();
      expect(cleanIceCandidate(undefined)).toBeNull();
      expect(cleanIceCandidate({ candidate: '' })).toBeNull();
      expect(cleanIceCandidate({ candidate: '   ' })).toBeNull();

      const valid = cleanIceCandidate({
        candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 50000 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0,
      });
      expect(valid).not.toBeNull();
      expect(valid?.candidate).toBe('candidate:1 1 UDP 2130706431 192.168.1.1 50000 typ host');
      expect(valid?.sdpMid).toBe('0');
    });

    it('isZeroTierCandidate detects ZeroTier IP and transport patterns', () => {
      expect(isZeroTierCandidate('candidate:1 1 UDP 2130706431 10.147.20.15 50000 typ host')).toBe(true);
      expect(isZeroTierCandidate('candidate:1 1 UDP 2130706431 192.168.192.4 50000 typ host')).toBe(true);
      expect(isZeroTierCandidate('candidate:1 1 UDP 2130706431 8.8.8.8 50000 typ srflx')).toBe(false);
    });

    describe('ZeroTier mDNS Candidate Unmasking and Synthesis', () => {
      beforeEach(() => {
        if (typeof window !== 'undefined') {
          localStorage.clear();
        }
      });

      it('unmasks Chromium .local UUID hostnames with the peer ZeroTier IP', () => {
        const masked = {
          candidate: 'candidate:20394 1 udp 2122260223 93086938-f9e4-4131-b8ef-ef2eb6a13d80.local 57239 typ host',
          sdpMid: '0',
          sdpMLineIndex: 0,
        };

        const unmasked = unmaskCandidate(masked, '10.147.19.42');
        expect(unmasked).not.toBeNull();
        expect(unmasked?.candidate).toBe(
          'candidate:20394 1 udp 2122260223 10.147.19.42 57239 typ host'
        );
      });

      it('synthesizes an explicit ZeroTier candidate on the same port from a host candidate', () => {
        const hostCand = {
          candidate: 'candidate:1 1 UDP 2130706431 192.168.1.50 54123 typ host generation 0',
          sdpMid: 'audio',
          sdpMLineIndex: 0,
        };

        const synth = synthesizeZeroTierCandidate(hostCand, '10.147.19.78');
        expect(synth).not.toBeNull();
        expect(synth?.candidate).toContain('10.147.19.78 54123 typ host');
      });

      it('persists and retrieves ZeroTier IPs in localStorage', () => {
        setLocalZeroTierIp('10.147.19.99');
        expect(getLocalZeroTierIp()).toBe('10.147.19.99');

        setPeerZeroTierIp('10.147.19.100');
        expect(getPeerZeroTierIp()).toBe('10.147.19.100');
      });
    });
  });
});
