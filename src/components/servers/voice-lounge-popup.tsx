'use client';

import * as React from 'react';
import {
  Mic,
  MicOff,
  Headphones,
  Video,
  VideoOff,
  Monitor,
  PhoneOff,
  Radio,
  GripHorizontal,
  RotateCcw,
  Volume2,
  Users,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { useServerVoiceContext } from '@/features/servers/server-voice-context';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/auth-provider';

export function VoiceLoungePopup() {
  const { user } = useAuth();
  const serverVoice = useServerVoiceContext();

  const [isMinimized, setIsMinimized] = React.useState(false);
  const [position, setPosition] = React.useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const dragStartRef = React.useRef<{
    startX: number;
    startY: number;
    initialPosX: number;
    initialPosY: number;
  }>({ startX: 0, startY: 0, initialPosX: 0, initialPosY: 0 });
  const containerRef = React.useRef<HTMLDivElement>(null);

  if (!serverVoice.isVoiceConnected) {
    return null;
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, a, input, [role="button"]')) return;

    const el = containerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const currentPosX = position ? position.x : rect.left;
    const currentPosY = position ? position.y : rect.top;

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialPosX: currentPosX,
      initialPosY: currentPosY,
    };

    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;

    const deltaX = e.clientX - dragStartRef.current.startX;
    const deltaY = e.clientY - dragStartRef.current.startY;

    const el = containerRef.current;
    const width = el ? el.offsetWidth : 320;
    const height = el ? el.offsetHeight : 180;

    const minX = 8;
    const maxX = Math.max(8, (typeof window !== 'undefined' ? window.innerWidth : 1200) - width - 8);
    const minY = 8;
    const maxY = Math.max(8, (typeof window !== 'undefined' ? window.innerHeight : 800) - height - 8);

    const nextX = Math.min(Math.max(dragStartRef.current.initialPosX + deltaX, minX), maxX);
    const nextY = Math.min(Math.max(dragStartRef.current.initialPosY + deltaY, minY), maxY);

    setPosition({ x: Math.round(nextX), y: Math.round(nextY) });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const participants = serverVoice.remoteParticipants;
  const isSpeaking = serverVoice.isSpeaking || participants.some((p) => p.is_speaking);

  return (
    <div
      ref={containerRef}
      style={
        position
          ? {
              left: `${position.x}px`,
              top: `${position.y}px`,
              right: 'auto',
              bottom: 'auto',
            }
          : undefined
      }
      className={cn(
        'fixed z-40 flex flex-col overflow-hidden bg-[#0a0c16]/95 border border-white/[0.12] shadow-2xl shadow-black/95 backdrop-blur-xl',
        isDragging ? 'select-none transition-none shadow-primary/20' : 'transition-all duration-150',
        position ? 'w-80 rounded-2xl' : 'bottom-20 right-6 w-80 rounded-2xl'
      )}
    >
      {/* Pop-Up Header */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="h-10 border-b border-white/[0.08] px-3 flex items-center justify-between shrink-0 bg-surface-header/90 select-none cursor-grab active:cursor-grabbing backdrop-blur-md"
      >
        <div className="flex items-center gap-2 min-w-0">
          <GripHorizontal className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <div className="min-w-0 leading-tight">
            <div className="text-xs font-semibold text-foreground truncate">
              {serverVoice.activeChannelName ? `#${serverVoice.activeChannelName}` : 'Voice Lounge'}
            </div>
            {serverVoice.activeServerName && (
              <div className="text-[10px] text-muted-foreground/70 truncate">
                {serverVoice.activeServerName}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {position && (
            <button
              type="button"
              onClick={() => setPosition(null)}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
              title="Snap back to corner"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsMinimized((prev) => !prev)}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
            title={isMinimized ? 'Expand' : 'Collapse'}
          >
            {isMinimized ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Visual Stage (Collapsible) */}
      {!isMinimized && (
        <div className="p-3 bg-black/40 flex items-center justify-between gap-2 overflow-hidden border-b border-white/[0.04]">
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative shrink-0">
              {isSpeaking && <span className="absolute inset-0 rounded-full bg-emerald-500/30 animate-ping" />}
              <Avatar
                name={user?.email?.split('@')[0] || 'You'}
                size="sm"
                className={cn(isSpeaking && 'ring-2 ring-emerald-400')}
              />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-foreground truncate">
                {serverVoice.isMicMuted ? 'Muted' : isSpeaking ? 'Transmitting audio...' : 'Connected'}
              </div>
              <div className="text-[10px] text-muted-foreground/70 flex items-center gap-1">
                <Users className="w-2.5 h-2.5" />
                <span>{participants.length + 1} in lounge</span>
              </div>
            </div>
          </div>

          {serverVoice.isLiveKitActive && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono border border-emerald-500/20 shrink-0">
              LiveKit SFU
            </span>
          )}
        </div>
      )}

      {/* Pop-Up Control Bar: The 5 Essential Controls */}
      <div className="p-2.5 border-t border-white/[0.08] bg-surface-header/80 flex items-center justify-between gap-1.5 shrink-0">
        {/* 1. Mute Microphone */}
        <button
          type="button"
          onClick={serverVoice.toggleMic}
          className={cn(
            'p-2 rounded-xl transition-all flex items-center justify-center shrink-0',
            serverVoice.isMicMuted
              ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
              : 'bg-white/[0.06] text-foreground hover:bg-white/[0.12]'
          )}
          title={serverVoice.isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
          aria-label="Toggle Microphone"
        >
          {serverVoice.isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>

        {/* 2. Deafen Audio */}
        <button
          type="button"
          onClick={serverVoice.toggleDeafen}
          className={cn(
            'p-2 rounded-xl transition-all flex items-center justify-center shrink-0',
            serverVoice.isDeafened
              ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
              : 'bg-white/[0.06] text-foreground hover:bg-white/[0.12]'
          )}
          title={serverVoice.isDeafened ? 'Undeafen Audio' : 'Deafen Audio'}
          aria-label="Toggle Deafen"
        >
          <Headphones className="w-4 h-4" />
        </button>

        {/* 3. Screen Share */}
        <button
          type="button"
          onClick={serverVoice.toggleScreenShare}
          className={cn(
            'p-2 rounded-xl transition-all flex items-center justify-center shrink-0',
            serverVoice.isScreenSharing
              ? 'bg-primary/25 text-primary hover:bg-primary/35 shadow-sm'
              : 'bg-white/[0.06] text-muted-foreground hover:text-foreground hover:bg-white/[0.12]'
          )}
          title={serverVoice.isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
          aria-label="Toggle Screen Share"
        >
          <Monitor className="w-4 h-4" />
        </button>

        {/* 4. Camera */}
        <button
          type="button"
          onClick={serverVoice.toggleCamera}
          className={cn(
            'p-2 rounded-xl transition-all flex items-center justify-center shrink-0',
            serverVoice.isCameraOn
              ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
              : 'bg-white/[0.06] text-muted-foreground hover:text-foreground hover:bg-white/[0.12]'
          )}
          title={serverVoice.isCameraOn ? 'Turn Off Camera' : 'Turn On Camera'}
          aria-label="Toggle Camera"
        >
          {serverVoice.isCameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
        </button>

        {/* 5. Close Call (Disconnect / Hang up) */}
        <button
          type="button"
          onClick={serverVoice.disconnectVoice}
          className="p-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold transition-all shadow-md hover:shadow-rose-600/30 shrink-0"
          title="Disconnect from Lounge"
          aria-label="Disconnect"
        >
          <PhoneOff className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
