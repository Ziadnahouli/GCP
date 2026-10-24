'use client';

import * as React from 'react';
import {
  Zap,
  Check,
  Save,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/features/auth/auth-provider';
import { UserProfile, UserStatus } from '@/lib/types/profile';
import { Avatar } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

export const PRESET_BANNERS = [
  { name: 'Cosmic Violet', color: '#7c3aed' },
  { name: 'Cyber Cyan', color: '#0284c7' },
  { name: 'Emerald Ops', color: '#059669' },
  { name: 'Crimson Flare', color: '#e11d48' },
  { name: 'Solar Gold', color: '#d97706' },
  { name: 'Obsidian Zinc', color: '#27272a' },
];

export const PRESENCE_OPTIONS: { status: UserStatus; label: string; desc: string; color: string; border: string }[] = [
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

export function ProfileTab() {
  const { profile, updateProfile } = useAuth();
  const { toast } = useToast();

  const [displayName, setDisplayName] = React.useState(profile?.display_name || '');
  const [username, setUsername] = React.useState(profile?.username || '');
  const [bio, setBio] = React.useState(profile?.bio || '');
  const [customStatus, setCustomStatus] = React.useState(profile?.custom_status || '');
  const [bannerColor, setBannerColor] = React.useState(profile?.banner_color || '#7c3aed');
  const [avatarUrl, setAvatarUrl] = React.useState(profile?.avatar_url || '');
  const [presenceStatus, setPresenceStatus] = React.useState<UserStatus>(profile?.status || 'online');
  const [isSaving, setIsSaving] = React.useState(false);

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
  }, [profile]);

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

  return (
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
  );
}
