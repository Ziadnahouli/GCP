import { NoiseCancellationMode } from '@/lib/webrtc/gcp-noise-cancellation';
'use client';

import * as React from 'react';
import {
  User,
  Palette,
  Volume2,
  Bell,
  LogOut,
  Save,
  Loader2,
  Sparkles,
  Mic,
  Headphones,
  Check,
  Terminal,
  Activity,
  Video,
  Keyboard,
  Sliders,
  Camera,
  Play,
  Square,
  Flame,
  Shield,
  Zap,
  Radio,
  Eye,
  Clock,
  Circle,
  HelpCircle,
  RefreshCw,
  ShieldAlert,
  KeyRound,
  Smartphone,
  Laptop,
  Trash2,
  Lock,
} from 'lucide-react';
import { useAuth, getLocalDeviceId } from '@/features/auth/auth-provider';
import { getBrowserClient } from '@/lib/supabase/client';
import { useModalEscape } from '@/hooks/use-modal-escape';
import { AccentTheme, UserProfile, UserSettings, UserStatus } from '@/lib/types/profile';
import { Dialog, DialogContent } from '@/components/ui/dialog';
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

const ACCENT_THEMES: { id: AccentTheme; name: string; hex: string; desc: string; bgClass: string }[] = [
  { id: 'violet', name: 'Violet Neon', hex: '#8b5cf6', desc: 'Default cybernetic violet glow', bgClass: 'bg-[#8b5cf6]' },
  { id: 'cyan', name: 'Cyber Cyan', hex: '#0ea5e9', desc: 'Electric high-contrast cyan hue', bgClass: 'bg-[#0ea5e9]' },
  { id: 'emerald', name: 'Vanguard Emerald', hex: '#10b981', desc: 'Tactical night-vision green', bgClass: 'bg-[#10b981]' },
  { id: 'crimson', name: 'Crimson Fury', hex: '#f43f5e', desc: 'Aggressive battle-ready crimson', bgClass: 'bg-[#f43f5e]' },
  { id: 'amber', name: 'Solar Amber', hex: '#f59e0b', desc: 'Warm overclocked solar flare', bgClass: 'bg-[#f59e0b]' },
];

const PRESET_BANNERS = [
  { name: 'Cosmic Violet', color: '#7c3aed' },
  { name: 'Cyber Cyan', color: '#0284c7' },
  { name: 'Emerald Ops', color: '#059669' },
  { name: 'Crimson Flare', color: '#e11d48' },
  { name: 'Solar Gold', color: '#d97706' },
  { name: 'Obsidian Zinc', color: '#27272a' },
];

