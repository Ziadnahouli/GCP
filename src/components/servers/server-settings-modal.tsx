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
  Sliders,
  Check,
  Sparkles,
} from 'lucide-react';
import {
  Server,
  Channel,
  ChannelType,
  ServerRole,
  RoleDefinition,
  ServerPermission,
  ALL_SERVER_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
} from '@/lib/types/server';
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
  onCreateRole?: (serverId: string, name: string, color: string, permissions: ServerPermission[]) => Promise<unknown>;
  onUpdateRole?: (serverId: string, roleId: string, updates: Partial<RoleDefinition>) => Promise<unknown>;
  onDeleteRole?: (serverId: string, roleId: string) => Promise<unknown>;
  onUpdateRolePermissions?: (serverId: string, roleIdOrName: string, permissions: ServerPermission[]) => Promise<unknown>;
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
  onCreateRole,
  onUpdateRole,
  onDeleteRole,
  onUpdateRolePermissions,
}: ServerSettingsModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = React.useState<'overview' | 'channels' | 'roles' | 'members' | 'danger'>('overview');
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

  // Custom Role creation state
  const [showCreateRole, setShowCreateRole] = React.useState(false);
  const [newRoleName, setNewRoleName] = React.useState('');
  const [newRoleColor, setNewRoleColor] = React.useState('#6366f1');
  const [newRolePermissions, setNewRolePermissions] = React.useState<ServerPermission[]>([
    'send_messages',
    'connect_voice',
    'speak_voice',
    'share_screen',
  ]);
  const [savingRole, setSavingRole] = React.useState(false);

  // Selected role for editing permissions in the Roles tab
  const [selectedRoleId, setSelectedRoleId] = React.useState<string>('admin');
  const [rolePermDrafts, setRolePermDrafts] = React.useState<Record<string, ServerPermission[]>>({});

  // Sync state when server prop changes
  React.useEffect(() => {
    setServerName(server.name);
    setServerDesc(server.description || '');
  }, [server]);

  if (!open) return null;

  const isOwner = server.owner_id === user?.id || !server.owner_id;

  const handleSaveOverview = async () => {
    if (!serverName.trim()) {
      toast({ title: 'Invalid Name', description: 'Server name cannot be empty', type: 'error' });
      return;
    }
    setSavingOverview(true);
    try {
      if (onUpdateServer) {
        await onUpdateServer(server.id, {
          name: serverName.trim(),
          description: serverDesc.trim() || null,
        });
      }
      toast({ title: 'Server Updated', description: 'General settings saved successfully.', type: 'success' });
    } catch {
      toast({ title: 'Error', description: 'Failed to update server settings', type: 'error' });
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
      setEditingChannelId(null);
      toast({ title: 'Channel Updated', description: `#${editChannelName} saved.`, type: 'success' });
    } catch {
      toast({ title: 'Error', description: 'Failed to update channel', type: 'error' });
    }
  };

  const handleCreateChannelSubmit = async () => {
    if (!newChanName.trim()) return;
    try {
      if (onCreateChannel) {
        await onCreateChannel(server.id, newChanName.trim(), newChanType);
      }
      setNewChanName('');
      setShowAddChannel(false);
      toast({
        title: 'Channel Created',
        description: `${newChanType === 'text' ? '#' : '🔊'} ${newChanName} created.`,
        type: 'success',
      });
    } catch {
      toast({ title: 'Error', description: 'Failed to create channel', type: 'error' });
    }
  };

  // Create custom role
  const handleCreateRoleSubmit = async () => {
    if (!newRoleName.trim()) {
      toast({ title: 'Role Name Required', description: 'Please enter a name for the role.', type: 'error' });
      return;
    }
    setSavingRole(true);
    try {
      if (onCreateRole) {
        await onCreateRole(server.id, newRoleName.trim(), newRoleColor, newRolePermissions);
      }
      toast({
        title: 'Role Created',
        description: `Role "${newRoleName}" created with ${newRolePermissions.length} permissions.`,
        type: 'success',
      });
      setNewRoleName('');
      setNewRolePermissions(['send_messages', 'connect_voice', 'speak_voice', 'share_screen']);
      setShowCreateRole(false);
    } catch {
      toast({ title: 'Error', description: 'Failed to create role', type: 'error' });
    } finally {
      setSavingRole(false);
    }
  };

  // Get active permissions for currently selected role in Roles tab
  const getRolePermissions = (roleIdOrName: string): ServerPermission[] => {
    if (rolePermDrafts[roleIdOrName]) {
      return rolePermDrafts[roleIdOrName];
    }
    const custom = (server.roles || []).find((r) => r.id === roleIdOrName || r.name.toLowerCase() === roleIdOrName.toLowerCase());
    if (custom) return custom.permissions;

    if (roleIdOrName === 'owner') return DEFAULT_ROLE_PERMISSIONS.owner;
    if (roleIdOrName === 'admin') return DEFAULT_ROLE_PERMISSIONS.admin;
    if (roleIdOrName === 'moderator') return DEFAULT_ROLE_PERMISSIONS.moderator;
    return DEFAULT_ROLE_PERMISSIONS.member;
  };

  const togglePermissionForRole = (roleIdOrName: string, perm: ServerPermission) => {
    const current = getRolePermissions(roleIdOrName);
    const updated = current.includes(perm)
      ? current.filter((p) => p !== perm)
      : [...current, perm];

    setRolePermDrafts((prev) => ({
      ...prev,
      [roleIdOrName]: updated,
    }));
  };

  const handleSaveRolePermissions = async (roleIdOrName: string) => {
    const perms = getRolePermissions(roleIdOrName);
    try {
      if (onUpdateRolePermissions) {
        await onUpdateRolePermissions(server.id, roleIdOrName, perms);
      }
      toast({
        title: 'Permissions Saved',
        description: `Updated permissions for ${roleIdOrName}.`,
        type: 'success',
      });
    } catch {
      toast({ title: 'Error', description: 'Failed to update role permissions', type: 'error' });
    }
  };

  // Combine built-in roles with custom server roles
  const allAvailableRoles = [
    { id: 'admin', name: 'Admin', color: '#6366f1', is_custom: false },
    { id: 'moderator', name: 'Moderator', color: '#10b981', is_custom: false },
    { id: 'member', name: 'Member', color: '#94a3b8', is_custom: false },
    ...(server.roles || []),
  ];

  const PRESET_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#06b6d4'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 select-none animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity"
        onClick={() => onOpenChange(false)}
      />

      {/* Main Modal Shell */}
      <div className="relative w-full max-w-4xl h-[640px] max-h-[92vh] rounded-2xl border border-white/[0.08] bg-surface-default shadow-modal overflow-hidden flex flex-col md:flex-row z-10">
        {/* Left Sidebar Navigation */}
        <aside className="w-full md:w-56 bg-surface-sidebar border-b md:border-b-0 md:border-r border-white/[0.06] p-3 md:p-4 flex flex-row md:flex-col justify-between shrink-0 overflow-x-auto no-scrollbar">
          <div className="space-y-1 w-full flex flex-row md:flex-col gap-1 md:gap-0">
            <div className="hidden md:flex items-center gap-2 px-2 py-1.5 mb-2">
              <Settings className="w-4 h-4 text-primary" />
              <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground/80">
                Server Settings
              </span>
            </div>

            <button
              onClick={() => setActiveTab('overview')}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors text-left shrink-0',
                activeTab === 'overview'
                  ? 'bg-primary text-primary-foreground shadow-subtle'
                  : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'
              )}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => setActiveTab('channels')}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors text-left shrink-0',
                activeTab === 'channels'
                  ? 'bg-primary text-primary-foreground shadow-subtle'
                  : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'
              )}
            >
              <Hash className="w-3.5 h-3.5" />
              <span>Channels</span>
              <Badge variant="outline" className="ml-auto text-[10px] px-1 py-0 border-white/[0.1]">
                {server.channels.length}
              </Badge>
            </button>

            <button
              onClick={() => setActiveTab('roles')}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors text-left shrink-0',
                activeTab === 'roles'
                  ? 'bg-primary text-primary-foreground shadow-subtle'
                  : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'
              )}
            >
              <Shield className="w-3.5 h-3.5 text-primary" />
              <span>Roles & Perms</span>
              {(server.roles?.length || 0) > 0 && (
                <Badge variant="outline" className="ml-auto text-[10px] px-1 py-0 border-primary/30 text-primary">
                  {server.roles?.length}
                </Badge>
              )}
            </button>

            <button
              onClick={() => setActiveTab('members')}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors text-left shrink-0',
                activeTab === 'members'
                  ? 'bg-primary text-primary-foreground shadow-subtle'
                  : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'
              )}
            >
              <Crown className="w-3.5 h-3.5 text-amber-400" />
              <span>Members</span>
              <Badge variant="outline" className="ml-auto text-[10px] px-1 py-0 border-white/[0.1]">
                {(server.members?.length || 0) + 1}
              </Badge>
            </button>

            <button
              onClick={() => setActiveTab('danger')}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors text-left shrink-0',
                activeTab === 'danger'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : 'text-muted-foreground hover:bg-rose-500/10 hover:text-rose-400'
              )}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              <span>Danger Zone</span>
            </button>
          </div>

          <div className="hidden md:block pt-3 border-t border-white/[0.06]">
            <div className="text-[10px] text-muted-foreground/60 font-mono truncate">
              ID: {server.id.slice(0, 8)}...
            </div>
          </div>
        </aside>

        {/* Right Content View */}
        <main className="flex-1 flex flex-col min-w-0 bg-surface-default overflow-hidden relative">
          {/* Top Title Bar with Close Button */}
          <div className="h-14 border-b border-white/[0.06] px-6 flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-sm font-bold text-foreground">
                {activeTab === 'overview' && 'Server Overview'}
                {activeTab === 'channels' && 'Manage Channels'}
                {activeTab === 'roles' && 'Roles & Permission Matrix'}
                {activeTab === 'members' && 'Squad Members & Role Assignments'}
                {activeTab === 'danger' && 'Danger Zone'}
              </h2>
              <p className="text-[11px] text-muted-foreground">
                {server.name} — Customized headquarters for gaming comms.
              </p>
            </div>

            <button
              onClick={() => onOpenChange(false)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
              title="Close settings"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable Tab Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* 1. OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <div className="space-y-5 max-w-lg">
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1.5">
                    Server Name
                  </label>
                  <input
                    type="text"
                    value={serverName}
                    onChange={(e) => setServerName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-white/[0.08] bg-surface-panel text-foreground text-xs focus:outline-none focus:border-primary/50"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1.5">
                    Server Description
                  </label>
                  <textarea
                    rows={3}
                    value={serverDesc}
                    onChange={(e) => setServerDesc(e.target.value)}
                    placeholder="Tell your squad what this headquarters is for..."
                    className="w-full px-3 py-2 rounded-xl border border-white/[0.08] bg-surface-panel text-foreground text-xs focus:outline-none focus:border-primary/50 resize-none font-normal"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1.5">
                    Server Invite ID
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={server.id}
                      className="flex-1 px-3 py-2 rounded-xl border border-white/[0.08] bg-surface-panel/50 text-muted-foreground text-xs font-mono select-all"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(server.id);
                        toast({ title: 'ID Copied', description: 'Server ID copied to clipboard.', type: 'success' });
                      }}
                      className="text-xs"
                    >
                      Copy
                    </Button>
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    onClick={handleSaveOverview}
                    disabled={savingOverview}
                    className="bg-primary hover:bg-primary-hover text-primary-foreground font-semibold text-xs gap-2 shadow-subtle px-5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{savingOverview ? 'Saving...' : 'Save Changes'}</span>
                  </Button>
                </div>
              </div>
            )}

            {/* 2. CHANNELS TAB */}
            {activeTab === 'channels' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Organize your text chatter and voice lounges.
                  </span>
                  <Button
                    size="sm"
                    onClick={() => setShowAddChannel(true)}
                    className="bg-primary hover:bg-primary-hover text-primary-foreground font-semibold text-xs gap-1.5 h-8 shadow-subtle"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Channel</span>
                  </Button>
                </div>

                {/* Inline Add Channel Box */}
                {showAddChannel && (
                  <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground">New Channel</span>
                      <button onClick={() => setShowAddChannel(false)} className="text-muted-foreground hover:text-foreground">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setNewChanType('text')}
                        className={cn(
                          'flex-1 p-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors',
                          newChanType === 'text' ? 'border-primary bg-primary/10 text-primary' : 'border-white/[0.08] text-muted-foreground'
                        )}
                      >
                        <Hash className="w-3.5 h-3.5" /> Text
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewChanType('voice')}
                        className={cn(
                          'flex-1 p-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors',
                          newChanType === 'voice' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-white/[0.08] text-muted-foreground'
                        )}
                      >
                        <Volume2 className="w-3.5 h-3.5" /> Voice
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newChanName}
                        onChange={(e) => setNewChanName(e.target.value)}
                        placeholder={newChanType === 'text' ? 'channel-name' : 'Voice Lounge Name'}
                        className="flex-1 px-3 py-2 rounded-lg border border-white/[0.08] bg-surface-panel text-xs text-foreground focus:outline-none focus:border-primary/50"
                      />
                      <Button size="sm" onClick={handleCreateChannelSubmit} disabled={!newChanName.trim()} className="text-xs">
                        Create
                      </Button>
                    </div>
                  </div>
                )}

                {/* Channels List */}
                <div className="space-y-1.5">
                  {server.channels.map((chan) => {
                    const isEditing = editingChannelId === chan.id;

                    return (
                      <div
                        key={chan.id}
                        className="flex items-center justify-between p-3 rounded-xl border border-white/[0.06] bg-surface-panel/40 hover:bg-surface-panel transition-colors"
                      >
                        {isEditing ? (
                          <div className="flex-1 flex items-center gap-2 pr-3">
                            <input
                              type="text"
                              value={editChannelName}
                              onChange={(e) => setEditChannelName(e.target.value)}
                              className="px-2.5 py-1 rounded-lg border border-white/[0.1] bg-surface-panel text-xs text-foreground font-semibold"
                            />
                            <input
                              type="text"
                              value={editChannelTopic}
                              onChange={(e) => setEditChannelTopic(e.target.value)}
                              placeholder="Channel topic (optional)"
                              className="flex-1 px-2.5 py-1 rounded-lg border border-white/[0.1] bg-surface-panel text-xs text-muted-foreground"
                            />
                            <Button size="sm" onClick={() => handleSaveChannelEdit(chan.id)} className="h-7 text-xs px-2.5">
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingChannelId(null)} className="h-7 text-xs px-2">
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            {chan.type === 'voice' ? (
                              <Volume2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            ) : (
                              <Hash className="w-4 h-4 text-primary shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <span className="text-xs font-semibold text-foreground truncate block">
                                {chan.name}
                              </span>
                              {chan.topic && (
                                <span className="text-[10px] text-muted-foreground truncate block">
                                  {chan.topic}
                                </span>
                              )}
                            </div>
                            <Badge variant="outline" className="text-[9px] uppercase font-mono px-1.5 py-0 border-white/[0.08] text-muted-foreground">
                              {chan.type}
                            </Badge>
                          </div>
                        )}

                        {!isEditing && (
                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            <button
                              onClick={() => {
                                setEditingChannelId(chan.id);
                                setEditChannelName(chan.name);
                                setEditChannelTopic(chan.topic || '');
                              }}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
                              title="Edit Channel"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {onDeleteChannel && server.channels.length > 1 && (
                              <button
                                onClick={async () => {
                                  if (confirm(`Delete channel #${chan.name}?`)) {
                                    await onDeleteChannel(server.id, chan.id);
                                    toast({ title: 'Channel Deleted', description: `#${chan.name} was removed.`, type: 'info' });
                                  }
                                }}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                title="Delete Channel"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. ROLES & PERMISSIONS TAB */}
            {activeTab === 'roles' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-foreground">Role Permissions & Custom Roles</h3>
                    <p className="text-[11px] text-muted-foreground">
                      Configure permissions for every role or create custom clan titles with specific privileges.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setShowCreateRole((prev) => !prev)}
                    className="bg-primary hover:bg-primary-hover text-primary-foreground font-semibold text-xs gap-1.5 h-8 shadow-subtle"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Custom Role</span>
                  </Button>
                </div>

                {/* Create Custom Role Box */}
                {showCreateRole && (
                  <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-4 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-primary" />
                        <span>Create New Custom Role</span>
                      </span>
                      <button onClick={() => setShowCreateRole(false)} className="text-muted-foreground hover:text-foreground">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-medium text-foreground block mb-1">
                          Role Name
                        </label>
                        <input
                          type="text"
                          value={newRoleName}
                          onChange={(e) => setNewRoleName(e.target.value)}
                          placeholder="e.g. VIP Squad, Scrim Captain"
                          className="w-full px-3 py-2 rounded-lg border border-white/[0.08] bg-surface-panel text-xs text-foreground focus:outline-none focus:border-primary/50"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-medium text-foreground block mb-1">
                          Role Color
                        </label>
                        <div className="flex items-center gap-1.5">
                          {PRESET_COLORS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setNewRoleColor(c)}
                              style={{ backgroundColor: c }}
                              className={cn(
                                'w-6 h-6 rounded-full transition-transform',
                                newRoleColor === c ? 'ring-2 ring-white scale-110' : 'opacity-70 hover:opacity-100'
                              )}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Permissions Selector for New Role */}
                    <div>
                      <label className="text-[11px] font-medium text-foreground block mb-1.5">
                        Role Permissions ({newRolePermissions.length} selected)
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 bg-surface-panel/40 rounded-xl border border-white/[0.06]">
                        {ALL_SERVER_PERMISSIONS.map((perm) => {
                          const isChecked = newRolePermissions.includes(perm.id);
                          return (
                            <div
                              key={perm.id}
                              onClick={() => {
                                setNewRolePermissions((prev) =>
                                  prev.includes(perm.id)
                                    ? prev.filter((p) => p !== perm.id)
                                    : [...prev, perm.id]
                                );
                              }}
                              className={cn(
                                'p-2 rounded-lg border text-xs cursor-pointer transition-colors flex items-start gap-2',
                                isChecked
                                  ? 'border-primary/50 bg-primary/10 text-foreground'
                                  : 'border-white/[0.04] bg-white/[0.01] text-muted-foreground hover:bg-white/[0.03]'
                              )}
                            >
                              <div className={cn(
                                'w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5',
                                isChecked ? 'bg-primary border-primary text-primary-foreground' : 'border-white/[0.2]'
                              )}>
                                {isChecked && <Check className="w-3 h-3" />}
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-xs leading-none">{perm.label}</div>
                                <div className="text-[10px] text-muted-foreground/70 leading-snug mt-0.5 truncate">{perm.description}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <Button size="sm" variant="ghost" onClick={() => setShowCreateRole(false)} className="text-xs">
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleCreateRoleSubmit} disabled={!newRoleName.trim() || savingRole} className="text-xs">
                        {savingRole ? 'Creating...' : 'Save Role'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Role Picker Pill Row */}
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {allAvailableRoles.map((r) => {
                    const isSelected = selectedRoleId === r.id;
                    return (
                      <button
                        key={r.id}
                        onClick={() => setSelectedRoleId(r.id)}
                        className={cn(
                          'px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-colors shrink-0',
                          isSelected
                            ? 'bg-white/[0.08] text-foreground border-primary/50 shadow-subtle'
                            : 'bg-surface-panel/40 border-white/[0.06] text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                        <span>{r.name}</span>
                        {r.is_custom && (
                          <Badge variant="subtle" className="text-[9px] px-1 py-0">Custom</Badge>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Active Role's Permissions Checklist */}
                {selectedRoleId && (
                  <div className="p-4 rounded-xl border border-white/[0.06] bg-surface-panel/30 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-primary" />
                        <span className="text-xs font-bold text-foreground">
                          Permissions for: <span className="capitalize">{allAvailableRoles.find((r) => r.id === selectedRoleId)?.name || selectedRoleId}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Custom role delete */}
                        {allAvailableRoles.find((r) => r.id === selectedRoleId)?.is_custom && onDeleteRole && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={async () => {
                              if (confirm(`Delete custom role?`)) {
                                await onDeleteRole(server.id, selectedRoleId);
                                setSelectedRoleId('admin');
                                toast({ title: 'Role Deleted', description: 'Custom role removed.', type: 'info' });
                              }
                            }}
                            className="h-7 text-xs px-2.5"
                          >
                            Delete Role
                          </Button>
                        )}

                        <Button
                          size="sm"
                          onClick={() => handleSaveRolePermissions(selectedRoleId)}
                          className="h-7 text-xs px-3 bg-primary hover:bg-primary-hover text-primary-foreground font-semibold"
                        >
                          <Save className="w-3 h-3 mr-1" /> Save Permissions
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                      {ALL_SERVER_PERMISSIONS.map((perm) => {
                        const activePerms = getRolePermissions(selectedRoleId);
                        const isGranted = activePerms.includes(perm.id);

                        return (
                          <div
                            key={perm.id}
                            onClick={() => togglePermissionForRole(selectedRoleId, perm.id)}
                            className={cn(
                              'p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-start gap-2.5',
                              isGranted
                                ? 'border-primary/40 bg-primary/10 text-foreground'
                                : 'border-white/[0.04] bg-surface-panel/20 text-muted-foreground/70 hover:text-muted-foreground'
                            )}
                          >
                            <div className={cn(
                              'w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5',
                              isGranted ? 'bg-primary border-primary text-primary-foreground' : 'border-white/[0.2]'
                            )}>
                              {isGranted && <Check className="w-3 h-3" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-xs flex items-center justify-between">
                                <span>{perm.label}</span>
                                <span className="text-[9px] font-mono opacity-50 uppercase">{perm.category}</span>
                              </div>
                              <div className="text-[10px] text-muted-foreground leading-snug mt-0.5">
                                {perm.description}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 4. MEMBERS TAB */}
            {activeTab === 'members' && (
              <div className="space-y-4">
                <div className="text-xs text-muted-foreground">
                  View server squad members, grant roles, and manage permissions.
                </div>

                <div className="space-y-2">
                  {/* Owner Row */}
                  <div className="flex items-center justify-between p-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
                    <div className="flex items-center gap-3">
                      <Avatar name="Owner" size="sm" />
                      <div>
                        <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <span>Server Creator</span>
                          <span className="text-[9px] text-muted-foreground font-mono">
                            {isOwner ? '(You)' : ''}
                          </span>
                        </div>
                        <div className="text-[10px] text-amber-400 font-mono">All Permissions Granted</div>
                      </div>
                    </div>
                    <Badge variant="default" className="text-[10px] bg-amber-500/20 text-amber-300 border-amber-500/30 gap-1">
                      <Crown className="w-3 h-3" /> Owner
                    </Badge>
                  </div>

                  {/* Other Members */}
                  {server.members.map((mem) => {
                    return (
                      <div
                        key={mem.id}
                        className="flex items-center justify-between p-3 rounded-xl border border-white/[0.06] bg-surface-panel/40"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <Avatar
                            src={mem.profile?.avatar_url || null}
                            name={mem.profile?.display_name || 'Member'}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-foreground truncate">
                              {mem.profile?.display_name || 'Squad Member'}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono truncate">
                              @{mem.profile?.username || 'member'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {/* Role Selector Dropdown */}
                          {onUpdateMemberRole && (
                            <select
                              value={mem.role}
                              onChange={async (e) => {
                                const newRole = e.target.value as ServerRole;
                                await onUpdateMemberRole(server.id, mem.user_id, newRole);
                                toast({
                                  title: 'Role Updated',
                                  description: `Assigned ${newRole} to ${mem.profile?.display_name || 'member'}.`,
                                  type: 'success',
                                });
                              }}
                              className="px-2.5 py-1 rounded-lg border border-white/[0.1] bg-surface-panel text-xs text-foreground font-medium focus:outline-none focus:border-primary/50"
                            >
                              <option value="admin">Admin</option>
                              <option value="moderator">Moderator</option>
                              <option value="member">Member</option>
                              {(server.roles || []).map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name} (Custom)
                                </option>
                              ))}
                            </select>
                          )}

                          {/* Kick Button */}
                          {onKickMember && (
                            <button
                              onClick={async () => {
                                if (confirm(`Kick ${mem.profile?.display_name || 'member'} from the server?`)) {
                                  await onKickMember(server.id, mem.user_id);
                                  toast({
                                    title: 'Member Removed',
                                    description: `${mem.profile?.display_name || 'Member'} was removed.`,
                                    type: 'info',
                                  });
                                }
                              }}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                              title="Kick from Server"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 5. DANGER ZONE TAB */}
            {activeTab === 'danger' && (
              <div className="space-y-4 max-w-lg">
                {isOwner && onDeleteServer && (
                  <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/5 space-y-3">
                    <div className="flex items-center gap-2 text-rose-400 font-bold text-xs">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Delete This Server</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Permanently remove this server, all text channels, message logs, and voice rooms. This action cannot be undone.
                    </p>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={async () => {
                        if (confirm(`Are you absolutely sure you want to delete ${server.name}?`)) {
                          await onDeleteServer(server.id);
                          onOpenChange(false);
                          toast({ title: 'Server Deleted', description: `${server.name} was removed.`, type: 'info' });
                        }
                      }}
                      className="text-xs font-semibold"
                    >
                      Delete Server
                    </Button>
                  </div>
                )}

                {onLeaveServer && !isOwner && (
                  <div className="p-4 rounded-xl border border-white/[0.08] bg-surface-panel/40 space-y-3">
                    <div className="flex items-center gap-2 text-foreground font-bold text-xs">
                      <LogOut className="w-4 h-4 text-muted-foreground" />
                      <span>Leave Server</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Remove yourself from this server. You can only rejoin if you have an invite link or server ID.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        if (confirm(`Leave ${server.name}?`)) {
                          await onLeaveServer(server.id);
                          onOpenChange(false);
                          toast({ title: 'Left Server', description: `You left ${server.name}.`, type: 'info' });
                        }
                      }}
                      className="text-xs font-semibold text-rose-400 border-rose-500/30 hover:bg-rose-500/10"
                    >
                      Leave Server
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
