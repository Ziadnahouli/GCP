'use client';

import * as React from 'react';
import {
  Settings,
  Shield,
  Hash,
  Volume2,
  Trash2,
  X,
  AlertTriangle,
  CheckCircle2,
  Edit2,
  Plus,
  UserMinus,
  Crown,
  LogOut,
  Save,
} from 'lucide-react';
import { Server, Channel, ChannelType, ServerRole } from '@/lib/types/server';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { useAuth } from '@/features/auth/auth-provider';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

interface ServerSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server: Server;
  onUpdateServer?: (
    serverId: string,
    updates: { name?: string; description?: string | null; icon_url?: string | null }
  ) => Promise<unknown>;
  onDeleteServer?: (serverId: string) => Promise<unknown>;
  onCreateChannel?: (serverId: string, name: string, type: ChannelType, topic?: string) => Promise<unknown>;
  onUpdateChannel?: (serverId: string, channelId: string, updates: { name?: string; topic?: string | null }) => Promise<unknown>;
  onDeleteChannel?: (serverId: string, channelId: string) => Promise<unknown>;
  onUpdateMemberRole?: (serverId: string, userId: string, newRole: ServerRole) => Promise<unknown>;
  onKickMember?: (serverId: string, userId: string) => Promise<unknown>;
  onLeaveServer?: (serverId: string) => Promise<unknown>;
}

