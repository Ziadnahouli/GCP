'use client';

import * as React from 'react';
import {
  ArrowLeft,
  Phone,
  Video,
  Search,
  Pin,
  Sparkles,
  Users,
  Settings,
  X,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { ProfileCardTrigger } from '@/components/profile/ProfileCardTrigger';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserStatus } from '@/lib/types/profile';
import { Conversation } from '@/lib/types/messaging';
import { useUserPresence } from '@/features/presence/presence-context';

interface ChatHeaderProps {
  conversation: Conversation | null;
  currentUserId?: string;
  getUserStatus?: (userId?: string) => UserStatus;
  showSearch: boolean;
  onToggleSearch: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  showPinnedOnly: boolean;
  onTogglePinnedOnly: () => void;
  onVoiceCall: () => void;
  onVideoCall: () => void;
  onOpenSoundboard: () => void;
  onOpenGroupSettings?: () => void;
  onBack?: () => void;
}

export function ChatHeader({
  conversation,
  currentUserId,
  getUserStatus,
  showSearch,
  onToggleSearch,
  searchQuery,
  onSearchChange,
  showPinnedOnly,
  onTogglePinnedOnly,
  onVoiceCall,
  onVideoCall,
  onOpenSoundboard,
  onOpenGroupSettings,
  onBack,
}: ChatHeaderProps) {
  const isGroup = conversation?.type === 'group';
  const otherMember = conversation?.members?.find((m) => m.user_id !== currentUserId)?.profile;
  const otherMemberId = otherMember?.id || conversation?.members?.find((m) => m.user_id !== currentUserId)?.user_id;

  const title = isGroup
    ? conversation?.name || 'Group conversation'
    : otherMember?.display_name || 'Direct conversation';

  const username = otherMember?.username;
  const directPresence = useUserPresence(otherMemberId);
  const liveStatus = getUserStatus ? getUserStatus(otherMemberId) : directPresence;

  return (
    <header className="h-[52px] min-h-[52px] border-b border-border px-3 sm:px-4 flex items-center justify-between shrink-0 bg-background select-none z-10">
      {/* Left: Back (Mobile) + Avatar + Name */}
      <div className="flex items-center gap-2.5 min-w-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="md:hidden p-1.5 rounded-control text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors -ml-1 shrink-0"
            aria-label="Back to conversations"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}

        <div className="relative shrink-0">
          {isGroup ? (
            <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center text-muted-foreground">
              <Users className="w-4 h-4" />
            </div>
          ) : (
            <ProfileCardTrigger userId={otherMember?.id}>
              <Avatar
                src={(otherMember as any)?.avatar_path || otherMember?.avatar_url}
                name={title}
                status={liveStatus}
                showStatus
                size="32"
                className="cursor-pointer hover:opacity-90 transition-opacity"
              />
            </ProfileCardTrigger>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {!isGroup ? (
              <ProfileCardTrigger userId={otherMember?.id}>
                <h1 className="text-sm font-semibold tracking-tight text-foreground truncate hover:text-primary cursor-pointer transition-colors">
                  {title}
                </h1>
              </ProfileCardTrigger>
            ) : (
              <h1 className="text-sm font-semibold tracking-tight text-foreground truncate">
                {title}
              </h1>
            )}
            {username && (
              <span className="hidden sm:inline text-xs text-muted-foreground truncate">
                @{username}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate leading-tight">
            {isGroup ? (
              <span>{conversation?.members?.length || 0} members</span>
            ) : otherMember?.custom_status ? (
              <span>{otherMember.custom_status}</span>
            ) : otherMember?.game_activity ? (
              <span className="text-primary font-medium">Playing {otherMember.game_activity}</span>
            ) : (
              <span className="capitalize">{liveStatus}</span>
            )}
          </div>
        </div>
      </div>

      {/* Right: Actions (Call, Video, Search, Pins, Soundboard, Settings) */}
      <div className="flex items-center gap-1 shrink-0">
        {showSearch ? (
          <div className="relative flex items-center animate-in fade-in duration-fast">
            <Input
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search conversation..."
              className="h-8 w-44 sm:w-56 text-xs pl-7 pr-7"
              autoFocus
            />
            <Search className="w-3.5 h-3.5 absolute left-2 text-muted-foreground pointer-events-none" />
            <button
              type="button"
              onClick={onToggleSearch}
              className="absolute right-2 text-muted-foreground hover:text-foreground"
              aria-label="Close search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onToggleSearch}
            className="w-8 h-8 rounded-control flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
            title="Search conversation"
            aria-label="Search conversation"
          >
            <Search className="w-4 h-4" />
          </button>
        )}

        <button
          type="button"
          onClick={onVoiceCall}
          className="w-8 h-8 rounded-control flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
          title="Start voice call"
          aria-label="Start voice call"
        >
          <Phone className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onVideoCall}
          className="w-8 h-8 rounded-control flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
          title="Start video call"
          aria-label="Start video call"
        >
          <Video className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onTogglePinnedOnly}
          className={`w-8 h-8 rounded-control flex items-center justify-center transition-colors ${showPinnedOnly
              ? 'bg-primary-subtle text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
            }`}
          title={showPinnedOnly ? 'Show all messages' : 'Show pinned messages'}
          aria-label="Toggle pinned messages"
        >
          <Pin className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onOpenSoundboard}
          className="w-8 h-8 rounded-control flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
          title="Soundboard"
          aria-label="Soundboard"
        >
          <Sparkles className="w-4 h-4" />
        </button>

        {isGroup && onOpenGroupSettings && (
          <button
            type="button"
            onClick={onOpenGroupSettings}
            className="w-8 h-8 rounded-control flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
            title="Group settings"
            aria-label="Group settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
}
