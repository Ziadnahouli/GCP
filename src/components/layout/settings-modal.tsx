'use client';

import * as React from 'react';
import {
  User,
  Palette,
  Volume2,
  Bell,
  Shield,
  LogOut,
  Save,
  Loader2,
  Sparkles,
  Mic,
  Headphones,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '@/features/auth/auth-provider';
import { AccentTheme, UserProfile, UserSettings, UserStatus } from '@/lib/types/profile';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ACCENT_THEMES: { id: AccentTheme; name: string; hex: string; class: string }[] = [
  { id: 'violet', name: 'Violet Neon', hex: '#8b5cf6', class: 'bg-[#8b5cf6]' },
  { id: 'cyan', name: 'Cyber Cyan', hex: '#0ea5e9', class: 'bg-[#0ea5e9]' },
  { id: 'emerald', name: 'Vanguard Emerald', hex: '#10b981', class: 'bg-[#10b981]' },
  { id: 'crimson', name: 'Crimson Fury', hex: '#f43f5e', class: 'bg-[#f43f5e]' },
  { id: 'amber', name: 'Solar Amber', hex: '#f59e0b', class: 'bg-[#f59e0b]' },
];

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const { profile, settings, updateProfile, updateSettings, signOut } = useAuth();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = React.useState('profile');
  const [isSaving, setIsSaving] = React.useState(false);

  // Profile form state
  const [displayName, setDisplayName] = React.useState('');
  const [username, setUsername] = React.useState('');
  const [bio, setBio] = React.useState('');
  const [customStatus, setCustomStatus] = React.useState('');
  const [bannerColor, setBannerColor] = React.useState('#7c3aed');
  const [avatarUrl, setAvatarUrl] = React.useState('');
  const [presenceStatus, setPresenceStatus] = React.useState<UserStatus>('online');

  // Settings state
  const [selectedAccent, setSelectedAccent] = React.useState<AccentTheme>('violet');
  const [soundEffects, setSoundEffects] = React.useState(true);
  const [pushToTalk, setPushToTalk] = React.useState(false);
  const [inputVol, setInputVol] = React.useState(85);
  const [outputVol, setOutputVol] = React.useState(100);
  const [desktopNotifs, setDesktopNotifs] = React.useState(true);

  // Sync state when profile/settings change or modal opens
  React.useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      setUsername(profile.username || '');
      setBio(profile.bio || '');
      setCustomStatus(profile.custom_status || '');
      setBannerColor(profile.banner_color || '#7c3aed');
      setAvatarUrl(profile.avatar_url || '');
      setPresenceStatus(profile.status || 'online');
    }
    if (settings) {
      setSelectedAccent(settings.accent_color || 'violet');
      setSoundEffects(settings.sound_effects_enabled);
      setPushToTalk(settings.push_to_talk_enabled);
      setInputVol(settings.input_volume);
      setOutputVol(settings.output_volume);
      setDesktopNotifs(settings.desktop_notifications);
    }
  }, [profile, settings, open]);

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      const { error } = await updateProfile({
        display_name: displayName.trim(),
        username: username.trim().toLowerCase(),
        bio: bio.trim(),
        custom_status: customStatus.trim(),
        banner_color: bannerColor,
        avatar_url: avatarUrl.trim() || null,
        status: presenceStatus,
      });

      if (error) {
        toast({
          title: 'Update Failed',
          description: error,
          type: 'error',
        });
      } else {
        toast({
          title: 'Profile Updated',
          description: 'Your gaming identity has been saved.',
          type: 'success',
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAppearance = async (theme: AccentTheme) => {
    setSelectedAccent(theme);
    await updateSettings({ accent_color: theme });
    toast({
      title: 'Theme Applied',
      description: `Accent color switched to ${theme.toUpperCase()}.`,
      type: 'info',
    });
  };

  const handleSaveAudio = async () => {
    setIsSaving(true);
    try {
      await updateSettings({
        sound_effects_enabled: soundEffects,
        push_to_talk_enabled: pushToTalk,
        input_volume: inputVol,
        output_volume: outputVol,
      });
      toast({
        title: 'Audio Settings Saved',
        description: 'Microphone & speaker preferences updated.',
        type: 'success',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl p-0 h-[620px] max-h-[92vh] flex flex-col md:flex-row overflow-hidden border-border bg-card w-[95vw] md:w-full"
        onClose={() => onOpenChange(false)}
      >
        {/* Settings Navigation Sidebar */}
        <div className="w-full md:w-56 bg-surface-sidebar p-3 md:p-4 border-b md:border-b-0 md:border-r border-border shrink-0 flex flex-row md:flex-col justify-between overflow-x-auto md:overflow-x-visible gap-2 no-scrollbar">
          <div className="flex flex-row md:flex-col gap-1 items-center md:items-stretch overflow-x-auto shrink-0 no-scrollbar">
            <div className="hidden md:block px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
              User Settings
            </div>

            <button
              onClick={() => setActiveTab('profile')}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left shrink-0',
                activeTab === 'profile'
                  ? 'bg-primary/15 text-primary font-semibold'
                  : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
              )}
            >
              <User className="w-4 h-4 shrink-0" />
              <span>My Profile</span>
            </button>

            <button
              onClick={() => setActiveTab('appearance')}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left shrink-0',
                activeTab === 'appearance'
                  ? 'bg-primary/15 text-primary font-semibold'
                  : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
              )}
            >
              <Palette className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Appearance &</span> Theme
            </button>

            <button
              onClick={() => setActiveTab('audio')}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left shrink-0',
                activeTab === 'audio'
                  ? 'bg-primary/15 text-primary font-semibold'
                  : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
              )}
            >
              <Volume2 className="w-4 h-4 shrink-0" />
              <span>Voice</span>
            </button>

            <button
              onClick={() => setActiveTab('notifications')}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left shrink-0',
                activeTab === 'notifications'
                  ? 'bg-primary/15 text-primary font-semibold'
                  : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
              )}
            >
              <Bell className="w-4 h-4 shrink-0" />
              <span>Notifs</span>
            </button>
          </div>

          <div className="border-t-0 md:border-t border-border/80 pt-0 md:pt-3 shrink-0 flex items-center">
            <button
              onClick={async () => {
                await signOut();
                onOpenChange(false);
                toast({
                  title: 'Signed Out',
                  description: 'You have been disconnected from the session.',
                  type: 'info',
                });
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors text-left shrink-0"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* Settings Body Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-card">
          {activeTab === 'profile' && (
            <div className="space-y-6 max-w-xl">
              <div>
                <h3 className="text-lg font-bold text-foreground">My Profile</h3>
                <p className="text-xs text-muted-foreground">
                  Customize your gaming avatar, display name, and gamer bio.
                </p>
              </div>

              {/* Profile Card Preview */}
              <div className="rounded-xl border border-border bg-surface-default overflow-hidden shadow-sm">
                <div
                  className="h-20 w-full transition-colors relative"
                  style={{ backgroundColor: bannerColor }}
                />
                <div className="px-5 pb-5 pt-0 relative flex items-end justify-between -mt-8">
                  <div className="flex items-end gap-3.5">
                    <Avatar
                      src={avatarUrl || null}
                      name={displayName || 'Gamer'}
                      status={profile?.status || 'online'}
                      showStatus
                      size="lg"
                      className="border-4 border-card"
                    />
                    <div className="mb-1">
                      <div className="font-bold text-foreground leading-tight text-base">
                        {displayName || 'Anonymous Gamer'}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">
                        @{username || 'gamer'}
                      </div>
                    </div>
                  </div>
                </div>
                {customStatus && (
                  <div className="px-5 pb-4 text-xs text-primary font-medium flex items-center gap-1.5 border-t border-border/50 pt-2.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{customStatus}</span>
                  </div>
                )}
              </div>

              {/* Form Fields */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Display Name
                    </label>
                    <Input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="GhostRider"
                      maxLength={40}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Unique Username
                    </label>
                    <Input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="ghost_rider"
                      maxLength={30}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Presence Status
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { value: 'online' as UserStatus, label: 'Online', color: 'bg-emerald-500' },
                      { value: 'idle' as UserStatus, label: 'Idle', color: 'bg-amber-500' },
                      { value: 'dnd' as UserStatus, label: 'Do Not Disturb', color: 'bg-rose-500' },
                      { value: 'offline' as UserStatus, label: 'Invisible', color: 'bg-slate-500' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setPresenceStatus(opt.value)}
                        className={cn(
                          'flex items-center gap-2 p-2 rounded-xl border text-xs font-semibold transition-all text-left',
                          presenceStatus === opt.value
                            ? 'border-primary bg-primary/15 text-primary shadow-glow-sm'
                            : 'border-border/60 bg-surface-default hover:bg-surface-hover text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', opt.color)} />
                        <span className="truncate">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Custom Status Message
                  </label>
                  <Input
                    value={customStatus}
                    onChange={(e) => setCustomStatus(e.target.value)}
                    placeholder="In match • Ranking up"
                    maxLength={80}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Avatar Image URL (Optional)
                  </label>
                  <Input
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Banner Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={bannerColor}
                      onChange={(e) => setBannerColor(e.target.value)}
                      className="w-10 h-10 rounded-lg border border-border bg-transparent cursor-pointer p-0.5"
                    />
                    <Input
                      value={bannerColor}
                      onChange={(e) => setBannerColor(e.target.value)}
                      placeholder="#7c3aed"
                      className="max-w-[140px] font-mono text-xs uppercase"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    About Me / Bio
                  </label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={3}
                    maxLength={200}
                    placeholder="Tell your squad what games you play..."
                    className="w-full rounded-lg border border-border bg-surface-default p-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-transparent transition-all resize-none"
                  />
                  <div className="text-[10px] text-muted-foreground text-right mt-1">
                    {bio.length}/200
                  </div>
                </div>

                <div className="pt-2">
                  <Button onClick={handleSaveProfile} disabled={isSaving} className="gap-2">
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Save Profile Changes
                  </Button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="space-y-6 max-w-xl">
              <div>
                <h3 className="text-lg font-bold text-foreground">Appearance & Accent Themes</h3>
                <p className="text-xs text-muted-foreground">
                  Select your signature neon accent color for buttons, highlights, and borders.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ACCENT_THEMES.map((theme) => {
                  const isSelected = selectedAccent === theme.id;
                  return (
                    <button
                      key={theme.id}
                      onClick={() => handleSaveAppearance(theme.id)}
                      className={cn(
                        'flex items-center justify-between p-3.5 rounded-xl border transition-all text-left',
                        isSelected
                          ? 'border-primary bg-primary/10 shadow-glow-sm'
                          : 'border-border bg-surface-default hover:bg-surface-hover hover:border-border/80'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={cn('w-5 h-5 rounded-full shrink-0 shadow-sm', theme.class)}
                        />
                        <span className="text-sm font-semibold text-foreground">{theme.name}</span>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-primary" />}
                    </button>
                  );
                })}
              </div>

              <div className="p-4 rounded-xl border border-border bg-surface-default mt-4 space-y-2">
                <div className="text-xs font-semibold text-foreground">Theme Live Preview</div>
                <div className="flex items-center gap-2">
                  <Button size="sm">Primary Button</Button>
                  <Button size="sm" variant="outline">
                    Outline Button
                  </Button>
                  <Button size="sm" variant="subtle">
                    Subtle Accent
                  </Button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'audio' && (
            <div className="space-y-6 max-w-xl">
              <div>
                <h3 className="text-lg font-bold text-foreground">Voice & Audio Settings</h3>
                <p className="text-xs text-muted-foreground">
                  Configure default input and output levels, sound effects, and push-to-talk.
                </p>
              </div>

              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between text-xs font-medium mb-2">
                    <span className="flex items-center gap-1.5 text-foreground">
                      <Mic className="w-4 h-4 text-primary" /> Input Volume (Microphone)
                    </span>
                    <span className="text-muted-foreground font-mono">{inputVol}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={inputVol}
                    onChange={(e) => setInputVol(Number(e.target.value))}
                    className="w-full accent-primary h-2 bg-surface-panel rounded-lg cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs font-medium mb-2">
                    <span className="flex items-center gap-1.5 text-foreground">
                      <Headphones className="w-4 h-4 text-primary" /> Output Volume (Headset)
                    </span>
                    <span className="text-muted-foreground font-mono">{outputVol}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={outputVol}
                    onChange={(e) => setOutputVol(Number(e.target.value))}
                    className="w-full accent-primary h-2 bg-surface-panel rounded-lg cursor-pointer"
                  />
                </div>

                <div className="pt-2 border-t border-border space-y-3">
                  <label className="flex items-center justify-between p-3 rounded-lg bg-surface-default border border-border cursor-pointer">
                    <span className="text-xs font-medium text-foreground">
                      Enable Soundboard & System Sound Effects
                    </span>
                    <input
                      type="checkbox"
                      checked={soundEffects}
                      onChange={(e) => setSoundEffects(e.target.checked)}
                      className="accent-primary w-4 h-4 rounded cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-lg bg-surface-default border border-border cursor-pointer">
                    <div>
                      <div className="text-xs font-medium text-foreground">Push To Talk Mode</div>
                      <div className="text-[10px] text-muted-foreground">
                        Default trigger key: [V]
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={pushToTalk}
                      onChange={(e) => setPushToTalk(e.target.checked)}
                      className="accent-primary w-4 h-4 rounded cursor-pointer"
                    />
                  </label>
                </div>

                <Button onClick={handleSaveAudio} disabled={isSaving} className="gap-2">
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Audio Preferences
                </Button>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6 max-w-xl">
              <div>
                <h3 className="text-lg font-bold text-foreground">Notification Preferences</h3>
                <p className="text-xs text-muted-foreground">
                  Control alert badges, desktop notifications, and incoming call sounds.
                </p>
              </div>

              <div className="space-y-3">
                <label className="flex items-center justify-between p-3 rounded-lg bg-surface-default border border-border cursor-pointer">
                  <div>
                    <div className="text-xs font-medium text-foreground">Desktop Notifications</div>
                    <div className="text-[10px] text-muted-foreground">
                      Show popup alerts when friends send messages or call requests
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={desktopNotifs}
                    onChange={(e) => {
                      setDesktopNotifs(e.target.checked);
                      updateSettings({ desktop_notifications: e.target.checked });
                    }}
                    className="accent-primary w-4 h-4 rounded cursor-pointer"
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
