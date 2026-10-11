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
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getLocalZeroTierIp, getPeerZeroTierIp } from '@/lib/webrtc/ice-config';
import { useToast } from '@/components/ui/toast';

export interface DiagnosticsStats {
  connectionState: 'connected' | 'connecting' | 'reconnecting' | 'disconnected';
  rttMs: number | null;
  jitterMs: number | null;
  packetLossPercent: number | null;
  incomingBitrateKbps: number | null;
  outgoingBitrateKbps: number | null;
  transportPath: 'direct_p2p' | 'relayed_turn' | 'livekit_sfu' | 'unknown';
  isZeroTierActive?: boolean;
}

interface NetworkDiagnosticsProps {
  stats?: DiagnosticsStats;
  onClose?: () => void;
  onRestartConnection?: () => void;
}

export function NetworkDiagnostics({ stats, onClose, onRestartConnection }: NetworkDiagnosticsProps) {
  const { toast } = useToast();
  const [copiedScript, setCopiedScript] = React.useState(false);

  const localZt = typeof window !== 'undefined' ? getLocalZeroTierIp() : null;
  const peerZt = typeof window !== 'undefined' ? getPeerZeroTierIp() : null;

  const currentStats: DiagnosticsStats = stats || {
    connectionState: 'disconnected',
    rttMs: null,
    jitterMs: null,
    packetLossPercent: null,
    incomingBitrateKbps: null,
    outgoingBitrateKbps: null,
    transportPath: 'unknown',
    isZeroTierActive: Boolean(localZt),
  };

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

  return (
    <div className="rounded-2xl border border-border bg-card/95 backdrop-blur-xl p-4 shadow-2xl max-w-sm w-full text-foreground select-none animate-in fade-in duration-150 space-y-3">
      <div className="flex items-center justify-between border-b border-border/80 pb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary animate-pulse" />
          <h4 className="text-xs font-bold uppercase tracking-wider">Network Diagnostics</h4>
        </div>
        <Badge
          variant={currentStats.connectionState === 'connected' ? 'success' : 'warning'}
          className="text-[10px] uppercase font-mono px-2 py-0.5"
        >
          {currentStats.connectionState}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        {/* RTT / Ping */}
        <div className="p-2.5 rounded-xl bg-surface-default border border-border/60">
          <div className="text-[10px] text-muted-foreground uppercase font-semibold">Latency / RTT</div>
          <div className={cn('text-base font-black font-mono mt-0.5', getLatencyColor(currentStats.rttMs))}>
            {currentStats.rttMs !== null ? `${currentStats.rttMs} ms` : '—'}
          </div>
        </div>

        {/* Packet Loss */}
        <div className="p-2.5 rounded-xl bg-surface-default border border-border/60">
          <div className="text-[10px] text-muted-foreground uppercase font-semibold">Packet Loss</div>
          <div className="text-base font-black font-mono text-foreground mt-0.5">
            {currentStats.packetLossPercent !== null
              ? `${currentStats.packetLossPercent.toFixed(1)}%`
              : '0.0%'}
          </div>
        </div>

        {/* Jitter */}
        <div className="p-2.5 rounded-xl bg-surface-default border border-border/60">
          <div className="text-[10px] text-muted-foreground uppercase font-semibold">Jitter</div>
          <div className="text-base font-black font-mono text-foreground mt-0.5">
            {currentStats.jitterMs !== null ? `${currentStats.jitterMs.toFixed(1)} ms` : '—'}
          </div>
        </div>

        {/* Transport Path */}
        <div className="p-2.5 rounded-xl bg-surface-default border border-border/60">
          <div className="text-[10px] text-muted-foreground uppercase font-semibold">Media Path</div>
          <div className="text-[11px] font-bold text-primary mt-1 truncate">
            {currentStats.transportPath === 'direct_p2p'
              ? 'Direct P2P'
              : currentStats.transportPath === 'livekit_sfu'
              ? 'LiveKit SFU'
              : currentStats.transportPath === 'relayed_turn'
              ? 'Relayed TURN'
              : 'Direct P2P'}
          </div>
        </div>
      </div>

      {/* Bitrate Flow */}
      <div className="p-2.5 rounded-xl bg-surface-default border border-border/60 text-xs space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <ArrowDown className="w-3.5 h-3.5 text-emerald-400" /> Inbound Bitrate
          </span>
          <span className="font-mono font-semibold text-foreground">
            {currentStats.incomingBitrateKbps !== null
              ? `${currentStats.incomingBitrateKbps} kbps`
              : '—'}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <ArrowUp className="w-3.5 h-3.5 text-primary" /> Outbound Bitrate
          </span>
          <span className="font-mono font-semibold text-foreground">
            {currentStats.outgoingBitrateKbps !== null
              ? `${currentStats.outgoingBitrateKbps} kbps`
              : '—'}
          </span>
        </div>
      </div>

      {/* ZeroTier LAN Diagnostic Status */}
      <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 space-y-1.5 text-[11px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="font-medium text-foreground">ZeroTier LAN Peer Engine</span>
          </div>
          <Badge variant={localZt || currentStats.isZeroTierActive ? 'success' : 'outline'} className="text-[9px] uppercase px-1.5 py-0">
            {localZt || currentStats.isZeroTierActive ? 'Active' : 'Unconfigured'}
          </Badge>
        </div>
        {(localZt || peerZt) && (
          <div className="grid grid-cols-2 gap-1 text-[10px] font-mono text-muted-foreground pt-0.5">
            <div>Local IP: <span className="text-foreground font-semibold">{localZt || 'Pending'}</span></div>
            <div>Peer IP: <span className="text-foreground font-semibold">{peerZt || 'Pending'}</span></div>
          </div>
        )}
      </div>

      {/* Windows Firewall Fix Button */}
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

      {onRestartConnection && (
        <button
          onClick={onRestartConnection}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-surface-default hover:bg-surface-hover border border-border/70 text-xs font-semibold text-foreground transition-all shadow-sm"
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
