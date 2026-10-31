'use client';

import * as React from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { getBrowserClient } from '@/lib/supabase/client';
import { UserProfile, UserStatus, VisibilityAudience, ProfileLinkItem } from '@/lib/types/profile';
import { Avatar } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { PROFILE_BANNER_PRESETS, DEFAULT_BANNER_COLOR } from '@/lib/design/colors';
import { ProfileBanner } from '@/components/profile/ProfileBanner';
import { UserName } from '@/components/profile/UserName';
import { CustomStatusLine } from '@/components/profile/CustomStatusLine';
import { ActivityLine } from '@/components/profile/ActivityLine';
import { AboutMeFormatted } from '@/components/profile/AboutMeFormatted';
import { ImageCropDialog } from '@/components/profile/ImageCropDialog';
import { LinksEditor } from '@/components/profile/LinksEditor';
import { ServerProfileEditor } from '@/components/profile/ServerProfileEditor';
import { useServers } from '@/hooks/use-servers';
import { ProcessedImageResult, getAccessibleTextColor } from '@/lib/images/profile-images';
import {
  Upload,
  Trash2,
  Save,
  RotateCcw,
  Sparkles,
  Smile,
  Shield,
  Server,
  User,
  Moon,
  Sun,
  Eye,
  Check,
  AlertCircle,
  Loader2,
  Clock,
  Plus,
  X,
} from 'lucide-react';

export const PRESET_BANNERS = PROFILE_BANNER_PRESETS;

export const PRESENCE_OPTIONS: {
  status: UserStatus;
  label: string;
  desc: string;
  color: string;
}[] = [
  { status: 'online', label: 'Online', desc: 'Visible to friends and server members', color: 'bg-success' },
  { status: 'idle', label: 'Away', desc: 'Inactive or stepped away', color: 'bg-warning' },
  { status: 'dnd', label: 'Do Not Disturb', desc: 'Notification sounds muted', color: 'bg-danger' },
  { status: 'offline', label: 'Invisible', desc: 'Appear offline to everyone', color: 'bg-status-offline' },
];

const PRONOUN_SUGGESTIONS = ['he/him', 'she/her', 'they/them', 'any pronouns', 'ask me'];

const STATUS_EXPIRY_OPTIONS = [
  { label: "Don't clear", minutes: 0 },
  { label: '30 minutes', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '4 hours', minutes: 240 },
  { label: 'Today', minutes: 1440 },
];

