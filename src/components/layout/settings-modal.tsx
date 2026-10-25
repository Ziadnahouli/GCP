'use client';

import * as React from 'react';
import {
  User,
  Palette,
  Bell,
  LogOut,
  Mic,
  Sliders,
  Terminal,
  Activity,
  Keyboard,
  Shield,
  Flame,
} from 'lucide-react';
import { useAuth } from '@/features/auth/auth-provider';
import { useModalEscape } from '@/hooks/use-modal-escape';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { triggerOpenLogsWindow } from '@/hooks/use-diagnostics-logs';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';
import { ProfileTab } from './settings/ProfileTab';

const VoiceAudioTab = dynamic(() => import('./settings/VoiceAudioTab').then((m) => m.VoiceAudioTab), {
  loading: () => <div className="p-8 text-xs text-muted-foreground animate-pulse">Loading Voice & Audio...</div>,
  ssr: false,
});
const SecurityTab = dynamic(() => import('./settings/SecurityTab').then((m) => m.SecurityTab), {
  loading: () => <div className="p-8 text-xs text-muted-foreground animate-pulse">Loading Security...</div>,
  ssr: false,
});
const KeybindsTab = dynamic(() => import('./settings/KeybindsTab').then((m) => m.KeybindsTab), {
  loading: () => <div className="p-8 text-xs text-muted-foreground animate-pulse">Loading Keybinds...</div>,
  ssr: false,
});
const AppearanceTab = dynamic(() => import('./settings/AppearanceTab').then((m) => m.AppearanceTab), {
  loading: () => <div className="p-8 text-xs text-muted-foreground animate-pulse">Loading Appearance...</div>,
  ssr: false,
});

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const { settings, updateSettings, signOut } = useAuth();
  const { toast } = useToast();
  useModalEscape(open, onOpenChange);

  const [activeTab, setActiveTab] = React.useState<
    'profile' | 'appearance' | 'studio' | 'audio' | 'shortcuts' | 'notifs' | 'security' | 'diagnostics'
  >('profile');

  // Notification states
  const [desktopNotifs, setDesktopNotifs] = React.useState(true);
  const [soundEffects, setSoundEffects] = React.useState(true);
  const [notifDms, setNotifDms] = React.useState(true);
  const [notifMentions, setNotifMentions] = React.useState(true);
  const [notifFriendRequests, setNotifFriendRequests] = React.useState(true);
  const [notifInvites, setNotifInvites] = React.useState(true);
  const [notifMissedCalls, setNotifMissedCalls] = React.useState(true);

  React.useEffect(() => {
    if (settings) {
      if (settings.desktop_notifications !== undefined) setDesktopNotifs(settings.desktop_notifications);
      if (settings.sound_effects_enabled !== undefined) setSoundEffects(settings.sound_effects_enabled);
      if (settings.notif_dms !== undefined) setNotifDms(settings.notif_dms);
      if (settings.notif_mentions !== undefined) setNotifMentions(settings.notif_mentions);
      if (settings.notif_friend_requests !== undefined) setNotifFriendRequests(settings.notif_friend_requests);
      if (settings.notif_invites !== undefined) setNotifInvites(settings.notif_invites);
      if (settings.notif_missed_calls !== undefined) setNotifMissedCalls(settings.notif_missed_calls);
    }
  }, [settings, open]);

  const handleToggleDesktopNotifs = async () => {
    const nextVal = !desktopNotifs;
    setDesktopNotifs(nextVal);
    if (nextVal && typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        try {
          await Notification.requestPermission();
        } catch {}
      }
    }
    await updateSettings({ desktop_notifications: nextVal });
    toast({
      title: nextVal ? 'Desktop Notifications Enabled' : 'Desktop Notifications Disabled',
      description: nextVal ? 'You will receive OS alerts for incoming squad calls and DMs.' : 'Desktop alerts silenced.',
      type: 'info',
      duration: 2000,
    });
  };

  const handleToggleSoundEffects = async () => {
    const nextVal = !soundEffects;
    setSoundEffects(nextVal);
    await updateSettings({ sound_effects_enabled: nextVal });
    toast({
      title: nextVal ? 'Sound Effects Enabled' : 'Sound Effects Muted',
      description: nextVal ? 'Acoustic UI feedback and message chimes active.' : 'UI chimes silenced.',
      type: 'info',
      duration: 2000,
    });
  };

  const handleToggleCategory = async (
    key: 'notif_dms' | 'notif_mentions' | 'notif_friend_requests' | 'notif_invites' | 'notif_missed_calls',
    currentVal: boolean
  ) => {
    const nextVal = !currentVal;
    if (key === 'notif_dms') setNotifDms(nextVal);
    if (key === 'notif_mentions') setNotifMentions(nextVal);
    if (key === 'notif_friend_requests') setNotifFriendRequests(nextVal);
    if (key === 'notif_invites') setNotifInvites(nextVal);
    if (key === 'notif_missed_calls') setNotifMissedCalls(nextVal);

    await updateSettings({ [key]: nextVal });
    toast({
      title: 'Preference Updated',
      description: 'Notification category preference saved.',
      type: 'info',
      duration: 2000,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl lg:max-w-6xl md:w-[980px] lg:w-[1100px] h-[720px] max-h-[94vh] p-0 flex flex-col md:flex-row overflow-hidden border border-border bg-card text-foreground w-[96vw] shadow-floating rounded-dialog"
        onClose={() => onOpenChange(false)}
      >
        {/* Navigation Sidebar */}
        <div className="w-full md:w-64 md:h-full bg-surface-sidebar p-3 md:p-4 border-b md:border-b-0 md:border-r border-border shrink-0 flex flex-row md:flex-col justify-between overflow-x-auto md:overflow-x-visible gap-2 no-scrollbar select-none">
          <div className="space-y-4 w-full">
            {/* Header */}
            <div className="hidden md:flex items-center gap-2.5 px-2.5 py-1 text-xs font-bold text-foreground">
              <div className="w-6 h-6 rounded-control bg-primary-subtle text-primary flex items-center justify-center">
                <Flame className="w-3.5 h-3.5" />
              </div>
              <span className="tracking-wide uppercase text-xs font-semibold text-foreground">
                Nexus Studio Settings
              </span>
            </div>

            {/* Navigation Groups */}
            <div className="space-y-3">
              <div>
                <div className="hidden md:block px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Identity
                </div>
                <div className="flex flex-row md:flex-col gap-1">
                  <button
                    onClick={() => setActiveTab('profile')}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-control text-xs transition-colors text-left w-full font-medium',
                      activeTab === 'profile'
                        ? 'bg-primary-subtle text-primary font-semibold'
                        : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                    )}
                  >
                    <User className="w-4 h-4 shrink-0" />
                    <span>Gamer Profile</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('appearance')}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-control text-xs transition-colors text-left w-full font-medium',
                      activeTab === 'appearance'
                        ? 'bg-primary-subtle text-primary font-semibold'
                        : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                    )}
                  >
                    <Palette className="w-4 h-4 shrink-0" />
                    <span>Themes & Accents</span>
                  </button>
                </div>
              </div>

              <div>
                <div className="hidden md:block px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Hardware & Studio
                </div>
                <div className="flex flex-row md:flex-col gap-1">
                  <button
                    onClick={() => setActiveTab('studio')}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-control text-xs transition-colors text-left w-full font-medium',
                      activeTab === 'studio'
                        ? 'bg-primary-subtle text-primary font-semibold'
                        : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                    )}
                  >
                    <Mic className="w-4 h-4 shrink-0" />
                    <span>Voice & Video Studio</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('audio')}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-control text-xs transition-colors text-left w-full font-medium',
                      activeTab === 'audio'
                        ? 'bg-primary-subtle text-primary font-semibold'
                        : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                    )}
                  >
                    <Sliders className="w-4 h-4 shrink-0" />
                    <span>Audio Processing</span>
                  </button>
                </div>
              </div>

              <div>
                <div className="hidden md:block px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Preferences
                </div>
                <div className="flex flex-row md:flex-col gap-1">
                  <button
                    onClick={() => setActiveTab('shortcuts')}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-control text-xs transition-colors text-left w-full font-medium',
                      activeTab === 'shortcuts'
                        ? 'bg-primary-subtle text-primary font-semibold'
                        : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                    )}
                  >
                    <Keyboard className="w-4 h-4 shrink-0" />
                    <span>Shortcuts & Keybinds</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('notifs')}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-control text-xs transition-colors text-left w-full font-medium',
                      activeTab === 'notifs'
                        ? 'bg-primary-subtle text-primary font-semibold'
                        : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                    )}
                  >
                    <Bell className="w-4 h-4 shrink-0" />
                    <span>Notifications</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('security')}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-control text-xs transition-colors text-left w-full font-medium',
                      activeTab === 'security'
                        ? 'bg-primary-subtle text-primary font-semibold'
                        : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                    )}
                  >
                    <Shield className="w-4 h-4 shrink-0" />
                    <span>Security & Privacy</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('diagnostics')}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-control text-xs transition-colors text-left w-full font-medium',
                      activeTab === 'diagnostics'
                        ? 'bg-primary-subtle text-primary font-semibold'
                        : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                    )}
                  >
                    <Terminal className="w-4 h-4 shrink-0" />
                    <span>Diagnostics & Logs</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* User Sign Out Button */}
          <div className="border-t-0 md:border-t border-border pt-0 md:pt-3 shrink-0 flex items-center justify-between">
            <button
              onClick={async () => {
                await signOut();
                onOpenChange(false);
                toast({ title: 'Signed Out', description: 'You have logged out of your session.', type: 'info' });
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-control text-xs font-semibold text-danger hover:bg-danger/10 transition-colors w-full"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* Settings Body Content Area */}
        <div className="flex-1 min-w-0 min-h-0 overflow-y-auto p-4 md:p-6 bg-card relative custom-scrollbar">
          {/* TAB 1: GAMER PROFILE */}
          {activeTab === 'profile' && <ProfileTab />}

          {/* TAB 2: APPEARANCE & THEMES */}
          {activeTab === 'appearance' && <AppearanceTab />}

          {/* TAB 3 & 4: VOICE & VIDEO STUDIO / AUDIO PROCESSING */}
          {(activeTab === 'studio' || activeTab === 'audio') && (
            <VoiceAudioTab activeTab={activeTab} open={open} />
          )}

          {/* TAB 5: SHORTCUTS & KEYBINDS */}
          {activeTab === 'shortcuts' && <KeybindsTab />}

          {/* TAB 6: NOTIFICATIONS */}
          {activeTab === 'notifs' && (
            <div className="space-y-6 max-w-3xl w-full pb-16">
              <div>
                <h3 className="text-base font-semibold text-foreground">Notifications & Sounds</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Manage incoming call alerts, message chimes, and desktop popups.
                </p>
              </div>

              <div className="space-y-3">
                <div
                  onClick={handleToggleDesktopNotifs}
                  className="flex items-center justify-between p-3.5 rounded-card bg-card border border-border cursor-pointer hover:bg-surface-hover transition-colors"
                >
                  <div>
                    <div className="text-xs font-semibold text-foreground">Desktop System Notifications</div>
                    <div className="text-xs text-muted-foreground">Receive OS alert badges for incoming calls and DMs</div>
                  </div>
                  <Switch
                    checked={desktopNotifs}
                    onCheckedChange={handleToggleDesktopNotifs}
                    aria-label="Desktop notifications"
                  />
                </div>

                <div
                  onClick={handleToggleSoundEffects}
                  className="flex items-center justify-between p-3.5 rounded-card bg-card border border-border cursor-pointer hover:bg-surface-hover transition-colors"
                >
                  <div>
                    <div className="text-xs font-semibold text-foreground">Soundboard & UI Chimes</div>
                    <div className="text-xs text-muted-foreground">Play acoustic tones on message send and squad join</div>
                  </div>
                  <Switch
                    checked={soundEffects}
                    onCheckedChange={handleToggleSoundEffects}
                    aria-label="Sound effects"
                  />
                </div>
              </div>

              {/* Category-Specific Notification Settings */}
              <div className="space-y-3 pt-3 border-t border-border">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notification Categories</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Filter persistent inbox entries and unread badges by category.
                  </p>
                </div>

                <div className="space-y-2">
                  {[
                    { key: 'notif_dms' as const, label: 'Direct Messages', desc: 'Private 1-on-1 and squad group direct messages', val: notifDms },
                    { key: 'notif_mentions' as const, label: 'Mentions & Replies', desc: 'Direct @mentions and replies to your messages', val: notifMentions },
                    { key: 'notif_friend_requests' as const, label: 'Friend Requests', desc: 'Incoming friend requests and accepted friendships', val: notifFriendRequests },
                    { key: 'notif_invites' as const, label: 'Server & Squad Invites', desc: 'Invitations to join gaming servers and clans', val: notifInvites },
                    { key: 'notif_missed_calls' as const, label: 'Missed Calls', desc: 'Alerts when someone attempts to ring you while away', val: notifMissedCalls },
                  ].map((cat) => (
                    <div
                      key={cat.key}
                      onClick={() => handleToggleCategory(cat.key, cat.val)}
                      className="flex items-center justify-between p-3.5 rounded-card bg-card border border-border hover:bg-surface-hover transition cursor-pointer"
                    >
                      <div>
                        <div className="text-xs font-semibold text-foreground">{cat.label}</div>
                        <div className="text-xs text-muted-foreground">{cat.desc}</div>
                      </div>
                      <Switch
                        checked={cat.val}
                        onCheckedChange={() => handleToggleCategory(cat.key, cat.val)}
                        aria-label={cat.label}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: SECURITY & PRIVACY */}
          {activeTab === 'security' && <SecurityTab open={open} />}

          {/* TAB 8: DIAGNOSTICS & LOGS */}
          {activeTab === 'diagnostics' && (
            <div className="space-y-6 max-w-3xl w-full pb-16">
              <div>
                <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-primary" />
                  <span>Diagnostics & System Logs</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Access runtime logs, WebRTC NAT candidate traversal telemetry, and ZeroTier status.
                </p>
              </div>

              <div className="rounded-card border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-status-online" />
                    <span className="text-xs font-semibold text-foreground">Telemetry Window</span>
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => triggerOpenLogsWindow()}
                    className="text-xs font-semibold px-3 h-8"
                  >
                    Open Live Diagnostics
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground font-mono bg-surface-sidebar p-3 rounded-control border border-border">
                  • Direct P2P Mesh Traversal: ACTIVE<br />
                  • ICE Candidate Gathering: STUN/TURN Enabled<br />
                  • ZeroTier Virtual LAN: Standby & Synced<br />
                  • Engine Protocol: Nexus WebRTC 2.4.0
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
