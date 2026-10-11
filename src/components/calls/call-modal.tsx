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
  participants: CallParticipant[];
  stats: DiagnosticsStats;
  localStream?: MediaStream | null;
  remoteStream?: MediaStream | null;
  screenStream?: MediaStream | null;
  onEndCall: () => void;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
}

export function CallModal({
  open,
  callStatus,
  isVideo,
  isMicMuted,
  isCameraOn,
  isScreenSharing,
  participants,
  stats,
  localStream,
  remoteStream,
  screenStream,
  onEndCall,
  onToggleMic,
  onToggleCamera,
  onToggleScreenShare,
}: CallModalProps) {
  const { user } = useAuth();
  const [showDiagnostics, setShowDiagnostics] = React.useState(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [showSoundboard, setShowSoundboard] = React.useState(false);

  const localVideoRef = React.useRef<HTMLVideoElement>(null);
  const remoteVideoRef = React.useRef<HTMLVideoElement>(null);
  const localScreenVideoRef = React.useRef<HTMLVideoElement>(null);
  const remoteScreenVideoRef = React.useRef<HTMLVideoElement>(null);

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

  // Bind local camera stream to local video element
  React.useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(() => {});
    }
  }, [localStream, isCameraOn, callStatus, participants]);

  // Bind remote camera stream to remote video element
  React.useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(() => {});
    }
  }, [remoteStream, callStatus, participants]);

  // Bind local screen share stream to display video element
  React.useEffect(() => {
    if (localScreenVideoRef.current && screenStream) {
      localScreenVideoRef.current.srcObject = screenStream;
      localScreenVideoRef.current.play().catch(() => {});
    }
  }, [screenStream, screenSharer]);

  // Bind remote screen share stream to display video element
  React.useEffect(() => {
    if (remoteScreenVideoRef.current && remoteStream) {
      remoteScreenVideoRef.current.srcObject = remoteStream;
      remoteScreenVideoRef.current.play().catch(() => {});
    }
  }, [remoteStream, screenSharer]);

  if (!open || callStatus === 'idle') return null;

  return (
    <div
      className={cn(
        'fixed z-50 transition-all duration-200 flex flex-col overflow-hidden bg-card/95 border border-border shadow-2xl backdrop-blur-2xl',
        isFullscreen
          ? 'inset-0 rounded-none'
          : 'inset-0 sm:inset-auto sm:bottom-6 sm:right-6 sm:w-full sm:max-w-2xl sm:h-[480px] sm:rounded-2xl rounded-none'
      )}
    >
      {/* Call Header */}
      <div className="h-12 border-b border-border/80 px-4 flex items-center justify-between shrink-0 bg-surface-header/60 select-none">
        <div className="flex items-center gap-2.5">
          <Badge variant="success" className="text-[10px] px-2 py-0.5 uppercase font-mono">
            {callStatus === 'outgoing_ringing' ? 'Calling...' : 'Live Call'}
          </Badge>
          <span className="text-xs font-bold text-foreground">
            {screenSharer
              ? 'Tactical Display Broadcast'
              : isCameraOn || participants.some((p) => p.isCameraOn)
              ? 'Tactical Video Stream'
              : 'Encrypted Voice Room'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Telemetry diagnostics button */}
          <button
            onClick={() => setShowDiagnostics((prev) => !prev)}
            className={cn(
              'p-1.5 rounded-lg transition-colors text-xs flex items-center gap-1',
              showDiagnostics
                ? 'bg-primary/20 text-primary font-semibold'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
            )}
            title="Network Diagnostics Telemetry"
          >
            <Activity className="w-3.5 h-3.5" />
            <span className="font-mono text-[10px]">{stats.rttMs ?? 0}ms</span>
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={() => setIsFullscreen((prev) => !prev)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-hover"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Calling Stage */}
      <div className="flex-1 relative overflow-hidden p-4 flex items-center justify-center bg-background/50">
        {/* Ringing Stage */}
        {callStatus === 'outgoing_ringing' ? (
          <div className="flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in">
            <div className="relative">
              <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
              <div className="relative w-24 h-24 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center text-primary shadow-glow">
                <Phone className="w-10 h-10 animate-bounce" />
              </div>
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Connecting Media Stream</h3>
              <p className="text-xs text-muted-foreground mt-1 font-mono">
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
                <div className="flex-1 rounded-xl bg-black border border-border/80 flex items-center justify-center relative overflow-hidden group">
                  <div className="absolute top-3 left-3 flex items-center gap-2 bg-card/90 backdrop-blur-md px-2.5 py-1 rounded-lg text-xs font-semibold text-foreground z-10 shadow-sm border border-border/60">
                    <Monitor className="w-3.5 h-3.5 text-primary" />
                    <span>
                      {screenSharer.id === user?.id
                        ? 'Your Display Broadcast (Live)'
                        : `${screenSharer.name}'s Display Broadcast`}
                    </span>
                  </div>

                  {/* Real Live Video Display for Screen Share */}
                  {screenSharer.id === user?.id ? (
                    <video
                      ref={localScreenVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-contain rounded-xl bg-black"
                    />
                  ) : (
                    <video
                      ref={remoteScreenVideoRef}
                      autoPlay
                      playsInline
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
                        'h-full w-24 rounded-xl bg-card border flex items-center justify-center relative p-2',
                        p.isSpeaking ? 'border-primary shadow-glow-sm' : 'border-border'
                      )}
                    >
                      <Avatar name={p.name} size="sm" />
                      <span className="absolute bottom-1 text-[9px] font-bold text-foreground truncate px-1 max-w-[90%]">
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
                        'relative rounded-xl overflow-hidden bg-card border flex flex-col items-center justify-center h-full min-h-[160px] p-4 transition-all',
                        p.isSpeaking
                          ? 'border-primary ring-2 ring-primary/40 shadow-glow-sm'
                          : 'border-border/80'
                      )}
                    >
                      {isCameraActive ? (
                        /* Live WebRTC Camera Video Feed */
                        <div className="w-full h-full flex items-center justify-center bg-black relative rounded-xl overflow-hidden">
                          {isLocalUser ? (
                            <video
                              ref={localVideoRef}
                              autoPlay
                              playsInline
                              muted
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <video
                              ref={remoteVideoRef}
                              autoPlay
                              playsInline
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
                              p.isSpeaking && 'scale-105 ring-4 ring-primary'
                            )}
                          />
                        </div>
                      )}

                      {/* Participant Name Badge */}
                      <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded-md text-[10px] font-bold text-white flex items-center gap-1.5 z-10">
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
            <NetworkDiagnostics stats={stats} />
          </div>
        )}
      </div>

      {/* Control Bar Footer */}
      <div className="h-16 border-t border-border/80 px-4 flex items-center justify-between shrink-0 bg-surface-header/80 backdrop-blur-md">
        <div className="flex items-center gap-2">
          {/* Soundboard Button */}
          <button
            onClick={() => setShowSoundboard(true)}
            className="p-2.5 rounded-xl bg-surface-default hover:bg-surface-hover text-muted-foreground hover:text-foreground border border-border/60 transition-colors"
            title="Open Soundboard"
          >
            <Sparkles className="w-4 h-4" />
          </button>
        </div>

        {/* Media Call Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Mic Toggle */}
          <button
            onClick={onToggleMic}
            className={cn(
              'p-3 rounded-xl border transition-all',
              isMicMuted
                ? 'bg-rose-500/10 border-rose-500/40 text-rose-400 hover:bg-rose-500/20'
                : 'bg-surface-default border-border/80 text-foreground hover:bg-surface-hover'
            )}
            title={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
          >
            {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* Camera Toggle */}
          <button
            onClick={onToggleCamera}
            className={cn(
              'p-3 rounded-xl border transition-all',
              !isCameraOn
                ? 'bg-rose-500/10 border-rose-500/40 text-rose-400 hover:bg-rose-500/20'
                : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20'
            )}
            title={isCameraOn ? 'Turn Off Camera' : 'Turn On Camera'}
          >
            {isCameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
          </button>

          {/* Screen Share Toggle */}
          <button
            onClick={onToggleScreenShare}
            className={cn(
              'p-3 rounded-xl border transition-all',
              isScreenSharing
                ? 'bg-primary/20 border-primary text-primary hover:bg-primary/30'
                : 'bg-surface-default border-border/80 text-foreground hover:bg-surface-hover'
            )}
            title={isScreenSharing ? 'Stop Screen Sharing' : 'Share Screen'}
          >
            <Monitor className="w-4 h-4" />
          </button>

          {/* End Call Button */}
          <button
            onClick={onEndCall}
            className="p-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold transition-all shadow-lg hover:shadow-rose-500/30 ml-2"
            title="Disconnect Call"
          >
            <PhoneOff className="w-4 h-4" />
          </button>
        </div>

        <div className="w-10" />
      </div>

      {/* Soundboard Modal */}
      <SoundboardModal open={showSoundboard} onOpenChange={setShowSoundboard} isInCall={true} />
    </div>
  );
}
