'use client';

import * as React from 'react';
import {
  Hash,
  Volume2,
  Users,
  Search,
  Sparkles,
  Smile,
  Send,
  PlusCircle,
  Shield,
  Crown,
  Gamepad2,
  X,
} from 'lucide-react';
import { Server, Channel } from '@/lib/types/server';
import { useChannelMessages } from '@/hooks/use-channel-messages';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SoundboardModal } from '@/components/soundboard/soundboard-modal';
import { cn } from '@/lib/utils';

interface ChannelViewProps {
  server: Server;
  channel: Channel;
}

export function ChannelView({ server, channel }: ChannelViewProps) {
  const { messages, sendMessage } = useChannelMessages(channel.id);
  const [inputText, setInputText] = React.useState('');
  const [showMembers, setShowMembers] = React.useState(true);
  const [showSoundboard, setShowSoundboard] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [showSearch, setShowSearch] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim()) return;
    sendMessage(inputText.trim());
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const filteredMessages = searchQuery.trim()
    ? messages.filter((m) =>
        m.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages;

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-background">
      {/* Center Stage: Channel Chat Feed */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        {/* Top Channel Header */}
        <div className="h-14 border-b border-border/80 px-4 flex items-center justify-between shrink-0 bg-surface-header/60 select-none">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2">
              <Hash className="w-5 h-5 text-muted-foreground shrink-0" />
              <h3 className="font-extrabold text-sm text-foreground truncate">
                {channel.name}
              </h3>
            </div>

            {channel.topic && (
              <>
                <span className="w-1 h-1 rounded-full bg-border shrink-0" />
                <span className="text-xs text-muted-foreground truncate hidden sm:inline-block max-w-sm">
                  {channel.topic}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Search Toggle */}
            <div className="relative">
              {showSearch ? (
                <div className="flex items-center gap-1 bg-surface-sidebar rounded-xl px-2 py-1 border border-border">
                  <Search className="w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search in channel..."
                    className="w-32 sm:w-44 bg-transparent text-xs text-foreground focus:outline-none"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setShowSearch(false);
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowSearch(true)}
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                  title="Search Messages"
                >
                  <Search className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Soundboard Trigger */}
            <button
              onClick={() => setShowSoundboard(true)}
              className="p-2 rounded-lg text-muted-foreground hover:text-amber-400 hover:bg-amber-400/10 transition-colors"
              title="Soundboard"
            >
              <Sparkles className="w-4 h-4" />
            </button>

            {/* Members Toggle */}
            <button
              onClick={() => setShowMembers((prev) => !prev)}
              className={cn(
                'p-2 rounded-lg transition-colors',
                showMembers
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
              )}
              title="Toggle Squad Member List"
            >
              <Users className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Message Feed */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* Channel Start Banner */}
          <div className="py-6 space-y-2 border-b border-border/40 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-surface-sidebar border border-border/80 flex items-center justify-center text-primary shadow-inner">
              <Hash className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-black text-foreground tracking-tight">
              Welcome to #{channel.name}!
            </h2>
            <p className="text-xs text-muted-foreground max-w-md leading-relaxed">
              This is the start of the #{channel.name} channel for {server.name}. Share strats, callouts, and coordinate your gaming matches.
            </p>
          </div>

          {filteredMessages.map((msg) => {
            const isOwner = msg.user_id === server.owner_id;

            return (
              <div
                key={msg.id}
                className="flex items-start gap-3.5 group rounded-xl hover:bg-surface-hover/40 p-2 -mx-2 transition-colors"
              >
                <Avatar
                  src={msg.profile?.avatar_url}
                  name={msg.profile?.display_name || 'Gamer'}
                  size="md"
                  className="mt-0.5 shrink-0"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-xs text-foreground hover:underline cursor-pointer">
                      {msg.profile?.display_name || 'Squad Member'}
                    </span>

                    {isOwner ? (
                      <Badge
                        variant="default"
                        className="text-[9px] px-1.5 py-0 bg-amber-500/20 text-amber-400 border-amber-500/30 gap-1 font-mono uppercase"
                      >
                        <Crown className="w-2.5 h-2.5" />
                        Leader
                      </Badge>
                    ) : (
                      <Badge
                        variant="subtle"
                        className="text-[9px] px-1.5 py-0 text-primary border-primary/30 font-mono uppercase"
                      >
                        Squad
                      </Badge>
                    )}

                    <span className="text-[10px] text-muted-foreground font-mono">
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <p className="text-xs text-foreground/90 mt-1 leading-relaxed break-words">
                    {msg.content}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 pt-1 shrink-0">
          <form
            onSubmit={handleSend}
            className="flex items-center gap-2 bg-surface-sidebar border border-border/80 rounded-2xl p-2 px-3 focus-within:ring-2 focus-within:ring-primary shadow-md"
          >
            <button
              type="button"
              onClick={() => setShowSoundboard(true)}
              className="text-muted-foreground hover:text-amber-400 p-1.5 rounded-lg transition-colors shrink-0"
              title="Trigger Soundboard Meme"
            >
              <Sparkles className="w-4 h-4" />
            </button>

            <textarea
              rows={1}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message #${channel.name}...`}
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none resize-none max-h-28 py-1"
            />

            <Button
              type="submit"
              size="sm"
              disabled={!inputText.trim()}
              className="h-8 w-8 p-0 rounded-xl shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </form>
        </div>
      </div>

      {/* Right Squad Members Panel */}
      {showMembers && (
        <aside className="w-60 border-l border-border bg-surface-sidebar hidden lg:flex flex-col p-4 shrink-0 overflow-y-auto select-none">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
            <Crown className="w-3.5 h-3.5 text-amber-400" />
            <span>Server Leadership (1)</span>
          </div>

          <div className="space-y-1 mb-6">
            <div className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-surface-hover transition-colors cursor-pointer group">
              <Avatar
                name={server.members[0]?.profile?.display_name || 'Viper Leader'}
                status="online"
                showStatus
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">
                  {server.members[0]?.profile?.display_name || 'Viper Leader'}
                </div>
                <div className="text-[10px] text-amber-400 font-mono truncate">
                  👑 Clan Leader
                </div>
              </div>
            </div>
          </div>

          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-primary" />
            <span>Squad Officers (2)</span>
          </div>

          <div className="space-y-1 mb-6">
            {[
              { name: 'Ronin', game: 'Counter-Strike 2', status: 'online' as const },
              { name: 'Valkyrie', game: 'Apex Legends', status: 'idle' as const },
            ].map((member, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-surface-hover transition-colors cursor-pointer group"
              >
                <Avatar name={member.name} status={member.status} showStatus size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">
                    {member.name}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    🎮 {member.game}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
            <Gamepad2 className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Squadmates Online (4)</span>
          </div>

          <div className="space-y-1">
            {[
              { name: 'GhostSniper', status: 'online' as const },
              { name: 'EchoOperator', status: 'dnd' as const },
              { name: 'NexusPilot', status: 'online' as const },
            ].map((m, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-surface-hover transition-colors cursor-pointer group"
              >
                <Avatar name={m.name} status={m.status} showStatus size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">
                    {m.name}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </aside>
      )}

      {/* Soundboard Modal */}
      <SoundboardModal open={showSoundboard} onOpenChange={setShowSoundboard} />
    </div>
  );
}
