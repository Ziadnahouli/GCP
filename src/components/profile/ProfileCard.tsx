'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { ProfileCardData } from '@/lib/types/profile';
import { fetchProfileCard } from '@/lib/profiles/profile-store';
import { ProfileBanner } from './ProfileBanner';
import { UserName } from './UserName';
import { CustomStatusLine } from './CustomStatusLine';
import { ActivityLine } from './ActivityLine';
import { AboutMeFormatted } from './AboutMeFormatted';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import {
  MessageSquare,
  UserPlus,
  UserCheck,
  ShieldAlert,
  Clock,
  Calendar,
  Layers,
  Users,
  Copy,
  ExternalLink,
  Lock,
  Edit2,
  RefreshCw,
} from 'lucide-react';

export interface ProfileCardProps {
  userId: string;
  serverId?: string | null;
  onClose?: () => void;
  onOpenSettings?: () => void;
  onOpenDirectMessage?: (conversationId: string) => void;
  className?: string;
}

export const ProfileCard: React.FC<ProfileCardProps> = ({
  userId,
  serverId,
  onClose,
  onOpenSettings,
  onOpenDirectMessage,
  className,
}) => {
  const { toast } = useToast();
  const [data, setData] = React.useState<ProfileCardData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [copiedField, setCopiedField] = React.useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const card = await fetchProfileCard(userId, serverId);
      if (!card) {
        setError('Profile unavailable or user not found');
      } else {
        setData(card);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load profile');
    } finally {
      setIsLoading(false);
    }
  }, [userId, serverId]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    toast({
      title: 'Copied to Clipboard',
      description: `${label} copied: ${text}`,
      type: 'info',
      duration: 2000,
    });
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Format local time from target user's timezone if available
  const localTime = React.useMemo(() => {
    if (!data?.timezone) return null;
    try {
      return new Intl.DateTimeFormat([], {
        timeZone: data.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date());
    } catch {
      return null;
    }
  }, [data?.timezone]);

  // Format Member Since date
  const memberSince = React.useMemo(() => {
    if (!data?.created_at) return null;
    try {
      return new Intl.DateTimeFormat([], {
        month: 'short',
        year: 'numeric',
      }).format(new Date(data.created_at));
    } catch {
      return null;
    }
  }, [data?.created_at]);

  // Format Server Joined date
  const joinedServer = React.useMemo(() => {
    if (!data?.server_joined_at) return null;
    try {
      return new Intl.DateTimeFormat([], {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date(data.server_joined_at));
    } catch {
      return null;
    }
  }, [data?.server_joined_at]);

  if (isLoading) {
    return (
      <div className={cn('w-80 sm:w-96 rounded-2xl bg-card border border-border overflow-hidden shadow-2xl p-0', className)}>
        <Skeleton className="w-full h-28 sm:h-32 rounded-none" />
        <div className="p-4 space-y-3 -mt-12">
          <Skeleton className="w-20 h-20 rounded-full border-4 border-card" />
          <div className="space-y-1.5 pt-1">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3.5 w-24" />
          </div>
          <Skeleton className="h-16 w-full rounded-xl" />
          <div className="flex gap-2">
            <Skeleton className="h-9 flex-1 rounded-xl" />
            <Skeleton className="h-9 flex-1 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={cn('w-80 sm:w-96 rounded-2xl bg-card border border-border p-6 text-center space-y-4 shadow-2xl', className)}>
        <div className="w-12 h-12 mx-auto rounded-full bg-danger/10 text-danger flex items-center justify-center">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-foreground">Profile Unavailable</h4>
          <p className="text-xs text-muted-foreground">{error || 'This profile could not be loaded.'}</p>
        </div>
        <Button size="sm" variant="outline" onClick={loadData} className="gap-2">
          <RefreshCw className="w-3.5 h-3.5" />
          Try Again
        </Button>
      </div>
    );
  }

  const effectiveAvatar = data.effective_avatar_path || data.avatar_path || data.avatar_url;
  const isPrivate = !data.is_self && !data.effective_bio && !data.effective_banner_path && !data.banner_color;

  return (
    <div
      className={cn(
        'w-80 sm:w-96 rounded-2xl bg-card border border-border overflow-hidden shadow-2xl text-card-foreground flex flex-col',
        className
      )}
      style={
        data.profile_theme?.primary
          ? ({ '--profile-primary': data.profile_theme.primary } as React.CSSProperties)
          : undefined
      }
    >
      {/* Banner */}
      <ProfileBanner
        bannerPath={data.effective_banner_path || data.banner_path}
        bannerUrl={data.banner_url}
        bannerColor={data.banner_color || '#3b82f6'}
        accentColor={data.accent_color}
      />

      {/* Profile Header (Avatar overlap & quick actions) */}
      <div className="px-5 pb-5 pt-0 flex-1 space-y-4 -mt-10 relative">
        <div className="flex items-end justify-between gap-3">
          <div className="relative group/avatar">
            <Avatar
              src={effectiveAvatar}
              name={data.effective_display_name || data.display_name}
              status={data.status}
              showStatus
              size={80}
              avatarColor={data.avatar_color}
              decorationUrl={
                data.decoration_id
                  ? `/decorations/${data.decoration_id}.png`
                  : undefined
              }
              className="border-4 border-card shadow-lg bg-card"
            />
          </div>

          {/* Action Row */}
          <div className="flex items-center gap-1.5 pb-1">
            {data.is_self ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (onOpenSettings) onOpenSettings();
                  if (onClose) onClose();
                }}
                className="gap-1.5 text-xs h-8 rounded-xl font-medium"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Edit Profile
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    toast({
                      title: 'Direct Message',
                      description: `Opening chat with @${data.username}`,
                      type: 'info',
                    });
                    if (onClose) onClose();
                  }}
                  className="gap-1.5 text-xs h-8 rounded-xl font-medium"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Message
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    toast({
                      title: 'Friend Request',
                      description: `Friend request sent to @${data.username}`,
                      type: 'success',
                    });
                  }}
                  className="text-xs h-8 rounded-xl font-medium px-2.5"
                  title={data.is_friend ? 'Friends' : 'Add Friend'}
                >
                  {data.is_friend ? (
                    <UserCheck className="w-3.5 h-3.5 text-success" />
                  ) : (
                    <UserPlus className="w-3.5 h-3.5" />
                  )}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Identity & Usernames */}
        <div className="space-y-1">
          <UserName
            displayName={data.effective_display_name}
            pronouns={data.effective_pronouns || data.pronouns}
            badges={data.badges}
            size="lg"
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
            <span>@{data.username}</span>
            {data.server_nickname && (
              <span className="text-[11px] font-sans text-muted-foreground/80 italic">
                (aka {data.display_name})
              </span>
            )}
            <button
              type="button"
              onClick={() => copyToClipboard(data.username, 'Username')}
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
              title="Copy username"
            >
              <Copy className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Custom Status */}
        {(data.custom_status || data.custom_status_emoji) && (
          <CustomStatusLine
            emoji={data.custom_status_emoji}
            text={data.custom_status}
          />
        )}

        {/* Rich Presence Activity */}
        {data.activity_text && (
          <ActivityLine activityText={data.activity_text} />
        )}

        {/* Divider */}
        <div className="h-px bg-border/60" />

        {/* About Me Section */}
        {data.effective_bio ? (
          <div className="space-y-1.5">
            <h5 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground select-none">
              About Me
            </h5>
            <AboutMeFormatted content={data.effective_bio} />
          </div>
        ) : isPrivate ? (
          <div className="p-3 rounded-xl bg-muted/40 border border-border/50 text-xs text-muted-foreground flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 shrink-0 text-muted-foreground/70" />
            <span>This user has restricted their profile details.</span>
          </div>
        ) : null}

        {/* Favorite Game Chips */}
        {data.favorite_games && data.favorite_games.length > 0 && (
          <div className="space-y-1.5">
            <h5 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground select-none">
              Interests & Games
            </h5>
            <div className="flex flex-wrap gap-1.5">
              {data.favorite_games.map((game, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded-md bg-muted text-foreground text-xs font-medium border border-border/50"
                >
                  {game}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Custom Profile Links */}
        {!isPrivate && !data.is_blocked && data.links && data.links.length > 0 && (
          <div className="space-y-1.5">
            <h5 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground select-none">
              Links
            </h5>
            <div className="grid grid-cols-1 gap-1">
              {data.links.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-2 rounded-xl bg-surface-default hover:bg-surface-hover border border-border text-xs text-foreground group/link transition-colors"
                >
                  <span className="font-medium truncate">{link.label}</span>
                  <ExternalLink className="w-3 h-3 text-muted-foreground group-hover/link:text-primary transition-colors shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Metadata Footer: Member Since, Server Role, Local Time */}
        <div className="pt-2 border-t border-border/60 space-y-2 text-xs text-muted-foreground">
          <div className="grid grid-cols-2 gap-2">
            {memberSince && (
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
                <span className="truncate">Since {memberSince}</span>
              </div>
            )}
            {localTime && (
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
                <span className="truncate">Local time {localTime}</span>
              </div>
            )}
          </div>

          {/* Mutuals Summary */}
          {!data.is_self && (
            <div className="flex items-center gap-4 pt-1 text-[11px] text-muted-foreground/90">
              <span className="flex items-center gap-1">
                <Layers className="w-3 h-3" />
                {data.mutual_servers_count} mutual {data.mutual_servers_count === 1 ? 'server' : 'servers'}
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {data.mutual_friends_count} mutual {data.mutual_friends_count === 1 ? 'friend' : 'friends'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