export function ProfileTab() {
  const { profile, settings, updateProfile, updateSettings } = useAuth();
  const { toast } = useToast();
  const { servers } = useServers();

  const [activeSection, setActiveSection] = React.useState<'user' | 'server' | 'privacy'>('user');

  // Form State
  const [displayName, setDisplayName] = React.useState(profile?.display_name || '');
  const [username, setUsername] = React.useState(profile?.username || '');
  const [pronouns, setPronouns] = React.useState(profile?.pronouns || '');
  const [bio, setBio] = React.useState(profile?.bio || '');
  const [customStatus, setCustomStatus] = React.useState(profile?.custom_status || '');
  const [customStatusEmoji, setCustomStatusEmoji] = React.useState(profile?.custom_status_emoji || '');
  const [statusExpiry, setStatusExpiry] = React.useState<number>(0);
  const [presenceStatus, setPresenceStatus] = React.useState<UserStatus>(profile?.status || 'online');
  const [bannerColor, setBannerColor] = React.useState(profile?.banner_color || DEFAULT_BANNER_COLOR);
  const [accentColor, setAccentColor] = React.useState(profile?.accent_color || '');
  const [avatarPath, setAvatarPath] = React.useState<string | null>(profile?.avatar_path || null);
  const [bannerPath, setBannerPath] = React.useState<string | null>(profile?.banner_path || null);
  const [avatarColor, setAvatarColor] = React.useState<string | null>(profile?.avatar_color || null);
  const [timezone, setTimezone] = React.useState<string>(profile?.timezone || '');
  const [favoriteGames, setFavoriteGames] = React.useState<string[]>(profile?.favorite_games || []);
  const [newGameInput, setNewGameInput] = React.useState('');
  const [links, setLinks] = React.useState<ProfileLinkItem[]>([]);

  // Privacy Audience State
  const [profileVis, setProfileVis] = React.useState<VisibilityAudience>(settings?.profile_visibility || 'mutual_servers');
  const [presenceVis, setPresenceVis] = React.useState<VisibilityAudience>(settings?.presence_visibility || 'friends');
  const [activityVis, setActivityVis] = React.useState<VisibilityAudience>(settings?.activity_visibility || 'friends');
  const [localTimeVis, setLocalTimeVis] = React.useState<VisibilityAudience>(settings?.local_time_visibility || 'friends');

  // Preview perspective & mode
  const [previewMode, setPreviewMode] = React.useState<'card' | 'message' | 'member'>('card');
  const [previewTheme, setPreviewTheme] = React.useState<'dark' | 'light'>('dark');
  const [previewPerspective, setPreviewPerspective] = React.useState<'friend' | 'stranger' | 'member'>('friend');

  // Username validation state
  const [usernameStatus, setUsernameStatus] = React.useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [usernameMessage, setUsernameMessage] = React.useState<string | null>(null);

  // Crop dialog state
  const [cropType, setCropType] = React.useState<'avatar' | 'banner' | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  // Sync initial state when user switches profile (keyed by profile ID and updated_at)
  const profileSyncKey = `${profile?.id || ''}_${profile?.updated_at || ''}`;
  React.useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      setUsername(profile.username || '');
      setPronouns(profile.pronouns || '');
      setBio(profile.bio || '');
      setCustomStatus(profile.custom_status || '');
      setCustomStatusEmoji(profile.custom_status_emoji || '');
      setPresenceStatus(profile.status || 'online');
      setBannerColor(profile.banner_color || DEFAULT_BANNER_COLOR);
      setAccentColor(profile.accent_color || '');
      setAvatarPath(profile.avatar_path || null);
      setBannerPath(profile.banner_path || null);
      setAvatarColor(profile.avatar_color || null);
      setTimezone(profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
      setFavoriteGames(profile.favorite_games || []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileSyncKey]);

  // Load custom links
  React.useEffect(() => {
    if (!profile?.id) return;
    const loadLinks = async () => {
      const supabase = getBrowserClient();
      const { data } = await supabase
        .from('profile_links')
        .select('*')
        .eq('user_id', profile.id)
        .order('position', { ascending: true });
      if (data) setLinks(data);
    };
    loadLinks();
  }, [profile?.id]);

  // Check if form is dirty
  const isDirty = React.useMemo(() => {
    if (!profile) return false;
    return (
      displayName !== (profile.display_name || '') ||
      username !== (profile.username || '') ||
      pronouns !== (profile.pronouns || '') ||
      bio !== (profile.bio || '') ||
      customStatus !== (profile.custom_status || '') ||
      customStatusEmoji !== (profile.custom_status_emoji || '') ||
      presenceStatus !== (profile.status || 'online') ||
      bannerColor !== (profile.banner_color || DEFAULT_BANNER_COLOR) ||
      accentColor !== (profile.accent_color || '') ||
      avatarPath !== (profile.avatar_path || null) ||
      bannerPath !== (profile.banner_path || null) ||
      avatarColor !== (profile.avatar_color || null) ||
      timezone !== (profile.timezone || '') ||
      JSON.stringify(favoriteGames) !== JSON.stringify(profile.favorite_games || []) ||
      profileVis !== (settings?.profile_visibility || 'mutual_servers') ||
      presenceVis !== (settings?.presence_visibility || 'friends') ||
      activityVis !== (settings?.activity_visibility || 'friends') ||
      localTimeVis !== (settings?.local_time_visibility || 'friends')
    );
  }, [
    profile,
    settings,
    displayName,
    username,
    pronouns,
    bio,
    customStatus,
    customStatusEmoji,
    presenceStatus,
    bannerColor,
    accentColor,
    avatarPath,
    bannerPath,
    avatarColor,
    timezone,
    favoriteGames,
    profileVis,
    presenceVis,
    activityVis,
    localTimeVis,
  ]);

  // Debounced username availability check
  React.useEffect(() => {
    const clean = username.trim().toLowerCase();
    if (!clean || clean === profile?.username) {
      setUsernameStatus('idle');
      setUsernameMessage(null);
      return;
    }

    if (!/^[a-z0-9_.-]{3,30}$/.test(clean)) {
      setUsernameStatus('invalid');
      setUsernameMessage('Username must be 3-30 characters (letters, numbers, ., _, -).');
      return;
    }

    setUsernameStatus('checking');
    const timer = setTimeout(async () => {
      const supabase = getBrowserClient();
      const { data, error } = await supabase.rpc('check_username_available', {
        p_username: clean,
      });

      if (error) {
        setUsernameStatus('idle');
      } else if (data === true) {
        setUsernameStatus('available');
        setUsernameMessage('Username is available.');
      } else {
        setUsernameStatus('taken');
        setUsernameMessage('This username is already taken or reserved.');
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [username, profile?.username]);

  const handleReset = () => {
    if (!profile) return;
    setDisplayName(profile.display_name || '');
    setUsername(profile.username || '');
    setPronouns(profile.pronouns || '');
    setBio(profile.bio || '');
    setCustomStatus(profile.custom_status || '');
    setCustomStatusEmoji(profile.custom_status_emoji || '');
    setPresenceStatus(profile.status || 'online');
    setBannerColor(profile.banner_color || DEFAULT_BANNER_COLOR);
    setAccentColor(profile.accent_color || '');
    setAvatarPath(profile.avatar_path || null);
    setBannerPath(profile.banner_path || null);
    setAvatarColor(profile.avatar_color || null);
    setTimezone(profile.timezone || '');
    setFavoriteGames(profile.favorite_games || []);
    setProfileVis(settings?.profile_visibility || 'mutual_servers');
    setPresenceVis(settings?.presence_visibility || 'friends');
    setActivityVis(settings?.activity_visibility || 'friends');
    setLocalTimeVis(settings?.local_time_visibility || 'friends');
  };

  const handleSave = async () => {
    if (!profile) return;
    setIsSaving(true);
    const supabase = getBrowserClient();

    try {
      // 1. Unicode normalize (NFKC) display name
      const normalizedDisplayName = displayName.trim().normalize('NFKC');

      // 2. If custom status changed with expiry, call RPC
      if (statusExpiry > 0 || customStatusEmoji || customStatus) {
        await supabase.rpc('set_custom_status', {
          p_emoji: customStatusEmoji || null,
          p_text: customStatus || null,
          p_duration_minutes: statusExpiry > 0 ? statusExpiry : null,
        });
      }

      // 3. Save profile attributes
      const { error: profileErr } = await updateProfile({
        display_name: normalizedDisplayName,
        username: username.trim().toLowerCase(),
        pronouns: pronouns.trim() || null,
        bio: bio.trim() || null,
        custom_status: customStatus.trim() || null,
        custom_status_emoji: customStatusEmoji.trim() || null,
        status: presenceStatus,
        banner_color: bannerColor,
        accent_color: accentColor.trim() || null,
        avatar_path: avatarPath,
        banner_path: bannerPath,
        avatar_color: avatarColor,
        timezone: timezone || null,
        favorite_games: favoriteGames,
      });

      if (profileErr) throw new Error(profileErr);

      // 4. Save privacy settings
      await updateSettings({
        profile_visibility: profileVis,
        presence_visibility: presenceVis,
        activity_visibility: activityVis,
        local_time_visibility: localTimeVis,
      });

      // 5. Save links
      await supabase.from('profile_links').delete().eq('user_id', profile.id);
      if (links.length > 0) {
        await supabase.from('profile_links').insert(
          links.map((l, idx) => ({
            user_id: profile.id,
            label: l.label,
            url: l.url,
            position: idx,
          }))
        );
      }

      toast({
        title: 'Profile Saved',
        description: 'Your profile customization and privacy settings are updated.',
        type: 'success',
      });
    } catch (err: any) {
      toast({
        title: 'Save Failed',
        description: err?.message || 'Could not save profile changes.',
        type: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddGameChip = () => {
    const trimmed = newGameInput.trim();
    if (!trimmed || favoriteGames.includes(trimmed)) return;
    if (favoriteGames.length >= 6) {
      toast({ title: 'Limit Reached', description: 'Up to 6 interests allowed.', type: 'info' });
      return;
    }
    setFavoriteGames([...favoriteGames, trimmed]);
    setNewGameInput('');
  };

  const handleRemoveGameChip = (idx: number) => {
    setFavoriteGames(favoriteGames.filter((_, i) => i !== idx));
  };

  // Compute live preview fields according to selected perspective
  const previewIsRestricted = previewPerspective === 'stranger' && profileVis !== 'everyone';

  return (
    <div className="space-y-6 max-w-6xl w-full pb-24">
      {/* Top Header & Section Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">Profile & Identity</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Customize your global identity, server profiles, and privacy preferences.
          </p>
        </div>

        {/* Section Navigation Tabs */}
        <div className="flex items-center gap-1 bg-surface-default p-1 rounded-2xl border border-border">
          <button
            type="button"
            onClick={() => setActiveSection('user')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeSection === 'user'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>User Profile</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('server')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeSection === 'server'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Server Profiles</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('privacy')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeSection === 'privacy'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Privacy</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Grid (Editor Left, Live Preview Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN: EDITORS */}
        <div className="lg:col-span-7 space-y-6">
          {activeSection === 'user' && (
            <div className="space-y-6">
              {/* Identity Details */}
              <div className="p-5 rounded-2xl bg-surface-default border border-border space-y-4">
                <h4 className="text-sm font-bold text-foreground">Identity</h4>

                {/* Display Name */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-foreground">Display Name</label>
                    <span className="text-[11px] text-muted-foreground">{displayName.length}/40</span>
                  </div>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your visible display name"
                    maxLength={40}
                    className="text-xs"
                  />
                </div>

                {/* Username */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-foreground">Username</label>
                    <span className="text-[11px] text-muted-foreground">{username.length}/30</span>
                  </div>
                  <div className="relative">
                    <Input
                      value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase())}
                      placeholder="handle"
                      maxLength={30}
                      className="text-xs font-mono pr-8"
                    />
                    <div className="absolute right-2.5 top-2.5">
                      {usernameStatus === 'checking' && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                      {usernameStatus === 'available' && <Check className="w-3.5 h-3.5 text-success" />}
                      {(usernameStatus === 'taken' || usernameStatus === 'invalid') && (
                        <AlertCircle className="w-3.5 h-3.5 text-danger" />
                      )}
                    </div>
                  </div>
                  {usernameMessage && (
                    <p
                      className={`text-[11px] ${
                        usernameStatus === 'available' ? 'text-success' : 'text-danger'
                      }`}
                    >
                      {usernameMessage}
                    </p>
                  )}
                </div>

                {/* Pronouns */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-foreground">Pronouns</label>
                    <span className="text-[11px] text-muted-foreground">{pronouns.length}/40</span>
                  </div>
                  <Input
                    value={pronouns}
                    onChange={(e) => setPronouns(e.target.value)}
                    placeholder="e.g. they/them, she/her, he/him"
                    maxLength={40}
                    className="text-xs"
                  />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {PRONOUN_SUGGESTIONS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPronouns(p)}
                        className="px-2 py-0.5 rounded-full bg-muted hover:bg-surface-hover text-[11px] text-muted-foreground transition-colors border border-border"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {/* About Me / Bio */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-foreground">About Me</label>
                    <span className="text-[11px] text-muted-foreground">{bio.length}/500</span>
                  </div>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell others a bit about yourself..."
                    maxLength={500}
                    rows={4}
                    className="w-full text-xs p-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none resize-none"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Supports formatting: **bold**, *italic*, `code`, and https links.
                  </p>
                </div>
              </div>

              {/* Media: Avatar & Banner */}
              <div className="p-5 rounded-2xl bg-surface-default border border-border space-y-4">
                <h4 className="text-sm font-bold text-foreground">Visuals</h4>

                {/* Avatar actions */}
                <div className="flex items-center gap-4">
                  <Avatar
                    src={avatarPath || profile?.avatar_url}
                    name={displayName || 'User'}
                    size={64}
                    avatarColor={avatarColor}
                  />
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold text-foreground">Profile Avatar</div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setCropType('avatar')}
                        className="text-xs h-8 gap-1.5"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Upload & Crop
                      </Button>
                      {avatarPath && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setAvatarPath(null);
                            setAvatarColor(null);
                          }}
                          className="text-xs h-8 text-danger hover:text-danger hover:bg-danger/10"
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1" />
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Banner & Colors */}
                <div className="space-y-3 pt-2 border-t border-border/60">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-foreground">Profile Banner</label>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setCropType('banner')}
                        className="text-xs h-7 gap-1"
                      >
                        <Upload className="w-3 h-3" />
                        Upload Banner
                      </Button>
                      {bannerPath && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setBannerPath(null)}
                          className="text-xs h-7 px-2 text-danger"
                          title="Remove banner image"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Banner Color Presets */}
                  <div className="space-y-2">
                    <span className="text-[11px] text-muted-foreground">Banner Color</span>
                    <div className="flex flex-wrap items-center gap-2">
                      {PROFILE_BANNER_PRESETS.map((preset) => (
                        <button
                          key={preset.color}
                          type="button"
                          onClick={() => setBannerColor(preset.color)}
                          className={`w-7 h-7 rounded-lg border transition-transform ${
                            bannerColor === preset.color ? 'ring-2 ring-primary scale-110' : 'hover:scale-105'
                          }`}
                          style={{ backgroundColor: preset.color }}
                          title={preset.name}
                          aria-label={`Select color ${preset.name}`}
                        />
                      ))}
                      {avatarColor && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setBannerColor(avatarColor)}
                          className="text-xs h-7 gap-1 px-2 text-[11px]"
                        >
                          <Sparkles className="w-3 h-3 text-warning" />
                          Use Avatar Color
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Status & Presence */}
              <div className="p-5 rounded-2xl bg-surface-default border border-border space-y-4">
                <h4 className="text-sm font-bold text-foreground">Status & Presence</h4>

                {/* Custom Status */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground">Custom Status</label>
                  <div className="flex gap-2">
                    <Input
                      value={customStatusEmoji}
                      onChange={(e) => setCustomStatusEmoji(e.target.value)}
                      placeholder="Emoji"
                      maxLength={4}
                      className="text-xs w-20 text-center"
                    />
                    <Input
                      value={customStatus}
                      onChange={(e) => setCustomStatus(e.target.value)}
                      placeholder="What are you up to?"
                      maxLength={128}
                      className="text-xs flex-1"
                    />
                  </div>

                  {/* Expiry Selector */}
                  <div className="flex items-center gap-2 pt-1">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground">Clear after:</span>
                    <select
                      value={statusExpiry}
                      onChange={(e) => setStatusExpiry(Number(e.target.value))}
                      className="text-xs bg-background border border-border rounded-lg px-2 py-1 focus:ring-1 focus:ring-primary"
                    >
                      {STATUS_EXPIRY_OPTIONS.map((opt) => (
                        <option key={opt.minutes} value={opt.minutes}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Presence Status */}
                <div className="space-y-2 pt-2 border-t border-border/60">
                  <label className="text-xs font-semibold text-foreground">Online Status</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {PRESENCE_OPTIONS.map((opt) => (
                      <button
                        key={opt.status}
                        type="button"
                        onClick={() => setPresenceStatus(opt.status)}
                        className={`p-2 rounded-xl border text-left text-xs transition-colors ${
                          presenceStatus === opt.status
                            ? 'bg-primary/10 border-primary text-foreground'
                            : 'bg-background hover:bg-surface-hover border-border text-muted-foreground'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-semibold">
                          <span className={`w-2 h-2 rounded-full ${opt.color}`} />
                          <span>{opt.label}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Interests & Links */}
              <div className="p-5 rounded-2xl bg-surface-default border border-border space-y-4">
                <h4 className="text-sm font-bold text-foreground">Interests & Custom Links</h4>

                {/* Favorite Game Chips */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground">
                    Favorite Games / Interests ({favoriteGames.length}/6)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {favoriteGames.map((game, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted text-xs font-medium text-foreground border border-border"
                      >
                        <span>{game}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveGameChip(idx)}
                          className="hover:text-danger text-muted-foreground ml-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  {favoriteGames.length < 6 && (
                    <div className="flex gap-2 pt-1">
                      <Input
                        value={newGameInput}
                        onChange={(e) => setNewGameInput(e.target.value)}
                        placeholder="Add an interest or favorite title"
                        className="text-xs h-8"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddGameChip();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleAddGameChip}
                        className="h-8 text-xs"
                      >
                        Add
                      </Button>
                    </div>
                  )}
                </div>

                {/* Custom Links Editor */}
                <div className="pt-2 border-t border-border/60">
                  <LinksEditor links={links} onChange={setLinks} />
                </div>
              </div>
            </div>
          )}

          {activeSection === 'server' && (
            <ServerProfileEditor servers={servers} />
          )}

          {activeSection === 'privacy' && (
            <div className="p-5 rounded-2xl bg-surface-default border border-border space-y-5">
              <div>
                <h4 className="text-sm font-bold text-foreground">Audience Privacy Controls</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Every privacy rule is enforced directly in the database.
                </p>
              </div>

              {/* Profile Details Audience */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Profile Details (Bio, Links, Pronouns)</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['everyone', 'mutual_servers', 'friends', 'nobody'] as VisibilityAudience[]).map((aud) => (
                    <button
                      key={aud}
                      type="button"
                      onClick={() => setProfileVis(aud)}
                      className={`p-2 rounded-xl border text-left text-xs capitalize ${
                        profileVis === aud
                          ? 'bg-primary/10 border-primary font-semibold text-foreground'
                          : 'bg-background hover:bg-surface-hover border-border text-muted-foreground'
                      }`}
                    >
                      {aud.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status & Presence Audience */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Status & Presence</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['everyone', 'mutual_servers', 'friends', 'nobody'] as VisibilityAudience[]).map((aud) => (
                    <button
                      key={aud}
                      type="button"
                      onClick={() => setPresenceVis(aud)}
                      className={`p-2 rounded-xl border text-left text-xs capitalize ${
                        presenceVis === aud
                          ? 'bg-primary/10 border-primary font-semibold text-foreground'
                          : 'bg-background hover:bg-surface-hover border-border text-muted-foreground'
                      }`}
                    >
                      {aud.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Activity Audience */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Rich Presence Activity</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['everyone', 'mutual_servers', 'friends', 'nobody'] as VisibilityAudience[]).map((aud) => (
                    <button
                      key={aud}
                      type="button"
                      onClick={() => setActivityVis(aud)}
                      className={`p-2 rounded-xl border text-left text-xs capitalize ${
                        activityVis === aud
                          ? 'bg-primary/10 border-primary font-semibold text-foreground'
                          : 'bg-background hover:bg-surface-hover border-border text-muted-foreground'
                      }`}
                    >
                      {aud.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Local Time Audience */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Local Time</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['everyone', 'mutual_servers', 'friends', 'nobody'] as VisibilityAudience[]).map((aud) => (
                    <button
                      key={aud}
                      type="button"
                      onClick={() => setLocalTimeVis(aud)}
                      className={`p-2 rounded-xl border text-left text-xs capitalize ${
                        localTimeVis === aud
                          ? 'bg-primary/10 border-primary font-semibold text-foreground'
                          : 'bg-background hover:bg-surface-hover border-border text-muted-foreground'
                      }`}
                    >
                      {aud.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: MULTI-STATE LIVE PREVIEW */}
        <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-4">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Live Preview</span>
          </div>
          {/* Preview Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-2xl bg-surface-default border border-border">
            {/* Mode switch */}
            <div className="flex items-center gap-1 bg-muted p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setPreviewMode('card')}
                className={`px-2 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  previewMode === 'card' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                Card
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode('message')}
                className={`px-2 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  previewMode === 'message' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                Message
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode('member')}
                className={`px-2 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  previewMode === 'member' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                Member
              </button>
            </div>

            {/* Light / Dark Preview Switch */}
            <button
              type="button"
              onClick={() => setPreviewTheme(previewTheme === 'dark' ? 'light' : 'dark')}
              className="p-1.5 rounded-xl border border-border bg-card text-foreground hover:bg-surface-hover transition-colors"
              title="Toggle preview light/dark theme"
            >
              {previewTheme === 'dark' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5 text-warning" />}
            </button>

            {/* Perspective Selector */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Eye className="w-3 h-3 ml-1" />
              <select
                value={previewPerspective}
                onChange={(e) => setPreviewPerspective(e.target.value as any)}
                className="bg-transparent text-xs font-medium text-foreground focus:outline-none"
              >
                <option value="friend">View as: Friend</option>
                <option value="stranger">View as: Stranger</option>
                <option value="member">View as: Server Member</option>
              </select>
            </div>
          </div>

          {/* Render Preview Context */}
          <div className={previewTheme === 'light' ? 'light' : ''} data-theme={previewTheme}>
            <div className={cn(
              "p-4 rounded-3xl border shadow-xl flex justify-center transition-colors duration-200",
              previewTheme === 'light' ? "bg-slate-100 border-slate-300 text-slate-900" : "bg-background border-border text-foreground"
            )}>
              {previewMode === 'card' && (
                <div className={cn(
                  "w-full max-w-sm rounded-2xl border overflow-hidden shadow-lg transition-colors duration-200",
                  previewTheme === 'light' ? "bg-white border-slate-200 text-slate-900" : "bg-card border-border text-foreground"
                )}>
                  {/* Banner */}
                  <ProfileBanner
                    bannerPath={previewIsRestricted ? null : bannerPath}
                    bannerColor={previewIsRestricted ? '#3b82f6' : bannerColor}
                    accentColor={previewIsRestricted ? null : accentColor}
                  />

                  {/* Body */}
                  <div className="px-5 pb-5 pt-0 -mt-10 space-y-3">
                    <Avatar
                      src={avatarPath || profile?.avatar_url}
                      name={displayName || 'User'}
                      status={presenceStatus}
                      showStatus
                      size={80}
                      avatarColor={avatarColor}
                      className={cn(
                        "border-4 shadow-lg",
                        previewTheme === 'light' ? "border-white bg-white" : "border-card bg-card"
                      )}
                    />

                    <div>
                      <UserName displayName={displayName || 'User'} pronouns={previewIsRestricted ? null : pronouns} size="lg" />
                      <div className="text-xs text-muted-foreground font-mono">@{username || 'handle'}</div>
                    </div>

                    {(customStatus || customStatusEmoji) && !previewIsRestricted && (
                      <CustomStatusLine emoji={customStatusEmoji} text={customStatus} />
                    )}

                    {!previewIsRestricted && bio ? (
                      <AboutMeFormatted content={bio} />
                    ) : previewIsRestricted ? (
                      <div className="p-3 rounded-xl bg-muted/40 border border-border/50 text-xs text-muted-foreground">
                        This user has restricted their profile details.
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              {previewMode === 'message' && (
                <div className={cn(
                  "w-full max-w-sm p-3 rounded-2xl border flex gap-3 items-start transition-colors duration-200",
                  previewTheme === 'light' ? "bg-white border-slate-200 text-slate-900" : "bg-card border-border"
                )}>
                  <Avatar
                    src={avatarPath || profile?.avatar_url}
                    name={displayName || 'User'}
                    size={40}
                    avatarColor={avatarColor}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <UserName displayName={displayName || 'User'} size="sm" />
                      <span className="text-[10px] text-muted-foreground">Today at 12:45 PM</span>
                    </div>
                    <p className={cn("text-xs mt-1", previewTheme === 'light' ? "text-slate-800" : "text-foreground/90")}>
                      Ready for the upcoming tournament match! Let&apos;s party up.
                    </p>
                  </div>
                </div>
              )}

              {previewMode === 'member' && (
                <div className={cn(
                  "w-full max-w-sm p-2 rounded-2xl border flex items-center justify-between transition-colors duration-200",
                  previewTheme === 'light' ? "bg-white border-slate-200 text-slate-900" : "bg-card border-border"
                )}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar
                      src={avatarPath || profile?.avatar_url}
                      name={displayName || 'User'}
                      status={presenceStatus}
                      showStatus
                      size={32}
                      avatarColor={avatarColor}
                    />
                    <div className="min-w-0">
                      <UserName displayName={displayName || 'User'} size="sm" />
                      {(customStatus || customStatusEmoji) && (
                        <div className="text-[11px] text-muted-foreground truncate">
                          {customStatusEmoji} {customStatus}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* STICKY UNSAVED CHANGES BAR */}
      {isDirty && (
        <div className="fixed bottom-4 inset-x-4 max-w-2xl mx-auto p-3.5 rounded-2xl bg-card/95 backdrop-blur-md border border-border shadow-2xl flex items-center justify-between z-50 animate-in slide-in-from-bottom-5 duration-200">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
            <span>Careful — you have unsaved changes!</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleReset}
              disabled={isSaving}
              className="text-xs h-8"
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              Reset
            </Button>
            <Button
              type="button"
              size="sm"
              variant="primary"
              onClick={handleSave}
              disabled={isSaving}
              className="text-xs h-8 gap-1.5"
            >
              {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Save Changes
            </Button>
          </div>
        </div>
      )}

      {/* Image Crop Dialog */}
      {cropType && (
        <ImageCropDialog
          open={Boolean(cropType)}
          onOpenChange={(op) => !op && setCropType(null)}
          type={cropType}
          onCropComplete={async (result: ProcessedImageResult) => {
            const supabase = getBrowserClient();
            if (!profile?.id) return;

            const bucket = 'avatars';
            const objectPath = `${profile.id}/${cropType}_${Date.now()}.webp`;

            const { error: uploadErr } = await supabase.storage
              .from(bucket)
              .upload(objectPath, result.blob, {
                contentType: 'image/webp',
                upsert: true,
              });

            if (uploadErr) {
              toast({
                title: 'Upload Failed',
                description: uploadErr.message,
                type: 'error',
              });
              return;
            }

            if (cropType === 'avatar') {
              setAvatarPath(objectPath);
              setAvatarColor(result.dominantColor);
            } else {
              setBannerPath(objectPath);
            }

            toast({
              title: `${cropType === 'avatar' ? 'Avatar' : 'Banner'} Staged`,
              description: 'Save changes to update your profile.',
              type: 'info',
            });
          }}
        />
      )}
    </div>
  );
}
