'use client';

import * as React from 'react';
import {
  User,
  Palette,
  Bell,
  LogOut,
  Sparkles,
  Mic,
  Sliders,
  Check,
  Terminal,
  Activity,
  Keyboard,
  Shield,
  Flame,
} from 'lucide-react';
import { useAuth } from '@/features/auth/auth-provider';
import { useModalEscape } from '@/hooks/use-modal-escape';
import { AccentTheme } from '@/lib/types/profile';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { triggerOpenLogsWindow } from '@/hooks/use-diagnostics-logs';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { ProfileTab, VoiceAudioTab, KeybindsTab, SecurityTab } from './settings';

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ACCENT_THEMES: { id: AccentTheme; name: string; hex: string; desc: string; bgClass: string }[] = [
  { id: 'violet', name: 'Violet Neon', hex: '#8b5cf6', desc: 'Default cybernetic violet glow', bgClass: 'bg-[#8b5cf6]' },
  { id: 'cyan', name: 'Cyber Cyan', hex: '#0ea5e9', desc: 'Electric high-contrast cyan hue', bgClass: 'bg-[#0ea5e9]' },
  { id: 'emerald', name: 'Vanguard Emerald', hex: '#10b981', desc: 'Tactical night-vision green', bgClass: 'bg-[#10b981]' },
  { id: 'crimson', name: 'Crimson Fury', hex: '#f43f5e', desc: 'Aggressive battle-ready crimson', bgClass: 'bg-[#f43f5e]' },
  { id: 'amber', name: 'Solar Amber', hex: '#f59e0b', desc: 'Warm overclocked solar flare', bgClass: 'bg-[#f59e0b]' },
];

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const { settings, updateSettings, signOut } = useAuth();
  const { toast } = useToast();
  useModalEscape(open, onOpenChange);

  const [activeTab, setActiveTab] = React.useState<
    'profile' | 'appearance' | 'studio' | 'audio' | 'shortcuts' | 'notifs' | 'security' | 'diagnostics'
  >('profile');

  // Appearance & Notification states
  const [selectedAccent, setSelectedAccent] = React.useState<AccentTheme>('violet');
  const [desktopNotifs, setDesktopNotifs] = React.useState(true);
  const [soundEffects, setSoundEffects] = React.useState(true);
  const [notifDms, setNotifDms] = React.useState(true);
  const [notifMentions, setNotifMentions] = React.useState(true);
  const [notifFriendRequests, setNotifFriendRequests] = React.useState(true);
  const [notifInvites, setNotifInvites] = React.useState(true);
  const [notifMissedCalls, setNotifMissedCalls] = React.useState(true);

  React.useEffect(() => {
    if (settings) {
      if (settings.accent_color) setSelectedAccent(settings.accent_color as AccentTheme);
      if (settings.desktop_notifications !== undefined) setDesktopNotifs(settings.desktop_notifications);
      if (settings.sound_effects_enabled !== undefined) setSoundEffects(settings.sound_effects_enabled);
      if (settings.notif_dms !== undefined) setNotifDms(settings.notif_dms);
      if (settings.notif_mentions !== undefined) setNotifMentions(settings.notif_mentions);
      if (settings.notif_friend_requests !== undefined) setNotifFriendRequests(settings.notif_friend_requests);
      if (settings.notif_invites !== undefined) setNotifInvites(settings.notif_invites);
      if (settings.notif_missed_calls !== undefined) setNotifMissedCalls(settings.notif_missed_calls);
    }
  }, [settings, open]);

  const handleSaveAppearance = async (theme: AccentTheme) => {
    setSelectedAccent(theme);
    await updateSettings({ accent_color: theme });
    toast({ title: 'Theme Applied', description: `Theme set to ${theme.toUpperCase()}.`, type: 'info' });
  };

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
        className="max-w-5xl lg:max-w-6xl md:w-[980px] lg:w-[1100px] h-[720px] max-h-[94vh] p-0 flex flex-col md:flex-row overflow-hidden border border-white/[0.08] bg-[#090a0f] text-foreground w-[96vw] shadow-2xl shadow-black/95 rounded-2xl"
        onClose={() => onOpenChange(false)}
      >
        {/* Modern Gaming Navigation Sidebar */}
        <div className="w-full md:w-64 md:h-full bg-[#0d0e15] p-3 md:p-4 border-b md:border-b-0 md:border-r border-white/[0.06] shrink-0 flex flex-row md:flex-col justify-between overflow-x-auto md:overflow-x-visible gap-2 no-scrollbar select-none">
          <div className="space-y-4 w-full">
            {/* Header & Logo badge */}
            <div className="hidden md:flex items-center gap-2.5 px-2.5 py-1 text-xs font-bold text-foreground">
              <div className="w-6 h-6 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center text-primary">
                <Flame className="w-3.5 h-3.5" />
              </div>
              <span className="tracking-wide uppercase text-[11px] font-black text-foreground/90">
                Nexus Studio Settings
              </span>
            </div>

            {/* Navigation Groups */}
            <div className="space-y-3">
              <div>
                <div className="hidden md:block px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
                  Identity
                </div>
                <div className="flex flex-row md:flex-col gap-1">
                  <button
                    onClick={() => setActiveTab('profile')}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-all text-left w-full font-medium',
                      activeTab === 'profile'
                        ? 'bg-primary/15 text-primary border border-primary/30 shadow-sm'
                        : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'
                    )}
                  >
                    <User className="w-4 h-4 shrink-0" />
                    <span>Gamer Profile</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('appearance')}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-all text-left w-full font-medium',
                      activeTab === 'appearance'
                        ? 'bg-primary/15 text-primary border border-primary/30 shadow-sm'
                        : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'
                    )}
                  >
                    <Palette className="w-4 h-4 shrink-0" />
                    <span>Themes & Accents</span>
                  </button>
                </div>
              </div>

              <div>
                <div className="hidden md:block px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
                  Hardware & Studio
                </div>
                <div className="flex flex-row md:flex-col gap-1">
                  <button
                    onClick={() => setActiveTab('studio')}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-all text-left w-full font-medium',
                      activeTab === 'studio'
                        ? 'bg-primary/15 text-primary border border-primary/30 shadow-sm'
                        : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'
                    )}
                  >
                    <Mic className="w-4 h-4 shrink-0" />
                    <span>Voice & Video Studio</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('audio')}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-all text-left w-full font-medium',
                      activeTab === 'audio'
                        ? 'bg-primary/15 text-primary border border-primary/30 shadow-sm'
                        : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'
                    )}
                  >
                    <Sliders className="w-4 h-4 shrink-0" />
                    <span>Audio Processing</span>
                  </button>
                </div>
              </div>

              <div>
                <div className="hidden md:block px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
                  Preferences
                </div>
                <div className="flex flex-row md:flex-col gap-1">
                  <button
                    onClick={() => setActiveTab('shortcuts')}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-all text-left w-full font-medium',
                      activeTab === 'shortcuts'
                        ? 'bg-primary/15 text-primary border border-primary/30 shadow-sm'
                        : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'
                    )}
                  >
                    <Keyboard className="w-4 h-4 shrink-0" />
                    <span>Shortcuts & Keybinds</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('notifs')}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-all text-left w-full font-medium',
                      activeTab === 'notifs'
                        ? 'bg-primary/15 text-primary border border-primary/30 shadow-sm'
                        : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'
                    )}
                  >
                    <Bell className="w-4 h-4 shrink-0" />
                    <span>Notifications</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('security')}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-all text-left w-full font-medium',
                      activeTab === 'security'
                        ? 'bg-primary/15 text-primary border border-primary/30 shadow-sm'
                        : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'
                    )}
                  >
                    <Shield className="w-4 h-4 shrink-0" />
                    <span>Security & Privacy</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('diagnostics')}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-all text-left w-full font-medium',
                      activeTab === 'diagnostics'
                        ? 'bg-primary/15 text-primary border border-primary/30 shadow-sm'
                        : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'
                    )}
                  >
                    <Terminal className="w-4 h-4 shrink-0" />
                    <span>Diagnostics & Logs</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* User Sign Out Card at bottom of sidebar */}
          <div className="border-t-0 md:border-t border-white/[0.06] pt-0 md:pt-3 shrink-0 flex items-center justify-between">
            <button
              onClick={async () => {
                await signOut();
                onOpenChange(false);
                toast({ title: 'Signed Out', description: 'You have logged out of your session.', type: 'info' });
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors w-full"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* Settings Body Content Area */}
        <div className="flex-1 min-w-0 min-h-0 overflow-y-auto p-4 md:p-6 bg-[#090a0f] relative custom-scrollbar">
          {/* TAB 1: GAMER PROFILE */}
          {activeTab === 'profile' && <ProfileTab />}

          {/* TAB 2: APPEARANCE & THEMES */}
          {activeTab === 'appearance' && (
            <div className="space-y-6 max-w-3xl w-full pb-16">
              <div>
                <h3 className="text-lg font-bold text-foreground">Themes & Accents</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select your dynamic accent palette. All buttons, rings, and badges re-theme instantly.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {ACCENT_THEMES.map((theme) => {
                  const isSelected = selectedAccent === theme.id;
                  return (
                    <div
                      key={theme.id}
                      onClick={() => handleSaveAppearance(theme.id)}
                      className={cn(
                        'flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition-all',
                        isSelected
                          ? 'bg-white/[0.06] border-primary ring-1 ring-primary/60 shadow-lg'
                          : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-xl shadow-md flex items-center justify-center text-white"
                          style={{ backgroundColor: theme.hex }}
                        >
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-foreground flex items-center gap-2">
                            <span>{theme.name}</span>
                            {isSelected && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-primary/20 text-primary font-semibold">
                                ACTIVE
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground/70">{theme.desc}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-full border border-white/20"
                          style={{ backgroundColor: theme.hex }}
                        />
                        {isSelected && <Check className="w-4 h-4 text-primary" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
                <h3 className="text-lg font-bold text-foreground">Notifications & Sounds</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Manage incoming call alerts, message chimes, and desktop popups.
                </p>
              </div>

              <div className="space-y-3">
                <div
                  onClick={handleToggleDesktopNotifs}
                  className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] cursor-pointer"
                >
                  <div>
                    <div className="text-xs font-bold text-foreground">Desktop System Notifications</div>
                    <div className="text-[11px] text-muted-foreground">Receive OS alert badges for incoming calls and DMs</div>
                  </div>
                  <div
                    className={cn(
                      'w-11 h-6 rounded-full transition-colors relative flex items-center p-0.5',
                      desktopNotifs ? 'bg-primary' : 'bg-white/20'
                    )}
                  >
                    <div
                      className={cn(
                        'w-5 h-5 rounded-full bg-white shadow-md transition-transform',
                        desktopNotifs ? 'translate-x-5' : 'translate-x-0'
                      )}
                    />
                  </div>
                </div>

                <div
                  onClick={handleToggleSoundEffects}
                  className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] cursor-pointer"
                >
                  <div>
                    <div className="text-xs font-bold text-foreground">Soundboard & UI Chimes</div>
                    <div className="text-[11px] text-muted-foreground">Play acoustic tones on message send and squad join</div>
                  </div>
                  <div
                    className={cn(
                      'w-11 h-6 rounded-full transition-colors relative flex items-center p-0.5',
                      soundEffects ? 'bg-primary' : 'bg-white/20'
                    )}
                  >
                    <div
                      className={cn(
                        'w-5 h-5 rounded-full bg-white shadow-md transition-transform',
                        soundEffects ? 'translate-x-5' : 'translate-x-0'
                      )}
                    />
                  </div>
                </div>
              </div>

              {/* Category-Specific Notification Settings */}
              <div className="space-y-3 pt-4 border-t border-white/[0.06]">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Notification Categories</h4>
                  <p className="text-[11px] text-muted-foreground/80 mt-0.5">
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
                      className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition cursor-pointer"
                    >
                      <div>
                        <div className="text-xs font-semibold text-foreground">{cat.label}</div>
                        <div className="text-[11px] text-muted-foreground">{cat.desc}</div>
                      </div>
                      <div
                        className={cn(
                          'w-10 h-5 rounded-full transition-colors relative flex items-center p-0.5 shrink-0',
                          cat.val ? 'bg-primary' : 'bg-white/20'
                        )}
                      >
                        <div
                          className={cn(
                            'w-4 h-4 rounded-full bg-white shadow-md transition-transform',
                            cat.val ? 'translate-x-5' : 'translate-x-0'
                          )}
                        />
                      </div>
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
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-primary" />
                  <span>Diagnostics & System Logs</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Access runtime logs, WebRTC NAT candidate traversal telemetry, and ZeroTier status.
                </p>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-[#10121a] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-foreground">Telemetry Window</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => triggerOpenLogsWindow()}
                    className="text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-3 h-8 rounded-lg"
                  >
                    Open Live Diagnostics
                  </Button>
                </div>
                <div className="text-[11px] text-muted-foreground font-mono bg-black/40 p-3 rounded-xl border border-white/[0.04]">
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