const PRESENCE_OPTIONS: { status: UserStatus; label: string; desc: string; color: string; border: string }[] = [
  {
    status: 'online',
    label: 'Online',
    desc: 'Visible and ready for matches & squads',
    color: 'bg-emerald-500',
    border: 'border-emerald-500/30',
  },
  {
    status: 'idle',
    label: 'Idle / AFK',
    desc: 'Stepped away from battle station',
    color: 'bg-amber-500',
    border: 'border-amber-500/30',
  },
  {
    status: 'dnd',
    label: 'Do Not Disturb',
    desc: 'In-game focus mode; notification chimes silenced',
    color: 'bg-rose-500',
    border: 'border-rose-500/30',
  },
  {
    status: 'offline',
    label: 'Invisible (Offline)',
    desc: 'Appear offline to everyone while browsing',
    color: 'bg-zinc-500',
    border: 'border-zinc-500/30',
  },
];

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const { user, profile, settings, updateProfile, updateSettings, signOut } = useAuth();
  const { toast } = useToast();
  useModalEscape(open, onOpenChange);

  const [activeTab, setActiveTab] = React.useState<'profile' | 'appearance' | 'studio' | 'audio' | 'shortcuts' | 'notifs' | 'security' | 'diagnostics'>('profile');
  const [isSaving, setIsSaving] = React.useState(false);

  // Notification categories state
  const [notifDms, setNotifDms] = React.useState(true);
  const [notifMentions, setNotifMentions] = React.useState(true);
  const [notifFriendRequests, setNotifFriendRequests] = React.useState(true);
  const [notifInvites, setNotifInvites] = React.useState(true);
  const [notifMissedCalls, setNotifMissedCalls] = React.useState(true);

  // Security & Privacy state
  const [allowDms, setAllowDms] = React.useState<'everyone' | 'friends' | 'none'>('everyone');
  const [allowFriendReqs, setAllowFriendReqs] = React.useState<'everyone' | 'friends_of_friends' | 'none'>('everyone');
  const [isResettingPassword, setIsResettingPassword] = React.useState(false);
  const [directNewPassword, setDirectNewPassword] = React.useState('');
  const [directConfirmPassword, setDirectConfirmPassword] = React.useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = React.useState(false);
  const [showDirectPasswordChange, setShowDirectPasswordChange] = React.useState(false);
  const [isSigningOutOthers, setIsSigningOutOthers] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [deleteInputText, setDeleteInputText] = React.useState('');
  const [isDeletingAccount, setIsDeletingAccount] = React.useState(false);
  const [activeDevices, setActiveDevices] = React.useState<any[]>([]);
  const [loadingDevices, setLoadingDevices] = React.useState(false);

  // Profile state
  const [displayName, setDisplayName] = React.useState('');
  const [username, setUsername] = React.useState('');
  const [bio, setBio] = React.useState('');
  const [customStatus, setCustomStatus] = React.useState('');
  const [bannerColor, setBannerColor] = React.useState('#7c3aed');
  const [avatarUrl, setAvatarUrl] = React.useState('');
  const [presenceStatus, setPresenceStatus] = React.useState<UserStatus>('online');

  // Appearance & Audio state
  const [selectedAccent, setSelectedAccent] = React.useState<AccentTheme>('violet');
  const [soundEffects, setSoundEffects] = React.useState(true);
  const [pushToTalk, setPushToTalk] = React.useState(false);
  const [inputVol, setInputVol] = React.useState(85);
  const [outputVol, setOutputVol] = React.useState(100);
  const [desktopNotifs, setDesktopNotifs] = React.useState(true);
  const [noiseMode, setNoiseMode] = React.useState<NoiseCancellationMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('nexus_noise_suppression_mode') as NoiseCancellationMode | null;
      if (saved === 'off' || saved === 'balanced' || saved === 'strong') return saved;
      const legacy = localStorage.getItem('nexus_noise_suppression');
      if (legacy === 'false') return 'off';
    }
    return 'balanced';
  });
  const [liveEngineStatus, setLiveEngineStatus] = React.useState<{
    engine: 'rnnoise-wasm' | 'browser-native' | 'none';
    status: 'ready' | 'fallback' | 'disabled' | 'initializing';
    fallbackReason: string | null;
  }>(() => ({
    engine: typeof window !== 'undefined' && localStorage.getItem('nexus_noise_suppression_mode') === 'off' ? 'none' : 'rnnoise-wasm',
    status: typeof window !== 'undefined' && localStorage.getItem('nexus_noise_suppression_mode') === 'off' ? 'disabled' : 'ready',
    fallbackReason: null,
  }));

  React.useEffect(() => {
    const handleStatusUpdate = (e: CustomEvent) => {
      if (e.detail) {
        setLiveEngineStatus({
          engine: e.detail.activeEngine || (e.detail.mode === 'off' ? 'none' : 'rnnoise-wasm'),
          status: e.detail.status || (e.detail.mode === 'off' ? 'disabled' : 'ready'),
          fallbackReason: e.detail.fallbackReason || null,
        });
      }
    };
    window.addEventListener('gcp_noise_mode_changed' as any, handleStatusUpdate);
    return () => {
      window.removeEventListener('gcp_noise_mode_changed' as any, handleStatusUpdate);
    };
  }, []);
  const [noiseSuppression, setNoiseSuppression] = React.useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('nexus_noise_suppression');
      return stored !== null ? stored === 'true' : true;
    }
    return true;
  });

  // Hardware devices
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

  // Live audio output testing state
  const [isTestingOutput, setIsTestingOutput] = React.useState(false);

  // Live webcam preview testing state
  const [isTestingCam, setIsTestingCam] = React.useState(false);
  const camTestStreamRef = React.useRef<MediaStream | null>(null);
  const camVideoRef = React.useRef<HTMLVideoElement>(null);

  // Enumerate hardware devices and restore persisted preferences
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

          // Restore saved audio devices or fall back to first device
          const savedIn = localStorage.getItem('nexus_audio_input_device');
          const savedOut = localStorage.getItem('nexus_audio_output_device');

          if (inputs.length > 0) {
            const matchIn = savedIn && inputs.some((i) => i.deviceId === savedIn);
            setSelectedInputDevice(matchIn ? (savedIn as string) : inputs[0].deviceId);
          }
          if (outputs.length > 0) {
            const matchOut = savedOut && outputs.some((o) => o.deviceId === savedOut);
            setSelectedOutputDevice(matchOut ? (savedOut as string) : outputs[0].deviceId);
          }
          if (videos.length > 0 && !selectedCamDevice) {
            setSelectedCamDevice(videos[0].deviceId);
          }
        })
        .catch(() => {});
    }
  }, [open, selectedCamDevice]);

  // Clean up media tests
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

  // Real Web Audio output test using synthesizer chime and device routing
  const testAudioOutput = async () => {
    if (isTestingOutput) return;
    setIsTestingOutput(true);

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (!AudioCtx) {
        throw new Error('Web Audio is not supported in this browser environment.');
      }

      const ctx = new AudioCtx();
      let usedSink = false;

      // Handle setSinkId if supported by the browser on AudioContext
      if ('setSinkId' in ctx && selectedOutputDevice) {
        try {
          await (ctx as any).setSinkId(selectedOutputDevice);
          usedSink = true;
        } catch (sinkErr) {
          console.warn('[AudioTest] setSinkId notice (using system default):', sinkErr);
        }
      }

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // Play synthesized dual-tone harmonic chime
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc1.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.25); // G5

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
      osc2.frequency.exponentialRampToValueAtTime(1046.5, ctx.currentTime + 0.25); // C6

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.6);
      osc2.stop(ctx.currentTime + 0.6);

      setTimeout(() => {
        ctx.close().catch(() => {});
        setIsTestingOutput(false);
      }, 650);

      const deviceLabel = audioOutputDevices.find((d) => d.deviceId === selectedOutputDevice)?.label;
      toast({
        title: 'Audio Output Tested',
        description: usedSink && deviceLabel
          ? `Sound check played to "${deviceLabel}".`
          : 'Sound check played through active playback output.',
        type: 'success',
        duration: 2500,
      });
    } catch (err: any) {
      setIsTestingOutput(false);
      toast({
        title: 'Playback Test Failed',
        description: err?.message || 'Could not initialize audio playback output.',
        type: 'error',
      });
    }
  };

  // Start live mic test
  const startMicTest = async () => {
    if (isTestingMic) {
      stopMicTest();
      return;
    }
    try {
      const constraints: MediaStreamConstraints = {
        audio: selectedInputDevice ? { deviceId: { exact: selectedInputDevice } } : true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      micTestStreamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      micTestAudioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      setIsTestingMic(true);

      const updateLevel = () => {
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i];
        const avg = sum / buffer.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setMicLevel(normalized);
        micTestAnimRef.current = requestAnimationFrame(updateLevel);
      };
      micTestAnimRef.current = requestAnimationFrame(updateLevel);
    } catch (e) {
      console.warn('Microphone test access error:', e);
      toast({ title: 'Microphone Inaccessible', description: 'Could not access the selected microphone device.', type: 'error' });
      stopMicTest();
    }
  };

  // Start live camera test with fallback and auto-attach
  const startCamTest = async () => {
    if (isTestingCam) {
      stopCamTest();
      return;
    }
    try {
      let stream: MediaStream;
      try {
        const constraints: MediaStreamConstraints = {
          video: selectedCamDevice ? { deviceId: { exact: selectedCamDevice } } : true,
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (deviceErr) {
        console.warn('Specific camera constraint failed, attempting generic video: true', deviceErr);
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      camTestStreamRef.current = stream;
      setIsTestingCam(true);
      if (camVideoRef.current) {
        camVideoRef.current.srcObject = stream;
        camVideoRef.current.play().catch(() => {});
      }
    } catch (e) {
      console.warn('Webcam test access error:', e);
      toast({
        title: 'Webcam Inaccessible',
        description: 'Could not access camera. Please check camera permissions in your browser or ensure no other app is using it.',
        type: 'error',
      });
      stopCamTest();
    }
  };

  // Synchronize webcam test stream to video element whenever test state changes
  React.useEffect(() => {
    if (isTestingCam && camVideoRef.current && camTestStreamRef.current) {
      camVideoRef.current.srcObject = camTestStreamRef.current;
      camVideoRef.current.play().catch((err) => {
        console.warn('Webcam test preview play interrupted:', err);
      });
    }
  }, [isTestingCam]);

  // Sync state from profile & settings on mount/open
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
      setInputVol(settings.input_volume ?? 85);
      setOutputVol(settings.output_volume ?? 100);
      setDesktopNotifs(settings.desktop_notifications);
      setNotifDms(settings.notif_dms ?? true);
      setNotifMentions(settings.notif_mentions ?? true);
      setNotifFriendRequests(settings.notif_friend_requests ?? true);
      setNotifInvites(settings.notif_invites ?? true);
      setNotifMissedCalls(settings.notif_missed_calls ?? true);
      setAllowDms(settings.allow_direct_messages ?? 'everyone');
      setAllowFriendReqs(settings.allow_friend_requests ?? 'everyone');
    }
  }, [profile, settings, open]);

  // Save profile changes
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
        toast({ title: 'Update Failed', description: error, type: 'error' });
      } else {
        toast({ title: 'Profile Updated', description: 'Your gaming identity has been saved.', type: 'success' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Save appearance theme
  const handleSaveAppearance = async (theme: AccentTheme) => {
    setSelectedAccent(theme);
    await updateSettings({ accent_color: theme });
    toast({ title: 'Theme Applied', description: `Theme set to ${theme.toUpperCase()}.`, type: 'info' });
  };

  const handleSelectNoiseMode = (newMode: NoiseCancellationMode) => {
    setNoiseMode(newMode);
    setNoiseSuppression(newMode !== 'off');
    if (typeof window !== 'undefined') {
      localStorage.setItem('nexus_noise_suppression_mode', newMode);
      localStorage.setItem('nexus_noise_suppression', String(newMode !== 'off'));
      window.dispatchEvent(new CustomEvent('gcp_noise_mode_changed', { detail: { mode: newMode } }));
    }
    toast({
      title: newMode === 'off' ? 'Noise Suppression Disabled' : `GCP AI Suppression: ${newMode.toUpperCase()}`,
      description:
        newMode === 'off'
          ? 'Raw microphone pass-through active.'
          : newMode === 'strong'
          ? 'Strong neural suppression active: keyboard clicks and loud fans eliminated.'
          : 'Balanced neural enhancement active: background noise suppressed, natural voice preserved.',
      type: newMode === 'off' ? 'info' : 'success',
      duration: 2500,
    });
  };

  // Save audio & voice preferences
  const handleSaveAudio = async () => {
    setIsSaving(true);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('nexus_noise_suppression_mode', noiseMode);
        localStorage.setItem('nexus_noise_suppression', String(noiseMode !== 'off'));
        localStorage.setItem(
          'nexus_audio_prefs',
          JSON.stringify({
            pushToTalk,
            pushToTalkKey: 'KeyV',
          })
        );
      }
      await updateSettings({
        sound_effects_enabled: soundEffects,
        push_to_talk_enabled: pushToTalk,
        input_volume: inputVol,
        output_volume: outputVol,
      });
      toast({
        title: 'Voice & Audio Saved',
        description: `GCP Studio AI Noise Suppression (${noiseMode.toUpperCase()}) saved. Preferences updated.`,
        type: 'success',
      });
    } finally {
      setIsSaving(false);
    }
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
      description: `Notification category preference saved.`,
      type: 'info',
      duration: 2000,
    });
  };

  const handleUpdatePrivacy = async (updates: Partial<UserSettings>) => {
    if (updates.allow_direct_messages) setAllowDms(updates.allow_direct_messages);
    if (updates.allow_friend_requests) setAllowFriendReqs(updates.allow_friend_requests);
    await updateSettings(updates);
    toast({
      title: 'Privacy Policy Saved',
      description: 'Communication and invitation policies updated.',
      type: 'success',
      duration: 2000,
    });
  };

  const handleSendPasswordReset = async () => {
    const supabase = getBrowserClient();
    const userEmail = (user as any)?.email;
    if (!userEmail) {
      toast({
        title: 'Password Reset',
        description: 'No active email address associated with this session.',
        type: 'error',
      });
      return;
    }
    setIsResettingPassword(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
        redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/callback?next=/reset-password` : undefined,
      });
      if (error) throw error;
      toast({
        title: 'Reset Link Dispatched',
        description: `A password reset link has been dispatched to ${userEmail}.`,
        type: 'success',
      });
    } catch (err: any) {
      const isRateLimited = err?.message?.toLowerCase().includes('rate limit');
      toast({
        title: isRateLimited ? 'Email Rate Limit Reached' : 'Reset Request Failed',
        description: isRateLimited
          ? 'Supabase free mailer limits reset emails to 3 per hour. Use "Change Password Directly" below to update your password immediately without an email link!'
          : (err?.message || 'Could not send reset email.'),
        type: 'error',
      });
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleDirectPasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!directNewPassword || directNewPassword.length < 6) {
      toast({
        title: 'Invalid Password',
        description: 'New password must be at least 6 characters long.',
        type: 'error',
      });
      return;
    }
    if (directNewPassword !== directConfirmPassword) {
      toast({
        title: 'Passwords Mismatch',
        description: 'The new passwords do not match.',
        type: 'error',
      });
      return;
    }
    setIsUpdatingPassword(true);
    try {
      const supabase = getBrowserClient();
      const { error } = await supabase.auth.updateUser({ password: directNewPassword });
      if (error) throw error;
      toast({
        title: 'Password Updated',
        description: 'Your account password has been changed successfully.',
        type: 'success',
      });
      setDirectNewPassword('');
      setDirectConfirmPassword('');
      setShowDirectPasswordChange(false);
    } catch (err: any) {
      toast({
        title: 'Password Change Failed',
        description: err?.message || 'Failed to update account password.',
        type: 'error',
      });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const localDeviceId = React.useMemo(() => getLocalDeviceId(), []);

  const loadDevices = React.useCallback(async () => {
    if (!user) return;
    const supabase = getBrowserClient();
    setLoadingDevices(true);
    try {
      const { data } = await supabase
        .from('user_devices')
        .select('*')
        .eq('user_id', user.id)
        .order('last_active_at', { ascending: false });
      setActiveDevices(data || []);
    } catch {
      setActiveDevices([]);
    } finally {
      setLoadingDevices(false);
    }
  }, [user]);

  React.useEffect(() => {
    if (!open || activeTab !== 'security' || !user) return;
    const supabase = getBrowserClient();
    loadDevices();

    if (!supabase) return;
    const channel = supabase
      .channel(`devices_sync_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_devices',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadDevices();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, activeTab, user, loadDevices]);

  const handleSignOutOtherSessions = async () => {
    const supabase = getBrowserClient();
    setIsSigningOutOthers(true);
    try {
      if (supabase && user?.id) {
        await supabase
          .from('user_devices')
          .delete()
          .eq('user_id', user.id)
          .neq('device_id', localDeviceId);
        try {
          await supabase.auth.signOut({ scope: 'others' });
        } catch {}
      }
      toast({
        title: 'Sessions Terminated',
        description: 'All other active browser and device sessions have been invalidated.',
        type: 'success',
      });
      loadDevices();
    } catch (err: any) {
      toast({
        title: 'Action Failed',
        description: err?.message || 'Could not terminate other sessions.',
        type: 'error',
      });
    } finally {
      setIsSigningOutOthers(false);
    }
  };

  const handleRevokeDevice = async (deviceId: string) => {
    const supabase = getBrowserClient();
    try {
      if (deviceId === localDeviceId) {
        await signOut();
        if (typeof window !== 'undefined') window.location.href = '/login';
        return;
      }
      if (supabase && user?.id) {
        await supabase
          .from('user_devices')
          .delete()
          .eq('user_id', user.id)
          .eq('device_id', deviceId);
      }
      toast({
        title: 'Device Removed',
        description: 'Session invalidated for this device.',
        type: 'info',
      });
      loadDevices();
    } catch (err: any) {
      toast({
        title: 'Action Failed',
        description: err?.message || 'Could not revoke session.',
        type: 'error',
      });
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteInputText.trim() !== 'DELETE') {
      toast({ title: 'Confirmation Required', description: 'Please type DELETE to confirm.', type: 'error' });
      return;
    }
    const supabase = getBrowserClient();
    setIsDeletingAccount(true);
    try {
      const { error } = await supabase.rpc('delete_user_account');
      if (error) throw error;
      toast({
        title: 'Account Deleted',
        description: 'Your account and personal data have been removed.',
        type: 'info',
      });
      await signOut();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    } catch (err: any) {
      toast({
        title: 'Account Deletion Failed',
        description: err?.message || 'Could not delete account.',
        type: 'error',
      });
      setIsDeletingAccount(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl lg:max-w-6xl md:w-[980px] lg:w-[1100px] h-[720px] max-h-[94vh] p-0 flex flex-col md:flex-row overflow-hidden border border-white/[0.08] bg-[#090a0f] text-foreground w-[96vw] shadow-2xl shadow-black/95 rounded-2xl"
        onClose={() => onOpenChange(false)}
      >
        {/* Modern Gaming Navigation Sidebar */}
        <div className="w-full md:w-64 bg-[#0d0e15] p-3 md:p-4 border-b md:border-b-0 md:border-r border-white/[0.06] shrink-0 flex flex-row md:flex-col justify-between overflow-x-auto md:overflow-x-visible gap-2 no-scrollbar select-none">
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
        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#090a0f] relative custom-scrollbar">
          {/* TAB 1: GAMER PROFILE */}
          {activeTab === 'profile' && (
            <div className="space-y-6 max-w-3xl w-full pb-16">
              <div>
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <span>Gamer Identity & Profile</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 font-medium">
                    Live Preview
                  </span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Configure your banner, avatar, gaming bio, and real-time squad status.
                </p>
              </div>

              {/* 3D-styled Gamer ID Hero Card Preview */}
              <div className="rounded-2xl border border-white/[0.08] bg-[#10121a] overflow-hidden shadow-xl shadow-black/60 relative group">
                <div
                  className="h-24 w-full transition-all duration-300 relative overflow-hidden"
                  style={{ backgroundColor: bannerColor }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-[#10121a] via-transparent to-transparent opacity-80" />
                  <div className="absolute top-2.5 right-3 bg-black/50 backdrop-blur-md px-2 py-0.5 rounded-md text-[10px] font-mono text-white/80 border border-white/10 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-amber-400" />
                    <span>NEXUS ID</span>
                  </div>
                </div>

                <div className="px-5 pb-5 pt-0 relative flex items-end justify-between -mt-10">
                  <div className="flex items-end gap-3.5">
                    <div className="relative">
                      <Avatar
                        src={avatarUrl || null}
                        name={displayName || 'Gamer'}
                        status={presenceStatus}
                        showStatus
                        size="lg"
                        className="border-4 border-[#10121a] shadow-xl w-20 h-20 text-xl font-bold"
                      />
                    </div>
                    <div className="mb-1">
                      <div className="font-bold text-foreground leading-tight text-base flex items-center gap-1.5">
                        <span>{displayName || 'Squad Operative'}</span>
                        <span className="w-3.5 h-3.5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[9px] font-black" title="Verified Gamer">
                          ✓
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground/70 font-mono mt-0.5">
                        @{username || 'gamer_tag'}
                      </div>
                    </div>
                  </div>
                </div>

                {customStatus && (
                  <div className="px-5 pb-3">
                    <div className="inline-flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] px-3 py-1 rounded-xl text-xs text-foreground/90">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      <span className="italic font-medium">{`"${customStatus}"`}</span>
                    </div>
                  </div>
                )}

                {bio && (
                  <div className="px-5 pb-4">
                    <div className="text-xs text-muted-foreground bg-black/20 p-2.5 rounded-xl border border-white/[0.04]">
                      {bio}
                    </div>
                  </div>
                )}
              </div>

              {/* Form Controls */}
              <div className="space-y-4">
                {/* Banner Color Selection */}
                <div>
                  <label className="block text-xs font-semibold text-foreground/90 mb-1.5">
                    Profile Banner Hue
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {PRESET_BANNERS.map((preset) => (
                      <button
                        key={preset.name}
                        onClick={() => setBannerColor(preset.color)}
                        className={cn(
                          'w-7 h-7 rounded-xl transition-transform border border-white/20 relative flex items-center justify-center',
                          bannerColor === preset.color ? 'scale-110 ring-2 ring-primary ring-offset-2 ring-offset-[#090a0f]' : 'hover:scale-105'
                        )}
                        style={{ backgroundColor: preset.color }}
                        title={preset.name}
                      >
                        {bannerColor === preset.color && <Check className="w-3.5 h-3.5 text-white" />}
                      </button>
                    ))}
                    <div className="flex items-center gap-1.5 ml-2">
                      <input
                        type="color"
                        value={bannerColor}
                        onChange={(e) => setBannerColor(e.target.value)}
                        className="w-7 h-7 rounded-lg cursor-pointer bg-transparent border-0 p-0"
                        title="Custom Color"
                      />
                      <span className="text-[11px] font-mono text-muted-foreground uppercase">{bannerColor}</span>
                    </div>
                  </div>
                </div>

                {/* Display Name & Username */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-foreground/90 mb-1">
                      Display Name
                    </label>
                    <Input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your Gaming Call-sign"
                      className="bg-white/[0.03] border-white/[0.08] focus:border-primary text-xs rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-foreground/90 mb-1">
                      Gamer Tag (@username)
                    </label>
                    <Input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="username"
                      className="bg-white/[0.03] border-white/[0.08] focus:border-primary text-xs rounded-xl"
                    />
                  </div>
                </div>

                {/* Custom Status */}
                <div>
                  <label className="block text-xs font-semibold text-foreground/90 mb-1">
                    Custom Status Message
                  </label>
                  <Input
                    value={customStatus}
                    onChange={(e) => setCustomStatus(e.target.value)}
                    placeholder="e.g. Grinding Ranked 2v2 | Back in 10m"
                    className="bg-white/[0.03] border-white/[0.08] focus:border-primary text-xs rounded-xl"
                  />
                </div>

                {/* Avatar URL */}
                <div>
                  <label className="block text-xs font-semibold text-foreground/90 mb-1">
                    Avatar Image URL
                  </label>
                  <Input
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://images.unsplash.com/... or custom URL"
                    className="bg-white/[0.03] border-white/[0.08] focus:border-primary text-xs rounded-xl"
                  />
                </div>

                {/* Gamer Bio */}
                <div>
                  <label className="block text-xs font-semibold text-foreground/90 mb-1 flex items-center justify-between">
                    <span>Gamer Bio</span>
                    <span className="text-[10px] text-muted-foreground/60">{bio.length}/180</span>
                  </label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value.slice(0, 180))}
                    placeholder="Tell your squad what games you main, rank, or preferred playstyle..."
                    rows={3}
                    className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] p-3 text-xs text-foreground focus:border-primary focus:outline-none transition-colors resize-none"
                  />
                </div>

                {/* Presence Status Selection Cards */}
                <div>
                  <label className="block text-xs font-semibold text-foreground/90 mb-2">
                    Live Presence Mode
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {PRESENCE_OPTIONS.map((opt) => (
                      <button
                        key={opt.status}
                        onClick={() => setPresenceStatus(opt.status)}
                        className={cn(
                          'flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all',
                          presenceStatus === opt.status
                            ? 'bg-white/[0.06] border-primary/50 ring-1 ring-primary/40'
                            : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]'
                        )}
                      >
                        <span className={cn('w-2.5 h-2.5 rounded-full mt-1 shrink-0', opt.color)} />
                        <div>
                          <div className="text-xs font-bold text-foreground">{opt.label}</div>
                          <div className="text-[10px] text-muted-foreground/70 leading-snug mt-0.5">{opt.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Save Button */}
                <div className="pt-2">
                  <Button
                    onClick={handleSaveProfile}
                    disabled={isSaving}
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5 rounded-xl shadow-lg shadow-primary/20 text-xs flex items-center justify-center gap-2"
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    <span>Save Profile Identity</span>
                  </Button>
                </div>
              </div>
            </div>
          )}

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

          {/* TAB 3: VOICE & VIDEO STUDIO */}
          {activeTab === 'studio' && (
            <div className="space-y-6 max-w-3xl w-full pb-16">
              <div>
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <span>Voice & Video Studio</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium">
                    Hardware Linked
                  </span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select your microphone, headphones, and camera. Test audio levels and preview webcam.
                </p>
              </div>

              {/* Hardware Device Pickers */}
              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-foreground/90 mb-1 flex items-center gap-1.5">
                    <Mic className="w-3.5 h-3.5 text-primary" />
                    <span>Microphone Input Device</span>
                  </label>
                  <select
                    value={selectedInputDevice}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedInputDevice(val);
                      try {
                        localStorage.setItem('nexus_audio_input_device', val);
                      } catch {}
                      if (isTestingMic) stopMicTest();
                    }}
                    className="w-full bg-[#10121a] border border-white/[0.08] text-foreground text-xs rounded-xl p-2.5 focus:border-primary focus:outline-none"
                  >
                    {audioInputDevices.length === 0 ? (
                      <option value="">Default Microphone</option>
                    ) : (
                      audioInputDevices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Microphone ${d.deviceId.slice(0, 5)}`}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Live Mic Test & VU Meter */}
                <div className="rounded-xl border border-white/[0.08] bg-[#10121a] p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-foreground">Microphone Input Level</div>
                      <div className="text-[10px] text-muted-foreground">Test mic sensitivity and room noise</div>
                    </div>
                    <Button
                      size="sm"
                      onClick={startMicTest}
                      variant="outline"
                      className={cn(
                        'text-xs rounded-lg border-white/[0.08] h-8 px-3',
                        isTestingMic ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' : 'hover:bg-primary/10'
                      )}
                    >
                      {isTestingMic ? (
                        <>
                          <Square className="w-3 h-3 mr-1.5" /> Stop Test
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3 mr-1.5" /> Test Mic
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Gradient VU meter */}
                  <div className="space-y-1">
                    <div className="h-3 w-full bg-black/40 rounded-full overflow-hidden p-0.5 border border-white/[0.06]">
                      <div
                        className="h-full rounded-full transition-all duration-75 bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500"
                        style={{ width: `${micLevel}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] font-mono text-muted-foreground/60 px-0.5">
                      <span>-60 dB (Quiet)</span>
                      <span>{micLevel}%</span>
                      <span>0 dB (Peak)</span>
                    </div>
                  </div>
                </div>

                {/* Webcam Hardware Device Picker */}
                <div>
                  <label className="block text-xs font-semibold text-foreground/90 mb-1 flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5 text-primary" />
                    <span>Camera / Video Device</span>
                  </label>
                  <select
                    value={selectedCamDevice}
                    onChange={(e) => {
                      setSelectedCamDevice(e.target.value);
                      if (isTestingCam) stopCamTest();
                    }}
                    className="w-full bg-[#10121a] border border-white/[0.08] text-foreground text-xs rounded-xl p-2.5 focus:border-primary focus:outline-none"
                  >
                    {videoDevices.length === 0 ? (
                      <option value="">Default Webcam</option>
                    ) : (
                      videoDevices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Camera ${d.deviceId.slice(0, 5)}`}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Live Webcam Preview Studio */}
                <div className="rounded-xl border border-white/[0.08] bg-[#10121a] p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-foreground">Webcam Preview Studio</div>
                      <div className="text-[10px] text-muted-foreground">Test camera exposure and lens framing</div>
                    </div>
                    <Button
                      size="sm"
                      onClick={startCamTest}
                      variant="outline"
                      className={cn(
                        'text-xs rounded-lg border-white/[0.08] h-8 px-3',
                        isTestingCam ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' : 'hover:bg-primary/10'
                      )}
                    >
                      {isTestingCam ? (
                        <>
                          <Square className="w-3 h-3 mr-1.5" /> Stop Camera
                        </>
                      ) : (
                        <>
                          <Camera className="w-3 h-3 mr-1.5" /> Test Camera
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="relative aspect-video w-full rounded-xl bg-black border border-white/[0.06] overflow-hidden flex items-center justify-center">
                    <video
                      ref={camVideoRef}
                      autoPlay
                      playsInline
                      muted
                      onLoadedMetadata={(e) => {
                        (e.currentTarget as HTMLVideoElement).play().catch(() => {});
                      }}
                      className={cn('w-full h-full object-cover', !isTestingCam && 'hidden')}
                    />
                    {!isTestingCam && (
                      <div className="flex flex-col items-center justify-center text-muted-foreground/60 space-y-1">
                        <Camera className="w-8 h-8 opacity-40" />
                        <span className="text-xs">Webcam preview offline</span>
                      </div>
                    )}
                    {isTestingCam && (
                      <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-mono text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                        <span>CAMERA ACTIVE (1080p)</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Audio Output Speaker Picker */}
                <div>
                  <label className="block text-xs font-semibold text-foreground/90 mb-1 flex items-center gap-1.5">
                    <Headphones className="w-3.5 h-3.5 text-primary" />
                    <span>Playback / Headphone Output</span>
                  </label>
                  <div className="flex gap-2 items-center">
                    <select
                      value={selectedOutputDevice}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedOutputDevice(val);
                        try {
                          localStorage.setItem('nexus_audio_output_device', val);
                        } catch {}
                      }}
                      className="flex-1 bg-[#10121a] border border-white/[0.08] text-foreground text-xs rounded-xl p-2.5 focus:border-primary focus:outline-none"
                    >
                      {audioOutputDevices.length === 0 ? (
                        <option value="">Default Audio Output (System Default)</option>
                      ) : (
                        audioOutputDevices.map((d) => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.label || `Speaker ${d.deviceId.slice(0, 5)}`}
                          </option>
                        ))
                      )}
                    </select>

                    <button
                      type="button"
                      onClick={testAudioOutput}
                      disabled={isTestingOutput}
                      className={cn(
                        'px-3 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap',
                        isTestingOutput
                          ? 'bg-primary/20 border-primary text-primary animate-pulse'
                          : 'bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.08] text-foreground'
                      )}
                      title="Play live test chime through this output device"
                    >
                      <Volume2 className={cn('w-3.5 h-3.5', isTestingOutput && 'animate-bounce')} />
                      <span>{isTestingOutput ? 'Testing...' : 'Test Audio'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: AUDIO PROCESSING */}
          {activeTab === 'audio' && (
            <div className="space-y-6 max-w-3xl w-full pb-16">
              <div>
                <h3 className="text-lg font-bold text-foreground">Audio Processing & DSP</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Acoustic echo cancellation, Krisp AI noise filters, and master volume balances.
                </p>
              </div>

              {/* GCP Studio AI Neural Noise Suppression Selector */}
              <div className="rounded-2xl border border-white/[0.08] bg-[#10121a] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-foreground flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                      <span>GCP Studio Neural Noise Suppression</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                        RNNoise WASM
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Client-side WebAssembly neural network. Removes computer fans, mechanical typing, and room noise in real-time.
                    </div>
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground bg-white/[0.04] px-2.5 py-1 rounded-lg border border-white/[0.06]">
                    0ms Cloud Latency • 100% Private
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1">
                  {/* Off Mode */}
                  <div
                    onClick={() => handleSelectNoiseMode('off')}
                    className={cn(
                      'p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between text-left',
                      noiseMode === 'off'
                        ? 'bg-rose-500/10 border-rose-500/40 ring-1 ring-rose-500/30'
                        : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]'
                    )}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-foreground">Off</span>
                        <span className={cn('w-2 h-2 rounded-full', noiseMode === 'off' ? 'bg-rose-400' : 'bg-white/20')} />
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-tight">
                        Raw microphone pass-through. Zero DSP processing.
                      </p>
                    </div>
                  </div>

                  {/* Balanced Mode */}
                  <div
                    onClick={() => handleSelectNoiseMode('balanced')}
                    className={cn(
                      'p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between text-left',
                      noiseMode === 'balanced'
                        ? 'bg-primary/15 border-primary/50 ring-1 ring-primary/40'
                        : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]'
                    )}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-foreground">Balanced</span>
                        <span className={cn('w-2 h-2 rounded-full', noiseMode === 'balanced' ? 'bg-primary' : 'bg-white/20')} />
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-tight">
                        Moderate noise removal. Preserves natural vocal warmth and breathing.
                      </p>
                    </div>
                    <span className="text-[9px] text-primary font-bold mt-2">Recommended</span>
                  </div>

                  {/* Strong Mode */}
                  <div
                    onClick={() => handleSelectNoiseMode('strong')}
                    className={cn(
                      'p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between text-left',
                      noiseMode === 'strong'
                        ? 'bg-emerald-500/15 border-emerald-500/50 ring-1 ring-emerald-500/40'
                        : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]'
                    )}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-foreground">Strong</span>
                        <span className={cn('w-2 h-2 rounded-full', noiseMode === 'strong' ? 'bg-emerald-400' : 'bg-white/20')} />
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-tight">
                        Intense suppression. Eliminates clicky keyboards and loud fans.
                      </p>
                    </div>
                    <span className="text-[9px] text-emerald-400 font-bold mt-2">Max Noise Cut</span>
                  </div>
                </div>

                {/* Real-Time Engine Diagnostic Badge */}
                <div className="mt-3 p-2.5 rounded-xl bg-black/30 border border-white/5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full',
                        noiseMode === 'off'
                          ? 'bg-zinc-500'
                          : liveEngineStatus.status === 'ready'
                          ? 'bg-emerald-400 animate-pulse'
                          : liveEngineStatus.status === 'fallback'
                          ? 'bg-amber-400'
                          : 'bg-blue-400'
                      )}
                    />
                    <div>
                      <span className="font-semibold text-foreground text-xs">
                        {noiseMode === 'off'
                          ? 'Processing Disabled (Raw Pass-Through)'
                          : liveEngineStatus.engine === 'rnnoise-wasm'
                          ? 'RNNoise Neural Engine (48 kHz WASM AudioWorklet)'
                          : 'Browser-Native Audio Processing (Fallback Active)'}
                      </span>
                      {liveEngineStatus.fallbackReason && noiseMode !== 'off' && (
                        <p className="text-[10px] text-amber-400/80 leading-tight mt-0.5">
                          {liveEngineStatus.fallbackReason}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {noiseMode === 'off' ? '0 ms' : '~14 ms latency | 100% local'}
                  </span>
                </div>
              </div>

              {/* Push to talk vs Voice Activity */}
              <div
                onClick={() => {
                  const nextPtt = !pushToTalk;
                  setPushToTalk(nextPtt);
                  if (typeof window !== 'undefined') {
                    localStorage.setItem(
                      'nexus_audio_prefs',
                      JSON.stringify({
                        pushToTalk: nextPtt,
                        pushToTalkKey: 'KeyV',
                      })
                    );
                  }
                  updateSettings({ push_to_talk_enabled: nextPtt }).catch(() => {});
                  toast({
                    title: nextPtt ? 'Push-to-Talk Enabled' : 'Voice Activity Enabled',
                    description: nextPtt
                      ? 'Hold Space or V key to transmit microphone.'
                      : 'Microphone is active on speech detection.',
                    type: 'info',
                    duration: 2000,
                  });
                }}
                className={cn(
                  'flex items-center justify-between p-4 rounded-2xl border cursor-pointer transition-all',
                  pushToTalk
                    ? 'bg-primary/10 border-primary/40 ring-1 ring-primary/30'
                    : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]'
                )}
              >
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-foreground flex items-center gap-2">
                    <span>Push-to-Talk (PTT) Mode</span>
                    {pushToTalk && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-mono font-semibold">
                        SPACE or V
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Hold keyboard hotkey (<kbd className="px-1 py-0.5 rounded bg-white/10 text-white font-mono text-[10px]">Space</kbd> or <kbd className="px-1 py-0.5 rounded bg-white/10 text-white font-mono text-[10px]">V</kbd>) to transmit mic audio.
                    {pushToTalk && (
                      <span className="block text-[10px] text-primary/80 mt-1">
                        💡 Gaming Tip: When playing external games outside the browser window, web browsers sandbox keyboard input. Switch to Voice Activity with Krisp AI filter for seamless background gaming audio!
                      </span>
                    )}
                  </div>
                </div>
                <div
                  className={cn(
                    'w-11 h-6 rounded-full transition-colors relative flex items-center p-0.5',
                    pushToTalk ? 'bg-primary' : 'bg-white/20'
                  )}
                >
                  <div
                    className={cn(
                      'w-5 h-5 rounded-full bg-white shadow-md transition-transform',
                      pushToTalk ? 'translate-x-5' : 'translate-x-0'
                    )}
                  />
                </div>
              </div>

              {/* Input & Output Volume Sliders */}
              <div className="space-y-4 pt-2">
                <div>
                  <div className="flex justify-between text-xs font-semibold text-foreground/90 mb-1.5">
                    <span>Microphone Input Gain</span>
                    <span className="font-mono text-primary">{inputVol}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={inputVol}
                    onChange={(e) => setInputVol(Number(e.target.value))}
                    className="w-full accent-primary h-1.5 bg-white/10 rounded-lg cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-semibold text-foreground/90 mb-1.5">
                    <span>Squad Call Output Volume</span>
                    <span className="font-mono text-primary">{outputVol}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="150"
                    value={outputVol}
                    onChange={(e) => setOutputVol(Number(e.target.value))}
                    className="w-full accent-primary h-1.5 bg-white/10 rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              <div className="pt-2">
                <Button
                  onClick={handleSaveAudio}
                  disabled={isSaving}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>Save Audio Settings</span>
                </Button>
              </div>
            </div>
          )}

          {/* TAB 5: SHORTCUTS & KEYBINDS */}
          {activeTab === 'shortcuts' && (
            <div className="space-y-6 max-w-3xl w-full pb-16">
              <div>
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <span>Gaming Keybinds & Shortcuts</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 font-medium">
                    Tactical Controls
                  </span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Physical keyboard hotkeys for in-game squad communication and call controls.
                </p>
              </div>

              <div className="space-y-2">
                {[
                  { action: 'Toggle Microphone Mute', key: 'M', desc: 'Mute / unmute your microphone stream' },
                  { action: 'Toggle Deafen Audio', key: 'D', desc: 'Silence all incoming voices & audio' },
                  { action: 'Toggle Camera Broadcast', key: 'V', desc: 'Turn video webcam on or off' },
                  { action: 'Toggle Screen Share', key: 'S', desc: 'Start or end game display sharing' },
                  { action: 'Close Modal / Drop Focus', key: 'Esc', desc: 'Dismiss active dialogue windows' },
                  { action: 'Push to Talk (When Enabled)', key: 'Space', desc: 'Hold to speak in squad call' },
                ].map((item) => (
                  <div
                    key={item.action}
                    className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]"
                  >
                    <div>
                      <div className="text-xs font-semibold text-foreground">{item.action}</div>
                      <div className="text-[10px] text-muted-foreground/70">{item.desc}</div>
                    </div>
                    <kbd className="px-2.5 py-1 rounded-lg bg-black/60 border border-white/20 shadow-inner font-mono text-[11px] font-bold text-white tracking-wider">
                      {item.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          )}

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

              {/* Phase 4 Category-Specific Notification Settings */}
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

          {/* TAB: SECURITY & PRIVACY */}
          {activeTab === 'security' && (
            <div className="space-y-6 max-w-3xl w-full pb-16">
              <div>
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary" />
                  <span>Account Security & Privacy</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Manage communication privacy, authentication, active sessions, and account lifecycle.
                </p>
              </div>

              {/* 1. Privacy Controls */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Privacy Controls</h4>

                {/* Direct Messages Policy */}
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-3">
                  <div>
                    <div className="text-xs font-bold text-foreground">Who Can Send You Direct Messages</div>
                    <div className="text-[11px] text-muted-foreground">Choose who is permitted to initiate private conversations</div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { id: 'everyone', label: 'Everyone', desc: 'Any verified user' },
                      { id: 'friends', label: 'Friends Only', desc: 'Only accepted friends' },
                      { id: 'none', label: 'Nobody', desc: 'Block incoming DMs' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleUpdatePrivacy({ allow_direct_messages: opt.id as any })}
                        className={cn(
                          'p-2.5 rounded-xl border text-left transition text-xs',
                          allowDms === opt.id
                            ? 'bg-primary/20 border-primary text-foreground'
                            : 'bg-white/[0.02] border-white/[0.06] text-muted-foreground hover:bg-white/[0.04]'
                        )}
                      >
                        <div className="font-semibold">{opt.label}</div>
                        <div className="text-[10px] opacity-75">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Friend Requests Policy */}
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-3">
                  <div>
                    <div className="text-xs font-bold text-foreground">Who Can Send You Friend Requests</div>
                    <div className="text-[11px] text-muted-foreground">Control incoming friendship requests</div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { id: 'everyone', label: 'Everyone', desc: 'Any user on GCP' },
                      { id: 'friends_of_friends', label: 'Mutual Friends', desc: 'Friends of friends' },
                      { id: 'none', label: 'Nobody', desc: 'Disable requests' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleUpdatePrivacy({ allow_friend_requests: opt.id as any })}
                        className={cn(
                          'p-2.5 rounded-xl border text-left transition text-xs',
                          allowFriendReqs === opt.id
                            ? 'bg-primary/20 border-primary text-foreground'
                            : 'bg-white/[0.02] border-white/[0.06] text-muted-foreground hover:bg-white/[0.04]'
                        )}
                      >
                        <div className="font-semibold">{opt.label}</div>
                        <div className="text-[10px] opacity-75">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 2. Authentication & Account Access */}
              <div className="space-y-3 pt-3 border-t border-white/[0.06]">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Authentication & MFA</h4>

                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-foreground">Email Verification</div>
                      <div className="text-[11px] text-muted-foreground">
                        {(user as any)?.email || 'Signed in via provider'}
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {(user as any)?.email_confirmed_at ? 'Email Verified' : 'Verified'}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-white/[0.04] space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-foreground">Password Management</div>
                        <div className="text-[11px] text-muted-foreground">Change your password directly or send a recovery email</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={showDirectPasswordChange ? 'secondary' : 'default'}
                          onClick={() => setShowDirectPasswordChange((prev) => !prev)}
                          className="text-xs h-8"
                        >
                          <Lock className="w-3.5 h-3.5 mr-1.5" />
                          {showDirectPasswordChange ? 'Close Form' : 'Change Password'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleSendPasswordReset}
                          disabled={isResettingPassword}
                          className="border-white/10 hover:bg-white/10 text-xs h-8"
                          title="Sends password reset link to your email"
                        >
                          {isResettingPassword ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <KeyRound className="w-3.5 h-3.5 mr-1.5" />}
                          Email Link
                        </Button>
                      </div>
                    </div>

                    {showDirectPasswordChange && (
                      <form onSubmit={handleDirectPasswordUpdate} className="p-3.5 rounded-xl bg-black/40 border border-white/[0.08] space-y-3 animate-in fade-in duration-150">
                        <div className="text-[11px] font-semibold text-primary">
                          Update Password Directly (No Email Needed)
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">
                              New Password
                            </label>
                            <Input
                              type="password"
                              placeholder="Minimum 6 characters"
                              value={directNewPassword}
                              onChange={(e) => setDirectNewPassword(e.target.value)}
                              className="h-8 text-xs bg-white/[0.03] border-white/10"
                              disabled={isUpdatingPassword}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">
                              Confirm Password
                            </label>
                            <Input
                              type="password"
                              placeholder="Re-enter password"
                              value={directConfirmPassword}
                              onChange={(e) => setDirectConfirmPassword(e.target.value)}
                              className="h-8 text-xs bg-white/[0.03] border-white/10"
                              disabled={isUpdatingPassword}
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setShowDirectPasswordChange(false);
                              setDirectNewPassword('');
                              setDirectConfirmPassword('');
                            }}
                            className="text-xs h-7 text-muted-foreground"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            size="sm"
                            disabled={isUpdatingPassword || !directNewPassword || !directConfirmPassword}
                            className="text-xs h-7 font-semibold"
                          >
                            {isUpdatingPassword ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                            Update Password
                          </Button>
                        </div>
                      </form>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
                    <div>
                      <div className="text-xs font-bold text-foreground">Multi-Factor Authentication (MFA)</div>
                      <div className="text-[11px] text-muted-foreground">Time-based one-time password (TOTP) authenticator app</div>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                      Standard Security
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. Active Sessions & Device Management */}
              <div className="space-y-3 pt-3 border-t border-white/[0.06]">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Active Sessions & Devices</h4>
                    <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                      Devices currently authorized to access your profile.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleSignOutOtherSessions}
                    disabled={isSigningOutOthers}
                    className="text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20"
                  >
                    {isSigningOutOthers ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <LogOut className="w-3 h-3 mr-1.5" />}
                    Sign Out Other Sessions
                  </Button>
                </div>

                <div className="space-y-2">
                  {loadingDevices ? (
                    <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      Loading authorized sessions...
                    </div>
                  ) : activeDevices.length > 0 ? (
                    activeDevices.map((dev: any) => {
                      const isCurrent = dev.device_id === localDeviceId;
                      const isMobile = dev.device_name?.toLowerCase().includes('phone') || 
                                       dev.device_name?.toLowerCase().includes('android') || 
                                       dev.device_name?.toLowerCase().includes('iphone') || 
                                       dev.user_agent?.toLowerCase().includes('mobile');
                      return (
                        <div
                          key={dev.id || dev.device_id}
                          className={cn(
                            "p-3.5 rounded-2xl border flex items-center justify-between transition-all",
                            isCurrent
                              ? "bg-primary/[0.04] border-primary/20"
                              : "bg-white/[0.02] border-white/[0.06] hover:border-white/10"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-9 h-9 rounded-xl border flex items-center justify-center shrink-0",
                              isCurrent
                                ? "bg-primary/15 border-primary/30 text-primary"
                                : "bg-white/[0.04] border-white/10 text-muted-foreground"
                            )}>
                              {isMobile ? <Smartphone className="w-4 h-4" /> : <Laptop className="w-4 h-4" />}
                            </div>
                            <div className="space-y-0.5">
                              <div className="text-xs font-bold text-foreground flex items-center gap-2">
                                <span>{dev.device_name || 'Browser Client'}</span>
                                {isCurrent ? (
                                  <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    This Device
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground/80 font-normal">
                                    Last active: {new Date(dev.last_active_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-muted-foreground line-clamp-1 max-w-[280px]">
                                {dev.user_agent ? dev.user_agent.slice(0, 50) + '...' : 'Web Session'}
                              </div>
                            </div>
                          </div>
                          {!isCurrent && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRevokeDevice(dev.device_id)}
                              className="h-7 px-2.5 text-[11px] text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20"
                            >
                              <LogOut className="w-3 h-3 mr-1" />
                              Revoke
                            </Button>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
                          <Laptop className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-foreground flex items-center gap-2">
                            <span>Current Browser Session</span>
                            <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Active Now
                            </span>
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {typeof navigator !== 'undefined' ? `${navigator.userAgent.slice(0, 45)}...` : 'Web Client'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 4. Danger Zone: Account Deletion */}
              <div className="space-y-3 pt-4 border-t border-rose-500/20">
                <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/30 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                      <ShieldAlert className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-rose-300">Danger Zone — Delete Account</div>
                      <div className="text-[11px] text-rose-300/80 leading-relaxed mt-0.5">
                        Permanently purge your gamer identity, server memberships, friendship records, and custom settings.
                        This action cannot be reversed.
                      </div>
                    </div>
                  </div>

                  {!showDeleteConfirm ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setShowDeleteConfirm(true)}
                      className="bg-rose-600 hover:bg-rose-700 text-white text-xs"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                      Request Account Deletion
                    </Button>
                  ) : (
                    <div className="p-3 rounded-xl bg-black/40 border border-rose-500/40 space-y-3">
                      <p className="text-xs text-rose-300 font-semibold">
                        Type <span className="underline font-mono text-white">DELETE</span> to confirm permanent account purge:
                      </p>
                      <div className="flex gap-2">
                        <Input
                          value={deleteInputText}
                          onChange={(e) => setDeleteInputText(e.target.value)}
                          placeholder="Type DELETE"
                          className="text-xs bg-white/[0.05] border-white/20 h-8"
                        />
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={handleDeleteAccount}
                          disabled={deleteInputText.trim() !== 'DELETE' || isDeletingAccount}
                          className="text-xs shrink-0"
                        >
                          {isDeletingAccount ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                          Confirm Purge
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setShowDeleteConfirm(false);
                            setDeleteInputText('');
                          }}
                          className="text-xs shrink-0"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: DIAGNOSTICS & LOGS */}
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
