'use client';

import * as React from 'react';
import { Mic, MicOff, Headphones, Settings, ChevronUp, Sparkles, LogOut, Terminal } from 'lucide-react';
import { useAuth } from '@/features/auth/auth-provider';
import { useCallState, useCallActions } from '@/features/calls/call-context';
import { useServerVoiceContext } from '@/features/servers/server-voice-context';
import { Avatar } from '@/components/ui/avatar';
import { StatusSelector } from './status-selector';
import { SettingsModal } from './settings-modal';
import { SoundboardModal } from '@/components/soundboard/soundboard-modal';
import { UserStatus } from '@/lib/types/profile';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { triggerOpenLogsWindow } from '@/hooks/use-diagnostics-logs';
import { debugLogger } from '@/lib/logger/debug-logger';

export function UserBar() {
  const { profile, updateProfile, signOut } = useAuth();
  const { toast } = useToast();
  const callState = useCallState();
  const callActions = useCallActions();
  const serverVoice = useServerVoiceContext();

  const [localMuted, setLocalMuted] = React.useState(false);
  const [localDeafened, setLocalDeafened] = React.useState(false);
  const [showStatusPicker, setShowStatusPicker] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [showSoundboard, setShowSoundboard] = React.useState(false);
  const [hasErrors, setHasErrors] = React.useState(false);

  const isInPrivateCall = callState.callStatus !== 'idle';
  const isInServerVoice = Boolean(serverVoice.isVoiceConnected);

  const isMuted = isInPrivateCall
    ? callState.isMicMuted
    : isInServerVoice
    ? serverVoice.isMicMuted
    : localMuted;

  const isDeafened = isInPrivateCall
    ? callState.isDeafened
    : isInServerVoice
    ? serverVoice.isDeafened
    : localDeafened;

  React.useEffect(() => {
    setHasErrors(debugLogger.getLogs().some((l) => l.level === 'error'));
    const unsub = debugLogger.subscribe((entry) => {
      if (entry.level === 'error') setHasErrors(true);
    });
    return () => unsub();
  }, []);

  const handleToggleMic = () => {
    if (isInPrivateCall) {
      callActions.toggleMic();
      return;
    }
    if (isInServerVoice) {
      serverVoice.toggleMic();
      return;
    }
    const next = !localMuted;
    setLocalMuted(next);
    toast({
      title: next ? 'Microphone Muted' : 'Microphone Active',
      description: next ? 'You are muted' : 'Microphone unmuted',
      type: next ? 'error' : 'success',
      duration: 1500,
    });
  };

  const handleToggleDeafen = () => {
    if (isInPrivateCall) {
      callActions.toggleDeafen();
      return;
    }
    if (isInServerVoice) {
      serverVoice.toggleDeafen();
      return;
    }
    const next = !localDeafened;
    setLocalDeafened(next);
    if (next && !localMuted) {
      setLocalMuted(true);
    }
    toast({
      title: next ? 'Deafened' : 'Undeafened',
      description: next ? 'Audio output and microphone muted' : 'Audio output restored',
      type: next ? 'error' : 'success',
      duration: 1500,
    });
  };

  const handleStatusChange = async (newStatus: UserStatus) => {
    const res = await updateProfile({ status: newStatus });
    if (res?.error) {
      toast({
        title: 'Presence Update Failed',
        description: res.error,
        type: 'error',
      });
    } else {
      toast({
        title: 'Status Updated',
        description: `Presence set to ${newStatus.toUpperCase()}`,
        type: 'info',
        duration: 2000,
      });
    }
  };

  return (
    <>
      <div className="relative h-13 bg-surface-sidebar border-t border-border px-2 py-1.5 flex items-center justify-between select-none">
        {/* User Info & Avatar Button */}
        <div
          onClick={() => setShowStatusPicker((prev) => !prev)}
          className="flex items-center gap-2 p-1 rounded-lg hover:bg-surface-default transition-colors cursor-pointer min-w-0 max-w-[105px] sm:max-w-[120px]"
          title="Click to change status"
        >
          <Avatar
            src={profile?.avatar_url || null}
            name={profile?.display_name || 'Gamer'}
            status={profile?.status || 'online'}
            showStatus
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-foreground truncate leading-tight">
              {profile?.display_name || 'User'}
            </div>
            <div className="text-xs text-muted-foreground/60 truncate leading-tight flex items-center gap-0.5">
              <span>@{profile?.username || 'user'}</span>
            </div>
          </div>
        </div>

        {/* Action Controls: Mic, Deafen, Soundboard, Settings, Logs, Sign Out */}
        <div className="flex items-center gap-0.5">
          {/* Mic */}
          <button
            onClick={handleToggleMic}
            className={cn(
              'p-1.5 rounded-md transition-colors',
              isMuted
                ? 'text-danger bg-danger/10 hover:bg-danger/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
            )}
            title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
            aria-label="Microphone Toggle"
          >
            {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          </button>

          {/* Deafen */}
          <button
            onClick={handleToggleDeafen}
            className={cn(
              'p-1.5 rounded-md transition-colors',
              isDeafened
                ? 'text-danger bg-danger/10 hover:bg-danger/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
            )}
            title={isDeafened ? 'Undeafen' : 'Deafen'}
            aria-label="Deafen Toggle"
          >
            <Headphones className="w-3.5 h-3.5" />
          </button>

          {/* Soundboard */}
          <button
            onClick={() => setShowSoundboard(true)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-warning hover:bg-warning/10 transition-colors"
            title="Gaming Soundboard"
            aria-label="Soundboard"
          >
            <Sparkles className="w-3.5 h-3.5" />
          </button>

          {/* Diagnostics & Live Logs Console */}
          <button
            onClick={() => triggerOpenLogsWindow()}
            className="relative p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            title="Diagnostics & Live Logs (Ctrl + ~)"
            aria-label="System Diagnostics & Logs"
          >
            <Terminal className="w-3.5 h-3.5" />
            {hasErrors && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />
            )}
          </button>

          {/* Settings */}
          <button
            onClick={() => setShowSettings(true)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
            title="User Settings"
            aria-label="User Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          {/* Sign Out */}
          <button
            onClick={async () => {
              await signOut();
              toast({
                title: 'Signed Out',
                description: 'You have been disconnected from the session.',
                type: 'info',
              });
            }}
            className="p-1.5 rounded-md text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors"
            title="Sign Out"
            aria-label="Sign Out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Presence Status Selector Popup */}
        {showStatusPicker && (
          <StatusSelector
            currentStatus={profile?.status || 'online'}
            onSelect={handleStatusChange}
            onClose={() => setShowStatusPicker(false)}
          />
        )}
      </div>

      {/* Settings Modal */}
      <SettingsModal open={showSettings} onOpenChange={setShowSettings} />

      {/* Soundboard Modal */}
      <SoundboardModal open={showSoundboard} onOpenChange={setShowSoundboard} />
    </>
  );
}
