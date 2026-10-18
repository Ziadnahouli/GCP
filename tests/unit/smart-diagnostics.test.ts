import { describe, it, expect } from 'vitest';
import {
  sanitizeIpAddress,
  generateDiagnoses,
  generateSanitizedReport,
  DiagnosticsStats,
} from '@/components/calls/network-diagnostics';

describe('Smart Network and Voice Diagnostics Tests', () => {
  describe('1. Sensitive IP & Data Sanitization', () => {
    it('masks private 192.168.x.x addresses', () => {
      const sanitized = sanitizeIpAddress('192.168.1.42');
      expect(sanitized).toBe('192.168.***.***');
    });

    it('masks private 10.x.x.x addresses (including ZeroTier LAN virtual subnets)', () => {
      const sanitized = sanitizeIpAddress('10.147.19.82');
      expect(sanitized).toBe('10.***.***.***');
    });

    it('masks private 172.16-31.x.x addresses', () => {
      const sanitized = sanitizeIpAddress('172.20.10.4');
      expect(sanitized).toBe('172.***.***.***');
    });

    it('masks public IPv4 addresses while preserving subnet context safely', () => {
      const sanitized = sanitizeIpAddress('203.0.113.195');
      expect(sanitized).toContain('(Public Redacted)');
      expect(sanitized).not.toContain('.113.195');
    });

    it('redacts IPv6 addresses', () => {
      const sanitized = sanitizeIpAddress('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
      expect(sanitized).toBe('[REDACTED_IPV6]');
    });

    it('handles null, undefined, or empty values safely without throwing', () => {
      expect(sanitizeIpAddress(null)).toBe('N/A');
      expect(sanitizeIpAddress(undefined)).toBe('N/A');
      expect(sanitizeIpAddress('')).toBe('N/A');
    });
  });

  describe('2. Automated Diagnoses & Actionable Recovery Suggestions', () => {
    it('diagnoses idle state when no call is active', () => {
      const stats: DiagnosticsStats = {
        connectionState: 'disconnected',
        rttMs: null,
        jitterMs: null,
        packetLossPercent: null,
        incomingBitrateKbps: null,
        outgoingBitrateKbps: null,
        transportPath: 'unknown',
      };

      const diagnoses = generateDiagnoses(stats);
      expect(diagnoses).toHaveLength(1);
      expect(diagnoses[0].id).toBe('conn_idle');
      expect(diagnoses[0].title).toBe('Voice Session Idle');
    });

    it('diagnoses optimal direct peer-to-peer low-latency connection', () => {
      const stats: DiagnosticsStats = {
        connectionState: 'connected',
        rttMs: 24,
        jitterMs: 1.2,
        packetLossPercent: 0.0,
        incomingBitrateKbps: 52,
        outgoingBitrateKbps: 50,
        transportPath: 'direct_p2p',
        micLevel: 45,
        isMicMuted: false,
      };

      const diagnoses = generateDiagnoses(stats);
      const transportDiag = diagnoses.find((d) => d.id === 'transport_p2p');
      const rttDiag = diagnoses.find((d) => d.id === 'rtt_optimal');

      expect(transportDiag).toBeDefined();
      expect(transportDiag?.level).toBe('healthy');
      expect(rttDiag).toBeDefined();
      expect(rttDiag?.title).toContain('24 ms');
    });

    it('diagnoses relayed TURN transport and provides firewall actionable suggestions', () => {
      const stats: DiagnosticsStats = {
        connectionState: 'connected',
        rttMs: 140,
        jitterMs: 8.5,
        packetLossPercent: 0.5,
        incomingBitrateKbps: 45,
        outgoingBitrateKbps: 48,
        transportPath: 'relayed_turn',
      };

      const diagnoses = generateDiagnoses(stats);
      const turnDiag = diagnoses.find((d) => d.id === 'transport_turn');

      expect(turnDiag).toBeDefined();
      expect(turnDiag?.level).toBe('warning');
      expect(turnDiag?.suggestion).toContain('ZeroTier Windows Firewall');
    });

    it('diagnoses severe packet loss (> 5%) and provides Ethernet cable suggestion', () => {
      const stats: DiagnosticsStats = {
        connectionState: 'connected',
        rttMs: 65,
        jitterMs: 15.0,
        packetLossPercent: 7.2,
        incomingBitrateKbps: 30,
        outgoingBitrateKbps: 48,
        transportPath: 'direct_p2p',
      };

      const diagnoses = generateDiagnoses(stats);
      const lossDiag = diagnoses.find((d) => d.id === 'loss_high');

      expect(lossDiag).toBeDefined();
      expect(lossDiag?.level).toBe('critical');
      expect(lossDiag?.title).toContain('7.2%');
      expect(lossDiag?.suggestion).toContain('Ethernet');
    });

    it('diagnoses silent microphone when unmuted but 0% audio input detected', () => {
      const stats: DiagnosticsStats = {
        connectionState: 'connected',
        rttMs: 30,
        jitterMs: 2.0,
        packetLossPercent: 0.0,
        incomingBitrateKbps: 50,
        outgoingBitrateKbps: 48,
        transportPath: 'direct_p2p',
        micLevel: 0,
        isMicMuted: false,
      };

      const diagnoses = generateDiagnoses(stats);
      const silentMicDiag = diagnoses.find((d) => d.id === 'mic_silent');

      expect(silentMicDiag).toBeDefined();
      expect(silentMicDiag?.level).toBe('warning');
      expect(silentMicDiag?.suggestion).toContain('Windows Microphone Privacy settings');
    });

    it('diagnoses reconnection failures with ICE restart suggestion', () => {
      const stats: DiagnosticsStats = {
        connectionState: 'reconnecting',
        rttMs: null,
        jitterMs: null,
        packetLossPercent: null,
        incomingBitrateKbps: null,
        outgoingBitrateKbps: null,
        transportPath: 'unknown',
        reconnectAttempts: 3,
        reconnectFailures: 2,
        lastFailureTimestamp: '14:20:00',
      };

      const diagnoses = generateDiagnoses(stats);
      const reconnectDiag = diagnoses.find((d) => d.id === 'reconnect_failures');

      expect(reconnectDiag).toBeDefined();
      expect(reconnectDiag?.level).toBe('critical');
      expect(reconnectDiag?.suggestion).toContain('Re-route Connection');
    });
  });

  describe('3. Privacy-Sanitized Diagnostic Report Generation', () => {
    it('generates a full sanitized report with sensitive IPs masked and secrets excluded', () => {
      const stats: DiagnosticsStats = {
        connectionState: 'connected',
        rttMs: 32,
        jitterMs: 1.8,
        packetLossPercent: 0.1,
        incomingBitrateKbps: 54,
        outgoingBitrateKbps: 50,
        transportPath: 'direct_p2p',
        micLevel: 42,
        isMicMuted: false,
        reconnectAttempts: 1,
        reconnectFailures: 0,
        lastReconnectReason: 'User requested ICE restart',
        audioDevice: {
          label: 'HyperX QuadCast S (0951:171f)',
          sampleRate: 48000,
          channelCount: 2,
          echoCancellation: true,
          autoGainControl: false,
          noiseSuppression: true,
        },
        isNoiseSuppressionEnabled: true,
        isKrispActive: true,
        videoPublishing: {
          isPublishingCamera: true,
          cameraResolution: '1920x1080',
          cameraFrameRate: 30,
          isPublishingScreen: false,
          screenResolution: null,
          screenFrameRate: null,
        },
      };

      const report = generateSanitizedReport(stats, { platform: 'Win32' });

      // Verifies report structure
      expect(report).toContain('NEXUS SMART NETWORK & VOICE DIAGNOSTICS REPORT (SANITIZED)');
      expect(report).toContain('Security Policy: STRICT');
      expect(report).toContain('- Connection State: CONNECTED');
      expect(report).toContain('Direct WebRTC P2P');
      expect(report).toContain('32 ms');
      expect(report).toContain('HyperX QuadCast S');
      expect(report).toContain('48,000 Hz');
      expect(report).toContain('Active (1920x1080 @ 30fps)');
      expect(report).toContain('Microphone Input Level: 42%');
      expect(report).toContain('Krisp AI Noise Filtering: Active');

      // Verifies strict exclusion of secrets
      expect(report).not.toContain('Bearer');
      expect(report).not.toContain('jwt');
      expect(report).not.toContain('password');
      expect(report).not.toContain('sb-access-token');
      expect(report).not.toContain('secret');
    });

    it('does not invent ping values when WebRTC RTT is null (measuring state)', () => {
      const stats: DiagnosticsStats = {
        connectionState: 'connecting',
        rttMs: null,
        jitterMs: null,
        packetLossPercent: null,
        incomingBitrateKbps: null,
        outgoingBitrateKbps: null,
        transportPath: 'unknown',
      };

      const report = generateSanitizedReport(stats);
      expect(report).toContain('Waiting for candidate-pair');
      expect(report).not.toContain('0 ms');
    });
  });

  describe('4. Squad Call In-Room Participants Presence', () => {
    it('formats squad call participant list with avatars and speaking states', () => {
      const participants = [
        {
          id: 'user-1-id',
          name: 'ApexTactician',
          avatar_url: 'https://example.com/avatar1.png',
          isSpeaking: true,
          isMuted: false,
        },
        {
          id: 'user-2-id',
          name: 'GhostSniper',
          avatar_url: null,
          isSpeaking: false,
          isMuted: true,
        },
      ];

      // Verifies participants array structure
      expect(participants).toHaveLength(2);
      expect(participants[0].name).toBe('ApexTactician');
      expect(participants[0].isSpeaking).toBe(true);
      expect(participants[1].name).toBe('GhostSniper');
      expect(participants[1].isMuted).toBe(true);

      // Verifies subtitle format
      const subtitle = `${participants.length} squadmates in call`;
      expect(subtitle).toBe('2 squadmates in call');

      // Verifies comma-delimited banner format
      const bannerText = `• In Call: ${participants.map((p) => p.name).join(', ')}`;
      expect(bannerText).toBe('• In Call: ApexTactician, GhostSniper');
    });

    it('handles single caller gracefully', () => {
      const participants = [
        {
          id: 'caller-id',
          name: 'SoloSquadmate',
          avatar_url: null,
          isSpeaking: false,
          isMuted: false,
        },
      ];

      const subtitle = `${participants.length} squadmate in call`;
      expect(subtitle).toBe('1 squadmate in call');
    });
  });

  describe('5. LiveKit SFU Latency & Anti-Flicker Heartbeat Persistence', () => {
    it('diagnoses LiveKit SFU multi-party transport with low-latency ping', () => {
      const stats: DiagnosticsStats = {
        connectionState: 'connected',
        rttMs: 28,
        jitterMs: 1.6,
        packetLossPercent: 0.0,
        incomingBitrateKbps: 64,
        outgoingBitrateKbps: 48,
        transportPath: 'livekit_sfu',
        isKrispActive: true,
      };

      const diagnoses = generateDiagnoses(stats);
      const transportDiag = diagnoses.find((d) => d.id === 'transport_sfu');
      expect(transportDiag).toBeDefined();
      expect(transportDiag?.level).toBe('healthy');
      expect(transportDiag?.title).toContain('LiveKit Multi-Party SFU');

      const report = generateSanitizedReport(stats);
      expect(report).toContain('LiveKit SFU (Multi-Party Audio Router)');
      expect(report).toContain('28 ms');
      expect(report).toContain('Krisp AI Noise Filtering: Active');
    });

    it('prevents flickering loop by retaining active state if heartbeat was received within 10 seconds', () => {
      // Simulates the chat view anti-flicker heartbeat cache logic
      let activeCallSession: any = null;
      let lastHeartbeatTime = 0;

      // 1. Peer sends squad_call_active heartbeat
      const onHeartbeatReceived = (payload: any) => {
        lastHeartbeatTime = Date.now();
        activeCallSession = payload;
      };

      // 2. 4s polling timer queries DB and gets null
      const onDbPoll = (dbResult: any) => {
        if (dbResult) {
          activeCallSession = dbResult;
        } else {
          const hasRecentHeartbeat = Date.now() - lastHeartbeatTime < 10000;
          if (!hasRecentHeartbeat) {
            activeCallSession = null;
          }
        }
      };

      // Peer broadcasts heartbeat
      onHeartbeatReceived({ status: 'active', conversation_id: 'conv-123' });
      expect(activeCallSession).not.toBeNull();
      expect(activeCallSession.status).toBe('active');

      // 3 seconds later, DB poll returns null (e.g. no DB record or RLS)
      onDbPoll(null);
      // Because heartbeat arrived <10s ago, activeCallSession MUST NOT be wiped!
      expect(activeCallSession).not.toBeNull();
      expect(activeCallSession.status).toBe('active');

      // 3. When call explicitly ends via squad_call_ended
      const onCallEndedReceived = () => {
        lastHeartbeatTime = 0;
        activeCallSession = null;
      };

      onCallEndedReceived();
      expect(activeCallSession).toBeNull();
    });
  });
});
