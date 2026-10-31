'use client';

import * as React from 'react';
import { Mic, MicOff, Headphones, Settings, ChevronUp, Sparkles, LogOut, Terminal, MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/features/auth/auth-provider';
import { useCallState, useCallActions } from '@/features/calls/call-context';
import { useServerVoiceContext } from '@/features/servers/server-voice-context';
import { Avatar } from '@/components/ui/avatar';
import { ProfileCardTrigger } from '@/components/profile/ProfileCardTrigger';
import dynamic from 'next/dynamic';
import { StatusSelector } from './status-selector';

const SettingsModal = dynamic(
  () => import('./settings-modal').then((m) => m.SettingsModal),
  { ssr: false }
);

const SoundboardModal = dynamic(
  () => import('@/components/soundboard/soundboard-modal').then((m) => m.SoundboardModal),
  { ssr: false }
);
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
        {/* User Info & Profile Card Trigger */}
        <ProfileCardTrigger
          userId={profile?.id}
          side="top"
          align="start"
          sideOffset={12}
          className="min-w-0 flex-1 mr-1"
        >
          <div
            className="flex items-center gap-2 py-1 px-1.5 rounded-control hover:bg-surface-hover transition-colors cursor-pointer min-w-0 flex-1 w-full"
            title="View Profile Card"
          >
            <Avatar
              src={profile?.avatar_url || null}
              name={profile?.display_name || 'User'}
              status={profile?.status || 'online'}
              showStatus
              size="32"
            />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-foreground truncate leading-tight">
                {profile?.display_name || 'User'}
              </div>
              <div className="text-xs text-muted-foreground/80 truncate leading-tight">
                @{profile?.username || 'user'}
              </div>
            </div>
          </div>
        </ProfileCardTrigger>

        {/* Action Controls: Mic, Deafen, Settings, More Options */}
        <div className="flex items-center gap-0.5 shrink-0">
          {/* Mic */}
          <button
            onClick={handleToggleMic}
            className={cn(
              'w-7 h-7 flex items-center justify-center rounded-control transition-colors',
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
              'w-7 h-7 flex items-center justify-center rounded-control transition-colors',
              isDeafened
                ? 'text-danger bg-danger/10 hover:bg-danger/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
            )}
            title={isDeafened ? 'Undeafen' : 'Deafen'}
            aria-label="Deafen Toggle"
          >
            <Headphones className="w-3.5 h-3.5" />
          </button>

          {/* Settings */}
          <button
            onClick={() => setShowSettings(true)}
            className="w-7 h-7 flex items-center justify-center rounded-control text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
            title="User Settings"
            aria-label="User Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          {/* Quick Tools & More Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="w-7 h-7 flex items-center justify-center rounded-control text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors relative"
                title="More Options"
                aria-label="More Options"
              >
                <MoreVertical className="w-3.5 h-3.5" />
                {hasErrors && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-52 mb-1">
              <DropdownMenuItem onClick={() => setShowStatusPicker(true)} className="gap-2 cursor-pointer">
                <span className="w-2 h-2 rounded-full bg-status-online shrink-0" />
                <span>Change Online Status</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowSoundboard(true)} className="gap-2 cursor-pointer">
                <Sparkles className="w-4 h-4 text-warning" />
                <span>Gaming Soundboard</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => triggerOpenLogsWindow()} className="gap-2 cursor-pointer">
                <Terminal className="w-4 h-4 text-primary" />
                <span className="flex-1">Diagnostics & Logs</span>
                <kbd className="text-xs font-mono text-muted-foreground border border-border px-1 rounded">Ctrl+~</kbd>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  await signOut();
                  toast({
                    title: 'Signed Out',
                    description: 'You have been disconnected from the session.',
                    type: 'info',
                  });
                }}
                className="gap-2 text-danger/90 hover:text-danger hover:bg-danger/10 focus:bg-danger/10 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
