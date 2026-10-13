'use client';

import * as React from 'react';
import {
  Hash,
  Volume2,
  Plus,
  ChevronDown,
  Settings,
  Trash2,
  UserPlus,
  Sparkles,
  Users,
  MessageSquare,
  Radio,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Server, Channel, ChannelType, hasServerPermission } from '@/lib/types/server';
import { useAuth } from '@/features/auth/auth-provider';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { InviteModal } from './invite-modal';

interface ServerSidebarProps {
  server: Server;
  activeChannelId: string | null;
  onSelectChannel: (channel: Channel) => void;
  onOpenServerSettings?: () => void;
  onCreateChannel: (name: string, type: ChannelType, topic?: string) => Promise<unknown>;
  onUpdateChannel?: (channelId: string, updates: { name?: string; topic?: string | null }) => Promise<unknown>;
  onDeleteChannel?: (channelId: string) => Promise<unknown>;
  onConnectVoiceChannel?: (channel: Channel) => void;
}

export function ServerSidebar({
  server,
  activeChannelId,
  onSelectChannel,
  onOpenServerSettings,
  onCreateChannel,
  onUpdateChannel,
  onDeleteChannel,
  onConnectVoiceChannel,
}: ServerSidebarProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const [showMenu, setShowMenu] = React.useState(false);
  const [showAddChannel, setShowAddChannel] = React.useState(false);
  const [showInviteModal, setShowInviteModal] = React.useState(false);
  const [newChannelName, setNewChannelName] = React.useState('');
  const [newChannelType, setNewChannelType] = React.useState<ChannelType>('text');

  const canManageServer = hasServerPermission(server, user?.id, 'manage_server') || hasServerPermission(server, user?.id, 'manage_roles');
  const canManageChannels = hasServerPermission(server, user?.id, 'manage_channels');

  const textChannels = server.channels.filter((c) => c.type === 'text');
  const voiceChannels = server.channels.filter((c) => c.type === 'voice');

  const handleCreateChannelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;

    await onCreateChannel(newChannelName.trim(), newChannelType);
    toast({
      title: 'Channel Created',
      description: `${newChannelType === 'text' ? '#' : '🔊'} ${newChannelName} is live.`,
      type: 'success',
    });
    setNewChannelName('');
    setShowAddChannel(false);
  };

  const memberCount = (server.members?.length || 0) + 1;

  return (
    <aside className="w-60 h-full bg-surface-sidebar border-r border-white/[0.06] flex flex-col justify-between select-none shrink-0 z-20">
      <div className="overflow-y-auto flex-1 no-scrollbar">
        {/* Server Top Header / Dropdown Trigger */}
        <div className="relative">
          <button
            onClick={() => setShowMenu((prev) => !prev)}
            className="w-full h-12 border-b border-white/[0.06] px-3.5 flex items-center justify-between hover:bg-white/[0.03] transition-colors group text-left"
          >
            <div className="min-w-0 flex-1 pr-2">
              <h2 className="font-bold text-xs text-foreground truncate group-hover:text-primary transition-colors flex items-center gap-1.5">
                <span className="truncate">{server.name}</span>
              </h2>
              <div className="text-[10px] text-muted-foreground/60 truncate font-mono">
                {memberCount} {memberCount === 1 ? 'member' : 'members'} online
              </div>
            </div>

            <ChevronDown
              className={cn(
                'w-3.5 h-3.5 text-muted-foreground transition-transform duration-150 shrink-0',
                showMenu && 'rotate-180 text-foreground'
              )}
            />
          </button>

          {/* Server Action Dropdown */}
          {showMenu && (
            <div className="absolute top-13 left-2 right-2 z-40 bg-card border border-white/[0.08] rounded-xl shadow-panel p-1 space-y-0.5 animate-in fade-in duration-100">
              {canManageServer && (
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onOpenServerSettings?.();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-foreground hover:bg-surface-hover hover:text-primary transition-colors"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Server Settings</span>
                </button>
              )}

              {canManageChannels && (
                <button
                  onClick={() => {
                    setShowMenu(false);
                    setShowAddChannel(true);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-foreground hover:bg-surface-hover hover:text-primary transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 text-primary" />
                  <span>Create Channel</span>
                </button>
              )}

              <button
                onClick={() => {
                  setShowMenu(false);
                  setShowInviteModal(true);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-foreground hover:bg-surface-hover hover:text-primary transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                <span>Invite Squadmates</span>
              </button>
            </div>
          )}
        </div>

        {/* Quick Switch to Direct Messages & Friends */}
        <div className="p-2 border-b border-white/[0.06]">
          <button
            onClick={() => router.push('/')}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] text-muted-foreground hover:text-foreground font-medium text-xs transition-colors border border-white/[0.06] text-left"
            title="Switch to Direct Messages & Friends Hub"
          >
            <MessageSquare className="w-3.5 h-3.5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-foreground text-xs">Direct Messages</div>
              <div className="text-[10px] text-muted-foreground/60 font-normal truncate">
                Private chats & friends
              </div>
            </div>
          </button>
        </div>

        {/* Text Channels Category */}
        <div className="p-2 mt-0.5">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 px-2 py-1">
            <span className="flex items-center gap-1">
              <span>Text Channels</span>
            </span>
            {canManageChannels && (
              <button
                onClick={() => {
                  setNewChannelType('text');
                  setShowAddChannel(true);
                }}
                className="text-muted-foreground/60 hover:text-foreground p-0.5 rounded transition-colors"
                title="Add Text Channel"
                aria-label="Add Text Channel"
              >
                <Plus className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="space-y-0.5 mt-0.5">
            {textChannels.map((channel) => {
              const isActive = activeChannelId === channel.id;

              return (
                <div
                  key={channel.id}
                  onClick={() => onSelectChannel(channel)}
                  className={cn(
                    'group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors relative',
                    isActive
                      ? 'bg-white/[0.06] text-foreground font-semibold'
                      : 'text-muted-foreground hover:bg-white/[0.03] hover:text-foreground'
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Hash
                      className={cn(
                        'w-3.5 h-3.5 shrink-0 transition-colors',
                        isActive ? 'text-primary' : 'text-muted-foreground/70 group-hover:text-foreground'
                      )}
                    />
                    <span className="truncate">{channel.name}</span>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {canManageChannels && onDeleteChannel && textChannels.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete #${channel.name}?`)) {
                            onDeleteChannel(channel.id);
                          }
                        }}
                        className="p-1 hover:text-destructive text-muted-foreground/50 rounded transition-colors"
                        title="Delete Channel"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {isActive && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-primary rounded-r" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Voice Channels Category */}
        <div className="p-2 pt-1">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 px-2 py-1">
            <span className="flex items-center gap-1">
              <span>Voice Lounges</span>
            </span>
            {canManageChannels && (
              <button
                onClick={() => {
                  setNewChannelType('voice');
                  setShowAddChannel(true);
                }}
                className="text-muted-foreground/60 hover:text-foreground p-0.5 rounded transition-colors"
                title="Add Voice Channel"
                aria-label="Add Voice Channel"
              >
                <Plus className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="space-y-1 mt-0.5">
            {voiceChannels.map((channel) => {
              const isActive = activeChannelId === channel.id;

              return (
                <div key={channel.id} className="space-y-0.5">
                  <div
                    onClick={() => {
                      onSelectChannel(channel);
                      onConnectVoiceChannel?.(channel);
                    }}
                    className={cn(
                      'group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all border',
                      isActive
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : 'hover:bg-emerald-500/10 hover:text-emerald-400 text-muted-foreground border-transparent hover:border-emerald-500/20'
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Volume2
                        className={cn(
                          'w-3.5 h-3.5 shrink-0 transition-colors',
                          isActive ? 'text-emerald-400 animate-pulse' : 'text-emerald-400/80'
                        )}
                      />
                      <span className="truncate">{channel.name}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      {isActive ? (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1.5 py-0 border-emerald-500/50 text-emerald-300 bg-emerald-500/20 font-mono"
                        >
                          Active
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1.5 py-0 border-white/[0.08] text-muted-foreground group-hover:border-emerald-500/30 group-hover:text-emerald-400 font-mono"
                        >
                          Join
                        </Badge>
                      )}

                      {onDeleteChannel && voiceChannels.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete voice channel ${channel.name}?`)) {
                              onDeleteChannel(channel.id);
                            }
                          }}
                          className="p-1 opacity-0 group-hover:opacity-100 hover:text-destructive text-muted-foreground/50 rounded transition-colors"
                          title="Delete Voice Channel"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {isActive && (
                    <div className="pl-6 py-0.5 flex items-center gap-1.5 text-[10px] text-emerald-400/90">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="font-mono">Voice Lounge</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Quick Add Channel Modal / Popup */}
      {showAddChannel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setShowAddChannel(false)}
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-white/[0.08] bg-surface-default p-5 shadow-modal z-10 space-y-4">
            <h3 className="text-sm font-bold text-foreground">Create Channel</h3>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setNewChannelType('text')}
                className={cn(
                  'flex-1 p-2 rounded-xl border flex flex-col items-center gap-1 text-xs font-semibold transition-colors',
                  newChannelType === 'text'
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-white/[0.06] bg-surface-panel text-muted-foreground hover:text-foreground'
                )}
              >
                <Hash className="w-4 h-4" />
                <span>Text</span>
              </button>
              <button
                type="button"
                onClick={() => setNewChannelType('voice')}
                className={cn(
                  'flex-1 p-2 rounded-xl border flex flex-col items-center gap-1 text-xs font-semibold transition-colors',
                  newChannelType === 'voice'
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                    : 'border-white/[0.06] bg-surface-panel text-muted-foreground hover:text-foreground'
                )}
              >
                <Volume2 className="w-4 h-4" />
                <span>Voice</span>
              </button>
            </div>

            <div>
              <label htmlFor="new-channel-name-input" className="text-xs font-medium text-foreground block mb-1.5">
                Channel Name
              </label>
              <input
                id="new-channel-name-input"
                type="text"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                placeholder={newChannelType === 'text' ? 'e.g. general' : 'e.g. Scrim Voice'}
                className="w-full px-3 py-2 rounded-xl border border-white/[0.08] bg-surface-panel text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/50"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddChannel(false)}
                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newChannelName.trim()}
                onClick={handleCreateChannelSubmit}
                className="px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold shadow-subtle hover:bg-primary-hover disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Squadmates Modal */}
      <InviteModal
        open={showInviteModal}
        onOpenChange={setShowInviteModal}
        server={server}
      />
    </aside>
  );
}
