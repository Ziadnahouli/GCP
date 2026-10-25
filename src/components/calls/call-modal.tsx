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
  Activity,
  Maximize2,
  Minimize2,
  Volume2,
  Radio,
  Settings,
  X,
  Phone,
  Sparkles,
  ShieldCheck,
  GripHorizontal,
  RotateCcw,
  ExternalLink,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { NetworkDiagnostics, DiagnosticsStats } from './network-diagnostics';
import { SoundboardModal } from '@/components/soundboard/soundboard-modal';
import { CallParticipant, CallStatus } from '@/features/calls/call-context';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/auth-provider';
import {
  subscribeAudioEngineDiagnostics,
  getAudioEngineDiagnostics,
  AudioEngineDiagnostics,
} from '@/lib/webrtc/audio-processing-policy';

interface CallModalProps {
  open: boolean;
  callStatus: CallStatus;
  isVideo: boolean;
  isMicMuted: boolean;
  isDeafened?: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  isNoiseSuppressionEnabled?: boolean;
  isLiveKitActive?: boolean;
  participants: CallParticipant[];
  stats: DiagnosticsStats;
  localStream?: MediaStream | null;
  remoteStream?: MediaStream | null;
  screenStream?: MediaStream | null;
  onEndCall: () => void;
  onToggleMic: () => void;
  onToggleDeafen?: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onToggleNoiseSuppression?: () => void;
  onRestartConnection?: () => void;
}

interface VideoFeedProps {
  stream: MediaStream | null | undefined;
  muted?: boolean;
  active?: boolean;
  className?: string;
  onRenderChange?: (isRendering: boolean) => void;
}

const VideoFeed = React.memo(function VideoFeed({
  stream,
  muted = true,
  active = true,
  className,
  onRenderChange,
}: VideoFeedProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const onRenderChangeRef = React.useRef(onRenderChange);
  onRenderChangeRef.current = onRenderChange;

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = muted;
    video.defaultMuted = muted;

    const videoTracks = stream ? stream.getVideoTracks() : [];
    const activeTrack = videoTracks[0] ?? null;

    if (stream && activeTrack) {
      const currentSrcObject = video.srcObject as MediaStream | null;
      const currentTrack = currentSrcObject?.getVideoTracks()[0] ?? null;

      // Only assign srcObject if the underlying video track has changed or not yet assigned.
      // This is the critical fix preventing the infinite decoder reset loop!
      if (currentTrack?.id !== activeTrack.id || !video.srcObject) {
        video.srcObject = stream;
      }

      let isCancelled = false;

      const notifyRenderStatus = () => {
        if (!video || isCancelled) return;
        const isRendering = video.videoWidth > 0 && video.readyState >= 2 && !video.paused;
        onRenderChangeRef.current?.(isRendering);
      };

      const playVideo = () => {
        if (!video || isCancelled) return;
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              notifyRenderStatus();
            })
            .catch((err: unknown) => {
              const errObj = err as { name?: string; message?: string };
              if (
                errObj?.name === 'AbortError' ||
                errObj?.name === 'NotAllowedError' ||
                errObj?.message?.includes('interrupted')
              ) {
                return;
              }
              console.warn('[VideoFeed] Autoplay video play notice:', err);
            });
        }
      };

      if (active) {
        playVideo();
      }

      const handleReady = () => {
        if (active) playVideo();
        notifyRenderStatus();
      };

      video.addEventListener('loadeddata', handleReady);
      video.addEventListener('canplay', handleReady);
      video.addEventListener('playing', handleReady);
      video.addEventListener('resize', handleReady);
      video.addEventListener('timeupdate', handleReady);

      const handleUnmute = () => {
        activeTrack.enabled = true;
        handleReady();
      };

      activeTrack.addEventListener('unmute', handleUnmute);
      stream.addEventListener('addtrack', handleReady);
      stream.addEventListener('removetrack', handleReady);

      return () => {
        isCancelled = true;
        video.removeEventListener('loadeddata', handleReady);
        video.removeEventListener('canplay', handleReady);
        video.removeEventListener('playing', handleReady);
        video.removeEventListener('resize', handleReady);
        video.removeEventListener('timeupdate', handleReady);
        activeTrack.removeEventListener('unmute', handleUnmute);
        stream.removeEventListener('addtrack', handleReady);
        stream.removeEventListener('removetrack', handleReady);
      };
    } else {
      if (video.srcObject !== null) {
        video.srcObject = null;
        onRenderChangeRef.current?.(false);
      }
    }
  }, [stream, muted, active]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={muted}
      onLoadedMetadata={(e) => {
        if (active) {
          (e.currentTarget as HTMLVideoElement).play().catch(() => {});
        }
      }}
      className={className}
    />
  );
});

