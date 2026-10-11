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
  Radio,
  Sparkles,
  Users,
} from 'lucide-react';
import { Server, Channel, ChannelType } from '@/lib/types/server';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';

interface ServerSidebarProps {
  server: Server;
  activeChannelId: string | null;
  onSelectChannel: (channel: Channel) => void;
  onOpenServerSettings?: () => void;
  onCreateChannel: (name: string, type: ChannelType, topic?: string) => Promise<unknown>;
  onDeleteChannel?: (channelId: string) => Promise<unknown>;
  onConnectVoiceChannel?: (channel: Channel) => void;
}

export function ServerSidebar({
  server,
  activeChannelId,
  onSelectChannel,
  onOpenServerSettings,
  onCreateChannel,
  onDeleteChannel,
  onConnectVoiceChannel,
}: ServerSidebarProps) {
  const { toast } = useToast();
  const [showMenu, setShowMenu] = React.useState(false);
  const [showAddChannel, setShowAddChannel] = React.useState(false);
  const [newChannelName, setNewChannelName] = React.useState('');
  const [newChannelType, setNewChannelType] = React.useState<ChannelType>('text');

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

  return (
    <aside className="w-60 h-full bg-surface-sidebar border-r border-border flex flex-col justify-between select-none shrink-0 z-20">
      <div className="overflow-y-auto flex-1">
        {/* Server Top Header / Dropdown Trigger */}
        <div className="relative">
          <button
            onClick={() => setShowMenu((prev) => !prev)}
            className="w-full h-14 border-b border-border/80 px-4 flex items-center justify-between hover:bg-surface-hover/80 transition-colors group text-left"
          >
            <div className="min-w-0 flex-1 pr-2">
              <h2 className="font-extrabold text-sm text-foreground truncate group-hover:text-primary transition-colors flex items-center gap-1.5">
                <span className="truncate">{server.name}</span>
              </h2>
              <div className="text-[10px] text-muted-foreground truncate font-mono">
                {server.members.length + 3} squad members
              </div>
            </div>

            <ChevronDown
              className={cn(
                'w-4 h-4 text-muted-foreground transition-transform duration-200 shrink-0',
                showMenu && 'rotate-180 text-foreground'
              )}
            />
          </button>

          {/* Server Action Dropdown */}
          {showMenu && (
            <div className="absolute top-14 left-2 right-2 z-40 bg-card border border-border rounded-xl shadow-xl p-1.5 space-y-1 animate-in zoom-in-95 duration-100">
              <button
                onClick={() => {
                  setShowMenu(false);
                  onOpenServerSettings?.();
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-foreground hover:bg-surface-hover hover:text-primary transition-colors"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Server Settings</span>
              </button>

              <button
                onClick={() => {
                  setShowMenu(false);
                  setShowAddChannel(true);
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-foreground hover:bg-surface-hover hover:text-primary transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-primary" />
                <span>Create Channel</span>
              </button>

              <button
                onClick={() => {
                  setShowMenu(false);
                  toast({
                    title: 'Invite Link Copied',
                    description: `Share https://nexus.gg/join/${server.id} with your squad.`,
                    type: 'success',
                  });
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-foreground hover:bg-surface-hover hover:text-primary transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                <span>Invite Squadmates</span>
              </button>
            </div>
          )}
        </div>

        {/* Text Channels Category */}
        <div className="p-3">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80 px-2 py-1">
            <span className="flex items-center gap-1">
              <span>Text Channels</span>
            </span>
            <button
              onClick={() => {
                setNewChannelType('text');
                setShowAddChannel(true);
              }}
              className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
              title="Add Text Channel"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-0.5 mt-1">
            {textChannels.map((channel) => {
              const isActive = activeChannelId === channel.id;

              return (
                <div
                  key={channel.id}
                  onClick={() => onSelectChannel(channel)}
                  className={cn(
                    'group flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-all',
                    isActive
                      ? 'bg-primary/15 text-primary font-bold shadow-glow-sm'
                      : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Hash
                      className={cn(
                        'w-4 h-4 shrink-0 transition-colors',
                        isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                      )}
                    />
                    <span className="truncate">{channel.name}</span>
                  </div>

                  {channel.topic && (
                    <span className="text-[10px] text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity truncate max-w-[50px]">
                      topic
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Voice Channels Category */}
        <div className="p-3 pt-0">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80 px-2 py-1">
            <span className="flex items-center gap-1">
              <span>Voice Channels</span>
            </span>
            <button
              onClick={() => {
                setNewChannelType('voice');
                setShowAddChannel(true);
              }}
              className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
              title="Add Voice Channel"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-1 mt-1">
            {voiceChannels.map((channel) => {
              return (
                <div key={channel.id} className="space-y-1">
                  <div
                    onClick={() => {
                      onConnectVoiceChannel?.(channel);
                      toast({
                        title: `Voice Connected: ${channel.name}`,
                        description: 'WebRTC encrypted voice room active.',
                        type: 'success',
                      });
                    }}
                    className="group flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all hover:bg-emerald-500/10 hover:text-emerald-400 text-muted-foreground border border-transparent hover:border-emerald-500/20"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Volume2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="truncate">{channel.name}</span>
                    </div>

                    <Badge
                      variant="outline"
                      className="text-[9px] px-1.5 py-0 border-emerald-500/30 text-emerald-400 bg-emerald-500/10 font-mono"
                    >
                      Join
                    </Badge>
                  </div>

                  {/* Connected squad members under voice channel */}
                  <div className="pl-6 space-y-1">
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-0.5">
                      <Avatar name="Viper Leader" size="sm" className="w-4 h-4" />
                      <span className="truncate">Viper Leader</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-auto" />
                    </div>
                  </div>
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
            className="fixed inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setShowAddChannel(false)}
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-border bg-surface-default p-5 shadow-2xl z-10 space-y-4">
            <h3 className="text-sm font-bold text-foreground">Create Channel</h3>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setNewChannelType('text')}
                className={cn(
                  'flex-1 p-2.5 rounded-xl border flex flex-col items-center gap-1 text-xs font-bold transition-all',
                  newChannelType === 'text'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border/60 bg-surface-sidebar text-muted-foreground'
                )}
              >
                <Hash className="w-4 h-4" />
                <span>Text</span>
              </button>
              <button
                type="button"
                onClick={() => setNewChannelType('voice')}
                className={cn(
                  'flex-1 p-2.5 rounded-xl border flex flex-col items-center gap-1 text-xs font-bold transition-all',
                  newChannelType === 'voice'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                    : 'border-border/60 bg-surface-sidebar text-muted-foreground'
                )}
              >
                <Volume2 className="w-4 h-4" />
                <span>Voice</span>
              </button>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Channel Name
              </label>
              <input
                type="text"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                placeholder={newChannelType === 'text' ? 'e.g. ranked-strats' : 'e.g. Scrim Comms'}
                className="w-full px-3 py-2 rounded-xl border border-border bg-surface-sidebar text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
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
                className="px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-md hover:opacity-90 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
