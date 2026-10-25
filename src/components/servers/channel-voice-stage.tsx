'use client';

import * as React from 'react';
import {
  Volume2,
  Mic,
  MicOff,
  Headphones,
  VolumeX,
  Video,
  VideoOff,
  Monitor,
  MonitorUp,
  PhoneOff,
  UserPlus,
  Radio,
  Sparkles,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { Channel } from '@/lib/types/server';
import { VoiceParticipant } from '@/features/servers/server-voice-context';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { UserProfile } from '@/lib/types/profile';

function StreamVideo({
  stream,
  isMuted = false,
  className,
  objectFit = 'contain',
}: {
  stream: MediaStream | null;
  isMuted?: boolean;
  className?: string;
  objectFit?: 'contain' | 'cover';
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const el = videoRef.current;
    if (el && stream) {
      if (el.srcObject !== stream) {
        el.srcObject = stream;
      }
      el.play().catch(() => {});
    }
  }, [stream]);

  if (!stream) {
    return (
      <div className={cn('w-full h-full bg-card flex items-center justify-center text-muted-foreground text-xs', className)}>
        Connecting video feed...
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={isMuted}
      className={cn('w-full h-full', objectFit === 'cover' ? 'object-cover' : 'object-contain', className)}
    />
  );
}

interface ChannelVoiceStageProps {
  channel: Channel;
  voice: {
    isVoiceConnected: boolean;
    isConnecting: boolean;
    isSpeaking: boolean;
    isMicMuted: boolean;
    isDeafened: boolean;
    isCameraOn: boolean;
    isScreenSharing: boolean;
    audioLevel: number;
    videoStream: MediaStream | null;
    screenStream: MediaStream | null;
    remoteParticipants: VoiceParticipant[];
    remoteVideoStreams: Map<string, MediaStream>;
    channelOccupants: Map<string, any[]>;
    isNoiseSuppressionEnabled: boolean;
    noiseSuppressionMode: string;
    connectVoice: () => Promise<void>;
    disconnectVoice: () => void;
    toggleMic: () => void;
    toggleDeafen: () => void;
    toggleCamera: () => Promise<void>;
    toggleScreenShare: () => Promise<void>;
    toggleNoiseSuppression: () => void;
  };
  currentUserProfile: UserProfile | null;
  currentUserId?: string;
  canConnectVoice: boolean;
  canSpeakVoice: boolean;
  canShareScreen: boolean;
  canUseSoundboard: boolean;
  onOpenInvite: () => void;
  onOpenSoundboard: () => void;
}

export function ChannelVoiceStage({
  channel,
  voice,
  currentUserProfile,
  currentUserId,
  canConnectVoice,
  canSpeakVoice,
  canShareScreen,
  canUseSoundboard,
  onOpenInvite,
  onOpenSoundboard,
}: ChannelVoiceStageProps) {
  const screenShareBoxRef = React.useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  const toggleFullscreen = () => {
    if (!screenShareBoxRef.current) return;
    if (!document.fullscreenElement) {
      screenShareBoxRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const activeScreenShare = React.useMemo(() => {
    if (voice.isScreenSharing && voice.screenStream) {
      return {
        userId: currentUserId,
        isLocal: true,
        userName: currentUserProfile?.display_name || 'You',
        stream: voice.screenStream,
      };
    }
    const remotePresenter = voice.remoteParticipants.find((p) => p.is_screen_sharing);
    if (remotePresenter) {
      const stream = voice.remoteVideoStreams.get(remotePresenter.user_id);
      return {
        userId: remotePresenter.user_id,
        isLocal: false,
        userName: remotePresenter.display_name,
        stream: stream || null,
      };
    }
    return null;
  }, [voice.isScreenSharing, voice.screenStream, voice.remoteParticipants, voice.remoteVideoStreams, currentUserId, currentUserProfile?.display_name]);

  return (
    <div className="flex-1 flex flex-col justify-between p-4 sm:p-6 bg-background overflow-y-auto">
      {/* Voice Room Top Info */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-semibold text-foreground">{channel.name}</h2>
            {voice.isVoiceConnected ? (
              <Badge variant="accent" className="text-xs px-2 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-status-online mr-1.5" />
                Live voice
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs px-2 py-0.5 text-muted-foreground">
                Disconnected
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {channel.topic || 'WebRTC encrypted voice lounge with AI noise cancellation.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {voice.isVoiceConnected && voice.isNoiseSuppressionEnabled && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              AI: {voice.noiseSuppressionMode.toUpperCase()}
            </Badge>
          )}
        </div>
      </div>

      {/* Dynamic Live Stage: Theater Mode or Grid Mode */}
      <div className="flex-1 flex flex-col justify-center min-h-0 my-4">
        {voice.isVoiceConnected ? (
          activeScreenShare ? (
            /* THEATER MODE: Active Screen Share + Participant Dock */
            <div className="flex-1 flex flex-col min-h-0 gap-3">
              <div
                ref={screenShareBoxRef}
                className="flex-1 min-h-[220px] max-h-[56vh] w-full rounded-dialog overflow-hidden border border-border bg-card aspect-video relative shadow-floating mx-auto flex items-center justify-center group"
              >
                <StreamVideo
                  stream={activeScreenShare.stream}
                  isMuted={activeScreenShare.isLocal}
                  objectFit="contain"
                  className="w-full h-full"
                />
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                  <div className="flex items-center gap-2 bg-card/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-border text-xs font-medium text-foreground shadow-sm pointer-events-auto">
                    <MonitorUp className="w-3.5 h-3.5 text-primary" />
                    <span>{activeScreenShare.isLocal ? 'Your screen is live' : `${activeScreenShare.userName}'s screen`}</span>
                  </div>

                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    className="p-1.5 rounded-full bg-card/90 backdrop-blur-md border border-border text-foreground hover:bg-surface-hover transition-colors pointer-events-auto shadow-sm"
                    title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                  >
                    {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Participants Strip */}
              <div className="shrink-0 flex items-center gap-3 overflow-x-auto pb-1 px-1">
                {/* Local user card */}
                <div className="shrink-0 w-36 sm:w-44 rounded-control border border-border bg-card p-2.5 flex items-center gap-2.5">
                  <div className="relative shrink-0">
                    {voice.isCameraOn && voice.videoStream ? (
                      <div className="w-9 h-9 rounded-control overflow-hidden border border-border relative">
                        <StreamVideo stream={voice.videoStream} isMuted objectFit="cover" className="w-full h-full" />
                      </div>
                    ) : (
                      <Avatar
                        src={currentUserProfile?.avatar_url || null}
                        name={currentUserProfile?.display_name || 'You'}
                        size="32"
                        className={cn(
                          'transition-all',
                          voice.isSpeaking && 'ring-2 ring-status-online'
                        )}
                      />
                    )}
                    {voice.isMicMuted ? (
                      <div className="absolute -bottom-1 -right-1 p-0.5 rounded-full bg-danger text-primary-foreground">
                        <MicOff className="w-2.5 h-2.5" />
                      </div>
                    ) : (
                      <div className="absolute -bottom-1 -right-1 p-0.5 rounded-full bg-status-online text-primary-foreground">
                        <Mic className="w-2.5 h-2.5" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-foreground truncate">
                      {currentUserProfile?.display_name || 'You'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {voice.isSpeaking ? 'Speaking' : voice.isMicMuted ? 'Muted' : 'Online'}
                    </div>
                  </div>
                </div>

                {/* Remote participants */}
                {voice.remoteParticipants.map((mem) => {
                  const remoteStream = voice.remoteVideoStreams.get(mem.user_id);
                  return (
                    <div
                      key={mem.user_id || mem.id}
                      className={cn(
                        'shrink-0 w-36 sm:w-44 rounded-control border bg-card p-2.5 flex items-center gap-2.5 transition-colors',
                        mem.is_speaking ? 'border-primary' : 'border-border'
                      )}
                    >
                      <div className="relative shrink-0">
                        {mem.is_camera_on && remoteStream ? (
                          <div className="w-9 h-9 rounded-control overflow-hidden border border-border relative">
                            <StreamVideo stream={remoteStream} objectFit="cover" className="w-full h-full" />
                          </div>
                        ) : (
                          <Avatar
                            src={mem.avatar_url || null}
                            name={mem.display_name}
                            size="32"
                            className={cn(
                              'transition-all',
                              mem.is_speaking && 'ring-2 ring-status-online'
                            )}
                          />
                        )}
                        {mem.is_muted ? (
                          <div className="absolute -bottom-1 -right-1 p-0.5 rounded-full bg-danger text-primary-foreground">
                            <MicOff className="w-2.5 h-2.5" />
                          </div>
                        ) : (
                          <div className="absolute -bottom-1 -right-1 p-0.5 rounded-full bg-status-online text-primary-foreground">
                            <Mic className="w-2.5 h-2.5" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-foreground truncate">
                          {mem.display_name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {mem.is_speaking ? 'Speaking' : mem.is_muted ? 'Muted' : 'Online'}
                        </div>
                      </div>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={onOpenInvite}
                  className="shrink-0 px-3 py-2 rounded-control border border-dashed border-border bg-card hover:bg-surface-hover text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Invite</span>
                </button>
              </div>
            </div>
          ) : (
            /* GRID MODE: Standard participant tiles */
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-w-4xl mx-auto w-full">
              {/* Local participant tile */}
              <div className="relative rounded-card border border-border bg-card p-5 flex flex-col items-center justify-center text-center transition-colors">
                {voice.isCameraOn && voice.videoStream ? (
                  <div className="w-24 h-24 rounded-card overflow-hidden mb-3 border border-border relative">
                    <StreamVideo stream={voice.videoStream} isMuted objectFit="cover" className="w-full h-full" />
                  </div>
                ) : (
                  <div className="relative mb-3">
                    <Avatar
                      src={currentUserProfile?.avatar_url || null}
                      name={currentUserProfile?.display_name || 'You'}
                      size="64"
                      className={cn(
                        'transition-all',
                        voice.isSpeaking && 'ring-2 ring-status-online'
                      )}
                    />
                    {voice.isMicMuted ? (
                      <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-danger text-primary-foreground">
                        <MicOff className="w-3.5 h-3.5" />
                      </div>
                    ) : (
                      <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-status-online text-primary-foreground">
                        <Mic className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>
                )}

                <div className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <span>{currentUserProfile?.display_name || 'You'}</span>
                  <span className="text-xs text-muted-foreground font-normal">(You)</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  @{currentUserProfile?.username || 'you'}
                </div>

                {/* Speaking waveform indicator */}
                <div className="flex items-end justify-center gap-1 mt-3 h-5">
                  {!voice.isMicMuted ? (
                    voice.isSpeaking ? (
                      <div className="flex items-center gap-1 text-xs text-status-online">
                        <span className="w-1.5 h-1.5 rounded-full bg-status-online animate-pulse" />
                        <span>Speaking</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Connected</span>
                    )
                  ) : (
                    <span className="text-xs text-danger">Muted</span>
                  )}
                </div>
              </div>

              {/* Remote participant tiles */}
              {voice.remoteParticipants.map((mem) => {
                const remoteStream = voice.remoteVideoStreams.get(mem.user_id);
                return (
                  <div
                    key={mem.user_id || mem.id}
                    className={cn(
                      'relative rounded-card border bg-card p-5 flex flex-col items-center justify-center text-center transition-colors',
                      mem.is_speaking ? 'border-primary' : 'border-border'
                    )}
                  >
                    {mem.is_camera_on && remoteStream ? (
                      <div className="w-24 h-24 rounded-card overflow-hidden mb-3 border border-border relative">
                        <StreamVideo stream={remoteStream} objectFit="cover" className="w-full h-full" />
                      </div>
                    ) : (
                      <div className="relative mb-3">
                        <Avatar
                          src={mem.avatar_url || null}
                          name={mem.display_name}
                          size="64"
                          className={cn(
                            'transition-all',
                            mem.is_speaking && 'ring-2 ring-status-online'
                          )}
                        />
                        {mem.is_muted ? (
                          <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-danger text-primary-foreground">
                            <MicOff className="w-3.5 h-3.5" />
                          </div>
                        ) : (
                          <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-status-online text-primary-foreground">
                            <Mic className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                    )}

                    <div className="text-sm font-semibold text-foreground">
                      {mem.display_name}
                    </div>

                    <div className="flex items-end justify-center gap-1 mt-3 h-5">
                      {!mem.is_muted ? (
                        mem.is_speaking ? (
                          <div className="flex items-center gap-1 text-xs text-status-online">
                            <span className="w-1.5 h-1.5 rounded-full bg-status-online animate-pulse" />
                            <span>Speaking</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Connected</span>
                        )
                      ) : (
                        <span className="text-xs text-danger">Muted</span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Invite tile */}
              <div
                onClick={onOpenInvite}
                className="rounded-card border border-dashed border-border bg-card hover:bg-surface-hover p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-colors group"
              >
                <div className="w-10 h-10 rounded-full bg-surface-hover group-hover:bg-primary-subtle group-hover:text-primary text-muted-foreground flex items-center justify-center transition-colors mb-2">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                  Invite people
                </div>
                <div className="text-xs text-muted-foreground max-w-[140px] mt-1">
                  Share invite link to join this voice lounge
                </div>
              </div>
            </div>
          )
        ) : voice.isConnecting ? (
          <div className="text-center py-12 max-w-sm mx-auto space-y-3">
            <div className="w-12 h-12 rounded-full bg-primary-subtle text-primary flex items-center justify-center mx-auto">
              <Volume2 className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Connecting to voice...</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Joining encrypted voice channel for #{channel.name}.
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 max-w-md mx-auto space-y-4">
            <div className="w-12 h-12 rounded-full bg-surface-hover text-muted-foreground flex items-center justify-center mx-auto">
              <Volume2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">You are disconnected</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Join #{channel.name} to talk with members using low-latency WebRTC voice.
              </p>
            </div>

            <Button
              onClick={async () => {
                if (!canConnectVoice) return;
                await voice.connectVoice();
              }}
              disabled={!canConnectVoice}
              variant="primary"
              size="md"
              className="gap-2 px-5 min-h-[36px]"
            >
              <Volume2 className="w-4 h-4" />
              <span>{canConnectVoice ? 'Join voice' : 'Voice restricted'}</span>
            </Button>
          </div>
        )}
      </div>

      {/* Bottom Voice Control Dock (Clean Pro controls) */}
      {voice.isVoiceConnected && (
        <div className="mt-auto pt-3 border-t border-border flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
          {/* Mic toggle */}
          <Button
            type="button"
            variant={voice.isMicMuted ? 'destructive' : 'secondary'}
            size="md"
            onClick={voice.toggleMic}
            className="gap-2 min-h-[36px]"
            title={voice.isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {voice.isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            <span className="text-xs hidden sm:inline">
              {voice.isMicMuted ? 'Muted' : 'Mute'}
            </span>
          </Button>

          {/* Deafen toggle */}
          <Button
            type="button"
            variant={voice.isDeafened ? 'destructive' : 'secondary'}
            size="md"
            onClick={voice.toggleDeafen}
            className="gap-2 min-h-[36px]"
            title={voice.isDeafened ? 'Undeafen audio' : 'Deafen audio'}
          >
            {voice.isDeafened ? <VolumeX className="w-4 h-4" /> : <Headphones className="w-4 h-4" />}
            <span className="text-xs hidden sm:inline">
              {voice.isDeafened ? 'Deafened' : 'Deafen'}
            </span>
          </Button>

          {/* Camera toggle */}
          {canShareScreen && (
            <Button
              type="button"
              variant={voice.isCameraOn ? 'primary' : 'secondary'}
              size="md"
              onClick={() => voice.toggleCamera()}
              className="gap-2 min-h-[36px]"
              title="Toggle camera"
            >
              {voice.isCameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              <span className="text-xs hidden sm:inline">Camera</span>
            </Button>
          )}

          {/* Screen share toggle */}
          {canShareScreen && (
            <Button
              type="button"
              variant={voice.isScreenSharing ? 'primary' : 'secondary'}
              size="md"
              onClick={() => voice.toggleScreenShare()}
              className="gap-2 min-h-[36px]"
              title="Share screen"
            >
              {voice.isScreenSharing ? <MonitorUp className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
              <span className="text-xs hidden sm:inline">Share</span>
            </Button>
          )}

          {/* AI Noise suppression toggle */}
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={voice.toggleNoiseSuppression}
            className="gap-2 min-h-[36px] text-muted-foreground"
            title="Cycle AI noise suppression"
          >
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-xs hidden sm:inline">
              {voice.isNoiseSuppressionEnabled
                ? `AI: ${voice.noiseSuppressionMode.toUpperCase()}`
                : 'AI off'}
            </span>
          </Button>

          {/* Soundboard trigger */}
          {canUseSoundboard && (
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={onOpenSoundboard}
              className="gap-2 min-h-[36px] text-muted-foreground"
              title="Soundboard"
            >
              <Radio className="w-4 h-4 text-warning" />
              <span className="text-xs hidden sm:inline">Sounds</span>
            </Button>
          )}

          {/* Disconnect button */}
          <Button
            type="button"
            variant="destructive"
            size="md"
            onClick={voice.disconnectVoice}
            className="gap-2 min-h-[36px]"
            title="Disconnect from voice lounge"
          >
            <PhoneOff className="w-4 h-4" />
            <span className="hidden sm:inline">Disconnect</span>
          </Button>
        </div>
      )}
    </div>
  );
}
