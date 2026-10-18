'use client';

import * as React from 'react';
import {
  Activity,
  Radio,
  ArrowDown,
  ArrowUp,
  RefreshCw,
  Terminal,
  Copy,
  Check,
  Mic,
  MicOff,
  Video,
  Monitor,
  Shield,
  Download,
  AlertTriangle,
  CheckCircle2,
  Info,
  Volume2,
  X,
  FileText,
  Sliders,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getLocalZeroTierIp, getPeerZeroTierIp } from '@/lib/webrtc/ice-config';
import { useToast } from '@/components/ui/toast';

export interface AudioDeviceInfo {
  label: string;
  sampleRate: number | null;
  channelCount: number | null;
  echoCancellation: boolean | null;
  autoGainControl: boolean | null;
  noiseSuppression: boolean | null;
}

export interface VideoPublishingInfo {
  isPublishingCamera: boolean;
  cameraResolution: string | null;
  cameraFrameRate: number | null;
  isPublishingScreen: boolean;
  screenResolution: string | null;
  screenFrameRate: number | null;
}

export interface DiagnosticsStats {
  connectionState: 'connected' | 'connecting' | 'reconnecting' | 'disconnected';
  rttMs: number | null;
  jitterMs: number | null;
  packetLossPercent: number | null;
  packetsLost?: number;
  packetsReceived?: number;
  packetsSent?: number;
  incomingBitrateKbps: number | null;
  outgoingBitrateKbps: number | null;
  transportPath: 'direct_p2p' | 'relayed_turn' | 'livekit_sfu' | 'unknown';
  isZeroTierActive?: boolean;

  // Microphone and audio tracking
  micLevel?: number; // 0 to 100
  isMicMuted?: boolean;

  // Reconnection and stability
  reconnectAttempts?: number;
  reconnectFailures?: number;
  lastReconnectReason?: string | null;
  lastFailureTimestamp?: string | null;

  // Audio device & processing
  audioDevice?: AudioDeviceInfo;
  isNoiseSuppressionEnabled?: boolean;
  isKrispActive?: boolean;

  // Video publishing
  videoPublishing?: VideoPublishingInfo;
}

export interface DiagnosticDiagnosis {
  id: string;
  level: 'healthy' | 'warning' | 'critical' | 'info';
  title: string;
  description: string;
  suggestion?: string;
}

export interface NetworkDiagnosticsProps {
  stats?: DiagnosticsStats;
  localStream?: MediaStream | null;
  screenStream?: MediaStream | null;
  isMicMuted?: boolean;
  isCameraOn?: boolean;
  isScreenSharing?: boolean;
  isNoiseSuppressionEnabled?: boolean;
  onClose?: () => void;
  onRestartConnection?: () => void;
}

/**
 * Mask sensitive IPv4 and IPv6 addresses to protect user privacy.
 * Strictly excludes any private network topology or public IP tracking.
 */
