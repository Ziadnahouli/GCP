'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
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
  ExternalLink,
  VolumeX,
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
  const [pipWindow, setPipWindow] = React.useState<Window | null>(null);
  const dragStartRef = React.useRef<{
    startX: number;
    startY: number;
    initialPosX: number;
    initialPosY: number;
  }>({ startX: 0, startY: 0, initialPosX: 0, initialPosY: 0 });
  const containerRef = React.useRef<HTMLDivElement>(null);

  const copyStylesToPip = (targetDoc: Document) => {
    document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
      targetDoc.head.appendChild(node.cloneNode(true));
    });
    const isDark = document.documentElement.classList.contains('dark');
    if (isDark) {
      targetDoc.documentElement.classList.add('dark');
    }
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'violet';
    targetDoc.documentElement.setAttribute('data-theme', currentTheme);
    targetDoc.body.style.margin = '0';
    targetDoc.body.style.padding = '0';
    targetDoc.body.style.backgroundColor = 'hsl(var(--background))';
    targetDoc.body.style.color = 'hsl(var(--foreground))';
    targetDoc.body.style.overflow = 'hidden';
  };

  const openDocumentPip = React.useCallback(async () => {
    if (typeof window !== 'undefined' && 'documentPictureInPicture' in window) {
      try {
        if (pipWindow) {
          pipWindow.close();
          setPipWindow(null);
          return;
        }

        const pip = await (window as any).documentPictureInPicture.requestWindow({
          width: 340,
          height: 200,
        });

        copyStylesToPip(pip.document);

        pip.addEventListener('pagehide', () => {
          setPipWindow(null);
        });

        setPipWindow(pip);
      } catch (err) {
        console.warn('[VoiceLounge PiP] Notice:', err);
      }
    }
  }, [pipWindow]);

  React.useEffect(() => {
    if (!serverVoice.isVoiceConnected && pipWindow) {
      try {
        pipWindow.close();
      } catch {}
      setPipWindow(null);
    }
  }, [serverVoice.isVoiceConnected, pipWindow]);

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

  if (pipWindow) {
    return (
      <>
        {createPortal(
          <div className="dark flex flex-col h-dvh w-full bg-card text-foreground overflow-hidden select-none font-sans">
            {/* PiP Header */}
            <div className="h-9 px-3 border-b border-border flex items-center justify-between shrink-0 bg-card">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse shrink-0" />
                <span className="text-xs font-semibold text-foreground truncate">
                  {serverVoice.activeChannelName ? `#${serverVoice.activeChannelName}` : 'Voice Lounge'}
                </span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-success/10 text-success border border-success/20 font-mono">
                  GCP Studio Audio
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  try {
                    pipWindow.close();
                  } catch {}
                  setPipWindow(null);
                }}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                title="Dock back into app"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Stage */}
            <div className="flex-1 p-3 bg-black/60 flex items-center justify-between gap-2 overflow-hidden border-b border-border">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative shrink-0">
                  {isSpeaking && <span className="absolute inset-0 rounded-full bg-success/30 animate-ping" />}
                  <Avatar
                    name={user?.email?.split('@')[0] || 'You'}
                    size="sm"
                    className={cn(isSpeaking && 'ring-2 ring-success')}
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-foreground truncate">
                    {serverVoice.isMicMuted ? 'Muted' : isSpeaking ? 'Transmitting audio...' : 'Connected'}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="w-2.5 h-2.5" />
                    <span>{participants.length + 1} in lounge</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 5 Controls */}
            <div className="p-2 border-t border-border bg-card flex items-center justify-between gap-1 shrink-0">
              {/* 1. Mute Microphone */}
              <button
                type="button"
                onClick={serverVoice.toggleMic}
                className={cn(
                  'p-2 rounded-xl transition-all flex items-center justify-center shrink-0',
                  serverVoice.isMicMuted
                    ? 'bg-danger/20 text-danger hover:bg-danger/30'
                    : 'bg-surface-hover text-foreground hover:bg-surface-active'
                )}
                title={serverVoice.isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
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
                    ? 'bg-danger/20 text-danger hover:bg-danger/30'
                    : 'bg-surface-hover text-foreground hover:bg-surface-active'
                )}
                title={serverVoice.isDeafened ? 'Undeafen Audio' : 'Deafen Audio'}
              >
                {serverVoice.isDeafened ? <VolumeX className="w-4 h-4" /> : <Headphones className="w-4 h-4" />}
              </button>

              {/* 3. Screen Share */}
              <button
                type="button"
                onClick={serverVoice.toggleScreenShare}
                className={cn(
                  'p-2 rounded-xl transition-all flex items-center justify-center shrink-0',
                  serverVoice.isScreenSharing
                    ? 'bg-primary/25 text-primary hover:bg-primary/35 shadow-sm'
                    : 'bg-surface-hover text-muted-foreground hover:text-foreground hover:bg-surface-active'
                )}
                title={serverVoice.isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
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
                    ? 'bg-success/20 text-success hover:bg-success/30'
                    : 'bg-surface-hover text-muted-foreground hover:text-foreground hover:bg-surface-active'
                )}
                title={serverVoice.isCameraOn ? 'Turn Off Camera' : 'Turn On Camera'}
              >
                {serverVoice.isCameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              </button>

              {/* 5. Disconnect Call */}
              <button
                type="button"
                onClick={() => {
                  try {
                    pipWindow.close();
                  } catch {}
                  setPipWindow(null);
                  serverVoice.disconnectVoice();
                }}
                className="p-2 rounded-xl bg-danger hover:bg-danger/90 active:bg-danger/95 text-white font-semibold transition-all shadow-md hover:shadow-rose-600/30 shrink-0"
                title="Disconnect"
              >
                <PhoneOff className="w-4 h-4" />
              </button>
            </div>
          </div>,
          pipWindow.document.body
        )}

        {/* Docked In-App Indicator pill */}
        <div className="fixed bottom-20 right-6 z-[99999] pointer-events-auto bg-card/95 border border-border rounded-2xl shadow-2xl backdrop-blur-xl p-3 flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-success animate-pulse shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-foreground">
              Voice Lounge popped out above all windows
            </div>
            <div className="text-xs text-muted-foreground">
              Floating on top of games & external apps
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              try {
                pipWindow.close();
              } catch {}
              setPipWindow(null);
            }}
            className="px-2.5 py-1 rounded-lg bg-surface-hover hover:bg-surface-active text-xs font-medium text-foreground transition-colors shrink-0"
          >
            Restore to App
          </button>
        </div>
      </>
    );
  }

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
        'fixed z-[99999] pointer-events-auto flex flex-col overflow-hidden bg-card/95 border border-border shadow-2xl shadow-black/95 backdrop-blur-xl',
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
        className="h-10 border-b border-border px-3 flex items-center justify-between shrink-0 bg-surface-header/90 select-none cursor-grab active:cursor-grabbing backdrop-blur-md"
      >
        <div className="flex items-center gap-2 min-w-0">
          <GripHorizontal className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
          <span className="w-2 h-2 rounded-full bg-success animate-pulse shrink-0" />
          <div className="min-w-0 leading-tight">
            <div className="text-xs font-semibold text-foreground truncate">
              {serverVoice.activeChannelName ? `#${serverVoice.activeChannelName}` : 'Voice Lounge'}
            </div>
            {serverVoice.activeServerName && (
              <div className="text-xs text-muted-foreground/70 truncate">
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
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
              title="Snap back to corner"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}

          {/* Float Above All (Picture-in-Picture) */}
          <button
            type="button"
            onClick={openDocumentPip}
            className="px-2 py-0.5 rounded text-primary hover:text-primary-foreground hover:bg-primary/20 text-xs font-semibold flex items-center gap-1 transition-colors border border-primary/30"
            title="Pop out above all games & desktop windows (Picture-in-Picture)"
            aria-label="Above All"
          >
            <ExternalLink className="w-3 h-3" />
            <span>Above All</span>
          </button>

          <button
            type="button"
            onClick={() => setIsMinimized((prev) => !prev)}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
            title={isMinimized ? 'Expand' : 'Collapse'}
          >
            {isMinimized ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Visual Stage (Collapsible) */}
      {!isMinimized && (
        <div className="p-3 bg-black/40 flex items-center justify-between gap-2 overflow-hidden border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative shrink-0">
              {isSpeaking && <span className="absolute inset-0 rounded-full bg-success/30 animate-ping" />}
              <Avatar
                name={user?.email?.split('@')[0] || 'You'}
                size="sm"
                className={cn(isSpeaking && 'ring-2 ring-success')}
              />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-foreground truncate">
                {serverVoice.isMicMuted ? 'Muted' : isSpeaking ? 'Transmitting audio...' : 'Connected'}
              </div>
              <div className="text-xs text-muted-foreground/70 flex items-center gap-1">
                <Users className="w-2.5 h-2.5" />
                <span>{participants.length + 1} in lounge</span>
              </div>
            </div>
          </div>

            <span className="text-xs px-1.5 py-0.5 rounded bg-success/10 text-success font-mono border border-success/20 shrink-0">
              GCP Studio Audio
            </span>
          </div>
      )}

      {/* Pop-Up Control Bar: The 5 Essential Controls */}
      <div className="p-2.5 border-t border-border bg-surface-header/80 flex items-center justify-between gap-1.5 shrink-0">
        {/* 1. Mute Microphone */}
        <button
          type="button"
          onClick={serverVoice.toggleMic}
          className={cn(
            'p-2 rounded-xl transition-all flex items-center justify-center shrink-0',
            serverVoice.isMicMuted
              ? 'bg-danger/20 text-danger hover:bg-danger/30'
              : 'bg-surface-hover text-foreground hover:bg-surface-active'
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
              ? 'bg-danger/20 text-danger hover:bg-danger/30'
              : 'bg-surface-hover text-foreground hover:bg-surface-active'
          )}
          title={serverVoice.isDeafened ? 'Undeafen Audio' : 'Deafen Audio'}
          aria-label="Toggle Deafen"
        >
          {serverVoice.isDeafened ? <VolumeX className="w-4 h-4" /> : <Headphones className="w-4 h-4" />}
        </button>

        {/* 3. Screen Share */}
        <button
          type="button"
          onClick={serverVoice.toggleScreenShare}
          className={cn(
            'p-2 rounded-xl transition-all flex items-center justify-center shrink-0',
            serverVoice.isScreenSharing
              ? 'bg-primary/25 text-primary hover:bg-primary/35 shadow-sm'
              : 'bg-surface-hover text-muted-foreground hover:text-foreground hover:bg-surface-active'
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
              ? 'bg-success/20 text-success hover:bg-success/30'
              : 'bg-surface-hover text-muted-foreground hover:text-foreground hover:bg-surface-active'
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
          className="p-2 rounded-xl bg-danger hover:bg-danger/90 active:bg-danger/95 text-white font-semibold transition-all shadow-md hover:shadow-rose-600/30 shrink-0"
          title="Disconnect from Lounge"
          aria-label="Disconnect"
        >
          <PhoneOff className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