export function CallModal({
  open,
  callStatus,
  isVideo,
  isMicMuted,
  isDeafened = false,
  isCameraOn,
  isScreenSharing,
  isNoiseSuppressionEnabled = true,
  isLiveKitActive = false,
  participants,
  stats,
  localStream,
  remoteStream,
  screenStream,
  onEndCall,
  onToggleMic,
  onToggleDeafen,
  onToggleCamera,
  onToggleScreenShare,
  onToggleNoiseSuppression,
  onRestartConnection,
}: CallModalProps) {
  const { user } = useAuth();
  const [showDiagnostics, setShowDiagnostics] = React.useState(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [isPopUp, setIsPopUp] = React.useState(false);
  const [pipWindow, setPipWindow] = React.useState<Window | null>(null);
  const [engineDiag, setEngineDiag] = React.useState<AudioEngineDiagnostics>(getAudioEngineDiagnostics);

  React.useEffect(() => {
    return subscribeAudioEngineDiagnostics(setEngineDiag);
  }, []);

  // Helper to copy stylesheets into Document PiP window so styling matches identically
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
          width: 350,
          height: 250,
        });

        copyStylesToPip(pip.document);

        pip.addEventListener('pagehide', () => {
          setPipWindow(null);
        });

        setPipWindow(pip);
        setIsPopUp(false);
      } catch (err) {
        console.warn('[PiP] Document Picture-in-Picture notice, falling back to in-app pop-up:', err);
        setIsPopUp(true);
      }
    } else {
      setIsPopUp(true);
    }
  }, [pipWindow]);

  React.useEffect(() => {
    if ((!open || callStatus === 'idle') && pipWindow) {
      try {
        pipWindow.close();
      } catch {}
      setPipWindow(null);
    }
  }, [open, callStatus, pipWindow]);
  const [showSoundboard, setShowSoundboard] = React.useState(false);
  const [renderedFeeds, setRenderedFeeds] = React.useState<Record<string, boolean>>({});

  const handleRenderChange = React.useCallback((participantId: string, isRendering: boolean) => {
    setRenderedFeeds((prev) => {
      if (prev[participantId] === isRendering) return prev;
      return { ...prev, [participantId]: isRendering };
    });
  }, []);

  // Drag-and-move window state
  const [position, setPosition] = React.useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const dragStartRef = React.useRef<{
    startX: number;
    startY: number;
    initialPosX: number;
    initialPosY: number;
  }>({ startX: 0, startY: 0, initialPosX: 0, initialPosY: 0 });
  const containerRef = React.useRef<HTMLDivElement>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isFullscreen) return;
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
    if (!isDragging || isFullscreen) return;

    const deltaX = e.clientX - dragStartRef.current.startX;
    const deltaY = e.clientY - dragStartRef.current.startY;

    const el = containerRef.current;
    const width = el ? el.offsetWidth : 672;
    const height = el ? el.offsetHeight : 480;

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

  // Identify who is actively broadcasting their screen
  const screenSharer = React.useMemo(() => {
    const found = participants.find((p) => p.isScreenSharing);
    if (found) return found;
    if (isScreenSharing) {
      return {
        id: user?.id || 'me',
        name: 'You',
        isSpeaking: false,
        isMuted: isMicMuted,
        isCameraOn,
        isScreenSharing: true,
      };
    }
    return null;
  }, [participants, isScreenSharing, user?.id, isMicMuted, isCameraOn]);

  if (!open || callStatus === 'idle') return null;

  if (pipWindow) {
    const remotePartner = participants.find((p) => p.id !== user?.id);
    const isSpeaking = remotePartner?.isSpeaking;

    return (
      <>
        {createPortal(
          <div className="flex flex-col h-screen w-screen bg-card text-white overflow-hidden select-none font-sans">
            {/* Above-All Header */}
            <div className="h-9 px-3 border-b border-border flex items-center justify-between shrink-0 bg-card">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={cn(
                    'w-2 h-2 rounded-full shrink-0',
                    callStatus === 'outgoing_ringing' ? 'bg-warning animate-ping' : 'bg-success'
                  )}
                />
                <span className="text-xs font-semibold text-white truncate">
                  {remotePartner?.name || 'Private Call'}
                </span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-success/10 text-success border border-success/20 font-mono">
                  Direct P2P
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  try {
                    pipWindow.close();
                  } catch {}
                  setPipWindow(null);
                  setIsPopUp(true);
                }}
                className="p-1 rounded text-white/70 hover:text-foreground hover:bg-surface-hover transition-colors"
                title="Dock back into app"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Above-All Media Stage: Screen Share / Video / Avatar */}
            <div className="flex-1 relative bg-black/80 flex items-center justify-center overflow-hidden p-2 min-h-0">
              {screenSharer && (screenStream || remoteStream) ? (
                <VideoFeed
                  stream={screenStream || remoteStream}
                  muted={true}
                  className="w-full h-full object-contain rounded-xl"
                />
              ) : (isCameraOn || participants.some((p) => p.isCameraOn)) && (remoteStream || localStream) ? (
                <VideoFeed
                  stream={remoteStream || localStream}
                  muted={true}
                  className="w-full h-full object-cover rounded-xl"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-center space-y-2">
                  <div className="relative">
                    {isSpeaking && (
                      <span className="absolute inset-0 rounded-full bg-success/30 animate-ping" />
                    )}
                    <Avatar
                      name={remotePartner?.name || 'Squad'}
                      size="md"
                      className={cn(
                        'transition-all',
                        isSpeaking ? 'ring-2 ring-success shadow-glow-sm' : ''
                      )}
                    />
                  </div>
                  <div className="text-xs font-medium text-white/60">
                    {callStatus === 'outgoing_ringing' ? 'Ringing...' : 'Voice Connected'}
                  </div>
                </div>
              )}
            </div>

            {/* 5 Controls Dock */}
            <div className="p-2 border-t border-border bg-card flex items-center justify-between gap-1 shrink-0">
              {/* 1. Mute Microphone */}
              <button
                type="button"
                onClick={onToggleMic}
                className={cn(
                  'p-2 rounded-xl transition-all flex items-center justify-center shrink-0',
                  isMicMuted
                    ? 'bg-danger/20 text-danger hover:bg-danger/30'
                    : 'bg-surface-hover text-white hover:bg-surface-hover'
                )}
                title={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
              >
                {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              {/* 2. Deafen Audio */}
              {onToggleDeafen && (
                <button
                  type="button"
                  onClick={onToggleDeafen}
                  className={cn(
                    'p-2 rounded-xl transition-all flex items-center justify-center shrink-0',
                    isDeafened
                      ? 'bg-danger/20 text-danger hover:bg-danger/30'
                      : 'bg-surface-hover text-white hover:bg-surface-hover'
                  )}
                  title={isDeafened ? 'Undeafen Audio' : 'Deafen Audio'}
                >
                  <Headphones className="w-4 h-4" />
                </button>
              )}

              {/* 3. Screen Share */}
              <button
                type="button"
                onClick={onToggleScreenShare}
                className={cn(
                  'p-2 rounded-xl transition-all flex items-center justify-center shrink-0',
                  isScreenSharing
                    ? 'bg-primary/25 text-primary hover:bg-primary/35 shadow-sm'
                    : 'bg-surface-hover text-white/60 hover:text-foreground hover:bg-surface-hover'
                )}
                title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
              >
                <Monitor className="w-4 h-4" />
              </button>

              {/* 4. Camera */}
              <button
                type="button"
                onClick={onToggleCamera}
                className={cn(
                  'p-2 rounded-xl transition-all flex items-center justify-center shrink-0',
                  isCameraOn
                    ? 'bg-success/20 text-success hover:bg-success/30'
                    : 'bg-surface-hover text-white/60 hover:text-foreground hover:bg-surface-hover'
                )}
                title={isCameraOn ? 'Turn Off Camera' : 'Turn On Camera'}
              >
                {isCameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              </button>

              {/* 5. Close Call */}
              <button
                type="button"
                onClick={() => {
                  try {
                    pipWindow.close();
                  } catch {}
                  setPipWindow(null);
                  onEndCall();
                }}
                className="p-2 rounded-xl bg-danger hover:bg-danger text-white font-semibold transition-all shadow-md hover:shadow-rose-600/30 shrink-0"
                title="Close Call"
              >
                <PhoneOff className="w-4 h-4" />
              </button>
            </div>
          </div>,
          pipWindow.document.body
        )}

        {/* Docked In-App Indicator pill */}
        <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[99999] pointer-events-auto bg-card/95 border border-border rounded-2xl shadow-2xl backdrop-blur-xl p-3 flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-success animate-pulse shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-foreground">
              Call popped out above all windows
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
            className="px-2.5 py-1 rounded-lg bg-surface-hover hover:bg-surface-hover text-xs font-medium text-foreground transition-colors shrink-0"
          >
            Restore to App
          </button>
        </div>
      </>
    );
  }

  if (isPopUp) {
    const remotePartner = participants.find((p) => p.id !== user?.id);
    const isSpeaking = remotePartner?.isSpeaking;

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
          position ? 'w-80 rounded-2xl' : 'bottom-4 right-4 sm:bottom-6 sm:right-6 w-80 rounded-2xl'
        )}
      >
        {/* Pop-Up Header with Drag Handle, Above All & Maximize */}
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="h-10 border-b border-border px-3 flex items-center justify-between shrink-0 bg-surface-header/90 select-none cursor-grab active:cursor-grabbing backdrop-blur-md"
        >
          <div className="flex items-center gap-2 min-w-0">
            <GripHorizontal className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
            <span
              className={cn(
                'w-2 h-2 rounded-full shrink-0',
                callStatus === 'outgoing_ringing' ? 'bg-warning animate-ping' : 'bg-success'
              )}
            />
            <span className="text-xs font-semibold text-foreground truncate">
              {remotePartner?.name || 'Private Call'}
            </span>
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

            {/* Expand / Restore Full Stage */}
            <button
              type="button"
              onClick={() => setIsPopUp(false)}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
              title="Expand to Full Stage"
              aria-label="Expand to Full Stage"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Pop-Up Media Stage */}
        <div className="relative h-44 bg-black/80 flex items-center justify-center overflow-hidden p-2">
          {screenSharer && (screenStream || remoteStream) ? (
            <VideoFeed
              stream={screenStream || remoteStream}
              muted={true}
              className="w-full h-full object-contain rounded-xl"
            />
          ) : (isCameraOn || participants.some((p) => p.isCameraOn)) && (remoteStream || localStream) ? (
            <VideoFeed
              stream={remoteStream || localStream}
              muted={true}
              className="w-full h-full object-cover rounded-xl"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-center space-y-2">
              <div className="relative">
                {isSpeaking && (
                  <span className="absolute inset-0 rounded-full bg-success/30 animate-ping" />
                )}
                <Avatar
                  name={remotePartner?.name || 'Squad'}
                  size="md"
                  className={cn(
                    'transition-all',
                    isSpeaking ? 'ring-2 ring-success shadow-glow-sm' : ''
                  )}
                />
              </div>
              <div className="text-xs font-medium text-muted-foreground">
                {callStatus === 'outgoing_ringing' ? 'Ringing...' : 'Voice Connected'}
              </div>
            </div>
          )}
        </div>

        {/* Pop-Up Control Dock (1. Mute, 2. Deafen, 3. Screen Share, 4. Camera, 5. Close Call) */}
        <div className="p-2.5 border-t border-border bg-surface-header/80 flex items-center justify-between gap-1.5 shrink-0">
          {/* 1. Mute Microphone */}
          <button
            type="button"
            onClick={onToggleMic}
            className={cn(
              'p-2 rounded-xl transition-all flex items-center justify-center shrink-0',
              isMicMuted
                ? 'bg-danger/20 text-danger hover:bg-danger/30'
                : 'bg-surface-hover text-foreground hover:bg-surface-hover'
            )}
            title={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
            aria-label="Toggle Microphone"
          >
            {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* 2. Deafen Audio */}
          {onToggleDeafen && (
            <button
              type="button"
              onClick={onToggleDeafen}
              className={cn(
                'p-2 rounded-xl transition-all flex items-center justify-center shrink-0',
                isDeafened
                  ? 'bg-danger/20 text-danger hover:bg-danger/30'
                  : 'bg-surface-hover text-foreground hover:bg-surface-hover'
              )}
              title={isDeafened ? 'Undeafen Audio' : 'Deafen Audio'}
              aria-label="Toggle Deafen"
            >
              <Headphones className="w-4 h-4" />
            </button>
          )}

          {/* 3. Screen Share */}
          <button
            type="button"
            onClick={onToggleScreenShare}
            className={cn(
              'p-2 rounded-xl transition-all flex items-center justify-center shrink-0',
              isScreenSharing
                ? 'bg-primary/25 text-primary hover:bg-primary/35 shadow-sm'
                : 'bg-surface-hover text-muted-foreground hover:text-foreground hover:bg-surface-hover'
            )}
            title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
            aria-label="Toggle Screen Share"
          >
            <Monitor className="w-4 h-4" />
          </button>

          {/* 4. Camera */}
          <button
            type="button"
            onClick={onToggleCamera}
            className={cn(
              'p-2 rounded-xl transition-all flex items-center justify-center shrink-0',
              isCameraOn
                ? 'bg-success/20 text-success hover:bg-success/30'
                : 'bg-surface-hover text-muted-foreground hover:text-foreground hover:bg-surface-hover'
            )}
            title={isCameraOn ? 'Turn Off Camera' : 'Turn On Camera'}
            aria-label="Toggle Camera"
          >
            {isCameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
          </button>

          {/* 5. Close Call (End Call / Hang up) */}
          <button
            type="button"
            onClick={onEndCall}
            className="p-2 rounded-xl bg-danger hover:bg-danger text-white font-semibold transition-all shadow-md hover:shadow-rose-600/30 shrink-0"
            title="Close Call"
            aria-label="Close Call"
          >
            <PhoneOff className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={
        !isFullscreen && position
          ? {
              left: `${position.x}px`,
              top: `${position.y}px`,
              right: 'auto',
              bottom: 'auto',
            }
          : undefined
      }
      className={cn(
        'fixed z-50 flex flex-col overflow-hidden bg-surface-panel border border-border shadow-2xl shadow-black/90',
        isDragging ? 'select-none transition-none shadow-primary/20' : 'transition-all duration-150',
        isFullscreen
          ? 'inset-0 rounded-none'
          : position
          ? 'w-[94vw] sm:w-[672px] h-[480px] rounded-2xl'
          : 'inset-0 sm:inset-auto sm:bottom-6 sm:right-6 sm:w-full sm:max-w-2xl sm:h-[480px] sm:rounded-2xl rounded-none'
      )}
    >
      {/* Call Header with Drag Handle */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={cn(
          'h-11 border-b border-border px-4 flex items-center justify-between shrink-0 bg-surface-header/90 select-none backdrop-blur-md',
          !isFullscreen && 'cursor-grab active:cursor-grabbing'
        )}
      >
        <div className="flex items-center gap-2">
          {!isFullscreen && (
            <div className="text-muted-foreground/40 hover:text-muted-foreground transition-colors mr-0.5" title="Drag header to move call window">
              <GripHorizontal className="w-4 h-4" />
            </div>
          )}
          <span
            className={cn(
              'w-2 h-2 rounded-full',
              callStatus === 'outgoing_ringing' ? 'bg-warning animate-ping' : 'bg-success'
            )}
          />
          <span className="text-xs font-medium text-foreground">
            {screenSharer
              ? 'Screen Broadcast'
              : isCameraOn || participants.some((p) => p.isCameraOn)
              ? 'Video Stream'
              : 'Voice Call'}
          </span>
          {isNoiseSuppressionEnabled ? (
            <span className="hidden sm:inline-flex items-center gap-1 text-xs text-success font-mono ml-1 bg-success/10 px-1.5 py-0.5 rounded border border-success/20">
              • Direct P2P • RNNoise AI
            </span>
          ) : (
            <span className="hidden sm:inline-flex items-center gap-1 text-xs text-muted-foreground font-mono ml-1">
              • Direct P2P
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Dock Reset Button if user dragged modal */}
          {!isFullscreen && position && (
            <button
              onClick={() => setPosition(null)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-default transition-colors"
              title="Snap back to default corner"
              aria-label="Snap back to default corner"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Telemetry diagnostics button */}
          <button
            onClick={() => setShowDiagnostics((prev) => !prev)}
            className={cn(
              'p-1.5 rounded-md transition-colors text-xs flex items-center gap-1 font-mono text-xs',
              showDiagnostics
                ? 'bg-primary/20 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface-default'
            )}
            title="Diagnostics"
            aria-label="Diagnostics"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{stats.rttMs !== null ? `${stats.rttMs}ms` : '—'}</span>
          </button>

          {/* O3: In-Call Noise Cancellation Engine Badge & Quick Mode Toggle */}
          <button
            type="button"
            onClick={onToggleNoiseSuppression}
            className={cn(
              'px-2 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors border',
              engineDiag.engine === 'rnnoise-wasm' && engineDiag.status === 'ready'
                ? 'bg-success/15 text-success border-success/30 hover:bg-success/25'
                : engineDiag.engine === 'browser-native' || engineDiag.status === 'fallback'
                ? 'bg-warning/15 text-warning border-warning/30 hover:bg-warning/25'
                : 'bg-surface-default text-muted-foreground border-border hover:bg-surface-hover'
            )}
            title={
              engineDiag.status === 'fallback'
                ? `Browser Fallback: ${engineDiag.fallbackReason || 'Native processing'} (Click to cycle mode)`
                : `Active Engine: ${engineDiag.engine} • Mode: ${engineDiag.mode || 'balanced'} (Click to cycle mode)`
            }
          >
            {engineDiag.engine === 'rnnoise-wasm' && engineDiag.status === 'ready' ? (
              <>
                <Sparkles className="w-3 h-3 text-success" />
                <span className="hidden sm:inline">RNNoise: {engineDiag.mode?.toUpperCase() || 'BALANCED'}</span>
                <span className="sm:hidden">RNNoise</span>
              </>
            ) : engineDiag.status === 'fallback' ? (
              <>
                <Radio className="w-3 h-3 text-warning" />
                <span className="hidden sm:inline">Fallback: Native</span>
                <span className="sm:hidden">Native</span>
              </>
            ) : (
              <>
                <Mic className="w-3 h-3 text-muted-foreground" />
                <span className="hidden sm:inline">DSP: OFF</span>
                <span className="sm:hidden">OFF</span>
              </>
            )}
          </button>

          {/* Pop out Above All (Floats above all games and desktop windows) */}
          <button
            type="button"
            onClick={() => {
              setIsFullscreen(false);
              openDocumentPip();
            }}
            className="px-2 py-1 rounded-md text-primary hover:text-primary-foreground hover:bg-primary/20 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-primary/30"
            title="Pop out above all games & desktop windows (Picture-in-Picture)"
            aria-label="Above All"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Above All</span>
          </button>

          {/* In-App Pop-up Screen */}
          <button
            type="button"
            onClick={() => {
              setIsFullscreen(false);
              setIsPopUp(true);
            }}
            className="px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-default text-xs font-medium flex items-center gap-1 transition-colors border border-border"
            title="Pop-up Screen (In-App Dock)"
            aria-label="Pop-up Screen"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Dock</span>
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={() => setIsFullscreen((prev) => !prev)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-default"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Minimize / Float Above All */}
          <button
            type="button"
            onClick={() => {
              setIsFullscreen(false);
              openDocumentPip();
            }}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors ml-1"
            title="Float above all games / minimize"
            aria-label="Minimize Call"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Calling Stage */}
      <div className="flex-1 relative overflow-hidden p-4 flex items-center justify-center bg-background/80">
        {/* Ringing Stage */}
        {callStatus === 'outgoing_ringing' ? (
          <div className="flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in">
            <div className="relative">
              <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
              <div className="relative w-20 h-20 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-primary">
                <Phone className="w-8 h-8 animate-pulse" />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Connecting Media Stream</h3>
              <p className="text-xs text-muted-foreground/60 mt-1 font-mono">
                ICE Candidate gathering & WebRTC handshake...
              </p>
            </div>
          </div>
        ) : (
          /* Active Call Participants Grid */
          <div className="w-full h-full flex flex-col justify-center">
            {/* Screen sharing spotlight mode */}
            {screenSharer ? (
              <div className="w-full h-full flex flex-col gap-3">
                <div className="flex-1 rounded-xl bg-card border border-border flex items-center justify-center relative overflow-hidden group">
                  <div className="absolute top-3 left-3 flex items-center gap-2 bg-surface-panel/90 backdrop-blur-md px-2.5 py-1 rounded-lg text-xs font-medium text-foreground z-10 border border-border">
                    <Monitor className="w-3.5 h-3.5 text-primary" />
                    <span>
                      {screenSharer.id === user?.id
                        ? 'Your Display Broadcast (Live)'
                        : `${screenSharer.name}'s Display Broadcast`}
                    </span>
                  </div>

                  {/* Real Live Video Display for Screen Share */}
                  {screenSharer.id === user?.id ? (
                    <VideoFeed
                      stream={screenStream}
                      muted
                      className="w-full h-full object-contain rounded-xl bg-black"
                    />
                  ) : (
                    <VideoFeed
                      stream={remoteStream}
                      muted
                      className="w-full h-full object-contain rounded-xl bg-black"
                    />
                  )}
                </div>

                {/* Participant thumbnails underneath screen share */}
                <div className="h-16 flex items-center gap-2 justify-center">
                  {participants.map((p) => (
                    <div
                      key={p.id}
                      className={cn(
                        'h-full w-24 rounded-lg bg-surface-default/70 border flex items-center justify-center relative p-2 transition-all',
                        p.isSpeaking ? 'border-success/60 ring-2 ring-success shadow-[0_0_12px_rgba(16,185,129,0.3)]' : 'border-border'
                      )}
                    >
                      <Avatar name={p.name} size="sm" />
                      <span className="absolute bottom-1 text-xs font-medium text-foreground/80 truncate px-1 max-w-[90%]">
                        {p.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Participant Camera / Voice Grid */
              <div
                className={cn(
                  'grid gap-3 w-full h-full items-center justify-center',
                  participants.length <= 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'
                )}
              >
                {participants.map((p) => {
                  const isLocalUser = p.id === user?.id;
                  const hasLocalVideo = isLocalUser && Boolean(
                    localStream?.getVideoTracks().some((t) => t.readyState === 'live')
                  );
                  const hasRemoteVideo = !isLocalUser && Boolean(
                    remoteStream?.getVideoTracks().some((t) => t.readyState === 'live')
                  );
                  const wantsCamera = isLocalUser
                    ? Boolean(isCameraOn && hasLocalVideo)
                    : Boolean(p.isCameraOn && (hasRemoteVideo || remoteStream?.getVideoTracks().length));

                  const isActivelyRendering = wantsCamera && Boolean(renderedFeeds[p.id]);

                  return (
                    <div
                      key={p.id}
                      className={cn(
                        'relative rounded-xl overflow-hidden bg-surface-default/60 border flex flex-col items-center justify-center h-full min-h-[160px] p-4 transition-all',
                        p.isSpeaking
                          ? 'border-success/50 ring-2 ring-success shadow-[0_0_20px_rgba(16,185,129,0.15)]'
                          : 'border-border'
                      )}
                    >
                      {/* Live WebRTC Camera Video Feed (fades in only when frames are actively verified rendering) */}
                      <div
                        className={cn(
                          'w-full h-full absolute inset-0 flex items-center justify-center bg-black transition-opacity duration-300',
                          isActivelyRendering ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none z-0'
                        )}
                      >
                        <VideoFeed
                          stream={isLocalUser ? localStream : remoteStream}
                          muted={true}
                          active={wantsCamera}
                          onRenderChange={(rendering) => handleRenderChange(p.id, rendering)}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* Fallback Avatar with speaking ring (never covered by a black screen) */}
                      <div
                        className={cn(
                          'flex flex-col items-center justify-center space-y-2 transition-opacity duration-300',
                          isActivelyRendering ? 'opacity-0 pointer-events-none' : 'opacity-100'
                        )}
                      >
                        <Avatar
                          name={p.name}
                          size="lg"
                          className={cn(
                            'transition-all duration-150',
                            p.isSpeaking && 'scale-105 ring-4 ring-success shadow-[0_0_25px_rgba(52,211,153,0.85)]'
                          )}
                        />

                        {/* Equalizer Wave / Speaking Status */}
                        <div className="flex items-end justify-center gap-1 h-4 mt-1">
                          {!p.isMuted ? (
                            p.isSpeaking ? (
                              <>
                                <span className="w-1 h-2.5 bg-success rounded-full animate-bounce [animation-delay:0ms]" />
                                <span className="w-1 h-3.5 bg-success rounded-full animate-bounce [animation-delay:150ms]" />
                                <span className="w-1 h-4 bg-success rounded-full animate-bounce [animation-delay:300ms]" />
                                <span className="w-1 h-3.5 bg-success rounded-full animate-bounce [animation-delay:150ms]" />
                                <span className="w-1 h-2.5 bg-success rounded-full animate-bounce [animation-delay:0ms]" />
                              </>
                            ) : (
                              <span className="text-xs text-success/60 font-mono">Audio Active</span>
                            )
                          ) : (
                            <span className="text-xs text-danger/80 font-mono">Microphone Muted</span>
                          )}
                        </div>

                        {wantsCamera && !isActivelyRendering && (
                          <div className="flex items-center gap-1.5 text-xs text-warning font-medium bg-warning/10 px-2.5 py-0.5 rounded-full border border-warning/30 animate-pulse mt-1">
                            <Video className="w-3 h-3" />
                            <span>Connecting camera...</span>
                          </div>
                        )}
                      </div>

                      {/* Participant Name Badge */}
                      <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-md text-xs font-medium text-white/90 flex items-center gap-1.5 z-10 border border-border">
                        <span>{p.name}</span>
                        {p.isMuted && <MicOff className="w-3 h-3 text-danger" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Telemetry diagnostics popup panel */}
        {showDiagnostics && (
          <div className="absolute top-4 right-4 z-20 w-96 max-w-[calc(100%-2rem)]">
            <NetworkDiagnostics
              stats={stats}
              localStream={localStream}
              screenStream={screenStream}
              isMicMuted={isMicMuted}
              isCameraOn={isCameraOn}
              isScreenSharing={isScreenSharing}
              isNoiseSuppressionEnabled={isNoiseSuppressionEnabled}
              onRestartConnection={onRestartConnection}
              onClose={() => setShowDiagnostics(false)}
            />
          </div>
        )}
      </div>

      {/* Control Bar Footer Dock */}
      <div className="h-16 border-t border-border px-4 flex items-center justify-center shrink-0 bg-surface-header/60 backdrop-blur-md">
        <div className="flex items-center gap-2 sm:gap-2.5 bg-surface-default/90 backdrop-blur-md border border-border px-3 py-1.5 rounded-full shadow-lg">
          {/* Mic Toggle */}
          <button
            onClick={onToggleMic}
            className={cn(
              'p-2 rounded-full transition-all',
              isMicMuted
                ? 'bg-danger/15 text-danger hover:bg-danger/25'
                : 'bg-surface-default text-foreground hover:bg-surface-hover'
            )}
            title={isMicMuted ? 'Unmute' : 'Mute'}
            aria-label={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* Deafen Toggle */}
          {onToggleDeafen && (
            <button
              onClick={onToggleDeafen}
              className={cn(
                'p-2 rounded-full transition-all',
                isDeafened
                  ? 'bg-danger/15 text-danger hover:bg-danger/25'
                  : 'bg-surface-default text-foreground hover:bg-surface-hover'
              )}
              title={isDeafened ? 'Undeafen' : 'Deafen'}
              aria-label={isDeafened ? 'Undeafen audio' : 'Deafen audio'}
            >
              <Headphones className="w-4 h-4" />
            </button>
          )}

          {/* Camera Toggle */}
          <button
            onClick={onToggleCamera}
            className={cn(
              'p-2 rounded-full transition-all',
              !isCameraOn
                ? 'bg-surface-default text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                : 'bg-success/15 text-success hover:bg-success/25'
            )}
            title={isCameraOn ? 'Turn Off Camera' : 'Turn On Camera'}
            aria-label={isCameraOn ? 'Turn Off Camera' : 'Turn On Camera'}
          >
            {isCameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
          </button>

          {/* Screen Share Toggle */}
          <button
            onClick={onToggleScreenShare}
            className={cn(
              'p-2 rounded-full transition-all',
              isScreenSharing
                ? 'bg-primary/20 text-primary hover:bg-primary/30'
                : 'bg-surface-default text-muted-foreground hover:bg-surface-hover hover:text-foreground'
            )}
            title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
            aria-label={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
          >
            <Monitor className="w-4 h-4" />
          </button>

          {/* Soundboard Button */}
          <button
            onClick={() => setShowSoundboard(true)}
            className="p-2 rounded-full bg-surface-default text-muted-foreground hover:text-warning hover:bg-warning/10 transition-colors"
            title="Soundboard"
            aria-label="Soundboard"
          >
            <Sparkles className="w-4 h-4" />
          </button>

          {/* Noise Suppression Toggle Button */}
          {onToggleNoiseSuppression && (
            <button
              onClick={onToggleNoiseSuppression}
              className={cn(
                'p-2 rounded-full transition-all',
                isNoiseSuppressionEnabled
                  ? 'bg-success/15 text-success hover:bg-success/25'
                  : 'bg-surface-default text-muted-foreground hover:bg-surface-hover'
              )}
              title={
                isNoiseSuppressionEnabled
                  ? 'GCP Studio AI Suppression ON (RNNoise WASM - Click to cycle mode)'
                  : 'GCP Studio AI Suppression OFF'
              }
              aria-label={isNoiseSuppressionEnabled ? 'Disable GCP AI noise filter' : 'Enable GCP AI noise filter'}
            >
              <ShieldCheck className="w-4 h-4" />
            </button>
          )}

          {/* End Call Button */}
          <button
            onClick={onEndCall}
            className="p-2 rounded-full bg-danger hover:bg-danger text-white font-medium transition-all shadow-sm ml-1"
            title="Leave Call"
            aria-label="Leave Call"
          >
            <PhoneOff className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Soundboard Modal */}
      <SoundboardModal open={showSoundboard} onOpenChange={setShowSoundboard} isInCall={true} />
    </div>
  );
}