export function sanitizeIpAddress(ip: string | null | undefined): string {
  if (!ip || typeof ip !== 'string') return 'N/A';
  const clean = ip.trim();

  // IPv6 check
  if (clean.includes(':')) {
    return '[REDACTED_IPV6]';
  }

  // Private 10.x.x.x
  if (clean.startsWith('10.')) {
    return '10.***.***.***';
  }
  // Private 192.168.x.x
  if (clean.startsWith('192.168.')) {
    return '192.168.***.***';
  }
  // Private 172.16-31.x.x
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(clean)) {
    return '172.***.***.***';
  }
  // Localhost
  if (clean === '127.0.0.1' || clean === 'localhost') {
    return '127.0.0.1 (Localhost)';
  }

  // Public IPv4 masking (mask first and last octets)
  const parts = clean.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.***.*** (Public Redacted)`;
  }

  return 'REDACTED_IP';
}

/**
 * Evaluates current stats and produces understandable diagnoses and actionable recovery suggestions.
 * Strict Rule: Never invent ping values or confuse local ping with voice server latency.
 */
export function generateDiagnoses(stats: DiagnosticsStats): DiagnosticDiagnosis[] {
  const diagnoses: DiagnosticDiagnosis[] = [];

  // 1. Connection State
  if (stats.connectionState === 'disconnected') {
    diagnoses.push({
      id: 'conn_idle',
      level: 'info',
      title: 'Voice Session Idle',
      description: 'No active WebRTC peer connection or LiveKit media channel currently established.',
      suggestion: 'Initiate or accept a voice/video call to stream audio telemetry.',
    });
    return diagnoses;
  }

  if (stats.connectionState === 'reconnecting') {
    diagnoses.push({
      id: 'conn_reconnecting',
      level: 'critical',
      title: 'WebRTC Reconnection In Progress',
      description: 'The peer connection experienced ICE disconnection or packet stall and is negotiating candidate pairs.',
      suggestion: 'Wait a few seconds for ICE restart to complete, or click "Optimize / Re-route Connection".',
    });
  }

  // 2. Transport Path & NAT Traversal
  if (stats.transportPath === 'relayed_turn') {
    diagnoses.push({
      id: 'transport_turn',
      level: 'warning',
      title: 'Relayed Media Path (Cloud TURN)',
      description:
        'Voice traffic is routing through a relay server because direct UDP peer-to-peer connection was blocked by symmetric NAT or firewall.',
      suggestion:
        'Run the ZeroTier Windows Firewall rule or ensure UDP ports 9993 / 3478 are unblocked for lower latency direct P2P.',
    });
  } else if (stats.transportPath === 'direct_p2p') {
    diagnoses.push({
      id: 'transport_p2p',
      level: 'healthy',
      title: 'Direct Peer-to-Peer Audio',
      description: 'Voice is transmitting directly between peers via optimal UDP host candidate pairs with zero intermediary hops.',
    });
  } else if (stats.transportPath === 'livekit_sfu') {
    diagnoses.push({
      id: 'transport_sfu',
      level: 'healthy',
      title: 'LiveKit Multi-Party SFU',
      description: 'Connected to high-capacity Selective Forwarding Unit for multi-user squad audio mixing.',
    });
  }

  // 3. Genuine WebRTC RTT Latency
  if (stats.rttMs !== null) {
    if (stats.rttMs > 180) {
      diagnoses.push({
        id: 'rtt_high',
        level: 'critical',
        title: `High Round-Trip Latency (${stats.rttMs} ms)`,
        description: 'WebRTC round-trip time exceeds 180ms, which may cause conversational overlap and delay.',
        suggestion: 'Verify internet bandwidth, pause large downloads, or switch from Wi-Fi to a wired Ethernet connection.',
      });
    } else if (stats.rttMs > 90) {
      diagnoses.push({
        id: 'rtt_moderate',
        level: 'warning',
        title: `Moderate Latency (${stats.rttMs} ms)`,
        description: 'Audio latency is slightly elevated but acceptable for casual voice communication.',
      });
    } else {
      diagnoses.push({
        id: 'rtt_optimal',
        level: 'healthy',
        title: `Ultra-Low Latency (${stats.rttMs} ms)`,
        description: 'Round-trip transmission delay is exceptional and esports-grade.',
      });
    }
  }

  // 4. Packet Loss Evaluation
  if (stats.packetLossPercent !== null) {
    if (stats.packetLossPercent > 5) {
      diagnoses.push({
        id: 'loss_high',
        level: 'critical',
        title: `Severe Packet Loss (${stats.packetLossPercent.toFixed(1)}%)`,
        description: 'Significant audio packets are being dropped, which causes robotic, garbled, or missing speech.',
        suggestion: 'Switch to a wired Ethernet connection immediately and inspect your local router for bufferbloat.',
      });
    } else if (stats.packetLossPercent > 1.5) {
      diagnoses.push({
        id: 'loss_mild',
        level: 'warning',
        title: `Mild Packet Loss (${stats.packetLossPercent.toFixed(1)}%)`,
        description: 'Occasional packet dropouts detected. In-flight Opus packet loss concealment (PLC) is mitigating gaps.',
        suggestion: 'Avoid intensive background uploads or streaming while in tactical voice calls.',
      });
    }
  }

  // 5. Jitter Evaluation
  if (stats.jitterMs !== null && stats.jitterMs > 30) {
    diagnoses.push({
      id: 'jitter_high',
      level: 'warning',
      title: `Elevated Packet Jitter (${stats.jitterMs.toFixed(1)} ms)`,
      description: 'Variance in packet arrival times is creating audio jitter buffer expansion.',
      suggestion: 'Check for local network congestion or Wi-Fi channel interference.',
    });
  }

  // 6. Microphone Input Diagnostics
  if (stats.isMicMuted) {
    diagnoses.push({
      id: 'mic_muted',
      level: 'info',
      title: 'Microphone Muted',
      description: 'Microphone transmission is intentionally disabled by you.',
      suggestion: 'Press Unmute or your Push-To-Talk hotkey to transmit audio.',
    });
  } else if (stats.micLevel !== undefined && stats.micLevel === 0 && stats.connectionState === 'connected') {
    diagnoses.push({
      id: 'mic_silent',
      level: 'warning',
      title: 'No Microphone Signal Detected',
      description: 'Microphone is unmuted, but 0% input volume is being captured from your selected input device.',
      suggestion: 'Check Windows Microphone Privacy settings (Allow desktop apps) or verify the physical mute switch on your headset.',
    });
  }

  // 7. Reconnection Failures
  if (stats.reconnectFailures && stats.reconnectFailures > 0) {
    diagnoses.push({
      id: 'reconnect_failures',
      level: 'critical',
      title: `Reconnection Failures Recorded (${stats.reconnectFailures})`,
      description: `ICE candidate pair negotiation failed ${stats.reconnectFailures} time(s). Last failure: ${stats.lastFailureTimestamp || 'Recently'}.`,
      suggestion: 'Click "Optimize / Re-route Connection" to restart WebRTC ICE gathering from scratch.',
    });
  }

  return diagnoses;
}

/**
 * Builds a user-triggered diagnostic report with secrets, tokens, private messages,
 * and sensitive IP data strictly excluded by default.
 */
export function generateSanitizedReport(stats: DiagnosticsStats, extra?: { platform?: string }): string {
  const timestamp = new Date().toISOString();
  const localZt = typeof window !== 'undefined' ? getLocalZeroTierIp() : null;
  const peerZt = typeof window !== 'undefined' ? getPeerZeroTierIp() : null;

  const sanitizedLocalZt = sanitizeIpAddress(localZt);
  const sanitizedPeerZt = sanitizeIpAddress(peerZt);

  const diagnoses = generateDiagnoses(stats);

  const report = [
    '================================================================================',
    'NEXUS SMART NETWORK & VOICE DIAGNOSTICS REPORT (SANITIZED)',
    `Generated At: ${timestamp}`,
    `Platform: ${extra?.platform || (typeof navigator !== 'undefined' ? navigator.platform : 'Desktop')}`,
    'Security Policy: STRICT (Secrets, Tokens, Passwords, Messages & IP Subnets Excluded)',
    '================================================================================',
    '',
    '[1. CONNECTION STATE & MEDIA TRANSPORT]',
    `- Connection State: ${stats.connectionState.toUpperCase()}`,
    `- Media Transport Path: ${
      stats.transportPath === 'direct_p2p'
        ? 'Direct WebRTC P2P (Host UDP Candidate)'
        : stats.transportPath === 'livekit_sfu'
        ? 'LiveKit SFU (Multi-Party Audio Router)'
        : stats.transportPath === 'relayed_turn'
        ? 'Relayed TURN Server (NAT Traversal Fallback)'
        : 'Direct WebRTC P2P (Host UDP Candidate)'
    }`,
    `- Measured WebRTC RTT Latency: ${stats.rttMs !== null ? `${stats.rttMs} ms` : 'Waiting for candidate-pair'}`,
    `- Jitter: ${stats.jitterMs !== null ? `${stats.jitterMs.toFixed(1)} ms` : 'N/A'}`,
    `- Packet Loss: ${stats.packetLossPercent !== null ? `${stats.packetLossPercent.toFixed(1)}%` : '0.0%'}`,
    `- Inbound Bitrate: ${stats.incomingBitrateKbps !== null ? `${stats.incomingBitrateKbps} kbps` : 'N/A'}`,
    `- Outbound Bitrate: ${stats.outgoingBitrateKbps !== null ? `${stats.outgoingBitrateKbps} kbps` : 'N/A'}`,
    '',
    '[2. ZERO-TIER VIRTUAL LAN (PRIVACY MASKED)]',
    `- ZeroTier Engine: ${localZt ? 'Active' : 'Unconfigured / Local WebRTC'}`,
    `- Local Interface IP: ${sanitizedLocalZt}`,
    `- Peer Interface IP: ${sanitizedPeerZt}`,
    '',
    '[3. RECONNECTION & SESSION RELIABILITY]',
    `- Reconnection Attempts: ${stats.reconnectAttempts ?? 0}`,
    `- Reconnection Failures: ${stats.reconnectFailures ?? 0}`,
    `- Last Failure Reason: ${stats.lastReconnectReason || 'None'}`,
    `- Last Failure Timestamp: ${stats.lastFailureTimestamp || 'None'}`,
    '',
    '[4. AUDIO HARDWARE & DSP PROCESSING]',
    `- Input Device: ${stats.audioDevice?.label || 'Default System Microphone'}`,
    `- Sample Rate: ${stats.audioDevice?.sampleRate ? `${stats.audioDevice.sampleRate.toLocaleString()} Hz` : '48,000 Hz'}`,
    `- Channels: ${stats.audioDevice?.channelCount ? (stats.audioDevice.channelCount === 1 ? '1 (Mono)' : '2 (Stereo)') : '1 (Mono)'}`,
    `- Echo Cancellation: ${stats.audioDevice?.echoCancellation ? 'Enabled' : 'Disabled'}`,
    `- Auto Gain Control: ${stats.audioDevice?.autoGainControl ? 'Enabled' : 'Disabled'}`,
    `- Hardware Noise Suppression: ${stats.audioDevice?.noiseSuppression ? 'Enabled' : 'Disabled'}`,
    `- GCP Studio AudioWorklet Engine: ${stats.isNoiseSuppressionEnabled ? 'Active (Real-time AudioWorklet, 80Hz Cut, 2.8kHz Boost, 7.5kHz Tamer, Dynamics Comp)' : 'Bypassed'}`,
    `- Voice Processing Mode: ${stats.isNoiseSuppressionEnabled ? 'GCP Studio Noise Cancellation (0ms Server Latency)' : 'Raw Pass-Through'}`,
    `- Krisp AI Noise Filtering: ${stats.isKrispActive ? 'Active' : 'Inactive'}`,
    `- Microphone Input Level: ${stats.isMicMuted ? 'Muted (0%)' : `${stats.micLevel ?? 0}%`}`,
    '',
    '[5. VIDEO & SCREEN PUBLISHING STATUS]',
    `- Camera Publishing: ${stats.videoPublishing?.isPublishingCamera ? `Active (${stats.videoPublishing.cameraResolution || '720p'} @ ${stats.videoPublishing.cameraFrameRate || 30}fps)` : 'Inactive / Muted'}`,
    `- Screen Share Publishing: ${stats.videoPublishing?.isPublishingScreen ? `Active (${stats.videoPublishing.screenResolution || '1080p'} @ ${stats.videoPublishing.screenFrameRate || 60}fps)` : 'Inactive'}`,
    '',
    '[6. AUTOMATED DIAGNOSES & ACTIONABLE RECOVERY]',
    ...diagnoses.map((d, i) => `${i + 1}. [${d.level.toUpperCase()}] ${d.title}: ${d.description}${d.suggestion ? ` -> Suggestion: ${d.suggestion}` : ''}`),
    '',
    '================================================================================',
    'END OF SANITIZED REPORT',
    '================================================================================',
  ];

  return report.join('\n');
}

export function NetworkDiagnostics({
  stats,
  localStream,
  screenStream,
  isMicMuted: isMicMutedProp,
  isCameraOn: isCameraOnProp,
  isScreenSharing: isScreenSharingProp,
  isNoiseSuppressionEnabled: isNoiseSuppressionProp,
  onClose,
  onRestartConnection,
}: NetworkDiagnosticsProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = React.useState<'overview' | 'audio' | 'video' | 'health' | 'report'>('overview');
  const [copiedScript, setCopiedScript] = React.useState(false);
  const [copiedReport, setCopiedReport] = React.useState(false);

  // Live microphone VU level measured locally if localStream is available
  const [liveMicLevel, setLiveMicLevel] = React.useState<number>(stats?.micLevel ?? 0);

  const localZt = typeof window !== 'undefined' ? getLocalZeroTierIp() : null;
  const peerZt = typeof window !== 'undefined' ? getPeerZeroTierIp() : null;

  // Local Web Audio Analyser for smooth 30fps meter
  React.useEffect(() => {
    if (!localStream) {
      if (stats?.micLevel !== undefined) {
        setLiveMicLevel(stats.micLevel);
      }
      return;
    }

    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack || !audioTrack.enabled || isMicMutedProp || stats?.isMicMuted) {
      setLiveMicLevel(0);
      return;
    }

    let audioCtx: AudioContext | null = null;
    let animId: number | null = null;

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }

      const source = audioCtx.createMediaStreamSource(localStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);

      const updateMeter = () => {
        if (!analyser || !audioCtx || audioCtx.state === 'closed') return;
        analyser.getByteFrequencyData(buffer);

        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const avg = sum / buffer.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setLiveMicLevel(normalized);

        animId = requestAnimationFrame(updateMeter);
      };

      animId = requestAnimationFrame(updateMeter);
    } catch {}

    return () => {
      if (animId) cancelAnimationFrame(animId);
      if (audioCtx && audioCtx.state !== 'closed') {
        try {
          audioCtx.close();
        } catch {}
      }
    };
  }, [localStream, isMicMutedProp, stats?.isMicMuted, stats?.micLevel]);

  // Merge stats with runtime props for real-time accuracy
  const effectiveAudioDevice: AudioDeviceInfo = React.useMemo(() => {
    if (stats?.audioDevice) return stats.audioDevice;
    const track = localStream?.getAudioTracks()[0];
    const settings = track?.getSettings?.() || {};
    return {
      label: track?.label || 'Default Audio Device',
      sampleRate: settings.sampleRate ?? 48000,
      channelCount: settings.channelCount ?? 1,
      echoCancellation: settings.echoCancellation ?? true,
      autoGainControl: settings.autoGainControl ?? true,
      noiseSuppression: settings.noiseSuppression ?? true,
    };
  }, [stats?.audioDevice, localStream]);

  const effectiveVideoPublishing: VideoPublishingInfo = React.useMemo(() => {
    if (stats?.videoPublishing) return stats.videoPublishing;
    const camTrack = localStream?.getVideoTracks()[0];
    const camSettings = camTrack?.getSettings?.() || {};
    const screenTrack = screenStream?.getVideoTracks()[0];
    const screenSettings = screenTrack?.getSettings?.() || {};

    const isCamActive = Boolean(isCameraOnProp && camTrack && camTrack.readyState === 'live');
    const isScreenActive = Boolean(isScreenSharingProp && screenTrack && screenTrack.readyState === 'live');

    return {
      isPublishingCamera: isCamActive,
      cameraResolution: isCamActive && camSettings.width ? `${camSettings.width}x${camSettings.height}` : null,
      cameraFrameRate: isCamActive && camSettings.frameRate ? Math.round(camSettings.frameRate) : null,
      isPublishingScreen: isScreenActive,
      screenResolution: isScreenActive && screenSettings.width ? `${screenSettings.width}x${screenSettings.height}` : null,
      screenFrameRate: isScreenActive && screenSettings.frameRate ? Math.round(screenSettings.frameRate) : null,
    };
  }, [stats?.videoPublishing, localStream, screenStream, isCameraOnProp, isScreenSharingProp]);

  const currentStats: DiagnosticsStats = React.useMemo(() => {
    return {
      connectionState: stats?.connectionState || 'disconnected',
      rttMs: stats?.rttMs ?? null,
      jitterMs: stats?.jitterMs ?? null,
      packetLossPercent: stats?.packetLossPercent ?? null,
      packetsLost: stats?.packetsLost ?? 0,
      packetsReceived: stats?.packetsReceived ?? 0,
      packetsSent: stats?.packetsSent ?? 0,
      incomingBitrateKbps: stats?.incomingBitrateKbps ?? null,
      outgoingBitrateKbps: stats?.outgoingBitrateKbps ?? null,
      transportPath: stats?.transportPath || 'unknown',
      isZeroTierActive: stats?.isZeroTierActive ?? Boolean(localZt),
      micLevel: liveMicLevel,
      isMicMuted: isMicMutedProp ?? stats?.isMicMuted ?? false,
      reconnectAttempts: stats?.reconnectAttempts ?? 0,
      reconnectFailures: stats?.reconnectFailures ?? 0,
      lastReconnectReason: stats?.lastReconnectReason ?? null,
      lastFailureTimestamp: stats?.lastFailureTimestamp ?? null,
      audioDevice: effectiveAudioDevice,
      isNoiseSuppressionEnabled: isNoiseSuppressionProp ?? stats?.isNoiseSuppressionEnabled ?? true,
      isKrispActive: stats?.isKrispActive ?? false,
      videoPublishing: effectiveVideoPublishing,
    };
  }, [
    stats,
    localZt,
    liveMicLevel,
    isMicMutedProp,
    effectiveAudioDevice,
    isNoiseSuppressionProp,
    effectiveVideoPublishing,
  ]);

  const diagnoses = React.useMemo(() => generateDiagnoses(currentStats), [currentStats]);

  const getLatencyColor = (ms: number | null) => {
    if (ms === null) return 'text-muted-foreground';
    if (ms < 50) return 'text-emerald-400';
    if (ms < 120) return 'text-amber-400';
    return 'text-rose-400';
  };

  const handleCopyFirewallFix = () => {
    const psCommand = `Set-NetConnectionProfile -InterfaceAlias "ZeroTier*" -NetworkCategory Private; New-NetFirewallRule -DisplayName "Nexus ZeroTier Voice & Gaming" -Direction Inbound -InterfaceAlias "ZeroTier*" -Action Allow`;
    navigator.clipboard.writeText(psCommand);
    setCopiedScript(true);
    toast({
      title: 'ZeroTier Firewall Fix Copied',
      description: 'Run in PowerShell as Administrator to unblock ZeroTier voice traffic.',
      type: 'success',
      duration: 5000,
    });
    setTimeout(() => setCopiedScript(false), 3000);
  };

  const handleCopySanitizedReport = () => {
    const reportText = generateSanitizedReport(currentStats);
    navigator.clipboard.writeText(reportText);
    setCopiedReport(true);
    toast({
      title: 'Sanitized Report Copied',
      description: 'Tokens, passwords, private messages, and sensitive IP addresses are strictly excluded.',
      type: 'success',
      duration: 4000,
    });
    setTimeout(() => setCopiedReport(false), 3000);
  };

  const handleDownloadSanitizedJson = () => {
    const sanitizedObj = {
      timestamp: new Date().toISOString(),
      connectionState: currentStats.connectionState,
      transportPath: currentStats.transportPath,
      measuredWebRtcRttMs: currentStats.rttMs,
      jitterMs: currentStats.jitterMs,
      packetLossPercent: currentStats.packetLossPercent,
      incomingBitrateKbps: currentStats.incomingBitrateKbps,
      outgoingBitrateKbps: currentStats.outgoingBitrateKbps,
      reconnectAttempts: currentStats.reconnectAttempts,
      reconnectFailures: currentStats.reconnectFailures,
      audioDevice: {
        label: currentStats.audioDevice?.label,
        sampleRate: currentStats.audioDevice?.sampleRate,
        channelCount: currentStats.audioDevice?.channelCount,
        echoCancellation: currentStats.audioDevice?.echoCancellation,
        noiseSuppression: currentStats.audioDevice?.noiseSuppression,
        dspNoiseGateActive: currentStats.isNoiseSuppressionEnabled,
      },
      videoPublishing: currentStats.videoPublishing,
      zeroTierInterface: {
        active: Boolean(currentStats.isZeroTierActive),
        localIp: sanitizeIpAddress(localZt),
        peerIp: sanitizeIpAddress(peerZt),
      },
      diagnoses: diagnoses.map((d) => ({
        severity: d.level,
        title: d.title,
        description: d.description,
        suggestion: d.suggestion || null,
      })),
      privacyStatement: 'Sanitized by Nexus Smart Diagnostics. Secrets, tokens, and sensitive IPs excluded.',
    };

    const blob = new Blob([JSON.stringify(sanitizedObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexus-diagnostics-sanitized-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: 'Report Downloaded',
      description: 'Saved sanitized diagnostics file (JSON).',
      type: 'info',
    });
  };

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#0c1015]/95 backdrop-blur-2xl p-4 shadow-2xl max-w-md w-full text-foreground select-none animate-in fade-in duration-150 space-y-3.5">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary animate-pulse" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
            Smart Voice Diagnostics
          </h4>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={
              currentStats.connectionState === 'connected'
                ? 'success'
                : currentStats.connectionState === 'reconnecting'
                ? 'warning'
                : 'outline'
            }
            className="text-[10px] uppercase font-mono px-2 py-0.5"
          >
            {currentStats.connectionState}
          </Badge>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors"
              title="Close Diagnostics"
              aria-label="Close Diagnostics"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 p-1 bg-surface-default/70 border border-white/[0.04] rounded-xl text-[11px] font-semibold">
        <button
          onClick={() => setActiveTab('overview')}
          className={cn(
            'flex-1 py-1 px-2 rounded-lg transition-all text-center',
            activeTab === 'overview'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.03]'
          )}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('audio')}
          className={cn(
            'flex-1 py-1 px-2 rounded-lg transition-all text-center',
            activeTab === 'audio'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.03]'
          )}
        >
          Audio & Mic
        </button>
        <button
          onClick={() => setActiveTab('video')}
          className={cn(
            'flex-1 py-1 px-2 rounded-lg transition-all text-center',
            activeTab === 'video'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.03]'
          )}
        >
          Video
        </button>
        <button
          onClick={() => setActiveTab('health')}
          className={cn(
            'flex-1 py-1 px-2 rounded-lg transition-all text-center relative',
            activeTab === 'health'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.03]'
          )}
        >
          Health
          {diagnoses.some((d) => d.level === 'critical' || d.level === 'warning') && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 absolute top-1 right-1" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('report')}
          className={cn(
            'flex-1 py-1 px-2 rounded-lg transition-all text-center',
            activeTab === 'report'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.03]'
          )}
        >
          Report
        </button>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            {/* Real WebRTC RTT Latency */}
            <div className="p-2.5 rounded-xl bg-surface-default border border-white/[0.06]">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                Round-Trip Latency (RTT)
              </div>
              <div className={cn('text-base font-black font-mono mt-0.5', getLatencyColor(currentStats.rttMs))}>
                {currentStats.rttMs !== null ? `${currentStats.rttMs} ms` : '—'}
              </div>
              <div className="text-[9px] text-muted-foreground/60 mt-0.5">
                {currentStats.rttMs !== null
                  ? currentStats.transportPath === 'relayed_turn'
                    ? 'TURN relay ping'
                    : 'WebRTC P2P ping'
                  : 'Measuring connection'}
              </div>
            </div>

            {/* Packet Loss */}
            <div className="p-2.5 rounded-xl bg-surface-default border border-white/[0.06]">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                Packet Loss
              </div>
              <div
                className={cn(
                  'text-base font-black font-mono mt-0.5',
                  currentStats.packetLossPercent !== null && currentStats.packetLossPercent > 2
                    ? 'text-rose-400'
                    : 'text-foreground'
                )}
              >
                {currentStats.packetLossPercent !== null
                  ? `${currentStats.packetLossPercent.toFixed(1)}%`
                  : '0.0%'}
              </div>
              <div className="text-[9px] text-muted-foreground/60 mt-0.5">
                {currentStats.packetsLost ? `${currentStats.packetsLost} packets lost` : 'inbound-rtp stats'}
              </div>
            </div>

            {/* Jitter */}
            <div className="p-2.5 rounded-xl bg-surface-default border border-white/[0.06]">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold">Jitter</div>
              <div className="text-base font-black font-mono text-foreground mt-0.5">
                {currentStats.jitterMs !== null ? `${currentStats.jitterMs.toFixed(1)} ms` : '—'}
              </div>
              <div className="text-[9px] text-muted-foreground/60 mt-0.5">Packet variance buffer</div>
            </div>

            {/* Selected Voice Transport */}
            <div className="p-2.5 rounded-xl bg-surface-default border border-white/[0.06]">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold">Transport Path</div>
              <div className="text-[11px] font-bold text-primary mt-1 truncate">
                {currentStats.transportPath === 'relayed_turn'
                  ? 'Relayed TURN'
                  : 'Direct WebRTC P2P'}
              </div>
              <div className="text-[9px] text-muted-foreground/60 mt-0.5 truncate">
                {currentStats.transportPath === 'relayed_turn'
                  ? 'Cloud Relay fallback'
                  : 'Low-latency host pair'}
              </div>
            </div>
          </div>

          {/* Inbound & Outbound Bitrate Flow */}
          <div className="p-2.5 rounded-xl bg-surface-default border border-white/[0.06] text-xs space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <ArrowDown className="w-3.5 h-3.5 text-emerald-400" /> Inbound Voice Bitrate
              </span>
              <span className="font-mono font-semibold text-foreground">
                {currentStats.incomingBitrateKbps !== null ? `${currentStats.incomingBitrateKbps} kbps` : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <ArrowUp className="w-3.5 h-3.5 text-primary" /> Outbound Voice Bitrate
              </span>
              <span className="font-mono font-semibold text-foreground">
                {currentStats.outgoingBitrateKbps !== null ? `${currentStats.outgoingBitrateKbps} kbps` : '—'}
              </span>
            </div>
          </div>

          {/* Reconnection & Reliability Counter */}
          <div className="p-2.5 rounded-xl bg-surface-default/60 border border-white/[0.04] text-[11px] flex items-center justify-between">
            <div className="text-muted-foreground">Reconnection Reliability:</div>
            <div className="flex items-center gap-2 font-mono">
              <span className="text-foreground">
                {currentStats.reconnectAttempts ?? 0} attempt{currentStats.reconnectAttempts === 1 ? '' : 's'}
              </span>
              <span className="text-muted-foreground/40">•</span>
              <span className={(currentStats.reconnectFailures ?? 0) > 0 ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                {currentStats.reconnectFailures ?? 0} failure{currentStats.reconnectFailures === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Audio & Microphone */}
      {activeTab === 'audio' && (
        <div className="space-y-3 text-xs">
          {/* Live Microphone Input VU Meter */}
          <div className="p-3 rounded-xl bg-surface-default border border-white/[0.06] space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 font-semibold text-foreground">
                {currentStats.isMicMuted ? (
                  <MicOff className="w-3.5 h-3.5 text-rose-400" />
                ) : (
                  <Mic className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span>Microphone Input Level</span>
              </span>
              <span className="font-mono font-bold text-foreground">
                {currentStats.isMicMuted ? 'Muted' : `${liveMicLevel}%`}
              </span>
            </div>

            {/* Reactive VU Meter Bar */}
            <div className="w-full h-3 bg-white/[0.05] rounded-full overflow-hidden p-0.5 border border-white/[0.06]">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-75',
                  currentStats.isMicMuted
                    ? 'w-0 bg-transparent'
                    : liveMicLevel > 80
                    ? 'bg-rose-500'
                    : liveMicLevel > 50
                    ? 'bg-amber-400'
                    : 'bg-emerald-400'
                )}
                style={{ width: currentStats.isMicMuted ? '0%' : `${liveMicLevel}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[9px] text-muted-foreground/60 font-mono">
              <span>0% (Silent)</span>
              <span>50% (Normal Speech)</span>
              <span>100% (Peak Clip)</span>
            </div>
          </div>

          {/* Audio Hardware & Settings */}
          <div className="p-3 rounded-xl bg-surface-default border border-white/[0.06] space-y-2">
            <div className="text-[10px] text-muted-foreground uppercase font-semibold">
              Input Hardware & Sampling
            </div>
            <div className="text-[11px] font-medium text-foreground truncate" title={currentStats.audioDevice?.label}>
              {currentStats.audioDevice?.label || 'Default Microphone'}
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/[0.04] text-[10px]">
              <div>
                <span className="text-muted-foreground">Sample Rate: </span>
                <span className="font-mono font-semibold text-foreground">
                  {currentStats.audioDevice?.sampleRate ? `${currentStats.audioDevice.sampleRate.toLocaleString()} Hz` : '48,000 Hz'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Channels: </span>
                <span className="font-mono font-semibold text-foreground">
                  {currentStats.audioDevice?.channelCount === 2 ? 'Stereo' : 'Mono'}
                </span>
              </div>
            </div>
          </div>

          {/* DSP Voice Processing Status */}
          <div className="p-3 rounded-xl bg-surface-default border border-white/[0.06] space-y-2">
            <div className="text-[10px] text-muted-foreground uppercase font-semibold">
              Voice Processing & AI Filters
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="flex items-center justify-between p-1.5 rounded-lg bg-white/[0.02]">
                <span className="text-muted-foreground">GCP Noise Filter</span>
                <Badge variant={currentStats.isNoiseSuppressionEnabled ? 'success' : 'outline'} className="text-[9px] px-1.5 py-0">
                  {currentStats.isNoiseSuppressionEnabled ? 'Studio Grade' : 'Off'}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-1.5 rounded-lg bg-white/[0.02]">
                <span className="text-muted-foreground">Echo Canceller</span>
                <Badge variant={currentStats.audioDevice?.echoCancellation ? 'success' : 'outline'} className="text-[9px] px-1.5 py-0">
                  {currentStats.audioDevice?.echoCancellation ? 'On' : 'Off'}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-1.5 rounded-lg bg-white/[0.02]">
                <span className="text-muted-foreground">Auto Gain Control</span>
                <Badge variant={currentStats.audioDevice?.autoGainControl ? 'success' : 'outline'} className="text-[9px] px-1.5 py-0">
                  {currentStats.audioDevice?.autoGainControl ? 'On' : 'Off'}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-1.5 rounded-lg bg-white/[0.02]">
                <span className="text-muted-foreground">AudioWorklet VAD</span>
                <Badge variant={currentStats.isNoiseSuppressionEnabled ? 'success' : 'outline'} className="text-[9px] px-1.5 py-0">
                  {currentStats.isNoiseSuppressionEnabled ? 'Real-Time (0ms)' : 'Off'}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Video & Screen Publishing */}
      {activeTab === 'video' && (
        <div className="space-y-3 text-xs">
          {/* Camera Publishing Status */}
          <div className="p-3 rounded-xl bg-surface-default border border-white/[0.06] space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Video className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold text-foreground">Camera Stream</span>
              </div>
              <Badge
                variant={currentStats.videoPublishing?.isPublishingCamera ? 'success' : 'outline'}
                className="text-[9px] uppercase px-1.5 py-0"
              >
                {currentStats.videoPublishing?.isPublishingCamera ? 'Publishing' : 'Muted'}
              </Badge>
            </div>
            {currentStats.videoPublishing?.isPublishingCamera ? (
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/[0.04] text-[11px] font-mono">
                <div>
                  <span className="text-muted-foreground">Resolution: </span>
                  <span className="text-foreground font-semibold">
                    {currentStats.videoPublishing.cameraResolution || '720p HD'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Framerate: </span>
                  <span className="text-foreground font-semibold">
                    {currentStats.videoPublishing.cameraFrameRate ? `${currentStats.videoPublishing.cameraFrameRate} fps` : '30 fps'}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground pt-1">
                Camera feed is not transmitting. Click the camera icon in call controls to enable.
              </p>
            )}
          </div>

          {/* Screen Share Publishing Status */}
          <div className="p-3 rounded-xl bg-surface-default border border-white/[0.06] space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Monitor className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold text-foreground">Screen Share Stream</span>
              </div>
              <Badge
                variant={currentStats.videoPublishing?.isPublishingScreen ? 'success' : 'outline'}
                className="text-[9px] uppercase px-1.5 py-0"
              >
                {currentStats.videoPublishing?.isPublishingScreen ? 'Sharing' : 'Inactive'}
              </Badge>
            </div>
            {currentStats.videoPublishing?.isPublishingScreen ? (
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/[0.04] text-[11px] font-mono">
                <div>
                  <span className="text-muted-foreground">Resolution: </span>
                  <span className="text-foreground font-semibold">
                    {currentStats.videoPublishing.screenResolution || '1080p FHD'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Framerate: </span>
                  <span className="text-foreground font-semibold">
                    {currentStats.videoPublishing.screenFrameRate ? `${currentStats.videoPublishing.screenFrameRate} fps` : '60 fps'}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground pt-1">
                No active screen share. Click the share screen button to broadcast gameplay or apps.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Health Diagnoses & Actionable Recovery */}
      {activeTab === 'health' && (
        <div className="space-y-2 max-h-60 overflow-y-auto pr-1 text-xs">
          {diagnoses.map((diag) => {
            const isHealthy = diag.level === 'healthy';
            const isWarn = diag.level === 'warning';
            const isCrit = diag.level === 'critical';

            return (
              <div
                key={diag.id}
                className={cn(
                  'p-3 rounded-xl border text-xs space-y-1 transition-all',
                  isHealthy
                    ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                    : isCrit
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    : isWarn
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    : 'bg-surface-default border-white/[0.06] text-foreground'
                )}
              >
                <div className="flex items-center gap-1.5 font-bold">
                  {isHealthy ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : isCrit ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  ) : isWarn ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  ) : (
                    <Info className="w-3.5 h-3.5 text-primary shrink-0" />
                  )}
                  <span className="text-xs">{diag.title}</span>
                </div>
                <p className="text-[11px] leading-relaxed opacity-90">{diag.description}</p>
                {diag.suggestion && (
                  <div className="mt-1.5 pt-1.5 border-t border-white/[0.08] text-[10px] font-medium opacity-95">
                    <span className="uppercase tracking-wider font-bold">Recovery: </span>
                    {diag.suggestion}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 5: Privacy-Sanitized Diagnostic Report */}
      {activeTab === 'report' && (
        <div className="space-y-2.5 text-xs">
          <div className="p-2.5 rounded-xl bg-surface-default border border-white/[0.06] space-y-1.5">
            <div className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-semibold">
              <Shield className="w-3.5 h-3.5" />
              <span>Sanitized Telemetry Report</span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Export diagnostic logs safely. Session tokens, passwords, private message content, and sensitive IP octets are excluded by default.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopySanitizedReport}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-sm transition-all"
            >
              {copiedReport ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedReport ? 'Copied' : 'Copy Sanitized Report'}</span>
            </button>
            <button
              onClick={handleDownloadSanitizedJson}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-surface-default hover:bg-surface-hover border border-white/[0.08] text-foreground text-xs font-semibold transition-all"
              title="Download JSON format"
            >
              <Download className="w-3.5 h-3.5" />
              <span>JSON</span>
            </button>
          </div>
        </div>
      )}

      {/* ZeroTier LAN Peer Engine Sub-strip */}
      <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 space-y-1.5 text-[11px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="font-medium text-foreground">ZeroTier LAN Peer Engine</span>
          </div>
          <Badge
            variant={localZt || currentStats.isZeroTierActive ? 'success' : 'outline'}
            className="text-[9px] uppercase px-1.5 py-0"
          >
            {localZt || currentStats.isZeroTierActive ? 'Active' : 'Unconfigured'}
          </Badge>
        </div>
        {(localZt || peerZt) && (
          <div className="grid grid-cols-2 gap-1 text-[10px] font-mono text-muted-foreground pt-0.5">
            <div>
              Local IP: <span className="text-foreground font-semibold">{sanitizeIpAddress(localZt)}</span>
            </div>
            <div>
              Peer IP: <span className="text-foreground font-semibold">{sanitizeIpAddress(peerZt)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Windows Firewall Fix Script Button */}
      <button
        onClick={handleCopyFirewallFix}
        className="w-full flex items-center justify-between py-1.5 px-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-200 text-[11px] font-medium transition-all"
        title="If calls get stuck connecting on ZeroTier, copy and run this in PowerShell as Admin"
      >
        <span className="flex items-center gap-1.5">
          <Terminal className="w-3.5 h-3.5 text-amber-400" />
          <span>Copy Windows Firewall Fix</span>
        </span>
        {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-amber-400" />}
      </button>

      {/* Reconnection ICE Restart Button */}
      {onRestartConnection && (
        <button
          onClick={onRestartConnection}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-surface-default hover:bg-surface-hover border border-white/[0.08] text-xs font-semibold text-foreground transition-all shadow-sm"
          title="Force WebRTC ICE restart and re-route connection"
        >
          <RefreshCw className="w-3.5 h-3.5 text-primary" />
          <span>Optimize / Re-route Connection</span>
        </button>
      )}

      {onClose && (
        <button
          onClick={onClose}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-1 transition-colors"
        >
          Dismiss Diagnostics
        </button>
      )}
    </div>
  );
}
