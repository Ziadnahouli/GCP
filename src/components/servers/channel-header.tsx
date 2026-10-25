'use client';

import * as React from 'react';
import {
  Hash,
  Volume2,
  Users,
  Search,
  Sparkles,
  X,
  ArrowLeft,
  MessageSquare,
  UserPlus,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Server, Channel } from '@/lib/types/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChannelHeaderProps {
  server: Server;
  channel: Channel;
  isVoiceConnected: boolean;
  isConnectingVoice: boolean;
  canUseSoundboard: boolean;
  showMembers: boolean;
  onToggleMembers: () => void;
  showVoiceChat: boolean;
  onToggleVoiceChat: () => void;
  onOpenInvite: () => void;
  onOpenSoundboard: () => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
}

export function ChannelHeader({
  server,
  channel,
  isVoiceConnected,
  isConnectingVoice,
  canUseSoundboard,
  showMembers,
  onToggleMembers,
  showVoiceChat,
  onToggleVoiceChat,
  onOpenInvite,
  onOpenSoundboard,
  searchQuery,
  onSearchQueryChange,
}: ChannelHeaderProps) {
  const router = useRouter();
  const [showSearchInput, setShowSearchInput] = React.useState(false);
  const isVoiceChannel = channel.type === 'voice';

  return (
    <header className="h-[52px] min-h-[52px] border-b border-border px-3.5 flex items-center justify-between shrink-0 bg-surface-sidebar select-none z-10">
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          onClick={() => router.push('/')}
          className="p-1 -ml-1 text-muted-foreground hover:text-foreground hover:bg-surface-hover rounded-control transition-colors flex items-center"
          title="Back to direct messages"
          aria-label="Back to direct messages"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-1.5 min-w-0">
          {isVoiceChannel ? (
            <Volume2 className="w-4 h-4 text-primary shrink-0" />
          ) : (
            <Hash className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
          <h2 className="font-semibold text-body text-foreground truncate">
            {channel.name}
          </h2>
        </div>

        {isVoiceChannel ? (
          <Badge
            variant={isVoiceConnected ? 'accent' : isConnectingVoice ? 'warning' : 'outline'}
            className="hidden sm:inline-flex items-center gap-1.5 text-meta px-2 py-0.5"
          >
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                isVoiceConnected
                  ? 'bg-status-online'
                  : isConnectingVoice
                  ? 'bg-status-idle animate-pulse'
                  : 'bg-status-offline'
              )}
            />
            <span>
              {isVoiceConnected
                ? 'Connected'
                : isConnectingVoice
                ? 'Connecting...'
                : 'Voice lounge'}
            </span>
          </Badge>
        ) : (
          channel.topic && (
            <>
              <span className="w-1 h-1 rounded-full bg-border shrink-0 hidden sm:inline-block" />
              <span className="text-meta text-muted-foreground truncate hidden sm:inline-block max-w-sm font-normal">
                {channel.topic}
              </span>
            </>
          )
        )}
      </div>

      <div className="flex items-center gap-1 sm:gap-1.5">
        {/* Invite button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenInvite}
          className="h-7 text-xs px-2 gap-1.5 hidden sm:inline-flex"
          title="Invite people to server"
        >
          <UserPlus className="w-3.5 h-3.5 text-primary" />
          <span>Invite</span>
        </Button>

        {/* Direct messages shortcut button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/')}
          className="h-7 text-xs px-2 gap-1.5 text-muted-foreground hover:text-foreground hidden md:inline-flex"
          title="Switch to direct messages"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Messages</span>
        </Button>

        {/* If in voice channel: Toggle voice text chat drawer */}
        {isVoiceChannel && (
          <Button
            variant={showVoiceChat ? 'secondary' : 'ghost'}
            size="sm"
            onClick={onToggleVoiceChat}
            className="h-7 text-xs px-2 gap-1"
            title="Toggle voice chat panel"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Chat</span>
          </Button>
        )}

        {/* Search in channel */}
        {!isVoiceChannel && (
          <div className="relative flex items-center">
            {showSearchInput ? (
              <div className="flex items-center gap-1.5 bg-card rounded-control px-2 py-0.5 border border-border">
                <Search className="w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onSearchQueryChange(e.target.value)}
                  placeholder="Search in channel..."
                  aria-label="Search in channel"
                  className="w-28 sm:w-40 bg-transparent text-xs text-foreground focus:outline-none placeholder:text-muted-foreground"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => {
                    onSearchQueryChange('');
                    setShowSearchInput(false);
                  }}
                  aria-label="Clear channel search"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="iconSm"
                onClick={() => setShowSearchInput(true)}
                aria-label="Search channel messages"
                title="Search messages"
              >
                <Search className="w-4 h-4 text-muted-foreground" />
              </Button>
            )}
          </div>
        )}

        {/* Soundboard trigger */}
        {canUseSoundboard && (
          <Button
            variant="ghost"
            size="iconSm"
            onClick={onOpenSoundboard}
            aria-label="Soundboard"
            title="Soundboard"
          >
            <Sparkles className="w-4 h-4 text-warning" />
          </Button>
        )}

        {/* Members toggle */}
        <Button
          variant={showMembers ? 'secondary' : 'ghost'}
          size="iconSm"
          onClick={onToggleMembers}
          aria-label="Toggle members list"
          title="Toggle member list"
        >
          <Users className="w-4 h-4 text-muted-foreground" />
        </Button>
      </div>
    </header>
  );
}