export function ServerSettingsModal({
  open,
  onOpenChange,
  server,
  onUpdateServer,
  onDeleteServer,
  onCreateChannel,
  onUpdateChannel,
  onDeleteChannel,
  onUpdateMemberRole,
  onKickMember,
  onLeaveServer,
}: ServerSettingsModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = React.useState<'overview' | 'channels' | 'members' | 'danger'>('overview');
  const [serverName, setServerName] = React.useState(server.name);
  const [serverDesc, setServerDesc] = React.useState(server.description || '');
  const [savingOverview, setSavingOverview] = React.useState(false);

  // Edit channel state
  const [editingChannelId, setEditingChannelId] = React.useState<string | null>(null);
  const [editChannelName, setEditChannelName] = React.useState('');
  const [editChannelTopic, setEditChannelTopic] = React.useState('');

  // Quick create channel in settings
  const [showAddChannel, setShowAddChannel] = React.useState(false);
  const [newChanName, setNewChanName] = React.useState('');
  const [newChanType, setNewChanType] = React.useState<ChannelType>('text');
  const [newChanTopic, setNewChanTopic] = React.useState('');

  React.useEffect(() => {
    setServerName(server.name);
    setServerDesc(server.description || '');
  }, [server]);

  if (!open) return null;

  const isOwner = server.owner_id === user?.id || server.owner_id === 'current-user';

  const handleSaveOverview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverName.trim()) return;

    setSavingOverview(true);
    try {
      if (onUpdateServer) {
        await onUpdateServer(server.id, {
          name: serverName.trim(),
          description: serverDesc.trim() || null,
        });
      }
      toast({
        title: 'Server Settings Saved',
        description: `"${serverName.trim()}" details updated successfully.`,
        type: 'success',
      });
      onOpenChange(false);
    } catch {
      toast({
        title: 'Save Failed',
        description: 'Could not update server settings.',
        type: 'error',
      });
    } finally {
      setSavingOverview(false);
    }
  };

  const handleSaveChannelEdit = async (channelId: string) => {
    if (!editChannelName.trim()) return;
    try {
      if (onUpdateChannel) {
        await onUpdateChannel(server.id, channelId, {
          name: editChannelName.trim(),
          topic: editChannelTopic.trim() || null,
        });
      }
      toast({
        title: 'Channel Updated',
        description: `#${editChannelName.trim()} settings updated.`,
        type: 'success',
      });
      setEditingChannelId(null);
    } catch {
      toast({ title: 'Error', description: 'Failed to update channel.', type: 'error' });
    }
  };

  const handleCreateChannelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChanName.trim()) return;
    try {
      if (onCreateChannel) {
        await onCreateChannel(server.id, newChanName.trim(), newChanType, newChanTopic.trim());
      }
      toast({
        title: 'Channel Created',
        description: `${newChanType === 'text' ? '#' : '🔊'} ${newChanName.trim()} is live.`,
        type: 'success',
      });
      setNewChanName('');
      setNewChanTopic('');
      setShowAddChannel(false);
    } catch {
      toast({ title: 'Error', description: 'Failed to create channel.', type: 'error' });
    }
  };

  const handleDeleteServerConfirm = async () => {
    if (confirm(`Are you sure you want to permanently delete "${server.name}"? This action cannot be undone.`)) {
      await onDeleteServer?.(server.id);
      toast({
        title: 'Server Deleted',
        description: `"${server.name}" was permanently removed.`,
        type: 'info',
      });
      onOpenChange(false);
    }
  };

  const handleLeaveServerConfirm = async () => {
    if (confirm(`Are you sure you want to leave "${server.name}"?`)) {
      await onLeaveServer?.(server.id);
      toast({
        title: 'Left Server',
        description: `You have left "${server.name}".`,
        type: 'info',
      });
      onOpenChange(false);
    }
  };

  const navItems = [
    { id: 'overview' as const, label: 'Overview', icon: Settings },
    { id: 'channels' as const, label: `Channels (${server.channels.length})`, icon: Hash },
    { id: 'members' as const, label: `Members & Roles (${server.members.length})`, icon: Shield },
    { id: 'danger' as const, label: 'Danger Zone', icon: AlertTriangle, danger: true },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-md animate-in fade-in"
        onClick={() => onOpenChange(false)}
      />

      <div className="relative w-full max-w-3xl rounded-2xl border border-white/[0.08] bg-surface-panel shadow-2xl shadow-black/90 overflow-hidden flex flex-col md:flex-row h-[90vh] md:h-[580px] z-10 animate-in zoom-in-95 duration-150">
        {/* Left Settings Sidebar */}
        <div className="w-full md:w-56 bg-surface-sidebar border-b md:border-b-0 md:border-r border-white/[0.06] p-3 md:p-4 flex flex-row md:flex-col justify-between shrink-0 select-none overflow-x-auto gap-2 no-scrollbar">
          <div className="flex flex-row md:flex-col gap-1 shrink-0 no-scrollbar w-full">
            <div className="hidden md:block px-2 py-1 mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 truncate">
                {server.name}
              </h3>
            </div>

            <nav className="flex flex-row md:flex-col gap-1 shrink-0 w-full">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-md text-xs transition-colors shrink-0 whitespace-nowrap w-full text-left',
                      isActive
                        ? item.danger
                          ? 'bg-rose-500/15 text-rose-400 font-medium'
                          : 'bg-white/[0.06] text-foreground font-medium'
                        : item.danger
                        ? 'text-rose-400/70 hover:bg-rose-500/10 hover:text-rose-400'
                        : 'text-muted-foreground/70 hover:bg-white/[0.03] hover:text-foreground'
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="hidden md:block pt-2 border-t border-white/[0.06] text-[10px] text-muted-foreground/50 font-mono">
            ID: {server.id.slice(0, 8)}...
          </div>
        </div>

        {/* Right Settings Content Area */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-surface-panel">
          {/* Header */}
          <div className="h-12 md:h-14 border-b border-white/[0.06] px-4 md:px-6 flex items-center justify-between shrink-0">
            <h4 className="text-xs font-semibold text-foreground capitalize">
              {activeTab === 'overview' && 'Server Overview & Identity'}
              {activeTab === 'channels' && 'Channel Management'}
              {activeTab === 'members' && 'Squad Members & Permissions'}
              {activeTab === 'danger' && 'Danger Zone'}
            </h4>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close settings"
              className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-white/[0.04] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-6">
            {/* 1. OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <form onSubmit={handleSaveOverview} className="space-y-4 max-w-md">
                <div>
                  <label htmlFor="server-settings-name" className="text-xs font-medium text-foreground block mb-1">
                    Server Name
                  </label>
                  <input
                    id="server-settings-name"
                    type="text"
                    value={serverName}
                    onChange={(e) => setServerName(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-white/[0.08] bg-white/[0.02] text-foreground text-xs focus:outline-none focus:border-primary/50 transition-colors"
                  />
                </div>

                <div>
                  <label htmlFor="server-settings-desc" className="text-xs font-medium text-foreground block mb-1">
                    Description & Topic
                  </label>
                  <textarea
                    id="server-settings-desc"
                    rows={3}
                    value={serverDesc}
                    onChange={(e) => setServerDesc(e.target.value)}
                    placeholder="Tell your squad what this server is about..."
                    className="w-full px-3 py-2 rounded-lg border border-white/[0.08] bg-white/[0.02] text-foreground text-xs focus:outline-none focus:border-primary/50 resize-none transition-colors"
                  />
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <Button size="sm" type="submit" disabled={savingOverview || !serverName.trim()} className="font-medium text-xs gap-1.5">
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Changes</span>
                  </Button>
                </div>
              </form>
            )}

            {/* 2. CHANNELS TAB */}
            {activeTab === 'channels' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground/70">
                    Manage, edit names, or create text and voice rooms.
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowAddChannel((prev) => !prev)}
                    className="h-7 text-xs gap-1 border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06]"
                  >
                    <Plus className="w-3.5 h-3.5 text-primary" />
                    <span>Add Channel</span>
                  </Button>
                </div>

                {/* Inline Channel Creator Form */}
                {showAddChannel && (
                  <form onSubmit={handleCreateChannelSubmit} className="p-3 rounded-xl border border-primary/30 bg-primary/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">New Channel</span>
                      <button type="button" onClick={() => setShowAddChannel(false)} className="text-muted-foreground hover:text-foreground">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setNewChanType('text')}
                        className={cn(
                          'flex-1 p-1.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors',
                          newChanType === 'text' ? 'border-primary bg-primary/10 text-primary' : 'border-white/[0.06] text-muted-foreground'
                        )}
                      >
                        <Hash className="w-3.5 h-3.5" />
                        <span>Text</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewChanType('voice')}
                        className={cn(
                          'flex-1 p-1.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors',
                          newChanType === 'voice' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-white/[0.06] text-muted-foreground'
                        )}
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>Voice</span>
                      </button>
                    </div>

                    <input
                      type="text"
                      placeholder="channel-name"
                      value={newChanName}
                      onChange={(e) => setNewChanName(e.target.value)}
                      required
                      className="w-full px-2.5 py-1.5 rounded-lg border border-white/[0.08] bg-background text-xs text-foreground focus:outline-none focus:border-primary/50"
                    />

                    <input
                      type="text"
                      placeholder="Channel topic (optional)"
                      value={newChanTopic}
                      onChange={(e) => setNewChanTopic(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-white/[0.08] bg-background text-xs text-foreground focus:outline-none focus:border-primary/50"
                    />

                    <div className="flex justify-end gap-2">
                      <Button size="sm" type="submit" disabled={!newChanName.trim()} className="h-7 text-xs">
                        Create Channel
                      </Button>
                    </div>
                  </form>
                )}

                {/* Channels List */}
                <div className="space-y-2">
                  {server.channels.map((chan) => {
                    const isEditing = editingChannelId === chan.id;

                    return (
                      <div
                        key={chan.id}
                        className="p-3 rounded-lg border border-white/[0.06] bg-white/[0.02] flex flex-col gap-2 transition-colors"
                      >
                        {isEditing ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              {chan.type === 'text' ? <Hash className="w-4 h-4 text-primary" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                              <input
                                type="text"
                                value={editChannelName}
                                onChange={(e) => setEditChannelName(e.target.value)}
                                className="flex-1 px-2 py-1 rounded border border-white/[0.1] bg-background text-xs text-foreground"
                              />
                            </div>
                            <input
                              type="text"
                              placeholder="Channel topic..."
                              value={editChannelTopic}
                              onChange={(e) => setEditChannelTopic(e.target.value)}
                              className="w-full px-2 py-1 rounded border border-white/[0.1] bg-background text-xs text-foreground"
                            />
                            <div className="flex items-center justify-end gap-1.5">
                              <Button size="sm" variant="ghost" onClick={() => setEditingChannelId(null)} className="h-6 text-[10px]">
                                Cancel
                              </Button>
                              <Button size="sm" onClick={() => handleSaveChannelEdit(chan.id)} className="h-6 text-[10px]">
                                Save
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              {chan.type === 'text' ? (
                                <Hash className="w-4 h-4 text-muted-foreground/70 shrink-0" />
                              ) : (
                                <Volume2 className="w-4 h-4 text-emerald-400 shrink-0" />
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-medium text-foreground truncate">{chan.name}</div>
                                {chan.topic ? (
                                  <div className="text-[10px] text-muted-foreground/60 truncate font-normal">
                                    {chan.topic}
                                  </div>
                                ) : (
                                  <div className="text-[10px] text-muted-foreground/40 capitalize font-mono">
                                    {chan.type} Room
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                  setEditingChannelId(chan.id);
                                  setEditChannelName(chan.name);
                                  setEditChannelTopic(chan.topic || '');
                                }}
                                title="Edit Channel"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10"
                                onClick={() => {
                                  if (confirm(`Delete #${chan.name}?`)) {
                                    onDeleteChannel?.(server.id, chan.id);
                                  }
                                }}
                                title="Delete Channel"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. MEMBERS & ROLES TAB */}
            {activeTab === 'members' && (
              <div className="space-y-4">
                <div className="text-xs text-muted-foreground/70">
                  Manage members, assign squad roles, or remove members from this server.
                </div>

                <div className="space-y-2">
                  {server.members.map((member) => {
                    const isMemberOwner = member.role === 'owner' || member.user_id === server.owner_id;
                    const isMe = member.user_id === user?.id;

                    return (
                      <div
                        key={member.id || member.user_id}
                        className="p-3 rounded-lg border border-white/[0.06] bg-white/[0.02] flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <Avatar
                            src={member.profile?.avatar_url || null}
                            name={member.profile?.display_name || 'Member'}
                            size="md"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-foreground flex items-center gap-1.5 truncate">
                              <span className="truncate">{member.profile?.display_name || 'Squad Member'}</span>
                              {isMe && <span className="text-[10px] text-muted-foreground/60 font-mono">(You)</span>}
                            </div>
                            <div className="text-[10px] text-muted-foreground/50 font-mono">
                              @{member.profile?.username || 'member'}
                            </div>
                          </div>
                        </div>

                        {/* Role selection & Kick button */}
                        <div className="flex items-center gap-2">
                          {isMemberOwner ? (
                            <Badge variant="default" className="text-[10px] px-2 py-0.5 bg-amber-500/10 text-amber-300 border-amber-500/30 gap-1 uppercase font-mono">
                              <Crown className="w-2.5 h-2.5" />
                              Owner
                            </Badge>
                          ) : isOwner ? (
                            <select
                              value={member.role}
                              onChange={(e) => {
                                onUpdateMemberRole?.(server.id, member.user_id, e.target.value as ServerRole);
                                toast({
                                  title: 'Role Updated',
                                  description: `Member role changed to ${e.target.value}.`,
                                  type: 'info',
                                });
                              }}
                              className="px-2 py-1 rounded bg-surface-panel border border-white/[0.08] text-[11px] text-foreground focus:outline-none"
                            >
                              <option value="admin">Admin</option>
                              <option value="moderator">Moderator</option>
                              <option value="member">Member</option>
                            </select>
                          ) : (
                            <Badge variant="outline" className="text-[10px] px-2 py-0.5 capitalize text-muted-foreground border-white/[0.1]">
                              {member.role}
                            </Badge>
                          )}

                          {isOwner && !isMemberOwner && !isMe && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10"
                              onClick={() => {
                                if (confirm(`Remove ${member.profile?.display_name || 'this member'} from the server?`)) {
                                  onKickMember?.(server.id, member.user_id);
                                  toast({ title: 'Member Removed', description: 'Member kicked from server.', type: 'info' });
                                }
                              }}
                              title="Kick Member"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 4. DANGER ZONE TAB */}
            {activeTab === 'danger' && (
              <div className="space-y-4">
                {isOwner ? (
                  <div className="space-y-3 p-4 rounded-xl border border-rose-500/20 bg-rose-500/10">
                    <div className="flex items-center gap-2 text-rose-400 text-xs font-semibold">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Delete Server</span>
                    </div>
                    <p className="text-xs text-muted-foreground/70 leading-relaxed font-normal">
                      Permanently delete this server, all associated text channels, voice rooms, and message history. This action cannot be reversed.
                    </p>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDeleteServerConfirm}
                      className="text-xs font-medium"
                    >
                      Delete &quot;{server.name}&quot;
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3 p-4 rounded-xl border border-amber-500/20 bg-amber-500/10">
                    <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
                      <LogOut className="w-4 h-4" />
                      <span>Leave Server</span>
                    </div>
                    <p className="text-xs text-muted-foreground/70 leading-relaxed font-normal">
                      You will leave this server and won&apos;t be able to view channels until you are invited again.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleLeaveServerConfirm}
                      className="text-xs font-medium border-amber-500/30 text-amber-300 hover:bg-amber-500/15"
                    >
                      Leave &quot;{server.name}&quot;
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
