'use client';

import * as React from 'react';
import { Volume2, PhoneOff, Mic, MicOff, Headphones, VolumeX, Radio, Signal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoiceConnectedBarProps {
  channelName: string;
  serverName?: string;
  isMuted?: boolean;
  isDeafened?: boolean;
  onDisconnect: () => void;
  onToggleMic?: () => void;
  onToggleDeafen?: () => void;
  onClick?: () => void;
}

export function VoiceConnectedBar({
  channelName,
  serverName,
  isMuted,
  isDeafened,
  onDisconnect,
  onToggleMic,
  onToggleDeafen,
  onClick,
}: VoiceConnectedBarProps) {
  return (
    <div className="border-t border-success/20 bg-surface-sidebar/95 backdrop-blur-md px-3 py-2 flex items-center justify-between text-xs transition-all shadow-[0_-4px_12px_rgba(0,0,0,0.25)] select-none">
      {/* Left section: status + channel info */}
      <div
        onClick={onClick}
        className={cn(
          'flex items-center gap-2 min-w-0 flex-1',
          onClick && 'cursor-pointer hover:opacity-90 group'
        )}
      >
        <div className="relative shrink-0 flex items-center justify-center w-7 h-7 rounded-lg bg-success/15 border border-success/30 text-success">
          <Signal className="w-3.5 h-3.5 animate-pulse text-success" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-success ring-2 ring-surface-sidebar animate-ping" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold text-success flex items-center gap-1 leading-tight">
            <span>Voice Connected</span>
            <span className="text-xs font-mono text-success/70 font-normal">/ RTC HD</span>
          </div>
          <div className="text-xs text-muted-foreground truncate leading-tight mt-0.5 group-hover:text-foreground transition-colors">
            {channelName}
            {serverName && <span className="opacity-60 ml-1">({serverName})</span>}
          </div>
        </div>
      </div>

      {/* Right section: Disconnect button + quick toggles */}
      <div className="flex items-center gap-1 shrink-0 ml-2">
        {onToggleMic && (
          <button
            type="button"
            onClick={onToggleMic}
            className={cn(
              'p-1.5 rounded-lg border transition-all text-xs',
              isMuted
                ? 'bg-danger/15 border-danger/30 text-danger hover:bg-danger/25'
                : 'hover:bg-surface-hover border-transparent text-muted-foreground hover:text-foreground'
            )}
            title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
          >
            {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          </button>
        )}

        {onToggleDeafen && (
          <button
            type="button"
            onClick={onToggleDeafen}
            className={cn(
              'p-1.5 rounded-lg border transition-all text-xs',
              isDeafened
                ? 'bg-danger/15 border-danger/30 text-danger hover:bg-danger/25'
                : 'hover:bg-surface-hover border-transparent text-muted-foreground hover:text-foreground'
            )}
            title={isDeafened ? 'Undeafen' : 'Deafen'}
          >
            {isDeafened ? <VolumeX className="w-3.5 h-3.5" /> : <Headphones className="w-3.5 h-3.5" />}
          </button>
        )}

        {/* Red Disconnect button */}
        <button
          type="button"
          onClick={onDisconnect}
          className="p-1.5 rounded-lg bg-danger/20 hover:bg-danger/30 border border-danger/40 text-danger hover:text-danger/90 transition-all shadow-subtle group/disc"
          title="Disconnect from voice"
          aria-label="Disconnect"
        >
          <PhoneOff className="w-3.5 h-3.5 group-hover/disc:scale-110 transition-transform" />
        </button>
      </div>
    </div>
  );
}
