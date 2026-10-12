'use client';

import * as React from 'react';
import {
  Mic,
  MicOff,
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

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (stream) {
      if (video.srcObject !== stream) {
        video.srcObject = stream;
      }
      video.play().catch(() => {});
    } else {
      if (video.srcObject !== null) {
        video.srcObject = null;
      }
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={muted}
      className={className}
    />
  );
});

export function CallModal({
  open,
  callStatus,
  isVideo,
  isMicMuted,
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
  onToggleCamera,
  onToggleScreenShare,
  onToggleNoiseSuppression,
  onRestartConnection,
}: CallModalProps) {
  const { user } = useAuth();
  const [showDiagnostics, setShowDiagnostics] = React.useState(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [showSoundboard, setShowSoundboard] = React.useState(false);

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
      className={cn(
        'fixed z-50 transition-all duration-200 flex flex-col overflow-hidden bg-surface-panel border border-white/[0.08] shadow-2xl shadow-black/90',
        isFullscreen
          ? 'inset-0 rounded-none'
          : 'inset-0 sm:inset-auto sm:bottom-6 sm:right-6 sm:w-full sm:max-w-2xl sm:h-[480px] sm:rounded-2xl rounded-none'
      )}
    >
      {/* Call Header */}
      <div className="h-11 border-b border-white/[0.06] px-4 flex items-center justify-between shrink-0 bg-surface-header/90 select-none backdrop-blur-md">
        <div className="flex items-center gap-2">
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
                  const isCameraActive = isLocalUser ? isCameraOn : p.isCameraOn;

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
                      {isCameraActive ? (
                        /* Live WebRTC Camera Video Feed */
                        <div className="w-full h-full flex items-center justify-center bg-black relative rounded-lg overflow-hidden">
                          {isLocalUser ? (
                            <VideoFeed
                              stream={localStream}
                              muted
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <VideoFeed
                              stream={remoteStream}
                              muted
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                      ) : (
                        /* Avatar with speaking ring */
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <Avatar
                            name={p.name}
                            size="lg"
                            className={cn(
                              'transition-transform',
                              p.isSpeaking && 'scale-105 ring-2 ring-primary/60'
                            )}
                          />
                        </div>
                      )}

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
