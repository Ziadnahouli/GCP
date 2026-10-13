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
  ShieldCheck,
  Terminal,
  Activity,
  Radio,
  Database,
  Video,
  Keyboard,
  Play,
  Square,
  Sliders,
  Monitor,
} from 'lucide-react';
import { useAuth } from '@/features/auth/auth-provider';
import { AccentTheme, UserProfile, UserSettings, UserStatus } from '@/lib/types/profile';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { triggerOpenLogsWindow } from '@/hooks/use-diagnostics-logs';
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
  const [noiseSuppression, setNoiseSuppression] = React.useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('nexus_noise_suppression');
      return stored !== null ? stored === 'true' : true;
    }
    return true;
  });

  // Hardware device enumeration & selection
  const [audioInputDevices, setAudioInputDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [selectedInputDevice, setSelectedInputDevice] = React.useState('');
  const [selectedOutputDevice, setSelectedOutputDevice] = React.useState('');
  const [selectedCamDevice, setSelectedCamDevice] = React.useState('');

  // Live microphone testing state
  const [isTestingMic, setIsTestingMic] = React.useState(false);
  const [micLevel, setMicLevel] = React.useState(0);
  const micTestStreamRef = React.useRef<MediaStream | null>(null);
  const micTestAudioCtxRef = React.useRef<AudioContext | null>(null);
  const micTestAnimRef = React.useRef<number | null>(null);

  // Live webcam preview testing state
  const [isTestingCam, setIsTestingCam] = React.useState(false);
  const camTestStreamRef = React.useRef<MediaStream | null>(null);
  const camVideoRef = React.useRef<HTMLVideoElement>(null);

  // Enumerate hardware devices
  React.useEffect(() => {
    if (open && typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          const inputs = devices.filter((d) => d.kind === 'audioinput');
          const outputs = devices.filter((d) => d.kind === 'audiooutput');
          const videos = devices.filter((d) => d.kind === 'videoinput');
          setAudioInputDevices(inputs);
          setAudioOutputDevices(outputs);
          setVideoDevices(videos);
          if (inputs.length > 0 && !selectedInputDevice) setSelectedInputDevice(inputs[0].deviceId);
          if (outputs.length > 0 && !selectedOutputDevice) setSelectedOutputDevice(outputs[0].deviceId);
          if (videos.length > 0 && !selectedCamDevice) setSelectedCamDevice(videos[0].deviceId);
        })
        .catch(() => {});
    }
  }, [open, selectedInputDevice, selectedOutputDevice, selectedCamDevice]);

  // Clean up media tests when modal closes or unmounts
  const stopMicTest = React.useCallback(() => {
    if (micTestAnimRef.current) {
      cancelAnimationFrame(micTestAnimRef.current);
      micTestAnimRef.current = null;
    }
    if (micTestStreamRef.current) {
      micTestStreamRef.current.getTracks().forEach((t) => t.stop());
      micTestStreamRef.current = null;
    }
    if (micTestAudioCtxRef.current) {
      micTestAudioCtxRef.current.close().catch(() => {});
      micTestAudioCtxRef.current = null;
    }
    setIsTestingMic(false);
    setMicLevel(0);
  }, []);

  const stopCamTest = React.useCallback(() => {
    if (camTestStreamRef.current) {
      camTestStreamRef.current.getTracks().forEach((t) => t.stop());
      camTestStreamRef.current = null;
    }
    if (camVideoRef.current) {
      camVideoRef.current.srcObject = null;
    }
    setIsTestingCam(false);
  }, []);

  React.useEffect(() => {
    if (!open) {
      stopMicTest();
      stopCamTest();
    }
  }, [open, stopMicTest, stopCamTest]);

  const startMicTest = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedInputDevice ? { deviceId: { exact: selectedInputDevice } } : true,
      });
      micTestStreamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      micTestAudioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      setIsTestingMic(true);

      const checkLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 64) * 100));
        setMicLevel(normalized);
        micTestAnimRef.current = requestAnimationFrame(checkLevel);
      };
      checkLevel();
    } catch {
      toast({
        title: 'Microphone Error',
        description: 'Could not access microphone for testing. Check device permissions.',
        type: 'error',
      });
    }
  };

  const startCamTest = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: selectedCamDevice ? { deviceId: { exact: selectedCamDevice } } : true,
      });
      camTestStreamRef.current = stream;
      setIsTestingCam(true);
      setTimeout(() => {
        if (camVideoRef.current) {
          camVideoRef.current.srcObject = stream;
          camVideoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch {
      toast({
        title: 'Camera Error',
        description: 'Could not access webcam for preview. Check device permissions.',
        type: 'error',
      });
    }
  };

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
      if (typeof window !== 'undefined') {
        localStorage.setItem('nexus_noise_suppression', String(noiseSuppression));
      }
      await updateSettings({
        sound_effects_enabled: soundEffects,
        push_to_talk_enabled: pushToTalk,
        input_volume: inputVol,
        output_volume: outputVol,
      });
      toast({
        title: 'Audio Settings Saved',
        description: `Microphone noise suppression ${noiseSuppression ? 'enabled' : 'disabled'} and audio preferences updated.`,
        type: 'success',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl p-0 h-[620px] max-h-[92vh] flex flex-col md:flex-row overflow-hidden border border-white/[0.08] bg-surface-panel w-[95vw] md:w-full shadow-2xl shadow-black/90 rounded-2xl"
        onClose={() => onOpenChange(false)}
      >
        {/* Settings Navigation Sidebar */}
        <div className="w-full md:w-56 bg-surface-sidebar p-3 md:p-4 border-b md:border-b-0 md:border-r border-white/[0.06] shrink-0 flex flex-row md:flex-col justify-between overflow-x-auto md:overflow-x-visible gap-2 no-scrollbar select-none">
          <div className="flex flex-row md:flex-col gap-1 items-center md:items-stretch overflow-x-auto shrink-0 no-scrollbar">
            <div className="hidden md:block px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              User Settings
            </div>

            <button
              onClick={() => setActiveTab('profile')}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-md text-xs transition-colors text-left shrink-0',
                activeTab === 'profile'
                  ? 'bg-white/[0.06] text-foreground font-medium'
                  : 'text-muted-foreground/70 hover:bg-white/[0.03] hover:text-foreground'
              )}
            >
              <User className="w-4 h-4 shrink-0" />
              <span>My Profile</span>
            </button>

            <button
              onClick={() => setActiveTab('appearance')}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-md text-xs transition-colors text-left shrink-0',
                activeTab === 'appearance'
                  ? 'bg-white/[0.06] text-foreground font-medium'
                  : 'text-muted-foreground/70 hover:bg-white/[0.03] hover:text-foreground'
              )}
            >
              <Palette className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Appearance &</span> Theme
            </button>

            <button
              onClick={() => setActiveTab('audio')}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-md text-xs transition-colors text-left shrink-0',
                activeTab === 'audio'
                  ? 'bg-white/[0.06] text-foreground font-medium'
                  : 'text-muted-foreground/70 hover:bg-white/[0.03] hover:text-foreground'
              )}
            >
              <Volume2 className="w-4 h-4 shrink-0" />
              <span>Voice & Video</span>
            </button>

            <button
              onClick={() => setActiveTab('shortcuts')}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-md text-xs transition-colors text-left shrink-0',
                activeTab === 'shortcuts'
                  ? 'bg-white/[0.06] text-foreground font-medium'
                  : 'text-muted-foreground/70 hover:bg-white/[0.03] hover:text-foreground'
              )}
            >
              <Keyboard className="w-4 h-4 shrink-0" />
              <span>Keybinds</span>
            </button>

            <button
              onClick={() => setActiveTab('notifications')}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-md text-xs transition-colors text-left shrink-0',
                activeTab === 'notifications'
                  ? 'bg-white/[0.06] text-foreground font-medium'
                  : 'text-muted-foreground/70 hover:bg-white/[0.03] hover:text-foreground'
              )}
            >
              <Bell className="w-4 h-4 shrink-0" />
              <span>Notifs</span>
            </button>

            <button
              onClick={() => setActiveTab('diagnostics')}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-md text-xs transition-colors text-left shrink-0',
                activeTab === 'diagnostics'
                  ? 'bg-white/[0.06] text-foreground font-medium'
                  : 'text-muted-foreground/70 hover:bg-white/[0.03] hover:text-foreground'
              )}
            >
              <Terminal className="w-4 h-4 shrink-0" />
              <span>Logs & Telemetry</span>
            </button>
          </div>

          <div className="border-t-0 md:border-t border-white/[0.06] pt-0 md:pt-3 shrink-0 flex items-center">
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
              className="flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors text-left shrink-0"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* Settings Body Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-surface-panel">
          {activeTab === 'profile' && (
            <div className="space-y-6 max-w-xl">
              <div>
                <h3 className="text-lg font-bold text-foreground">My Profile</h3>
                <p className="text-xs text-muted-foreground">
                  Customize your gaming avatar, display name, and gamer bio.
                </p>
              </div>

              {/* Profile Card Preview */}
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden shadow-sm">
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
                      className="border-4 border-surface-panel"
                    />
                    <div className="mb-1">
                      <div className="font-semibold text-foreground leading-tight text-base">
                        {displayName || 'Anonymous Gamer'}
                      </div>
                      <div className="text-xs text-muted-foreground/60 font-mono">
                        @{username || 'gamer'}
                      </div>
                    </div>
                  </div>
                </div>
                {customStatus && (
                  <div className="px-5 pb-4 text-xs text-primary font-medium flex items-center gap-1.5 border-t border-white/[0.06] pt-2.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{customStatus}</span>
                  </div>
                )}
              </div>

              {/* Form Fields */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="settings-displayName" className="block text-xs font-medium text-muted-foreground mb-1">
                      Display Name
                    </label>
                    <Input
                      id="settings-displayName"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="GhostRider"
                      maxLength={40}
                      className="bg-white/[0.02] border-white/[0.08] text-xs"
                    />
                  </div>
                  <div>
                    <label htmlFor="settings-username" className="block text-xs font-medium text-muted-foreground mb-1">
                      Unique Username
                    </label>
                    <Input
                      id="settings-username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="ghost_rider"
                      maxLength={30}
                      className="bg-white/[0.02] border-white/[0.08] text-xs"
                    />
                  </div>
                </div>

                <div>
                  <div id="presence-status-heading" className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Presence Status
                  </div>
                  <div
                    role="radiogroup"
                    aria-labelledby="presence-status-heading"
                    className="grid grid-cols-2 sm:grid-cols-4 gap-2"
                  >
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
                          'flex items-center gap-2 p-2 rounded-lg border text-xs font-medium transition-all text-left',
                          presenceStatus === opt.value
                            ? 'border-primary/50 bg-primary/10 text-primary'
                            : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <span className={cn('w-2 h-2 rounded-full shrink-0', opt.color)} />
                        <span className="truncate">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="settings-customStatus" className="block text-xs font-medium text-muted-foreground mb-1">
                    Custom Status Message
                  </label>
                  <Input
                    id="settings-customStatus"
                    value={customStatus}
                    onChange={(e) => setCustomStatus(e.target.value)}
                    placeholder="In match • Ranking up"
                    maxLength={80}
                    className="bg-white/[0.02] border-white/[0.08] text-xs"
                  />
                </div>

                <div>
                  <label htmlFor="settings-avatarUrl" className="block text-xs font-medium text-muted-foreground mb-1">
                    Avatar Image URL (Optional)
                  </label>
                  <Input
                    id="settings-avatarUrl"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://..."
                    className="bg-white/[0.02] border-white/[0.08] text-xs"
                  />
                </div>

                <div>
                  <label htmlFor="settings-bannerColor" className="block text-xs font-medium text-muted-foreground mb-1">
                    Banner Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="settings-bannerColorPicker"
                      type="color"
                      aria-label="Banner Color Picker"
                      value={bannerColor}
                      onChange={(e) => setBannerColor(e.target.value)}
                      className="w-9 h-9 rounded-md border border-white/[0.08] bg-transparent cursor-pointer p-0.5"
                    />
                    <Input
                      id="settings-bannerColor"
                      value={bannerColor}
                      onChange={(e) => setBannerColor(e.target.value)}
                      placeholder="#7c3aed"
                      aria-label="Banner Color Hex"
                      className="max-w-[140px] font-mono text-xs uppercase bg-white/[0.02] border-white/[0.08]"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="settings-bio" className="block text-xs font-medium text-muted-foreground mb-1">
                    About Me / Bio
                  </label>
                  <textarea
                    id="settings-bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={3}
                    maxLength={200}
                    aria-label="About Me / Bio"
                    placeholder="Tell your squad what games you play..."
                    className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 text-xs text-foreground focus-visible:outline-none focus-visible:border-white/[0.2] transition-colors resize-none"
                  />
                  <div className="text-[10px] text-muted-foreground/60 text-right mt-1">
                    {bio.length}/200
                  </div>
                </div>

                <div className="pt-2">
                  <Button onClick={handleSaveProfile} disabled={isSaving} className="gap-2 font-medium">
                    {isSaving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
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
                <h3 className="text-lg font-semibold text-foreground">Appearance & Accent Themes</h3>
                <p className="text-xs text-muted-foreground/70">
                  Select your signature accent color for buttons, highlights, and borders.
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
                        'flex items-center justify-between p-3 rounded-lg border transition-all text-left',
                        isSelected
                          ? 'border-primary/50 bg-primary/10'
                          : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn('w-4 h-4 rounded-full shrink-0 shadow-sm', theme.class)}
                        />
                        <span className="text-xs font-medium text-foreground">{theme.name}</span>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-primary" />}
                    </button>
                  );
                })}
              </div>

              <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] mt-4 space-y-2">
                <div className="text-xs font-medium text-foreground">Theme Live Preview</div>
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
                <h3 className="text-lg font-semibold text-foreground">Voice & Video Settings</h3>
                <p className="text-xs text-muted-foreground/70">
                  Select input/output hardware, test your mic & camera in real time, and customize audio filters.
                </p>
              </div>

              {/* Hardware Device Selectors */}
              <div className="space-y-3.5">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Hardware Devices
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="settings-inputDevice" className="block text-xs font-medium text-muted-foreground mb-1">
                      Microphone (Input Device)
                    </label>
                    <select
                      id="settings-inputDevice"
                      value={selectedInputDevice}
                      onChange={(e) => setSelectedInputDevice(e.target.value)}
                      className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] text-foreground text-xs p-2 focus-visible:outline-none focus-visible:border-white/[0.2] transition-colors cursor-pointer"
                    >
                      {audioInputDevices.length > 0 ? (
                        audioInputDevices.map((d, i) => (
                          <option key={d.deviceId || i} value={d.deviceId} className="bg-surface-panel text-foreground">
                            {d.label || `Microphone ${i + 1}`}
                          </option>
                        ))
                      ) : (
                        <option value="" className="bg-surface-panel text-foreground">Default System Microphone</option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="settings-outputDevice" className="block text-xs font-medium text-muted-foreground mb-1">
                      Headset / Speakers (Output Device)
                    </label>
                    <select
                      id="settings-outputDevice"
                      value={selectedOutputDevice}
                      onChange={(e) => setSelectedOutputDevice(e.target.value)}
                      className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] text-foreground text-xs p-2 focus-visible:outline-none focus-visible:border-white/[0.2] transition-colors cursor-pointer"
                    >
                      {audioOutputDevices.length > 0 ? (
                        audioOutputDevices.map((d, i) => (
                          <option key={d.deviceId || i} value={d.deviceId} className="bg-surface-panel text-foreground">
                            {d.label || `Speaker ${i + 1}`}
                          </option>
                        ))
                      ) : (
                        <option value="" className="bg-surface-panel text-foreground">Default System Output</option>
                      )}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="settings-cameraDevice" className="block text-xs font-medium text-muted-foreground mb-1">
                    Webcam / Camera (Video Input)
                  </label>
                  <select
                    id="settings-cameraDevice"
                    value={selectedCamDevice}
                    onChange={(e) => setSelectedCamDevice(e.target.value)}
                    className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] text-foreground text-xs p-2 focus-visible:outline-none focus-visible:border-white/[0.2] transition-colors cursor-pointer"
                  >
                    {videoDevices.length > 0 ? (
                      videoDevices.map((d, i) => (
                        <option key={d.deviceId || i} value={d.deviceId} className="bg-surface-panel text-foreground">
                          {d.label || `Camera ${i + 1}`}
                        </option>
                      ))
                    ) : (
                      <option value="" className="bg-surface-panel text-foreground">Default Webcam</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Interactive Microphone Test */}
              <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mic className="w-4 h-4 text-primary" />
                    <div>
                      <div className="text-xs font-semibold text-foreground">Microphone Test</div>
                      <div className="text-[10px] text-muted-foreground/60">
                        Speak into your mic to verify sound input and sensitivity.
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={isTestingMic ? 'destructive' : 'subtle'}
                    onClick={isTestingMic ? stopMicTest : startMicTest}
                    className="gap-1.5 text-xs h-7 px-3"
                  >
                    {isTestingMic ? (
                      <>
                        <Square className="w-3 h-3 fill-current" />
                        <span>Stop Test</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3 h-3 fill-current" />
                        <span>Test Mic</span>
                      </>
                    )}
                  </Button>
                </div>

                {/* Animated Level Bar */}
                <div className="space-y-1.5">
                  <div className="h-2 w-full rounded-full bg-white/[0.04] overflow-hidden border border-white/[0.04] relative">
                    <div
                      className={cn(
                        'h-full transition-all duration-75 rounded-full',
                        micLevel > 75
                          ? 'bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500'
                          : micLevel > 30
                          ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                          : 'bg-emerald-500/80'
                      )}
                      style={{ width: `${isTestingMic ? Math.max(3, micLevel) : 0}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground/60 font-mono">
                    <span>
                      {isTestingMic
                        ? micLevel > 15
                          ? `Signal detected (${micLevel}%)`
                          : 'Listening... speak now'
                        : 'Click Test Mic to check signal'}
                    </span>
                    <span>{isTestingMic ? `${micLevel}%` : '0%'}</span>
                  </div>
                </div>
              </div>

              {/* Interactive Camera Preview Test */}
              <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-emerald-400" />
                    <div>
                      <div className="text-xs font-semibold text-foreground">Webcam Self Preview</div>
                      <div className="text-[10px] text-muted-foreground/60">
                        Check your lighting, framing, and camera feed before joining calls.
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={isTestingCam ? 'destructive' : 'subtle'}
                    onClick={isTestingCam ? stopCamTest : startCamTest}
                    className="gap-1.5 text-xs h-7 px-3"
                  >
                    {isTestingCam ? (
                      <>
                        <Square className="w-3 h-3 fill-current" />
                        <span>Close Preview</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3 h-3 fill-current" />
                        <span>Preview Camera</span>
                      </>
                    )}
                  </Button>
                </div>

                {isTestingCam && (
                  <div className="relative rounded-lg overflow-hidden bg-black aspect-video max-h-48 flex items-center justify-center border border-white/[0.08]">
                    <video
                      ref={camVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-medium text-emerald-400 flex items-center gap-1.5 border border-white/[0.08]">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Live Camera Feed</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Volume Sliders */}
              <div className="space-y-4 pt-1">
                <div>
                  <div className="flex items-center justify-between text-xs font-medium mb-2">
                    <span className="flex items-center gap-1.5 text-foreground">
                      <Mic className="w-4 h-4 text-primary" /> Input Volume (Microphone)
                    </span>
                    <span className="text-muted-foreground/70 font-mono text-[11px]">{inputVol}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    aria-label="Input Volume (Microphone)"
                    value={inputVol}
                    onChange={(e) => setInputVol(Number(e.target.value))}
                    className="w-full accent-primary h-1.5 bg-white/[0.06] rounded-lg cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs font-medium mb-2">
                    <span className="flex items-center gap-1.5 text-foreground">
                      <Headphones className="w-4 h-4 text-primary" /> Output Volume (Headset)
                    </span>
                    <span className="text-muted-foreground/70 font-mono text-[11px]">{outputVol}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    aria-label="Output Volume (Headset)"
                    value={outputVol}
                    onChange={(e) => setOutputVol(Number(e.target.value))}
                    className="w-full accent-primary h-1.5 bg-white/[0.06] rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              {/* Advanced Voice Toggles */}
              <div className="pt-2 border-t border-white/[0.06] space-y-2.5">
                <label className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] cursor-pointer hover:bg-white/[0.04] transition-colors">
                  <div>
                    <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      AI Noise Suppression & Acoustic Filtering
                    </div>
                    <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                      Filters background mechanical keyboard clicks, fan hum, and room noise in voice calls.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={noiseSuppression}
                    onChange={(e) => setNoiseSuppression(e.target.checked)}
                    className="accent-primary w-4 h-4 rounded cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] cursor-pointer hover:bg-white/[0.04] transition-colors">
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

                <label className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] cursor-pointer hover:bg-white/[0.04] transition-colors">
                  <div>
                    <div className="text-xs font-medium text-foreground">Push To Talk Mode</div>
                    <div className="text-[10px] text-muted-foreground/60">
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

              <Button onClick={handleSaveAudio} disabled={isSaving} className="gap-2 font-medium">
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Audio Preferences
              </Button>
            </div>
          )}

          {activeTab === 'shortcuts' && (
            <div className="space-y-6 max-w-xl">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Keyboard Shortcuts & Hotkeys</h3>
                <p className="text-xs text-muted-foreground/70">
                  Quick hotkeys to control communications, voice channels, and overlays during gaming sessions.
                </p>
              </div>

              <div className="space-y-3">
                <div className="p-3.5 rounded-xl border border-white/[0.08] bg-white/[0.02] flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-foreground">Toggle Microphone Mute</div>
                    <div className="text-[10px] text-muted-foreground/60">Mute or unmute during voice and video calls</div>
                  </div>
                  <div className="flex items-center gap-1 font-mono text-[11px]">
                    <kbd className="px-2 py-1 rounded bg-white/[0.06] border border-white/[0.1] text-foreground">Ctrl</kbd>
                    <span className="text-muted-foreground">+</span>
                    <kbd className="px-2 py-1 rounded bg-white/[0.06] border border-white/[0.1] text-foreground">Shift</kbd>
                    <span className="text-muted-foreground">+</span>
                    <kbd className="px-2 py-1 rounded bg-white/[0.06] border border-white/[0.1] text-foreground">M</kbd>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-white/[0.08] bg-white/[0.02] flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-foreground">Toggle Deafen Audio</div>
                    <div className="text-[10px] text-muted-foreground/60">Silence all incoming call audio and mute mic</div>
                  </div>
                  <div className="flex items-center gap-1 font-mono text-[11px]">
                    <kbd className="px-2 py-1 rounded bg-white/[0.06] border border-white/[0.1] text-foreground">Ctrl</kbd>
                    <span className="text-muted-foreground">+</span>
                    <kbd className="px-2 py-1 rounded bg-white/[0.06] border border-white/[0.1] text-foreground">Shift</kbd>
                    <span className="text-muted-foreground">+</span>
                    <kbd className="px-2 py-1 rounded bg-white/[0.06] border border-white/[0.1] text-foreground">D</kbd>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-white/[0.08] bg-white/[0.02] flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-foreground">Live Telemetry & Diagnostics Window</div>
                    <div className="text-[10px] text-muted-foreground/60">Toggle the debug console and real-time logs</div>
                  </div>
                  <div className="flex items-center gap-1 font-mono text-[11px]">
                    <kbd className="px-2 py-1 rounded bg-white/[0.06] border border-white/[0.1] text-foreground">Ctrl</kbd>
                    <span className="text-muted-foreground">+</span>
                    <kbd className="px-2 py-1 rounded bg-white/[0.06] border border-white/[0.1] text-foreground">~</kbd>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-white/[0.08] bg-white/[0.02] flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-foreground">Push To Talk Default Key</div>
                    <div className="text-[10px] text-muted-foreground/60">Hold while speaking when Push-To-Talk is enabled</div>
                  </div>
                  <div className="flex items-center gap-1 font-mono text-[11px]">
                    <kbd className="px-2.5 py-1 rounded bg-white/[0.06] border border-white/[0.1] text-foreground font-semibold">V</kbd>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-white/[0.08] bg-white/[0.02] flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-foreground">Close Modals / Exit Fullscreen</div>
                    <div className="text-[10px] text-muted-foreground/60">Dismiss active dialogs or exit call fullscreen</div>
                  </div>
                  <div className="flex items-center gap-1 font-mono text-[11px]">
                    <kbd className="px-2 py-1 rounded bg-white/[0.06] border border-white/[0.1] text-foreground">Esc</kbd>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6 max-w-xl">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Notification Preferences</h3>
                <p className="text-xs text-muted-foreground/70">
                  Control alert badges, desktop notifications, and incoming call sounds.
                </p>
              </div>

              <div className="space-y-3">
                <label className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] cursor-pointer">
                  <div>
                    <div className="text-xs font-medium text-foreground">Desktop Notifications</div>
                    <div className="text-[10px] text-muted-foreground/60">
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

          {activeTab === 'diagnostics' && (
            <div className="space-y-6 max-w-xl">
              <div>
                <h3 className="text-lg font-semibold text-foreground">System Diagnostics & Logs</h3>
                <p className="text-xs text-muted-foreground/70">
                  Inspect messaging pipeline, Supabase WebSocket connections, session expirations, and network latency.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02] space-y-3">
                <div className="flex items-center gap-2 text-foreground font-semibold text-xs">
                  <Terminal className="w-4 h-4 text-primary" />
                  <span>Interactive Real-Time Diagnostics Console</span>
                </div>
                <p className="text-xs text-muted-foreground/70 leading-relaxed font-normal">
                  The logs console captures all message send attempts, database queries, and WebSocket states. You can also toggle it at any time with <kbd className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] text-[10px] font-mono">Ctrl + ~</kbd>.
                </p>
                <div className="pt-1 flex gap-2">
                  <Button
                    onClick={() => {
                      onOpenChange(false);
                      triggerOpenLogsWindow();
                    }}
                    className="font-medium gap-2 text-xs"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    Open Diagnostics Window
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
