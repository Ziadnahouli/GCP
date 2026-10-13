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
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { NetworkDiagnostics, DiagnosticsStats } from './network-diagnostics';
import { SoundboardModal } from '@/components/soundboard/soundboard-modal';
import { CallParticipant, CallStatus } from '@/features/calls/call-context';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/auth-provider';

interface CallModalProps {
  open: boolean;
  callStatus: CallStatus;
  isVideo: boolean;
  isMicMuted: boolean;
  isDeafened?: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  isNoiseSuppressionEnabled?: boolean;
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
  className?: string;
}

const VideoFeed = React.memo(function VideoFeed({
  stream,
  muted = true,
  className,
}: VideoFeedProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const trackIdsRef = React.useRef<string>('');

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = muted;
    video.defaultMuted = muted;

    const videoTracks = stream ? stream.getVideoTracks() : [];
    if (stream && videoTracks.length > 0) {
      const currentTrackIds = videoTracks
        .map((t) => `${t.id}-${t.readyState}`)
        .sort()
        .join(',');

      if (video.srcObject !== stream || trackIdsRef.current !== currentTrackIds) {
        trackIdsRef.current = currentTrackIds;
        video.srcObject = stream;
      }

      let isCancelled = false;

      const playVideo = () => {
        if (!video || isCancelled) return;
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise.catch((err: unknown) => {
            const errObj = err as { name?: string; message?: string };
            // Benign browser interruptions (e.g. rapid track changes, element removal)
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

      playVideo();

      videoTracks.forEach((vt) => {
        vt.enabled = true;
        vt.onunmute = playVideo;
      });

      stream.onaddtrack = () => playVideo();
      stream.onremovetrack = () => playVideo();

      return () => {
        isCancelled = true;
      };
    } else {
      if (video.srcObject !== null) {
        trackIdsRef.current = '';
        video.srcObject = null;
      }
    }
  }, [stream, muted]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={muted}
      onLoadedMetadata={(e) => {
        (e.currentTarget as HTMLVideoElement).play().catch(() => {});
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
  const [showSoundboard, setShowSoundboard] = React.useState(false);

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
        'fixed z-50 flex flex-col overflow-hidden bg-surface-panel border border-white/[0.08] shadow-2xl shadow-black/90',
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
          'h-11 border-b border-white/[0.06] px-4 flex items-center justify-between shrink-0 bg-surface-header/90 select-none backdrop-blur-md',
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
              callStatus === 'outgoing_ringing' ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'
            )}
          />
          <span className="text-xs font-medium text-foreground">
            {screenSharer
              ? 'Screen Broadcast'
              : isCameraOn || participants.some((p) => p.isCameraOn)
              ? 'Video Stream'
              : 'Voice Call'}
          </span>
          {isNoiseSuppressionEnabled && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-emerald-400/80 font-mono ml-1">
              • AI Noise Filter
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Dock Reset Button if user dragged modal */}
          {!isFullscreen && position && (
            <button
              onClick={() => setPosition(null)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors"
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
              'p-1.5 rounded-md transition-colors text-xs flex items-center gap-1 font-mono text-[10px]',
              showDiagnostics
                ? 'bg-primary/20 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]'
            )}
            title="Diagnostics"
            aria-label="Diagnostics"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{stats.rttMs ?? 0}ms</span>
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={() => setIsFullscreen((prev) => !prev)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
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
                <div className="flex-1 rounded-xl bg-[#090B0E] border border-white/[0.08] flex items-center justify-center relative overflow-hidden group">
                  <div className="absolute top-3 left-3 flex items-center gap-2 bg-surface-panel/90 backdrop-blur-md px-2.5 py-1 rounded-lg text-xs font-medium text-foreground z-10 border border-white/[0.08]">
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
                        'h-full w-24 rounded-lg bg-surface-default/70 border flex items-center justify-center relative p-2 transition-colors',
                        p.isSpeaking ? 'border-primary/60 ring-1 ring-primary/40' : 'border-white/[0.06]'
                      )}
                    >
                      <Avatar name={p.name} size="sm" />
                      <span className="absolute bottom-1 text-[9px] font-medium text-foreground/80 truncate px-1 max-w-[90%]">
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
                  const isCameraActive = isLocalUser
                    ? Boolean(isCameraOn && hasLocalVideo)
                    : Boolean(p.isCameraOn);

                  return (
                    <div
                      key={p.id}
                      className={cn(
                        'relative rounded-xl overflow-hidden bg-surface-default/60 border flex flex-col items-center justify-center h-full min-h-[160px] p-4 transition-all',
                        p.isSpeaking
                          ? 'border-primary/60 ring-1 ring-primary/30'
                          : 'border-white/[0.06]'
                      )}
                    >
                      {/* Live WebRTC Camera Video Feed (Always mounted to protect media pipeline) */}
                      <div
                        className={cn(
                          'w-full h-full absolute inset-0 flex items-center justify-center bg-black transition-opacity duration-200',
                          isCameraActive ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none z-0'
                        )}
                      >
                        <VideoFeed
                          stream={isLocalUser ? localStream : remoteStream}
                          muted={true}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* Fallback Avatar with speaking ring */}
                      <div
                        className={cn(
                          'flex flex-col items-center justify-center space-y-2 transition-opacity duration-200',
                          isCameraActive ? 'opacity-0 pointer-events-none' : 'opacity-100'
                        )}
                      >
                        <Avatar
                          name={p.name}
                          size="lg"
                          className={cn(
                            'transition-transform',
                            p.isSpeaking && 'scale-105 ring-2 ring-primary/60'
                          )}
                        />
                      </div>

                      {/* Participant Name Badge */}
                      <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-md text-[10px] font-medium text-white/90 flex items-center gap-1.5 z-10 border border-white/[0.06]">
                        <span>{p.name}</span>
                        {p.isMuted && <MicOff className="w-3 h-3 text-rose-400" />}
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
          <div className="absolute top-4 right-4 z-20 w-80 max-w-[calc(100%-2rem)]">
            <NetworkDiagnostics
              stats={stats}
              onRestartConnection={onRestartConnection}
              onClose={() => setShowDiagnostics(false)}
            />
          </div>
        )}
      </div>

      {/* Control Bar Footer Dock */}
      <div className="h-16 border-t border-white/[0.06] px-4 flex items-center justify-center shrink-0 bg-surface-header/60 backdrop-blur-md">
        <div className="flex items-center gap-2 sm:gap-2.5 bg-surface-default/90 backdrop-blur-md border border-white/[0.08] px-3 py-1.5 rounded-full shadow-lg">
          {/* Mic Toggle */}
          <button
            onClick={onToggleMic}
            className={cn(
              'p-2 rounded-full transition-all',
              isMicMuted
                ? 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/25'
                : 'bg-white/[0.05] text-foreground hover:bg-white/[0.08]'
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
                  ? 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/25'
                  : 'bg-white/[0.05] text-foreground hover:bg-white/[0.08]'
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
                ? 'bg-white/[0.05] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground'
                : 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
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
                : 'bg-white/[0.05] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground'
            )}
            title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
            aria-label={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
          >
            <Monitor className="w-4 h-4" />
          </button>

          {/* Soundboard Button */}
          <button
            onClick={() => setShowSoundboard(true)}
            className="p-2 rounded-full bg-white/[0.05] text-muted-foreground hover:text-amber-400 hover:bg-amber-400/10 transition-colors"
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
                  ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                  : 'bg-white/[0.05] text-muted-foreground hover:bg-white/[0.08]'
              )}
              title={isNoiseSuppressionEnabled ? 'Noise Filter ON' : 'Noise Filter OFF'}
              aria-label={isNoiseSuppressionEnabled ? 'Disable noise filter' : 'Enable noise filter'}
            >
              <ShieldCheck className="w-4 h-4" />
            </button>
          )}

          {/* End Call Button */}
          <button
            onClick={onEndCall}
            className="p-2 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-medium transition-all shadow-sm ml-1"
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
