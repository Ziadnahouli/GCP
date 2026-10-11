'use client';

import * as React from 'react';
import {
  Activity,
  Wifi,
  ShieldCheck,
  Server,
  Zap,
  Radio,
  ArrowDown,
  ArrowUp,
  Cpu,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface DiagnosticsStats {
  connectionState: 'connected' | 'connecting' | 'reconnecting' | 'disconnected';
  rttMs: number;
  jitterMs: number;
  packetLossPercent: number;
  incomingBitrateKbps: number;
  outgoingBitrateKbps: number;
  transportPath: 'direct_p2p' | 'relayed_turn' | 'livekit_sfu';
  isZeroTierActive?: boolean;
}

interface NetworkDiagnosticsProps {
  stats?: DiagnosticsStats;
  onClose?: () => void;
}

export function NetworkDiagnostics({ stats, onClose }: NetworkDiagnosticsProps) {
  // Default real-time simulated gaming telemetry if live stats not yet fed
  const currentStats: DiagnosticsStats = stats || {
    connectionState: 'connected',
    rttMs: 24,
    jitterMs: 2.1,
    packetLossPercent: 0.0,
    incomingBitrateKbps: 384,
    outgoingBitrateKbps: 128,
    transportPath: 'direct_p2p',
    isZeroTierActive: true,
  };

  const getLatencyColor = (ms: number) => {
    if (ms < 50) return 'text-emerald-400';
    if (ms < 120) return 'text-amber-400';
    return 'text-rose-400';
  };

  return (
    <div className="rounded-2xl border border-border bg-card/95 backdrop-blur-xl p-4 shadow-2xl max-w-sm w-full text-foreground select-none animate-in fade-in duration-150">
      <div className="flex items-center justify-between border-b border-border/80 pb-3 mb-3">
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

      <div className="grid grid-cols-2 gap-2.5 text-xs mb-3">
        {/* RTT / Ping */}
        <div className="p-2.5 rounded-xl bg-surface-default border border-border/60">
          <div className="text-[10px] text-muted-foreground uppercase font-semibold">Latency / RTT</div>
          <div className={cn('text-base font-black font-mono mt-0.5', getLatencyColor(currentStats.rttMs))}>
            {currentStats.rttMs} ms
          </div>
        </div>

        {/* Packet Loss */}
        <div className="p-2.5 rounded-xl bg-surface-default border border-border/60">
          <div className="text-[10px] text-muted-foreground uppercase font-semibold">Packet Loss</div>
          <div className="text-base font-black font-mono text-foreground mt-0.5">
            {currentStats.packetLossPercent.toFixed(1)}%
          </div>
        </div>

        {/* Jitter */}
        <div className="p-2.5 rounded-xl bg-surface-default border border-border/60">
          <div className="text-[10px] text-muted-foreground uppercase font-semibold">Jitter</div>
          <div className="text-base font-black font-mono text-foreground mt-0.5">
            {currentStats.jitterMs.toFixed(1)} ms
          </div>
        </div>

        {/* Transport Path */}
        <div className="p-2.5 rounded-xl bg-surface-default border border-border/60">
          <div className="text-[10px] text-muted-foreground uppercase font-semibold">Media Path</div>
          <div className="text-[11px] font-bold text-primary mt-1 truncate">
            {currentStats.transportPath === 'direct_p2p'
              ? 'Direct P2P / LAN'
              : currentStats.transportPath === 'livekit_sfu'
              ? 'LiveKit SFU'
              : 'Relayed TURN'}
          </div>
        </div>
      </div>

      {/* Bitrate Flow */}
      <div className="p-2.5 rounded-xl bg-surface-default border border-border/60 text-xs mb-3 space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <ArrowDown className="w-3.5 h-3.5 text-emerald-400" /> Inbound Bitrate
          </span>
          <span className="font-mono font-semibold text-foreground">
            {currentStats.incomingBitrateKbps} kbps
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <ArrowUp className="w-3.5 h-3.5 text-primary" /> Outbound Bitrate
          </span>
          <span className="font-mono font-semibold text-foreground">
            {currentStats.outgoingBitrateKbps} kbps
          </span>
        </div>
      </div>

      {/* ZeroTier LAN Diagnostic Status */}
      <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-2">
          <Radio className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="font-medium text-foreground">ZeroTier LAN Peer Engine</span>
        </div>
        <Badge variant="subtle" className="text-[9px] uppercase px-1.5 py-0">
          Active
        </Badge>
      </div>

      {onClose && (
        <button
          onClick={onClose}
          className="w-full mt-3 text-center text-xs text-muted-foreground hover:text-foreground py-1 transition-colors"
        >
          Dismiss Diagnostics
        </button>
      )}
    </div>
  );
}
