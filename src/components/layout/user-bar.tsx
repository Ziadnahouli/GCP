'use client';

import * as React from 'react';
import { Mic, MicOff, Headphones, Settings, ChevronUp, Sparkles, LogOut } from 'lucide-react';
import { useAuth } from '@/features/auth/auth-provider';
import { Avatar } from '@/components/ui/avatar';
import { StatusSelector } from './status-selector';
import { SettingsModal } from './settings-modal';
import { SoundboardModal } from '@/components/soundboard/soundboard-modal';
import { UserStatus } from '@/lib/types/profile';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';

export function UserBar() {
  const { profile, updateProfile, signOut } = useAuth();
  const { toast } = useToast();

  const [isMuted, setIsMuted] = React.useState(false);
  const [isDeafened, setIsDeafened] = React.useState(false);
  const [showStatusPicker, setShowStatusPicker] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [showSoundboard, setShowSoundboard] = React.useState(false);

  const toggleMic = () => {
    setIsMuted((prev) => {
      const next = !prev;
      toast({
        title: next ? 'Microphone Muted' : 'Microphone Active',
        description: next ? 'You are muted' : 'Microphone unmuted',
        type: next ? 'error' : 'success',
        duration: 1500,
      });
      return next;
    });
  };

  const toggleDeafen = () => {
    setIsDeafened((prev) => {
      const next = !prev;
      if (next && !isMuted) setIsMuted(true);
      toast({
        title: next ? 'Deafened' : 'Undeafened',
        description: next ? 'Audio output and microphone muted' : 'Audio output restored',
        type: next ? 'error' : 'success',
        duration: 1500,
      });
      return next;
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
      <div className="relative h-14 bg-surface-sidebar border-t border-border/80 px-2 flex items-center justify-between select-none">
        {/* User Info & Avatar Button */}
        <div
          onClick={() => setShowStatusPicker((prev) => !prev)}
          className="flex items-center gap-2.5 p-1 rounded-lg hover:bg-surface-hover/80 transition-colors cursor-pointer min-w-0 max-w-[150px] sm:max-w-[170px]"
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
            <div className="text-xs font-semibold text-foreground truncate leading-tight">
              {profile?.display_name || 'Connecting...'}
            </div>
            <div className="text-[10px] text-muted-foreground truncate leading-tight flex items-center gap-1 font-mono">
              @{profile?.username || 'user'}
              <ChevronUp className="w-2.5 h-2.5 opacity-50 shrink-0" />
            </div>
          </div>
        </div>

        {/* Action Controls: Mic, Deafen, Settings */}
        <div className="flex items-center gap-0.5">
          {/* Mic */}
          <button
            onClick={toggleMic}
            className={cn(
              'p-2 rounded-lg transition-colors',
              isMuted
                ? 'text-rose-400 bg-rose-500/10 hover:bg-rose-500/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
            )}
            title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
            aria-label="Microphone Toggle"
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* Deafen */}
          <button
            onClick={toggleDeafen}
            className={cn(
              'p-2 rounded-lg transition-colors',
              isDeafened
                ? 'text-rose-400 bg-rose-500/10 hover:bg-rose-500/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
            )}
            title={isDeafened ? 'Undeafen' : 'Deafen'}
            aria-label="Deafen Toggle"
          >
            <Headphones className="w-4 h-4" />
          </button>

          {/* Soundboard */}
          <button
            onClick={() => setShowSoundboard(true)}
            className="p-2 rounded-lg text-muted-foreground hover:text-amber-400 hover:bg-amber-400/10 transition-colors"
            title="Gaming Soundboard (Hotkeys 1-9)"
            aria-label="Soundboard"
          >
            <Sparkles className="w-4 h-4" />
          </button>

          {/* Settings */}
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
            title="User Settings"
            aria-label="User Settings"
          >
            <Settings className="w-4 h-4" />
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
            className="p-2 rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            title="Sign Out"
            aria-label="Sign Out"
          >
            <LogOut className="w-4 h-4" />
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
